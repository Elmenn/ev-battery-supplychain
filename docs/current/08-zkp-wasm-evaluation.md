# ZKP WASM Evaluation (Current)

This document evaluates the browser-side WASM ZKP path used by the current private-order flow.

The goal is not only to compare backend versus WASM, but to answer the more important question:

> Is the browser-only WASM proof path fast, stable, and usable enough for the buyer flow and auditor flow?

## 1) Evaluation Goals

The evaluation should establish:

1. whether proof generation is fast enough for the buyer experience
2. whether proof verification is fast enough for the auditor experience
3. whether the worker-based design keeps the UI responsive
4. whether the WASM path is reliable enough to remove the ZKP backend from the active flow

## 2) What Is Being Evaluated

The active browser-side proof system now includes:

- scalar commitment generation for:
  - `C_qty`
  - `C_total`
  - `C_pay`
- quantity-total proof generation
- total-payment equality proof generation
- quantity-total proof verification
- total-payment equality proof verification

These are the cryptographic operations used in the current end-to-end flow.

## 3) Benchmark Harness

A dedicated browser benchmark page exists at:

- `/zkp-wasm-benchmark.html`

Supporting file:

- `frontend/public/zkp-wasm-benchmark.js`

This page measures the real browser worker/WASM path through:

- `frontend/public/wasmZkpWorker.js`

So the benchmark is aligned with the actual runtime used in the shipped application.

## 4) Metrics

### Core Latency Metrics

- `Cold Start`
  - time for the first worker/WASM operation after page load
- `generateScalarCommitments`
  - time to generate `C_qty`, `C_total`, and `C_pay`
- `generateQuantityTotalProof`
  - time to generate the quantity-total proof
- `generateTotalPaymentEqualityProof`
  - time to generate the total-payment equality proof
- `verifyQuantityTotalProof`
  - time to verify the quantity-total proof
- `verifyTotalPaymentEqualityProof`
  - time to verify the total-payment equality proof

### End-to-End Metrics

- `buyerCryptoE2E`
  - complete buyer-side cryptographic path:
    - commitments
    - quantity-total proof
    - total-payment equality proof
- `auditorVerifyE2E`
  - complete auditor proof-verification path:
    - quantity-total verification
    - total-payment equality verification

### Reliability Metrics

For each benchmarked operation:
- success rate
- proof verification success
- failure/timeout behavior

### Environment Metrics

Where supported by the browser:
- `usedJSHeapSize`
- `totalJSHeapSize`
- `jsHeapSizeLimit`

Also record:
- browser name/version via user agent
- hardware concurrency
- device memory if available

## 5) Test Scenarios

The benchmark page currently includes three representative scenarios:

### Small Order
- `unitPriceWei = 10000000000`
- `quantity = 2`

### Medium Order
- `unitPriceWei = 1000000000000000`
- `quantity = 25`

### Large Order
- `unitPriceWei = 250000000000000000`
- `quantity = 120`

These are not intended as asymptotic proof-size scaling tests.

They are intended to show that the current implementation remains stable and usable across realistic business values.

## 6) Methodology

Benchmark settings used:
- warmup iterations: `2`
- measured warm iterations: `20`
- memory capture: enabled

Why:
- the first few runs pay worker/module initialization costs
- later runs better represent steady-state use

The benchmark page reports:
- average
- min
- max
- p95
- success rate

## 7) How to Run

1. Build the WASM package:

```bash
cd frontend
npm run zkp:wasm:dev-build
```

2. Start the frontend:

```bash
npm start
```

3. Open:

- `http://localhost:3000/zkp-wasm-benchmark.html`

4. Choose:
- scenario
- warmup count
- measured iteration count

5. Run benchmark

6. Save the generated JSON report

## 8) Current Status

The active end-to-end flow already worked with:

```env
REACT_APP_ZKP_MODE=wasm
```

while:
- the ZKP backend on port `5010` was not running
- buyer proof generation still worked
- auditor verification still worked

So the evaluation is no longer about whether WASM works at all.

It is now about:
- measuring how well it works
- documenting whether it is operationally acceptable

## 9) Measured Results

### Summary Table

| Scenario | Cold Start (ms) | Commitments Avg (ms) | Qty-Total Prove Avg (ms) | Total-Pay Prove Avg (ms) | Qty-Total Verify Avg (ms) | Total-Pay Verify Avg (ms) | Buyer E2E Avg (ms) | Auditor E2E Avg (ms) | Success Rate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Small | 602.50 | 27.76 | 27.84 | 21.38 | 18.90 | 13.59 | 76.19 | 32.49 | 100% |
| Medium | 42.60 | 29.28 | 27.40 | 21.36 | 19.44 | 14.22 | 74.00 | 33.66 | 100% |
| Large | 308.10 | 28.19 | 27.29 | 22.25 | 19.37 | 13.63 | 78.51 | 33.00 | 100% |

### P95 End-to-End Results

| Scenario | Buyer E2E P95 (ms) | Auditor E2E P95 (ms) |
|---|---:|---:|
| Small | 102.70 | 45.10 |
| Medium | 100.10 | 45.10 |
| Large | 105.90 | 46.40 |

### Memory Observations

Observed memory remained stable across all three scenarios:
- there was no monotonic growth suggesting a worker-side leak during the measured runs
- the JavaScript heap stayed well below the browser limit reported by `performance.memory`

Important caution:
- the exact memory readings are browser-specific and should be treated as operational indicators, not as precise cryptographic memory profiling

## 10) Interpretation

### Main Finding

The browser-side WASM proof path is operationally fast enough for the current buyer and auditor flows on the tested machine.

### Buyer Flow

The most important metric for the buyer flow is `buyerCryptoE2E`.

Measured averages:
- Small: `76.19 ms`
- Medium: `74.00 ms`
- Large: `78.51 ms`

Measured p95:
- Small: `102.70 ms`
- Medium: `100.10 ms`
- Large: `105.90 ms`

Interpretation:
- steady-state proof generation is comfortably below a level that would feel disruptive in the UI
- performance remains stable across the tested business-value range
- the proof system behaves close to constant-cost for these scenarios

### Auditor Flow

The most important metric for the auditor flow is `auditorVerifyE2E`.

Measured averages:
- Small: `32.49 ms`
- Medium: `33.66 ms`
- Large: `33.00 ms`

Measured p95:
- Small: `45.10 ms`
- Medium: `45.10 ms`
- Large: `46.40 ms`

Interpretation:
- proof verification is very fast
- repeated audit checks should feel effectively immediate on the tested machine

### Cold Start

Cold-start measurements varied:
- Small: `602.50 ms`
- Medium: `42.60 ms`
- Large: `308.10 ms`

This variation is expected because cold start depends on:
- whether the worker was already initialized
- whether the WASM module was already loaded and cached in the page session
- general browser scheduling and cache state

Interpretation:
- the one-time first-use overhead is real
- but the steady-state timings are the more important operational measure for repeated use

### Reliability

Across all measured operations and all three scenarios:
- success rate was `100%`
- generated proofs verified successfully
- no worker timeouts or instability were observed during the measured runs

This is a strong result for removal of the active ZKP backend dependency from the user flow.

## 11) Conclusion

Based on the measured results:

1. the WASM path is fast enough for the current buyer cryptographic flow
2. the WASM path is fast enough for the current auditor verification flow
3. the proof path remained stable across the tested small, medium, and large scenarios
4. the active ZKP backend is no longer operationally required for the current end-to-end flow when the frontend runs with:

```env
REACT_APP_ZKP_MODE=wasm
```

The remaining work is not proof-path feasibility anymore.

The remaining work is:
- documenting the architecture clearly
- deciding whether to keep backend ZKP endpoints only for legacy compatibility or remove them
- optionally adding cross-browser and lower-power-device measurements for a broader performance study

## 12) Related Files

- `docs/current/07-zkp-wasm-path.md`
- `frontend/public/zkp-wasm-benchmark.html`
- `frontend/public/zkp-wasm-benchmark.js`
- `frontend/public/wasmZkpWorker.js`
- `zkp-backend/zkp-wasm/src/lib.rs`
