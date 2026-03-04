---
phase: 13-pre-payment-price-commitment-verification
plan: 02
subsystem: ui
tags: [react, commitment-verification, workstream, buyer-attestation, pedersen]

# Dependency graph
requires:
  - phase: 13-01
    provides: pre-payment Verify Price button and badge JSX in ProductDetail.jsx
  - phase: 12-02
    provides: openAndVerifyCommitment, generateDeterministicBlinding utilities
  - phase: 11-02
    provides: getProductMeta API utility for fetching priceWei from backend
provides:
  - simplified handleWorkstreamA using deterministic inputs (no MetaMask, no ECIES)
  - auto-run useEffect that fires Workstream A when buyer panel becomes visible
  - updated buyer attestation panel JSX (status indicator only, no manual button)
affects:
  - 13-03 (will clean up handleWorkstreamB decryptedOpening references and ecies import)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Auto-run pattern: useEffect with primitive deps fires handler on panel visibility, guards with null result + loading flag"
    - "Deterministic blinding derivation replaces ECIES decrypt for r_price in Workstream A"

key-files:
  created: []
  modified:
    - frontend/src/components/marketplace/ProductDetail.jsx

key-decisions:
  - "workstream-a-no-metamask: Workstream A uses getProductMeta + generateDeterministicBlinding — no wallet signing required"
  - "auto-run-primitive-deps: useEffect deps are [role.role, product?.phase, auditVC] — handleWorkstreamA excluded to avoid infinite re-render"
  - "silent-workstream-a: Workstream A is infrastructure (gates B), not a user action — shown as status text only"

patterns-established:
  - "Silent auto-run pattern: status indicator (loading/pass/fail text) replaces explicit action button when operation is deterministic and fast"

requirements-completed: []

# Metrics
duration: 4min
completed: 2026-03-04
---

# Phase 13 Plan 02: Simplify Workstream A — deterministic auto-run replacing ECIES decrypt + manual button

**Workstream A simplified to deterministic computation (getProductMeta + generateDeterministicBlinding) with silent auto-run via useEffect, removing the MetaMask dependency and manual Verify Price button from the post-payment buyer panel**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-04T16:47:42Z
- **Completed:** 2026-03-04T16:51:29Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Removed `decryptedOpening`/`setDecryptedOpening` state variable from buyer attestation state block
- Replaced `handleWorkstreamA` body: removed `getSigner`, `getBuyerSecretBlob`, `decryptBuyerBlob`, `decryptOpening` — now uses `getProductMeta` + `generateDeterministicBlinding` for fully deterministic verification
- Added auto-run `useEffect` that fires `handleWorkstreamA` when `role.role === 'buyer' && product?.phase >= Phase.OrderConfirmed && auditVC && workstreamAResult === null && !workstreamALoading`
- Removed `encryptedOpening` gate around Workstream A section in buyer panel JSX
- Removed manual "Verify Price" button from buyer panel (Workstream A is now a silent infrastructure step)
- Removed placeholder message "Price verification available once the seller confirms the order."
- Workstream B section preserved intact, gated on `workstreamAResult === true`

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove decryptedOpening state and simplify handleWorkstreamA** - `577c6561` (feat)
2. **Task 2: Add auto-run useEffect and update buyer attestation panel JSX** - `91400f2c` (feat)

**Plan metadata:** (docs commit — see state updates)

## Files Created/Modified
- `frontend/src/components/marketplace/ProductDetail.jsx` - Simplified handleWorkstreamA, added auto-run useEffect, updated buyer panel JSX

## Decisions Made
- **workstream-a-no-metamask:** Workstream A now derives all inputs deterministically without a wallet signer. `priceWei` from `getProductMeta(address)` and `r_price` from `generateDeterministicBlinding(address, product?.owner)` — same formula used by the seller during listing. No ECIES decrypt needed.
- **auto-run-primitive-deps:** The useEffect deps array is `[role.role, product?.phase, auditVC]` (primitive/stable values). `handleWorkstreamA` is intentionally excluded from deps to prevent infinite re-render (function reference changes on every render). Same pattern used by `loadProductData`.
- **silent-workstream-a:** Removed the manual "Verify Price" button from the post-payment buyer panel. Workstream A is infrastructure that gates Workstream B — showing it as a status indicator (loading/pass/fail text) rather than a user action is the correct UX for an automatic background step.

## Deviations from Plan

None - plan executed exactly as written.

Note: `handleWorkstreamB` still contains `decryptedOpening` references (lines 592-593) — this is intentional. The plan explicitly says "Do NOT change `handleWorkstreamB` in this task." Plan 13-03 removes those references and fixes the ecies import.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 13-03 ready to execute: remove `decryptedOpening` fallback block from `handleWorkstreamB` and fix ecies import (remove `decryptOpening` named import)
- After 13-03, the full Phase 13 flow is complete and ready for human verification

## Self-Check: PASSED

- FOUND: `frontend/src/components/marketplace/ProductDetail.jsx`
- FOUND: commit `577c6561` (Task 1)
- FOUND: commit `91400f2c` (Task 2)

---
*Phase: 13-pre-payment-price-commitment-verification*
*Completed: 2026-03-04*
