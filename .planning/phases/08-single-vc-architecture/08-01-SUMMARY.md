---
phase: 08-single-vc-architecture
plan: 01
subsystem: credentials
tags: [verifiable-credentials, w3c-vc, append-only, ethers, json-canonicalize]

requires:
  - phase: 07-smart-contract-redesign
    provides: "ProductEscrow_Initializer with confirmOrder(vcCID) and confirmDelivery(hash)"
provides:
  - "createListingVC: W3C-ish VC with schemaVersion 2.0, null payment/delivery"
  - "appendPaymentProof: immutable append of payment section to VC"
  - "appendDeliveryProof: immutable append of delivery section to VC"
  - "hashVcPayload and freezeVcJson preserved for hashing/canonicalization"
  - "Deprecated stubs for buildStage2VC/buildStage3VC so existing imports compile"
affects:
  - 08-02 (ipfs fetch, signing types)
  - 08-03 (VC verifier)
  - 09-ui-integration (call site migration from old stage functions)

tech-stack:
  added: []
  patterns:
    - "Append-only single-document VC pattern (create + append sections)"
    - "Deep clone immutability (JSON.parse/stringify) for VC mutations"
    - "Deprecated stub exports with descriptive Error throws"

key-files:
  created: []
  modified:
    - "frontend/src/utils/vcBuilder.mjs"
  deleted:
    - "frontend/src/utils/vcBuilder.js"

key-decisions:
  - "vc-schema-v2: schemaVersion 2.0 distinguishes append-only VCs from old stage-based 1.0"
  - "zero-addr-holder: Unknown buyer uses ZeroAddress in holder DID at listing time"
  - "throw-on-deprecated: Deprecated stubs throw descriptive errors instead of silent no-ops"

patterns-established:
  - "Append-only VC: createListingVC -> appendPaymentProof -> appendDeliveryProof"
  - "previousVersion field links IPFS CID versions (null for first version)"

duration: 3min
completed: 2026-02-17
---

# Phase 8 Plan 1: VC Builder Rewrite Summary

**Append-only single-VC builder replacing 3-stage pattern with createListingVC, appendPaymentProof, appendDeliveryProof exports**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-16T23:20:49Z
- **Completed:** 2026-02-16T23:23:19Z
- **Tasks:** 2/2
- **Files modified:** 1 modified, 1 deleted

## Accomplishments

- Rewrote vcBuilder.mjs from 410 lines (with dead mock code) to 126 clean lines
- Three lifecycle functions: createListingVC (W3C-ish VC with null payment/delivery), appendPaymentProof (fills payment, updates holder, immutable), appendDeliveryProof (fills delivery, immutable)
- Preserved hashVcPayload and freezeVcJson utilities unchanged
- Deprecated stubs for buildStage2VC and buildStage3VC throw descriptive errors pointing to new API
- Deleted CJS duplicate vcBuilder.js (145 lines removed)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite vcBuilder.mjs with append-only VC functions and deprecated stubs** - `0755ab60` (feat)
2. **Task 2: Delete vcBuilder.js CJS duplicate** - `a224901e` (chore)

## Files Created/Modified

- `frontend/src/utils/vcBuilder.mjs` - Rewritten: createListingVC, appendPaymentProof, appendDeliveryProof, hashVcPayload, freezeVcJson, deprecated stubs
- `frontend/src/utils/vcBuilder.js` - DELETED (CJS duplicate)

## Decisions Made

- **vc-schema-v2:** schemaVersion "2.0" clearly distinguishes new append-only VCs from old stage-based "1.0" format
- **zero-addr-holder:** At listing time, buyer is unknown (FCFS pattern), so holder DID uses ethers.ZeroAddress with name "T.B.D."
- **throw-on-deprecated:** Deprecated stubs throw descriptive Error messages instead of silent no-ops, so developers immediately know which new function to use

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `createProduct.js` (Express route, not React app) imports from `vcBuilder` via CJS require(). This is NOT a React app import so it does not break the frontend build, but needs updating in Phase 9. Noted as TODO.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- vcBuilder.mjs is ready for Phase 8 Plan 2 (IPFS fetchJson, EIP-712 signing type updates)
- All existing imports in App.js, ProductDetail.jsx, and test files still compile (deprecated stubs in place)
- createProduct.js Express route needs vcBuilder import update (Phase 9 scope)

---
*Phase: 08-single-vc-architecture*
*Completed: 2026-02-17*
