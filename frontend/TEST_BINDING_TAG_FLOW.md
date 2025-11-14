# Binding Tag Flow - Testing Guide

## Overview
This guide helps you test the complete binding tag implementation across the seller and buyer flows.

## Prerequisites
1. ZKP backend running on `http://localhost:5010`
2. Frontend running on `http://localhost:3000`
3. Ganache or Sepolia testnet connection
4. MetaMask connected to the network

## Test Flow

### Step 1: Test Seller Flow (Product Creation)
1. Navigate to the product creation page
2. Fill in product details (Step 1 and Step 2)
3. On Step 3 (Price & VC):
   - Set a price (e.g., 1 ETH)
   - Click "Create Product & Issue VC"
   - **Expected Behavior:**
     - Product is created on-chain
     - Product ID is fetched from contract
     - Binding tag is generated for Stage 0
     - ZKP proof is generated with binding tag
     - VC is created with binding tag and context stored
     - Check browser console for:
       - `✅ Product ID: <number>`
       - `✅ Binding tag generated: 0x<64 hex chars>`

4. **Verify in Browser Console:**
   ```javascript
   // Check VC structure
   const vc = JSON.parse(localStorage.getItem('vcDraft') || '{}');
   console.log('VC Price Object:', vc.credentialSubject?.price);
   const priceObj = JSON.parse(vc.credentialSubject?.price || '{}');
   console.log('Binding Tag:', priceObj.zkpProof?.bindingTag);
   console.log('Binding Context:', priceObj.zkpProof?.bindingContext);
   ```

5. **Expected Results:**
   - Binding tag exists and is 66 characters (0x + 64 hex chars)
   - Binding context contains:
     - `chainId`: Chain ID (e.g., "1337" or "11155111")
     - `escrowAddr`: Product contract address
     - `productId`: Product ID from contract
     - `stage`: 0 (Product Listing)
     - `schemaVersion`: "1.0"

### Step 2: Test Buyer Flow (Delivery Confirmation)
1. Navigate to the product detail page
2. As buyer, purchase the product
3. Set a transporter
4. Click "Request Seller Signature":
   - **Expected Behavior:**
     - Stage 2 VC is fetched from IPFS
     - Product ID is fetched from contract
     - Binding context is extracted from Stage 2 VC (if available)
     - Binding tag is generated for Stage 3 (Stage 2 as previous)
     - ZKP proof is generated with binding tag
     - VC draft is created with binding tag and context
     - Check browser console for:
       - `✅ Product ID: <number>`
       - `✅ Extracted binding context from Stage 2 VC:` or `✅ Created new binding context for Stage 3:`
       - `✅ Binding tag generated for Stage 3: 0x<64 hex chars>`

5. **Verify in Browser Console:**
   ```javascript
   // Check VC draft structure
   const vcDraft = JSON.parse(localStorage.getItem('vcDraft') || '{}');
   console.log('VC Draft Price Object:', vcDraft.credentialSubject?.price);
   const priceObj = JSON.parse(vcDraft.credentialSubject?.price || '{}');
   console.log('Binding Tag:', priceObj.zkpProof?.bindingTag);
   console.log('Binding Context:', priceObj.zkpProof?.bindingContext);
   ```

6. **Expected Results:**
   - Binding tag exists and is 66 characters (0x + 64 hex chars)
   - Binding context contains:
     - `chainId`: Chain ID
     - `escrowAddr`: Product contract address
     - `productId`: Product ID from contract
     - `stage`: 2 (for Stage 3 delivery credential)
     - `schemaVersion`: "1.0"
     - `previousVCCid`: Stage 2 VC CID

### Step 3: Test Binding Tag Verification
1. **Verify Binding Tag Generation:**
   - Seller's binding tag (Stage 0) should be different from buyer's binding tag (Stage 3)
   - Both binding tags should be valid 32-byte hex strings
   - Binding contexts should have correct stage values

2. **Verify ZKP Proof with Binding Tag:**
   - Use the ZKP backend API to verify proofs with binding tags
   - Proofs should verify with correct binding tags
   - Proofs should fail with wrong binding tags

3. **Test API Verification:**
   ```javascript
   // In browser console
   const zkpBackendUrl = 'http://localhost:5010';
   const vc = JSON.parse(localStorage.getItem('vcDraft') || '{}');
   const priceObj = JSON.parse(vc.credentialSubject?.price || '{}');
   const zkpProof = priceObj.zkpProof;
   
   // Verify proof with correct binding tag
   fetch(`${zkpBackendUrl}/zkp/verify-value-commitment`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       commitment: zkpProof.commitment,
       proof: zkpProof.proof,
       binding_tag_hex: zkpProof.bindingTag,
     }),
   })
   .then(r => r.json())
   .then(data => console.log('Verification result:', data));
   ```

4. **Expected Results:**
   - Verification should return `{ verified: true }` with correct binding tag
   - Verification should return `{ verified: false }` with wrong binding tag
   - Verification should return `{ verified: false }` without binding tag

## Test Checklist

### Seller Flow
- [ ] Product creation succeeds
- [ ] Product ID is fetched correctly
- [ ] Binding tag is generated for Stage 0
- [ ] Binding tag is stored in VC
- [ ] Binding context is stored in VC
- [ ] ZKP proof is generated with binding tag
- [ ] VC is uploaded to IPFS
- [ ] VC contains binding tag and context

### Buyer Flow
- [ ] Stage 2 VC is fetched from IPFS
- [ ] Product ID is fetched correctly
- [ ] Binding context is extracted from Stage 2 VC (or created new)
- [ ] Binding tag is generated for Stage 3
- [ ] Binding tag is stored in VC draft
- [ ] Binding context is stored in VC draft
- [ ] ZKP proof is generated with binding tag
- [ ] VC draft contains binding tag and context

### Verification
- [ ] Binding tags are valid 32-byte hex strings
- [ ] Binding contexts have correct values
- [ ] ZKP proofs verify with correct binding tags
- [ ] ZKP proofs fail with wrong binding tags
- [ ] ZKP proofs fail without binding tags
- [ ] Stage 0 binding tag differs from Stage 3 binding tag

## Common Issues

### Issue 1: Binding tag not generated
- **Check:** ZKP backend is running
- **Check:** Network connection to ZKP backend
- **Check:** Browser console for errors

### Issue 2: Binding context not extracted
- **Check:** Stage 2 VC has binding context in price object
- **Check:** Stage 2 VC structure is correct
- **Check:** Browser console for warnings

### Issue 3: ZKP proof verification fails
- **Check:** Binding tag matches between generation and verification
- **Check:** Commitment matches on-chain commitment
- **Check:** ZKP backend is running and accessible

## Next Steps
After successful testing:
1. Update verification component to check binding tag match
2. Add binding tag verification to VC verification flow
3. Update documentation with binding tag details

