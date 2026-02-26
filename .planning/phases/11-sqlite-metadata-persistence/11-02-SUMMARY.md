---
phase: 11-sqlite-metadata-persistence
plan: 02
subsystem: api
tags: [fetch, rest-api, localstorage-fallback, frontend-utility, react]

# Dependency graph
requires:
  - phase: 11-01
    provides: POST /metadata, GET /metadata/:address, PATCH /metadata/:address/vc-cid backend endpoints
provides:
  - frontend/src/utils/productMetaApi.js with saveProductMeta, getProductMeta, updateVcCid
  - getProductMeta null-return contract (no throw on 404 or network error)
  - saveProductMeta and updateVcCid throw-on-failure contract
  - BACKEND_URL constant from REACT_APP_BACKEND_URL env var with localhost:5000 default
affects:
  - 11-03 (ProductFormStep3.jsx imports saveProductMeta from this module)
  - 11-04 (ProductDetail.jsx imports getProductMeta and updateVcCid from this module)
  - 11-05 (PrivatePaymentModal.jsx imports getProductMeta from this module)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Module-level BACKEND_URL constant from process.env with fallback (same pattern as verifyVc.js)
    - Null-return contract for read functions (getProductMeta returns null, not throw, for 404 and network errors)
    - Throw-on-failure for write functions (saveProductMeta and updateVcCid throw on non-2xx)
    - Address lowercasing at the API boundary before fetch (eliminates case-sensitive mismatch)

key-files:
  created:
    - frontend/src/utils/productMetaApi.js
  modified: []

key-decisions:
  - "null-return-read-contract: getProductMeta returns null for 404 and network errors instead of throwing — allows callers to fall back to localStorage without try/catch at every call site"
  - "throw-write-contract: saveProductMeta and updateVcCid throw on failure — write errors must be surfaced, not silently swallowed"
  - "module-level-BACKEND_URL: REACT_APP_BACKEND_URL env var with http://localhost:5000 default at module level — no prop drilling required"

patterns-established:
  - "Null-return read pattern: async fetch wrappers for reads catch all errors and return null (not throw) to enable transparent localStorage fallback at call sites"
  - "API boundary lowercasing: all addresses lowercased via address.toLowerCase() before inclusion in fetch URL or POST body"

# Metrics
duration: 1min
completed: 2026-02-26
---

# Phase 11 Plan 02: productMetaApi.js Frontend Utility Summary

**Fetch wrapper module with null-return read contract for graceful localStorage fallback and throw-on-failure write contract for error surfacing**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-02-26T11:27:24Z
- **Completed:** 2026-02-26T11:28:27Z
- **Tasks:** 1 of 1
- **Files modified:** 1 (productMetaApi.js created)

## Accomplishments

- Created `frontend/src/utils/productMetaApi.js` as the single source of truth for all metadata REST calls
- `getProductMeta` returns null (not a rejection) for both 404 responses and network errors, enabling callers to fall back to localStorage without try/catch boilerplate
- `saveProductMeta` and `updateVcCid` throw on failure so write errors are surfaced to the caller
- All three Wave 3 plans (11-03, 11-04, 11-05) can import from this module without modification

## Task Commits

Each task was committed atomically:

1. **Task 1: Create productMetaApi.js** - `cb901612` (feat)

**Plan metadata:** (committed with SUMMARY.md and STATE.md update)

## Files Created/Modified

- `frontend/src/utils/productMetaApi.js` - Three async export functions wrapping POST /metadata, GET /metadata/:address, and PATCH /metadata/:address/vc-cid; BACKEND_URL from env

## Decisions Made

- **null-return-read-contract:** `getProductMeta` wraps the entire fetch in try/catch and returns null for both 404 responses and network errors. This is intentional: callers (ProductDetail, PrivatePaymentModal) implement a two-step read (try API, fall back to localStorage). Without the null-return contract, callers would need try/catch at every call site.
- **throw-write-contract:** `saveProductMeta` and `updateVcCid` do not catch errors. Write failures must be visible — silently swallowing a failed POST/PATCH would leave the DB and UI out of sync.
- **module-level BACKEND_URL:** Defined at module scope using `process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000'`, matching the pattern in `verifyVc.js`. No prop drilling from App.js required.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. The utility reads `REACT_APP_BACKEND_URL` from the environment if set; otherwise falls back to `http://localhost:5000`.

## Next Phase Readiness

- `productMetaApi.js` is fully operational and ready for import by Wave 3 plans
- Plans 11-03, 11-04, 11-05 can `import { saveProductMeta, getProductMeta, updateVcCid } from '../../utils/productMetaApi'` without modification
- The null-return contract means no try/catch needed in components for read operations
- No blockers

---
*Phase: 11-sqlite-metadata-persistence*
*Completed: 2026-02-26*
