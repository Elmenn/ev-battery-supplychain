# Complete Test Plan - Rerun All Tests for LaTeX Updates

## Tests Already Completed ✅
1. **GasMeasurement.test.js** - ✅ DONE (Table 6.1 updated)
2. **AuditorVerification.test.js** - ✅ DONE (Table 6.4 updated)
3. **TransactionVerification.test.js** - ✅ DONE (Security section updated)

## Tests Still Needed ⏳

### 1. Bulletproofs Performance Tests
**LaTeX Tables:** Table 6.2 (Proof sizes), Table 6.3 (Generation time), Table 6.4 (Verification time)
**Test File:** Need to check if there's a dedicated test, or if this is measured via ZKP backend benchmarks
**What to measure:**
- Proof sizes for 32-bit and 64-bit ranges
- Generation time breakdown (blinding, commitment, range proof, binding tag)
- Verification time breakdown (setup, verification)
- All measured over 100 runs

**Action:** Check if there's a benchmark test or if we need to run ZKP backend benchmarks

### 2. Auditor Scalability Test
**LaTeX Table:** Table 6.5 (Verification time vs. provenance chain length)
**Test File:** `AuditorScalability.test.js`
**What to measure:**
- Verification time for 1 VC, 5 VCs, 10 VCs
- Time per VC

**Command:** `npx truffle test test/AuditorScalability.test.js`

### 3. IPFS Caching Impact
**LaTeX Section:** Section 6.4.2 (IPFS Caching Impact)
**Test File:** `IPFSCaching.test.js`
**What to measure:**
- Without caching (first fetch): ~34.63 ms
- With caching (subsequent fetch): ~16.36 ms
- Improvement percentage

**Command:** `npx truffle test test/IPFSCaching.test.js`

### 4. Storage Measurements
**LaTeX Section:** Section 6.2.2 (On-Chain Storage)
**Test File:** `StorageMeasurement.test.js`
**What to measure:**
- Storage slots per product
- Total bytes on-chain
- Comparison to naïve baseline

**Command:** `npx truffle test test/StorageMeasurement.test.js`

### 5. Baseline Comparison
**LaTeX Table:** Table 6.2 (Storage and gas comparison)
**Test File:** `BaselineComparison.test.js`
**What to measure:**
- Gas cost for naïve approach (full VC on-chain)
- Gas cost for our approach (anchors only)
- Storage comparison

**Command:** `npx truffle test test/BaselineComparison.test.js`

### 6. Factory Pattern Savings
**LaTeX Section:** Section 6.2.1 (may be mentioned in observations)
**Test File:** `FactoryPatternSavings.test.js`
**What to measure:**
- Gas cost of EIP-1167 clone deployment
- Comparison to full contract deployment
- Savings percentage

**Command:** `npx truffle test test/FactoryPatternSavings.test.js`

### 7. Functional Correctness Tests
**LaTeX Tables:** Table 6.6 (State machine), Table 6.7 (Invariants), Table 6.8 (Requirements)
**Test Files:** 
- `PhaseMachine.test.js` - State machine transitions
- `SimpleProductEscrow.test.js` - Commitment immutability
- `ProductEscrow.confidential.test.js` - Various invariants
- `Reentrancy.test.js` - Reentrancy protection
- `AccessControl.test.js` - Access control

**Commands:**
- `npx truffle test test/PhaseMachine.test.js`
- `npx truffle test test/SimpleProductEscrow.test.js`
- `npx truffle test test/ProductEscrow.confidential.test.js`
- `npx truffle test test/Reentrancy.test.js`
- `npx truffle test test/AccessControl.test.js`

### 8. Security Tests
**LaTeX Tables:** Table 6.9 (Replay/swap), Table 6.10 (Invalid input), Table 6.11 (VC integrity)
**Test Files:**
- `SecurityReplaySwap.test.js` - Replay and swap attack prevention
- `SecurityVCIntegrity.test.js` - VC integrity verification
- Various tests for invalid input handling (already covered in TransactionVerification)

**Commands:**
- `npx truffle test test/SecurityReplaySwap.test.js`
- `npx truffle test test/SecurityVCIntegrity.test.js`

## Execution Order

1. **Performance/Benchmark Tests** (affect tables with numbers):
   - AuditorScalability.test.js
   - IPFSCaching.test.js
   - StorageMeasurement.test.js
   - BaselineComparison.test.js
   - FactoryPatternSavings.test.js
   - Bulletproofs benchmarks (if available)

2. **Functional Correctness Tests** (verify test counts):
   - PhaseMachine.test.js
   - SimpleProductEscrow.test.js
   - ProductEscrow.confidential.test.js
   - Reentrancy.test.js
   - AccessControl.test.js

3. **Security Tests** (verify test results):
   - SecurityReplaySwap.test.js
   - SecurityVCIntegrity.test.js

## Notes

- For Bulletproofs performance, we may need to run ZKP backend benchmarks directly
- Some tests may need updates to use `confirmOrderWithCommitment` instead of `confirmOrder`
- All test results should be collected and numbers updated in LaTeX
- Test counts should be verified (e.g., "22 tests, all passing")

