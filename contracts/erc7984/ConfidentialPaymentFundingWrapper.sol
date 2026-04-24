// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ConfidentialOrderToken} from "./ConfidentialOrderToken.sol";

error ZeroDepositAmount();
error DepositAmountTooLarge(uint256 amount);
error ZeroRedeemAmount();
error RedeemAmountTooLarge(uint256 amount);
error InsufficientPublicLiquidity(uint256 requested, uint256 available);

/// @notice Wraps a public ERC-20 funding asset into the confidential ERC-7984 payment token.
/// @dev The wrapper must own the confidential token contract so it can mint on successful public deposits.
contract ConfidentialPaymentFundingWrapper is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable publicToken;
    ConfidentialOrderToken public immutable confidentialToken;

    event ConfidentialBalanceFunded(
        address indexed account,
        uint256 publicAmount,
        uint64 confidentialAmount
    );
    event ConfidentialBalanceRedeemed(
        address indexed account,
        uint256 publicAmount,
        uint64 confidentialAmount
    );

    constructor(
        address owner_,
        IERC20 publicToken_,
        ConfidentialOrderToken confidentialToken_
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

    function redeem(uint256 amount) external nonReentrant returns (uint64 burnedAmount) {
        if (amount == 0) revert ZeroRedeemAmount();
        if (amount > type(uint64).max) revert RedeemAmountTooLarge(amount);

        uint256 available = publicToken.balanceOf(address(this));
        if (available < amount) revert InsufficientPublicLiquidity(amount, available);

        burnedAmount = uint64(amount);
        confidentialToken.burnFromPublicAmount(msg.sender, burnedAmount);
        publicToken.safeTransfer(msg.sender, amount);

        emit ConfidentialBalanceRedeemed(msg.sender, amount, burnedAmount);
    }

    function availablePublicLiquidity() external view returns (uint256) {
        return publicToken.balanceOf(address(this));
    }
}
