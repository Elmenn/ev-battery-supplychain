# Dual-Profile Proof Evaluation

This note is the consolidated evaluation for dual-profile proof performance.

Compared profiles:

- `public-price + Fiat-Shamir`
- `private-price + Bulletproof`

## Paper Figure Freeze

Selected figures for the paper (frozen set):

1. Layer A generation median:
   - [plot_layer_a_generation_median_ms.png](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\artifacts\proof-vrc\plot_layer_a_generation_median_ms.png)
2. Layer A verification median:
   - [plot_layer_a_verification_median_ms.png](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\artifacts\proof-vrc\plot_layer_a_verification_median_ms.png)
3. Layer A proof size:
   - [plot_layer_a_proof_size_bytes.png](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\artifacts\proof-vrc\plot_layer_a_proof_size_bytes.png)
4. Layer B runtime statement-level verification (supporting runtime figure):
   - [plot_runtime_statement_verify_mean_ms.png](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\artifacts\proof-vrc\plot_runtime_statement_verify_mean_ms.png)

## Why two measurement layers are required

For accurate conclusions, we must keep two views in the same document:

1. **Raw proof benchmark (algorithm layer)**  
   Measures proof primitive cost directly in release mode, isolated from HTTP/JSON/backend overhead.
2. **Runtime benchmark (proof endpoint layer)**  
   Measures runtime proof verification behavior (ZKP endpoints) using proof material from final VRCs.

If we keep only one layer, conclusions are incomplete:

- raw-only misses deployment/runtime overhead
- runtime-only still includes endpoint/runtime effects, so it must be read together with raw release numbers

## KPI coverage

This document explicitly covers all requested proof KPIs:

- proof generation time (`Fiat-Shamir vs Bulletproof`) -> **raw layer**
- proof size (`Fiat-Shamir vs Bulletproof`) -> **raw + runtime layer**
- proof verification time (`Fiat-Shamir vs Bulletproof`) -> **raw + runtime layer**

Out of scope for this note:

- VC signature verification metrics (tracked separately in [23-dual-profile-vc-signing-and-verification.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\23-dual-profile-vc-signing-and-verification.md))

Scope note:

- Layer A is proof-family direct comparison.
- Layer B is profile-level runtime proof comparison (`public-price` profile vs `private-price` profile).

## Layer A: Raw proof benchmark (release mode)

Source benchmark and details:

- [16-marketplace-proof-comparison-summary.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\16-marketplace-proof-comparison-summary.md)
- [marketplace_proof_benchmark.rs](c:\Users\yamen\ev-battery-supplychain-erc7984\zkp-backend\src\bin\marketplace_proof_benchmark.rs)

Frozen reference run date:

- `2026-04-08` (release-mode rerun)

### A. Statement `payment = total`

| Metric | Fiat-Shamir | Bulletproof | Relative difference |
| --- | ---: | ---: | ---: |
| Generation median | `0.129 ms` | `7.319 ms` | Bulletproof `56.7x` slower |
| Generation mean | `0.137 ms` | `7.881 ms` | Bulletproof slower |
| Proof size | `64 bytes` | `417 bytes` | Bulletproof `6.5x` larger |
| Verification median | `0.480 ms` | `6.343 ms` | Bulletproof `13.2x` slower |
| Verification mean | `0.583 ms` | `7.789 ms` | Bulletproof slower |

### B. Statement `total = unitPrice * quantity`

| Metric | Fiat-Shamir | Bulletproof | Relative difference |
| --- | ---: | ---: | ---: |
| Generation median | `0.146 ms` | `7.366 ms` | Bulletproof `50.5x` slower |
| Generation mean | `0.145 ms` | `7.717 ms` | Bulletproof slower |
| Proof size | `64 bytes` | `417 bytes` | Bulletproof `6.5x` larger |
| Verification median | `0.608 ms` | `6.371 ms` | Bulletproof `10.5x` slower |
| Verification mean | `0.613 ms` | `6.572 ms` | Bulletproof slower |

Interpretation of Layer A:

- this is the cleanest evidence for **algorithmic proof-family efficiency**
- this is the correct layer for the thesis claim on primitive cost

## Layer B: Runtime proof verification benchmark (endpoint layer)

Script:

- [evaluate-dual-profile-proof-vrc.js](c:\Users\yamen\ev-battery-supplychain-erc7984\scripts\erc7984\evaluate-dual-profile-proof-vrc.js)

Run command used:

```powershell
npm run eval:erc7984:proof-vrc -- --iterations 100
```

Statistics reported by the script:

- mean
- median
- p95
- stddev

Execution date:

- `2026-04-24`

Dataset:

- public CIDs: `3`
- private CIDs: `3`
- total VRC samples: `6`
- all sampled proof endpoint checks returned `verified: true`

Layer B generation-time note:

- runtime proof **generation** is intentionally out of scope for this layer
- generation is benchmarked in Layer A with release-mode proof benchmarks
- Layer B focuses only on proof verification runtime

### Runtime aggregate results

| Metric | Public mean | Private mean | Relative difference |
| --- | ---: | ---: | ---: |
| Combined proof size (bytes) | `800` | `834` | private `+4.25%` |
| Combined proof verify mean (ms) | `20.866` | `153.060` | private `7.34x` slower |

Runtime central tendency and tail snapshot:

| Metric | Public median / p95 / stddev | Private median / p95 / stddev |
| --- | ---: | ---: |
| proof verify (ms) | `14.639 / 35.139 / 11.822` | `139.660 / 179.634 / 21.999` |

Note:

- these aggregate median/p95/stddev values are computed across per-CID means (`n=3` per profile), not over one pooled 300-call timing vector

Runtime proof-size decomposition (to reconcile `800/834`):

- script rule:
  - if `proofSizeBytes` exists, use it
  - else fallback to `proofHex + proofRHex + proofSHex + commitmentProof` byte sum
- public profile samples:
  - quantity-total: `64 B` (`proofRHex + proofSHex`)
  - total-payment: `736 B` (`proofRHex + proofSHex + commitmentProof`)
  - combined: `800 B`
- private profile samples:
  - quantity-total: `417 B` (explicit `proofSizeBytes`)
  - total-payment: `417 B` (explicit `proofSizeBytes`)
  - combined: `834 B`

Important interpretation:

- Layer A size (`64/417`) is primitive-level proof size.
- Layer B size (`800/834`) is VRC runtime payload-size accounting as currently serialized by the evaluation script.
- these two layers are intentionally different measurements and should not be merged into one ratio claim.

Statement-level proof verification means in runtime:

| Statement | Public mean (ms) | Private mean (ms) | Relative difference |
| --- | ---: | ---: | ---: |
| quantity-total verify | `11.081` | `99.427` | private `8.97x` slower |
| total-payment verify | `9.785` | `53.633` | private `5.48x` slower |

Interpretation of Layer B:

- captures runtime proof verification behavior using deployed proof endpoints
- includes runtime and endpoint jitter, but excludes signature-path analysis from this note
- useful for deployment/SLA planning of proof verification

## Reproducibility and confidence notes

- Layer A frozen date: `2026-04-08`
- Layer B runtime date: `2026-04-24`
- cross-layer comparisons are method-level comparisons, not strict same-build micro-comparisons
- for strict reproducibility, rerun Layer A and Layer B in the same environment snapshot and record commit/dependency lock
- Layer B uses `n=3` CIDs per profile and `100` iterations each; this is materially more stable than `10` iterations, but CID count is still small for strict production-SLA confidence
- Layer B proof gate status for this frozen run: `all_proof_checks_pass = True` (public and private)

## Final methodology decision (for accuracy)

For "most accurate and best way to evaluate", use this rule:

1. Use **Layer A (raw release benchmark)** as the primary basis for proof-family efficiency claims.
2. Use **Layer B (runtime proof benchmark)** as the primary basis for operational proof-verification behavior claims.
3. Report both side-by-side, with clear labels, in the same chapter.

This avoids mixing algorithmic cost with backend overhead and gives a defensible evaluation narrative.

## Current conclusion

On both measurement layers and both marketplace statements:

- **Layer A (proof-family claim):** Fiat-Shamir proofs are smaller, generate faster, and verify faster than Bulletproof for the two evaluated statements.
- **Layer B (profile-runtime proof claim):** the `private-price + Bulletproof` profile has slower proof verification than the `public-price + Fiat-Shamir` profile in this deployment path.

Status: **complete for proof KPI coverage** in this document.

## Artifact Index

Frozen runtime run file:

- [run-2026-04-24_185359.json](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\artifacts\proof-vrc\run-2026-04-24_185359.json)

CSV artifacts:

- [runtime_samples_proof_metrics.csv](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\artifacts\proof-vrc\runtime_samples_proof_metrics.csv)
- [runtime_aggregates_proof_metrics.csv](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\artifacts\proof-vrc\runtime_aggregates_proof_metrics.csv)
- [runtime_statement_proof_verify_metrics.csv](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\artifacts\proof-vrc\runtime_statement_proof_verify_metrics.csv)
- [layer_a_raw_proof_baseline.csv](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\artifacts\proof-vrc\layer_a_raw_proof_baseline.csv)

Plot artifacts (available set):

- [plot_runtime_combined_proof_verify_mean_ms.png](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\artifacts\proof-vrc\plot_runtime_combined_proof_verify_mean_ms.png)
- [plot_runtime_statement_verify_mean_ms.png](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\artifacts\proof-vrc\plot_runtime_statement_verify_mean_ms.png)
- [plot_layer_a_generation_median_ms.png](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\artifacts\proof-vrc\plot_layer_a_generation_median_ms.png)
- [plot_layer_a_proof_size_bytes.png](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\artifacts\proof-vrc\plot_layer_a_proof_size_bytes.png)
- [plot_layer_a_verification_median_ms.png](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\artifacts\proof-vrc\plot_layer_a_verification_median_ms.png)

Reproduction commands:

```powershell
$date = Get-Date -Format "yyyy-MM-dd_HHmmss"
npm run eval:erc7984:proof-vrc -- --iterations 100 --json-only | Out-File -FilePath "docs/erc7984-spike/artifacts/proof-vrc/run-$date.json" -Encoding utf8
python scripts/erc7984/export-proof-vrc-artifacts.py --input-json "docs/erc7984-spike/artifacts/proof-vrc/run-$date.json" --output-dir docs/erc7984-spike/artifacts/proof-vrc
```
