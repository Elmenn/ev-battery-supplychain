# Diagnosis: Verification Failures

## Potential Issues Identified

### Issue #1: Price ZKP Proof Not Preserved (FIXED in App.js)
**Status:** ✅ FIXED
**Location:** `frontend/src/App.js` lines 91-116

**Problem:** The code was using TX hash commitment for price ZKP proof.

**Fix Applied:** Now extracts price ZKP proof from `stage2.credentialSubject.price.zkpProof`

### Issue #2: Price ZKP Proof Missing in Stage2
**Status:** ⚠️ NEEDS CHECKING
**Location:** Where Stage2 VC is created

**Problem:** If `stage2` doesn't have a price ZKP proof, then `priceZkpProof` will be `null`, and the VC won't have a price ZKP proof.

**Check:** Verify that Stage2 VC has `credentialSubject.price.zkpProof` before building Stage3.

### Issue #3: Wrong API Endpoint for TX Hash Verification
**Status:** ⚠️ NEEDS CHECKING
**Location:** `frontend/src/utils/verifyZKP.js` line 66

**Current:** Uses `/zkp/verify` endpoint
**Expected:** Should use `/zkp/verify` (which calls `verify_txid_commitment`)

**Check:** Verify that `/zkp/verify` endpoint uses `verify_txid_commitment` and not `verify_value_commitment`.

### Issue #4: Verification Endpoint Mismatch
**Status:** ⚠️ NEEDS CHECKING
**Location:** `frontend/src/components/vc/VerifyVCInline.js` line 67

**For Price ZKP:** Uses `/zkp/verify-value-commitment`
**For TX Hash:** Uses `/zkp/verify`

**Check:** Make sure these endpoints are correct and handle the right proof types.

## Testing Steps

1. **Open browser console** and run the test HTML file
2. **Check Stage2 VC** - Does it have `credentialSubject.price.zkpProof`?
3. **Check Stage3 VC** - Does it have:
   - `credentialSubject.price.zkpProof` (for price)
   - `credentialSubject.txHashCommitment` (for TX hash)
4. **Check API responses** - Are commitments and proofs valid hex strings?
5. **Check verification endpoints** - Do they return `{verified: true/false}`?

## Quick Fix Checklist

- [x] Fixed App.js to preserve price ZKP proof from stage2
- [ ] Verify stage2 has price ZKP proof
- [ ] Verify stage3 preserves both proofs correctly
- [ ] Test price ZKP verification endpoint
- [ ] Test TX hash commitment verification endpoint
- [ ] Check that commitments are different (price vs TX hash)

