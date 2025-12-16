# Phase 1: Purchase TX Hash Commitment - Testing Guide

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

### Run Only Purchase TX Hash Commitment Tests
```bash
npx truffle test test/PurchaseTxHashCommitment.test.js
```

### Run with Verbose Output
```bash
npx truffle test test/PurchaseTxHashCommitment.test.js --verbose-rpc
```

## Test Coverage

The test suite covers:

### ✅ Purchase TX Hash Commitment Generation
- Generates commitment after purchase transaction
- Verifies commitment proof

### ✅ Stage 1 VC (Order Confirmation)
- Includes purchase TX hash commitment in Stage 1 VC
- Does NOT include actual transaction hash (privacy preserved)

### ✅ Stage 2 VC (Delivery) - Preservation
- Preserves purchase TX hash commitment from Stage 1

### ✅ EIP-712 Signing
- Excludes `purchaseTxHashCommitment` from signing payload
- Other fields are preserved

### ✅ Backward Compatibility
- Flow works without purchase TX hash commitment
- Optional field doesn't break existing functionality

### ✅ End-to-End Flow
- Complete flow: purchase → order confirmation → delivery
- All stages preserve purchase TX hash commitment

### ✅ Performance
- Measures commitment generation time
- Ensures reasonable performance (< 1 second per generation)

## Expected Test Results

All tests should pass with output similar to:

```
  Contract: Purchase TX Hash Commitment Feature (Phase 1)
    Purchase TX Hash Commitment Generation
      ✓ should generate purchase TX hash commitment after purchase
      ✓ should verify purchase TX hash commitment proof
    Stage 1 VC (Order Confirmation)
      ✓ should include purchase TX hash commitment in Stage 1 VC
      ✓ should not include actual transaction hash in Stage 1 VC
    Stage 2 VC (Delivery) - Preservation
      ✓ should preserve purchase TX hash commitment in Stage 2 VC
    EIP-712 Signing
      ✓ should exclude purchaseTxHashCommitment from signing payload
    Backward Compatibility
      ✓ should work without purchase TX hash commitment
    End-to-End Flow
      ✓ should complete full flow: purchase → order confirmation → delivery
    Performance
      ✓ should measure purchase TX hash commitment generation time

  9 passing (Xms)
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
   - **Check**: Console should show "Purchase TX hash commitment stored for Stage 1 VC"
   - **Check**: localStorage should have key `purchase_tx_commitment_{contractAddress}`

3. **Confirm Order (as Seller):**
   - Switch to seller account in MetaMask
   - Click "Confirm Order"
   - **Check**: Console should show "Found purchase TX hash commitment, will include in Stage 1 VC"
   - **Check**: localStorage key should be removed after retrieval
   - **Check**: Stage 1 VC uploaded to IPFS should contain `purchaseTxHashCommitment`

4. **Verify VC:**
   - Download Stage 1 VC from IPFS
   - **Check**: `credentialSubject.purchaseTxHashCommitment` exists
   - **Check**: `credentialSubject.purchaseTxHashCommitment.commitment` is present
   - **Check**: `credentialSubject.purchaseTxHashCommitment.proof` is present
   - **Check**: Actual transaction hash is NOT in the VC

5. **Confirm Delivery (as Buyer):**
   - Switch to buyer account
   - Confirm delivery
   - **Check**: Stage 2 VC should preserve `purchaseTxHashCommitment` from Stage 1
   - **Check**: Stage 2 VC should also have `txHashCommitment` (delivery)

## Troubleshooting

### Test Fails: "Couldn't connect to node"
- **Solution**: Start Ganache on port 8545

### Test Fails: "Failed to generate TX hash commitment"
- **Solution**: Start ZKP backend on port 5010

### Test Fails: "Commitment should verify"
- **Solution**: Check ZKP backend logs for errors
- **Solution**: Ensure ZKP backend is using correct Bulletproofs version

### Frontend: Purchase TX hash commitment not stored
- **Check**: ZKP backend is running and accessible
- **Check**: Browser console for errors
- **Check**: Network tab for failed API calls

### Frontend: Order confirmation doesn't find commitment
- **Check**: localStorage has key `purchase_tx_commitment_{contractAddress}`
- **Check**: Same contract address is used for purchase and order confirmation
- **Check**: Browser console for errors

## Test File Location

- **Test File**: `test/PurchaseTxHashCommitment.test.js`
- **Documentation**: `docs/Phase1_Purchase_TX_Hash_Commitment_Implementation.md`

## Next Steps After Testing

Once all tests pass:

1. ✅ Phase 1 implementation is complete
2. ⏭️ Proceed with Feature 1 (Transaction Verification) - Event-based verification
3. ⏭️ Proceed with Feature 2 (Linkable Commitment) - Binding tags

