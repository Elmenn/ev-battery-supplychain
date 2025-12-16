# Auditor Verification Workflow Test Report

**Test Suite:** `test/AuditorVerification.test.js`  
**Date:** November 2025  
**Status:** ✅ **ALL TESTS PASSING** (1 scenario, RUNS=5 per timing loop)  
**Execution Time:** ~2 seconds (per Truffle run)

---

## Executive Summary

This suite implements **Test 4.1: End-to-End Verification Time** from the evaluation plan. It measures how long an auditor needs to validate a complete product lifecycle (S0→S1→S2) by exercising every verification step:

- Read on-chain anchors (`publicPriceCommitment`, `vcCid`).
- Fetch the latest VC (simulated IPFS store).
- Verify issuer and holder EIP-712 signatures with the correct `verifyingContract`.
- Extract commitment/proof metadata, recompute the Bulletproof binding tag, and verify the proof via the Rust backend.
- Traverse the `previousCredential` chain to confirm provenance.

All steps executed successfully. Average end-to-end time was **141 ms**, comfortably under the sub-second target for interactive auditor workflows.

---

## Test Configuration

- **Network:** Ganache CLI (`development` @ `127.0.0.1:8545`)
- **Contracts:** Fresh deployment of `ProductEscrow_Initializer` + `ProductFactory`
- **VC Chain:** Deterministic Stage 0/1/2 documents with synthetic CIDs (`computeCid`)
- **ZKP Backend:** `http://127.0.0.1:5010` (Bulletproofs Pedersen API)
- **Runs:** 5 iterations (`RUNS = 5`) collecting per-step timings with `perf_hooks.performance`
- **Price:** `1_000_000` wei (keeps backend inputs within `u64` range)

---

## Timing Results

| Step | Mean (ms) | Min (ms) | Max (ms) | Std Dev (ms) | Notes |
|------|-----------|----------|----------|--------------|-------|
| Read on-chain state (`publicPriceCommitment`, `vcCid`, `owner`) | 35.73 | 33.58 | 38.23 | 1.67 | Single RPC call via web3 |
| Fetch VC from IPFS (Stage 2, cached Map) | 0.09 | 0.08 | 0.15 | 0.03 | In-memory mock store |
| Verify EIP-712 signatures (issuer + holder) | 66.44 | 40.12 | 159.52 | 46.57 | Requires `verifyingContract` domain |
| Extract commitment & proof from VC JSON | 0.03 | 0.02 | 0.03 | ~0 | Simple `JSON.parse` |
| Recompute binding tag `t` | 0.13 | 0.11 | 0.18 | 0.03 | SHA-256 over context |
| Verify Bulletproof via backend | 38.70 | 33.09 | 53.90 | 7.72 | `/zkp/verify-value-commitment` |
| Traverse `previousCredential` chain (S2→S1→S0) | 0.13 | 0.11 | 0.23 | 0.05 | Map lookups |
| **Total end-to-end** | **141.41** | **108.94** | **252.73** | **55.78** | Auditor wall-clock per product |

---

## Observations

- **Signature verification dominates** variation due to EIP-712 hashing plus deterministic wallets; `verifyingContract` must match the product address for payload hashes to align with stored proofs.
- **ZKP verification** (~39 ms mean) is stable and under 55 ms even at max, aligning with backend metrics from Tests 3.2/3.3.
- **Data extraction, binding tag recomputation, and provenance traversal** are effectively negligible (<1 ms combined) thanks to small payloads and deterministic fixtures.
- **Total latency (~0.14 s)** leaves ample headroom for UI interactions and supports real-time auditing.

---

## Recommendations

- For production deployments, replace the mock IPFS map with real gateway calls to capture cold-cache vs. warm-cache behavior (feeds into Tests 4.2/4.3).
- Automate CSV export of the timing stats so Table 6.8 can be regenerated programmatically.
- Extend this suite in future work to parameterize provenance depth (Tests 4.2) and add cache warm-up scenarios (Test 4.3).

---

## References

- Test implementation: `test/AuditorVerification.test.js`
- Evaluation linkage: `docs/Thesis_Report/EVALUATION_TEST_PLAN.md` – Test 4.1  
- Thesis tables: `Table 6.8 (tab:eval-auditor-time)` in `docs/Thesis_Report/06_00_Evaluation.tex`

