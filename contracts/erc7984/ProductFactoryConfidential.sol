// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {ProductEscrowConfidential_Initializer} from "./ProductEscrowConfidential_Initializer.sol";
import {ProductEscrowConfidential_PrivatePrice} from "./ProductEscrowConfidential_PrivatePrice.sol";

error InvalidImplementationAddress();
error InvalidPrivateImplementationAddress();
error PrivateImplementationNotConfigured();
error FactoryIsPaused();
error ZeroUnitPrice();
error ZeroUnitPriceHash();
error ZeroPriceCommitment();
error InvalidSellerAddress();

contract ProductFactoryConfidential is Ownable {
    using Clones for address;

    enum PriceVisibility {
        Public,
        Private
    }

    event ProductCreatedConfidential(
        address indexed product,
        address indexed seller,
        uint256 indexed productId,
        address paymentToken,
        uint64 unitPrice,
        bytes32 unitPriceHash
    );
    event ProductCreatedConfidentialPrivatePrice(
        address indexed product,
        address indexed seller,
        uint256 indexed productId,
        address paymentToken,
        bytes32 priceCommitment
    );
    event ProductCreatedConfidentialProfile(
        address indexed product,
        address indexed seller,
        uint256 indexed productId,
        address paymentToken,
        uint8 priceVisibility,
        uint64 unitPrice,
        bytes32 unitPriceHash,
        bytes32 priceCommitment
    );
    event ImplementationUpdated(address indexed oldImpl, address indexed newImpl);
    event PrivateImplementationUpdated(address indexed oldImpl, address indexed newImpl);
    event FactoryPaused(address indexed by);
    event FactoryUnpaused(address indexed by);

    address public implementation;
    address public privateImplementation;
    uint256 public productCount;
    bool public isPaused;
    address[] public products;
    mapping(address => PriceVisibility) public productPriceVisibility;

    constructor(address _impl) Ownable(msg.sender) {
        if (_impl == address(0)) revert InvalidImplementationAddress();
        implementation = _impl;
        emit ImplementationUpdated(address(0), _impl);
    }

    modifier whenNotPaused() {
        if (isPaused) revert FactoryIsPaused();
        _;
    }

    function setImplementation(address _impl) external onlyOwner {
        if (_impl == address(0)) revert InvalidImplementationAddress();
        address oldImpl = implementation;
        implementation = _impl;
        emit ImplementationUpdated(oldImpl, _impl);
    }

    function setPrivateImplementation(address _impl) external onlyOwner {
        if (_impl == address(0)) revert InvalidPrivateImplementationAddress();
        address oldImpl = privateImplementation;
        privateImplementation = _impl;
        emit PrivateImplementationUpdated(oldImpl, _impl);
    }

    function pause() external onlyOwner {
        isPaused = true;
        emit FactoryPaused(msg.sender);
    }

    function unpause() external onlyOwner {
        isPaused = false;
        emit FactoryUnpaused(msg.sender);
    }

    function createProductConfidentialV1(
        string memory name,
        uint64 unitPrice,
        bytes32 unitPriceHash,
        IERC7984 paymentToken
    ) external whenNotPaused returns (address product) {
        return createProductConfidentialPublicPrice(name, unitPrice, unitPriceHash, paymentToken);
    }

    function createProductConfidentialV1ForSeller(
        string memory name,
        uint64 unitPrice,
        bytes32 unitPriceHash,
        IERC7984 paymentToken,
        address seller
    ) external whenNotPaused returns (address product) {
        return _createProductConfidentialPublicPrice(name, unitPrice, unitPriceHash, paymentToken, seller);
    }

    function createProductConfidentialPublicPrice(
        string memory name,
        uint64 unitPrice,
        bytes32 unitPriceHash,
        IERC7984 paymentToken
    ) public whenNotPaused returns (address product) {
        return _createProductConfidentialPublicPrice(name, unitPrice, unitPriceHash, paymentToken, msg.sender);
    }

    function createProductConfidentialPrivatePrice(
        string memory name,
        bytes32 priceCommitment,
        IERC7984 paymentToken
    ) external whenNotPaused returns (address product) {
        return _createProductConfidentialPrivatePrice(name, priceCommitment, paymentToken, msg.sender);
    }

    function createProductConfidentialPrivatePriceForSeller(
        string memory name,
        bytes32 priceCommitment,
        IERC7984 paymentToken,
        address seller
    ) external whenNotPaused returns (address product) {
        return _createProductConfidentialPrivatePrice(name, priceCommitment, paymentToken, seller);
    }

    function _createProductConfidentialPublicPrice(
        string memory name,
        uint64 unitPrice,
        bytes32 unitPriceHash,
        IERC7984 paymentToken,
        address seller
    ) internal returns (address product) {
        if (unitPrice == 0) revert ZeroUnitPrice();
        if (unitPriceHash == bytes32(0)) revert ZeroUnitPriceHash();
        if (seller == address(0)) revert InvalidSellerAddress();

        product = implementation.clone();
        unchecked {
            productCount++;
        }

        ProductEscrowConfidential_Initializer(payable(product)).initializeConfidential(
            productCount,
            name,
            unitPrice,
            unitPriceHash,
            seller,
            paymentToken,
            address(this)
        );

        products.push(product);
        productPriceVisibility[product] = PriceVisibility.Public;

        emit ProductCreatedConfidential(
            product,
            seller,
            productCount,
            address(paymentToken),
            unitPrice,
            unitPriceHash
        );
        emit ProductCreatedConfidentialProfile(
            product,
            seller,
            productCount,
            address(paymentToken),
            uint8(PriceVisibility.Public),
            unitPrice,
            unitPriceHash,
            unitPriceHash
        );
    }

    function _createProductConfidentialPrivatePrice(
        string memory name,
        bytes32 priceCommitment,
        IERC7984 paymentToken,
        address seller
    ) internal returns (address product) {
        if (privateImplementation == address(0)) revert PrivateImplementationNotConfigured();
        if (priceCommitment == bytes32(0)) revert ZeroPriceCommitment();
        if (seller == address(0)) revert InvalidSellerAddress();

        product = privateImplementation.clone();
        unchecked {
            productCount++;
        }

        ProductEscrowConfidential_PrivatePrice(payable(product)).initializeConfidentialPrivatePrice(
            productCount,
            name,
            priceCommitment,
            seller,
            paymentToken,
            address(this)
        );

        products.push(product);
        productPriceVisibility[product] = PriceVisibility.Private;

        emit ProductCreatedConfidential(product, seller, productCount, address(paymentToken), 0, bytes32(0));
        emit ProductCreatedConfidentialPrivatePrice(product, seller, productCount, address(paymentToken), priceCommitment);
        emit ProductCreatedConfidentialProfile(
            product,
            seller,
            productCount,
            address(paymentToken),
            uint8(PriceVisibility.Private),
            0,
            bytes32(0),
            priceCommitment
        );
    }

    function getProducts() external view returns (address[] memory) {
        return products;
    }

    receive() external payable {
        revert("Factory does not accept ETH");
    }

    fallback() external payable {
        revert("Factory does not accept ETH");
    }
}
