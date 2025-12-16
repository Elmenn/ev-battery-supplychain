# Phase 1: Purchase TX Hash Commitment Implementation

## Summary

Implemented hiding of purchase transaction hash to prevent price discovery on Etherscan. The purchase transaction hash is now committed using Bulletproofs and stored in Stage 1 VC (Order Confirmation).

## Changes Made

### 1. Purchase Flow (`handleBuyPublic` in `ProductDetail.jsx`)

**After purchase transaction confirmation:**
- Generate purchase TX hash commitment using ZKP backend
- Store commitment temporarily in `localStorage` with key `purchase_tx_commitment_{contractAddress}`
- Commitment includes: `commitment`, `proof`, `protocol`, `version`, `encoding`
- Also stores `txHash` and `timestamp` for reference (removed before adding to VC)

**Location**: `frontend/src/components/marketplace/ProductDetail.jsx` lines 732-764

### 2. Order Confirmation Flow (`handleConfirmOrder` in `ProductDetail.jsx`)

**When seller confirms order:**
- Retrieve purchase TX hash commitment from `localStorage`
- Extract only commitment fields (exclude `txHash` and `timestamp`)
- Pass to `buildStage2VC` to include in Stage 1 VC
- Clean up `localStorage` after retrieving

**Location**: `frontend/src/components/marketplace/ProductDetail.jsx` lines 832-863

### 3. VC Builder (`buildStage2VC`)

**Updated to accept and store purchase TX hash commitment:**
- Added optional parameter `purchaseTxHashCommitment`
- If provided, stores in `credentialSubject.purchaseTxHashCommitment`
- Preserved in Stage 3 VC via spread operator

**Files**:
- `frontend/src/utils/vcBuilder.js` lines 44-88
- `frontend/src/utils/vcBuilder.mjs` lines 280-326

### 4. Signing (`signVcWithMetamask.js`)

**Excluded from EIP-712 signing:**
- `purchaseTxHashCommitment` is excluded from signing payload (same as `txHashCommitment`)
- Not part of EIP-712 types, so excluded to prevent signing errors

**Location**: `frontend/src/utils/signVcWithMetamask.js` lines 26-29

### 5. Stage 3 VC (`buildStage3VC`)

**Preserves purchase TX hash commitment:**
- Automatically preserved via spread operator `...stage2.credentialSubject`
- No additional changes needed
- Added clarifying comment

**Files**:
- `frontend/src/utils/vcBuilder.js` lines 117-118
- `frontend/src/utils/vcBuilder.mjs` lines 366-367

## Flow Diagram

```
1. Buyer purchases product
   └─> purchasePublic() transaction
   └─> Generate purchase TX hash commitment
   └─> Store in localStorage

2. Seller confirms order
   └─> Retrieve purchase TX hash commitment from localStorage
   └─> Include in Stage 1 VC (buildStage2VC)
   └─> Sign VC (purchaseTxHashCommitment excluded from signing)
   └─> Upload to IPFS
   └─> Update on-chain CID

3. Buyer confirms delivery
   └─> Generate delivery TX hash commitment
   └─> Include in Stage 3 VC (buildStage3VC)
   └─> Stage 3 VC now has:
       - purchaseTxHashCommitment (from Stage 1)
       - txHashCommitment (delivery, new)
```

## Privacy Benefits

### Before Phase 1:
- ❌ Purchase transaction hash visible on Etherscan
- ❌ `msg.value` shows exact product price
- ❌ Anyone can discover price by looking up transaction

### After Phase 1:
- ✅ Purchase transaction hash hidden in commitment
- ✅ Price still hidden (via price commitment)
- ✅ Only commitment visible in VC, not actual hash
- ✅ Verifier can prove knowledge of hash without revealing it

## Verification

The purchase TX hash commitment can be verified using the same ZKP backend endpoint:
- Endpoint: `POST /zkp/verify`
- Payload: `{ commitment, proof }`
- Returns: `{ verified: true/false }`

## Backward Compatibility

- ✅ **Optional**: If purchase TX hash commitment is not available, flow continues normally
- ✅ **Graceful degradation**: If ZKP backend is unavailable, purchase still succeeds
- ✅ **Old VCs**: VCs without `purchaseTxHashCommitment` still work (field is optional)

## Testing Checklist

- [ ] Purchase transaction generates commitment
- [ ] Commitment stored in localStorage
- [ ] Order confirmation retrieves commitment
- [ ] Stage 1 VC includes `purchaseTxHashCommitment`
- [ ] Signing excludes `purchaseTxHashCommitment` (no errors)
- [ ] Stage 3 VC preserves `purchaseTxHashCommitment`
- [ ] Verification works for purchase TX hash commitment
- [ ] Flow works without commitment (backward compatibility)

## Files Modified

1. `frontend/src/components/marketplace/ProductDetail.jsx`
   - `handleBuyPublic`: Generate and store purchase TX hash commitment
   - `handleConfirmOrder`: Retrieve and include purchase TX hash commitment

2. `frontend/src/utils/vcBuilder.js`
   - `buildStage2VC`: Accept and store `purchaseTxHashCommitment`
   - `buildStage3VC`: Preserve `purchaseTxHashCommitment` (via spread)

3. `frontend/src/utils/vcBuilder.mjs`
   - `buildStage2VC`: Accept and store `purchaseTxHashCommitment`
   - `buildStage3VC`: Preserve `purchaseTxHashCommitment` (via spread)

4. `frontend/src/utils/signVcWithMetamask.js`
   - `preparePayloadForSigning`: Exclude `purchaseTxHashCommitment` from signing

## Next Steps

1. **Feature 1 (Transaction Verification)**: Add event-based verification for purchase TX
2. **Feature 2 (Linkable Commitment)**: Add binding tags to link purchase and delivery TX commitments
3. **Verification UI**: Add purchase TX hash commitment verification to auditor UI

