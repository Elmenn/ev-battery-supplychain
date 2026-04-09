// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

// Spike scaffold only.
// Expected dependencies once installed in this worktree:
// - @fhevm/solidity
// - @openzeppelin/confidential-contracts

import {FHE, ebool, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IERC7984Receiver} from "@openzeppelin/confidential-contracts/interfaces/IERC7984Receiver.sol";

/// @notice First ERC-7984 spike escrow.
/// @dev This contract only models confidential payment into escrow and seller payout.
contract ConfidentialOrderEscrow is ZamaEthereumConfig, IERC7984Receiver, Ownable, ReentrancyGuard {
    enum OrderPhase {
        None,
        Paid,
        Released,
        Refunded
    }

    struct OrderRecord {
        address buyer;
        address seller;
        address transporter;
        address token;
        euint64 depositedAmount;
        OrderPhase phase;
        uint64 paidAt;
        uint64 releasedAt;
    }

    error UnsupportedToken(address token);
    error OrderAlreadyExists(bytes32 orderId);
    error UnknownOrder(bytes32 orderId);
    error WrongPhase(bytes32 orderId, OrderPhase expected, OrderPhase actual);
    error SellerMismatch(bytes32 orderId, address expectedSeller, address actualSeller);

    event OrderPaid(bytes32 indexed orderId, address indexed buyer, address indexed seller, address token);
    event SellerReleased(bytes32 indexed orderId, address indexed seller);
    event TransporterAssigned(bytes32 indexed orderId, address indexed transporter);

    IERC7984 public immutable paymentToken;
    mapping(bytes32 => OrderRecord) private _orders;

    constructor(address owner_, IERC7984 paymentToken_) Ownable(owner_) {
        paymentToken = paymentToken_;
    }

    function getOrder(bytes32 orderId)
        external
        view
        returns (
            address buyer,
            address seller,
            address transporter,
            address token,
            OrderPhase phase,
            uint64 paidAt,
            uint64 releasedAt
        )
    {
        OrderRecord storage order = _orders[orderId];
        return (
            order.buyer,
            order.seller,
            order.transporter,
            order.token,
            order.phase,
            order.paidAt,
            order.releasedAt
        );
    }

    /// @notice Expected callback payload: abi.encode(bytes32 orderId, address seller)
    function onConfidentialTransferReceived(
        address operator,
        address from,
        euint64 amount,
        bytes calldata data
    ) external override nonReentrant returns (ebool accepted) {
        operator; // unused in slice 1, but kept for future operator-aware flows.

        if (msg.sender != address(paymentToken)) {
            revert UnsupportedToken(msg.sender);
        }

        (bytes32 orderId, address seller) = abi.decode(data, (bytes32, address));
        if (_orders[orderId].phase != OrderPhase.None) {
            revert OrderAlreadyExists(orderId);
        }

        _orders[orderId] = OrderRecord({
            buyer: from,
            seller: seller,
            transporter: address(0),
            token: msg.sender,
            depositedAmount: amount,
            phase: OrderPhase.Paid,
            paidAt: uint64(block.timestamp),
            releasedAt: 0
        });

        emit OrderPaid(orderId, from, seller, msg.sender);

        accepted = FHE.asEbool(true);
        FHE.allowThis(accepted);
        FHE.allow(accepted, msg.sender);
    }

    function assignTransporter(bytes32 orderId, address transporter) external onlyOwner {
        OrderRecord storage order = _orders[orderId];
        if (order.phase == OrderPhase.None) {
            revert UnknownOrder(orderId);
        }
        order.transporter = transporter;
        emit TransporterAssigned(orderId, transporter);
    }

    /// @notice Release the confidential escrowed amount to the seller.
    /// @dev Next iteration can split confidential payouts between seller and transporter.
    function releaseToSeller(bytes32 orderId) external nonReentrant {
        OrderRecord storage order = _orders[orderId];
        if (order.phase == OrderPhase.None) {
            revert UnknownOrder(orderId);
        }
        if (order.phase != OrderPhase.Paid) {
            revert WrongPhase(orderId, OrderPhase.Paid, order.phase);
        }
        if (msg.sender != owner() && msg.sender != order.seller) {
            revert SellerMismatch(orderId, order.seller, msg.sender);
        }

        FHE.allowTransient(order.depositedAmount, address(paymentToken));
        paymentToken.confidentialTransfer(order.seller, order.depositedAmount);

        order.phase = OrderPhase.Released;
        order.releasedAt = uint64(block.timestamp);

        emit SellerReleased(orderId, order.seller);
    }
}
