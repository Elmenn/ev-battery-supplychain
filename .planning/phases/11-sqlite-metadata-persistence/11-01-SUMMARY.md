---
phase: 11-sqlite-metadata-persistence
plan: 01
subsystem: database
tags: [better-sqlite3, sqlite, express, cors, rest-api, metadata]

# Dependency graph
requires: []
provides:
  - better-sqlite3 singleton db.js module with WAL mode and auto-created data/ directory
  - product_metadata SQLite table (product_address, product_meta, price_wei, price_commitment, seller_railgun_address, vc_cid)
  - POST /metadata endpoint (upsert, returns 201)
  - GET /metadata/:address endpoint (returns all fields or 404)
  - PATCH /metadata/:address/vc-cid endpoint (updates vcCid or returns 404)
  - CORS updated to allow GET, POST, PATCH from localhost:3000 and localhost:3001
affects:
  - 11-02 (productMetaApi.js frontend utility depends on these endpoints)
  - 11-03 (ProductFormStep3.jsx saves to API)
  - 11-04 (ProductDetail.jsx and PrivatePaymentModal.jsx read from API)

# Tech tracking
tech-stack:
  added: [better-sqlite3@12.6.2]
  patterns:
    - Singleton db.js module pattern (exported Database instance, WAL mode, table init at module load)
    - Prepared statements created once at server startup for performance
    - Address normalisation to lowercase on every DB read/write (eliminates case-sensitive mismatch)
    - fs.mkdirSync recursive to auto-create data/ directory before opening DB

key-files:
  created:
    - backend/api/db.js
    - backend/api/data/metadata.sqlite (auto-created, not committed)
  modified:
    - backend/api/server.js
    - backend/api/package.json
    - backend/api/package-lock.json

key-decisions:
  - "sqlite-singleton-module: db.js exports a single Database instance; server.js does require('./db')"
  - "wal-mode: db.pragma('journal_mode = WAL') set at startup for concurrent reads"
  - "auto-create-data-dir: fs.mkdirSync(..., { recursive: true }) prevents ENOENT if data/ missing"
  - "address-normalise-lowercase: all route handlers lowercase :address before DB ops; POST body address also lowercased"
  - "prepared-statements-at-startup: stmtUpsert, stmtGet, stmtUpdateVcCid prepared once, not per-request"

patterns-established:
  - "DB module: export singleton Database from db.js, require in server.js"
  - "CORS pattern: methods array must include all HTTP verbs used by browser (GET, POST, PATCH)"
  - "Address normalisation: always .toLowerCase() before SQLite TEXT comparison"

# Metrics
duration: previously committed (executed prior session 2026-02-26)
completed: 2026-02-26
---

# Phase 11 Plan 01: SQLite Backend Setup Summary

**better-sqlite3 installed, db.js singleton with WAL mode created, and Express server updated with CORS fix (GET/PATCH added) and three metadata REST endpoints (POST, GET, PATCH)**

## Performance

- **Duration:** Previously committed (tasks were committed during prior session on 2026-02-26)
- **Started:** 2026-02-26
- **Completed:** 2026-02-26
- **Tasks:** 2 of 2
- **Files modified:** 4 (db.js created, server.js, package.json, package-lock.json)

## Accomplishments

- Created `backend/api/db.js`: singleton better-sqlite3 Database instance with WAL mode, auto-creates `data/` directory, initialises `product_metadata` table with `CREATE TABLE IF NOT EXISTS`
- Fixed CORS in `server.js`: expanded `methods` from `['POST']` to `['GET', 'POST', 'PATCH']` — browser preflight no longer blocks new endpoints
- Added all three metadata REST endpoints to `server.js` with prepared statements created once at startup: `POST /metadata` (upsert, 201), `GET /metadata/:address` (200 or 404), `PATCH /metadata/:address/vc-cid` (200 or 404)
- All route handlers normalise address to lowercase before querying — eliminates the case-sensitive matching complexity present in the frontend `findLocalStorageValueByAddress` helper

## Task Commits

Each task was committed atomically:

1. **Task 1: Install better-sqlite3 and create db.js** - `d8344100` (feat)
2. **Task 2: Fix CORS and add metadata routes to server.js** - `14e9242e` (feat)

## Files Created/Modified

- `backend/api/db.js` - Singleton better-sqlite3 Database with WAL mode, auto-creates data/ dir, initialises product_metadata table
- `backend/api/server.js` - CORS methods updated to include GET/PATCH; three metadata routes added; require('./db') and prepared statements at startup
- `backend/api/package.json` - `"better-sqlite3": "^12.6.2"` added to dependencies
- `backend/api/package-lock.json` - Updated with better-sqlite3 and transitive deps

## Decisions Made

- **sqlite-singleton-module:** db.js exports one Database instance. Server.js does `const db = require('./db')`. Isolates DB init from routing logic and makes it independently testable.
- **wal-mode:** Single `db.pragma('journal_mode = WAL')` call at startup. No async plumbing needed — WAL is a synchronous pragma.
- **auto-create-data-dir:** `fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })` runs before `new Database(...)`. Prevents ENOENT on first startup when `data/` doesn't yet exist.
- **address-normalise-lowercase:** All incoming addresses lowercased before any DB operation. Eliminates the case-insensitive scanning loop from `findLocalStorageValueByAddress` on the backend side.
- **prepared-statements-at-startup:** `stmtUpsert`, `stmtGet`, `stmtUpdateVcCid` prepared once after `const app = express()`, not inside each route handler. Avoids re-parsing SQL on every request.
- **DB_PATH env override:** `process.env.DB_PATH || path.join(__dirname, 'data', 'metadata.sqlite')`. Allows Docker/production override without code changes.

## Deviations from Plan

None - plan executed exactly as written. All code was already in the committed state from a prior session.

## Issues Encountered

None. All 6 verification tests passed:
- Test 1: POST /metadata returns `{"success":true,"productAddress":"0xabc..."}` (201)
- Test 2: GET /metadata/:address returns all fields including productMeta JSON parsed
- Test 3: GET /metadata/unknown returns 404
- Test 4: PATCH /metadata/:address/vc-cid returns `{"success":true}`
- Test 5: GET after PATCH shows updated vcCid
- Test 6: CORS OPTIONS preflight returns `Access-Control-Allow-Methods: GET,POST,PATCH`

## User Setup Required

None - no external service configuration required. The SQLite database file is created automatically at `backend/api/data/metadata.sqlite` on first server start.

## Next Phase Readiness

- Backend API is fully operational. `node server.js` starts cleanly.
- Three endpoints ready for frontend consumption: POST /metadata, GET /metadata/:address, PATCH /metadata/:address/vc-cid
- Address normalisation handled server-side — frontend only needs to call the API, no case-handling needed
- Next: Plan 11-02 creates `frontend/src/utils/productMetaApi.js` utility to wrap these endpoints with localStorage fallback

---
*Phase: 11-sqlite-metadata-persistence*
*Completed: 2026-02-26*
