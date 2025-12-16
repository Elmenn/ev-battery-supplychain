# Step 7: Bug Fixes Identified

## 🐛 Bug #1: TX Hash Commitment Used for Price ZKP Proof (FIXED)

**Location:** `frontend/src/App.js` lines 103-109

**Problem:** The code was using the TX hash commitment's `commitment` and `proof` for the `zkpProof` field, which should be for the price commitment, not the TX hash commitment.

**Before (WRONG):**
```javascript
zkpProof: {
  protocol: "bulletproofs-pedersen",
  version: "1.0",
  commitment,  // ❌ This is TX hash commitment, not price commitment!
  proof,       // ❌ This is TX hash proof, not price proof!
  encoding: "hex",
},
```

**After (FIXED):**
```javascript
// Extract price ZKP proof from stage2 (if it exists)
let priceZkpProof = null;
try {
  const stage2Price = typeof stage2.credentialSubject?.price === 'string' 
    ? JSON.parse(stage2.credentialSubject.price) 
    : stage2.credentialSubject?.price;
  if (stage2Price?.zkpProof) {
    priceZkpProof = stage2Price.zkpProof;
  }
} catch (e) {
  console.warn("Could not extract price ZKP proof from stage2:", e);
}

// Then use it:
zkpProof: priceZkpProof, // ✅ Use price ZKP proof from stage2
```

**Impact:** This would cause:
- Price ZKP verification to fail (wrong commitment/proof)
- TX hash commitment verification might work, but price verification would fail
- Both verifications would fail if the wrong proof is used

## 🔍 Potential Issues to Check:

1. **Missing Price ZKP Proof in Stage2:** If `stage2` doesn't have a price ZKP proof, `priceZkpProof` will be `null`, and the VC won't have a price ZKP proof. This might be expected for some flows.

2. **ProductDetail.jsx Flow:** The `ProductDetail.jsx` flow builds the VC before the transaction, so it should already have the price ZKP proof. The TX hash commitment is added after the transaction, which is correct.

3. **Verification Endpoints:** Make sure `/zkp/verify` is the correct endpoint for TX hash commitments (it should be, as it uses `verify_txid_commitment`).

## ✅ Testing Checklist:

- [ ] Test that price ZKP proof is preserved from stage2
- [ ] Test that TX hash commitment is separate from price ZKP proof
- [ ] Test that price ZKP verification still works
- [ ] Test that TX hash commitment verification works
- [ ] Test that both verifications can pass simultaneously

