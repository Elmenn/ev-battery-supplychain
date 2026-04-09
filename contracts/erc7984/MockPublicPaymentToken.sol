// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Public ERC-20 funding asset for the ERC-7984 spike.
/// @dev Decimals are fixed at 0 so browser and escrow examples can keep using whole-unit amounts like 100 and 15.
contract MockPublicPaymentToken is ERC20, Ownable {
    uint256 public constant FAUCET_MAX = 1000;

    constructor(address owner_) ERC20("Mock Public Payment Token", "MPPT") Ownable(owner_) {}

    function decimals() public pure override returns (uint8) {
        return 0;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function faucet(uint256 amount) external {
        require(amount > 0 && amount <= FAUCET_MAX, "Invalid faucet amount");
        _mint(msg.sender, amount);
    }
}
