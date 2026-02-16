// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IProductEscrow {
    function confirmDelivery(bytes32 hash) external;
    function withdrawBid() external;
    function deliveryTimeout() external;
    function sellerTimeout() external;
    function bidTimeout() external;
    function createTransporter(uint256 _feeInWei) external payable;
    function setTransporter(address payable _transporter) external payable;
}

contract MaliciousReentrant {
    IProductEscrow public escrow;
    bool public attackInProgress;
    uint public attackType; // 1 = reenter confirmDelivery, 2 = reenter withdrawBid, 3 = reenter deliveryTimeout
    bytes32 public deliveryHash;

    constructor(address _escrow) {
        escrow = IProductEscrow(_escrow);
    }

    // Set up for confirmDelivery reentrancy
    function attackDelivery(bytes32 _hash) external {
        deliveryHash = _hash;
        attackType = 1;
        attackInProgress = true;
        // This should revert if reentrancy is blocked
        escrow.confirmDelivery(_hash);
        attackInProgress = false;
    }

    // Set up for withdrawBid reentrancy
    function attackWithdrawBid() external {
        attackType = 2;
        attackInProgress = true;
        escrow.withdrawBid();
        attackInProgress = false;
    }

    // Set up for deliveryTimeout reentrancy
    function attackDeliveryTimeout() external {
        attackType = 3;
        attackInProgress = true;
        escrow.deliveryTimeout();
        attackInProgress = false;
    }

    // Helper: register this contract as a transporter
    function registerAsTransporter(uint _feeInWei) external payable {
        escrow.createTransporter{value: msg.value}(_feeInWei);
    }

    // Fallback to attempt reentrancy when receiving ETH
    fallback() external payable {
        if (attackInProgress) {
            if (attackType == 1) {
                try escrow.confirmDelivery(deliveryHash) {} catch {}
            } else if (attackType == 2) {
                try escrow.withdrawBid() {} catch {}
            } else if (attackType == 3) {
                try escrow.deliveryTimeout() {} catch {}
            }
        }
    }

    // Receive function to attempt reentrancy when receiving ETH
    receive() external payable {
        if (attackInProgress) {
            if (attackType == 1) {
                try escrow.confirmDelivery(deliveryHash) {} catch {}
            } else if (attackType == 2) {
                try escrow.withdrawBid() {} catch {}
            } else if (attackType == 3) {
                try escrow.deliveryTimeout() {} catch {}
            }
        }
    }
}
