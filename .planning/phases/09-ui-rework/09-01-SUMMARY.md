---
phase: 09-ui-rework
plan: 01
subsystem: frontend-shared
tags: [escrow-helpers, shared-components, qrcode, phase-timeline, countdown]

dependency-graph:
  requires: [07-01, 08-03]
  provides: [escrowHelpers, PhaseTimeline, HashDisplay, CountdownTimer, BondCard]
  affects: [09-02, 09-03, 09-04, 09-05, 09-06]

tech-stack:
  added: [qrcode.react@4.2.0]
  patterns: [centralized-contract-helper, shared-component-library]

key-files:
  created:
    - frontend/src/utils/escrowHelpers.js
    - frontend/src/components/shared/PhaseTimeline.jsx
    - frontend/src/components/shared/HashDisplay.jsx
    - frontend/src/components/shared/CountdownTimer.jsx
    - frontend/src/components/shared/BondCard.jsx
  modified:
    - frontend/package.json
    - frontend/package-lock.json

decisions:
  - id: centralized-escrow-helpers
    decision: Single escrowHelpers.js for all contract reads
    rationale: Eliminates scattered ethers.Contract instantiation across components

metrics:
  duration: ~15min
  completed: 2026-02-17
---

# Phase 9 Plan 1: Shared Components and Escrow Helpers Summary

**One-liner:** Centralized escrow contract helper (Phase enum, getProductState with memo/txRef reads) plus 4 shared UI components (PhaseTimeline, HashDisplay with QR, CountdownTimer, BondCard)

## What Was Done

### Task 1: escrowHelpers.js + qrcode.react installation

- Installed `qrcode.react@4.2.0` for QR code generation in HashDisplay
- Created `escrowHelpers.js` with:
  - `Phase` enum matching contract (Listed=0 through Expired=5, NO "Slashed")
  - `PHASE_LABELS` mapping phase numbers to display strings
  - Time window constants: `SELLER_WINDOW`, `BID_WINDOW`, `DELIVERY_WINDOW` (all 172800s)
  - `getEscrowContract(address, signerOrProvider)` factory function
  - `getProductState(address, provider)` two-step parallel read:
    - Step 1: All scalar fields including `id`
    - Step 2: `productMemoHashes(id)` and `productRailgunTxRefs(id)` mappings
  - `detectRole(product, currentUser)` returning seller/buyer/transporter/visitor
- ABI import path: `../abis/ProductEscrow_Initializer.json` (correct for src/utils/ to src/abis/)
- Uses ethers v6 API (Contract, ZeroAddress, formatEther)

### Task 2: Shared UI Components

- **PhaseTimeline.jsx** (76 lines): Adaptive stepper showing exactly 6 contract phases. Desktop: horizontal circles with connecting lines (green=complete, blue=current, gray=future, red=expired). Mobile: vertical badge list. No "Slashed" phase.
- **HashDisplay.jsx** (67 lines): Truncated hash display (10+8 chars) with clipboard copy button ("Copied!" feedback for 2s), QR code via QRCodeSVG, and optional guidance text. Shows "Not yet available" for empty/zero hashes.
- **CountdownTimer.jsx** (59 lines): Live h:m:s countdown with 1-second interval and proper cleanup. Color thresholds: green (>25%), yellow (<=25%), red (<=10%). Shows "Expired" when deadline passed. Absolute deadline shown below.
- **BondCard.jsx** (32 lines): Read-only bond display with Shield icon (lucide-react), ETH amount via formatEther, explanation text. Amber-themed card.

## Mandatory Corrections Applied

1. **ABI import path:** Used `../abis/...` (NOT `../../abis/...`) since escrowHelpers.js is in `src/utils/`
2. **No "Slashed" phase:** Phase enum has exactly 6 values (Listed through Expired). PhaseTimeline renders only these 6 steps.
3. **Buyer hash visibility:** Documented for consumers -- HashDisplay shows "Not yet available" for zero hashes. Consumers should only pass hash when phase >= Bound.

## Deviations from Plan

None -- plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| 70e8f112 | feat(09-01): create escrowHelpers.js and install qrcode.react |
| 25960e53 | feat(09-01): create shared UI components (PhaseTimeline, HashDisplay, CountdownTimer, BondCard) |

## Next Phase Readiness

All shared components are ready for composition in:
- 09-02: ProductCard (will use PhaseTimeline, CountdownTimer)
- 09-04: ProductDetail buyer flow (will use HashDisplay, BondCard, CountdownTimer)
- 09-05: Transporter flow (will use PhaseTimeline, BondCard)
