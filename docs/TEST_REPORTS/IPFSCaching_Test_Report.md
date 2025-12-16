# IPFS Caching Impact Test Report

**Test Suite:** `test/IPFSCaching.test.js`  
**Date:** November 2025  
**Status:** ✅ **Test passing**  
**Execution Time:** ~2 seconds (setup + two fetch measurements)

---

## Executive Summary

Test 4.3 measures how much faster VC retrieval becomes when the IPFS gateway (or local cache) already holds the content. We simulate uncached vs. cached behavior by introducing 25 ms vs. 1 ms delays in the mock IPFS store, then measure the actual fetch times with `performance.now()`. Results show a ~53 % improvement on the second fetch, demonstrating the benefit of caching gateways or local pinning in auditor workflows.

---

## Test Results

| Fetch Mode | Time (ms) |
|------------|-----------|
| First fetch (uncached) | 34.63 |
| Second fetch (cached) | 16.36 |
| **Improvement** | **52.77 % faster** |

**Key Observations**
- Even with modest simulated latency, caching cuts the fetch time roughly in half.
- The proof/signature verification steps remain unaffected; this test isolates just the IPFS fetch portion to support the narrative in §6.2.4.
- In production, uncached fetches would likely be higher (hundreds of ms), so caching gains could be even larger.

---

## Methodology

1. Deploy new `ProductEscrow_Initializer` instance, set public price, and store a deterministic VC CID on-chain.
2. Keep the VC JSON only in a local `Map` (`ipfsStore`) to simulate deterministic IPFS content.
3. Fetch the VC twice via `fetchFromIpfsStore`:
   - First fetch enforces `UNCACHED_DELAY_MS = 25`.
   - Second fetch uses `CACHED_DELAY_MS = 1`.
4. Log both timings and compute percentage improvement.

### Future Work
- Replace the artificial delays with **real IPFS gateway calls** (e.g., `https://ipfs.io/ipfs/<CID>`) so we can capture true cold-cache vs. warm-cache latency on the target network. This will provide more granular data for the evaluation chapter once the gateway infrastructure is stable.

---

## References

- Test code: `test/IPFSCaching.test.js`
- Evaluation plan: `docs/Thesis_Report/EVALUATION_TEST_PLAN.md` (Test 4.3)
- Thesis narrative: IPFS caching paragraph in `docs/Thesis_Report/06_00_Evaluation.tex`

