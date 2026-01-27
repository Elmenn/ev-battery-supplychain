---
phase: 05-private-transfer
plan: 01
subsystem: payments
tags: [railgun, zk-proof, private-transfer, sdk, ethers]

# Dependency graph
requires:
  - phase: 04-weth-shielding
    provides: Shield pattern, SDK initialization, WETH handling
provides:
  - privateTransfer function with 3-step SDK flow
  - memoHash and railgunTxRef for on-chain recording
  - Progress callback during proof generation
affects: [05-02-ui-integration, 06-on-chain-recording]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 3-step SDK flow (gas estimate, proof generation, populate)
    - Signature-derived encryptionKey pattern
    - BigInt for transfer amounts (differs from shield string pattern)

key-files:
  created:
    - frontend/src/lib/railgun-clean/operations/transfer.js
  modified:
    - frontend/src/lib/railgun-clean/index.js

key-decisions:
  - "Derive encryptionKey from signature (not stored in localStorage)"
  - "Use BigInt for amounts (SDK transfer expectation differs from shield)"
  - "Return memoHash and railgunTxRef for Phase 6 on-chain recording"

patterns-established:
  - "3-step transfer flow: gasEstimateForUnprovenTransfer -> generateTransferProof -> populateProvedTransfer"
  - "operations/ subdirectory for complex SDK operations"

# Metrics
duration: 4min
completed: 2026-01-27
---

# Phase 5 Plan 1: Private Transfer Core Summary

**privateTransfer function implementing Railgun SDK 3-step flow (estimate, prove, populate) with signature-derived encryptionKey and memoHash/railgunTxRef return values**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-27T08:39:14Z
- **Completed:** 2026-01-27T08:42:49Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created transfer.js with full 3-step SDK transfer implementation
- Signature-derived encryptionKey pattern (matches shield.js pattern)
- Returns memoHash and railgunTxRef for Phase 6 on-chain recording
- Progress callback reporting during 20-30 second proof generation
- Exported privateTransfer from index.js, replacing legacy paySellerV2 alias

## Task Commits

Each task was committed atomically:

1. **Task 1: Create transfer.js with 3-step SDK flow** - `fbd1b77d` (feat)
2. **Task 2: Export privateTransfer from index.js** - `23921d55` (feat)

## Files Created/Modified

- `frontend/src/lib/railgun-clean/operations/transfer.js` - Private transfer implementation with 3-step SDK flow
- `frontend/src/lib/railgun-clean/index.js` - Added import and export for privateTransfer from operations/transfer.js

## Decisions Made

1. **Derive encryptionKey from signature:** Following the pattern from shield.js (getShieldPrivateKey), the encryptionKey is derived from a MetaMask signature rather than being stored in localStorage. This provides better security - the key only exists transiently during operations.

2. **Use BigInt for amounts:** The SDK transfer functions expect BigInt for amounts, unlike shield which uses strings. This is a critical difference to avoid SDK errors.

3. **Return memoHash and railgunTxRef:** These values are required for Phase 6 on-chain recording via `recordPrivatePayment()`. The memoHash is keccak256 of the memo text, and railgunTxRef is the first nullifier from the transaction.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - implementation followed research document patterns precisely.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for Phase 5 Plan 2 (UI Integration):
- privateTransfer function exported and callable
- Progress callback enables UI progress display
- Returns success/error object with all needed data
- memoHash and railgunTxRef available for on-chain recording

No blockers identified.

---
*Phase: 05-private-transfer*
*Completed: 2026-01-27*
