---
phase: 12-buyer-attestation-deferred-equality-proving
plan: 05
status: complete
commit: e14eb462
---

# Plan 12-05 Summary: Buyer Attestation Write Path

## What was built

Extended `PrivatePaymentModal.jsx` to perform the buyer attestation write path after `recordPrivatePayment` succeeds.

## Changes made

**File:** `frontend/src/components/railgun/PrivatePaymentModal.jsx`

### New imports
- `generateX25519Keypair` from `../../utils/ecies`
- `saveBuyerSecretBlob` from `../../utils/buyerSecretApi`
- `appendAttestationData` from `../../utils/vcBuilder.mjs`
- `generateRandomBlinding` from `../../utils/commitmentUtils`
- `generateValueCommitmentWithBlinding` from `../../utils/zkp/zkpClient`
- `fetchJson`, `uploadJson` from `../../utils/ipfs`
- `updateVcCid` added to the existing `productMetaApi` import

### New constants/helpers
- `BUYER_BLOB_SIGNING_MSG = 'EV Supply Chain Buyer Privacy Key v1'` — distinct from Railgun mnemonic signing message to prevent PBKDF2 key collision
- `encryptBuyerBlob(plaintext, signature, aad)` — module-level async function; AES-GCM-256 + PBKDF2 100k iterations, AAD = `chainId/productAddress/buyerAddress`

### Integration (non-blocking block in `handlePay`)

Inserted between `clearPendingPayment()` and `setStep('complete')`:

1. Generates fresh x25519 keypair via `generateX25519Keypair()`
2. Generates random `r_pay` via `generateRandomBlinding()`
3. Computes `C_pay` via `generateValueCommitmentWithBlinding` (ZKP failure is swallowed — blob is still saved)
4. Gets wallet signer via `new ethers.BrowserProvider(window.ethereum)` and signs `BUYER_BLOB_SIGNING_MSG`
5. Encrypts `{x25519_priv, r_pay, meta}` into encrypted blob with wallet-derived key + AAD binding
6. Saves blob to backend DB via `saveBuyerSecretBlob` (own try/catch — DB failure doesn't block)
7. Caches blob to `localStorage` (swallowed quota errors)
8. Fetches current VC from IPFS, calls `appendAttestationData` with `{disclosurePubKey, buyerPaymentCommitment}`, re-uploads to IPFS, updates vcCid in DB and localStorage

Outer try/catch wraps all 8 steps — any failure logs a warning and the user sees the payment success screen.

## Verification

All checks pass:
- `saveBuyerSecretBlob`: PASS
- `generateX25519Keypair`: PASS
- `appendAttestationData`: PASS
- `BUYER_BLOB_SIGNING_MSG`: PASS
- `generateRandomBlinding`: PASS
- React app builds without errors (exit 0)
