---
phase: 12-buyer-attestation-deferred-equality-proving
plan: 07
status: complete
commit: 36deab41
---

# Plan 12-07 Summary: Buyer Panel + Auditor Equality Proof Card

## What was built

Added Workstream A ("Verify Price") and Workstream B ("Generate Equality Proof") buyer UI to `ProductDetail.jsx`, and extended `VerifyVCInline.js` with an equality-proof status card for auditors.

## Changes made

### `frontend/src/components/marketplace/ProductDetail.jsx`

**New imports added:**
- `decryptOpening` added to ecies import
- `openAndVerifyCommitment` added to commitmentUtils import
- `updateEqualityProof` added to buyerSecretApi import
- `generateEqualityProof` from `../../utils/equalityProofClient`

**Module-level additions:**
- `BUYER_BLOB_SIGNING_MSG = 'EV Supply Chain Buyer Privacy Key v1'` constant
- `decryptBuyerBlob(encryptedBlobJson, signer)` helper — AES-GCM-256 + PBKDF2 100k, same parameters as encryption

**New state variables:**
- `workstreamAResult` / `workstreamALoading` — Workstream A verification state
- `workstreamBResult` / `workstreamBLoading` — Workstream B proof generation state
- `workstreamError` — error message for both workstreams
- `decryptedOpening` — cached decrypted seller opening (avoids ECIES re-decrypt in B)
- `blobPlaintext` — cached full blob plaintext (avoids second MetaMask signMessage in B)

**Workstream A handler (`handleWorkstreamA`):**
1. Gets buyer signer, fetches encrypted blob from DB via `getBuyerSecretBlob`
2. Decrypts blob via `decryptBuyerBlob` (PBKDF2+AES-GCM), caches in `blobPlaintext`
3. Decrypts seller's `encryptedOpening` via `decryptOpening`, caches in `decryptedOpening`
4. Calls `openAndVerifyCommitment({ value, blindingPrice, cPriceHex })`, sets `workstreamAResult`

**Workstream B handler (`handleWorkstreamB`):**
1. Prefers cached `blobPlaintext` / `decryptedOpening` from Workstream A
2. Constructs `bindingContext`, calls `generateEqualityProof`
3. Calls `appendAttestationData(auditVC, { proofFields })` + `uploadJson` + `updateVcCid`
4. Fire-and-forget `updateEqualityProof` to DB
5. Sets `workstreamBResult = true`, shows success toast

**JSX:** buyer panel block gated on `role.role === 'buyer' && phase >= OrderConfirmed && auditVC`:
- "Verify Price" button shown when `encryptedOpening` is present in VC; shows Pass/Fail inline
- "Generate Equality Proof" button shown only after Workstream A passes; disabled once proof stored
- Fallback message when `encryptedOpening` absent

### `frontend/src/components/vc/VerifyVCInline.js`

**New import:** `verifyEqualityProof` from `../../utils/equalityProofClient`

**New state:** `equalityProofResult`, `equalityProofLoading`

**New handler `handleVerifyEqualityProof`:** reads `paymentEqualityProof` + `C_price` + `C_pay` from VC, calls `verifyEqualityProof`, sets result

**New JSX section** (rendered after chain anchor details, before "View VC"):
- Shown when `vc.credentialSubject.attestation` exists
- Displays `disclosurePubKey` and `C_pay` from attestation
- "Verify Equality Proof" auditor button (gated on `paymentEqualityProof` present)
- Pass/Fail badge using existing `getStatusMeta` helper
- Fallback message when proof not yet generated

## Verification

All checks pass:

**ProductDetail:**
- decryptOpening, generateEqualityProof, handleWorkstreamA, handleWorkstreamB: PASS
- workstreamAResult, blobPlaintext, setBlobPlaintext: PASS
- Verify Price, Generate Equality Proof: PASS

**VerifyVCInline:**
- verifyEqualityProof, handleVerifyEqualityProof, paymentEqualityProof: PASS
- Verify Equality Proof, equalityProofResult: PASS

React app builds without errors (exit 0)
