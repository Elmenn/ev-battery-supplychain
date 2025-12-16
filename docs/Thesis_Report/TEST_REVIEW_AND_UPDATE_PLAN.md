# Test Review and Update Plan for Evaluation Chapter

## Overview
This document identifies which tests need updates, which tests should be run to update LaTeX numbers, and whether we need additional tests for new features (purchase transaction verification via `PurchaseConfirmedWithCommitment` event).

## Tests That Need Code Updates

### 1. **GasMeasurement.test.js** ⚠️ CRITICAL - Updates LaTeX Table
**Status:** Needs update
**Current:** Uses `confirmOrder(vcCID)`
**Needs:** 
- Update to `confirmOrderWithCommitment(vcCID, purchaseTxHashCommitment)`
- Test TWO scenarios:
  - With purchase commitment (3 events: VcUpdated, OrderConfirmed, PurchaseConfirmedWithCommitment)
  - Without purchase commitment (2 events: VcUpdated, OrderConfirmed)
- Update event counting logic to include `PurchaseConfirmedWithCommitment`

**Impact:** Directly affects Table 6.1 (Gas costs) in LaTeX

### 2. **TransactionVerification.test.js** ⚠️ CRITICAL - May Need Updates
**Status:** Needs review
**Current:** Uses `confirmOrder(stage1Cid)` at line 208
**Needs to check:**
- Does it test purchase transaction verification via `PurchaseConfirmedWithCommitment` event?
- Does it test delivery transaction verification via `DeliveryConfirmedWithCommitment` event?
- Should it test both?

**Impact:** Affects transaction verification evaluation section

### 3. **AuditorVerification.test.js** ⚠️ CRITICAL - Updates LaTeX Timing
**Status:** Needs review
**Current:** Uses `confirmOrder(stage1Cid)` at line 83
**Needs to check:**
- Does it measure time to query `PurchaseConfirmedWithCommitment` event?
- Does it include purchase transaction verification in timing breakdown?
- Should timing include both purchase and delivery event queries?

**Impact:** Directly affects Table 6.4 (Auditor verification time breakdown) in LaTeX

### 4. **PurchaseTxHashCommitment.test.js** ⚠️ IMPORTANT
**Status:** Needs review
**Current:** Uses `confirmOrder(stageVCs.stage1.cid)` at line 334
**Needs to check:**
- Does it verify that `PurchaseConfirmedWithCommitment` event is emitted?
- Does it test the event parameters (productId, commitment, buyer, vcCID)?

**Impact:** Affects privacy analysis section

### 5. **Other Tests Using `confirmOrder`** (Lower Priority)
These tests may need updates but don't directly affect evaluation numbers:
- `EndToEndFlow.test.js` (line 472)
- `LinkableCommitment.test.js` (line 267)
- `TxHashCommitment.test.js` (line 88)
- `AuditorScalability.test.js` (line 83)
- `SecurityVCIntegrity.test.js` (multiple lines)
- `StorageMeasurement.test.js` (line 102)
- `Reentrancy.test.js` (lines 73, 96)
- `ProductEscrow.confidential.test.js` (multiple lines)
- `PhaseMachine.test.js` (multiple lines)
- `FundsAccounting.test.js` (line 223)

**Recommendation:** Update these to use `confirmOrderWithCommitment` with zero commitment for consistency, but they don't need to measure gas or timing.

## Tests That Need to Be Run to Update LaTeX Numbers

### 1. **GasMeasurement.test.js** 🔴 HIGH PRIORITY
**What to run:**
```bash
npx truffle test test/GasMeasurement.test.js
```

**What to update in LaTeX:**
- Table 6.1: `confirmOrderWithCommitment` gas costs
  - Mean, Min, Max, Std Dev
  - Event count: 2-3 (with note explaining)
- Section 6.2.1 Observations: Update explanation about event count

**New test cases needed:**
- Test with purchase commitment (should emit 3 events)
- Test without purchase commitment (should emit 2 events)
- Measure gas for both scenarios (may be same, but verify)

### 2. **AuditorVerification.test.js** 🔴 HIGH PRIORITY
**What to run:**
```bash
npx truffle test test/AuditorVerification.test.js
```

**What to update in LaTeX:**
- Table 6.4: "Read on-chain state" step timing
  - Currently: $35.7$ ms
  - Should include: Time to query both `PurchaseConfirmedWithCommitment` and `DeliveryConfirmedWithCommitment` events
  - Update notes: "Single RPC (Ganache) + event queries for PurchaseConfirmedWithCommitment and DeliveryConfirmedWithCommitment"
- Section 6.4.1: Update description to mention both events

**New test cases needed:**
- Measure time to query `PurchaseConfirmedWithCommitment` event
- Measure time to query `DeliveryConfirmedWithCommitment` event
- Measure total time for both event queries
- Update timing breakdown in test output

### 3. **TransactionVerification.test.js** 🟡 MEDIUM PRIORITY
**What to run:**
```bash
npx truffle test test/TransactionVerification.test.js
```

**What to update in LaTeX:**
- Section 6.1.2: Privacy analysis - verify both events are tested
- Section 6.5.1: Security validation - verify transaction verification tests cover both purchase and delivery

**New test cases needed:**
- Test purchase transaction verification via `PurchaseConfirmedWithCommitment` event
- Test that commitment in event matches VC commitment
- Test that event is only emitted when purchase commitment is provided
- Test delivery transaction verification (may already exist)

### 4. **PurchaseTxHashCommitment.test.js** 🟡 MEDIUM PRIORITY
**What to run:**
```bash
npx truffle test test/PurchaseTxHashCommitment.test.js
```

**What to update in LaTeX:**
- Section 6.1.2: Privacy analysis - verify purchase transaction commitment event is tested
- Section 6.5.1: Security validation - verify purchase commitment verification

**New test cases needed:**
- Verify `PurchaseConfirmedWithCommitment` event is emitted
- Verify event parameters (productId, commitment, buyer, vcCID)
- Verify commitment in event matches VC commitment

## Additional Tests Needed for New Features

### 1. **Purchase Transaction Verification Test** 🆕 NEW
**File:** `test/PurchaseTransactionVerification.test.js` (may already exist as part of TransactionVerification.test.js)

**What it should test:**
- `PurchaseConfirmedWithCommitment` event is emitted when `confirmOrderWithCommitment` is called with purchase commitment
- Event is NOT emitted when `confirmOrderWithCommitment` is called without purchase commitment (zero commitment)
- Event parameters match the VC commitment
- Event can be queried and verified by auditor
- Commitment in event matches commitment in VC

**Impact:** Affects Section 6.1.2 (Privacy Analysis) and Section 6.5.1 (Security Validation)

### 2. **Gas Cost Comparison Test** 🆕 NEW
**File:** Add to `test/GasMeasurement.test.js`

**What it should test:**
- Compare gas costs:
  - `confirmOrderWithCommitment` with purchase commitment (3 events)
  - `confirmOrderWithCommitment` without purchase commitment (2 events)
- Verify event count matches expectations

**Impact:** Affects Table 6.1 (Gas costs)

## Summary of Action Items

### Immediate Actions (Before Updating LaTeX)
1. ✅ Update `GasMeasurement.test.js` to use `confirmOrderWithCommitment`
2. ✅ Add test cases for with/without purchase commitment
3. ✅ Update `AuditorVerification.test.js` to include purchase transaction verification timing
4. ✅ Review `TransactionVerification.test.js` to ensure it tests both purchase and delivery
5. ✅ Review `PurchaseTxHashCommitment.test.js` to ensure it tests event emission

### Run Tests and Collect Data
1. 🔴 Run `GasMeasurement.test.js` → Update Table 6.1
2. 🔴 Run `AuditorVerification.test.js` → Update Table 6.4
3. 🟡 Run `TransactionVerification.test.js` → Verify coverage
4. 🟡 Run `PurchaseTxHashCommitment.test.js` → Verify event emission

### Update LaTeX After Test Results
1. Update Table 6.1 (Gas costs) with new `confirmOrderWithCommitment` numbers
2. Update Table 6.4 (Auditor verification timing) with event query timing
3. Update Section 6.1.2 (Privacy analysis) to mention both events
4. Update Section 6.4.1 (Auditor verification) to include purchase transaction verification
5. Update Section 6.5.1 (Security validation) to include purchase transaction verification tests

## Test Execution Order

1. **First:** Update test code (GasMeasurement, AuditorVerification, TransactionVerification)
2. **Second:** Run tests and collect results
3. **Third:** Update LaTeX with new numbers
4. **Fourth:** Update other tests (lower priority) for consistency

## Notes

- The current LaTeX shows `confirmOrderWithCommitment` with event count 2--3, which is correct
- Gas costs may be the same with/without purchase commitment (just one extra event emission)
- Event query timing should be minimal (< 1ms per event on Ganache)
- All tests should eventually use `confirmOrderWithCommitment` for consistency, even if they pass zero commitment

