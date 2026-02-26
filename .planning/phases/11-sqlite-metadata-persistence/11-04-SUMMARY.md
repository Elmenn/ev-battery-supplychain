---
phase: 11-sqlite-metadata-persistence
plan: 04
subsystem: frontend-component
tags: [react, localstorage-fallback, db-first, cross-device, productdetail, vcCid]

# Dependency graph
requires:
  - phase: 11-02
    provides: getProductMeta (null-return read contract) and updateVcCid (throw-on-failure write contract) in productMetaApi.js
  - phase: 11-01
    provides: GET /metadata/:address and PATCH /metadata/:address/vc-cid REST endpoints
provides:
  - ProductDetail.jsx with DB-first reads for vcCid, productMeta, sellerRailgunAddress
  - ProductDetail.jsx with DB write for vcCid after IPFS upload in handleConfirmOrder
  - ProductDetail.jsx with DB write for vcCid after auditor manually loads a CID in handleLoadAuditVC
affects:
  - Auditors: can now open ProductDetail on any device and see pre-filled vcCid if seller has confirmed order
  - Sellers on new devices: can now confirm order even with empty localStorage if DB has productMeta
  - All future VC verification flows that depend on vcCid cross-device availability

# Tech tracking
tech-stack:
  added: []
  patterns:
    - DB-first read pattern: await getProductMeta(address) → check data?.vcCid → fall back to localStorage if null
    - DB-first productMeta pattern: await getProductMeta(address) → check dbData?.productMeta → else localStorage block
    - Non-blocking DB write pattern: try { await updateVcCid(...) } catch (dbErr) { console.warn(...) } — DB failure never blocks main flow
    - Layered sellerRailgunAddress resolution: dbData?.sellerRailgunAddress || listingMeta?.sellerRailgunAddress || findLocalStorageValueByAddress(...)

key-files:
  created: []
  modified:
    - frontend/src/components/marketplace/ProductDetail.jsx

key-decisions:
  - "db-first-read-graceful-fallback: vcCid useEffect and handleConfirmOrder both try DB first, then fall back to localStorage — pre-migration products still work"
  - "non-blocking-db-write: updateVcCid calls in handleConfirmOrder and handleLoadAuditVC are always wrapped in try/catch — DB failure is a console.warn, not a user-visible error"
  - "layered-sellerRailgunAddress: three-level resolution (DB → listingMeta → localStorage) ensures widest device compatibility"

patterns-established:
  - "DB-first component pattern: component reads try backend API first (null-return on failure), then fall back to localStorage — enables cross-device usage without breaking same-device flows"
  - "Non-blocking DB write: fire-and-forget DB writes after the real side-effecting operation (IPFS upload, audit load) so DB unavailability is never user-visible"

# Metrics
duration: 5min
completed: 2026-02-26
---

# Phase 11 Plan 04: ProductDetail.jsx DB-First Wiring Summary

**ProductDetail.jsx wired to read vcCid and productMeta from DB first with transparent localStorage fallback, and to write vcCid to DB after IPFS upload and after auditor CID entry**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-26
- **Completed:** 2026-02-26
- **Tasks:** 2 of 2
- **Files modified:** 1 (ProductDetail.jsx)

## Accomplishments

- Added `import { getProductMeta, updateVcCid } from '../../utils/productMetaApi'` to ProductDetail.jsx
- **vcCid useEffect (read site 1):** Now calls `getProductMeta(address)` first; if `data?.vcCid` is present it uses that value and returns early. Falls back to `localStorage.getItem('vcCid_...')` if DB returns null or vcCid is missing.
- **handleConfirmOrder productMeta (read site 2):** Replaced the raw localStorage block with a DB-first lookup via `getProductMeta(address)`. If `dbData?.productMeta` is present, uses it directly. Falls back to `findLocalStorageValueByAddress("productMeta_", address)` with unchanged error message path.
- **handleConfirmOrder sellerRailgunAddress (read site 3):** Now resolves as `dbData?.sellerRailgunAddress || listingMeta?.sellerRailgunAddress || findLocalStorageValueByAddress(...)`.
- **handleConfirmOrder vcCid write (write site 1):** After `localStorage.setItem('vcCid_...', newCid)`, calls `await updateVcCid(address, newCid)` wrapped in try/catch — DB failure logs a console.warn and never blocks the on-chain confirmOrder call.
- **handleLoadAuditVC vcCid write (write site 2):** After `localStorage.setItem('vcCid_...', cid)`, calls `await updateVcCid(address, cid)` wrapped in try/catch — DB failure logs a console.warn and never blocks the audit loading flow or the success toast.

## Task Commits

Each task was committed atomically:

1. **Task 1: Update read sites** - `3ebaa7a3` (feat)
2. **Task 2: Update vcCid write sites** - `5cae1ba5` (feat)

**Plan metadata:** (committed with SUMMARY.md and STATE.md update)

## Files Created/Modified

- `frontend/src/components/marketplace/ProductDetail.jsx` - Added import for productMetaApi; updated 3 read sites to DB-first; added 2 non-blocking DB write calls after existing localStorage writes

## Decisions Made

- **DB-first read with transparent fallback:** Both read sites check the backend API first using `getProductMeta`, which returns null (not throws) on 404 or network error. The existing localStorage code remains intact in the else/fallback path. This means pre-migration products (created before Phase 11) continue to work identically on the original device.
- **Non-blocking DB writes:** Both write sites use `try { await updateVcCid(...) } catch (dbErr) { console.warn(...) }`. The DB write must never block or error the main flow. The seller's on-chain confirmOrder and the auditor's VC load succeed regardless of whether the backend DB is reachable.
- **Layered sellerRailgunAddress resolution:** `dbData?.sellerRailgunAddress || listingMeta?.sellerRailgunAddress || findLocalStorageValueByAddress(...)` — DB is preferred, then the productMeta object from DB (which contains sellerRailgunAddress as a field), then the separate localStorage key. This covers all migration scenarios.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no configuration needed. The feature activates automatically when the backend server is running. When the backend is unavailable, all flows continue using localStorage as before.

## Next Phase Readiness

- Phase 11 Plan 04 is complete — ProductDetail.jsx is fully wired for cross-device DB-first metadata access
- Auditors and sellers can open ProductDetail from any device and see pre-filled vcCid and productMeta from the DB
- The localStorage fallback ensures no regression for pre-migration products
- Phase 11 is now complete (all 4 plans executed: 11-01 through 11-04)

---
*Phase: 11-sqlite-metadata-persistence*
*Completed: 2026-02-26*
