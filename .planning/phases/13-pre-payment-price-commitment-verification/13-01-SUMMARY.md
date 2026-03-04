---
phase: 13-pre-payment-price-commitment-verification
plan: "01"
subsystem: frontend
tags: [zkp, price-verification, buyer-ux, commitments]
dependency_graph:
  requires:
    - commitmentUtils.js (openAndVerifyCommitment)
    - productMetaApi.js (getProductMeta)
    - commitmentUtils.js (generateDeterministicBlinding)
  provides:
    - priceVerifyStatus state in ProductDetail.jsx
    - handleVerifyPrice handler in ProductDetail.jsx
    - Verify Price badge JSX in ProductDetail.jsx
  affects:
    - frontend/src/components/marketplace/ProductDetail.jsx
tech_stack:
  added: []
  patterns:
    - null-return-contract for getProductMeta (returns null on error, never throws)
    - deterministic-blinding (keccak256(productAddress, sellerAddress))
    - five-state-badge (null | loading | verified | mismatch | error)
key_files:
  created: []
  modified:
    - frontend/src/components/marketplace/ProductDetail.jsx
decisions:
  - id: meta-not-onchain-commitment
    summary: "Use meta.priceCommitment from DB (real Pedersen C_price), not product.priceCommitment (on-chain keccak256 placeholder)"
    rationale: "On-chain priceCommitment is always a keccak256 placeholder; real C_price lives in DB/VC"
  - id: phase-only-gate
    summary: "Badge gated on product.phase === Phase.Listed only — no priceCommitment check"
    rationale: "On-chain field is always truthy (placeholder); gating on it is meaningless. DB-missing case surfaces as 'error' state"
  - id: seller-commitment-record-wording
    summary: "Verified text reads 'seller commitment record' not 'on-chain commitment'"
    rationale: "Accurate for current architecture where C_price lives in DB/VC, not on-chain"
  - id: buy-button-unblocked
    summary: "Buy with Railgun button not blocked by verification status"
    rationale: "Buyer autonomy — verification is informational, not a gate"
metrics:
  duration_seconds: 523
  completed_date: "2026-03-04"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 1
---

# Phase 13 Plan 01: Pre-Payment Price Verification — ProductDetail.jsx Summary

**One-liner:** Buyer-facing "Verify Price" button using ZKP to cryptographically confirm seller's Pedersen commitment (C_price from DB) matches listed price before payment.

## What Was Built

Added a pre-payment price verification UI to `ProductDetail.jsx` that lets any potential buyer independently verify the seller's Pedersen commitment before opening the payment modal — no seller cooperation or MetaMask signing required.

### New State Variable

`priceVerifyStatus` — five-state machine:
- `null` — initial state (Verify Price button shown, no badge)
- `'loading'` — ZKP call in progress (button disabled, shows "Verifying...")
- `'verified'` — ZKP confirmed match (green badge)
- `'mismatch'` — ZKP detected mismatch (red warning)
- `'error'` — network/data unavailable (amber message + Retry button)

### New Handler: handleVerifyPrice

Located after `handleLoadAuditVC`, before `// Buyer Attestation Handlers`.

Flow:
1. Calls `getProductMeta(address)` to fetch `priceWei` AND `priceCommitment` (real Pedersen C_price) from DB in a single call
2. Derives `r_price` deterministically via `generateDeterministicBlinding(address, product?.owner)`
3. Calls `openAndVerifyCommitment({ value, blindingPrice, cPriceHex })` against ZKP backend
4. Sets `priceVerifyStatus` to `'verified'` or `'mismatch'` based on result
5. Network errors / missing DB data -> `'error'` state (not `'mismatch'`)

Critical correctness: uses `meta.priceCommitment` (DB/VC, real C_price) not `product.priceCommitment` (on-chain keccak256 placeholder).

### New Badge JSX

Inserted directly above the "BUYER: Buy with Railgun" block. Gated on `product.phase === Phase.Listed` only. Visible to all roles (visitor, buyer, seller).

## Deviations from Plan

None — plan executed exactly as written.

## Out-of-Scope Discovery (deferred)

Pre-existing webpack build failure: `Module not found: Error: Can't resolve 'crypto'` in `@railgun-community/engine`. Present before phase 13. Logged to `deferred-items.md`. Development server unaffected.

## Success Criteria Verification

- [x] `priceVerifyStatus` state variable added to ProductDetail.jsx (line 131)
- [x] `handleVerifyPrice` reads `cPriceHex` from `meta.priceCommitment` (NOT `product.priceCommitment`)
- [x] `handleVerifyPrice` reads `priceWei` and `priceCommitment` from same `getProductMeta(address)` call
- [x] Badge JSX added above "Buy with Railgun" button, gated on `product.phase === Phase.Listed` only
- [x] Verified badge text: "listed price matches seller commitment record"
- [x] Error state shows Retry button alongside amber message
- [x] Five badge states: null, loading, verified, mismatch, error
- [x] "Buy with Railgun" button not modified — buyer autonomy preserved
- [x] No new imports required (all utilities already imported)

## Commits

| Task | Hash | Message |
|------|------|---------|
| Task 1 | 3531d8b0 | feat(13-01): add priceVerifyStatus state and handleVerifyPrice handler |
| Task 2 | 07d8e8cd | feat(13-01): add pre-payment price verification badge JSX above Buy with Railgun button |

## Self-Check: PASSED

- FOUND: frontend/src/components/marketplace/ProductDetail.jsx
- FOUND: .planning/phases/13-pre-payment-price-commitment-verification/13-01-SUMMARY.md
- FOUND: commit 3531d8b0
- FOUND: commit 07d8e8cd
