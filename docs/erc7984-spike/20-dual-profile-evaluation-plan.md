# Dual-Profile Evaluation Plan

## Purpose

This note defines the evaluation structure for the dual-profile ERC-7984 marketplace.

The comparison target is:

- `public-price + Fiat-Shamir`
- `private-price + Bulletproof`

This is a comparison of two marketplace privacy profiles, not a universal proof-system ranking.

## Relationship to earlier evaluation notes

The earlier evaluation notes remain useful, but they now play different roles:

- [13-smart-contract-evaluation-summary.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\13-smart-contract-evaluation-summary.md)
  - keep as the original smart-contract baseline
- [16-marketplace-proof-comparison-summary.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\16-marketplace-proof-comparison-summary.md)
  - keep as the earlier proof-family baseline
- [17-vrc-signature-and-end-to-end-evaluation.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\17-vrc-signature-and-end-to-end-evaluation.md)
  - keep as the earlier VRC/end-to-end baseline

They should not be overwritten immediately.

The dual-profile track should produce new evaluation notes that supersede them for the final architectural comparison.

## New evaluation outputs

The clean structure is:

1. one new dual-profile smart-contract and runtime comparison note
2. one new dual-profile ZKP proof comparison note
3. one new dual-profile VC signing/verification note

Recommended filenames:

- `21-dual-profile-smart-contract-evaluation.md`
- `22-dual-profile-proof-and-vrc-evaluation.md`
- `23-dual-profile-vc-signing-and-verification.md`

## Evaluation A: Smart-contract and runtime comparison

This note should compare the two live marketplace profiles on Sepolia.

### Scope

- `public-price` runtime flow
- `private-price` runtime flow
- same chain
- same deployment family
- comparable product/order conditions

### Metrics

- transaction count per profile
- gas used per major transaction
- fee paid per major transaction
- confirmation latency per major transaction
- full buyer-side runtime total
- full seller-side runtime total
- full transporter/delivery runtime total if exercised
- full end-to-end runtime total

### Minimum comparable transaction set

For both profiles, collect the same core steps where possible:

- create product
- buyer deposit / purchase
- seller bond deposit
- seller equality finalization if present
- seller confirm order

Optional extended slice:

- transporter bid
- seller select transporter
- seller delivery-fee deposit
- transporter bond deposit
- transporter equality finalization
- confirm delivery

### Questions this note should answer

- does `private-price` introduce extra on-chain cost beyond `public-price`?
- which profile is more expensive in the core order flow?
- does privacy mainly shift cost off-chain, or also on-chain?

## Evaluation B: ZKP proof comparison

This note should compare the two profiles at the ZKP proof and proof-verifier layer.

### Scope

- `public-price` VRC with Fiat-Shamir proofs
- `private-price` VRC with Bulletproof proofs
- complete VRC generation and unified backend verification

### Metrics

- quantity-total proof generation time
- total-payment proof generation time
- combined proof generation time per order
- quantity-total proof size
- total-payment proof size
- combined embedded proof payload size
- backend `/verify-vc` quantity-total proof verification time
- backend `/verify-vc` total-payment proof verification time

### VRC content checks

For both profiles, the evaluation should also confirm the VRC carries the correct proof material.

#### Public-price VRC should include

- `priceVisibility = public`
- `unitPriceWei`
- `unitPriceHash`
- Fiat-Shamir proof records with `proofRHex` / `proofSHex`

#### Private-price VRC should include

- `priceVisibility = private`
- `priceCommitment`
- Bulletproof proof records with `proofHex`
- supporting proof metadata such as `proofType`, `proofFamily`, `proofEngine`, `proofSizeBytes`

### Questions this note should answer

- what is the proof-performance cost of the more private profile?
- how much larger is the private-price VRC proof payload?
- does unified proof verification work equally well for both profiles?

## Evaluation C: VC signing and verification

This note should isolate signature behavior from ZKP behavior.

### Scope

- EIP-712 VC signing path
- issuer/holder signature verification path
- DID-based key resolution path used by backend verification

### Metrics

- issuer signature verification time
- holder signature verification time
- full two-signature VC verification time
- signature verification success rate on sampled dual-profile VRCs

### Questions this note should answer

- are signatures independent from profile choice?
- is signature verification stable and successful across both profiles?

## KPI mapping

This dual-profile evaluation should close the updated KPI list as follows:

| KPI | New source |
| --- | --- |
| Txn gas cost for confidential txns | `21-dual-profile-smart-contract-evaluation.md` |
| Txn latency avg | `21-dual-profile-smart-contract-evaluation.md` |
| Proof generation time | `22-dual-profile-proof-and-vrc-evaluation.md` |
| Proof size | `22-dual-profile-proof-and-vrc-evaluation.md` |
| Proof verification time | `22-dual-profile-proof-and-vrc-evaluation.md` |
| Signature verification time | `23-dual-profile-vc-signing-and-verification.md` |
| Total latency for VRC creation | `23-dual-profile-vc-signing-and-verification.md` + `21-dual-profile-smart-contract-evaluation.md` |
| Total VRC verification | `23-dual-profile-vc-signing-and-verification.md` + `22-dual-profile-proof-and-vrc-evaluation.md` |

## Measurement order

The recommended order is:

1. collect smart-contract/runtime data for `public-price`
2. collect smart-contract/runtime data for `private-price`
3. run proof and VRC measurements for `public-price`
4. run proof and VRC measurements for `private-price`
5. write the two new comparison notes

## Immediate next task

The next concrete task should be:

- run and record the dual-profile smart-contract/runtime comparison first

That gives the on-chain half of the story before the proof/VRC metrics are added.
