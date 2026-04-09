// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {ProductEscrowConfidential_Initializer} from "./ProductEscrowConfidential_Initializer.sol";

error InvalidImplementationAddress();
error FactoryIsPaused();
error ZeroUnitPrice();
error ZeroUnitPriceHash();
error InvalidSellerAddress();

contract ProductFactoryConfidential is Ownable {
    using Clones for address;

    event ProductCreatedConfidential(
        address indexed product,
        address indexed seller,
        uint256 indexed productId,
        address paymentToken,
        uint64 unitPrice,
        bytes32 unitPriceHash
    );
    event ImplementationUpdated(address indexed oldImpl, address indexed newImpl);
    event FactoryPaused(address indexed by);
    event FactoryUnpaused(address indexed by);

    address public implementation;
    uint256 public productCount;
    bool public isPaused;
    address[] public products;

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
        return _createProductConfidential(name, unitPrice, unitPriceHash, paymentToken, msg.sender);
    }

    function createProductConfidentialV1ForSeller(
        string memory name,
        uint64 unitPrice,
        bytes32 unitPriceHash,
        IERC7984 paymentToken,
        address seller
    ) external whenNotPaused returns (address product) {
        return _createProductConfidential(name, unitPrice, unitPriceHash, paymentToken, seller);
    }

    function _createProductConfidential(
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

        emit ProductCreatedConfidential(
            product,
            seller,
            productCount,
            address(paymentToken),
            unitPrice,
            unitPriceHash
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
