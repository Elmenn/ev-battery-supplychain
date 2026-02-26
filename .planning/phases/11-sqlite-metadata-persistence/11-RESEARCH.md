# Phase 11: SQLite Metadata Persistence - Research

**Researched:** 2026-02-26
**Domain:** SQLite / Express REST API / browser localStorage migration
**Confidence:** HIGH (direct code analysis of all affected files, official library docs)

---

## Summary

The app currently stores all product listing metadata in browser localStorage, making the entire
marketplace single-device. Five distinct localStorage key patterns are written by the seller at
product creation time and read by at least three separate components on any subsequent page load.
Moving this data to SQLite on the existing Express backend (port 5000) is straightforward: add one
table, four REST endpoints, update write-sites to POST to the API, and update read-sites to GET
from the API with localStorage as a fallback for backward compatibility.

The existing backend (`backend/api/server.js`) is a clean three-route Express 5 server with no
database of any kind. Adding `better-sqlite3` is a one-line install; the synchronous API integrates
naturally into Express without async/Promise plumbing. CORS already allows `localhost:3000/3001`
and the new endpoints are GET/POST/PATCH which requires adding those methods to the CORS allowlist.

The frontend uses the native `fetch` API against a hardcoded `http://localhost:5000` backend URL
(set at `App.js:42`). All existing fetch calls use POST with JSON body. New calls should follow the
same pattern.

**Primary recommendation:** Use `better-sqlite3` (v12.6.2, synchronous). Add one table
`product_metadata` keyed by `product_address`. Write four endpoints. Update three frontend files.
Keep `pending_private_payment_*` in localStorage (ephemeral, intentional). Maintain localStorage
as a read fallback for products created before this migration.

---

## Current State (exact file locations, line numbers)

### localStorage WRITES

**File: `frontend/src/components/marketplace/ProductFormStep3.jsx`**

| Line | Key Pattern | Value | When |
|------|-------------|-------|------|
| 283 | `priceWei_<productAddress>` | price.toString() (wei) | After successful escrow deploy |
| 284 | `priceCommitment_<productAddress>` | pedersenCommitment hex string | After successful escrow deploy |
| 285 | `productMeta_<productAddress>` | JSON.stringify(listingMeta) | After successful escrow deploy |
| 288 | `sellerRailgunAddress_<productAddress>` | 0zk... address string | After successful escrow deploy, if Railgun connected |
| 289 | `sellerWalletID_<productAddress>` | walletID string (may be empty) | After successful escrow deploy, if Railgun connected |

Also reads at line 49-58: `railgun.wallet` (localStorage) as fallback to get the seller's
Railgun address. This is the Railgun wallet state key, NOT a product-specific key — it stays
in localStorage.

**File: `frontend/src/components/marketplace/ProductDetail.jsx`**

| Line | Key Pattern | Value | When |
|------|-------------|-------|------|
| 236 | `vcCid_<productAddress>` | IPFS CID string | When seller calls confirmOrder (after upload) |
| 323 | `vcCid_<productAddress>` | IPFS CID string | When auditor manually loads a VC CID |

### localStorage READS

**File: `frontend/src/components/marketplace/ProductDetail.jsx`**

| Line | Key Pattern | Where/Why |
|------|-------------|-----------|
| 141 | `vcCid_<address>` | `useEffect` on mount — prefills audit CID input |
| 185 | `productMeta_<address>` | `handleConfirmOrder` — builds final VC, HARD BLOCK if missing |
| 203 | `sellerRailgunAddress_<address>` | `handleConfirmOrder` — embedded in final VC |

The `findLocalStorageValueByAddress(prefix, addr)` helper (lines 147-163) handles case-insensitive
address matching by trying exact key, lowercase key, then scanning all localStorage keys. This
logic must be replicated in the API lookup (case-insensitive address match) or normalised to
checksummed form on write.

**File: `frontend/src/components/railgun/PrivatePaymentModal.jsx`**

| Line | Key Pattern | Where/Why |
|------|-------------|-----------|
| 123-128 | `sellerRailgunAddress_<address>` | `resolveSellerRailgunAddress` — gets seller's 0zk address for transfer, HARD BLOCK if missing |
| 131-143 | `productMeta_<address>` | Fallback inside `resolveSellerRailgunAddress` — parses meta to extract `sellerRailgunAddress` |
| 284 | `sellerRailgunAddress_<address>` | `useEffect` on open — pre-fills the address input field |
| 317 | `priceWei_<address>` | `useEffect` on open — pre-fills payment amount input |
| 362-363 | `sellerRailgunAddress_<address>` | `handlePay` — reads address before transfer |
| 384-387 | `sellerRailgunAddress_<address>` | `handlePay` — writes resolved address back if found from meta |
| 159-161 | `pending_private_payment_<address>` | `hydratePendingPayment` — retry cache, KEEP IN LOCALSTORAGE |
| 181-183 | `pending_private_payment_<address>` | `persistPendingPayment` — retry cache write, KEEP IN LOCALSTORAGE |
| 186-188 | `pending_private_payment_<address>` | `clearPendingPayment` — retry cache clear, KEEP IN LOCALSTORAGE |

### The `findLocalStorageValueByAddress` helper

Defined in two places:
- `ProductDetail.jsx` lines 147-163 (plain function)
- `PrivatePaymentModal.jsx` lines 100-119 (useCallback)

Same logic in both: try exact key → try lowercase key → scan all keys for case-insensitive suffix
match. This complexity exists because Ethereum addresses can be checksummed or lowercase. The DB
solution should normalise to `address.toLowerCase()` on both write and read to eliminate this.

### Backend URL resolution

The frontend hardcodes the backend URL in `App.js` at line 42:
```js
const backendUrl = "http://localhost:5000";
```

`backendUrl` is prop-drilled: `App` → `MarketplaceView` → `ProductFormWizard` → `ProductFormStep3`.
However, `ProductDetail.jsx` and `PrivatePaymentModal.jsx` do NOT receive `backendUrl` as a prop —
they would need their own resolution. The pattern used in `verifyVc.js` is the right model:
```js
const BACKEND_URL = process.env.REACT_APP_VC_BACKEND_URL || "http://localhost:5000";
```

A new utility file (e.g., `src/utils/productMetaApi.js`) should define its own `BACKEND_URL`
constant using the same env var or a new one (`REACT_APP_BACKEND_URL`), rather than relying on
prop drilling.

### CORS situation

Current CORS config (`server.js` lines 11-15):
```js
const corsOptions = {
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  methods: ['POST'],   // <-- only POST allowed
  credentials: false,
};
```

New GET and PATCH endpoints will be blocked by CORS unless `'GET'` and `'PATCH'` are added to the
`methods` array. This is a required change.

---

## What Needs to Change (per file)

### `backend/api/server.js`
- Add `better-sqlite3` require and database initialisation
- Add `CREATE TABLE IF NOT EXISTS product_metadata` on startup
- Update CORS `methods` to include `'GET'` and `'PATCH'`
- Add four new routes:
  - `POST /metadata` — create/upsert listing metadata (called at product creation)
  - `GET /metadata/:address` — read all metadata for a product address (called on any page load)
  - `PATCH /metadata/:address/vc-cid` — update vcCid after seller confirms order
  - (Optional) `PATCH /metadata/:address/seller-railgun` — update seller Railgun address if resolved from meta

### `backend/api/package.json`
- Add `"better-sqlite3": "^12.6.2"` to `dependencies`

### `frontend/src/utils/productMetaApi.js` (new file)
- Centralise all REST calls to the metadata API
- Functions: `saveProductMeta(data)`, `getProductMeta(address)`, `updateVcCid(address, cid)`
- Reads `REACT_APP_BACKEND_URL || 'http://localhost:5000'`

### `frontend/src/components/marketplace/ProductFormStep3.jsx`
- After successful localStorage writes (lines 283-289), also POST to `/metadata`
- localStorage writes can remain as a local cache (belt-and-suspenders)
- Or: replace localStorage writes entirely with API calls (cleaner but loses offline fallback)
- Recommended: POST to API, keep localStorage as local cache

### `frontend/src/components/marketplace/ProductDetail.jsx`
- `useEffect` at line 141: try GET `/metadata/:address` for `vcCid`, fall back to localStorage
- `handleConfirmOrder` at line 185: try GET `/metadata/:address` for `productMeta`, fall back to localStorage
- After `localStorage.setItem('vcCid_...')` at line 236: also PATCH `/metadata/:address/vc-cid`
- After `localStorage.setItem('vcCid_...')` at line 323: also PATCH `/metadata/:address/vc-cid`

### `frontend/src/components/railgun/PrivatePaymentModal.jsx`
- `resolveSellerRailgunAddress` (lines 121-146): try GET `/metadata/:address` first, then localStorage
- `useEffect` reading `priceWei_` at line 317: try GET `/metadata/:address` for priceWei, fall back to localStorage
- `handlePay` at line 362: try GET `/metadata/:address` for sellerRailgunAddress
- Do NOT touch `pending_private_payment_` reads/writes — these stay in localStorage

---

## Backend Design (schema, endpoints)

### SQL Schema

```sql
CREATE TABLE IF NOT EXISTS product_metadata (
  product_address TEXT PRIMARY KEY NOT NULL,  -- lowercase checksummed address
  product_meta    TEXT,                        -- JSON blob (listingMeta object)
  price_wei       TEXT,                        -- BigInt as string
  price_commitment TEXT,                       -- Pedersen commitment hex
  seller_railgun_address TEXT,                 -- 0zk... address
  vc_cid          TEXT,                        -- IPFS CID, set after confirmOrder
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

One table, one row per product. `product_address` is the primary key (always lowercase). No
foreign keys needed — the blockchain is the authoritative source for product existence.

### Endpoints

```
POST   /metadata                     - Upsert full listing metadata
GET    /metadata/:address            - Read all metadata for an address
PATCH  /metadata/:address/vc-cid     - Update vcCid only
```

**POST /metadata** — called by seller at product creation:
```js
// Request body:
{
  productAddress: "0x...",          // required, will be lowercased
  productMeta: { ... },             // required, full listingMeta JSON
  priceWei: "1000000000000000000",  // required
  priceCommitment: "0x...",         // required
  sellerRailgunAddress: "0zk..."    // required
}

// Response 201:
{ success: true, productAddress: "0x..." }
```

Uses INSERT OR REPLACE (SQLite UPSERT) to be idempotent — safe to call multiple times.

**GET /metadata/:address** — called by buyer, seller, auditor on ProductDetail load:
```js
// Response 200 (found):
{
  productAddress: "0x...",
  productMeta: { ... },
  priceWei: "...",
  priceCommitment: "...",
  sellerRailgunAddress: "0zk...",
  vcCid: "Qm..." or null,
  createdAt: "...",
  updatedAt: "..."
}

// Response 404 (not found, pre-migration product):
{ error: "Not found" }
```

**PATCH /metadata/:address/vc-cid** — called by seller after confirmOrder IPFS upload:
```js
// Request body:
{ vcCid: "Qm..." }

// Response 200:
{ success: true }

// Response 404:
{ error: "Not found" }
```

### Database initialisation pattern

```js
// At top of server.js
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'metadata.sqlite');
const db = new Database(DB_PATH);

// Enable WAL mode for concurrent reads
db.pragma('journal_mode = WAL');

// Create table on startup
db.exec(`
  CREATE TABLE IF NOT EXISTS product_metadata (
    product_address TEXT PRIMARY KEY NOT NULL,
    product_meta TEXT,
    price_wei TEXT,
    price_commitment TEXT,
    seller_railgun_address TEXT,
    vc_cid TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);
```

A `data/` subdirectory under `backend/api/` is the right location. Add `backend/api/data/*.sqlite`
to `.gitignore`.

---

## Migration Strategy

### Problem
Products created before this phase only have metadata in localStorage of the original seller's
browser. After deployment, GET `/metadata/:address` returns 404 for these products.

### Solution: graceful fallback on read

All read sites should implement a two-step lookup:

```js
// Pseudocode for all read sites:
async function getMetaForProduct(address) {
  try {
    const res = await fetch(`${BACKEND_URL}/metadata/${address}`);
    if (res.ok) {
      const data = await res.json();
      return data; // DB has it
    }
  } catch {
    // network error, fall through
  }
  // Fallback: localStorage
  const raw = findLocalStorageValueByAddress('productMeta_', address);
  return raw ? JSON.parse(raw) : null;
}
```

This means:
- Old products: continue working from localStorage (unchanged behavior for seller on original device)
- New products: served from DB on any device
- If seller views their own old product and it still has localStorage, the seller can trigger
  a "backfill" by re-saving (optional enhancement, not required for Phase 11)

### Migration path for writes

No data migration script is needed. The approach is:
1. Deploy updated backend (new endpoints, SQLite table created)
2. Deploy updated frontend (writes to API AND localStorage)
3. Old products degrade gracefully to localStorage fallback
4. New products go into DB from creation

### What to do about sellerWalletID

`sellerWalletID_<address>` is written at ProductFormStep3.jsx line 289 but is NOT needed for
cross-device operation — the seller re-derives their wallet from their connected Railgun wallet on
any device. Do NOT store `sellerWalletID` in the DB.

---

## Dependencies Needed

### Backend

```bash
cd backend/api
npm install better-sqlite3@^12.6.2
```

**better-sqlite3 v12.6.2** (released 2026-01-16):
- Synchronous API — integrates into Express handlers without async/await changes
- Requires Node.js >= 14.21.1 (satisfied by current setup)
- Native module (C++ binding) — requires build tools on Windows (Visual Studio Build Tools or
  the "Automatically install necessary tools" option in the Node.js installer)
- Prebuilt binaries available for LTS Node versions — if Node 18/20 is in use, `npm install`
  will download a prebuilt binary without compilation
- WAL mode is recommended and a one-liner pragma

**Why not sqlite3 (async)?**
- sqlite3 uses callbacks/promises, requiring every route handler to be refactored to async
- better-sqlite3 is synchronous — fits Express's synchronous route handler style with no
  additional complexity
- better-sqlite3 is measurably faster for this use case (single-writer, simple queries)
- better-sqlite3 is the dominant choice for Node.js SQLite in 2025/2026

**Why not PostgreSQL/MySQL?**
- Overkill for single-instance metadata store
- Requires running a separate database server
- SQLite is a file, zero operational overhead

### Frontend

No new npm packages. Uses native `fetch` API already present.

One new utility file: `frontend/src/utils/productMetaApi.js`

---

## Implementation Order (what to build first)

1. **Backend: install better-sqlite3 and create db.js module**
   - `npm install better-sqlite3` in `backend/api/`
   - Create `backend/api/db.js` that exports an initialised Database instance
   - This isolates DB init from server.js and makes it testable

2. **Backend: update CORS config in server.js**
   - Add `'GET'` and `'PATCH'` to the `methods` array
   - Do this before adding routes so browser preflight doesn't block during dev

3. **Backend: add the four routes in server.js**
   - `POST /metadata`
   - `GET /metadata/:address`
   - `PATCH /metadata/:address/vc-cid`

4. **Backend: create data/ directory and add to .gitignore**
   - `mkdir backend/api/data`
   - Add `backend/api/data/*.sqlite` to `.gitignore`

5. **Frontend: create `src/utils/productMetaApi.js`**
   - Central module for all API calls to `/metadata`
   - Functions: `saveProductMeta`, `getProductMeta`, `updateVcCid`
   - Include the fallback-to-localStorage logic here

6. **Frontend: update ProductFormStep3.jsx**
   - After localStorage writes, call `saveProductMeta()`
   - localStorage writes remain as local cache

7. **Frontend: update ProductDetail.jsx**
   - `useEffect` for vcCid: try API first
   - `handleConfirmOrder`: try API first for productMeta
   - After vcCid writes: call `updateVcCid()`

8. **Frontend: update PrivatePaymentModal.jsx**
   - `resolveSellerRailgunAddress`: try API first
   - priceWei useEffect: try API first

---

## Risks

### Risk 1: Native module compilation failure on Windows (MEDIUM)
better-sqlite3 requires C++ compilation if no prebuilt binary matches the Node version.
On Windows, this requires Visual Studio Build Tools. If the developer machine lacks these,
`npm install better-sqlite3` will fail.

**Mitigation:** Use Node.js LTS (18 or 20). Prebuilt binaries exist for LTS versions.
Check: `node --version` before installing. If compilation fails, install Node Build Tools
via `npm install --global --production windows-build-tools` or use the Node.js installer's
"Tools for Native Modules" checkbox.

### Risk 2: CORS error on new endpoints (HIGH if missed)
The current CORS config only allows `methods: ['POST']`. GET and PATCH will be blocked by
browser preflight. This breaks the UI silently in development (CORS errors appear in console
but the fetch returns a network error, triggering the localStorage fallback, so the app
"works" but isn't using the DB).

**Mitigation:** CORS update is step 2 in the implementation order. Verify in browser devtools
that OPTIONS preflight returns correct headers for GET and PATCH.

### Risk 3: Address normalisation mismatch (MEDIUM)
`findLocalStorageValueByAddress` does case-insensitive matching because addresses can be
checksummed or lowercase. If the DB stores addresses in mixed case, GET `/metadata/:address`
must handle the same case variants. SQLite's TEXT comparison is case-sensitive by default.

**Mitigation:** Always lowercase the address before inserting into the DB. Always lowercase
the `:address` param in route handlers before querying. The frontend should also send
`address.toLowerCase()` in POST body and GET URL.

### Risk 4: DB file not created if data/ directory missing (LOW)
If `backend/api/data/` does not exist, `new Database('data/metadata.sqlite')` will throw
ENOENT.

**Mitigation:** Use `fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })` before
`new Database(DB_PATH)`, or create the directory as a setup step.

### Risk 5: productMeta JSON size (LOW)
`listingMeta` includes `priceCommitment` (a full ZK proof object with proof arrays). This
may be 1-3 KB serialised. SQLite TEXT columns have no practical size limit (up to 1 GB).
No concern here.

### Risk 6: Concurrent writes from multiple sellers (LOW for localhost dev)
SQLite WAL mode handles concurrent reads well. For single-instance localhost, concurrent
writes are not a real concern. If this backend ever becomes multi-instance (e.g., behind
a load balancer), SQLite would need to be replaced with PostgreSQL. For Phase 11 scope,
SQLite is appropriate.

---

## Code Examples

### better-sqlite3: full endpoint implementation pattern

```js
// Source: better-sqlite3 official API docs
// https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md

// Prepare statements once (not per request) for performance
const stmtUpsert = db.prepare(`
  INSERT OR REPLACE INTO product_metadata
    (product_address, product_meta, price_wei, price_commitment, seller_railgun_address, updated_at)
  VALUES
    (@productAddress, @productMeta, @priceWei, @priceCommitment, @sellerRailgunAddress, datetime('now'))
`);

const stmtGet = db.prepare(`
  SELECT * FROM product_metadata WHERE product_address = ?
`);

const stmtUpdateVcCid = db.prepare(`
  UPDATE product_metadata SET vc_cid = ?, updated_at = datetime('now')
  WHERE product_address = ?
`);

// Route handlers
app.post('/metadata', (req, res) => {
  const { productAddress, productMeta, priceWei, priceCommitment, sellerRailgunAddress } = req.body;
  if (!productAddress || !productMeta) {
    return res.status(400).json({ error: 'productAddress and productMeta are required' });
  }
  const addr = productAddress.toLowerCase();
  stmtUpsert.run({
    productAddress: addr,
    productMeta: JSON.stringify(productMeta),
    priceWei: priceWei || null,
    priceCommitment: priceCommitment || null,
    sellerRailgunAddress: sellerRailgunAddress || null,
  });
  return res.status(201).json({ success: true, productAddress: addr });
});

app.get('/metadata/:address', (req, res) => {
  const addr = req.params.address.toLowerCase();
  const row = stmtGet.get(addr);
  if (!row) return res.status(404).json({ error: 'Not found' });
  return res.json({
    productAddress: row.product_address,
    productMeta: row.product_meta ? JSON.parse(row.product_meta) : null,
    priceWei: row.price_wei,
    priceCommitment: row.price_commitment,
    sellerRailgunAddress: row.seller_railgun_address,
    vcCid: row.vc_cid,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
});

app.patch('/metadata/:address/vc-cid', (req, res) => {
  const addr = req.params.address.toLowerCase();
  const { vcCid } = req.body;
  if (!vcCid) return res.status(400).json({ error: 'vcCid is required' });
  const result = stmtUpdateVcCid.run(vcCid, addr);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  return res.json({ success: true });
});
```

### Frontend: productMetaApi.js pattern

```js
// frontend/src/utils/productMetaApi.js
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

export async function saveProductMeta({ productAddress, productMeta, priceWei, priceCommitment, sellerRailgunAddress }) {
  const res = await fetch(`${BACKEND_URL}/metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productAddress, productMeta, priceWei, priceCommitment, sellerRailgunAddress }),
  });
  if (!res.ok) throw new Error('Failed to save product metadata');
  return res.json();
}

export async function getProductMeta(address) {
  const res = await fetch(`${BACKEND_URL}/metadata/${address.toLowerCase()}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to fetch product metadata');
  return res.json();
}

export async function updateVcCid(address, vcCid) {
  const res = await fetch(`${BACKEND_URL}/metadata/${address.toLowerCase()}/vc-cid`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vcCid }),
  });
  if (!res.ok) throw new Error('Failed to update vcCid');
  return res.json();
}
```

### Frontend: read-with-fallback pattern

```js
// Used in ProductDetail.jsx handleConfirmOrder and useEffect
import { getProductMeta } from '../../utils/productMetaApi';

async function resolveProductMeta(address) {
  try {
    const data = await getProductMeta(address);
    if (data?.productMeta) return data.productMeta;
  } catch {
    // API unavailable, fall through to localStorage
  }
  // localStorage fallback (legacy products, offline mode)
  const raw = findLocalStorageValueByAddress('productMeta_', address);
  return raw ? JSON.parse(raw) : null;
}
```

---

## Open Questions

1. **DB_PATH in production / Docker**
   - What is: The DB path `backend/api/data/metadata.sqlite` is a local file path.
   - What is unclear: If the backend is ever containerised, the data directory needs to be
     a mounted volume or the data will be lost on container restart. No Docker setup exists
     for the backend currently (only frontend has a Dockerfile).
   - Recommendation: Use `DB_PATH` env var, document that it must be a persistent path.
     For local dev, the default relative path is fine.

2. **Whether to add a `REACT_APP_BACKEND_URL` env var or reuse `REACT_APP_VC_BACKEND_URL`**
   - What is: `verifyVc.js` uses `REACT_APP_VC_BACKEND_URL`. `App.js` hardcodes `http://localhost:5000`.
   - What is unclear: The env files don't define `REACT_APP_VC_BACKEND_URL` or `REACT_APP_BACKEND_URL`,
     so both fall through to the hardcoded default.
   - Recommendation: Add `REACT_APP_BACKEND_URL=http://localhost:5000` to `.env` files
     and have `productMetaApi.js` use `process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000'`.

3. **Whether to backfill old products from localStorage**
   - What is: Old products exist only in seller's localStorage.
   - What is unclear: Should there be a "migrate" button that pushes old localStorage data to the DB?
   - Recommendation: Out of scope for Phase 11. The read fallback handles it transparently
     for the seller on their original device. Other users can still input the sellerRailgunAddress
     manually via the existing amber input in PrivatePaymentModal.

---

## Sources

### Primary (HIGH confidence)
- Direct code analysis of `ProductFormStep3.jsx`, `ProductDetail.jsx`, `PrivatePaymentModal.jsx`,
  `server.js`, `App.js`, `verifyVc.js`, `escrowHelpers.js`, `package.json`
- better-sqlite3 GitHub README: https://github.com/WiseLibs/better-sqlite3 (v12.6.2, Jan 2026)
- better-sqlite3 API docs: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md
- better-sqlite3 Windows troubleshooting: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md

### Secondary (MEDIUM confidence)
- better-sqlite3 chosen over sqlite3 based on synchronous API fit with Express, confirmed by
  official docs showing synchronous `.run()`, `.get()`, `.all()` pattern

---

## Metadata

**Confidence breakdown:**
- Current state / file analysis: HIGH — direct code read with line numbers
- Standard stack (better-sqlite3): HIGH — official docs confirm v12.6.2, sync API
- Architecture (schema, endpoints): HIGH — simple, well-established pattern
- CORS issue: HIGH — confirmed by reading server.js corsOptions
- Migration strategy: HIGH — pattern is standard localStorage-to-API migration
- Windows native module risk: MEDIUM — real risk but mitigated by LTS prebuilts

**Research date:** 2026-02-26
**Valid until:** 2026-03-26 (SQLite/better-sqlite3 is stable; no fast-moving concerns)
