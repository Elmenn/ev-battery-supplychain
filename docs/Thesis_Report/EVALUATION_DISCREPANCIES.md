# Evaluation Chapter Data Discrepancies

**Date:** December 2024  
**Status:** ⚠️ **Needs Attention**

This document identifies discrepancies between the evaluation chapter (`06_00_Evaluation.tex`) and the actual test reports. These need to be resolved by either updating the thesis with correct data or re-running tests to confirm the numbers.

---

## Critical Discrepancies

### 1. Auditor Verification Time Breakdown (Table 6.8)

**Location:** Lines 336-356 in `06_00_Evaluation.tex`

| Metric | Thesis Value | Test Report Value | Status |
|--------|--------------|-------------------|--------|
| **Total end-to-end time** | 152.2 ms (min 130.0, max 215.5; σ=32.0) | 141.41 ms (min 108.94, max 252.73; σ=55.78) | ❌ **MISMATCH** |
| Read on-chain state | 30.9 ms (min 21.0, max 40.3; σ=6.4) | 35.73 ms (min 33.58, max 38.23; σ=1.67) | ❌ **MISMATCH** |
| **Query transaction events** | **42.7 ms** (min 39.3, max 47.1; σ=2.5) | **NOT IN TEST REPORT** | ⚠️ **MISSING** |
| Fetch VC from IPFS | 0.09 ms (matches) | 0.09 ms | ✅ Match |
| Verify EIP-712 signatures | 46.8 ms (min 29.3, max 107.9; σ=30.6) | 66.44 ms (min 40.12, max 159.52; σ=46.57) | ❌ **MISMATCH** |
| Extract commitment & proof | 0.02 ms (matches) | 0.03 ms | ✅ Close |
| Recompute binding tag | 0.11 ms (matches) | 0.13 ms | ✅ Close |
| Verify ZKP proof | 31.3 ms (min 28.4, max 38.5; σ=3.6) | 38.70 ms (min 33.09, max 53.90; σ=7.72) | ❌ **MISMATCH** |
| Traverse chain | 0.15 ms (matches) | 0.13 ms | ✅ Close |

**Issues:**
1. The thesis includes "Query transaction events" as a separate step (42.7 ms) that **does not appear in the test report breakdown**
2. Total time discrepancy: 152.2 ms vs 141.41 ms
3. Several individual step timings differ significantly

**Source:** `docs/TEST_REPORTS/AuditorVerification_Test_Report.md`

---

### 2. Auditor Scalability Analysis (Table 6.9)

**Location:** Lines 365-379 in `06_00_Evaluation.tex`

| Chain Length | Thesis Total Time | Test Report Total Time | Thesis per VC | Test Report per VC | Status |
|--------------|-------------------|------------------------|---------------|-------------------|--------|
| 1 VC | 150.0 ms (min 121.1, max 206.3; σ=39.8) | 235.09 ms (min 159.22, max 382.55; σ=104.28) | 150.0 ms | 235.09 ms | ❌ **MAJOR MISMATCH** |
| 5 VCs | 97.3 ms (min 93.3, max 105.0; σ=5.4) | 327.87 ms (min 193.08, max 552.94; σ=160.18) | 19.5 ms | 65.57 ms | ❌ **MAJOR MISMATCH** |
| 10 VCs | 119.1 ms (min 112.4, max 126.7; σ=5.9) | 309.42 ms (min 260.67, max 379.02; σ=50.52) | 11.9 ms | 30.94 ms | ❌ **MAJOR MISMATCH** |

**Issues:**
1. **Complete reversal of scaling pattern**: 
   - Thesis shows: 150.0 ms → 97.3 ms → 119.1 ms (decreasing then increasing)
   - Test report shows: 235.09 ms → 327.87 ms → 309.42 ms (increasing then plateauing)
2. Thesis shows much lower absolute times
3. Thesis shows decreasing "time per VC" as chain length increases (150.0 → 19.5 → 11.9 ms), but test report shows different pattern (235.09 → 65.57 → 30.94 ms)

**Source:** `docs/TEST_REPORTS/AuditorScalability_Test_Report.md`

**Note:** The test report uses 3 runs per chain length, which may explain some variance, but not the complete reversal of the scaling pattern.

---

### 3. IPFS Caching Impact

**Location:** Lines 381-384 in `06_00_Evaluation.tex`

| Metric | Thesis Value | Test Report Value | Status |
|--------|--------------|-------------------|--------|
| First fetch (uncached) | 31.38 ms | 34.63 ms | ⚠️ **SMALL DISCREPANCY** |
| Second fetch (cached) | 16.16 ms | 16.36 ms | ✅ Close |
| Improvement | 48.49% | 52.77% | ⚠️ **DISCREPANCY** |

**Issues:**
1. Small differences in absolute values (within 10% but should match)
2. Improvement percentage differs: 48.49% vs 52.77%

**Source:** `docs/TEST_REPORTS/IPFSCaching_Test_Report.md`

---

## Recommended Actions

### Immediate Actions Required:

1. **Auditor Verification Time (Table 6.8):**
   - [ ] Determine if "Query transaction events" step should be included (42.7 ms)
   - [ ] Re-run `test/AuditorVerification.test.js` to get fresh measurements
   - [ ] Update Table 6.8 with correct values from test report OR update test report if thesis values are from a different test run
   - [ ] Document the methodology for measuring each step consistently

2. **Auditor Scalability (Table 6.9):**
   - [ ] **CRITICAL:** Re-run `test/AuditorScalability.test.js` to verify the scaling pattern
   - [ ] Check if thesis numbers came from a different test configuration or older test version
   - [ ] Update Table 6.9 with verified measurements
   - [ ] Ensure the narrative about scaling behavior (lines 360-362) matches the actual data

3. **IPFS Caching:**
   - [ ] Re-run `test/IPFSCaching.test.js` to confirm values
   - [ ] Update thesis with correct percentage (should be 52.77% based on test report)

### Testing Commands:

```bash
# Re-run auditor verification test
npx truffle test test/AuditorVerification.test.js --network development

# Re-run scalability test
npx truffle test test/AuditorScalability.test.js --network development

# Re-run IPFS caching test
npx truffle test test/IPFSCaching.test.js --network development
```

### Questions to Resolve:

1. **Were the thesis numbers from an older test run?** If so, document the version/commit hash.
2. **Does "Query transaction events" need to be measured separately?** Check if `AuditorVerification.test.js` includes this step or if it needs to be added.
3. **Why does scalability show opposite patterns?** The thesis shows decreasing time per VC (150 → 19.5 → 11.9 ms), but test report shows different behavior. This needs investigation.
4. **Are there multiple test configurations?** Check if different network settings (Ganache port, backend URLs, etc.) could explain differences.

---

## Additional Notes

- All other tables and data points appear to match between thesis and test reports
- Gas measurements (Table 6.4) match test plan
- Bulletproofs performance (Tables 6.5-6.7) match test reports
- Storage measurements match test reports
- Security test results match test reports

---

**Next Steps:** Prioritize fixing the scalability analysis (Table 6.9) as it shows the most significant discrepancy and could affect the narrative conclusions about system performance.

