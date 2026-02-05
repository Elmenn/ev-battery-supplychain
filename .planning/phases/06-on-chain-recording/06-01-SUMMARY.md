---
phase: 06-on-chain-recording
plan: 01
subsystem: payments
tags: [ethers, smart-contract, ProductEscrow, recordPrivatePayment, error-handling]

# Dependency graph
requires:
  - phase: 05-private-transfer
    provides: privateTransfer function returning memoHash and railgunTxRef
provides:
  - recordPrivatePayment call after private transfer
  - decodeContractError for ProductEscrow errors
  - On-chain recording of Railgun payment references
affects: [06-02 UI updates, marketplace state]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Preflight check with staticCall before transactions"
    - "Gas estimation with 20% headroom pattern"
    - "Toast with Etherscan link pattern"

key-files:
  created: []
  modified:
    - frontend/src/utils/errorHandler.js
    - frontend/src/components/railgun/PrivatePaymentModal.jsx

key-decisions:
  - "Buyer records payment immediately after transfer (not seller)"
  - "Preflight check catches errors before gas spent"
  - "localStorage tracks recording/confirmed status"

patterns-established:
  - "decodeContractError maps contract reverts to user-friendly messages"
  - "recordPrivatePayment called in same flow as privateTransfer"

# Metrics
duration: 12min
completed: 2026-02-05
---

# Phase 6 Plan 1: On-Chain Recording Summary

**recordPrivatePayment call after privateTransfer with preflight check, gas estimation, and Etherscan link in success toast**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-05T15:30:00Z
- **Completed:** 2026-02-05T15:42:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- decodeContractError function handles all 9 ProductEscrow custom errors
- PrivatePaymentModal calls recordPrivatePayment immediately after privateTransfer
- Preflight check with staticCall catches contract errors before sending transaction
- Success toast shows clickable Etherscan link for transparency

## Task Commits

Each task was committed atomically:

1. **Task 1: Add decodeContractError to errorHandler.js** - `02cb7399` (feat)
2. **Task 2: Add recordPrivatePayment flow to PrivatePaymentModal** - `c4110ee2` (feat)

## Files Created/Modified
- `frontend/src/utils/errorHandler.js` - Added decodeContractError function with 9 error mappings
- `frontend/src/components/railgun/PrivatePaymentModal.jsx` - Added recordPrivatePayment flow after privateTransfer

## Decisions Made
- **Immediate recording:** recordPrivatePayment called in same flow as privateTransfer (no separate step)
- **Preflight check:** staticCall validates transaction will succeed before spending gas
- **Gas headroom:** 20% gas buffer prevents out-of-gas failures
- **localStorage state machine:** status transitions from 'pending' -> 'recording' -> 'confirmed'

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- On-chain recording flow complete and wired into PrivatePaymentModal
- Ready for Phase 6 Plan 2 (UI updates to show purchase status)
- ProductCard badge update may be needed to differentiate private purchases

---
*Phase: 06-on-chain-recording*
*Completed: 2026-02-05*
