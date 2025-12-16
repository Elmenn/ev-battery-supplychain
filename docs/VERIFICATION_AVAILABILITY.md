# Verification Availability by Stage

## Overview

Different verification checks become available at different stages of the flow. Here's when each verification can be performed:

---

## Stage 0: Product Listing (Stage 0 VC)

**Available Verifications:**
- ✅ **VC Signatures** - Seller signature
- ✅ **Price ZKP Proof** - Price commitment ZKP verification
- ✅ **On-Chain Commitment Match** - VC commitment vs on-chain commitment

**NOT Available:**
- ❌ Purchase TX hash commitment (not generated yet)
- ❌ Delivery TX hash commitment (not generated yet)
- ❌ Transaction verification (no transaction yet)
- ❌ Binding tag verification (no TX hash commitments yet)

---

## Stage 1: After Purchase (Before Order Confirmation)

**Purchase TX Hash Commitment:**
- Generated and stored in `localStorage`
- **NOT yet in VC** (will be added when seller confirms order)

**Available Verifications:**
- ❌ Purchase TX hash commitment verification (not in VC yet)
- ❌ Transaction verification (no on-chain event for purchase)

**Note:** The purchase TX hash commitment exists but is not yet part of a VC, so it cannot be verified through the VC verification UI.

---

## Stage 2: After Order Confirmation (Stage 2 VC)

**Purchase TX Hash Commitment:**
- ✅ Now included in VC as `credentialSubject.purchaseTxHashCommitment`

**Available Verifications:**
- ✅ **VC Signatures** - Seller and buyer signatures
- ✅ **Price ZKP Proof** - Price commitment ZKP verification
- ✅ **On-Chain Commitment Match** - VC commitment vs on-chain commitment
- ✅ **Purchase TX Hash Commitment Verification** - Can verify the ZKP proof for purchase TX hash commitment
  - The verification UI will automatically detect and verify `purchaseTxHashCommitment` at Stage 2
- ❌ **Purchase Transaction Verification (On-Chain)** - NOT available (no on-chain event for purchase transactions)
  - The UI will show a message explaining this is only available after delivery
- ❌ Delivery TX hash commitment (not generated yet)
- ❌ Delivery transaction verification (not available yet)
- ❌ Binding tag verification (needs both commitments)

**What You Can Verify:**
```javascript
// Purchase TX hash commitment ZKP proof
const purchaseCommitment = extractPurchaseTxHashCommitment(vc);
verifyTxHashCommitment(purchaseCommitment.commitment, purchaseCommitment.proof);
// ✅ This verifies the ZKP proof is valid
// ❌ But cannot verify the transaction on-chain (no event)
```

---

## Stage 3: After Delivery Confirmation (Stage 3 VC)

**Both TX Hash Commitments:**
- ✅ Purchase TX hash commitment: `credentialSubject.purchaseTxHashCommitment`
- ✅ Delivery TX hash commitment: `credentialSubject.txHashCommitment`

**Available Verifications:**
- ✅ **VC Signatures** - Seller and buyer signatures
- ✅ **Price ZKP Proof** - Price commitment ZKP verification
- ✅ **On-Chain Commitment Match** - VC commitment vs on-chain commitment
- ✅ **Purchase TX Hash Commitment Verification** - ZKP proof verification
- ✅ **Delivery TX Hash Commitment Verification** - ZKP proof verification
- ✅ **Delivery Transaction Verification (Feature 1)** - **ON-CHAIN VERIFICATION** ✅
  - Queries `DeliveryConfirmedWithCommitment` event
  - Verifies transaction exists and succeeded
  - Matches commitment and VC CID
- ✅ **Binding Tag Verification (Feature 2)** - Verifies both commitments are linked

**What You Can Verify:**
```javascript
// 1. Purchase TX hash commitment ZKP proof
const purchaseCommitment = extractPurchaseTxHashCommitment(vc);
verifyTxHashCommitment(purchaseCommitment.commitment, purchaseCommitment.proof);
// ✅ Verifies ZKP proof is valid

// 2. Delivery TX hash commitment ZKP proof
const deliveryCommitment = extractTxHashCommitment(vc);
verifyTxHashCommitment(deliveryCommitment.commitment, deliveryCommitment.proof);
// ✅ Verifies ZKP proof is valid

// 3. Delivery transaction on-chain verification (Feature 1)
verifyTransactionOnChain(
  deliveryCommitment.commitment,
  productAddress,
  vcCID,
  provider
);
// ✅ Verifies transaction exists on-chain and succeeded
// ✅ Queries DeliveryConfirmedWithCommitment event

// 4. Binding tag verification (Feature 2)
verifyBindingTagsMatch(purchaseCommitment, deliveryCommitment);
// ✅ Verifies both commitments are linked (same binding tag)
```

---

## Summary Table

| Verification | Stage 0 | After Purchase | Stage 2 (Order Confirmed) | Stage 3 (Delivery Confirmed) |
|-------------|---------|----------------|---------------------------|------------------------------|
| VC Signatures | ✅ | ✅ | ✅ | ✅ |
| Price ZKP Proof | ✅ | ✅ | ✅ | ✅ |
| On-Chain Commitment Match | ✅ | ✅ | ✅ | ✅ |
| Purchase TX Hash Commitment (ZKP) | ❌ | ❌ | ✅ | ✅ |
| Purchase Transaction (On-Chain) | ❌ | ❌ | ❌ | ❌ |
| Delivery TX Hash Commitment (ZKP) | ❌ | ❌ | ❌ | ✅ |
| Delivery Transaction (On-Chain) | ❌ | ❌ | ❌ | ✅ |
| Binding Tag Verification | ❌ | ❌ | ❌ | ✅ |

---

## Key Points

1. **Purchase TX Hash Commitment:**
   - Generated during purchase
   - Added to VC at Stage 2 (order confirmation)
   - Can verify ZKP proof starting at Stage 2
   - **Cannot verify purchase transaction on-chain** (no event emitted for purchase)

2. **Delivery TX Hash Commitment:**
   - Generated during delivery
   - Added to VC at Stage 3 (delivery confirmation)
   - Can verify ZKP proof starting at Stage 3
   - **Can verify delivery transaction on-chain** (Feature 1) - event is emitted

3. **Transaction Verification (Feature 1):**
   - **Only available for delivery transactions**
   - Requires `DeliveryConfirmedWithCommitment` event
   - This event is only emitted when `updateVcCidAfterDelivery()` is called
   - **Not available for purchase transactions** (no equivalent event)

4. **Binding Tag Verification (Feature 2):**
   - Requires both purchase and delivery TX hash commitments
   - Only available at Stage 3 (after delivery)

---

## Answer to Your Question

**"Should I be able to verify after purchase happens or only at the end of the flow at confirm delivery?"**

**Answer:** It depends on what you want to verify:

- **Purchase TX Hash Commitment (ZKP Proof):** ✅ Available after **order confirmation** (Stage 2)
- **Purchase Transaction (On-Chain):** ❌ **NOT available** (no on-chain event for purchase)
- **Delivery TX Hash Commitment (ZKP Proof):** ✅ Available after **delivery confirmation** (Stage 3)
- **Delivery Transaction (On-Chain):** ✅ Available after **delivery confirmation** (Stage 3)
- **Binding Tag Verification:** ✅ Available after **delivery confirmation** (Stage 3)

**Full verification suite (all checks) is only available at Stage 3 (after delivery confirmation).**

