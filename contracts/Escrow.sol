// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Escrow {
    struct EscrowDetails {
        uint amount;
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

    modifier onlyBuyer() {
        require(msg.sender == escrow.buyer, "Only the buyer can call this function");
        _; // Continue executing the function after the modifier's checks pass
    }

    modifier onlySeller() {
        require(msg.sender == escrow.seller, "Only the seller can call this function");
        _; // Continue executing the function after the modifier's checks pass
    }

    modifier transporterSet() {
        require(escrow.transporter != address(0), "Transporter needed to call this function");
        _;
    }

    constructor(
        address payable _seller,
        address _agent,
        uint256 secondsTillExpiry
    //item Id to sell multiple things
    ) payable {
        escrow = EscrowDetails({
            amount: msg.value,
            deliveryFee: 0, // Initialize to default value
            securityDeposit: 0, // Initialize to default value
            expiryTimeStamp: block.timestamp + secondsTillExpiry,
            buyer: payable(msg.sender),
            seller: payable(_seller),
            agent: _agent,
            transporter: payable(address(0)), // Initialize transporter to zero address
            verificationCodeHash: keccak256(abi.encodePacked("")), // verification code is set to empty string by default
            delivered: false
        });
    }

    function withdrawAmount() external payable onlySeller transporterSet returns (bool) {
        require(
            escrow.delivered == true,
            "Funds can only be withdrawn by the seller after delivery confirmation"
        );
        payable(msg.sender).transfer(escrow.amount);
        return true;
    }

    function setVerificationCode(string calldata verificationCode) external onlySeller {
        escrow.verificationCodeHash = keccak256(abi.encodePacked(verificationCode));
    }

    function delivered(string calldata verificationCode) external onlyBuyer transporterSet returns (bool) {
        require(
            keccak256(abi.encodePacked(verificationCode)) == escrow.verificationCodeHash,
            "Verification code did not match"
        );
        escrow.delivered = true;
        payable(escrow.seller).transfer(escrow.amount);
        payable(escrow.transporter).transfer(escrow.amount+escrow.deliveryFee);
        return true;
    }

    function hashTester(string calldata verificationCode) pure external returns (bytes32) {
        return keccak256(abi.encodePacked(verificationCode));
    }

    function setTransporter(address payable _transporter) external payable onlySeller {
        require(msg.value == transporters[_transporter].fee, "Seller needs to deposit delivery fee");
        require(transporters[_transporter].fee != 0, "Transporter address not found in transporters");

        escrow.deliveryFee = msg.value;
        escrow.transporter = _transporter;
        // Refund all other transporters
        for (uint i = 0; i < transporterAddresses.length; i++) {
            address transporterAddress = transporterAddresses[i];
            if (transporterAddress != _transporter) {
                payable(transporterAddress).transfer(escrow.amount);
            }
        }
    }

    function createTransporter(uint _feeInEther) public payable {
        require(msg.value == escrow.amount, "Transporter has to deposit security deposit");
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

}

//event to send verification code to buyer or VCs as verification code

//cancelation from buyer