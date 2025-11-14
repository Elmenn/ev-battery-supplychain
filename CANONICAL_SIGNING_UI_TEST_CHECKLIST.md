# 🧪 Canonical Signing UI Test Checklist

## What to Test: `schemaVersion` and `verifyingContract`

This guide helps you verify that the new canonical signing features are working correctly in the UI.

---

## ✅ Test Flow Overview

1. **Product Creation (Stage 0 VC)** - Seller creates a product
2. **Purchase (Stage 2 VC)** - Buyer purchases, seller confirms
3. **Delivery (Stage 3 VC)** - Buyer confirms delivery
4. **Verification** - Verify VCs with contract binding

---

## 🔍 Step 1: Product Creation (Stage 0 VC)

### What to Check:

1. **Open Browser Console** (F12) and look for:
   ```
   [Flow][Seller] Step 3: Generating binding commitment via ZKP backend.
   [Flow][Seller] Step 4: Writing public price + commitment to escrow.
   [Flow][Seller] Step 5: Uploading Stage 0 VC to IPFS.
   ```

2. **After product creation, inspect the VC:**
   - Go to the product detail page
   - Click "View VC" or expand the VC section
   - **Check the VC JSON structure:**
     ```json
     {
       "schemaVersion": "1.0",  // ✅ MUST be present
       "@context": [...],
       "type": [...],
       "issuer": {...},
       "holder": {...},
       "credentialSubject": {...},
       "proof": {
         "type": "EcdsaSecp256k1Signature2019",
         "created": "...",
         "proofPurpose": "assertionMethod",
         "verificationMethod": "...",
         "jws": "..."  // ✅ Signature should be present
       }
     }
     ```

3. **Verify in Console:**
   - Look for any errors related to signing
   - The VC should upload to IPFS successfully
   - The CID should be stored on-chain

---

## 🔍 Step 2: Purchase & Order Confirmation (Stage 2 VC)

### What to Check:

1. **As Buyer:**
   - Click "Buy Product" (public purchase)
   - **Console should show:**
     ```
     [Flow][Buyer] Step 1: Initiating public purchase...
     [Flow][Buyer] Step 2 → Transaction sent, hash: 0x...
     ```

2. **As Seller (after purchase):**
   - Click "Confirm Order"
   - **Console should show:**
     ```
     [Flow][Seller] Step 3: Seller confirming order and issuing Stage 2 VC.
     ```

3. **Inspect Stage 2 VC:**
   - View the VC on the product detail page
   - **Check for:**
     ```json
     {
       "schemaVersion": "1.0",  // ✅ MUST be present (inherited from Stage 0)
       "credentialSubject": {
         "previousCredential": "ipfs://...",  // ✅ Link to Stage 0
         ...
       },
       "proof": {
         "jws": "..."  // ✅ Seller signature
       }
     }
     ```

---

## 🔍 Step 3: Delivery Confirmation (Stage 3 VC)

### What to Check:

1. **As Buyer:**
   - Click "Confirm Delivery"
   - **Console should show:**
     ```
     [Flow][Buyer] Step 4: Buyer confirming delivery and issuing Stage 3 VC.
     ```

2. **Inspect Stage 3 VC:**
   - View the VC
   - **Check for:**
     ```json
     {
       "schemaVersion": "1.0",  // ✅ MUST be present (inherited from Stage 2)
       "credentialSubject": {
         "previousCredential": "ipfs://...",  // ✅ Link to Stage 2
         ...
       },
       "proof": {
         "jws": "..."  // ✅ Buyer signature
       }
     }
     ```

---

## 🔍 Step 4: Verification (Most Important!)

### What to Check:

1. **On any VC (Stage 0, 2, or 3):**
   - Click "Verify ZKP" button
   - **Console should show:**
     ```
     [Flow][Audit] Running ZKP verification for listing VC (Stage 0).
     [Flow][Audit] ZKP verified ✔︎ – commitment proves the hidden price is within the allowed range...
     ```

2. **Click "Verify Commitment" button:**
   - **Console should show:**
     ```
     [Flow][Audit] Running commitment verification...
     [Flow][Audit] Commitment verified ✔︎ – on-chain commitment matches VC commitment.
     ```

3. **Click "Verify VC" button (EIP-712 signature verification):**
   - **This is where `verifyingContract` is tested!**
   - **Console should show:**
     ```
     ✅ VC signature verified successfully
     ```
   - **If verification fails, you'll see:**
     ```
     ❌ VC signature verification failed: [error message]
     ```

4. **Check the verification result:**
   - Should show: ✅ **"VC Signature: Valid"**
   - The verification uses the **contract address** as `verifyingContract`
   - This prevents cross-contract replay attacks

---

## 🧪 Advanced Testing: Cross-Contract Replay Prevention

### Test that `verifyingContract` prevents replay:

1. **Create Product A** (contract address: `0xAAA...`)
   - Note the VC signature (jws)

2. **Create Product B** (contract address: `0xBBB...`)
   - Try to use Product A's VC signature
   - **Expected:** Verification should **FAIL** ❌
   - **Why:** Different `verifyingContract` = different EIP-712 domain = different signature

3. **Verify Product A's VC with Product A's contract:**
   - **Expected:** Verification should **PASS** ✅

---

## 🔍 What to Look For in Console Logs

### ✅ Success Indicators:

```
✅ VC signature verified successfully
✅ ZKP verified ✔︎
✅ Commitment verified ✔︎
[Flow][Seller] Step 5: Uploading Stage 0 VC to IPFS.
[Flow][Audit] Running ZKP verification...
[Flow][Audit] Running commitment verification...
```

### ❌ Error Indicators to Watch For:

```
❌ VC signature verification failed
❌ Error: invalid string value (argument="str", value=null)
❌ Error: Missing required field: schemaVersion
❌ Error: verifyingContract mismatch
❌ Failed to sign VC
```

---

## 📋 Quick Verification Checklist

- [ ] **Stage 0 VC** has `schemaVersion: "1.0"`
- [ ] **Stage 2 VC** has `schemaVersion: "1.0"` (inherited)
- [ ] **Stage 3 VC** has `schemaVersion: "1.0"` (inherited)
- [ ] **All VCs** have valid `proof.jws` signatures
- [ ] **"Verify VC"** button works and shows ✅
- [ ] **"Verify ZKP"** button works and shows ✅
- [ ] **"Verify Commitment"** button works and shows ✅
- [ ] **No console errors** during signing or verification
- [ ] **Cross-contract replay prevention** works (VC from Product A fails on Product B)

---

## 🐛 Common Issues & Solutions

### Issue: "VC signature verification failed"
- **Cause:** `verifyingContract` mismatch or missing `schemaVersion`
- **Fix:** Ensure the VC was signed with the correct contract address

### Issue: "Missing required field: schemaVersion"
- **Cause:** Old VC format (backward compatibility should handle this)
- **Fix:** The code should auto-add `schemaVersion: "1.0"`, but if it doesn't, check the VC builder

### Issue: "Error: invalid string value"
- **Cause:** Missing required EIP-712 fields (certificateCredential, etc.)
- **Fix:** Should be auto-handled by `preparePayloadForSigning`, but check console for details

---

## 📝 Notes

- **`schemaVersion`** is automatically added if missing (defaults to "1.0")
- **`verifyingContract`** is automatically included in the EIP-712 domain when signing
- **Backward compatibility:** Old VCs without `schemaVersion` should still work
- **All verification** should use the product's contract address for `verifyingContract`

---

## 🎯 Expected Behavior Summary

1. ✅ All VCs include `schemaVersion: "1.0"`
2. ✅ All signatures include `verifyingContract` in EIP-712 domain
3. ✅ Verification passes when VC matches the contract
4. ✅ Verification fails when VC is from a different contract (replay prevention)
5. ✅ No console errors during signing or verification
6. ✅ All three verification buttons work correctly

---

**Happy Testing! 🚀**

