---
phase: 11-sqlite-metadata-persistence
plan: 05
subsystem: railgun-ui
tags: [react, localstorage-fallback, cross-device, fetch, private-payment]

# Dependency graph
requires:
  - phase: 11-02
    provides: getProductMeta null-return read contract from productMetaApi.js
provides:
  - frontend/src/components/railgun/PrivatePaymentModal.jsx with DB-first sellerRailgunAddress and priceWei resolution
  - Three-step resolution for sellerRailgunAddress: localStorage direct, localStorage productMeta, DB
  - Two-step resolution for priceWei: localStorage, DB
  - Cross-device payment enablement: buyer on any device sees pre-filled address and amount
affects:
  - End-users: buyers can now complete purchases from any device (not just seller's device)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - DB-first with localStorage fast path and DB fallback (DB lookup only reached on cross-device access)
    - Async IIFE in useEffect for DB-backed priceWei hydration
    - localStorage caching of DB results for session-level performance (avoids repeated API calls)
    - Three-step resolution: localStorage exact -> localStorage meta -> DB

key-files:
  created: []
  modified:
    - frontend/src/components/railgun/PrivatePaymentModal.jsx

key-decisions:
  - "db-as-step-3: DB lookup is step 3 after localStorage paths, not step 1 — seller's own device never hits API; cross-device buyer falls through localStorage steps and reaches DB"
  - "session-cache-db-result: DB-returned sellerRailgunAddress cached to localStorage so subsequent modal opens in same session use the fast path"
  - "async-iife-useeffect: priceWei useEffect uses (async () => { })() pattern because useEffect callbacks cannot be async directly"

patterns-established:
  - "DB-first with localStorage fast path: check localStorage first (O(1)), fall through to DB only when localStorage misses"
  - "Session caching after DB hit: write DB result back to localStorage so next open in same session is instant"

# Metrics
duration: 2min
completed: 2026-02-26
---

# Phase 11 Plan 05: PrivatePaymentModal DB-First Resolution Summary

**DB-first resolution of sellerRailgunAddress and priceWei in PrivatePaymentModal enables buyers on any device to complete purchases without seller metadata in localStorage**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-26T11:31:03Z
- **Completed:** 2026-02-26T11:33:15Z
- **Tasks:** 2 of 2
- **Files modified:** 1 (PrivatePaymentModal.jsx)

## Accomplishments

- Added `import { getProductMeta } from '../../utils/productMetaApi'` to PrivatePaymentModal
- Rewrote `resolveSellerRailgunAddress` with three-step resolution: localStorage direct key, localStorage productMeta JSON, then DB via `getProductMeta`. DB result is cached to localStorage for the session.
- Updated the priceWei `useEffect` with an async IIFE — tries localStorage first, falls back to `getProductMeta` DB call when localStorage is empty
- `pending_private_payment_*` ephemeral retry cache lines are completely untouched
- All existing localStorage flows work without regression on the seller's original device (DB lookup never reached when localStorage has data)

## Task Commits

Each task was committed atomically:

1. **Tasks 1 and 2: DB-first resolution for both sellerRailgunAddress and priceWei** - `9ade14e2` (feat)

   Both tasks modify only `PrivatePaymentModal.jsx` and share the same import; committed together.

**Plan metadata:** (committed with SUMMARY.md and STATE.md update)

## Files Created/Modified

- `frontend/src/components/railgun/PrivatePaymentModal.jsx` - Added getProductMeta import; rewrote resolveSellerRailgunAddress with three-step resolution including DB fallback; updated priceWei useEffect to use async IIFE with DB fallback; 39 insertions, 8 deletions

## Decisions Made

- **db-as-step-3:** The DB lookup in `resolveSellerRailgunAddress` is deliberately placed as the third step, after two localStorage paths. On the seller's own device, step 1 (localStorage direct) always succeeds and the API is never called. On a buyer's different device, steps 1 and 2 return null and the DB provides the address. This ordering prevents an unnecessary HTTP round-trip on every modal open for the common case.

- **session-cache-db-result:** When the DB returns a valid `sellerRailgunAddress`, it is written back to `localStorage.setItem(`sellerRailgunAddress_${product.address}`, ...)`. This means if the buyer closes and reopens the modal within the same session, the next open is served from localStorage (step 1), not DB. The trade-off: if the seller changes their Railgun address, the buyer's cache would be stale for the session — acceptable given how rarely Railgun addresses change.

- **async-iife-useeffect:** React `useEffect` callbacks cannot be declared `async` directly (doing so returns a Promise which React ignores, causing "effect returned a cleanup function that returns a non-void value" warnings). The pattern `(async () => { ... })()` is the standard workaround. This matches the pattern used in other useEffects in the codebase.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - the DB lookup uses `getProductMeta` from Plan 11-02, which reads `REACT_APP_BACKEND_URL` from the environment with `http://localhost:5000` as default. No additional configuration required.

## Next Phase Readiness

- Phase 11 Plans 11-03 and 11-04 (ProductFormStep3, ProductDetail) remain to be executed
- After those plans complete, the full SQLite persistence flow is in place:
  - Seller creates product → saves metadata to DB (11-03)
  - Buyer opens PrivatePaymentModal → resolves address and price from DB (this plan)
  - Seller/auditor opens ProductDetail → loads vcCid from DB (11-04)
- No blockers for remaining Phase 11 plans

---
*Phase: 11-sqlite-metadata-persistence*
*Completed: 2026-02-26*
