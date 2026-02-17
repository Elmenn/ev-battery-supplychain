---
phase: 09-ui-rework
plan: 03
subsystem: ui
tags: [react, ethers, bond, vc-builder, tailwind, metamask]

requires:
  - phase: 07-smart-contract-redesign
    provides: "ProductFactory with bondAmount and createProduct(name, commitment) payable"
  - phase: 08-single-vc-architecture
    provides: "createListingVC v2.0 append-only VC builder"

provides:
  - "ProductFormStep3 with bond disclosure and confirmation modal"
  - "Simplified web3Utils with ethers-only contract calls"
  - "v2.0 VC creation in seller product listing flow"

affects: [09-04, 09-05, 09-06]

tech-stack:
  added: []
  patterns:
    - "Bond disclosure card with useEffect fetch on mount"
    - "Confirmation modal before irreversible blockchain transaction"
    - "v2.0 createListingVC replaces manual VC construction"

key-files:
  created: []
  modified:
    - "frontend/src/components/marketplace/ProductFormStep3.jsx"
    - "frontend/src/utils/web3Utils.js"

key-decisions:
  - "bond-fetch-on-mount: Fetch bondAmount via read-only provider on component mount (not at transaction time)"
  - "confirmation-modal-pattern: Two-step deployment: button shows modal, modal triggers transaction"
  - "v2-proof-array: Store issuer proof in VC proof array (v2.0 pattern) instead of proofs.issuerProof object"

patterns-established:
  - "Bond disclosure: Always show exact ETH amount before any value-locking transaction"
  - "Modal confirmation: Irreversible transactions require explicit confirmation via modal"

duration: 10min
completed: 2026-02-17
---

# Phase 9 Plan 3: Seller Flow + web3Utils Summary

**Bond disclosure card + confirmation modal in ProductFormStep3, v2.0 VC via createListingVC, ethers-only web3Utils**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-17T16:06:10Z
- **Completed:** 2026-02-17T16:16:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Seller sees exact bond amount (fetched from factory) before clicking deploy
- Confirmation modal prevents accidental bond deposits
- VC creation uses v2.0 createListingVC (append-only pattern) instead of manual object
- web3Utils.confirmOrder simplified to call contract.confirmOrder(vcCID) -- no commitment param
- Web3.js dependency removed from web3Utils (ethers-only)
- Inline styles converted to Tailwind classes in ProductFormStep3

## Task Commits

Each task was committed atomically:

1. **Task 1: Add bond disclosure to ProductFormStep3 and switch to v2.0 VC** - `b5a98942` (feat)
2. **Task 2: Simplify web3Utils.js for new contract interface** - `ea503b8e` (feat)

## Files Created/Modified
- `frontend/src/components/marketplace/ProductFormStep3.jsx` - Bond disclosure card, confirmation modal, createListingVC integration, Tailwind conversion
- `frontend/src/utils/web3Utils.js` - Simplified confirmOrder(address, vcCID), ethers-only getTransporters, removed Web3.js

## Decisions Made
- **bond-fetch-on-mount:** Bond amount fetched via read-only JsonRpcProvider on mount, not deferred to transaction time. Rationale: user needs to see amount before deciding to proceed.
- **confirmation-modal-pattern:** Deploy button opens modal; modal "Confirm & Lock Bond" button triggers actual transaction. Rationale: prevents accidental ETH locking.
- **v2-proof-array:** Issuer proof stored as `vc.proof = [issuerProof]` (array) matching v2.0 pattern, instead of old `vc.proofs = { issuerProof }` object. Rationale: v2.0 schema uses proof array for append-only proofs.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- ProductDetail.jsx still passes 3 args to confirmOrder (extra purchaseTxHashCommitment). JavaScript silently ignores the extra argument so no breakage, but will need cleanup in a future plan covering ProductDetail.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- ProductFormStep3 now uses v2.0 VC and shows bond disclosure
- web3Utils ready for new contract interface
- ProductDetail.jsx still needs update (passes stale 3rd arg to confirmOrder) -- covered by plan 09-04 or 09-05

---
*Phase: 09-ui-rework*
*Completed: 2026-02-17*
