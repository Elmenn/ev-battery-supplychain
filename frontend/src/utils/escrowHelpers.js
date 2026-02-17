// src/utils/escrowHelpers.js
// Centralized escrow contract interaction helpers.
// All components should use these instead of creating contract instances directly.

import { Contract, ZeroAddress, formatEther } from "ethers";
import ProductEscrowABI from "../abis/ProductEscrow_Initializer.json";

// ─── Phase Enum ─────────────────────────────────────────────────────────────
// Matches contract: enum Phase { Listed, Purchased, OrderConfirmed, Bound, Delivered, Expired }
// There is NO "Slashed" phase. Slashing is an event within Expired state.
export const Phase = Object.freeze({
  Listed: 0,
  Purchased: 1,
  OrderConfirmed: 2,
  Bound: 3,
  Delivered: 4,
  Expired: 5,
});

export const PHASE_LABELS = Object.freeze({
  [Phase.Listed]: "Listed",
  [Phase.Purchased]: "Purchased",
  [Phase.OrderConfirmed]: "Order Confirmed",
  [Phase.Bound]: "In Delivery",
  [Phase.Delivered]: "Delivered",
  [Phase.Expired]: "Expired",
});

// ─── Time Window Constants (seconds) ────────────────────────────────────────
// Match contract: SELLER_WINDOW = 2 days, BID_WINDOW = 2 days, DELIVERY_WINDOW = 2 days
export const SELLER_WINDOW = 2 * 24 * 60 * 60; // 172800
export const BID_WINDOW = 2 * 24 * 60 * 60;
export const DELIVERY_WINDOW = 2 * 24 * 60 * 60;

// ─── Contract Factory ───────────────────────────────────────────────────────
/**
 * Create an ethers v6 Contract instance for a ProductEscrow clone.
 * @param {string} address - The escrow contract address
 * @param {import("ethers").Signer | import("ethers").Provider} signerOrProvider
 * @returns {import("ethers").Contract}
 */
export function getEscrowContract(address, signerOrProvider) {
  return new Contract(address, ProductEscrowABI.abi, signerOrProvider);
}

// ─── Full State Reader ──────────────────────────────────────────────────────
/**
 * Read ALL product state from an escrow contract in two batched calls.
 * Step 1: Read all scalar fields including id.
 * Step 2: Read mappings that require id (productMemoHashes, productRailgunTxRefs).
 *
 * @param {string} address - The escrow contract address
 * @param {import("ethers").Provider} provider
 * @returns {Promise<Object>} Full product state object
 */
export async function getProductState(address, provider) {
  const contract = getEscrowContract(address, provider);

  // Step 1: Read all scalar fields including id
  const [
    name,
    owner,
    buyer,
    purchased,
    delivered,
    transporter,
    phase,
    vcHash,
    priceCommitment,
    sellerBond,
    bondAmount,
    deliveryFee,
    purchaseTimestamp,
    orderConfirmedTimestamp,
    boundTimestamp,
    productId,
  ] = await Promise.all([
    contract.name(),
    contract.owner(),
    contract.buyer(),
    contract.purchased(),
    contract.delivered(),
    contract.transporter(),
    contract.phase(),
    contract.getVcHash(),
    contract.priceCommitment(),
    contract.sellerBond(),
    contract.bondAmount(),
    contract.deliveryFee(),
    contract.purchaseTimestamp(),
    contract.orderConfirmedTimestamp(),
    contract.boundTimestamp(),
    contract.id(),
  ]);

  // Step 2: Read mappings that require id
  const [memoHash, railgunTxRef] = await Promise.all([
    contract.productMemoHashes(productId),
    contract.productRailgunTxRefs(productId),
  ]);

  return {
    address,
    name,
    owner,
    buyer,
    purchased,
    delivered,
    transporter,
    phase: Number(phase),
    vcHash,
    priceCommitment,
    sellerBond,
    bondAmount,
    deliveryFee,
    purchaseTimestamp: Number(purchaseTimestamp),
    orderConfirmedTimestamp: Number(orderConfirmedTimestamp),
    boundTimestamp: Number(boundTimestamp),
    id: Number(productId),
    memoHash,
    railgunTxRef,
  };
}

// ─── Role Detection ─────────────────────────────────────────────────────────
/**
 * Detect the current user's role relative to a product.
 * @param {Object} product - Product state (from getProductState)
 * @param {string} currentUser - Current wallet address
 * @returns {{ role: "seller" | "buyer" | "transporter" | "visitor" }}
 */
export function detectRole(product, currentUser) {
  if (!currentUser) return { role: "visitor" };

  const user = currentUser.toLowerCase();

  if (product.owner && product.owner.toLowerCase() === user) {
    return { role: "seller" };
  }

  if (
    product.buyer &&
    product.buyer.toLowerCase() !== ZeroAddress.toLowerCase() &&
    product.buyer.toLowerCase() === user
  ) {
    return { role: "buyer" };
  }

  if (
    product.transporter &&
    product.transporter.toLowerCase() !== ZeroAddress.toLowerCase() &&
    product.transporter.toLowerCase() === user
  ) {
    return { role: "transporter" };
  }

  return { role: "visitor" };
}
