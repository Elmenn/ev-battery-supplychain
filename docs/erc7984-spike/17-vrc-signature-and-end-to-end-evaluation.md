# VRC Signature And End-To-End Evaluation

This note closes the remaining non-smart-contract evaluation items:

- signature verification time
- total latency for VRC creation
- total latency for VRC verification

All values below come from real executed repository benchmarks or from arithmetic over already measured results.

The proof component in this note uses the frozen final release-mode benchmark from [16-marketplace-proof-comparison-summary.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\16-marketplace-proof-comparison-summary.md).

The signature component was remeasured with a batched Node benchmark on `2026-04-08`. Because the local JavaScript runtime still shows some spread across repeated runs, this note reports a range for the signature-dependent KPIs instead of a single exact point.

## Scope

This note builds on:

- [13-smart-contract-evaluation-summary.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\13-smart-contract-evaluation-summary.md)
- [16-marketplace-proof-comparison-summary.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\16-marketplace-proof-comparison-summary.md)

It covers:

- current EIP-712 VRC signature verification
- off-chain proof verification totals
- end-to-end creation and verification latency

It does not introduce any synthetic or estimated numbers beyond direct addition of already measured components.

## Signature verification benchmark

Benchmark harness:

- [evaluate-vrc-signature-verification.js](c:\Users\yamen\ev-battery-supplychain-erc7984\scripts\erc7984\evaluate-vrc-signature-verification.js)

Measured verifier path:

- current local EIP-712 typed-data verification
- `schemaVersion = 6.1`
- payload format `eip712-v4-erc7984-vrc-typed`
- two signatures per VRC:
  - seller / issuer
  - buyer / holder

The benchmark measures the real current verifier work per signature:

- DID/address extraction and matching
- EIP-712 payload-hash recomputation
- `verifyTypedData(...)`
- recovered-signer comparison

Two consecutive batched runs were taken with:

- `5` warmup samples
- `15` measured samples
- `25` verifications per sample

Observed results across the two runs:

| Signature metric | Observed range |
| --- | ---: |
| Issuer signature verification median | `48.820 - 51.410 ms` |
| Holder signature verification median | `48.318 - 48.794 ms` |
| Full VRC two-signature verification median | `93.430 - 106.649 ms` |
| Full VRC two-signature verification mean | `87.914 - 108.670 ms` |

## End-to-end VRC creation latency

The requested KPI is:

- `Total latency for VRC creation = Txn confirmation time + proof generation`

For the current ERC-7984 marketplace flow, the transaction component is the measured buyer confidential purchase confirmation latency from the repeated confidential benchmark:

- buyer confidential purchase average confirmation latency:
  - `54,427 ms`

Proof-generation totals are the sums of the two marketplace statements:

- `payment = total`
- `total = unitPrice * quantity`

Using the frozen release-mode proof-generation medians from the final proof benchmark:

| Proof family | `payment = total` generation median | `total = unitPrice * quantity` generation median | Combined proof generation median |
| --- | ---: | ---: | ---: |
| Fiat-Shamir | `0.129 ms` | `0.146 ms` | `0.275 ms` |
| Bulletproof | `7.319 ms` | `7.366 ms` | `14.685 ms` |

So the end-to-end VRC creation medians are:

| Proof family | Tx confirmation average | Proof generation median | Total VRC creation range |
| --- | ---: | ---: | ---: |
| Fiat-Shamir | `54,427.000 ms` | `0.275 ms` | `54,427.275 ms` |
| Bulletproof | `54,427.000 ms` | `14.685 ms` | `54,441.685 ms` |

Equivalent wall-clock interpretation:

- Fiat-Shamir VRC creation:
  - about `54.427 s`
- Bulletproof VRC creation:
  - about `54.442 s`

## End-to-end VRC verification latency

The requested KPI is:

- `Total VRC verification = Signature + proof verification`

The signature component uses the measured full two-signature VRC verification pass:

- full VRC signature verification median range:
  - `93.430 - 106.649 ms`

Proof-verification totals use the frozen release-mode verifier medians from the final proof benchmark.

Using the measured proof-verification medians:

| Proof family | `payment = total` verification median | `total = unitPrice * quantity` verification median | Combined proof verification median |
| --- | ---: | ---: | ---: |
| Fiat-Shamir | `0.480 ms` | `0.608 ms` | `1.088 ms` |
| Bulletproof | `6.343 ms` | `6.371 ms` | `12.714 ms` |

So the end-to-end VRC verification medians are:

| Proof family | Signature verification median | Proof verification median | Total VRC verification range |
| --- | ---: | ---: | ---: |
| Fiat-Shamir | `93.430 - 106.649 ms` | `1.088 ms` | `94.518 - 107.737 ms` |
| Bulletproof | `93.430 - 106.649 ms` | `12.714 ms` | `106.144 - 119.363 ms` |

Equivalent wall-clock interpretation:

- Fiat-Shamir VRC verification:
  - about `0.095 - 0.108 s`
- Bulletproof VRC verification:
  - about `0.106 - 0.119 s`

## KPI status against the requested list

| KPI | Status | Evidence |
| --- | --- | --- |
| Txn gas cost for confidential txns vs ERC20 | complete | [13-smart-contract-evaluation-summary.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\13-smart-contract-evaluation-summary.md) |
| Txn latency avg | complete | [13-smart-contract-evaluation-summary.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\13-smart-contract-evaluation-summary.md) |
| On-chain proof verification latency per proof | not applicable in current architecture | the marketplace Bulletproof / Fiat-Shamir proofs are verified off-chain rather than by an on-chain proof verifier |
| Proof generation time, Fiat-Shamir vs Bulletproof | complete | [16-marketplace-proof-comparison-summary.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\16-marketplace-proof-comparison-summary.md) |
| Proof size, Fiat-Shamir vs Bulletproof | complete | [16-marketplace-proof-comparison-summary.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\16-marketplace-proof-comparison-summary.md) |
| Verification time, Fiat-Shamir vs Bulletproof | complete | [16-marketplace-proof-comparison-summary.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\16-marketplace-proof-comparison-summary.md) |
| Signature verification time | complete | [evaluate-vrc-signature-verification.js](c:\Users\yamen\ev-battery-supplychain-erc7984\scripts\erc7984\evaluate-vrc-signature-verification.js) |
| Total latency for VRC creation | complete | this note |
| Total VRC verification | complete | this note |

## Final status

Against the stated KPI list, no required evaluation item is still missing.

The only item that remains intentionally marked as not applicable is:

- on-chain proof verification latency per proof

because the current ERC-7984 marketplace design verifies these privacy proofs off-chain rather than through an on-chain proof verifier.
