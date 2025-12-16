# Remaining Tests - Priority Ranking

**Last Updated:** December 2024  
**Status:** Based on `EVALUATION_TEST_PLAN.md` analysis

---

## Summary

**Total Tests Completed:** 87 tests ✅ (includes Tests 6.1 & 6.3)  
**Total Tests Remaining:** 4 tests ⚠️

---

## Priority Ranking (High → Low)

### 🔴 **CRITICAL PRIORITY** (Must Implement)

#### 1. **Test 6.1: Replay and Swap Attack Prevention** ✅
- **Section:** 6.3 (Security Validation)
- **Maps to:** Table 6.13 (tab:eval-security-replay)
- **Status:** ✅ **COMPLETED** - All 6 attack scenarios tested and prevented
- **Why Critical:**
  - **Security validation** - Core security property of binding tags
  - **Thesis requirement** - Security chapter needs concrete attack prevention evidence
  - **Binding tag verification** - Proves cryptographic binding prevents replay/swap attacks
  - **Completeness** - Completes security validation section
- **Implementation Complexity:** Medium ✅
  - ✅ Created multiple products with different contexts
  - ✅ Tested proof extraction and reuse scenarios
  - ✅ Binding tag computation and verification working correctly
- **Dependencies:** None (can be implemented independently) ✅
- **Estimated Effort:** 4-6 hours ✅ **COMPLETED**

**Test Scenarios:**
1. Replay attack: Extract proof from VC A, use in VC B (different vcCid)
2. Swap attack: Copy proof between credentials with same commitment C
3. Wrong commitment: Verify proof with wrong commitment C
4. Wrong binding tag: Verify proof with wrong binding tag t
5. Wrong chain/context: Different chainId or escrowAddr

---

#### 2. **Test 6.3: VC Integrity Verification** ✅
- **Section:** 6.3 (Security Validation)
- **Maps to:** Table 6.15 (tab:eval-security-vc)
- **Status:** ✅ **COMPLETED** – Truffle `test/SecurityVCIntegrity.test.js` (6 tests, ~9 s) +
  `docs/TEST_REPORTS/VCIntegrity_Test_Report.md`
- **Why Critical:**
  - **Security validation** - Proves tamper detection works
  - **VC integrity** - Core property of verifiable credentials
  - **Signature verification** - Validates EIP-712 signature verification
  - **Provenance chain integrity** - Tests componentCredentials[] tampering detection
- **Result Highlights:**
  - Tampered VC CID mismatch detected; on-chain anchor remained immutable.
  - Tampered `componentCredentials[]` links detected via provenance traversal failure.
  - Invalid issuer/holder signatures rejected (payload-hash mismatch + curve constraint).
  - Valid signatures accepted (positive control).

---

### 🟡 **HIGH PRIORITY** (Should Implement)

#### 3. **Test 4.1: End-to-End Verification Time** ⚠️
- **Section:** 6.2.4 (Auditor Verification Workflow)
- **Maps to:** Table 6.8 (tab:eval-auditor-time)
- **Status:** Not implemented
- **Why High Priority:**
  - **Practical usability** - Measures real-world auditor workflow performance
  - **Complete evaluation** - Auditor workflow is a key use case
  - **Performance validation** - Shows system is practical for auditors
  - **End-to-end testing** - Tests complete verification pipeline
- **Implementation Complexity:** High
  - Requires full product lifecycle (S0→S1→S2)
  - IPFS integration for VC fetching
  - EIP-712 signature verification
  - ZKP verification integration
  - Provenance chain traversal
- **Dependencies:**
  - IPFS/Pinata integration
  - EIP-712 signature utilities
  - ZKP backend API
- **Estimated Effort:** 8-10 hours

**Operations to Measure:**
1. Read on-chain state (C, vcCid)
2. Fetch VC from IPFS (S2)
3. Verify EIP-712 signatures (issuer + holder)
4. Extract commitment and proof
5. Recompute binding tag t
6. Verify ZKP proof
7. Traverse previousCredential chain (S2→S1→S0)

---

#### 4. **Test 3.4: Comparison to SNARKs (Theoretical)** ⚠️
- **Section:** 6.2.3 (Bulletproofs Performance)
- **Maps to:** Table 6.7 (tab:eval-proof-comparison)
- **Status:** Not implemented (but mostly literature research)
- **Why High Priority:**
  - **Contextualization** - Places Bulletproofs in context of other ZKP systems
  - **Trade-off analysis** - Shows no-trusted-setup vs. performance trade-off
  - **Academic rigor** - Expected in evaluation chapter
  - **Completeness** - Completes Bulletproofs performance section
- **Implementation Complexity:** Low (mostly research)
  - No code implementation needed
  - Literature review and citation
  - Table population with measured Bulletproofs data + theoretical SNARK data
- **Dependencies:** 
  - Test 3.1, 3.2, 3.3 results (already completed)
  - Academic paper citations
- **Estimated Effort:** 2-3 hours (research + table creation)

**Data Needed:**
- Bulletproofs proof size (measured): 608 bytes (32-bit), 672 bytes (64-bit) ✅
- Bulletproofs verification time (measured): 55.649 ms (median) ✅
- Groth16 proof size (theoretical, from literature): ~[Y] bytes
- Groth16 verification time (theoretical, from literature): ~[Y] ms
- Trusted setup comparison: Bulletproofs = No, Groth16 = Yes

---

### 🟢 **MEDIUM PRIORITY** (Nice to Have)

#### 5. **Test 4.2: Scalability Analysis** ⚠️
- **Section:** 6.2.4 (Auditor Verification Workflow)
- **Maps to:** Table 6.9 (tab:eval-auditor-scalability)
- **Status:** Not implemented
- **Why Medium Priority:**
  - **Scalability validation** - Shows system handles longer provenance chains
  - **Performance analysis** - Measures time per VC in chain
  - **Practical limits** - Identifies performance bottlenecks
- **Implementation Complexity:** Medium
  - Requires creating chains of different lengths (1, 5, 10 VCs)
  - Builds on Test 4.1 infrastructure
- **Dependencies:**
  - Test 4.1 (End-to-End Verification Time)
  - IPFS integration
- **Estimated Effort:** 4-5 hours

**Test Scenarios:**
1. 1 VC (single product): total time, time per VC
2. 5 VCs (provenance chain): total time, time per VC
3. 10 VCs (deep chain): total time, time per VC

---

#### 6. **Test 4.3: IPFS Caching Impact** ⚠️
- **Section:** 6.2.4 (Auditor Verification Workflow)
- **Maps to:** Paragraph in auditor workflow section
- **Status:** Not implemented
- **Why Medium Priority:**
  - **Performance optimization** - Shows caching benefits
  - **Practical insight** - Useful for production deployment
  - **Less critical** - Nice-to-have optimization data
- **Implementation Complexity:** Low
  - Simple IPFS fetch timing (with/without cache)
  - Builds on Test 4.1 infrastructure
- **Dependencies:**
  - Test 4.1 (End-to-End Verification Time)
  - IPFS integration
- **Estimated Effort:** 2-3 hours

**Test Scenarios:**
1. First fetch (no cache): measure time
2. Second fetch (cached): measure time
3. Calculate improvement percentage

---

## Implementation Roadmap

### Phase 1: Critical Security Tests (Week 1)
1. ✅ **Test 6.1: Replay and Swap Attack Prevention** (4-6 hours) - **COMPLETED**
2. ✅ **Test 6.3: VC Integrity Verification** (6-8 hours) - **COMPLETED**

**Goal:** Complete security validation section (§6.3) — **ACHIEVED**

### Phase 2: Performance & Context (Week 2)
3. ✅ **Test 3.4: Comparison to SNARKs** (2-3 hours - mostly research)
4. ✅ **Test 4.1: End-to-End Verification Time** (8-10 hours)

**Goal:** Complete Bulletproofs performance section (§6.2.3) and start auditor workflow (§6.2.4)

### Phase 3: Scalability & Optimization (Week 3 - Optional)
5. ✅ **Test 4.2: Scalability Analysis** (4-5 hours)
6. ✅ **Test 4.3: IPFS Caching Impact** (2-3 hours)

**Goal:** Complete auditor workflow section (§6.2.4)

---

## Dependencies Graph

```
Test 6.1 (Replay/Swap) ──┐  (COMPLETED)
                          ├──> No dependencies remaining
Test 6.3 (VC Integrity) ──┘  (COMPLETED)

Test 3.4 (SNARK Comparison) ──> Test 3.1, 3.2, 3.3 (already done)

Test 4.1 (End-to-End) ──> IPFS + EIP-712 + ZKP backend
    │
    ├──> Test 4.2 (Scalability) ──> Test 4.1
    │
    └──> Test 4.3 (IPFS Caching) ──> Test 4.1
```

---

## Recommendations

### Must Implement (Minimum Viable Evaluation)
1. ✅ **Test 6.1** - Security validation is critical - **COMPLETED**
2. **Test 6.3** - VC integrity is core to the system
3. **Test 3.4** - Easy to implement (research), completes performance section
4. **Test 4.1** - Auditor workflow is a key use case

**Total Estimated Effort:** 20-27 hours (6 hours completed, 14-21 hours remaining)

### Should Implement (Complete Evaluation)
Add to above:
5. **Test 4.2** - Scalability analysis adds value (**depends on Test 4.1 infrastructure**)
6. **Test 4.3** - Caching impact is useful optimization data (**depends on Test 4.1 infrastructure**)

**Total Estimated Effort:** 26-35 hours (includes Should-Implement set)

---

## Notes

- **Test 6.1** is marked as "partially covered" but explicit attack scenario tests are needed for the security validation section
- **Test 3.4** is mostly literature research - can be done in parallel with other tests
- **Test 4.1** is the foundation for Tests 4.2 and 4.3 - implement first
- All tests require IPFS integration, which may need setup time
- EIP-712 signature utilities may need to be created if not already available

---

## Quick Reference

| Test | Priority | Complexity | Effort | Dependencies |
|------|----------|------------|--------|--------------|
| 6.1: Replay/Swap | 🔴 Critical ✅ | Medium | 4-6h ✅ | None ✅ |
| 6.3: VC Integrity | 🔴 Critical | Medium-High | 6-8h | IPFS, EIP-712 |
| 4.1: End-to-End | 🟡 High | High | 8-10h | IPFS, EIP-712, ZKP |
| 3.4: SNARK Comparison | 🟡 High | Low | 2-3h | Research only |
| 4.2: Scalability | 🟢 Medium | Medium | 4-5h | Test 4.1 |
| 4.3: IPFS Caching | 🟢 Medium | Low | 2-3h | Test 4.1 |

