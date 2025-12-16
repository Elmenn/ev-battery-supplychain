# Delivery TX Hash Commitment Fix - Test Guide

## Overview

This document explains how to test the fix for the delivery TX hash commitment issue. The fix ensures that the TX hash commitment is **always** added to the VC when `commitment` and `proof` exist, regardless of the `verified` status.

## What Was Fixed

**Before:** TX hash commitment was only added to VC if `verified === true`
**After:** TX hash commitment is always added to VC if `commitment && proof` exist

This ensures that:
1. ✅ TX Hash Commitment Verification shows "PRESENT" 
2. ✅ Transaction Verification is "AVAILABLE"

## Test Files

### 1. Unit Test (Frontend)
**File:** `frontend/src/utils/__tests__/deliveryTxHashCommitment.test.js`

**What it tests:**
- TX hash commitment is added even when `verified=false`
- TX hash commitment is added when `verified=true`
- Binding tag is included when provided
- TX hash commitment is NOT added when commitment or proof is missing

**How to run:**
```bash
cd frontend
npm test -- deliveryTxHashCommitment.test.js
```

### 2. Integration Test (Truffle)
**File:** `test/DeliveryTxHashCommitment.test.js`

**What it tests:**
- Full delivery flow with TX hash commitment
- On-chain CID update with TX hash commitment
- Event emission (`DeliveryConfirmedWithCommitment`)
- Binding tag inclusion

**Prerequisites:**
- Ganache or local blockchain running
- ZKP backend running (optional - test will use mocks if unavailable)

**How to run:**
```bash
# Start Ganache (in separate terminal)
ganache-cli

# Start ZKP backend (optional, in separate terminal)
cd zkp-backend
cargo run

# Run the test
truffle test test/DeliveryTxHashCommitment.test.js
```

## Quick Test (No Full Flow Required)

You can verify the fix works by checking the code logic:

1. **Check ProductDetail.jsx** (lines 1355-1419):
   - Look for: `if (commitment && proof)` 
   - Should NOT check `verified` status before adding to VC

2. **Check App.js** (lines 135-179):
   - Should retrieve binding tag from localStorage
   - Should include binding tag in TX hash commitment
   - Should use `updateVcCidAfterDelivery` with commitment

## Expected Test Results

### Unit Test
```
✓ should always add TX hash commitment to VC when commitment and proof exist (even if verified=false)
✓ should add TX hash commitment when verified=true
✓ should include binding tag when provided
✓ should NOT add TX hash commitment when commitment is missing
✓ should NOT add TX hash commitment when proof is missing
```

### Integration Test
```
✓ should always add TX hash commitment to VC when commitment and proof exist (even if verified=false)
✓ should include binding tag when provided
✓ should handle missing commitment or proof gracefully
```

## Manual Verification

After running the full flow, verify:

1. **Check VC from IPFS:**
   ```javascript
   const vc = await fetch(`https://ipfs.io/ipfs/${vcCID}`).then(r => r.json());
   console.log(vc.credentialSubject.txHashCommitment);
   // Should exist with: commitment, proof, protocol, version, encoding, bindingTag
   ```

2. **Check On-Chain Event:**
   ```javascript
   const events = await contract.queryFilter(
     contract.filters.DeliveryConfirmedWithCommitment()
   );
   console.log(events[0].args.txHashCommitment);
   // Should match the commitment in VC
   ```

3. **Check Verification UI:**
   - TX Hash Commitment Verification: Should show "✅ PRESENT"
   - Transaction Verification: Should show "✅ AVAILABLE"

## Troubleshooting

### Test fails: "ZKP backend not available"
- The test will use mock data if ZKP backend is unavailable
- For full testing, start the ZKP backend: `cd zkp-backend && cargo run`

### Test fails: "Contract not deployed"
- Make sure Ganache is running
- Run migrations: `truffle migrate --reset`

### VC doesn't have TX hash commitment
- Check browser console for errors during delivery
- Verify ZKP backend is responding: `curl http://localhost:5010/zkp/commit-tx-hash -X POST -H "Content-Type: application/json" -d '{"tx_hash":"0x..."}'`
- Check that `commitment` and `proof` exist in ZKP response

