// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IProductEscrow {
    function revealAndConfirmDelivery(uint revealedValue, bytes32 blinding, string calldata vcCID) external;
    function withdrawBid() external;
    function timeout() external;
    function createTransporter(uint _feeInWei) external;
    function securityDeposit() external payable;
    function setTransporter(address payable _transporter) external payable;
}

contract MaliciousReentrant {
    IProductEscrow public escrow;
    bool public attackInProgress;
    uint public attackType; // 1 = reenter reveal, 2 = call timeout, 3 = reenter withdrawBid
    uint public value;
    bytes32 public blinding;
    string public vcCID;

    constructor(address _escrow) {
        escrow = IProductEscrow(_escrow);
    }

    // Set up for reveal reentrancy
    function attackReveal(uint _value, bytes32 _blinding, string calldata _vcCID) external {
        value = _value;
        blinding = _blinding;
        vcCID = _vcCID;
        attackType = 1;
        attackInProgress = true;
        // This should revert if reentrancy is blocked
        escrow.revealAndConfirmDelivery(_value, _blinding, _vcCID);
        attackInProgress = false;
    }

    // Set up for withdrawBid reentrancy
    function attackWithdrawBid() external {
        attackType = 3;
        attackInProgress = true;
        escrow.withdrawBid();
        attackInProgress = false;
    }

    // Helper functions to register this contract as a transporter
    // These are called from an EOA to set up the malicious contract
    function registerAsTransporter(uint _feeInWei) external {
        escrow.createTransporter(_feeInWei);
    }

    function makeSecurityDeposit() external payable {
        escrow.securityDeposit{value: msg.value}();
    }

    // Fallback to attempt reentrancy
    fallback() external payable {
        if (attackInProgress) {
            if (attackType == 1) {
                // Try to re-enter revealAndConfirmDelivery
                try escrow.revealAndConfirmDelivery(value, blinding, vcCID) {} catch {}
            } else if (attackType == 2) {
                // Try to call timeout
                try escrow.timeout() {} catch {}
            } else if (attackType == 3) {
                // Try to re-enter withdrawBid
                try escrow.withdrawBid() {} catch {}
            }
        }
    }
    
    // Receive function to attempt reentrancy when receiving ETH
    receive() external payable {
        if (attackInProgress) {
            if (attackType == 1) {
                // Try to re-enter revealAndConfirmDelivery
                try escrow.revealAndConfirmDelivery(value, blinding, vcCID) {} catch {}
            } else if (attackType == 2) {
                // Try to call timeout
                try escrow.timeout() {} catch {}
            } else if (attackType == 3) {
                // Try to re-enter withdrawBid
                try escrow.withdrawBid() {} catch {}
            }
        }
    }
} 