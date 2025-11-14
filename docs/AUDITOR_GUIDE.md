# 🔍 Auditor Guide: How to Verify Product Credentials

This guide provides step-by-step instructions for auditors to verify Verifiable Credentials (VCs) and Zero-Knowledge Proofs (ZKPs) for products in the EV Battery Supply Chain dApp.

---

## 📋 What Can Be Verified?

As an auditor, you can verify:

1. **VC Signature Verification** - Verify that VCs are properly signed by seller and buyer
2. **ZKP Verification** - Verify that the price commitment is valid (price is in allowed range)
3. **Commitment Matching** - Verify that the VC commitment matches the on-chain commitment
4. **VC Chain Integrity** - Verify the complete VC chain from product creation to delivery

---

## 🚀 Quick Start: Using the UI

### Step 1: Access a Product

1. Navigate to the product detail page
2. The product will display its current VC (if available)
3. Click **"View VC"** to see the full Verifiable Credential

### Step 2: Run Verifications

On the VC viewer page, you'll see three verification buttons:

#### ✅ **Verify VC** (EIP-712 Signature Verification)
- **What it does:** Verifies that the VC signatures are valid
- **What it checks:**
  - Seller signature matches the issuer DID
  - Buyer signature matches the holder DID (if present)
  - Signature was created with the correct EIP-712 domain
  - `schemaVersion` and `verifyingContract` are properly bound
- **Expected result:** ✅ "VC Signature: Valid"

#### ✅ **Verify ZKP** (Zero-Knowledge Proof Verification)
- **What it does:** Verifies that the ZKP proof is valid
- **What it checks:**
  - The commitment proves the price is within the allowed range (0 < price < 2^64)
  - The proof is cryptographically valid
  - The binding tag matches the VC context (if present)
- **Expected result:** ✅ "ZKP verified ✔︎ – commitment proves the hidden price is within the allowed range"

#### ✅ **Verify Commitment** (On-Chain Commitment Match)
- **What it does:** Verifies that the VC commitment matches the on-chain commitment
- **What it checks:**
  - VC commitment (`vc.credentialSubject.price.zkpProof.commitment`) matches
  - On-chain commitment (`contract.publicPriceCommitment()`) matches
  - Commitment integrity is maintained
- **Expected result:** ✅ "Commitment verified ✔︎ – the VC matches the escrow's stored commitment"

---

## 📖 Detailed Verification Process

### Verification 1: VC Signature Verification

**Purpose:** Verify that the VC was properly signed by the seller and buyer.

**What Gets Verified:**
- **Issuer Signature:** The seller's signature on the VC
- **Holder Signature:** The buyer's signature (for Stage 2/3 VCs)
- **EIP-712 Domain:** Signature was created with correct domain (includes `verifyingContract` for new VCs)
- **Schema Version:** VC includes `schemaVersion` for schema evolution support

**How It Works:**
1. Extracts the VC payload (without proofs)
2. Recomputes the EIP-712 hash using the same domain and types
3. Recovers the signer address from the signature
4. Compares recovered address with the expected DID address

**What You'll See:**
```
✅ Matching Content: ✅
✅ Matching Signer: ✅
✅ Signature Verified: ✅
```

**If Verification Fails:**
- ❌ **Matching Signer: ❌** - Signature doesn't match expected signer
- ❌ **Signature Verified: ❌** - Signature is invalid or tampered with

---

### Verification 2: ZKP Verification

**Purpose:** Verify that the price commitment is valid without revealing the actual price.

**What Gets Verified:**
- **Proof Validity:** The ZKP proof is cryptographically valid
- **Range Proof:** The committed price is within the allowed range (0 < price < 2^64)
- **Binding Tag:** The proof is bound to the specific VC context (prevents replay/swapping)

**How It Works:**
1. Extracts the ZKP proof from `vc.credentialSubject.price.zkpProof`
2. Sends commitment and proof to the ZKP backend (`/zkp/verify-value-commitment`)
3. Backend verifies the Bulletproofs proof
4. Checks binding tag matches VC context (if present)

**What You'll See:**
```
✅ ZKP verified ✔︎ – commitment proves the hidden price is within the allowed range
```

**What This Means:**
- ✅ The price is valid (not negative, not too large)
- ✅ The commitment is cryptographically sound
- ✅ The proof cannot be forged or replayed

**If Verification Fails:**
- ❌ Proof is invalid or tampered with
- ❌ Commitment doesn't match the proof
- ❌ Binding tag mismatch (proof was swapped/replayed)

---

### Verification 3: Commitment Matching

**Purpose:** Verify that the VC commitment matches the on-chain commitment (immutability check).

**What Gets Verified:**
- **VC Commitment:** The commitment stored in the VC
- **On-Chain Commitment:** The commitment stored on the smart contract
- **Match:** Both commitments are identical

**How It Works:**
1. Reads the commitment from the VC: `vc.credentialSubject.price.zkpProof.commitment`
2. Reads the on-chain commitment: `contract.publicPriceCommitment()`
3. Compares both commitments (normalized to lowercase, no 0x prefix)

**What You'll See:**
```
✅ Commitment verified ✔︎ – the VC matches the escrow's stored commitment
```

**What This Means:**
- ✅ The VC commitment hasn't been tampered with
- ✅ The commitment matches what was stored on-chain at product creation
- ✅ The commitment is immutable (frozen on-chain)

**If Verification Fails:**
- ❌ VC commitment doesn't match on-chain commitment
- ❌ VC may have been tampered with
- ❌ Commitment may have been changed (shouldn't be possible if frozen)

---

## 🔗 Verifying the Complete VC Chain

For a complete audit, verify all VCs in the chain:

### Stage 0/1 VC (Product Listing)
- **Location:** Initial VC created when product is listed
- **Signatures:** Seller only
- **ZKP:** Included (commitment + proof)
- **Verifications:**
  1. ✅ Verify seller signature
  2. ✅ Verify ZKP proof
  3. ✅ Verify commitment matches on-chain

### Stage 2 VC (Order Confirmation)
- **Location:** VC created after buyer purchases
- **Signatures:** Seller only
- **ZKP:** Inherited from Stage 0/1
- **Verifications:**
  1. ✅ Verify seller signature
  2. ✅ Verify `previousCredential` links to Stage 0/1
  3. ✅ Verify commitment matches on-chain

### Stage 3 VC (Delivery Confirmation)
- **Location:** Final VC created after delivery
- **Signatures:** Both seller and buyer
- **ZKP:** Included (commitment + proof)
- **Verifications:**
  1. ✅ Verify seller signature
  2. ✅ Verify buyer signature
  3. ✅ Verify ZKP proof
  4. ✅ Verify commitment matches on-chain
  5. ✅ Verify `previousCredential` links to Stage 2

---

## 🔧 Manual Verification (API/Code)

If you need to verify programmatically or via API:

### API Endpoints

#### 1. Verify VC Signature
```bash
POST http://localhost:5000/api/verify-vc
Content-Type: application/json

{
  "vc": { /* VC JSON object */ },
  "contractAddress": "0x..." // Optional: for verifyingContract binding
}
```

**Response:**
```json
{
  "message": "VC verification complete.",
  "issuer": {
    "matching_vc": true,
    "matching_signer": true,
    "signature_verified": true,
    "recovered_address": "0x...",
    "expected_address": "0x..."
  },
  "holder": {
    "matching_vc": true,
    "matching_signer": true,
    "signature_verified": true,
    "recovered_address": "0x...",
    "expected_address": "0x..."
  }
}
```

#### 2. Verify ZKP Proof
```bash
POST http://localhost:5010/zkp/verify-value-commitment
Content-Type: application/json

{
  "commitment": "0x...",
  "proof": "0x...",
  "binding_tag_hex": "0x..." // Optional: for binding tag verification
}
```

**Response:**
```json
{
  "verified": true
}
```

#### 3. Read On-Chain Commitment
```javascript
// Using ethers.js
const contract = new ethers.Contract(contractAddress, ProductEscrowABI, provider);
const onChainCommitment = await contract.publicPriceCommitment();
```

---

## 📊 Verification Checklist

Use this checklist for a complete audit:

### VC Signature Verification
- [ ] Seller signature is valid
- [ ] Buyer signature is valid (for Stage 2/3)
- [ ] Signatures match expected DIDs
- [ ] EIP-712 domain is correct
- [ ] `schemaVersion` is present (for new VCs)
- [ ] `verifyingContract` matches product contract (for new VCs)

### ZKP Verification
- [ ] ZKP proof is valid
- [ ] Commitment is valid
- [ ] Price is in allowed range (proven by ZKP)
- [ ] Binding tag matches VC context (if present)
- [ ] Proof cannot be replayed/swapped

### Commitment Matching
- [ ] VC commitment matches on-chain commitment
- [ ] Commitment is frozen on-chain (cannot be changed)
- [ ] Commitment integrity is maintained

### VC Chain Integrity
- [ ] Stage 0/1 VC exists and is valid
- [ ] Stage 2 VC links to Stage 0/1 via `previousCredential`
- [ ] Stage 3 VC links to Stage 2 via `previousCredential`
- [ ] All VCs are accessible via IPFS
- [ ] Latest VC CID matches on-chain `vcCid`

---

## 🎯 What Each Verification Proves

### ✅ VC Signature Verification
**Proves:**
- The VC was signed by the claimed seller/buyer
- The VC hasn't been tampered with
- The signature is bound to the specific contract (prevents cross-contract replay)

### ✅ ZKP Verification
**Proves:**
- The price is valid (within allowed range)
- The commitment is cryptographically sound
- The proof is bound to the specific VC context (prevents replay/swapping)

### ✅ Commitment Matching
**Proves:**
- The VC commitment matches the on-chain commitment
- The commitment is immutable (frozen on-chain)
- The VC hasn't been tampered with

---

## ⚠️ Common Issues and Solutions

### Issue: "Signature Verified: ❌"
**Possible Causes:**
- VC was signed with different contract address
- VC is from an old format (missing `schemaVersion`)
- Signature was tampered with

**Solution:**
- Check if VC is old format (no `schemaVersion`) - should still verify
- Verify `verifyingContract` matches the product contract
- Check console logs for detailed error messages

### Issue: "ZKP Verification Failed"
**Possible Causes:**
- Proof is invalid or tampered with
- Binding tag mismatch (proof was swapped)
- ZKP backend is not running

**Solution:**
- Ensure ZKP backend is running (`http://localhost:5010`)
- Check binding tag matches VC context
- Verify proof wasn't swapped between different VCs

### Issue: "Commitment Mismatch"
**Possible Causes:**
- VC commitment doesn't match on-chain commitment
- VC was tampered with
- Commitment was changed (shouldn't be possible if frozen)

**Solution:**
- Verify commitment is frozen on-chain
- Check if VC was modified after creation
- Verify on-chain commitment matches product creation event

---

## 📚 Additional Resources

- **ZKP Technical Background:** `docs/zkp-technical-background.md`
- **VC Architecture:** `docs/zkp-vc-architecture.md`
- **Security Enhancements:** `docs/zkp-security-enhancements-analysis.md`
- **Smart Contract Spec:** `docs/SMART_CONTRACT_SPECIFICATION.md`

---

## 🎓 Understanding the Results

### All Verifications Pass ✅
**Meaning:** The product credential is fully verified and authentic.

**What This Proves:**
- ✅ VC is properly signed by seller and buyer
- ✅ Price commitment is valid (in allowed range)
- ✅ Commitment matches on-chain (immutable)
- ✅ Proof is bound to this specific VC (no replay/swapping)

### Some Verifications Fail ❌
**Meaning:** There may be an issue with the credential.

**What to Check:**
- Review console logs for detailed error messages
- Verify VC wasn't tampered with
- Check if VC is from old format (may need backward compatibility)
- Ensure all services are running (ZKP backend, API)

---

## 💡 Tips for Auditors

1. **Always verify all three checks** - Each verification proves different aspects
2. **Check the VC chain** - Verify all stages (0/1, 2, 3) for complete audit
3. **Review console logs** - Detailed logs explain what each verification does
4. **Verify on-chain data** - Check that commitments are frozen and immutable
5. **Check binding tags** - Ensure proofs are bound to the correct VC context

---

**Last Updated:** After canonical signing implementation
**Version:** 1.0

