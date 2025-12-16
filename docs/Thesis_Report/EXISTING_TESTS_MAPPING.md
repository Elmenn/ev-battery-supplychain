# Mapping Existing Tests to Evaluation Tests

This document maps your existing test files to the evaluation tests we need to implement for Chapter 6.

## Summary

**7 out of 11 test files are directly useful** for evaluation tests. Many can be adapted or extended.

---

## ✅ Highly Useful Tests (Can be extended/adapted)

### 1. **PhaseMachine.test.js** ⭐⭐⭐
**Maps to:** Test 5.1 (State Machine Transitions)

**What it covers:**
- ✅ Phase transitions: Listed → Purchased → OrderConfirmed → Bound
- ✅ Invalid transitions (reverts)
- ✅ Phase change events
- ✅ Initial state checks

**What to add:**
- Transition to Delivered phase (if not covered)
- Transition to Expired (timeout)
- More edge cases for Table 6.10

**Action:** Extend this file with timeout transitions and Delivery phase.

---

### 2. **ProductEscrow.confidential.test.js** ⭐⭐⭐
**Maps to:** 
- Test 1.1 (Plaintext Price Exposure Check)
- Test 1.2 (ZKP Verification Over (C,t))
- Test 6.2 (Invalid Input Handling - wrong reveal)

**What it covers:**
- ✅ Confidential commitment storage
- ✅ Reveal verification (`verifyRevealedValue`)
- ✅ Wrong reveal value tests (value, blinding)
- ✅ Commitment handling in purchase flow

**What to add:**
- Check events/storage/VCs for plaintext price leakage
- More comprehensive ZKP verification tests
- Binding tag verification tests

**Action:** Extend with leakage checks and comprehensive ZKP tests.

---

### 3. **Reentrancy.test.js** ⭐⭐⭐
**Maps to:** Test 5.2 (Invariants - Reentrancy protection)

**What it covers:**
- ✅ Reentrancy protection on `depositPurchase`
- ✅ Reentrancy protection on `securityDeposit`
- ✅ Reentrancy protection on `withdrawBid`
- ✅ Malicious contract integration tests

**What to add:**
- Reentrancy protection on `revealAndConfirmDelivery` (if not covered)

**Action:** Verify `revealAndConfirmDelivery` reentrancy protection is tested.

---

### 4. **SimpleProductEscrow.test.js** ⭐⭐
**Maps to:**
- Test 5.2 (Invariants - Commitment immutability)
- Test 6.2 (Invalid Input - commitment freezing)

**What it covers:**
- ✅ `setPublicPriceWithCommitment` and commitment freezing
- ✅ Commitment immutability (cannot set twice)
- ✅ Access control (only seller can set)
- ✅ Zero commitment rejection

**What to add:**
- Nothing major, already well covered

**Action:** Can reuse as-is for commitment immutability tests.

---

### 5. **AccessControl.test.js** ⭐⭐
**Maps to:** Test 5.2 (Invariants - Access control)

**What it covers:**
- ✅ Factory ownership
- ✅ Pause/unpause access control
- ✅ Implementation update access control

**What to add:**
- Escrow-level access control (seller-only, buyer-only functions)
- Transporter-only functions

**Action:** Extend with escrow access control tests.

---

### 6. **FundsAccounting.test.js** ⭐
**Maps to:** Test 6.2 (Invalid Input - wrong reveal)

**What it covers:**
- ✅ Fund flows and accounting
- ✅ Wrong reveal values (some coverage)
- ✅ Balance reconciliation

**What to add:**
- More comprehensive wrong reveal tests
- Out-of-phase call tests

**Action:** Limited usefulness, focus on wrong reveal parts.

---

### 7. **ProductCreation.test.js** ⭐⭐
**Maps to:** Test 2.1 (Gas measurement for `createProduct`)

**What it covers:**
- ✅ Product creation flow
- ✅ Multiple products
- ✅ Event verification

**What to add:**
- Gas measurement instrumentation
- Multiple runs for statistics
- Storage measurement

**Action:** Instrument for gas measurement (add timing/gas collection).

---

## ❌ Less Useful Tests (Skip or Low Priority)

### 8. **CloneLifecycle.test.js**
**Maps to:** Partially Test 2.1, Test 2.4

**What it covers:**
- Clone creation and initialization
- Factory indexing functions

**Why less useful:**
- Good for understanding, but not directly needed for evaluation
- Test 2.1 needs gas measurement, not just functionality

**Action:** Skip unless you need to verify functionality first.

---

### 9. **DeterministicCloning.test.js**
**Maps to:** None (deterministic cloning is a different feature)

**What it covers:**
- Deterministic clone address prediction
- Salt-based cloning

**Why less useful:**
- This tests a feature not in our evaluation scope
- Not related to any evaluation test

**Action:** Skip entirely.

---

### 10. **ProductEscrow.railgun.*.test.js** (2 files)
**Maps to:** None (Railgun is future work)

**What it covers:**
- Railgun integration
- Private payment flows

**Why less useful:**
- Railgun is explicitly excluded from evaluation (future work)
- Not relevant to current thesis evaluation

**Action:** Skip entirely for evaluation tests.

---

## Recommended Strategy

### Phase 1: Extend Existing Tests (High Value)
1. **Extend `PhaseMachine.test.js`** → Test 5.1 (State Machine Transitions)
   - Add Delivered phase transitions
   - Add Expired/timeout transitions
   - ✅ **~80% already done!**

2. **Extend `ProductEscrow.confidential.test.js`** → Tests 1.1, 1.2, 6.2
   - Add leakage checks (events, storage, VCs)
   - Add comprehensive ZKP verification tests
   - ✅ **~60% already done!**

3. **Verify `Reentrancy.test.js`** → Test 5.2 (Reentrancy)
   - Check if `revealAndConfirmDelivery` is covered
   - ✅ **~90% already done!**

4. **Extend `SimpleProductEscrow.test.js`** → Test 5.2 (Commitment immutability)
   - Already well covered, maybe add edge cases
   - ✅ **~95% already done!**

### Phase 2: Instrument for Measurement (Medium Value)
5. **Instrument `ProductCreation.test.js`** → Test 2.1 (Gas measurement)
   - Add gas collection loop (run 10+ times)
   - Add statistics calculation
   - ✅ **~40% done (structure exists, needs measurement)**

### Phase 3: New Tests (Required)
6. **Create new tests** for measurements that don't exist:
   - Test 2.1: Gas measurement for all 6 transactions
   - Test 2.2: Storage measurement
   - Test 2.3: Baseline comparison
   - Test 3.1-3.3: Proof performance (Rust tests)
   - Test 4.1-4.3: Auditor verification (integration tests)
   - Test 6.1: Replay/swap attacks (security tests)
   - Test 6.3: VC integrity (security tests)

---

## Time Savings Estimate

If you reuse/extend existing tests:

| Test | Original Est. | With Reuse | Savings |
|------|---------------|------------|---------|
| Test 5.1 (State Machine) | 2-3h | 0.5-1h | **1.5-2h** |
| Test 5.2 (Invariants - Reentrancy) | 4-5h | 0.5h (verify) | **3.5-4.5h** |
| Test 5.2 (Invariants - Commitment) | 4-5h | 0.5h (verify) | **3.5-4.5h** |
| Test 6.2 (Invalid Input - reveal) | 2-3h | 1-1.5h | **1-1.5h** |
| Test 1.1 (Plaintext Exposure) | 2-3h | 1-1.5h | **1-1.5h** |
| Test 1.2 (ZKP Verification) | 2-3h | 1-1.5h | **1-1.5h** |

**Total Time Savings: ~12-16 hours** (out of ~71-95 hours total)

**New Estimated Total: ~59-79 hours** (~7-10 work days)

---

## Action Items

### Immediate (Do First)
1. ✅ **Review `PhaseMachine.test.js`** - extend with Delivered/Expired phases
2. ✅ **Review `ProductEscrow.confidential.test.js`** - add leakage checks
3. ✅ **Verify `Reentrancy.test.js`** - check `revealAndConfirmDelivery` coverage

### Medium Priority
4. ✅ **Extend `AccessControl.test.js`** - add escrow-level access control
5. ✅ **Instrument `ProductCreation.test.js`** - add gas measurement

### New Tests Needed
6. ⚠️ **Create gas measurement suite** - Test 2.1 (all transactions)
7. ⚠️ **Create Rust benchmarks** - Tests 3.1-3.3 (proof performance)
8. ⚠️ **Create integration tests** - Tests 4.1-4.3 (auditor verification)
9. ⚠️ **Create security tests** - Tests 6.1, 6.3 (replay, VC integrity)

---

## Code Snippets to Reuse

### From PhaseMachine.test.js
```javascript
// Already tests phase transitions - extend this pattern
it("should transition from Listed to Purchased", async () => {
  // ... existing code ...
});
```

### From ProductEscrow.confidential.test.js
```javascript
// Already tests reveal verification - extend this
it("should verify a revealed value and blinding", async () => {
  // ... existing code ...
});

// Wrong reveal tests - can extend
it("should revert if revealAndConfirmDelivery is called with invalid value or blinding", async () => {
  // ... existing code ...
});
```

### From Reentrancy.test.js
```javascript
// Already tests reentrancy - verify revealAndConfirmDelivery is covered
it("should prevent reentrancy on depositPurchase", async () => {
  // ... existing code ...
});
```

### From SimpleProductEscrow.test.js
```javascript
// Already tests commitment immutability - perfect!
it("cannot set public price with commitment twice", async () => {
  // ... existing code ...
});
```

---

## Conclusion

**You have ~35-40% of the evaluation tests already implemented!** The existing tests cover:
- ✅ State machine transitions (mostly)
- ✅ Reentrancy protection (mostly)
- ✅ Commitment immutability (fully)
- ✅ Invalid input handling (partially)
- ✅ Confidential commitment handling (mostly)

**Focus your effort on:**
1. Extending existing tests (easy wins, ~12-16h saved)
2. Creating measurement tests (gas, proof performance, auditor verification)
3. Creating security validation tests (replay/swap attacks, VC integrity)

