# Binding Tag Implementation - Testing Checklist

## Prerequisites
- [ ] ZKP backend running on `http://localhost:5010`
- [ ] Frontend running on `http://localhost:3000`
- [ ] Ganache or Sepolia testnet connection
- [ ] MetaMask connected to the network

## Step 1: Test Seller Flow (Product Creation)

### 1.1 Create Product
- [ ] Navigate to product creation page
- [ ] Fill in product details (Step 1 and Step 2)
- [ ] On Step 3 (Price & VC):
  - [ ] Set a price (e.g., 1 ETH)
  - [ ] Click "Create Product & Issue VC"
  - [ ] Verify product is created on-chain
  - [ ] Verify product ID is fetched from contract
  - [ ] Verify binding tag is generated for Stage 0
  - [ ] Verify ZKP proof is generated with binding tag
  - [ ] Verify VC is created with binding tag and context stored

### 1.2 Verify in Browser Console
- [ ] Open browser console
- [ ] Check for logs:
  - [ ] `✅ Product ID: <number>`
  - [ ] `✅ Binding tag generated: 0x<64 hex chars>`
- [ ] Verify VC structure:
  ```javascript
  const vc = JSON.parse(localStorage.getItem('vcDraft') || '{}');
  const priceObj = JSON.parse(vc.credentialSubject?.price || '{}');
  console.log('Binding Tag:', priceObj.zkpProof?.bindingTag);
  console.log('Binding Context:', priceObj.zkpProof?.bindingContext);
  ```
- [ ] Verify binding tag exists and is 66 characters (0x + 64 hex chars)
- [ ] Verify binding context contains:
  - [ ] `chainId`: Chain ID (e.g., "1337" or "11155111")
  - [ ] `escrowAddr`: Product contract address
  - [ ] `productId`: Product ID from contract
  - [ ] `stage`: 0 (Product Listing)
  - [ ] `schemaVersion`: "1.0"

## Step 2: Test Buyer Flow (Delivery Confirmation)

### 2.1 Request Seller Signature
- [ ] Navigate to product detail page
- [ ] As buyer, purchase the product
- [ ] Set a transporter
- [ ] Click "Request Seller Signature":
  - [ ] Verify Stage 2 VC is fetched from IPFS
  - [ ] Verify product ID is fetched from contract
  - [ ] Verify binding context is extracted from Stage 2 VC (if available)
  - [ ] Verify binding tag is generated for Stage 3 (Stage 2 as previous)
  - [ ] Verify ZKP proof is generated with binding tag
  - [ ] Verify VC draft is created with binding tag and context

### 2.2 Verify in Browser Console
- [ ] Open browser console
- [ ] Check for logs:
  - [ ] `✅ Product ID: <number>`
  - [ ] `✅ Extracted binding context from Stage 2 VC:` or `✅ Created new binding context for Stage 3:`
  - [ ] `✅ Binding tag generated for Stage 3: 0x<64 hex chars>`
- [ ] Verify VC draft structure:
  ```javascript
  const vcDraft = JSON.parse(localStorage.getItem('vcDraft') || '{}');
  const priceObj = JSON.parse(vcDraft.credentialSubject?.price || '{}');
  console.log('Binding Tag:', priceObj.zkpProof?.bindingTag);
  console.log('Binding Context:', priceObj.zkpProof?.bindingContext);
  ```
- [ ] Verify binding tag exists and is 66 characters (0x + 64 hex chars)
- [ ] Verify binding context contains:
  - [ ] `chainId`: Chain ID
  - [ ] `escrowAddr`: Product contract address
  - [ ] `productId`: Product ID from contract
  - [ ] `stage`: 2 (for Stage 3 delivery credential)
  - [ ] `schemaVersion`: "1.0"
  - [ ] `previousVCCid`: Stage 2 VC CID

## Step 3: Test ZKP Verification

### 3.1 Verify ZKP Proof with Binding Tag
- [ ] Use the ZKP backend API to verify proofs with binding tags
- [ ] Verify proofs verify with correct binding tags
- [ ] Verify proofs fail with wrong binding tags
- [ ] Verify proofs fail without binding tags (if proof was generated with binding tag)

### 3.2 Test API Verification
- [ ] In browser console, run:
  ```javascript
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
- [ ] Verify result is `{ verified: true }` with correct binding tag
- [ ] Verify result is `{ verified: false }` with wrong binding tag
- [ ] Verify result is `{ verified: false }` without binding tag

## Step 4: Test Verification Component

### 4.1 Verify VC
- [ ] Navigate to product detail page
- [ ] Click "Verify VC" button
- [ ] Verify VC verification succeeds
- [ ] Verify VC verification shows issuer and holder information

### 4.2 Verify ZKP
- [ ] Click "Verify ZKP" button
- [ ] Verify ZKP verification succeeds with binding tag
- [ ] Verify ZKP verification shows "ZKP Proof is valid"
- [ ] Check browser console for:
  - [ ] `✅ ZKP verification with binding tag: 0x<64 hex chars>`

### 4.3 Verify Commitment Match
- [ ] Click "Verify Commitment" button
- [ ] Verify commitment match succeeds
- [ ] Verify commitment match shows "✅ Commitment matches on-chain commitment"
- [ ] Verify commitment match shows VC commitment and on-chain commitment

## Step 5: Test Quick Test Script

### 5.1 Run Quick Test Script
- [ ] Open browser console
- [ ] Copy and paste the contents of `frontend/QUICK_TEST_BINDING_TAG.js`
- [ ] Run the test script
- [ ] Verify all tests pass:
  - [ ] Test 1: Check VC structure
  - [ ] Test 2: Verify ZKP proof with binding tag
  - [ ] Test 3: Verify ZKP proof with wrong binding tag (should fail)
  - [ ] Test 4: Verify ZKP proof without binding tag (should fail)

## Test Results Summary

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
- [ ] VC verification succeeds
- [ ] ZKP verification succeeds with binding tag
- [ ] Commitment match verification succeeds

## Common Issues

### Issue 1: Binding tag not generated
- **Check:** ZKP backend is running
- **Check:** Network connection to ZKP backend
- **Check:** Browser console for errors
- **Check:** Product ID is fetched correctly

### Issue 2: Binding context not extracted
- **Check:** Stage 2 VC has binding context in price object
- **Check:** Stage 2 VC structure is correct
- **Check:** Browser console for warnings

### Issue 3: ZKP proof verification fails
- **Check:** Binding tag matches between generation and verification
- **Check:** Commitment matches on-chain commitment
- **Check:** ZKP backend is running and accessible
- **Check:** Binding tag is included in verification request

## Next Steps
After successful testing:
1. Update documentation with binding tag details
2. Add binding tag verification to VC verification flow
3. Add binding tag display to VC viewer
4. Update user documentation with binding tag information

