# Phase 12: Buyer Attestation + Deferred Equality Proving - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning
**Source:** discuss-phase + docs/current/05-buyer-exact-value-and-auditor-equality-roadmap.md

<domain>
## Phase Boundary

After a private Railgun payment completes, the buyer publishes a bound payment commitment (`C_pay`) and a fresh x25519 disclosure pubkey (wallet-attested). At `confirmOrder`, the seller encrypts `{value, blinding_price}` to the buyer's x25519 pubkey and stores the ciphertext in the VC + DB. The buyer then has two deferred operations:

- **Workstream A** — decrypt the seller opening, verify `C_price = Pedersen(value, blinding_price)` locally (exact-value check)
- **Workstream B** — use both secrets `(v, blinding_price)` from the opening and `(v, r_pay)` from the buyer blob to generate a Schnorr sigma equality proof that `C_price` and `C_pay` hide the same scalar, for auditor verification

All proof artifacts are off-chain (DB + IPFS VC). No contract changes. No Railgun-native amount binding (explicitly future work). Implements Workstream A + Model 2-lite from the roadmap doc.

</domain>

<decisions>
## Implementation Decisions

### x25519 Key Storage — Cross-Device Encrypted Blob
- Generate fresh x25519 keypair per purchase at payment time (not derived from wallet signature)
- Encrypt private key **client-side** before storing: AES-GCM with wallet-derived unwrap key (same PBKDF2 100k iterations pattern as `crypto.js`)
- AAD binds ciphertext to `chainId/productAddress/buyerAddress` — prevents blob reuse across products
- Encrypted blob schema: `{ ciphertext, iv, salt, aad, version, pubkey }`
- **Primary storage:** backend DB (cross-device support)
- **Optional cache:** localStorage copy for same-device convenience
- Never store plaintext private key server-side

### r_pay Blinding Factor
- `r_pay` is random, generated at payment time alongside the x25519 keypair
- Stored inside the same encrypted buyer-secret blob: `{ x25519_priv, r_pay, meta }`
- `v` (the price value) is **not** stored in the blob — retrieved at proof time by decrypting the seller's `encryptedOpening`
- This keeps the blob minimal: no plaintext price duplication in buyer-controlled storage

### Equality Proof Implementation — Shared Rust Core
- Schnorr sigma proof (Fiat-Shamir transcript style) over the same Ristretto/Pedersen curve as the existing range proof system
- **Rollout:** shared Rust core → backend endpoints first → WASM bindings immediately after → shadow mode comparison → WASM becomes default
- Two new ZKP backend endpoints (port 5010): `POST /zkp/generate-equality-proof`, `POST /zkp/verify-equality-proof`
- Binding tag covers `{productId, txRef, chainId, escrowAddr, stage}` — same binding context pattern as existing commitments
- Extends existing `REACT_APP_ZKP_MODE` dual-mode dispatch (`backend` / `wasm` / `shadow`) — no new config keys needed

### VC Schema — New `credentialSubject.attestation` Object
- Add `credentialSubject.attestation` section alongside existing `payment` and `delivery`
- `credentialSubject.payment` is unchanged (keeps `memoHash`, `railgunTxRef`, `buyerAddress`)
- `proof[]` array is kept for signer proofs only (EIP-712 issuer/holder signatures)
- Attestation object layout:
  ```
  credentialSubject.attestation: {
    disclosurePubKey: <buyer x25519 pubkey hex>,
    buyerPaymentCommitment: {
      commitment: <C_pay hex>,
      proof: <range proof for C_pay>,
      bindingContext: { productId, txRef, chainId, escrowAddr, stage }
    },
    encryptedOpening: {
      ciphertext: <hex>,
      ephemeralPubKey: <sender x25519 pubkey hex>,
      iv: <hex>,
      ...  (x25519 ECIES fields — Claude's discretion on exact ECIES construction)
    },
    paymentEqualityProof: {
      proof: <Schnorr sigma proof hex>,
      bindingContext: { productId, txRef, chainId, escrowAddr, stage }
    },
    attestationVersion: "1.0"
  }
  ```
- Fields are written incrementally: `disclosurePubKey` + `buyerPaymentCommitment` at payment time; `encryptedOpening` after seller `confirmOrder`; `paymentEqualityProof` after buyer generates proof

### C_pay Anchoring — Off-Chain Only
- `C_pay` stored in backend DB at payment time, then written into `credentialSubject.attestation` on next VC IPFS update
- No contract changes or redeployment needed
- On-chain anchors already present: `memoHash`, `railgunTxRef`, `vcHash` (stored via `recordPrivatePayment`)
- Replay resistance via binding context bound to these existing anchors

### Audit UI
- **Buyer trigger (Workstream A):** "Verify Price" button in ProductDetail buyer panel, visible once `encryptedOpening` is present in VC — decrypts, verifies commitment locally, shows pass/fail inline
- **Buyer trigger (Workstream B):** "Generate Equality Proof" button appears after Workstream A passes — generates Schnorr sigma proof, writes to VC + DB
- **Auditor view:** Extend `VerifyVCInline`/`VCViewer` to show equality-proof verify status + binding context details (pass/fail badge, no amount disclosed)
- No new routes needed for Phase 12; future `/audit` wrapper can reuse same verifier logic later

### Claude's Discretion
- Exact x25519 ECIES library choice for `encryptedOpening` construction (libsodium / tweetnacl / @noble/curves — all on same curve)
- Whether new buyer secrets go in a separate `buyer_secrets` table or as new columns in `product_metadata`
- WASM build toolchain integration for the new Rust equality-proof module
- Error messaging for UI edge cases (seller hasn't confirmed order, decryption fails, proof generation times out)
- Exact `dispatchWithMode` wiring for the two new equality-proof operations in `zkpClient.js`

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/utils/commitmentUtils.js` — `generateCommitmentWithDeterministicBlinding` + ZKP backend dispatch: buyer generates `C_pay` with fresh random `r_pay` using same call pattern
- `frontend/src/utils/zkp/zkpClient.js` — `dispatchWithMode` + `ZKP_MODE_*` constants: new equality-proof operations extend same dispatch table
- `frontend/src/utils/zkp/providers/backendProvider.js` — `postJson` helper + endpoint call pattern: new endpoints follow identical structure
- `frontend/src/lib/railgun-clean/crypto.js` — AES-GCM + PBKDF2 (wallet-derived key) already used for mnemonic encryption: same pattern for buyer-secret blob
- `frontend/src/utils/vcBuilder.mjs` — `appendPaymentProof()` deep-clone pattern: Phase 12 adds an `appendAttestationData()` function following the same append-only mutation approach
- `backend/api/db.js` — singleton, WAL mode, prepared statements at startup: extend with buyer-secrets storage
- `frontend/src/utils/productMetaApi.js` — `saveProductMeta` / `getProductMeta` (throw-on-write, null-on-read-fail): new `saveBuyerSecretBlob` / `getBuyerSecretBlob` follow same contract
- `frontend/src/components/vc/VerifyVCInline.js` + `VCViewer.jsx` — auditor verification view: extend for equality-proof status display

### Established Patterns
- **DB-first with localStorage fallback** (Phase 11): buyer-secret blob uses same pattern — DB is primary, localStorage is cache
- **Non-blocking write with own try/catch** (Phase 11 `saveProductMeta`): blob writes should not block payment flow
- **Dual-mode ZKP dispatch** via `REACT_APP_ZKP_MODE` (Phase 4+): equality-proof endpoints slot into existing mode system
- **AES-GCM + PBKDF2 100k** wallet-derived key (Phase 2): reuse `encryptBlob` / `decryptBlob` from `crypto.js` or extend it
- **Append-only VC mutations** via deep clone + IPFS re-upload (Phase 8): attestation fields written incrementally, each write triggers new IPFS CID
- **Throw-on-failure writes, null-return reads** (Phase 11 contract): applies to all new DB/API calls in this phase

### Integration Points
- `PrivatePaymentModal.jsx` — write path: after `recordPrivatePayment` succeeds, generate x25519 keypair + `C_pay` + wallet attestation of pubkey, encrypt buyer-secret blob, persist to DB, write pubkey + `C_pay` into VC attestation section
- `web3Utils.js` / `confirmOrder` path — seller reads buyer pubkey from DB, encrypts `{value, blinding_price}` using x25519 ECIES, stores ciphertext in VC attestation + DB
- `ProductDetail.jsx` buyer panel — adds "Verify Price" (Workstream A) and "Generate Equality Proof" (Workstream B) actions gated on attestation field presence
- ZKP Rust backend (port 5010) — two new endpoints; new Rust module in same crate alongside existing commitment code

</code_context>

<specifics>
## Specific Ideas

- Buyer-secret blob AAD pattern: `${chainId}/${productAddress}/${buyerAddress}` (same binding style as commitment context)
- Shadow mode rollout: run backend and WASM equality-proof in parallel (`ZKP_MODE_SHADOW`), log mismatches, then switch default to `wasm` once parity confirmed
- "Deferred" means Workstream A and B are lazy — buyer does not have to generate the equality proof immediately after payment; proof generation is triggered on demand in ProductDetail
- `v` is never stored in buyer-controlled storage — always retrieved from the seller's `encryptedOpening` at proof time
- Binding context for equality proof uses existing on-chain anchors (`memoHash` as `txRef`, product contract address as `escrowAddr`) — no new on-chain data needed

</specifics>

<deferred>
## Deferred Ideas

- **On-chain C_pay anchoring** — emit `PaymentCommitmentPublished` event or store `keccak256(C_pay)` in `ProductEscrow`. Future phase if stronger anchoring required.
- **Railgun-native amount binding** — cryptographic binding from Railgun internal payment amount witness to equality proof (Phase 6 of the workstream roadmap). Explicitly out of scope for Phase 12; requires feasibility research.
- **`/audit` standalone route** — new route accepting VC CID or product address, running full auditor verification bundle. Future thin wrapper over the same verifier logic added in Phase 12.
- **Buyer PIN/passphrase fallback** for cross-device unwrap key derivation (fallback to passphrase if MetaMask wallet unavailable on target device). Noted as future hardening.
- **Reveal-to-auditor fallback** (Option 3 from doc) — controlled exact-value disclosure for disputes/compliance. Keep as future feature.

</deferred>

---

*Phase: 12-buyer-attestation-deferred-equality-proving*
*Context gathered: 2026-03-03*
