---
phase: 12-buyer-attestation-deferred-equality-proving
plan: 01
subsystem: database, api
tags: [sqlite, better-sqlite3, express, rest-api, buyer-attestation]

# Dependency graph
requires:
  - phase: 11-sqlite-metadata-persistence
    provides: db.js singleton, server.js with prepared-statements-at-startup pattern

provides:
  - buyer_secrets SQLite table with composite PK (product_address, buyer_address)
  - POST /buyer-secrets endpoint for upserting buyer secret blob at payment time
  - GET /buyer-secrets/:productAddress/:buyerAddress endpoint for reading stored blob + disclosurePubkey
  - PATCH /buyer-secrets/:productAddress/:buyerAddress/encrypted-opening endpoint for seller ciphertext writes
  - PATCH /buyer-secrets/:productAddress/:buyerAddress/equality-proof endpoint for buyer Schnorr proof writes

affects:
  - 12-02 (buyerSecretApi.js frontend utility)
  - 12-03 (PrivatePaymentModal integration)
  - 12-04 (ProductDetail seller-side integration)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - composite-PK-table: buyer_secrets uses (product_address, buyer_address) composite primary key via INSERT OR REPLACE
    - two-param-prepared-statements: stmtGetBuyerSecret and PATCH statements use positional ? params (not named @)

key-files:
  created: []
  modified:
    - backend/api/db.js
    - backend/api/server.js

key-decisions:
  - "buyer-secrets-composite-pk: Use (product_address, buyer_address) as composite PK; INSERT OR REPLACE handles upsert atomically"
  - "disclose-pubkey-unencrypted: disclosure_pubkey stored unencrypted so seller can read it without buyer decryption key"
  - "nullable-optional-fields: c_pay, c_pay_proof, encrypted_opening, equality_proof are nullable; written in separate lifecycle steps"

patterns-established:
  - "Two-param prepared statements: GET and PATCH buyer_secrets routes use positional ? params with (pa, ba) order"
  - "Address lowercase gate: all address path params lowercased before any DB operation"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-03-04
---

# Phase 12 Plan 01: buyer_secrets Table and REST API Summary

**SQLite buyer_secrets table with composite PK + 4 REST endpoints (POST/GET/2xPATCH) enabling buyer attestation write/read lifecycle**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-04T10:44:44Z
- **Completed:** 2026-03-04T10:47:03Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `buyer_secrets` table to `db.js` with composite PK `(product_address, buyer_address)` and 8 columns covering the full buyer attestation lifecycle (blob, pubkey, Pedersen commitment, range proof, encrypted opening, equality proof)
- Added 4 prepared statements to `server.js` at startup: upsert, get, update encrypted_opening, update equality_proof
- Added 4 REST routes to `server.js`: POST /buyer-secrets, GET /buyer-secrets/:pa/:ba, PATCH .../encrypted-opening, PATCH .../equality-proof — all lowercasing address params before DB ops

## Task Commits

Each task was committed atomically:

1. **Task 1: Add buyer_secrets table to db.js** - `e1223fec` (feat)
2. **Task 2: Add 4 buyer_secrets REST routes to server.js** - `0e315a4a` (feat)

## Files Created/Modified

- `backend/api/db.js` - Added buyer_secrets CREATE TABLE IF NOT EXISTS block after product_metadata block
- `backend/api/server.js` - Added 4 prepared statements after stmtUpdateVcCid; added 4 routes before app.listen

## Decisions Made

- Used `INSERT OR REPLACE INTO buyer_secrets` for upsert (same pattern as product_metadata); the composite PK ensures replacement on re-submission
- `disclosure_pubkey` stored unencrypted so the seller can read it during confirmOrder without needing the buyer's decryption key
- Optional columns (`c_pay`, `c_pay_proof`, `encrypted_opening`, `equality_proof`) are nullable; each is written in a separate lifecycle step by the appropriate party
- PATCH routes return 404 if `result.changes === 0` (no matching row), matching the existing /metadata/:address/vc-cid pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `buyer_secrets` table available in `metadata.sqlite`; server starts cleanly on port 5000
- All 4 endpoints ready for integration with frontend `buyerSecretApi.js` utility (12-02)
- Existing `/metadata` routes remain fully unmodified and working

## Self-Check: PASSED

- FOUND: backend/api/db.js
- FOUND: backend/api/server.js
- FOUND: .planning/phases/12-buyer-attestation-deferred-equality-proving/12-01-SUMMARY.md
- FOUND commit: e1223fec (feat(12-01): add buyer_secrets table to db.js)
- FOUND commit: 0e315a4a (feat(12-01): add 4 buyer_secrets REST routes to server.js)

---
*Phase: 12-buyer-attestation-deferred-equality-proving*
*Completed: 2026-03-04*
