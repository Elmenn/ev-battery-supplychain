# End-to-End Latency and Recovery Evaluation (Current)

This document defines how to evaluate the full current workflow beyond isolated proof timings.

The goal is to measure:
- how long the real user journey takes
- where the latency actually comes from
- whether recovery mechanisms behave correctly when failures happen

This is a system-level evaluation, not a cryptography-only evaluation.

## 1) Evaluation Goals

The evaluation should answer:

1. Is the full buyer flow operationally usable?
2. Is seller confirmation operationally usable?
3. Is auditor verification operationally usable?
4. Does the system recover correctly from partial failures?
5. Does the system preserve continuity across refresh/device loss scenarios?

## 2) Scope

Evaluate the currently shipped flow:

1. seller creates listing
2. buyer enters private quantity
3. buyer generates commitments and proofs
4. buyer sends Railgun private payment
5. app records the private order on-chain
6. seller issues and anchors final VRC
7. auditor loads and verifies the final VRC

Recovery should be evaluated around:
- backend write failures
- browser refreshes
- failed or delayed on-chain recording
- verifier/retrieval failures

## 3) Metrics

### End-to-End Latency Metrics

Measure wall-clock time for each stage:

- `T_listing_create`
  - seller clicks submit to listing visible/usable
- `T_buyer_crypto`
  - buyer enters quantity to commitments/proofs ready
- `T_railgun_payment`
  - send private payment until transfer result returned
- `T_onchain_record`
  - call to `recordPrivateOrderPayment(...)` until mined/success
- `T_buyer_total`
  - open buyer modal to order recorded successfully
- `T_seller_confirm`
  - seller confirm click to VRC anchored on-chain
- `T_auditor_load`
  - CID entry/load to VRC rendered and ready
- `T_auditor_verify_all`
  - run-all click to final verification result

### Recovery Metrics

- `T_recovery_lookup`
  - time to recover pending order state from backend
- `T_retry_recording`
  - retry click to successful on-chain recording
- `recovery_success_rate`
  - how often recovery succeeds after induced failure
- `cross_refresh_success`
  - whether the same browser after refresh can resume
- `cross_device_success`
  - whether another device/browser can retrieve enough state to continue

### Reliability Metrics

- success/failure rate for each major stage
- number of manual retries required
- whether state remains consistent across:
  - frontend
  - backend order row
  - on-chain order state
  - final VRC

## 4) Data Sources

Use:
- browser timestamps / manual stopwatch for UX-level timing
- backend API responses
- chain confirmation times
- `GET /indexer/health`
- `GET /orders/by-product/:productAddress/buyer/:buyerAddress/latest`
- final VRC JSON

Where possible, capture:
- exact timestamps from browser console
- backend timestamps already stored in rows
- block confirmation timestamps from the chain explorer

## 5) Test Scenarios

### Scenario A: Happy Path

Measure the entire lifecycle with no induced failure:
- listing
- buyer purchase
- seller confirmation
- auditor verification

Goal:
- establish the baseline full-system latency

### Scenario B: Refresh Before On-Chain Recording

Procedure:
1. buyer completes private payment preparation
2. induce interruption before or around `recordPrivateOrderPayment(...)`
3. refresh browser
4. recover order state
5. retry recording

Goal:
- verify backend recovery bundle is sufficient

### Scenario C: Retry After On-Chain Failure

Procedure:
1. force or simulate a failed recording attempt
2. use the retry path
3. confirm same order continues and no duplicate order is created

Goal:
- verify retry path correctness and timing

### Scenario D: Seller Confirmation After Delay

Procedure:
1. buyer order is already recorded
2. seller confirms later, from a new session if possible

Goal:
- verify seller can reconstruct the final VRC from canonical state

### Scenario E: Auditor Verification from Archived VRC

Procedure:
1. load confirmed VRC later
2. verify with fresh page/session

Goal:
- ensure archive-first retrieval and verification remain stable

## 6) Measurement Procedure

For each run, record:
- date/time
- network used
- browser
- whether ZKP mode is `wasm` or `backend`
- product address
- order ID
- buyer address
- seller address
- VRC CID

Recommended minimum:
- 3 happy-path runs
- 2 recovery runs for each recovery scenario

## 7) Suggested Results Table

### Happy Path

| Run | T_listing_create | T_buyer_crypto | T_railgun_payment | T_onchain_record | T_buyer_total | T_seller_confirm | T_auditor_load | T_auditor_verify_all | Result |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | 18.49 s | 0.56 s | 65.44 s | 30.01 s | 91.39 s | 29.61 s | 0.05 s | 1.11 s | Pass |
| 2 |  |  |  |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |  |  |  |

### Recovery

| Scenario | Run | Recovery Trigger | T_recovery_lookup | T_retry_recording | Recovery Success | Notes |
|---|---|---|---:|---:|---|---|
| Refresh Before Record | 1 |  |  |  |  |  |
| Refresh Before Record | 2 |  |  |  |  |  |
| Retry After Failure | 1 |  |  |  |  |  |
| Retry After Failure | 2 |  |  |  |  |  |

## 8) Success Criteria

The current system should be considered operationally strong if:

- buyer total flow is consistently usable without excessive waiting
- seller confirm completes reliably from canonical order state
- auditor verify-all completes reliably from the final VRC
- recovery succeeds after refresh/failure without data loss
- no state divergence appears between:
  - chain
  - backend order row
  - final VRC

## 9) Current Happy-Path Interpretation

One full measured happy-path run has already been captured with the frontend timing logger.

Observed timings:
- `T_listing_create = 18.49 s`
- `T_buyer_crypto = 0.56 s`
- `T_railgun_payment = 65.44 s`
- `T_onchain_record = 30.01 s`
- `T_buyer_total = 91.39 s`
- `T_seller_confirm = 29.61 s`
- `T_auditor_load = 0.05 s`
- `T_auditor_verify_all = 1.11 s`

### Main Finding

The end-to-end workflow is currently dominated by:
- Railgun transfer latency
- on-chain confirmation latency
- seller confirmation transaction/upload latency

It is **not** dominated by the browser-side proof path.

### What This Means

- buyer-side cryptographic work is fast relative to the full workflow
- auditor verification is also fast relative to the full workflow
- the main operational delays come from external/networked components rather than local proving

### Notes About the Captured Run

- the run was recorded with the in-app timing logger
- one duplicate `buyer_modal_opened` mark appeared, likely due to normal React rendering behavior
- this does not affect the extracted stage durations above

## 10) What to Watch For

Red flags:
- metadata missing after listing
- order row missing fields required for seller confirm
- duplicate order IDs or mismatched order context
- VRC generated with stale or incomplete proof data
- indexer lag causing stale views
- audit verification depending on data no longer in the VRC

## 11) Deliverables

The final evaluation output should contain:

1. latency table for the happy path
2. latency/reliability table for recovery scenarios
3. short interpretation:
   - acceptable
   - borderline
   - problematic
4. concrete bottleneck notes:
   - Railgun transfer
   - on-chain confirmation
   - backend lookup
   - verification step

## 12) Related Docs

- `docs/current/01-end-to-end-flow.md`
- `docs/current/02-railgun-integration.md`
- `docs/current/03-auditor-verification.md`
- `docs/current/07-zkp-wasm-path.md`
- `docs/current/08-zkp-wasm-evaluation.md`
