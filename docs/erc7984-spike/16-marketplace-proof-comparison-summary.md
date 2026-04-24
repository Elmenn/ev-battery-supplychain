# Marketplace Proof Comparison Summary

## Scope

This note summarizes the measured backend proof-primitive comparison between:

- Fiat-Shamir-transformed sigma proofs
- Bulletproof R1CS proofs

for the two ERC-7984 marketplace statements:

1. `payment = total`
2. `total = unitPrice * quantity`

The comparison metrics are:

- proof generation time
- proof size
- proof verification time

Role in the dual-profile evaluation set:

- this note is the canonical **Layer A raw baseline** for proof-family efficiency
- runtime proof verification cross-checks are tracked separately in [22-dual-profile-proof-and-vrc-evaluation.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\22-dual-profile-proof-and-vrc-evaluation.md)

All values below come from real executed repository benchmarks.

Final timing claims in this note use only the dedicated release-mode benchmark binary:

- [marketplace_proof_benchmark.rs](c:\Users\yamen\ev-battery-supplychain-erc7984\zkp-backend\src\bin\marketplace_proof_benchmark.rs)

Earlier ad hoc `cargo test` timings were discarded for final reporting because they were not stable enough. The tables below freeze the final figures to the latest release-mode rerun on `2026-04-08`.

## Compared statements and implementations

### 1. `payment = total`

- Fiat-Shamir:
  - [equality_proof.rs](c:\Users\yamen\ev-battery-supplychain-erc7984\zkp-backend\src\zk\equality_proof.rs)
- Bulletproof:
  - [bp_payment_total_proof.rs](c:\Users\yamen\ev-battery-supplychain-erc7984\zkp-backend\src\zk\bp_payment_total_proof.rs)

Benchmarks:

- [evaluation_payment_total_generation.rs](c:\Users\yamen\ev-battery-supplychain-erc7984\zkp-backend\tests\evaluation_payment_total_generation.rs)
- [evaluation_payment_total_size.rs](c:\Users\yamen\ev-battery-supplychain-erc7984\zkp-backend\tests\evaluation_payment_total_size.rs)
- [evaluation_payment_total_verification.rs](c:\Users\yamen\ev-battery-supplychain-erc7984\zkp-backend\tests\evaluation_payment_total_verification.rs)
- [evaluation_payment_total_verification_core.rs](c:\Users\yamen\ev-battery-supplychain-erc7984\zkp-backend\tests\evaluation_payment_total_verification_core.rs)

### 2. `total = unitPrice * quantity`

- Fiat-Shamir:
  - [quantity_total_proof.rs](c:\Users\yamen\ev-battery-supplychain-erc7984\zkp-backend\src\zk\quantity_total_proof.rs)
- Bulletproof:
  - [bp_quantity_total_proof.rs](c:\Users\yamen\ev-battery-supplychain-erc7984\zkp-backend\src\zk\bp_quantity_total_proof.rs)

Benchmarks:

- [evaluation_quantity_total_generation.rs](c:\Users\yamen\ev-battery-supplychain-erc7984\zkp-backend\tests\evaluation_quantity_total_generation.rs)
- [evaluation_quantity_total_size.rs](c:\Users\yamen\ev-battery-supplychain-erc7984\zkp-backend\tests\evaluation_quantity_total_size.rs)
- [evaluation_quantity_total_verification.rs](c:\Users\yamen\ev-battery-supplychain-erc7984\zkp-backend\tests\evaluation_quantity_total_verification.rs)
- [evaluation_quantity_total_verification_core.rs](c:\Users\yamen\ev-battery-supplychain-erc7984\zkp-backend\tests\evaluation_quantity_total_verification_core.rs)

## Fairness notes

The comparison is statement-matched and input-matched:

- same logical statement under both proof families
- same commitment inputs
- same binding context

One correction was applied before finalizing the `payment = total` generation result:

- the Bulletproof API path originally included an internal self-verification safety check
- the reported generation benchmark excludes that extra verification step
- so the generation number reflects actual proof construction more fairly

For `total = unitPrice * quantity`, one interpretation note matters:

- `unitPrice` is public in the current ERC-7984 model
- the Bulletproof circuit therefore encodes a linear relation using a public scalar
- this is still a valid benchmark for the current implemented marketplace statement
- but it is not a benchmark of a fully hidden-hidden multiplication proof

## Results tables

### A. `payment = total`

| Metric | Fiat-Shamir | Bulletproof |
| --- | ---: | ---: |
| Generation median | `0.129 ms` | `7.319 ms` |
| Generation mean | `0.137 ms` | `7.881 ms` |
| Proof size | `64 bytes` | `417 bytes` |
| Verification median | `0.480 ms` | `6.343 ms` |
| Verification mean | `0.583 ms` | `7.789 ms` |
| Core-only verification median | `0.480 ms` | `5.915 ms` |
| Core-only verification mean | `0.583 ms` | `6.678 ms` |

Observed ratios:

- generation median: Bulletproof about `56.7x` slower
- verification median: Bulletproof about `13.2x` slower
- core-only verification median: Bulletproof about `12.3x` slower
- proof size: Bulletproof about `6.5x` larger

### B. `total = unitPrice * quantity`

| Metric | Fiat-Shamir | Bulletproof |
| --- | ---: | ---: |
| Generation median | `0.146 ms` | `7.366 ms` |
| Generation mean | `0.145 ms` | `7.717 ms` |
| Proof size | `64 bytes` | `417 bytes` |
| Verification median | `0.608 ms` | `6.371 ms` |
| Verification mean | `0.613 ms` | `6.572 ms` |
| Core-only verification median | `0.608 ms` | `6.068 ms` |
| Core-only verification mean | `0.613 ms` | `6.282 ms` |

Observed ratios:

- generation median: Bulletproof about `50.5x` slower
- verification median: Bulletproof about `10.5x` slower
- core-only verification median: Bulletproof about `10.0x` slower
- proof size: Bulletproof about `6.5x` larger

## Interpretation

Across both marketplace statements, the measured result is consistent:

- the Fiat-Shamir proofs are smaller
- the Fiat-Shamir proofs generate faster
- the Fiat-Shamir proofs verify faster

The added core-only verification benchmarks matter because they remove Bulletproof proof deserialization from the timed region. Even after that adjustment, the Bulletproof verifier remains substantially slower than the Fiat-Shamir verifier on both statements.

So the current result is not just a serialization artifact.

The key improvement over the earlier ad hoc test timings is that the release-mode benchmark stayed in the same performance band across consecutive executions. That makes the final comparison much more defensible than the earlier `cargo test` timings.

## Current conclusion

For the two ERC-7984 marketplace relations currently evaluated:

- `payment = total`
- `total = unitPrice * quantity`

the measured implementation in this repository shows that the Fiat-Shamir proof family is more efficient than the Bulletproof alternative in:

- proof generation time
- proof size
- proof verification time

This is a statement-specific and implementation-specific conclusion.

## Boundary of this conclusion

This summary does **not** support the claim that Fiat-Shamir is always better than Bulletproof in general.

It supports the narrower claim that:

- for the two current ERC-7984 marketplace statements
- under the present implementation style
- Fiat-Shamir is more efficient than the Bulletproof alternative
