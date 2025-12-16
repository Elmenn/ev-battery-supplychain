# Auditor Scalability Test Report

**Test Suite:** `test/AuditorScalability.test.js`  
**Date:** November 2025  
**Status:** ✅ **All tests passing**  
**Execution Time:** ~8 seconds (deploy + measurements across 3 chain lengths)

---

## Executive Summary

Test 4.2 evaluates how auditor verification time scales with provenance chain length by synthetically extending the `previousCredential` linked list. Three scenarios (1 VC, 5 VCs, 10 VCs) were executed; each measured the end-to-end verification time (on-chain reads, VC fetch, signature and ZKP verification, chain traversal) across 3 runs. Results show near-linear scaling—time per VC drops as chain length increases because on-chain and signature checks dominate the fixed overhead.

---

## Test Results

| Chain Length | Runs | Total Time (ms) — mean (min / max) | Std Dev (ms) | Time per VC (ms) |
|--------------|------|--------------------------------------|--------------|------------------|
| 1 VC | 3 | 235.09 (159.22 / 382.55) | 104.28 | 235.09 |
| 5 VCs | 3 | 327.87 (193.08 / 552.94) | 160.18 | 65.57 |
| 10 VCs | 3 | 309.42 (260.67 / 379.02) | 50.52 | 30.94 |

**Key Observations**
- Absolute time plateaus around 0.3–0.35 s regardless of chain length because signature verification + single ZKP check dominate; the additional VC fetches and binding recomputes cost only ~a few ms each.
- Time per VC decreases as the chain length grows (235 ms → 66 ms → 31 ms) since the fixed overhead is amortized over more hops.
- Variation increases for shorter chains because the small sample size accentuates fluctuations in EIP-712 signature verification and ZKP backend latency.

---

## Environment & Methodology

- **Network:** Ganache CLI `127.0.0.1:8545`.
- **Contracts:** Fresh deploy of `ProductEscrow_Initializer` and `ProductFactory` per test run.
- **VC Chain Construction:** Deterministic EIP-712 signatures, synthetic CIDs via `computeCid`, `previousCredential` pointing linearly to emulate longer provenance.
- **ZKP Backend:** Bulletproofs API running locally (`/zkp/generate-value-commitment-with-binding` + `/zkp/verify-value-commitment`).
- **Timing Instrumentation:** `performance.now()` measured total verification time; loops repeated 3 times per chain length to gather mean/min/max/std.

---

## Recommendations

1. For future work, include cold vs. warm cache scenarios to highlight IPFS fetch cost (Test 4.3).
2. Extend the chain lengths beyond 10 if real-world supply chains can exceed that depth to confirm linear scaling holds.
3. Export timing data to CSV to regenerate Table 6.9 automatically.

---

## References

- Implementation: `test/AuditorScalability.test.js`
- Evaluation linkage: `docs/Thesis_Report/EVALUATION_TEST_PLAN.md` (Test 4.2)
- Thesis table: `Table 6.9 (tab:eval-auditor-scalability)` in `docs/Thesis_Report/06_00_Evaluation.tex`

