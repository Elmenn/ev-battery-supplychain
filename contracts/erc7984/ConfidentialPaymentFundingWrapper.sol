// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MockConfidentialOrderToken} from "./MockConfidentialOrderToken.sol";

error ZeroDepositAmount();
error DepositAmountTooLarge(uint256 amount);

/// @notice Wraps a public ERC-20 funding asset into the confidential ERC-7984 payment token.
/// @dev The wrapper must own the confidential token contract so it can mint on successful public deposits.
contract ConfidentialPaymentFundingWrapper is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable publicToken;
    MockConfidentialOrderToken public immutable confidentialToken;

    event ConfidentialBalanceFunded(
        address indexed account,
        uint256 publicAmount,
        uint64 confidentialAmount
    );

    constructor(
        address owner_,
        IERC20 publicToken_,
        MockConfidentialOrderToken confidentialToken_
    ) Ownable(owner_) {
        publicToken = publicToken_;
        confidentialToken = confidentialToken_;
    }

    function deposit(uint256 amount) external nonReentrant returns (uint64 mintedAmount) {
        if (amount == 0) revert ZeroDepositAmount();
        if (amount > type(uint64).max) revert DepositAmountTooLarge(amount);

        mintedAmount = uint64(amount);
        publicToken.safeTransferFrom(msg.sender, address(this), amount);
        confidentialToken.mintFromPublicAmount(msg.sender, mintedAmount);

        emit ConfidentialBalanceFunded(msg.sender, amount, mintedAmount);
    }
}
