# TX Hash Commitment Flow - Complete Guide

## Overview

There are **TWO** separate TX hash commitments in the system:

1. **Purchase TX Hash Commitment** - Generated during purchase, stored in Stage 2 VC
2. **Delivery TX Hash Commitment** - Generated during delivery, stored in Stage 3 VC

Both use the same binding tag to link them together (Feature 2: Linkable Commitment).

---

## 1. Purchase TX Hash Commitment Flow

### When: During Purchase (`handleBuyPublic`)

**Location:** `frontend/src/components/marketplace/ProductDetail.jsx` (lines ~734-797)

**Steps:**
1. Buyer purchases product → Transaction hash is generated
2. Generate binding tag (if productId available):
   ```javascript
   bindingTag = generateTxHashCommitmentBindingTag({
     chainId, escrowAddr, productId, buyerAddress
   })
   ```
3. Call ZKP backend: `POST /zkp/commit-tx-hash` with:
   - `tx_hash`: Purchase transaction hash
   - `binding_tag_hex`: Binding tag (optional)
4. Store in localStorage:
   ```javascript
   localStorage.setItem(`purchase_tx_commitment_${address}`, JSON.stringify({
     commitment, proof, protocol, version, encoding, bindingTag
   }))
   ```
5. Store binding tag separately for delivery:
   ```javascript
   localStorage.setItem(`tx_hash_binding_tag_${address}`, bindingTag)
   ```

### When: During Order Confirmation (`handleConfirmOrder`)

**Location:** `frontend/src/components/marketplace/ProductDetail.jsx` (lines ~866-905)

**Steps:**
1. Seller confirms order
2. Retrieve purchase TX hash commitment from localStorage
3. Include in Stage 2 VC via `buildStage2VC()`:
   ```javascript
   buildStage2VC({
     purchaseTxHashCommitment: { commitment, proof, protocol, version, encoding, bindingTag }
   })
   ```
4. Stage 2 VC now has: `credentialSubject.purchaseTxHashCommitment`

---

## 2. Delivery TX Hash Commitment Flow

### When: During Delivery (`handleConfirmDeliveryClick`)

**Location:** `frontend/src/components/marketplace/ProductDetail.jsx` (lines ~1307-1423)

**Steps:**
1. Buyer confirms delivery → `revealAndConfirmDelivery()` transaction hash is generated
2. Retrieve binding tag from localStorage (same one used for purchase):
   ```javascript
   bindingTag = localStorage.getItem(`tx_hash_binding_tag_${address}`)
   ```
3. Call ZKP backend: `POST /zkp/commit-tx-hash` with:
   - `tx_hash`: Delivery transaction hash
   - `binding_tag_hex`: Same binding tag as purchase
4. Add to Stage 3 VC:
   ```javascript
   canonicalVcObj.credentialSubject.txHashCommitment = {
     commitment, proof, protocol, version, encoding, bindingTag
   }
   ```
5. Re-upload VC to IPFS with TX hash commitment
6. Update on-chain CID: `updateVcCidAfterDelivery(finalCid, txHashCommitmentBytes32)`
   - This function emits `DeliveryConfirmedWithCommitment` event with:
     - `productId`: Product ID
     - `txHashCommitment`: The commitment (for on-chain verification)
     - `buyer`: Buyer address
     - `vcCID`: The final VC CID
   - **This event is what enables on-chain transaction verification (Feature 1)**
7. Stage 3 VC now has:
   - `credentialSubject.purchaseTxHashCommitment` (from Stage 2)
   - `credentialSubject.txHashCommitment` (new, for delivery)

---

## VC Structure

### Stage 2 VC (Order Confirmed)
```json
{
  "credentialSubject": {
    "purchaseTxHashCommitment": {
      "commitment": "0x...",
      "proof": "0x...",
      "protocol": "bulletproofs-pedersen",
      "version": "1.0",
      "encoding": "hex",
      "bindingTag": "0x..."  // Links purchase and delivery
    }
  }
}
```

### Stage 3 VC (Delivery Confirmed)
```json
{
  "credentialSubject": {
    "purchaseTxHashCommitment": { ... },  // Preserved from Stage 2
    "txHashCommitment": {
      "commitment": "0x...",
      "proof": "0x...",
      "protocol": "bulletproofs-pedersen",
      "version": "1.0",
      "encoding": "hex",
      "bindingTag": "0x..."  // Same as purchaseTxHashCommitment.bindingTag
    }
  }
}
```

---

## Verification

### TX Hash Commitment Verification (Privacy)
- **What it checks:** Verifies the ZKP proof for the TX hash commitment
- **Location:** `frontend/src/utils/verifyZKP.js` → `verifyTxHashCommitment()`
- **Process:**
  1. Extracts `credentialSubject.txHashCommitment` from VC
  2. Calls ZKP backend: `POST /zkp/verify` with commitment and proof
  3. Verifies the proof is cryptographically valid
- **Result:** Shows "✅ VALID" if proof verifies, "❌ INVALID" if not

### Transaction Verification (Feature 1) - **ON-CHAIN VERIFICATION**
- **What it checks:** Verifies the transaction exists on-chain and succeeded
- **Location:** `frontend/src/utils/verifyZKP.js` → `verifyTransactionOnChain()`
- **Process:**
  1. Requires `txHashCommitment` to be present in VC
  2. Queries on-chain events: `DeliveryConfirmedWithCommitment`
  3. Matches:
     - Commitment from VC with commitment in event
     - VC CID from VC with vcCID in event
  4. If event found → Transaction exists and succeeded (events only emit on success)
- **On-Chain Event:**
  ```solidity
  event DeliveryConfirmedWithCommitment(
    uint256 indexed productId,
    bytes32 indexed txHashCommitment,  // The commitment from VC
    address indexed buyer,
    string vcCID,                      // The VC CID
    uint256 timestamp
  );
  ```
- **Emitted by:** `updateVcCidAfterDelivery(cid, txHashCommitment)` (line 354 in contract)
- **Result:** Shows "✅ AVAILABLE" if event found, "⚠️ NOT AVAILABLE" if missing

### Binding Tag Verification (Feature 2)
- **What it checks:** Verifies purchase and delivery TX hash commitments are linked
- **Location:** `frontend/src/utils/verifyZKP.js` → `verifyBindingTagsMatch()`
- **Process:**
  1. Extracts `purchaseTxHashCommitment.bindingTag` from VC
  2. Extracts `txHashCommitment.bindingTag` from VC
  3. Compares both tags (should match)
- **Result:** Shows "✅ MATCH" if both tags exist and match, "❌ NO MATCH" if not

---

## Troubleshooting

### Issue: `txHashCommitment` is missing from VC

**Possible causes:**
1. Delivery flow didn't execute (check console for `[Flow][Buyer] Step 6 →` logs)
2. ZKP backend unavailable (check if running at `http://localhost:5010`)
3. Error during ZKP backend call (check console for errors)
4. Old VC (created before fix was applied)

**Solution:**
- Complete a NEW delivery flow after the fix
- Ensure ZKP backend is running
- Check console logs during delivery

### Issue: `purchaseTxHashCommitment` is missing from VC

**Possible causes:**
1. Purchase flow didn't generate it (check console for `[Flow][Buyer] Step 2 →` logs)
2. Seller didn't include it in Stage 2 VC (check `handleConfirmOrder` logs)
3. Old VC (created before purchase TX hash commitment feature)

**Solution:**
- Complete a NEW purchase and order confirmation flow
- Check console logs during purchase and order confirmation

### Issue: Binding tags don't match

**Possible causes:**
1. Binding tag not stored during purchase
2. Binding tag not retrieved during delivery
3. Different binding tags used (should be same for both)

**Solution:**
- Check localStorage for `tx_hash_binding_tag_${address}`
- Verify binding tag is generated with same parameters for both purchase and delivery

---

## Key Files

- **Purchase Flow:** `frontend/src/components/marketplace/ProductDetail.jsx` (lines ~734-797)
- **Order Confirmation:** `frontend/src/components/marketplace/ProductDetail.jsx` (lines ~866-905)
- **Delivery Flow:** `frontend/src/components/marketplace/ProductDetail.jsx` (lines ~1307-1423)
- **VC Builder:** `frontend/src/utils/vcBuilder.mjs` (buildStage2VC, buildStage3VC)
- **Verification:** `frontend/src/components/vc/VerifyVCInline.js`

---

## Testing

Run the test suite:
```bash
# Unit test
cd frontend
npm test -- deliveryTxHashCommitment.test.js

# Integration test
truffle test test/DeliveryTxHashCommitment.test.js
```

