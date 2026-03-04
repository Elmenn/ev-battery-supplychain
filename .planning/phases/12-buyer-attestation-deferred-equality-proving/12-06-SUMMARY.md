---
phase: 12-buyer-attestation-deferred-equality-proving
plan: 06
status: complete
commit: 0d766da0
---

# Plan 12-06 Summary: ECIES Encryption in handleConfirmOrder

## What was built

Extended `ProductDetail.jsx`'s `handleConfirmOrder` to read the buyer's x25519 disclosure pubkey from the backend, encrypt `{value, blinding_price}` to it via ECIES, and embed the `encryptedOpening` in the VC before IPFS upload.

## Changes made

**File:** `frontend/src/components/marketplace/ProductDetail.jsx`

### New imports
- `appendAttestationData` added to the existing `vcBuilder.mjs` import
- `encryptOpening` from `../../utils/ecies`
- `getBuyerSecretBlob`, `updateEncryptedOpening` from `../../utils/buyerSecretApi`
- `generateDeterministicBlinding` from `../../utils/commitmentUtils`

### Integration (ECIES block in `handleConfirmOrder`)

Inserted between `finalVc.proof.push(proof)` and `uploadJson`:

1. Reads `product.buyer` — skips if zero address
2. Calls `getBuyerSecretBlob(address, buyerAddr)` — if null, logs warning and skips (graceful degradation)
3. If `disclosurePubkey` found: generates deterministic blinding via `generateDeterministicBlinding(address, sellerAddr)`, gets price from `dbData?.priceWei || listingMeta?.priceWei || product?.priceWei`
4. Encrypts `{value, blinding_price}` via `encryptOpening(buyerRow.disclosurePubkey, ...)`
5. Calls `appendAttestationData(finalVc, { attestationFields: { encryptedOpening } })` — result assigned to `vcWithAttestation` (new object, deep-clone)
6. `updateEncryptedOpening` called fire-and-forget with `.catch()` — does not block on-chain call
7. `uploadJson(vcWithAttestation)` is the upload call (replaces old `uploadJson(finalVc)`)

ECIES block wrapped in try/catch — `vcWithAttestation` falls back to `finalVc` on any failure. `confirmOrder` on-chain call proceeds regardless.

## Verification

All checks pass:
- `encryptOpening`: PASS
- `getBuyerSecretBlob`: PASS
- `updateEncryptedOpening`: PASS
- `appendAttestationData`: PASS
- `generateDeterministicBlinding`: PASS
- `uploadJson(vcWithAttestation)`: PASS
- React app builds without errors (exit 0)
