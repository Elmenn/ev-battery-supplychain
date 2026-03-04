---
phase: 12-buyer-attestation-deferred-equality-proving
plan: "04"
subsystem: frontend-utils
tags: [zkp, equality-proof, vc-builder, commitment, buyer-attestation]
dependency_graph:
  requires: [12-02]
  provides: [appendAttestationData, generateRandomBlinding, openAndVerifyCommitment, generateEqualityProof, verifyEqualityProof]
  affects: [12-05-PrivatePaymentModal, 12-07-ProductDetailBuyerPanel]
tech_stack:
  added: []
  patterns: [dispatchWithMode, deep-clone-never-mutate, incremental-merge-attestation, wasm-stub-throw]
key_files:
  modified:
    - frontend/src/utils/vcBuilder.mjs
    - frontend/src/utils/commitmentUtils.js
  created:
    - frontend/src/utils/equalityProofClient.js
decisions:
  - id: appendAttestationData-incremental-merge
    summary: "appendAttestationData uses Object.assign to merge into existing attestation object, enabling 3-step incremental write pattern (payment -> confirmOrder -> proof)"
  - id: wasm-stubs-throw
    summary: "WASM stubs for equality proof throw descriptive errors rather than returning wrong results silently"
  - id: no-0x-prefix-blinding
    summary: "generateRandomBlinding returns 64-char hex WITHOUT 0x prefix; openAndVerifyCommitment adds prefix before calling zkpClient"
metrics:
  duration: "~3 minutes"
  completed_date: "2026-03-04"
  tasks_completed: 2
  files_changed: 3
---

# Phase 12 Plan 04: Utility Extensions (vcBuilder + commitmentUtils + equalityProofClient) Summary

Three utility modules extended/created to support buyer attestation and deferred equality proving: `appendAttestationData` incremental-merge pattern in vcBuilder, random blinding generation + commitment verification in commitmentUtils, and full dual-mode dispatch for Schnorr sigma equality proof endpoints in new equalityProofClient.js.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | appendAttestationData + generateRandomBlinding + openAndVerifyCommitment | 99de5cc1 | vcBuilder.mjs, commitmentUtils.js |
| 2 | Create equalityProofClient.js | 660d928c | equalityProofClient.js (new) |

## What Was Built

### vcBuilder.mjs — appendAttestationData

New export added after `appendDeliveryProof`. Follows the exact same deep-clone pattern as `appendPaymentProof`. Key behavior:
- `JSON.parse(JSON.stringify(vc))` for deep clone — never mutates original
- Initializes `credentialSubject.attestation = { attestationVersion: '1.0' }` if absent
- `Object.assign(...)` merges new fields into existing attestation — supports 3-call incremental pattern
- Optional `previousVersionCid` written to `updated.previousVersion`

### commitmentUtils.js — generateRandomBlinding + openAndVerifyCommitment

Two new exports appended at end of file:

`generateRandomBlinding()`:
- Uses `crypto.getRandomValues(new Uint8Array(32))` for cryptographic randomness
- Returns 64-char lowercase hex string, no `0x` prefix
- Caller stores exact returned hex in buyer-secret blob; ZKP backend uses `Scalar::from_bytes_mod_order`

`openAndVerifyCommitment({ value, blindingPrice, cPriceHex })`:
- Calls existing `generateValueCommitmentWithBlinding` from zkpClient.js
- Adds `0x` prefix to `blindingPrice` if not present
- Normalizes both commitment hexes (lowercase, strip `0x`) before comparing
- Returns `{ verified: boolean, cCheck: string }`

### equalityProofClient.js — New file (162 lines)

Mirrors `zkpClient.js` dispatchWithMode pattern, scoped to equality proof operations:

- `generateEqualityProof(params)`: dispatches to `POST /zkp/generate-equality-proof`
- `verifyEqualityProof(params)`: dispatches to `POST /zkp/verify-equality-proof`
- Imports `getZkpMode`, `ZKP_MODE_BACKEND`, `ZKP_MODE_WASM` from zkpClient.js — reuses existing mode system
- Backend mode: direct `postJson` to ZKP server (port 5010)
- WASM mode: throws `[EqualityProof] WASM backend not yet implemented`
- Shadow mode: runs backend authoritatively, catches WASM errors with `console.warn`
- `resolveBackendUrl()` reads `REACT_APP_ZKP_BACKEND_URL` with `http://localhost:5010` fallback

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check

### Created files exist

- `frontend/src/utils/vcBuilder.mjs`: appendAttestationData export present
- `frontend/src/utils/commitmentUtils.js`: generateRandomBlinding + openAndVerifyCommitment exports present
- `frontend/src/utils/equalityProofClient.js`: generateEqualityProof + verifyEqualityProof exports present

### Commits exist

- 99de5cc1: feat(12-04): add appendAttestationData to vcBuilder and generateRandomBlinding + openAndVerifyCommitment to commitmentUtils
- 660d928c: feat(12-04): create equalityProofClient.js with dual-mode dispatch for equality proofs

## Self-Check: PASSED
