// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Escrow {
    struct EscrowDetails {
        bytes32 amountCommitment; // Confidential amount commitment (changed from uint amount)
        uint deliveryFee;
        uint securityDeposit;
        uint expiryTimeStamp;
        address payable buyer;
        address payable seller;
        address agent;
        address payable transporter;
        bytes32 verificationCodeHash;
        bool delivered;
    }

    uint public transporterCount;

    struct TransporterFees {
        uint fee;
    }

    mapping(address => TransporterFees) public transporters; // Mapping with transporter address as key
    address[] public transporterAddresses; // Array to store transporter addresses

    EscrowDetails public escrow;
    bool public cancelled; // Add cancelled state

    enum Phase { Listed, Funded, Bid, Bound, Delivery, Delivered, Cancelled, Expired }
    Phase public phase;

    uint public depositedAmount;

    modifier onlyBuyer() {
        require(msg.sender == escrow.buyer, "Only the buyer can call this function");
        _;
    }

    modifier onlySeller() {
        require(msg.sender == escrow.seller, "Only the seller can call this function");
        _;
    }

    modifier transporterSet() {
        require(escrow.transporter != address(0), "Transporter needed to call this function");
        _;
    }

    modifier inPhase(Phase _p) {
        require(phase == _p, "Wrong phase");
        _;
    }

    event EscrowCreated(bytes32 indexed amountCommitment, address indexed buyer, address indexed seller); // Added
    event AmountRevealed(uint revealedValue, bytes32 commitment, bool valid); // Added
    event EscrowCancelled(address indexed by, uint timestamp); // Add event
    event PhaseChanged(Phase from, Phase to, uint256 time);
    event Deposit(address indexed from, uint amount);
    event Withdrawal(address indexed to, uint amount);

    constructor(
        address _seller,
        address _agent,
        uint256 secondsTillExpiry,
        bytes32 _amountCommitment
    ) payable {
        escrow = EscrowDetails({
            amountCommitment: _amountCommitment,
            deliveryFee: 0,
            securityDeposit: 0,
            expiryTimeStamp: block.timestamp + secondsTillExpiry,
            buyer: payable(msg.sender),
            seller: payable(_seller),
            agent: _agent,
            transporter: payable(address(0)),
            verificationCodeHash: keccak256(abi.encodePacked("")),
            delivered: false
        });
        phase = Phase.Listed;
        // emit EscrowCreated(_amountCommitment, msg.sender, _seller); // Commented out
    }

    function withdrawAmount() external payable onlySeller transporterSet inPhase(Phase.Delivered) returns (bool) {
        // Example: allow seller to withdraw deposited amount after delivery
        uint amount = depositedAmount;
        require(amount > 0, "No funds to withdraw");
        depositedAmount = 0;
        (bool sent, ) = escrow.seller.call{value: amount}("");
        require(sent, "Withdraw to seller failed");
        emit Withdrawal(escrow.seller, amount);
        return true;
    }

    function setVerificationCode(string calldata verificationCode) external onlySeller {
        escrow.verificationCodeHash = keccak256(abi.encodePacked(verificationCode));
    }

    function delivered(string calldata verificationCode)
        external
        inPhase(Phase.Bound)
        onlyBuyer
        transporterSet
        returns (bool)
    {
        require(
            keccak256(abi.encodePacked(verificationCode)) == escrow.verificationCodeHash,
            "Verification code did not match"
        );
        escrow.delivered = true;
        // payable(escrow.seller).transfer(escrow.amount); // Commented out
        // payable(escrow.transporter).transfer(escrow.amount+escrow.deliveryFee); // Commented out
        emit PhaseChanged(phase, Phase.Delivered, block.timestamp);
        phase = Phase.Delivered;
        return true;
    }

    function hashTester(string calldata verificationCode) pure external returns (bytes32) {
        return keccak256(abi.encodePacked(verificationCode));
    }

    function setTransporter(address payable _transporter) external payable onlySeller inPhase(Phase.Bid) {
        require(msg.value == transporters[_transporter].fee, "Seller needs to deposit delivery fee");
        require(transporters[_transporter].fee != 0, "Transporter address not found in transporters");

        escrow.deliveryFee = msg.value;
        escrow.transporter = _transporter;
        emit PhaseChanged(phase, Phase.Bound, block.timestamp);
        phase = Phase.Bound;
        // Refund logic commented out as amount is not known
        // for (uint i = 0; i < transporterAddresses.length; i++) {
        //     address transporterAddress = transporterAddresses[i];
        //     if (transporterAddress != _transporter) {
        //         payable(transporterAddress).transfer(escrow.amount);
        //     }
        // }
    }

    function createTransporter(uint _feeInEther) public payable {
        // require(msg.value == escrow.amount, "Transporter has to deposit security deposit"); // Commented out
        require(transporters[msg.sender].fee == 0, "Transporter already exists");

        // Convert fee from ether to wei
        uint _feeInWei = _feeInEther * 1 ether;

        transporters[msg.sender] = TransporterFees({
            fee: _feeInWei
        });
        transporterAddresses.push(msg.sender);
        transporterCount++;
    }

    function getAllTransporters() public view returns (address[] memory, uint[] memory) {
        uint[] memory fees = new uint[](transporterAddresses.length);
        for (uint i = 0; i < transporterAddresses.length; i++) {
            address transporterAddress = transporterAddresses[i];
            fees[i] = transporters[transporterAddress].fee;
        }
        return (transporterAddresses, fees);
    }

    // Optional: Helper to verify a revealed value against the commitment (for audit/dispute)
    function verifyRevealedAmount(uint revealedValue, bytes32 blinding) public returns (bool) {
        bytes32 computed = keccak256(abi.encodePacked(revealedValue, blinding));
        bool valid = (computed == escrow.amountCommitment);
        emit AmountRevealed(revealedValue, escrow.amountCommitment, valid);
        return valid;
    }

    function cancel() external onlyBuyer returns (bool) {
        require(phase != Phase.Cancelled, "Already cancelled");
        require(
            phase == Phase.Funded || phase == Phase.Bid,
            "Can only cancel in Funded or Bid phase"
        );
        require(block.timestamp >= escrow.expiryTimeStamp, "Cannot cancel before expiry");

        Phase oldPhase = phase;
        phase = Phase.Cancelled;

        _refundBuyer();                        // 🔑 REFUND EXECUTED HERE

        emit EscrowCancelled(msg.sender, block.timestamp);
        emit PhaseChanged(oldPhase, Phase.Cancelled, block.timestamp);
        return true;
    }


    function deposit() public payable inPhase(Phase.Listed) {
        require(msg.value > 0, "Must send Ether to deposit");
        require(depositedAmount == 0, "Deposit already made");
        depositedAmount = msg.value;
        emit Deposit(msg.sender, msg.value);
        emit PhaseChanged(phase, Phase.Funded, block.timestamp);
        phase = Phase.Funded;
    }

    function _refundBuyer() internal {
        uint amount = depositedAmount;
        if (amount > 0) {
            depositedAmount = 0;
            (bool sent, ) = escrow.buyer.call{value: amount}("");
            require(sent, "Refund to buyer failed");
            emit Withdrawal(escrow.buyer, amount);
        }
    }

    function sellerConfirm() public inPhase(Phase.Funded) onlySeller {
        emit PhaseChanged(phase, Phase.Bid, block.timestamp);
        phase = Phase.Bid;
        // Add any seller confirmation logic here
    }

    function checkTimeouts() public {
        // Only allow in Funded or Bid phase
        if ((phase == Phase.Funded || phase == Phase.Bid) && block.timestamp >= escrow.expiryTimeStamp) {
            Phase oldPhase = phase;
            phase = Phase.Expired;
            _refundBuyer();
            emit PhaseChanged(oldPhase, Phase.Expired, block.timestamp);
        }
    }
}

//event to send verification code to buyer or VCs as verification code

//cancelation from buyer