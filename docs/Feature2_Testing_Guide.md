# Feature 2: Linkable Commitment - Testing Guide

## Overview

Feature 2 (Linkable Commitment) uses binding tags to link purchase and delivery TX hash commitments, proving they're related without revealing the actual transaction hashes.

## Prerequisites

Before running the tests, ensure the following services are running:

### 1. Local Blockchain Node (Ganache)

Start Ganache CLI:
```bash
ganache --port 8545 --wallet.totalAccounts 20
```

Or use Ganache GUI and ensure it's running on port 8545.

### 2. ZKP Backend

Start the ZKP backend service:
```bash
cd zkp-backend
cargo run --bin bulletproof-demo
```

The backend should be running on `http://127.0.0.1:5010`.

## Running the Tests

### Run All Tests
```bash
npx truffle test
```

### Run Only Linkable Commitment Tests
```bash
npx truffle test test/LinkableCommitment.test.js
```

### Run with Verbose Output
```bash
npx truffle test test/LinkableCommitment.test.js --verbose-rpc
```

## Test Coverage

The test suite covers:

### ✅ Binding Tag Generation
- Generates binding tag for purchase TX hash commitment
- Generates same binding tag for delivery TX hash commitment
- Binding tags are deterministic and match

### ✅ Purchase TX Hash Commitment with Binding Tag
- Generates purchase TX hash commitment with binding tag
- Verifies commitment with binding tag
- Fails verification with wrong binding tag

### ✅ Delivery TX Hash Commitment with Binding Tag
- Generates delivery TX hash commitment with same binding tag
- Verifies commitment with binding tag

### ✅ Linkable Commitment Verification
- Verifies that binding tags match between purchase and delivery
- Stores binding tags in VCs
- Verifies binding tags match from VCs

### ✅ End-to-End Flow
- Complete flow: purchase → order confirmation → delivery
- All stages preserve binding tags
- Binding tags match throughout the flow

### ✅ Backward Compatibility
- Flow works without binding tags (backward compatible)
- Optional feature doesn't break existing functionality

### ✅ Performance
- Measures binding tag generation time
- Measures commitment generation time
- Ensures reasonable performance

## Expected Test Results

All tests should pass with output similar to:

```
  Contract: Linkable Commitment Feature (Feature 2)
    Binding Tag Generation
      ✓ should generate binding tag for purchase TX hash commitment
      ✓ should generate same binding tag for purchase and delivery
    Purchase TX Hash Commitment with Binding Tag
      ✓ should generate purchase TX hash commitment with binding tag
      ✓ should verify purchase TX hash commitment with binding tag
      ✓ should fail verification with wrong binding tag
    Delivery TX Hash Commitment with Binding Tag
      ✓ should generate delivery TX hash commitment with same binding tag
      ✓ should verify delivery TX hash commitment with binding tag
    Linkable Commitment Verification
      ✓ should verify that binding tags match between purchase and delivery
      ✓ should store binding tags in VCs
      ✓ should verify binding tags match from VCs
    End-to-End Flow
      ✓ should complete full flow with linkable commitments
    Backward Compatibility
      ✓ should work without binding tags (backward compatible)
    Performance
      ✓ should measure binding tag generation and commitment time

  13 passing (Xms)
```

## Manual Testing in Frontend

### Test Flow:

1. **Start all services:**
   - Ganache (port 8545)
   - ZKP backend (port 5010)
   - Frontend (`cd frontend && npm start`)

2. **Purchase Product:**
   - Connect MetaMask to Ganache
   - Navigate to a product
   - Click "Buy Publicly"
   - Confirm transaction
   - **Check**: Console should show "Generated binding tag for purchase TX hash commitment"
   - **Check**: Console should show "Purchase TX hash commitment stored for Stage 1 VC (with binding tag)"
   - **Check**: localStorage should have key `purchase_tx_commitment_{contractAddress}` with `bindingTag` field

3. **Confirm Order (as Seller):**
   - Switch to seller account in MetaMask
   - Click "Confirm Order"
   - **Check**: Console should show "Stored binding tag for delivery TX hash commitment"
   - **Check**: Stage 1 VC uploaded to IPFS should contain `purchaseTxHashCommitment.bindingTag`

4. **Verify VC:**
   - Download Stage 1 VC from IPFS
   - **Check**: `credentialSubject.purchaseTxHashCommitment.bindingTag` exists
   - **Check**: Binding tag is a valid hex string (66 chars with 0x prefix)

5. **Confirm Delivery (as Buyer):**
   - Switch to buyer account
   - Confirm delivery
   - **Check**: Console should show "Using binding tag from purchase for delivery TX hash commitment"
   - **Check**: Stage 3 VC should have `txHashCommitment.bindingTag`
   - **Check**: Binding tag matches the one from purchase

6. **Verify Linkable Commitment:**
   - Download Stage 3 VC from IPFS
   - **Check**: `credentialSubject.purchaseTxHashCommitment.bindingTag` exists
   - **Check**: `credentialSubject.txHashCommitment.bindingTag` exists
   - **Check**: Both binding tags are identical
   - **Check**: Use verification UI to verify binding tags match

## Troubleshooting

### Test Fails: "Couldn't connect to node"
- **Solution**: Start Ganache on port 8545

### Test Fails: "Failed to generate TX hash commitment"
- **Solution**: Start ZKP backend on port 5010

### Test Fails: "Binding tags should match"
- **Solution**: Check that binding tag generation uses same parameters
- **Solution**: Verify addresses are normalized consistently

### Test Fails: "Verification should fail with wrong binding tag"
- **Solution**: This test verifies security - if it fails, binding tags might not be properly enforced

### Frontend: Binding tag not generated
- **Check**: ZKP backend is running and accessible
- **Check**: Browser console for errors
- **Check**: Product ID is available (required for binding tag generation)

### Frontend: Binding tags don't match
- **Check**: Same contract address is used for purchase and delivery
- **Check**: Same buyer address is used
- **Check**: Same product ID is used
- **Check**: Same chain ID is used

## Test File Location

- **Test File**: `test/LinkableCommitment.test.js`
- **Documentation**: `docs/Enhanced_Privacy_Features_Analysis.md`

## Implementation Details

### Binding Tag Generation

Binding tags are generated using:
```javascript
keccak256(
  "tx-hash-bind-v1",
  chainId,
  escrowAddr,
  productId,
  buyerAddress
)
```

This ensures:
- Same binding tag for purchase and delivery (same context)
- Different binding tags for different products/buyers
- Deterministic generation (same inputs = same output)

### Security Properties

1. **Linkage Proof**: Same binding tag proves purchase and delivery are related
2. **Privacy**: Transaction hashes remain hidden
3. **Non-replay**: Binding tags are context-specific
4. **Verification**: Proofs fail with wrong binding tags

## Next Steps After Testing

Once all tests pass:

1. ✅ Feature 2 implementation is complete
2. ⏭️ Proceed with Feature 1 (Transaction Verification) - Event-based verification
3. ⏭️ Consider additional privacy enhancements

