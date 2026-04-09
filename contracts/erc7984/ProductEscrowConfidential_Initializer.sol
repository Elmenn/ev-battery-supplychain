// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaConfig, ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IERC7984Receiver} from "@openzeppelin/confidential-contracts/interfaces/IERC7984Receiver.sol";

error NotBuyer();
error NotSeller();
error NotTransporter();
error NotFactory();
error InvalidPhase();
error AlreadyInitialized();
error InvalidOwnerAddress();
error EmptyName();
error ZeroUnitPrice();
error ZeroUnitPriceHash();
error InvalidProductId();
error AlreadyPurchased();
error WrongOrderId();
error WrongVcHash();
error TransporterNotSet();
error AlreadyDelivered();
error InvalidQuotedFee();
error AlreadyRegistered();
error UnknownTransporter();
error UnsupportedToken(address token);
error UnauthorizedDeposit(address expected, address actual);
error MissingPurchaseFunding();
error MissingSellerBondFunding();
error MissingSellerBondEqualityAttestation();
error SellerBondEqualityAttestationFailed();
error MissingTransporterBondEqualityAttestation();
error TransporterBondEqualityAttestationFailed();
error MissingDeliveryFunding();
error DeliveryWindowExpired();
error ZeroOrderId();
error SellerWindowNotExpired();
error BiddingWindowNotExpired();
error DeliveryWindowNotExpired();
error NotRegistered();
error AlreadySelected();
error EqualityAttestationNotPending();
error UnsupportedEqualityTarget();
error InvalidEqualityAttestationPayload();

contract ProductEscrowConfidential_Initializer is ZamaEthereumConfig, IERC7984Receiver, ReentrancyGuard {
    enum Phase {
        Listed,
        Purchased,
        OrderConfirmed,
        Bound,
        Delivered,
        Expired
    }

    enum DepositKind {
        BuyerPurchase,
        SellerBond,
        SellerDeliveryFee,
        TransporterSecurityDeposit
    }

    enum EqualityTarget {
        SellerBondMatchesBuyerDeposit,
        TransporterBondMatchesBuyerDeposit
    }

    enum EqualityStatus {
        None,
        Pending,
        VerifiedTrue,
        VerifiedFalse
    }

    struct OrderRecord {
        address buyer;
        bytes32 vcHash;
        uint64 purchaseTimestamp;
        uint64 orderConfirmedTimestamp;
        uint8 phase;
        bool exists;
    }

    struct EqualityAttestation {
        EqualityStatus status;
        bytes32 handle;
        uint64 requestedAt;
        uint64 verifiedAt;
    }

    uint32 public constant DELIVERY_WINDOW = 2 days;
    uint32 public constant SELLER_WINDOW = 2 days;
    uint32 public constant BID_WINDOW = 2 days;
    uint8 public constant MAX_BIDS = 20;

    uint256 public id;
    string public name;
    uint64 public unitPrice;
    bytes32 public unitPriceHash;
    bytes32 public activeOrderId;

    address payable public owner;
    address payable public buyer;
    address payable public transporter;
    address public factory;
    IERC7984 public paymentToken;

    Phase public phase;
    uint64 public purchaseTimestamp;
    uint64 public orderConfirmedTimestamp;
    uint64 public boundTimestamp;
    bool public purchased;
    bool public delivered;
    uint32 public transporterCount;

    bool private _initialized;
    bool private stopped;
    bool private _hasBuyerDeposit;
    bool private _hasSellerBondDeposit;
    bool private _hasSellerDeliveryFeeDeposit;
    bool private _hasTransporterSecurityDeposit;
    euint64 private _buyerDeposit;
    euint64 private _sellerBondDeposit;
    euint64 private _sellerDeliveryFeeDeposit;
    euint64 private _transporterSecurityDeposit;
    bytes32 private _vcHash;
    EqualityAttestation private _sellerBondEqualityAttestation;
    EqualityAttestation private _transporterBondEqualityAttestation;

    mapping(address => uint256) public transporters;
    mapping(address => bool) public isTransporter;
    address[] public transporterAddresses;
    mapping(bytes32 => bool) public usedOrderIds;
    mapping(bytes32 => OrderRecord) private orders;

    event ProductInitialized(
        uint256 indexed productId,
        address indexed seller,
        address indexed paymentToken,
        uint64 unitPrice,
        bytes32 unitPriceHash
    );
    event ConfidentialOrderPaid(bytes32 indexed orderId, address indexed buyer, uint256 indexed productId);
    event OrderConfirmedById(bytes32 indexed orderId, uint256 indexed productId, bytes32 vcHash, string vcCID);
    event TransporterCreated(address indexed transporter, uint256 indexed productId, uint256 quotedFee);
    event TransporterSelected(uint256 indexed productId, address indexed transporter);
    event SellerBondFunded(bytes32 indexed orderId, address indexed seller);
    event EqualityAttestationRequested(bytes32 indexed orderId, EqualityTarget indexed target, bytes32 indexed handle);
    event EqualityAttestationVerified(bytes32 indexed orderId, EqualityTarget indexed target, bool result);
    event DeliveryFeeFunded(bytes32 indexed orderId, address indexed seller);
    event TransporterSecurityFunded(bytes32 indexed orderId, address indexed transporter);
    event DeliveryConfirmed(bytes32 indexed orderId, uint256 indexed productId, address indexed transporter, bytes32 vcHash);
    event PhaseChanged(uint256 indexed productId, Phase indexed from, Phase indexed to, address actor);
    event BidWithdrawn(address indexed transporter, uint256 indexed productId);

    modifier onlyBuyer() {
        if (msg.sender != buyer) revert NotBuyer();
        _;
    }

    modifier onlySeller() {
        if (msg.sender != owner) revert NotSeller();
        _;
    }

    modifier onlyTransporter() {
        if (msg.sender != transporter) revert NotTransporter();
        _;
    }

    modifier whenNotStopped() {
        require(!stopped, "stopped");
        _;
    }

    function initializeConfidential(
        uint256 _id,
        string memory _name,
        uint64 _unitPrice,
        bytes32 _unitPriceHash,
        address _owner,
        IERC7984 _paymentToken,
        address _factory
    ) external {
        if (_initialized) revert AlreadyInitialized();
        if (_owner == address(0)) revert InvalidOwnerAddress();
        if (bytes(_name).length == 0) revert EmptyName();
        if (_unitPrice == 0) revert ZeroUnitPrice();
        if (_unitPriceHash == bytes32(0)) revert ZeroUnitPriceHash();
        if (_id == 0) revert InvalidProductId();
        if (msg.sender != _factory) revert NotFactory();

        FHE.setCoprocessor(ZamaConfig.getEthereumCoprocessorConfig());

        _initialized = true;
        id = _id;
        name = _name;
        unitPrice = _unitPrice;
        unitPriceHash = _unitPriceHash;
        owner = payable(_owner);
        paymentToken = _paymentToken;
        factory = _factory;
        phase = Phase.Listed;

        emit ProductInitialized(_id, _owner, address(_paymentToken), _unitPrice, _unitPriceHash);
    }

    function createTransporter(uint256 quotedFee) external nonReentrant whenNotStopped {
        if (phase != Phase.OrderConfirmed) revert InvalidPhase();
        if (quotedFee == 0) revert InvalidQuotedFee();
        if (transporterCount >= MAX_BIDS) revert InvalidPhase();
        if (isTransporter[msg.sender]) revert AlreadyRegistered();

        transporters[msg.sender] = quotedFee;
        isTransporter[msg.sender] = true;
        transporterAddresses.push(msg.sender);
        unchecked {
            transporterCount++;
        }

        emit TransporterCreated(msg.sender, id, quotedFee);
    }

    function setTransporter(address payable _transporter) external onlySeller nonReentrant whenNotStopped {
        if (phase != Phase.OrderConfirmed) revert InvalidPhase();
        if (!isTransporter[_transporter]) revert UnknownTransporter();

        transporter = _transporter;
        boundTimestamp = uint64(block.timestamp);

        Phase oldPhase = phase;
        phase = Phase.Bound;

        emit PhaseChanged(id, oldPhase, phase, msg.sender);
        emit TransporterSelected(id, _transporter);
    }

    function confirmOrderById(bytes32 orderId, string calldata vcCID) external onlySeller nonReentrant whenNotStopped {
        if (orderId == bytes32(0)) revert ZeroOrderId();
        if (activeOrderId != orderId || !orders[orderId].exists) revert WrongOrderId();
        if (phase != Phase.Purchased) revert InvalidPhase();
        if (!_hasBuyerDeposit) revert MissingPurchaseFunding();
        if (!_hasSellerBondDeposit) revert MissingSellerBondFunding();
        if (_sellerBondEqualityAttestation.status == EqualityStatus.VerifiedFalse) {
            revert SellerBondEqualityAttestationFailed();
        }
        if (_sellerBondEqualityAttestation.status != EqualityStatus.VerifiedTrue) {
            revert MissingSellerBondEqualityAttestation();
        }

        orderConfirmedTimestamp = uint64(block.timestamp);
        _vcHash = keccak256(bytes(vcCID));

        OrderRecord storage order = orders[orderId];
        order.vcHash = _vcHash;
        order.orderConfirmedTimestamp = orderConfirmedTimestamp;
        order.phase = uint8(Phase.OrderConfirmed);

        Phase oldPhase = phase;
        phase = Phase.OrderConfirmed;

        emit PhaseChanged(id, oldPhase, phase, msg.sender);
        emit OrderConfirmedById(orderId, id, _vcHash, vcCID);
    }

    function confirmDelivery(bytes32 orderId, bytes32 hash) external onlyTransporter nonReentrant whenNotStopped {
        if (phase != Phase.Bound) revert InvalidPhase();
        if (orderId == bytes32(0) || orderId != activeOrderId || !orders[orderId].exists) revert WrongOrderId();
        if (delivered) revert AlreadyDelivered();
        if (transporter == address(0)) revert TransporterNotSet();
        if (
            !_hasBuyerDeposit || !_hasSellerBondDeposit || !_hasSellerDeliveryFeeDeposit || !_hasTransporterSecurityDeposit
        ) {
            revert MissingDeliveryFunding();
        }
        if (_transporterBondEqualityAttestation.status == EqualityStatus.VerifiedFalse) {
            revert TransporterBondEqualityAttestationFailed();
        }
        if (_transporterBondEqualityAttestation.status != EqualityStatus.VerifiedTrue) {
            revert MissingTransporterBondEqualityAttestation();
        }
        if (hash != _vcHash) revert WrongVcHash();
        if (block.timestamp > boundTimestamp + DELIVERY_WINDOW) revert DeliveryWindowExpired();

        delivered = true;

        euint64 sellerPayout = FHE.add(_buyerDeposit, _sellerBondDeposit);
        euint64 transporterPayout = FHE.add(_sellerDeliveryFeeDeposit, _transporterSecurityDeposit);
        FHE.allowThis(sellerPayout);
        FHE.allowThis(transporterPayout);

        FHE.allowTransient(sellerPayout, address(paymentToken));
        FHE.allowTransient(transporterPayout, address(paymentToken));
        paymentToken.confidentialTransfer(owner, sellerPayout);
        paymentToken.confidentialTransfer(transporter, transporterPayout);
        _clearBuyerDeposit();
        _clearSellerBondDeposit();
        _clearSellerDeliveryFeeDeposit();
        _clearTransporterSecurityDeposit();

        Phase oldPhase = phase;
        phase = Phase.Delivered;
        orders[orderId].phase = uint8(Phase.Delivered);

        emit PhaseChanged(id, oldPhase, phase, msg.sender);
        emit DeliveryConfirmed(orderId, id, transporter, hash);
    }

    function sellerTimeout() external nonReentrant whenNotStopped {
        if (phase != Phase.Purchased) revert InvalidPhase();
        if (block.timestamp <= purchaseTimestamp + SELLER_WINDOW) revert SellerWindowNotExpired();

        if (_hasBuyerDeposit) {
            _transferConfidential(buyer, _buyerDeposit);
            _clearBuyerDeposit();
        }
        if (_hasSellerBondDeposit) {
            _transferConfidential(buyer, _sellerBondDeposit);
            _clearSellerBondDeposit();
        }

        _expireActiveOrder();
    }

    function bidTimeout() external nonReentrant whenNotStopped {
        if (phase != Phase.OrderConfirmed) revert InvalidPhase();
        if (block.timestamp <= orderConfirmedTimestamp + BID_WINDOW) revert BiddingWindowNotExpired();

        if (_hasBuyerDeposit) {
            _transferConfidential(buyer, _buyerDeposit);
            _clearBuyerDeposit();
        }
        if (_hasSellerBondDeposit) {
            _transferConfidential(owner, _sellerBondDeposit);
            _clearSellerBondDeposit();
        }

        _expireActiveOrder();
    }

    function deliveryTimeout() external nonReentrant whenNotStopped {
        if (phase != Phase.Bound) revert InvalidPhase();
        if (block.timestamp <= boundTimestamp + DELIVERY_WINDOW) revert DeliveryWindowNotExpired();

        if (_hasBuyerDeposit) {
            _transferConfidential(buyer, _buyerDeposit);
            _clearBuyerDeposit();
        }
        if (_hasSellerBondDeposit) {
            _transferConfidential(owner, _sellerBondDeposit);
            _clearSellerBondDeposit();
        }
        if (_hasSellerDeliveryFeeDeposit) {
            _transferConfidential(owner, _sellerDeliveryFeeDeposit);
            _clearSellerDeliveryFeeDeposit();
        }
        if (_hasTransporterSecurityDeposit) {
            _transferConfidential(owner, _transporterSecurityDeposit);
            _clearTransporterSecurityDeposit();
        }

        _expireActiveOrder();
    }

    function withdrawBid() external nonReentrant {
        if (phase != Phase.OrderConfirmed && phase != Phase.Expired) revert InvalidPhase();
        if (transporter == msg.sender) revert AlreadySelected();

        uint256 quotedFee = transporters[msg.sender];
        if (quotedFee == 0) revert NotRegistered();

        transporters[msg.sender] = 0;
        isTransporter[msg.sender] = false;
        if (transporterCount > 0) {
            unchecked {
                transporterCount--;
            }
        }

        emit BidWithdrawn(msg.sender, id);
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

        (bytes32 orderId, DepositKind kind) = abi.decode(data, (bytes32, DepositKind));
        if (orderId == bytes32(0)) revert ZeroOrderId();

        if (kind == DepositKind.BuyerPurchase) {
            _recordBuyerPurchase(orderId, from, amount);
        } else if (kind == DepositKind.SellerBond) {
            _recordSellerBond(orderId, from, amount);
        } else if (kind == DepositKind.SellerDeliveryFee) {
            _recordSellerDeliveryFee(orderId, from, amount);
        } else {
            _recordTransporterSecurityDeposit(orderId, from, amount);
        }

        accepted = FHE.asEbool(true);
        FHE.allowThis(accepted);
        FHE.allow(accepted, msg.sender);
    }

    function finalizeEqualityAttestation(
        bytes32 orderId,
        EqualityTarget target,
        bytes calldata abiEncodedCleartexts,
        bytes calldata decryptionProof
    ) external nonReentrant whenNotStopped {
        if (orderId == bytes32(0) || orderId != activeOrderId || !orders[orderId].exists) revert WrongOrderId();
        EqualityAttestation storage attestation = _getEqualityAttestation(target);
        if (attestation.status != EqualityStatus.Pending) revert EqualityAttestationNotPending();

        bytes32[] memory handlesList = new bytes32[](1);
        handlesList[0] = attestation.handle;
        FHE.checkSignatures(handlesList, abiEncodedCleartexts, decryptionProof);

        uint256 clearValue = abi.decode(abiEncodedCleartexts, (uint256));
        if (clearValue > 1) revert InvalidEqualityAttestationPayload();

        bool result = clearValue == 1;
        attestation.status = result ? EqualityStatus.VerifiedTrue : EqualityStatus.VerifiedFalse;
        attestation.verifiedAt = uint64(block.timestamp);

        emit EqualityAttestationVerified(orderId, target, result);
    }

    function getOrder(bytes32 orderId)
        external
        view
        returns (address orderBuyer, bytes32 vcHash, uint64 purchasedAt, uint64 confirmedAt, uint8 orderPhase, bool exists)
    {
        OrderRecord storage order = orders[orderId];
        return (
            order.buyer,
            order.vcHash,
            order.purchaseTimestamp,
            order.orderConfirmedTimestamp,
            order.phase,
            order.exists
        );
    }

    function getVcHash() external view returns (bytes32) {
        return _vcHash;
    }

    function getAllTransporters() external view returns (address[] memory, uint256[] memory) {
        uint256 len = transporterAddresses.length;
        address[] memory addrs = new address[](len);
        uint256[] memory fees = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            addrs[i] = transporterAddresses[i];
            fees[i] = transporters[transporterAddresses[i]];
        }
        return (addrs, fees);
    }

    function hasBuyerDeposit() external view returns (bool) {
        return _hasBuyerDeposit;
    }

    function hasSellerDeliveryFeeDeposit() external view returns (bool) {
        return _hasSellerDeliveryFeeDeposit;
    }

    function hasSellerBondDeposit() external view returns (bool) {
        return _hasSellerBondDeposit;
    }

    function getSellerBondEqualityAttestation()
        external
        view
        returns (uint8 status, bytes32 handle, uint64 requestedAt, uint64 verifiedAt)
    {
        EqualityAttestation memory attestation = _sellerBondEqualityAttestation;
        return (uint8(attestation.status), attestation.handle, attestation.requestedAt, attestation.verifiedAt);
    }

    function getTransporterBondEqualityAttestation()
        external
        view
        returns (uint8 status, bytes32 handle, uint64 requestedAt, uint64 verifiedAt)
    {
        EqualityAttestation memory attestation = _transporterBondEqualityAttestation;
        return (uint8(attestation.status), attestation.handle, attestation.requestedAt, attestation.verifiedAt);
    }

    function hasTransporterSecurityDeposit() external view returns (bool) {
        return _hasTransporterSecurityDeposit;
    }

    function isStopped() external view returns (bool) {
        return stopped;
    }

    function pauseByFactory() external {
        if (msg.sender != factory) revert NotFactory();
        stopped = true;
    }

    receive() external payable {
        revert("ProductEscrowConfidential does not accept unexpected ETH");
    }

    fallback() external payable {
        revert("ProductEscrowConfidential does not accept unexpected ETH");
    }

    function _recordBuyerPurchase(bytes32 orderId, address from, euint64 amount) internal {
        if (phase != Phase.Listed) revert InvalidPhase();
        if (from == owner || from == address(0)) revert NotBuyer();
        if (purchased) revert AlreadyPurchased();
        if (usedOrderIds[orderId]) revert WrongOrderId();

        buyer = payable(from);
        purchased = true;
        purchaseTimestamp = uint64(block.timestamp);
        activeOrderId = orderId;
        usedOrderIds[orderId] = true;
        _buyerDeposit = amount;
        _hasBuyerDeposit = true;

        orders[orderId] = OrderRecord({
            buyer: from,
            vcHash: bytes32(0),
            purchaseTimestamp: purchaseTimestamp,
            orderConfirmedTimestamp: 0,
            phase: uint8(Phase.Purchased),
            exists: true
        });

        Phase oldPhase = phase;
        phase = Phase.Purchased;

        emit PhaseChanged(id, oldPhase, phase, from);
        emit ConfidentialOrderPaid(orderId, from, id);
    }

    function _recordSellerDeliveryFee(bytes32 orderId, address from, euint64 amount) internal {
        if (from != owner) revert UnauthorizedDeposit(owner, from);
        if (phase != Phase.Bound) revert InvalidPhase();
        if (orderId != activeOrderId || !orders[orderId].exists) revert WrongOrderId();
        if (_hasSellerDeliveryFeeDeposit) revert MissingDeliveryFunding();

        _sellerDeliveryFeeDeposit = amount;
        _hasSellerDeliveryFeeDeposit = true;

        emit DeliveryFeeFunded(orderId, from);
    }

    function _recordSellerBond(bytes32 orderId, address from, euint64 amount) internal {
        if (from != owner) revert UnauthorizedDeposit(owner, from);
        if (phase != Phase.Purchased) revert InvalidPhase();
        if (orderId != activeOrderId || !orders[orderId].exists) revert WrongOrderId();
        if (_hasSellerBondDeposit) revert MissingSellerBondFunding();

        _sellerBondDeposit = amount;
        _hasSellerBondDeposit = true;

        ebool equalityResult = FHE.eq(_sellerBondDeposit, _buyerDeposit);
        FHE.makePubliclyDecryptable(equalityResult);
        _sellerBondEqualityAttestation = EqualityAttestation({
            status: EqualityStatus.Pending,
            handle: ebool.unwrap(equalityResult),
            requestedAt: uint64(block.timestamp),
            verifiedAt: 0
        });

        emit SellerBondFunded(orderId, from);
        emit EqualityAttestationRequested(
            orderId,
            EqualityTarget.SellerBondMatchesBuyerDeposit,
            _sellerBondEqualityAttestation.handle
        );
    }

    function _recordTransporterSecurityDeposit(bytes32 orderId, address from, euint64 amount) internal {
        if (transporter == address(0)) revert TransporterNotSet();
        if (from != transporter) revert UnauthorizedDeposit(transporter, from);
        if (phase != Phase.Bound) revert InvalidPhase();
        if (orderId != activeOrderId || !orders[orderId].exists) revert WrongOrderId();
        if (_hasTransporterSecurityDeposit) revert MissingDeliveryFunding();

        _transporterSecurityDeposit = amount;
        _hasTransporterSecurityDeposit = true;

        ebool equalityResult = FHE.eq(_transporterSecurityDeposit, _buyerDeposit);
        FHE.makePubliclyDecryptable(equalityResult);
        _transporterBondEqualityAttestation = EqualityAttestation({
            status: EqualityStatus.Pending,
            handle: ebool.unwrap(equalityResult),
            requestedAt: uint64(block.timestamp),
            verifiedAt: 0
        });

        emit TransporterSecurityFunded(orderId, from);
        emit EqualityAttestationRequested(
            orderId,
            EqualityTarget.TransporterBondMatchesBuyerDeposit,
            _transporterBondEqualityAttestation.handle
        );
    }

    function _transferConfidential(address recipient, euint64 amount) internal {
        FHE.allowTransient(amount, address(paymentToken));
        paymentToken.confidentialTransfer(recipient, amount);
    }

    function _clearBuyerDeposit() internal {
        _buyerDeposit = FHE.asEuint64(0);
        _hasBuyerDeposit = false;
    }

    function _clearSellerDeliveryFeeDeposit() internal {
        _sellerDeliveryFeeDeposit = FHE.asEuint64(0);
        _hasSellerDeliveryFeeDeposit = false;
    }

    function _clearSellerBondDeposit() internal {
        _sellerBondDeposit = FHE.asEuint64(0);
        _hasSellerBondDeposit = false;
        _sellerBondEqualityAttestation = EqualityAttestation({
            status: EqualityStatus.None,
            handle: bytes32(0),
            requestedAt: 0,
            verifiedAt: 0
        });
    }

    function _clearTransporterSecurityDeposit() internal {
        _transporterSecurityDeposit = FHE.asEuint64(0);
        _hasTransporterSecurityDeposit = false;
        _transporterBondEqualityAttestation = EqualityAttestation({
            status: EqualityStatus.None,
            handle: bytes32(0),
            requestedAt: 0,
            verifiedAt: 0
        });
    }

    function _getEqualityAttestation(EqualityTarget target) internal view returns (EqualityAttestation storage) {
        if (target == EqualityTarget.SellerBondMatchesBuyerDeposit) {
            return _sellerBondEqualityAttestation;
        }
        if (target == EqualityTarget.TransporterBondMatchesBuyerDeposit) {
            return _transporterBondEqualityAttestation;
        }
        revert UnsupportedEqualityTarget();
    }

    function _expireActiveOrder() internal {
        Phase oldPhase = phase;
        phase = Phase.Expired;
        if (activeOrderId != bytes32(0) && orders[activeOrderId].exists) {
            orders[activeOrderId].phase = uint8(Phase.Expired);
        }
        emit PhaseChanged(id, oldPhase, phase, msg.sender);
    }
}
