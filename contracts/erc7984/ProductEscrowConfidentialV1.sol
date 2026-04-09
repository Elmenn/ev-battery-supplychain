// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IERC7984Receiver} from "@openzeppelin/confidential-contracts/interfaces/IERC7984Receiver.sol";

/// @notice First product-style confidential escrow inspired by the original payable ProductEscrow contract.
/// @dev V1 keeps the workflow public while moving custody and settlement to confidential ERC-7984 balances.
contract ProductEscrowConfidentialV1 is ZamaEthereumConfig, IERC7984Receiver, Ownable, ReentrancyGuard {
    enum EscrowPhase {
        Listed,
        BuyerPaid,
        SellerConfirmed,
        TransporterBound,
        Delivered,
        Cancelled
    }

    enum DepositKind {
        BuyerPurchase,
        SellerDeliveryFee,
        TransporterSecurityDeposit
    }

    struct TransporterQuote {
        uint64 quotedFee;
        bool exists;
    }

    error UnsupportedToken(address token);
    error InvalidBuyer(address buyer);
    error InvalidSeller(address seller);
    error InvalidTransporter(address transporter);
    error WrongPhase(EscrowPhase expected, EscrowPhase actual);
    error UnknownTransporter(address transporter);
    error TransporterAlreadyRegistered(address transporter);
    error UnauthorizedDeposit(address expected, address actual);
    error BuyerAlreadySet(address existingBuyer);
    error DeliveryWindowExpired(uint64 deliveryDeadline);
    error DeliveryWindowNotStarted();
    error TransporterNotBound();
    error NoBuyerDeposit();
    error MissingTransporterFunding();
    error DepositAlreadyPresent(bytes32 kindHash);

    event BuyerDepositRecorded(address indexed buyer);
    event SellerDeliveryFeeRecorded(address indexed seller);
    event TransporterSecurityDepositRecorded(address indexed transporter);
    event OrderConfirmed(string vcCID);
    event TransporterCreated(address indexed transporter, uint64 quotedFee);
    event TransporterAssigned(address indexed transporter);
    event DeliveryConfirmed(string vcCID);

    uint256 public immutable productId;
    string public name;
    IERC7984 public immutable paymentToken;
    address public seller;
    address public buyer;
    address public transporter;
    uint64 public immutable deliveryWindowSeconds;
    uint64 public purchaseTimestamp;
    uint64 public deliveryDeadline;
    bool public purchased;
    EscrowPhase public phase;

    euint64 private _buyerDeposit;
    euint64 private _sellerDeliveryFeeDeposit;
    euint64 private _transporterSecurityDeposit;
    bool private _hasBuyerDeposit;
    bool private _hasSellerDeliveryFeeDeposit;
    bool private _hasTransporterSecurityDeposit;

    mapping(address => TransporterQuote) public transporters;
    address[] private _transporterAddresses;

    constructor(
        uint256 productId_,
        string memory name_,
        address owner_,
        IERC7984 paymentToken_,
        uint64 deliveryWindowSeconds_
    ) Ownable(owner_) {
        productId = productId_;
        name = name_;
        seller = owner_;
        paymentToken = paymentToken_;
        deliveryWindowSeconds = deliveryWindowSeconds_;
        phase = EscrowPhase.Listed;
    }

    function getTransporters() external view returns (address[] memory addresses, uint64[] memory quotedFees) {
        addresses = _transporterAddresses;
        quotedFees = new uint64[](addresses.length);
        for (uint256 i = 0; i < addresses.length; ++i) {
            quotedFees[i] = transporters[addresses[i]].quotedFee;
        }
    }

    function hasBuyerDeposit() external view returns (bool) {
        return _hasBuyerDeposit;
    }

    function hasSellerDeliveryFeeDeposit() external view returns (bool) {
        return _hasSellerDeliveryFeeDeposit;
    }

    function hasTransporterSecurityDeposit() external view returns (bool) {
        return _hasTransporterSecurityDeposit;
    }

    function createTransporter(uint64 quotedFee) external {
        if (quotedFee == 0) {
            revert InvalidTransporter(msg.sender);
        }
        if (transporters[msg.sender].exists) {
            revert TransporterAlreadyRegistered(msg.sender);
        }

        transporters[msg.sender] = TransporterQuote({quotedFee: quotedFee, exists: true});
        _transporterAddresses.push(msg.sender);

        emit TransporterCreated(msg.sender, quotedFee);
    }

    function setTransporter(address transporter_) external onlyOwner {
        if (phase != EscrowPhase.SellerConfirmed && phase != EscrowPhase.TransporterBound) {
            revert WrongPhase(EscrowPhase.SellerConfirmed, phase);
        }
        if (!transporters[transporter_].exists) {
            revert UnknownTransporter(transporter_);
        }

        transporter = transporter_;
        _updateTransporterBoundPhase();

        emit TransporterAssigned(transporter_);
    }

    function confirmOrder(string calldata vcCID) external onlyOwner {
        if (phase != EscrowPhase.BuyerPaid) {
            revert WrongPhase(EscrowPhase.BuyerPaid, phase);
        }

        purchaseTimestamp = uint64(block.timestamp);
        deliveryDeadline = uint64(block.timestamp) + deliveryWindowSeconds;
        phase = EscrowPhase.SellerConfirmed;

        emit OrderConfirmed(vcCID);
    }

    function confirmDelivery(string calldata vcCID) external nonReentrant {
        if (msg.sender != buyer) {
            revert InvalidBuyer(msg.sender);
        }
        if (phase != EscrowPhase.TransporterBound) {
            revert WrongPhase(EscrowPhase.TransporterBound, phase);
        }
        if (deliveryDeadline == 0) {
            revert DeliveryWindowNotStarted();
        }
        if (block.timestamp > deliveryDeadline) {
            revert DeliveryWindowExpired(deliveryDeadline);
        }
        if (!_hasBuyerDeposit) {
            revert NoBuyerDeposit();
        }
        if (!_hasSellerDeliveryFeeDeposit || !_hasTransporterSecurityDeposit) {
            revert MissingTransporterFunding();
        }

        euint64 transporterPayout = FHE.add(_sellerDeliveryFeeDeposit, _transporterSecurityDeposit);
        FHE.allowThis(transporterPayout);
        FHE.allowTransient(_buyerDeposit, address(paymentToken));
        FHE.allowTransient(transporterPayout, address(paymentToken));

        paymentToken.confidentialTransfer(seller, _buyerDeposit);
        paymentToken.confidentialTransfer(transporter, transporterPayout);

        phase = EscrowPhase.Delivered;

        emit DeliveryConfirmed(vcCID);
    }

    function onConfidentialTransferReceived(
        address operator,
        address from,
        euint64 amount,
        bytes calldata data
    ) external override nonReentrant returns (ebool accepted) {
        operator;

        if (msg.sender != address(paymentToken)) {
            revert UnsupportedToken(msg.sender);
        }

        DepositKind kind = abi.decode(data, (DepositKind));

        if (kind == DepositKind.BuyerPurchase) {
            _recordBuyerDeposit(from, amount);
        } else if (kind == DepositKind.SellerDeliveryFee) {
            _recordSellerDeliveryFeeDeposit(from, amount);
        } else {
            _recordTransporterSecurityDeposit(from, amount);
        }

        accepted = FHE.asEbool(true);
        FHE.allowThis(accepted);
        FHE.allow(accepted, msg.sender);
    }

    function _recordBuyerDeposit(address from, euint64 amount) internal {
        if (phase != EscrowPhase.Listed) {
            revert WrongPhase(EscrowPhase.Listed, phase);
        }
        if (from == seller || from == address(0)) {
            revert InvalidBuyer(from);
        }
        if (buyer != address(0)) {
            revert BuyerAlreadySet(buyer);
        }
        if (_hasBuyerDeposit) {
            revert DepositAlreadyPresent(keccak256("buyer"));
        }

        buyer = from;
        purchased = true;
        _buyerDeposit = amount;
        _hasBuyerDeposit = true;
        phase = EscrowPhase.BuyerPaid;

        emit BuyerDepositRecorded(from);
    }

    function _recordSellerDeliveryFeeDeposit(address from, euint64 amount) internal {
        if (from != seller) {
            revert UnauthorizedDeposit(seller, from);
        }
        if (phase != EscrowPhase.SellerConfirmed && phase != EscrowPhase.TransporterBound) {
            revert WrongPhase(EscrowPhase.SellerConfirmed, phase);
        }
        if (_hasSellerDeliveryFeeDeposit) {
            revert DepositAlreadyPresent(keccak256("seller-delivery-fee"));
        }

        _sellerDeliveryFeeDeposit = amount;
        _hasSellerDeliveryFeeDeposit = true;
        _updateTransporterBoundPhase();

        emit SellerDeliveryFeeRecorded(from);
    }

    function _recordTransporterSecurityDeposit(address from, euint64 amount) internal {
        if (transporter == address(0)) {
            revert TransporterNotBound();
        }
        if (from != transporter) {
            revert UnauthorizedDeposit(transporter, from);
        }
        if (phase != EscrowPhase.SellerConfirmed && phase != EscrowPhase.TransporterBound) {
            revert WrongPhase(EscrowPhase.SellerConfirmed, phase);
        }
        if (_hasTransporterSecurityDeposit) {
            revert DepositAlreadyPresent(keccak256("transporter-security-deposit"));
        }

        _transporterSecurityDeposit = amount;
        _hasTransporterSecurityDeposit = true;
        _updateTransporterBoundPhase();

        emit TransporterSecurityDepositRecorded(from);
    }

    function _updateTransporterBoundPhase() internal {
        if (transporter != address(0) && _hasSellerDeliveryFeeDeposit && _hasTransporterSecurityDeposit) {
            phase = EscrowPhase.TransporterBound;
        }
    }
}
