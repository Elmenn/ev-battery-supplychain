// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Custom errors for gas savings and better debugging
error WrongPhase(ProductEscrow.Phase expected, ProductEscrow.Phase got);
error NotTransporter();
error BidCap();
error Exists();
error NotRegistered();
error Fee();
error Delivered();
error Timeout();
error Confirm();
error Deposit();
error Refund();
error Penalty();
error Transfer();
error VC();

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ProductEscrow is ReentrancyGuard {
    uint public id;
    string public name;
    bytes32 public priceCommitment; // Confidential price commitment (changed from uint price)
    address payable public owner;
    bool public purchased;
    address payable public buyer;
    uint public transporterCount;
    address payable public transporter;
    uint public deliveryFee;
    mapping(address => uint) public securityDeposits; // Track each transporter's deposit
    uint public purchaseTimestamp; // Timestamp when purchase is confirmed
    string public vcCid;              // e.g. "ipfs://Qm…"
    bool public delivered;
    enum Phase { Listed, Purchased, OrderConfirmed, Bound, Delivered, Expired }
    Phase public phase;
    // Cap on number of transporter bids to prevent DoS and high gas
    function maxBids() internal view virtual returns (uint8) {
        return 20;
    }
    uint32 public constant SELLER_WINDOW = 2 days; // Seller must confirm within 48h
    uint32 public constant BID_WINDOW = 2 days;    // Bidding window after seller confirmation
    uint32 public constant DELIVERY_WINDOW = 2 days; // Delivery window after transporter is set
    uint public orderConfirmedTimestamp; // Timestamp when seller confirms order (start of bidding window)
    uint public productPrice; // Explicitly track the buyer's deposit amount


    struct TransporterFees {
        uint fee;
    }

    mapping(address => TransporterFees) public transporters;
    mapping(address => bool) public isTransporter; // Membership mapping for transporters

    modifier onlyBuyer() {
        if (msg.sender != buyer) revert NotTransporter();
        _;
    }

    modifier onlySeller() {
        if (msg.sender != owner) revert NotTransporter();
        _;
    }

    modifier transporterSet() {
        if (transporter == address(0)) revert NotTransporter();
        _;
    }

    modifier onlyTransporter() {
        if (msg.sender != transporter) revert NotTransporter();
        _;
    }

    event OrderConfirmed(address indexed buyer, bytes32 indexed priceCommitment, string vcCID); // Updated
    event TransporterCreated(address transporter, uint fee);
    event TransporterSecurityDeposit(address transporter, uint price);
    event DeliveryConfirmed(address indexed buyer, address indexed transporter, bytes32 priceCommitment, string vcCID); // Updated
    event CancelDelivery(address indexed seller, address indexed transporter, uint buyerRefund);
    event ProductDeleted(uint productId, string productName);
    event VcUpdated(string cid);
    event ValueRevealed(uint revealedValue, bytes32 commitment, bool valid); // Added
    event FundsTransferred(address indexed to, uint amount);
    event PenaltyApplied(address indexed to, uint amount, string reason);
    event DeliveryTimeout(address indexed caller, uint time);
    event SellerTimeout(address indexed caller, uint time);
    event PhaseChanged(Phase from, Phase to, uint256 time); // Emitted on every phase transition
    event BidWithdrawn(address indexed transporter, uint amount);

    constructor(string memory _name, bytes32 _priceCommitment, address _owner) {
        name = _name;
        priceCommitment = _priceCommitment; // Storing commitment
        owner = payable(_owner);
        purchased = false;
        buyer = payable(address(0));
        phase = Phase.Listed;
    }

    function confirmOrder(string memory vcCID) public onlySeller {
        if (phase != Phase.Purchased) revert WrongPhase(Phase.Purchased, phase);
        if (block.timestamp > purchaseTimestamp + SELLER_WINDOW) revert Confirm();
        orderConfirmedTimestamp = block.timestamp;
        Phase oldPhase = phase;
        phase = Phase.OrderConfirmed;
        emit PhaseChanged(oldPhase, phase, block.timestamp); // Emit on phase change
        vcCid = vcCID;
        emit VcUpdated(vcCID);
        emit OrderConfirmed(buyer, priceCommitment, vcCID);
    }

    function updateVcCid(string memory cid) public onlySeller {
    vcCid = cid;
    emit VcUpdated(cid);
    }


    function depositPurchase(bytes32 _commitment) public payable nonReentrant {
        if (purchased) revert Deposit();
        if (msg.sender == owner) revert Deposit();
        purchased    = true;
        buyer        = payable(msg.sender);
        purchaseTimestamp = block.timestamp;
        productPrice = msg.value; // Track the product price explicitly
        Phase oldPhase = phase;
        phase        = Phase.Purchased;   // Set phase to Purchased after successful purchase
        emit PhaseChanged(oldPhase, phase, block.timestamp); // Emit on phase change
        priceCommitment = _commitment; // Store the commitment
        emit OrderConfirmed(buyer, priceCommitment, ""); // Optionally emit event
    }

    function withdrawProductPrice() public onlyBuyer transporterSet {
        if (!purchased) revert Deposit();
        // Ether transfer logic commented out
        // owner.transfer(price);
        // transporter.transfer(price + deliveryFee);
        owner = buyer;
    }

    function cancelDelivery() public onlySeller transporterSet {
        if (!purchased) revert Deposit();
        // Ether transfer logic commented out
        // transporter.transfer((2 * price) / 10 + deliveryFee + price);
        // owner.transfer(price / 10);
        // buyer.transfer((7 * price) / 10);
        emit CancelDelivery(msg.sender, transporter, 0); // Buyer refund not revealed
    }

    function setTransporter(address payable _transporter) external payable onlySeller {
        if (phase != Phase.OrderConfirmed) revert WrongPhase(Phase.OrderConfirmed, phase);
        if (block.timestamp > orderConfirmedTimestamp + BID_WINDOW) revert Timeout();
        Phase oldPhase = phase;
        phase = Phase.Bound; // Move to Bound phase after transporter is set
        emit PhaseChanged(oldPhase, phase, block.timestamp); // Emit on phase change
        if (msg.value != transporters[_transporter].fee) revert Fee();
        if (transporters[_transporter].fee == 0) revert NotTransporter();
        deliveryFee = msg.value;
        transporter = _transporter;
        // Refund security deposits to all non-selected transporters
        // Since we no longer have an array, this must be handled off-chain via events, or by tracking addresses off-chain.
        // For on-chain refunds, you could emit an event for each refund and let the frontend/off-chain system process them.
    }

    function createTransporter(uint _feeInWei) public {
        require(transporterCount < maxBids(), "Bid cap reached");
        if (transporters[msg.sender].fee != 0) revert Exists();
        // Store fee in wei for precision
        transporters[msg.sender] = TransporterFees({ fee: _feeInWei });
        isTransporter[msg.sender] = true;
        transporterCount++;
        emit TransporterCreated(msg.sender, _feeInWei);
    }

    function securityDeposit() public payable {
        // Allow any registered transporter to deposit before selection
        if (!isTransporter[msg.sender]) revert NotRegistered();
        securityDeposits[msg.sender] += msg.value;
        emit TransporterSecurityDeposit(msg.sender, msg.value);
    }

    // Remove getAllTransporters() as on-chain iteration is no longer supported

    function checkAndDeleteProduct() public {
        if (!purchased) revert Deposit();
        if (block.timestamp < purchaseTimestamp + 2 days) revert Timeout();

        emit ProductDeleted(id, name);
        deleteProduct(); // Custom logic to delete the product from storage
    }

    function deleteProduct() internal {
        // Logic to mark product as deleted or reset its state
        delete name;
        delete priceCommitment; // Updated
        delete owner;
        delete purchased;
        delete buyer;
        delete transporter;
        delete deliveryFee;
        // delete securityDepositAmount; // REMOVE this
        delete purchaseTimestamp;
        delete transporterCount;
        // Further deletion logic as required
    }

    // Helper for audits: verify a revealed value against the commitment (does not unlock payments)
    function verifyRevealedValue(uint revealedValue, bytes32 blinding) public returns (bool) {
        bytes32 computed = keccak256(abi.encodePacked(revealedValue, blinding));
        bool valid = (computed == priceCommitment);
        emit ValueRevealed(revealedValue, priceCommitment, valid);
        return valid;
    }

    // New: Enforce reveal in payment path
    function revealAndConfirmDelivery(uint revealedValue, bytes32 blinding, string memory vcCID) public nonReentrant onlyBuyer transporterSet {
        bytes32 computed = keccak256(abi.encodePacked(revealedValue, blinding));
        bool valid = (computed == priceCommitment);
        require(valid, "Reveal invalid");
        _confirmDelivery(vcCID);
    }

    // Internal delivery logic, only callable after valid reveal
    function _confirmDelivery(string memory vcCID) internal {
        if (delivered) revert Delivered();
        if (block.timestamp > orderConfirmedTimestamp + DELIVERY_WINDOW) revert Timeout();
        delivered = true;
        Phase oldPhase = phase;
        phase = Phase.Delivered;
        emit PhaseChanged(oldPhase, phase, block.timestamp); // Emit on phase change
        // Transfer funds
        uint price = productPrice; // Use explicitly tracked product price
        if (price == 0) revert Deposit();
        (bool sentSeller, ) = owner.call{value: price}("");
        if (!sentSeller) revert Transfer();
        emit FundsTransferred(owner, price);
        (bool sentTransporter, ) = transporter.call{value: deliveryFee + securityDeposits[transporter]}("");
        if (!sentTransporter) revert Transfer();
        emit FundsTransferred(transporter, deliveryFee + securityDeposits[transporter]);
        owner = buyer;
        vcCid = vcCID;
        emit VcUpdated(vcCID);
        emit DeliveryConfirmed(buyer, transporter, priceCommitment, vcCID);
    }

    // Deprecate the old confirmDelivery external function (no longer used for settlement)
    // function confirmDelivery(string memory vcCID) public onlyBuyer transporterSet nonReentrant { ... }

    function timeout() public nonReentrant {
        if (delivered) revert Delivered();
        if (block.timestamp <= orderConfirmedTimestamp + DELIVERY_WINDOW) revert Timeout();
        Phase oldPhase = phase;
        phase = Phase.Expired;
        emit PhaseChanged(oldPhase, phase, block.timestamp); // Emit on phase change
        // Calculate penalty for transporter
        uint lateDays = (block.timestamp - (orderConfirmedTimestamp + DELIVERY_WINDOW)) / 1 days + 1;
        if (lateDays > 10) lateDays = 10;
        uint penalty = (securityDeposits[transporter] * 10 * lateDays) / 100;
        if (penalty > securityDeposits[transporter]) penalty = securityDeposits[transporter];
        // Refund buyer: productPrice + penalty (if any)
        uint refundToBuyer = productPrice + penalty;
        (bool sentBuyer, ) = buyer.call{value: refundToBuyer}("");
        if (!sentBuyer) revert Refund();
        emit FundsTransferred(buyer, refundToBuyer);
        // Forfeit penalty from transporter to buyer
        if (penalty > 0) {
            (bool sentPenalty, ) = buyer.call{value: penalty}("");
            if (!sentPenalty) revert Penalty();
            emit PenaltyApplied(transporter, penalty, "Late delivery");
        }
        emit DeliveryTimeout(msg.sender, block.timestamp);
    }

    function sellerTimeout() public nonReentrant {
        if (delivered) revert Delivered();
        if (phase != Phase.Purchased) revert WrongPhase(Phase.Purchased, phase);
        if (block.timestamp <= purchaseTimestamp + SELLER_WINDOW) revert Timeout();
        Phase oldPhase = phase;
        phase = Phase.Expired;
        emit PhaseChanged(oldPhase, phase, block.timestamp); // Emit on phase change
        // Refund buyer: productPrice
        (bool sentBuyer, ) = buyer.call{value: productPrice}("");
        if (!sentBuyer) revert Refund();
        emit FundsTransferred(buyer, productPrice);
        emit SellerTimeout(msg.sender, block.timestamp);
    }

    function bidTimeout() public nonReentrant {
        if (phase != Phase.OrderConfirmed) revert WrongPhase(Phase.OrderConfirmed, phase);
        if (block.timestamp <= orderConfirmedTimestamp + BID_WINDOW) revert Timeout();
        Phase oldPhase = phase;
        phase = Phase.Expired;
        emit PhaseChanged(oldPhase, phase, block.timestamp); // Emit on phase change
        // Refund buyer: productPrice
        (bool sentBuyer, ) = buyer.call{value: productPrice}("");
        if (!sentBuyer) revert Refund();
        emit FundsTransferred(buyer, productPrice);
        // Optionally emit a BidTimeout event if desired
    }

    function withdrawBid() public nonReentrant {
        // Only allow withdrawal before transporter is set and in OrderConfirmed phase
        if (phase != Phase.OrderConfirmed) revert WrongPhase(Phase.OrderConfirmed, phase);
        if (transporter == msg.sender) revert NotTransporter(); // Can't withdraw if already selected
        uint fee = transporters[msg.sender].fee;
        uint deposit = securityDeposits[msg.sender];
        if (fee == 0 && deposit == 0) revert NotRegistered(); // Not an active bid
        // Remove transporter from mapping
        transporters[msg.sender].fee = 0;
        securityDeposits[msg.sender] = 0;
        isTransporter[msg.sender] = false;
        transporterCount--;
        uint refundAmount = deposit;
        if (refundAmount > 0) {
            (bool sent, ) = payable(msg.sender).call{value: refundAmount}("");
            if (!sent) revert Refund();
            emit FundsTransferred(msg.sender, refundAmount);
        }
        emit BidWithdrawn(msg.sender, refundAmount);
    }
}
