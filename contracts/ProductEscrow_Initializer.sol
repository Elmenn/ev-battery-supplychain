// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// Standardized custom errors for gas efficiency and consistency
// Role-specific errors
error NotBuyer();
error NotSeller();
error NotTransporter();
error NotFactory();

// Shared business logic errors
error InvalidPhase();
error InvalidProductId();
error InvalidOwnerAddress();
error EmptyName();
error ZeroPriceCommitment();
error CommitmentFrozen();
error AlreadyInitialized();
error AlreadyPurchased();
error AlreadyDelivered();
error AlreadyExists();
error AlreadyPaid();
error AlreadySelected();

// State validation errors
error WrongPhase();
error TransporterNotSet();
error BidCapReached();
error NotRegistered();
error IncorrectFee();
error NotATransporter();
error OwnerCannotPurchase();
error NotPurchased();
error NotDelivered();
error TooEarlyToDelete();
error RevealInvalid();
error DeliveryTimeout();
error PriceZero();
error SellerWindowNotExpired();
error BiddingWindowNotExpired();
error NotYetTimeout();

// Transfer and payment errors
error TransferFailed(address to, uint256 amount);
error BuyerRefundFailed();
error RefundFailed();
error IncorrectDeliveryFee();

// Railgun and memo errors
error WrongProductId();
error ZeroMemoHash();
error ZeroTxRef();
error WrongPhaseForPayment();
error NoTransporter();
error MemoAlreadyUsed();
error PaymentAlreadyRecorded();
error NotParticipant();

// --- Public Purchase Errors ---
error PublicDisabled();
error PrivateDisabled();
error PublicPriceNotSet();
error InvalidPurchaseMode();

contract ProductEscrow_Initializer is ReentrancyGuard {
    // Packed storage for gas optimization - Group 1 (32 bytes)
    uint256 public id;
    string public name;
    bytes32 public priceCommitment; // Confidential price commitment
    
    // Packed storage - Group 2 (32 bytes) - addresses pack together
    address payable public owner;
    address payable public buyer;
    address payable public transporter;
    
    // Packed storage - Group 3 (32 bytes) - enum + timestamps + booleans + counters
    enum Phase { Listed, Purchased, OrderConfirmed, Bound, Delivered, Expired }
    Phase public phase;
    uint64 public purchaseTimestamp; // Timestamp when purchase is confirmed
    uint64 public orderConfirmedTimestamp; // Timestamp when seller confirms order
    bool public purchased;
    bool public delivered;
    uint32 public transporterCount;
    
    // Packed storage - Group 4 (32 bytes) - constants pack together
    uint32 public constant SELLER_WINDOW = 2 days; // Seller must confirm within 48h
    uint32 public constant BID_WINDOW = 2 days;    // Bidding window after seller confirmation
    uint32 public constant DELIVERY_WINDOW = 2 days; // Delivery window after transporter is set
    uint8 public constant MAX_BIDS = 20; // Cap on number of transporter bids
    
    // Separate storage for larger values (don't pack with smaller types)
    uint public deliveryFee;
    uint public productPrice; // Explicitly track the buyer's deposit amount
    string public vcCid; // IPFS hash or other identifier
    
    // --- Modes ---
    enum PurchaseMode { None, Public, Private }
    PurchaseMode public purchaseMode;
    
    // --- Pricing/toggles ---
    uint256 public publicPriceWei;       // 0 = no public price set
    bytes32 public publicPriceCommitment; // Optional Pedersen-style commitment to the public price
    bool public commitmentFrozen;        // Commitment immutability flag (frozen after first set)
    bool public publicEnabled = true;    // both on by default
    bool public privateEnabled = true;
    
    // --- Lightweight kill-switch ---
    bool private stopped;
    
    // ✅ Admin functions to enable/disable purchase modes
    function setPublicEnabled(bool _enabled) external onlySeller {
        publicEnabled = _enabled;
        emit PublicEnabledSet(id, _enabled);
    }
    
    function setPrivateEnabled(bool _enabled) external onlySeller {
        privateEnabled = _enabled;
        emit PrivateEnabledSet(id, _enabled);
    }
    
    // Mappings and arrays
    mapping(address => uint) public securityDeposits; // Track each transporter's deposit
    mapping(address => uint) public transporters; // Store transporter fees
    mapping(address => bool) public isTransporter; // Membership mapping for transporters
    address[] public transporterAddresses; // Store all transporter addresses
    
    // Initialization guard
    bool private _initialized;
    
    // Factory access control (immutable after initialization)
    address public factory;
    
    modifier onlyFactory() {
        if (msg.sender != factory && factory != address(0)) revert NotFactory();
        _;
    }
    

    
    modifier whenNotStopped() {
        require(!stopped, "stopped");
        _;
    }
    
    // Cap on number of transporter bids to prevent DoS and high gas
    function maxBids() internal view virtual returns (uint8) {
        return MAX_BIDS;
    }
    
    function pauseByFactory() external {
        if (msg.sender != factory) revert NotFactory();
        stopped = true;
    }
    
    // Explicit getter for stopped state (UI probes this)
    function isStopped() external view returns (bool) { 
        return stopped; 
    }
    
    // Canonical commitment computation helper (pure function for tests and UI)
    function computeCommitment(uint256 value, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(value, salt));
    }
    
    // Railgun Integration State
    mapping(bytes32 => bool) public privatePayments; // Track recorded private payments by memoHash
    mapping(uint256 => bytes32) public productMemoHashes; // Link productId to memoHash
    mapping(uint256 => bytes32) public productRailgunTxRefs; // Link productId to Railgun tx reference
    mapping(bytes32 => bool) public usedMemoHash; // Global reuse guard for memos
    mapping(uint256 => address) public productPaidBy; // Track who recorded the payment (for audit)

    // Confidential value commitment and proof (Pedersen + Bulletproofs)
    bytes32 public valueCommitment;
    bytes public valueRangeProof;
    event ValueCommitted(bytes32 commitment, bytes proof);

    modifier onlyBuyer() {
        if (msg.sender != buyer) revert NotBuyer();
        _;
    }

    modifier onlySeller() {
        if (msg.sender != owner) revert NotSeller();
        _;
    }

    modifier transporterSet() {
        if (transporter == address(0)) revert TransporterNotSet();
        _;
    }

    modifier onlyTransporter() {
        if (msg.sender != transporter) revert NotTransporter();
        _;
    }

    event OrderConfirmed(address indexed buyer, address indexed seller, uint256 indexed productId, bytes32 priceCommitment, string vcCID, uint256 timestamp);
    event PurchaseConfirmedWithCommitment(uint256 indexed productId, bytes32 indexed purchaseTxHashCommitment, address indexed buyer, string vcCID, uint256 timestamp);
    event TransporterCreated(address indexed transporter, uint256 indexed productId, uint256 timestamp);
    event TransporterSecurityDeposit(address indexed transporter, uint256 indexed productId, uint256 timestamp);
    event DeliveryConfirmed(address indexed buyer, address indexed transporter, address indexed seller, uint256 productId, bytes32 priceCommitment, string vcCID, uint256 timestamp);
    event DeliveryConfirmedWithCommitment(uint256 indexed productId, bytes32 indexed txHashCommitment, address indexed buyer, string vcCID, uint256 timestamp);
    event VcUpdated(uint256 indexed productId, string cid, address indexed seller, uint256 timestamp);
    event ValueRevealed(uint256 indexed productId, bytes32 commitment, bool valid, uint256 timestamp);
    event FundsTransferred(address indexed to, uint256 indexed productId, uint256 timestamp);
    event PenaltyApplied(address indexed to, uint256 indexed productId, string reason, uint256 timestamp);
    event DeliveryTimeoutEvent(address indexed caller, uint256 indexed productId, uint time, uint256 timestamp);
    event SellerTimeout(address indexed caller, uint256 indexed productId, uint time, uint256 timestamp);
    event PhaseChanged(uint256 indexed productId, Phase indexed from, Phase indexed to, address actor, uint256 timestamp, bytes32 ref);
    event BidWithdrawn(address indexed transporter, uint256 indexed productId, uint256 timestamp);
    event TransporterSelected(uint256 indexed productId, address indexed transporter, uint256 timestamp);
    
    // Comprehensive product state change event for frontend indexing
    event PublicEnabledSet(uint256 indexed id, bool enabled);
    event PrivateEnabledSet(uint256 indexed id, bool enabled);
    
    event ProductStateChanged(
        uint256 indexed productId,
        address indexed seller,
        address indexed buyer,
        Phase phase,
        uint256 timestamp,
        bytes32 priceCommitment,
        bool purchased,
        bool delivered
    );
    
    // Railgun Integration Events
    event PaidPrivately(uint256 indexed productId, bytes32 memoHash, bytes32 railgunTxRef, uint256 timestamp);
    event PrivatePaymentRecorded(uint256 indexed productId, bytes32 memoHash, bytes32 railgunTxRef, address indexed recorder, uint256 timestamp);
    
    // --- Public Purchase Events ---
    event PublicPriceSet(uint256 priceWei);
    event PublicPriceCommitmentSet(uint256 indexed id, bytes32 commitment);
    event PurchasedPublic(address indexed buyer);
    event PurchasedPrivate(address indexed buyer, bytes32 memoHash, bytes32 railgunTxRef);

    // Initialize function instead of constructor
    function initialize(
        uint256 _id,
        string memory _name,
        bytes32 _priceCommitment,
        address _owner,
        uint256 _productPrice,
        address _factory
    ) external {
        if (_initialized) revert AlreadyInitialized();
        if (_owner == address(0)) revert InvalidOwnerAddress();
        if (bytes(_name).length == 0) revert EmptyName();
        if (_priceCommitment == bytes32(0)) revert ZeroPriceCommitment();
        if (_id == 0) revert InvalidProductId();
        if (msg.sender != _factory) revert NotFactory(); // ✅ Only factory can initialize
        
        _initialized = true;
        
        // Bind to factory (immutable after initialization)
        factory = _factory;
        
        id = _id;
        name = _name;
        priceCommitment = _priceCommitment;
        productPrice = _productPrice; // ✅ Set the price during initialization
        owner = payable(_owner);
        purchased = false;
        buyer = payable(address(0));
        phase = Phase.Listed;
        
        // ✅ Explicitly enable both purchase modes during initialization
        publicEnabled = true;
        privateEnabled = true;
        
        // Emit comprehensive state change event
        emit ProductStateChanged(id, owner, buyer, phase, block.timestamp, priceCommitment, purchased, delivered);
        
        // Emit PhaseChanged event for initialization
        emit PhaseChanged(id, Phase.Listed, Phase.Listed, msg.sender, block.timestamp, bytes32(0));
    }

    // Seller sets a public price (add)
    function setPublicPrice(uint256 priceWei) external onlySeller whenNotStopped {
        if (phase != Phase.Listed) revert WrongPhase();
        if (publicPriceWei != 0) revert("Already set");
        if (priceWei == 0) revert("Zero price");
        
        publicPriceWei = priceWei;
        publicEnabled = (priceWei > 0); // ✅ Auto-enable when price is set
        emit PublicPriceSet(priceWei);
    }

    /// @notice Set the public price together with its Pedersen commitment.
    /// @dev The commitment is frozen after first set to ensure immutability.
    /// @param priceWei The public price in Wei
    /// @param commitment The Pedersen commitment (bytes32) to the price
    function setPublicPriceWithCommitment(uint256 priceWei, bytes32 commitment) external onlySeller whenNotStopped {
        if (phase != Phase.Listed) revert WrongPhase();
        if (commitmentFrozen) revert CommitmentFrozen(); // Explicit immutability check
        if (publicPriceWei != 0) revert("Already set"); // Defense in depth
        if (priceWei == 0) revert("Zero price");
        if (commitment == bytes32(0)) revert ZeroPriceCommitment();

        publicPriceWei = priceWei;
        publicPriceCommitment = commitment; // Pedersen commitment (Ristretto point) for ZKP verification
        publicEnabled = (priceWei > 0);
        commitmentFrozen = true; // Freeze immediately after setting
        
        // ✅ Also update priceCommitment for revealAndConfirmDelivery compatibility
        // Compute deterministic blinding factor: keccak256(productAddress, sellerAddress)
        bytes32 deterministicBlinding = keccak256(abi.encodePacked(address(this), owner));
        // Compute keccak256 commitment: keccak256(priceWei, deterministicBlinding)
        priceCommitment = keccak256(abi.encodePacked(priceWei, deterministicBlinding));

        emit PublicPriceSet(priceWei);
        emit PublicPriceCommitmentSet(id, commitment);
    }
    
    // Simple order confirmation function (from working version)
    function confirmOrder(string memory vcCID) public onlySeller nonReentrant whenNotStopped {
        confirmOrderWithCommitment(vcCID, bytes32(0));
    }

    /// @notice Confirm order with optional purchase TX hash commitment for transaction verification
    /// @dev This allows the seller to include purchase TX hash commitment when confirming order
    /// @param vcCID The VC CID to store on-chain
    /// @param purchaseTxHashCommitment Optional purchase TX hash commitment for transaction verification (bytes32(0) if not provided)
    function confirmOrderWithCommitment(string memory vcCID, bytes32 purchaseTxHashCommitment) public onlySeller nonReentrant whenNotStopped {
        if (phase != Phase.Purchased) revert WrongPhase();
        if (!purchased) revert NotPurchased();
        
        orderConfirmedTimestamp = uint64(block.timestamp);
        phase = Phase.OrderConfirmed;
        
        vcCid = vcCID;
        emit VcUpdated(id, vcCID, owner, block.timestamp);
        emit OrderConfirmed(buyer, owner, id, priceCommitment, vcCID, block.timestamp);
        
        // Emit commitment event for purchase transaction verification (Feature 1)
        if (purchaseTxHashCommitment != bytes32(0)) {
            emit PurchaseConfirmedWithCommitment(id, purchaseTxHashCommitment, buyer, vcCID, block.timestamp);
        }
    }

    function updateVcCid(string memory cid) public nonReentrant {
        _updateVcCid(cid);
    }

    function _updateVcCid(string memory cid) internal onlySeller {
        vcCid = cid;
        emit VcUpdated(id, cid, owner, block.timestamp);
    }

    /// @notice Allow buyer to update VC CID after delivery confirmation (for TX hash commitment)
    /// @dev This allows the buyer to update the CID after revealAndConfirmDelivery to include TX hash commitment
    /// @param cid The new VC CID to store on-chain
    /// @param txHashCommitment Optional TX hash commitment for transaction verification (bytes32(0) if not provided)
    function updateVcCidAfterDelivery(string memory cid, bytes32 txHashCommitment) public nonReentrant {
        if (msg.sender != buyer) revert NotBuyer();
        if (!delivered) revert NotDelivered(); // Must be delivered first
        if (phase != Phase.Delivered) revert WrongPhase(); // Extra safety check
        vcCid = cid;
        emit VcUpdated(id, cid, buyer, block.timestamp);
        
        // Emit commitment event for transaction verification (Feature 1)
        if (txHashCommitment != bytes32(0)) {
            emit DeliveryConfirmedWithCommitment(id, txHashCommitment, buyer, cid, block.timestamp);
        }
    }

    function depositPurchasePrivate(bytes32 _commitment, bytes32 _valueCommitment, bytes calldata _valueRangeProof) public payable nonReentrant {
        _depositPurchase(_commitment, _valueCommitment, _valueRangeProof);
    }

    // Simple public purchase function for non-private transactions (from working version)
    function depositPurchase() public payable nonReentrant {
        if (purchased) revert AlreadyPurchased();
        if (msg.sender == owner) revert OwnerCannotPurchase();
        if (msg.value != productPrice) revert IncorrectFee(); // ✅ Exact price match
        
        purchased = true;
        buyer = payable(msg.sender);
        purchaseTimestamp = uint64(block.timestamp);
        // productPrice stays the same (don't overwrite the original price)
        
        Phase oldPhase = phase;
        phase = Phase.Purchased;
        
        emit PhaseChanged(id, oldPhase, phase, msg.sender, block.timestamp, bytes32(0));
        // ✅ Remove OrderConfirmed - that's for seller confirmation, not purchase
        
        // Emit comprehensive state change event
        emit ProductStateChanged(id, owner, buyer, phase, block.timestamp, priceCommitment, purchased, delivered);
    }

    // Public purchase entrypoint (add)
    function purchasePublic() external payable nonReentrant whenNotStopped {
        if (msg.sender == owner) revert OwnerCannotPurchase();
        if (purchased) revert AlreadyPurchased();
        if (phase != Phase.Listed) revert WrongPhase();
        if (!publicEnabled) revert PublicDisabled();
        if (publicPriceWei == 0) revert PublicPriceNotSet();
        if (msg.value != publicPriceWei) revert IncorrectFee();

        buyer = payable(msg.sender);
        purchaseMode = PurchaseMode.Public;
        purchased = true;
        purchaseTimestamp = uint64(block.timestamp);
        productPrice = msg.value; // ✅ Escrow the actual ETH received

        Phase oldPhase = phase;
        phase = Phase.Purchased;

        emit PurchasedPublic(buyer);
        emit PhaseChanged(id, oldPhase, phase, msg.sender, block.timestamp, bytes32(0));
        // ✅ Remove OrderConfirmed - that's for seller confirmation, not purchase
        
        // Emit comprehensive state change event
        emit ProductStateChanged(id, owner, buyer, phase, block.timestamp, priceCommitment, purchased, delivered);
    }

    function _depositPurchase(bytes32 _commitment, bytes32 _valueCommitment, bytes calldata _valueRangeProof) internal {
        if (purchased) revert AlreadyPurchased();
        if (msg.sender == owner) revert OwnerCannotPurchase();
        if (msg.value != productPrice) revert IncorrectFee(); // ✅ Check exact price match
        
        purchased = true;
        buyer = payable(msg.sender);
        purchaseTimestamp = uint64(block.timestamp);
        // productPrice stays the same (don't overwrite the original price)
        // Set purchaseMode based on whether ETH was sent
        purchaseMode = (msg.value > 0) ? PurchaseMode.Public : PurchaseMode.Private;
        Phase oldPhase = phase;
        phase = Phase.Purchased;
        emit PhaseChanged(id, oldPhase, phase, msg.sender, block.timestamp, _commitment);
        priceCommitment = _commitment;
        valueCommitment = _valueCommitment;
        valueRangeProof = _valueRangeProof;
        emit ValueCommitted(_valueCommitment, _valueRangeProof);
        // ✅ Remove OrderConfirmed - that's for seller confirmation, not purchase
        
        // Emit comprehensive state change event
        emit ProductStateChanged(id, owner, buyer, phase, block.timestamp, priceCommitment, purchased, delivered);
    }

    function setTransporter(address payable _transporter) external payable onlySeller nonReentrant {
        if (phase != Phase.OrderConfirmed) revert WrongPhase();
        if (block.timestamp > orderConfirmedTimestamp + BID_WINDOW) revert BiddingWindowNotExpired();
        if (!isTransporter[_transporter]) revert NotATransporter();
        
        // Verify the delivery fee matches what was bid
        if (msg.value != transporters[_transporter]) revert IncorrectDeliveryFee();
        
        deliveryFee = msg.value; // Use the actual ETH sent
        transporter = _transporter;
        
        Phase oldPhase = phase;
        phase = Phase.Bound;
        emit PhaseChanged(id, oldPhase, phase, msg.sender, block.timestamp, bytes32(0));
        emit TransporterSelected(id, _transporter, block.timestamp);
    }

    function createTransporter(uint _feeInWei) public nonReentrant {
        _createTransporter(_feeInWei);
    }

    function _createTransporter(uint _feeInWei) internal {
        if (transporterCount >= MAX_BIDS) revert BidCapReached();
        if (transporters[msg.sender] != 0) revert AlreadyExists();
        transporters[msg.sender] = _feeInWei;
        isTransporter[msg.sender] = true;
        transporterAddresses.push(msg.sender);
        
        // Use unchecked for safe increment
        unchecked {
            transporterCount++;
        }
        
        emit TransporterCreated(msg.sender, id, block.timestamp);
        // No phase change here
    }

    function securityDeposit() public payable nonReentrant {
        _securityDeposit();
    }

    function _securityDeposit() internal {
        if (!isTransporter[msg.sender]) revert NotRegistered();
        securityDeposits[msg.sender] += msg.value;
        emit TransporterSecurityDeposit(msg.sender, id, block.timestamp);
        // No phase change here
    }

    // View function to return all transporter addresses and their fees
    // Optimized to avoid unbounded loops in write operations
    function getAllTransporters() public view returns (address[] memory, uint[] memory) {
        uint len = transporterAddresses.length;
        address[] memory addresses = new address[](len);
        uint[] memory fees = new uint[](len);
        
        // Use unchecked for safe loop operations
        unchecked {
            for (uint i = 0; i < len; i++) {
                addresses[i] = transporterAddresses[i];
                fees[i] = transporters[transporterAddresses[i]];
            }
        }
        
        return (addresses, fees);
    }

    function verifyRevealedValue(uint revealedValue, bytes32 blinding) public nonReentrant returns (bool) {
        return _verifyRevealedValue(revealedValue, blinding);
    }

    function _verifyRevealedValue(uint revealedValue, bytes32 blinding) internal returns (bool) {
        bytes32 computed = keccak256(abi.encodePacked(revealedValue, blinding));
        bool valid = (computed == priceCommitment);
        emit ValueRevealed(id, priceCommitment, valid, block.timestamp);
        return valid;
        // No phase change here
    }

    function revealAndConfirmDelivery(uint revealedValue, bytes32 blinding, string memory vcCID) public nonReentrant {
        _revealAndConfirmDelivery(revealedValue, blinding, vcCID);
    }

    function _revealAndConfirmDelivery(uint revealedValue, bytes32 blinding, string memory vcCID) internal {
        if (msg.sender != buyer) revert NotBuyer();
        if (transporter == address(0)) revert TransporterNotSet();
        
        // ✅ Verify the revealed value matches the commitment
        bytes32 computed = computeCommitment(revealedValue, blinding);
        bool valid;
        
        // ✅ For public purchases with publicPriceCommitment set
        if (publicPriceCommitment != bytes32(0)) {
            // Verify the revealed value matches the public price
            if (revealedValue != publicPriceWei) revert RevealInvalid();
            
            // Check if priceCommitment was updated (new products) or needs to be computed (old products)
            bytes32 expectedBlinding = keccak256(abi.encodePacked(address(this), owner));
            if (blinding == expectedBlinding) {
                // For new products: priceCommitment was updated in setPublicPriceWithCommitment
                valid = (computed == priceCommitment);
            } else {
                // For old products: compute the expected commitment on-the-fly
                bytes32 expectedCommitment = keccak256(abi.encodePacked(revealedValue, expectedBlinding));
                valid = (computed == expectedCommitment);
            }
        } else {
            // Legacy/private purchases: check against priceCommitment
            valid = (computed == priceCommitment);
        }
        
        if (!valid) revert RevealInvalid();
        _confirmDelivery(vcCID);
    }

    function _confirmDelivery(string memory vcCID) internal {
        if (delivered) revert AlreadyDelivered();
        if (block.timestamp > orderConfirmedTimestamp + DELIVERY_WINDOW) revert DeliveryTimeout();
        delivered = true;
        Phase oldPhase = phase;
        phase = Phase.Delivered;

        // cache for events
        bytes32 memoHash = productMemoHashes[id];
        bytes32 railgunTx = productRailgunTxRefs[id];

        if (purchaseMode == PurchaseMode.Private) {
            // No ETH moves — settlement was private.
            // If you didn't emit this in recordPrivatePayment(), you can emit it here:
            if (memoHash != bytes32(0)) {
                emit PaidPrivately(id, memoHash, railgunTx, block.timestamp);
            }
            // value=0, ref=memo (optional convention)
            emit PhaseChanged(id, oldPhase, phase, msg.sender, block.timestamp, memoHash);

        } else if (purchaseMode == PurchaseMode.Public) {
            uint256 sellerAmount = productPrice; // ✅ Use escrowed amount, not posted price
            if (sellerAmount == 0) revert PriceZero();

            // compute transporter payout
            uint256 transporterAmount = deliveryFee + securityDeposits[transporter];

            // --- Effects first ---
            productPrice = 0; // ✅ Zero escrowed funds before transfers
            securityDeposits[transporter] = 0;
            deliveryFee = 0;

            // --- Interactions ---
            (bool sentSeller, ) = owner.call{value: sellerAmount}("");
            if (!sentSeller) revert TransferFailed(owner, sellerAmount);

            if (transporter != address(0) && transporterAmount > 0) {
                (bool sentTransporter, ) = transporter.call{value: transporterAmount}("");
                if (!sentTransporter) revert TransferFailed(transporter, transporterAmount);
            }

            emit PhaseChanged(id, oldPhase, phase, msg.sender, block.timestamp, bytes32(0));

        } else {
            revert InvalidPurchaseMode(); // add a small custom error
        }

        // update VC anchor with latest CID
        vcCid = vcCID;
        emit VcUpdated(id, vcCID, owner, block.timestamp);
        emit DeliveryConfirmed(buyer, transporter, owner, id, priceCommitment, vcCID, block.timestamp);
    }

    function timeout() public nonReentrant whenNotStopped {
        _timeout();
    }

    function _timeout() internal {
        if (delivered) revert AlreadyDelivered();
        if (block.timestamp <= orderConfirmedTimestamp + DELIVERY_WINDOW) revert NotYetTimeout();
        Phase oldPhase = phase;
        phase = Phase.Expired;
        
        if (purchaseMode == PurchaseMode.Public) {
            // Use unchecked for safe arithmetic operations
            unchecked {
                uint lateDays = (block.timestamp - (orderConfirmedTimestamp + DELIVERY_WINDOW)) / 1 days + 1;
                if (lateDays > 10) lateDays = 10;
                uint penalty = (securityDeposits[transporter] * 10 * lateDays) / 100;
                if (penalty > securityDeposits[transporter]) penalty = securityDeposits[transporter];
                
                uint refundToBuyer = productPrice + penalty; // ✅ Use escrowed amount
                productPrice = 0; // ✅ Zero before transfer
                (bool sentBuyer, ) = buyer.call{value: refundToBuyer}("");
                if (!sentBuyer) revert BuyerRefundFailed();
                emit FundsTransferred(buyer, id, block.timestamp);
                
                if (penalty > 0) {
                    (bool sentPenalty, ) = buyer.call{value: penalty}("");
                    if (!sentPenalty) revert TransferFailed(buyer, penalty);
                    emit PenaltyApplied(transporter, id, "Late delivery", block.timestamp);
                }
            }
        }
        // Private mode: no ETH to refund
        
        emit PhaseChanged(id, oldPhase, phase, msg.sender, block.timestamp, bytes32(0));
        emit DeliveryTimeoutEvent(msg.sender, id, block.timestamp, block.timestamp);
    }

    function sellerTimeout() public nonReentrant whenNotStopped {
        _sellerTimeout();
    }

    function _sellerTimeout() internal {
        if (delivered) revert AlreadyDelivered();
        if (phase != Phase.Purchased) revert WrongPhase();
        if (block.timestamp <= purchaseTimestamp + SELLER_WINDOW) revert SellerWindowNotExpired();
        Phase oldPhase = phase;
        phase = Phase.Expired;
        
        if (purchaseMode == PurchaseMode.Public) {
            uint256 refundAmount = productPrice; // ✅ Use escrowed amount
            if (refundAmount > 0) {
                productPrice = 0; // ✅ Zero before transfer
                (bool sentBuyer, ) = buyer.call{value: refundAmount}("");
                if (!sentBuyer) revert BuyerRefundFailed();
                emit FundsTransferred(buyer, id, block.timestamp);
            }
        }
        // Private mode: no ETH to refund
        
        emit PhaseChanged(id, oldPhase, phase, msg.sender, block.timestamp, bytes32(0));
        emit SellerTimeout(msg.sender, id, block.timestamp, block.timestamp);
    }

    function bidTimeout() public nonReentrant whenNotStopped {
        _bidTimeout();
    }

    function _bidTimeout() internal {
        if (phase != Phase.OrderConfirmed) revert WrongPhase();
        if (block.timestamp <= orderConfirmedTimestamp + BID_WINDOW) revert BiddingWindowNotExpired();
        Phase oldPhase = phase;
        phase = Phase.Expired;
        
        if (purchaseMode == PurchaseMode.Public) {
            uint256 refundAmount = productPrice; // ✅ Use escrowed amount
            if (refundAmount > 0) {
                productPrice = 0; // ✅ Zero before transfer
                (bool sentBuyer, ) = buyer.call{value: refundAmount}("");
                if (!sentBuyer) revert BuyerRefundFailed();
                emit FundsTransferred(buyer, id, block.timestamp);
            }
        }
        // Private mode: no ETH to refund
        
        emit PhaseChanged(id, oldPhase, phase, msg.sender, block.timestamp, bytes32(0));
    }

    function withdrawBid() public nonReentrant {
        _withdrawBid();
    }

    function _withdrawBid() internal {
        if (phase != Phase.OrderConfirmed) revert WrongPhase();
        if (transporter == msg.sender) revert AlreadySelected();
        uint fee = transporters[msg.sender];
        uint deposit = securityDeposits[msg.sender];
        if (fee == 0 && deposit == 0) revert NotRegistered();
        
        transporters[msg.sender] = 0;
        securityDeposits[msg.sender] = 0;
        isTransporter[msg.sender] = false;
        
        // Use unchecked for safe decrement
        unchecked {
            transporterCount--;
        }
        
        uint refundAmount = deposit;
        if (refundAmount > 0) {
            (bool sent, ) = payable(msg.sender).call{value: refundAmount}("");
            if (!sent) revert RefundFailed();
            emit FundsTransferred(msg.sender, id, block.timestamp);
        }
        emit BidWithdrawn(msg.sender, id, block.timestamp);
        // No phase change here
    }
    
    function recordPrivatePayment(uint256 _productId, bytes32 _memoHash, bytes32 _railgunTxRef) external nonReentrant whenNotStopped {
        _recordPrivatePayment(_productId, _memoHash, _railgunTxRef);
    }
    
    function _recordPrivatePayment(uint256 _productId, bytes32 _memoHash, bytes32 _railgunTxRef) internal {
        if (_productId != id) revert WrongProductId();
        if (_memoHash == bytes32(0)) revert ZeroMemoHash();
        if (_railgunTxRef == bytes32(0)) revert ZeroTxRef();
        
        if (phase != Phase.Listed) revert AlreadyPurchased();
        if (!privateEnabled) revert PrivateDisabled();
        
        if (productMemoHashes[id] != bytes32(0)) revert AlreadyPaid();
        if (usedMemoHash[_memoHash]) revert MemoAlreadyUsed();
        if (privatePayments[_memoHash]) revert PaymentAlreadyRecorded();
        
        // Restrict to buyer or seller only (no transporter)
        if (msg.sender != buyer && msg.sender != owner) revert NotParticipant();
        
        buyer = payable(msg.sender);
        purchaseMode = PurchaseMode.Private;
        purchased = true;
        purchaseTimestamp = uint64(block.timestamp);
        
        privatePayments[_memoHash] = true;
        usedMemoHash[_memoHash] = true;
        productMemoHashes[id] = _memoHash;
        productRailgunTxRefs[id] = _railgunTxRef;
        productPaidBy[id] = msg.sender;
        
        Phase oldPhase = phase;
        phase = Phase.Purchased;
        
        emit PurchasedPrivate(buyer, _memoHash, _railgunTxRef);
        emit PhaseChanged(id, oldPhase, phase, msg.sender, block.timestamp, _memoHash);
        // ✅ Remove OrderConfirmed - that's for seller confirmation, not purchase
        
        // Emit comprehensive state change event
        emit ProductStateChanged(id, owner, buyer, phase, block.timestamp, priceCommitment, purchased, delivered);
        
        emit PrivatePaymentRecorded(id, _memoHash, _railgunTxRef, msg.sender, block.timestamp);
    }
    

    // Explicitly reject unexpected ETH
    receive() external payable {
        revert("ProductEscrow does not accept unexpected ETH");
    }

    fallback() external payable {
        revert("ProductEscrow does not accept unexpected ETH");
    }
}