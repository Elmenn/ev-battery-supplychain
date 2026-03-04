---
phase: 12-buyer-attestation-deferred-equality-proving
plan: "03"
subsystem: frontend-utils
tags: [ecies, x25519, aes-gcm, buyer-secrets, rest-client]
dependency_graph:
  requires: [12-01]
  provides: [ecies-encrypt-decrypt, buyer-secret-api-client]
  affects: [12-05-PrivatePaymentModal, 12-07-ProductDetail-buyer-panel]
tech_stack:
  added: []
  patterns: [x25519-ecies, hkdf-sha256, aes-gcm-256, null-return-read-contract, throw-write-contract]
key_files:
  created:
    - frontend/src/utils/ecies.js
    - frontend/src/utils/buyerSecretApi.js
  modified: []
decisions:
  - id: ecies-browser-crypto
    summary: "Uses browser Web Crypto API (crypto.subtle) for AES-GCM; not Node crypto — file is webpack-bundled for browser"
  - id: buyersecretapi-mirrors-productmetaapi
    summary: "buyerSecretApi.js mirrors productMetaApi.js contract exactly: write throws, read returns null on 404/network errors"
metrics:
  duration_minutes: 12
  completed_date: "2026-03-04"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
---

# Phase 12 Plan 03: ECIES + buyerSecretApi Utilities Summary

Two new frontend utility modules enabling the seller-to-buyer encrypted opening flow: x25519 ECIES encrypt/decrypt in `ecies.js` and a REST client for the buyer_secrets backend routes in `buyerSecretApi.js`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create ecies.js - x25519 ECIES encrypt/decrypt | 2405b196 | frontend/src/utils/ecies.js |
| 2 | Create buyerSecretApi.js - REST client for buyer_secrets routes | 4a40194b | frontend/src/utils/buyerSecretApi.js |

## What Was Built

**ecies.js** (`frontend/src/utils/ecies.js`):
- `encryptOpening(buyerPubKeyHex, plaintext)`: ephemeral x25519 DH + HKDF-SHA256 (info: `ev-supply-chain/opening/v1`) + AES-GCM-256 encrypt. Returns `{ ciphertext, ephemeralPubKey, iv }` as 64-char hex strings.
- `decryptOpening(encryptedOpening, buyerPrivKeyHex)`: reverse DH + HKDF + AES-GCM decrypt. Throws `DOMException` on wrong key or tampered ciphertext — does NOT catch.
- `generateX25519Keypair()`: random x25519 keypair as `{ privKeyHex, pubKeyHex }`, both 64-char lowercase hex. Uses `x25519.utils.randomPrivateKey()`, never derives from wallet.
- Local `hexToBytes`/`bytesToHex` helpers for consistent hex/bytes boundaries.
- Imports: `@noble/curves/ed25519` (x25519), `@noble/hashes/hkdf`, `@noble/hashes/sha256`

**buyerSecretApi.js** (`frontend/src/utils/buyerSecretApi.js`):
- `saveBuyerSecretBlob({ productAddress, buyerAddress, encryptedBlob, disclosurePubkey, cPay, cPayProof })`: POST `/buyer-secrets`, throws on non-2xx
- `getBuyerSecretBlob(productAddress, buyerAddress)`: GET `/buyer-secrets/:product/:buyer`, returns null on 404 and network errors
- `updateEncryptedOpening(productAddress, buyerAddress, encryptedOpening)`: PATCH `encrypted-opening`, throws on failure
- `updateEqualityProof(productAddress, buyerAddress, equalityProof)`: PATCH `equality-proof`, throws on failure
- All addresses lowercased before URL construction
- `BACKEND_URL` from `REACT_APP_BACKEND_URL` env var with `http://localhost:5000` default

## Verification Results

- ECIES round-trip (bigint blinding_price): PASS
- buyerSecretApi all four exports: PASS
- address lowercasing at all URL construction sites: confirmed
- write contract (throw on non-2xx): confirmed for saveBuyerSecretBlob, updateEncryptedOpening, updateEqualityProof
- read contract (null on 404 and network errors): confirmed for getBuyerSecretBlob

## Deviations from Plan

None - plan executed exactly as written.

Note: The plan's `verify` commands use `node --input-type=module` which fails because the frontend has no `"type": "module"` in package.json (Create React App project). Verification was done via a temp `.mjs` file run from the frontend directory with `--experimental-global-webcrypto` for Web Crypto API access. The files themselves are correct ES modules that webpack handles correctly at build time.

## Self-Check: PASSED

- FOUND: frontend/src/utils/ecies.js
- FOUND: frontend/src/utils/buyerSecretApi.js
- FOUND commit: 2405b196 (ecies.js)
- FOUND commit: 4a40194b (buyerSecretApi.js)
