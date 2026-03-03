---
status: complete
phase: 11-sqlite-metadata-persistence
source: [11-01-SUMMARY.md, 11-02-SUMMARY.md, 11-03-SUMMARY.md, 11-04-SUMMARY.md, 11-05-SUMMARY.md]
started: 2026-02-27T00:00:00Z
updated: 2026-03-03T13:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Backend server starts and auto-creates DB
expected: Run `node server.js` in backend/api/. Server starts without errors. `data/metadata.sqlite` is auto-created. Terminal shows server listening on port 5000.
result: pass

### 2. REST endpoints respond correctly
expected: With server running, test the three endpoints manually (curl or browser fetch). POST /metadata returns 201, GET /metadata/:address returns the saved data, PATCH /metadata/:address/vc-cid returns 200.
result: pass

### 3. Product creation saves metadata to DB
expected: Create a new product listing through the UI (ProductFormStep3). After the product is deployed on-chain, calling GET /metadata/:productAddress on the backend should return the product's priceWei, priceCommitment, and sellerRailgunAddress. (Both the DB write and the localStorage write complete — seller sees no difference in the UI.)
result: pass

### 4. ProductDetail reads vcCid from DB on fresh browser
expected: After a seller has confirmed an order (which uploads the VC and writes vcCid to the DB), open ProductDetail for that product in a different browser or incognito window (no localStorage). The VC CID field should be pre-filled from the DB — the seller/auditor does not need to manually enter it.
result: pass

### 5. ProductDetail loads productMeta from DB on fresh browser
expected: Open ProductDetail for a product in a browser without that product in localStorage. The "Confirm Order" button should still appear and work — productMeta (name, description, etc.) is read from the DB rather than failing silently.
result: pass

### 6. PrivatePaymentModal pre-fills sellerRailgunAddress from DB
expected: Open the private payment modal for a product in a browser that has never had that product's seller metadata in localStorage (simulating a buyer on a different device). The seller's Railgun 0zk address should be pre-filled in the address field — the buyer should not see the amber "missing metadata" state with an empty address.
result: skipped
reason: Product already bought and delivered — modal not accessible

### 7. PrivatePaymentModal pre-fills priceWei from DB
expected: On the same fresh browser as test 6, the payment amount field should auto-populate with the correct price (in ETH) read from the DB. The buyer does not need to manually enter the amount.
result: skipped
reason: Product already bought and delivered — modal not accessible

### 8. DB degradation is graceful
expected: Stop the backend server. Open the app in a browser that already has product metadata in localStorage. The seller should still be able to create products (localStorage writes succeed, DB write fails silently with console.warn only). The buyer should still be able to open PrivatePaymentModal and see the address pre-filled from localStorage. No user-visible error should appear.
result: skipped
reason: Not explicitly tested this session

## Summary

total: 8
passed: 5
issues: 0
pending: 0
skipped: 3

## Gaps

[none yet]
