# Dual-Profile VC Signing And Verification

This note isolates VC signing/signature verification from ZKP proof evaluation.

It is intentionally separate from:

- [22-dual-profile-proof-and-vrc-evaluation.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\22-dual-profile-proof-and-vrc-evaluation.md)

Scope boundary:

- `22` covers proof generation/size/verification only
- this note covers VC signing and signature verification behavior only

## Why separated

Across the two profiles:

- `public-price + Fiat-Shamir`
- `private-price + Bulletproof`

the VC signature scheme is the same (`EIP-712`, secp256k1).  
The profile difference is in ZKP proof family and proof payload, not in signature primitive.

## Signature benchmark source

Primary benchmark script:

- [evaluate-vrc-signature-verification.js](c:\Users\yamen\ev-battery-supplychain-erc7984\scripts\erc7984\evaluate-vrc-signature-verification.js)

Measured settings in that benchmark:

- warmup samples: `5`
- measured samples: `15`
- iterations per sample: `25`

## Signature verification results (existing baseline)

From [17-vrc-signature-and-end-to-end-evaluation.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\17-vrc-signature-and-end-to-end-evaluation.md):

| Signature metric | Observed range |
| --- | ---: |
| Issuer signature verification median | `48.820 - 51.410 ms` |
| Holder signature verification median | `48.318 - 48.794 ms` |
| Full VRC two-signature verification median | `93.430 - 106.649 ms` |

## Dual-profile runtime cross-check

Using the six real dual-profile VRCs (`n=3 + n=3`) through backend `/verify-vc`:

- issuer/holder signature checks passed for all `6/6`
- signature is stable functionally across both profiles
- latest frozen runtime cycle (`2026-04-24`) also reports proof checks passing for all sampled CIDs in:
  - [runtime_aggregates_proof_metrics.csv](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\artifacts\proof-vrc\runtime_aggregates_proof_metrics.csv)
  - [run-2026-04-24_185359.json](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\artifacts\proof-vrc\run-2026-04-24_185359.json)

Important:

- full `/verify-vc` timing is not a pure signature metric because it includes proof verification and backend/runtime overhead
- for profile comparisons, signature should be treated as common baseline and ZKP should be treated as differentiator

## KPI mapping

This note closes the VC-signature-focused KPI items:

- signature verification time
- VC signing/verification path clarity independent of ZKP family
