# Phase 12: Buyer Attestation + Deferred Equality Proving - Research

**Researched:** 2026-03-03
**Domain:** Cryptographic attestation: x25519 ECIES, Schnorr sigma equality proofs, Pedersen commitments, AES-GCM blob encryption, incremental VC mutations
**Confidence:** HIGH (core patterns verified from live codebase; math verified from official docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **x25519 keypair**: Fresh per purchase, NOT derived from wallet signature
- **Buyer-secret blob**: AES-GCM encrypted client-side (PBKDF2 100k wallet-derived key), stored primary in backend DB, localStorage as cache
- **AAD**: `${chainId}/${productAddress}/${buyerAddress}` — binds blob to context
- **Blob schema**: `{ ciphertext, iv, salt, aad, version, pubkey }` — `v` (price value) NOT stored, pubkey included for quick access
- **Blob contents**: `{ x25519_priv, r_pay, meta }`
- **Equality proof**: Schnorr sigma (Fiat-Shamir), shared Rust core — backend endpoints first (`POST /zkp/generate-equality-proof`, `POST /zkp/verify-equality-proof` at port 5010), then WASM bindings, shadow parity, then WASM default
- **VC schema**: New `credentialSubject.attestation` object (NOT in payment section, NOT in proof array)
- **C_pay anchoring**: Off-chain only (DB + IPFS VC), no contract changes
- **UI**: "Verify Price" button in ProductDetail buyer panel (Workstream A); "Generate Equality Proof" button after A passes (Workstream B); extend VerifyVCInline/VCViewer for auditor

### Claude's Discretion

- Exact x25519 ECIES library choice for `encryptedOpening` (libsodium / tweetnacl / @noble/curves)
- Whether new buyer secrets go in a separate `buyer_secrets` table or new columns on `product_metadata`
- WASM build toolchain integration for the new Rust equality-proof module
- Error messaging for UI edge cases (seller hasn't confirmed order yet, decryption fails, proof generation times out)
- Exact `dispatchWithMode` wiring for the two new equality-proof operations in `zkpClient.js`

### Deferred Ideas (OUT OF SCOPE)

- On-chain C_pay anchoring (`PaymentCommitmentPublished` event or `keccak256(C_pay)` in contract)
- Railgun-native amount binding (Phase 6 of workstream roadmap)
- `/audit` standalone route (future thin wrapper over Phase 12 verifier logic)
- Buyer PIN/passphrase fallback for cross-device unwrap key derivation
- Reveal-to-auditor fallback (Option 3 from doc)
</user_constraints>

---

## Summary

Phase 12 extends the existing ZKP-backed supply chain VC system with a buyer-controlled cryptographic attestation path. After a Railgun private payment completes, the buyer generates a fresh x25519 keypair and a random `r_pay` blinding factor, creates `C_pay = Pedersen(v, r_pay)`, and stores an encrypted blob of secrets in the backend DB (primary) and localStorage (cache). The seller, at `confirmOrder`, reads the buyer's x25519 public key from the DB and encrypts `{value, blinding_price}` back to it using x25519 ECIES. Two deferred buyer operations follow: Workstream A (local commitment verification) and Workstream B (Schnorr sigma equality proof generation).

The codebase is highly receptive to this phase. All the patterns — dual-mode ZKP dispatch, non-blocking DB writes, append-only VC mutation, AES-GCM blob encryption, and the Rust actix-web endpoint structure — are already established and just need extension. The two technically novel pieces are: (1) the x25519 ECIES construction for `encryptedOpening`, and (2) the Schnorr sigma equality proof Rust module using the existing `curve25519_dalek_ng` + `bulletproofs` generators.

**Primary recommendation:** Use `@noble/curves` x25519 + `@noble/hashes` HKDF + Web Crypto AES-GCM for the ECIES construction (no new npm dependencies required — `@noble/curves` is pulled transitively by Railgun). Extend the existing Rust `pedersen.rs` module with a new `equality_proof.rs` that implements Chaum-Pedersen sigma protocol over the same `PedersenGens::default()` generators used by the range proof system.

---

## Standard Stack

### Core (Already Installed)

| Library | Version | Purpose | Evidence |
|---------|---------|---------|----------|
| `@noble/curves` | Transitive (via `@railgun-community/*`) | x25519 key generation, `getSharedSecret` for ECIES DH step | `frontend/package.json` has `@railgun-community/wallet 10.4.0` which pulls `@noble/curves` |
| `@noble/hashes` | Transitive (via Railgun) | HKDF-SHA256 for key derivation from x25519 shared secret | Same pull chain |
| Web Crypto API (`crypto.subtle`) | Browser built-in | AES-GCM encrypt/decrypt for buyer-secret blob AND for ECIES symmetric encryption | Already used in `frontend/src/lib/railgun-clean/crypto.js` |
| `curve25519_dalek_ng` | 4.1.1 | Ristretto point arithmetic for Schnorr sigma proof in Rust | `zkp-backend/Cargo.toml` |
| `bulletproofs` | 4.0.0 | `PedersenGens::default()` generators (`B`, `B_blinding`) shared with range proof system | `zkp-backend/Cargo.toml`, `zkp-backend/src/zk/pedersen.rs` |
| `merlin` | 3 | Transcript for Fiat-Shamir hash | `zkp-backend/Cargo.toml`, already used in pedersen.rs |
| `sha2` | 0.10 | SHA-256 hashing for Fiat-Shamir challenge if needed outside Merlin | `zkp-backend/Cargo.toml` |
| `better-sqlite3` | 12.6.2 | Backend DB for buyer_secrets table | `backend/api/db.js` |

### New Dependencies Needed

| Library | Version | Purpose | Install Command |
|---------|---------|---------|-----------------|
| `@noble/hashes` | `^1.6` | HKDF for ECIES key derivation (if not already transitively available) | `npm install @noble/hashes --prefix frontend` |
| `tweetnacl` | `^1.0.3` | Alternative: Complete X25519-XSalsa20-Poly1305 ECIES if @noble/curves is cumbersome | `npm install tweetnacl --prefix frontend` |

**Verify first:** Run `ls frontend/node_modules/@noble/` to confirm `@noble/curves` and `@noble/hashes` are present transitively.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@noble/curves` + Web Crypto ECIES | `tweetnacl` `box` API | `tweetnacl` is simpler (one-liner encrypt/decrypt) but uses XSalsa20-Poly1305 not AES-GCM; codebase already uses Web Crypto AES-GCM for mnemonic — consistency argument favors `@noble/curves` + Web Crypto |
| `@noble/curves` + Web Crypto ECIES | `libsodium-wrappers` | libsodium is heavier (~500KB WASM), requires async load; not worth it for a simple ECIES |
| Merlin transcript for Fiat-Shamir | Manual SHA-256 hash | Merlin is already in the codebase and provides domain separation; use it |

---

## Architecture Patterns

### Recommended Project Structure Extensions

```
frontend/src/
├── utils/
│   ├── buyerSecretApi.js        # NEW: saveBuyerSecretBlob / getBuyerSecretBlob (mirrors productMetaApi.js)
│   ├── ecies.js                 # NEW: encryptOpening / decryptOpening (x25519 ECIES)
│   ├── equalityProofClient.js   # NEW: generateEqualityProof / verifyEqualityProof (mirrors zkpClient dispatch)
│   ├── commitmentUtils.js       # EXTEND: add generateRandomBlinding(), openAndVerifyCommitment()
│   └── vcBuilder.mjs            # EXTEND: add appendAttestationData()
├── components/
│   ├── marketplace/
│   │   └── ProductDetail.jsx    # EXTEND: buyer panel with "Verify Price" and "Generate Equality Proof"
│   └── vc/
│       └── VerifyVCInline.js    # EXTEND: add equality proof status card
zkp-backend/src/zk/
├── equality_proof.rs            # NEW: Schnorr sigma proof module
└── mod.rs                       # EXTEND: pub mod equality_proof
backend/api/
├── db.js                        # EXTEND: CREATE TABLE buyer_secrets
└── server.js                    # EXTEND: POST/GET buyer_secrets routes
```

### Pattern 1: x25519 ECIES for `encryptedOpening`

**What:** Ephemeral x25519 DH + HKDF-SHA256 key derivation + AES-GCM-256 encrypt

**When to use:** Seller encrypts `{value, blinding_price}` to buyer's disclosed x25519 pubkey at `confirmOrder` time.

**Construction (Sender/Seller side):**
```typescript
// Source: @noble/curves README, Web Crypto API MDN
import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';

async function encryptOpening(
  buyerPubKeyHex: string,  // buyer's disclosed x25519 pubkey (32 bytes hex)
  plaintext: { value: number; blinding_price: string }
): Promise<{ ciphertext: string; ephemeralPubKey: string; iv: string }> {
  // 1. Generate ephemeral x25519 keypair
  const ephemPrivKey = x25519.utils.randomPrivateKey();
  const ephemPubKey = x25519.getPublicKey(ephemPrivKey);

  // 2. DH: shared_secret = X25519(ephemPrivKey, buyerPubKey)
  const buyerPubKeyBytes = hexToBytes(buyerPubKeyHex);
  const sharedSecret = x25519.getSharedSecret(ephemPrivKey, buyerPubKeyBytes);

  // 3. HKDF-SHA256 to derive AES-256 key
  // info context binds to protocol and product
  const info = new TextEncoder().encode('ev-supply-chain/opening/v1');
  const aesKeyBytes = hkdf(sha256, sharedSecret, undefined, info, 32);

  // 4. AES-GCM-256 encrypt with Web Crypto
  const cryptoKey = await crypto.subtle.importKey('raw', aesKeyBytes, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = new TextEncoder().encode(JSON.stringify(plaintext));
  const ciphertextBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, plaintextBytes);

  return {
    ciphertext: bytesToHex(new Uint8Array(ciphertextBuffer)),
    ephemeralPubKey: bytesToHex(ephemPubKey),
    iv: bytesToHex(iv),
  };
}
```

**Decryption (Buyer side) — uses stored `x25519_priv` from blob:**
```typescript
async function decryptOpening(
  encryptedOpening: { ciphertext: string; ephemeralPubKey: string; iv: string },
  buyerPrivKeyHex: string  // from decrypted buyer-secret blob
): Promise<{ value: number; blinding_price: string }> {
  const ephemPubKeyBytes = hexToBytes(encryptedOpening.ephemeralPubKey);
  const buyerPrivKeyBytes = hexToBytes(buyerPrivKeyHex);

  const sharedSecret = x25519.getSharedSecret(buyerPrivKeyBytes, ephemPubKeyBytes);
  const info = new TextEncoder().encode('ev-supply-chain/opening/v1');
  const aesKeyBytes = hkdf(sha256, sharedSecret, undefined, info, 32);

  const cryptoKey = await crypto.subtle.importKey('raw', aesKeyBytes, 'AES-GCM', false, ['decrypt']);
  const iv = hexToBytes(encryptedOpening.iv);
  const ciphertextBytes = hexToBytes(encryptedOpening.ciphertext);
  const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertextBytes);

  return JSON.parse(new TextDecoder().decode(plainBuffer));
}
```

### Pattern 2: Buyer-Secret Blob Encryption (AES-GCM + PBKDF2)

**What:** Reuse the exact `encryptMnemonic`/`decryptMnemonic` pattern from `crypto.js` — but with a DIFFERENT signing message to avoid key collision.

**Critical detail:** The existing mnemonic encryption uses a fixed MetaMask signing message (decision `fixed-signing-message` in STATE.md). The buyer-secret blob MUST use a different signing message so the derived key differs.

```typescript
// Source: frontend/src/lib/railgun-clean/crypto.js (existing pattern)
// Signing message for buyer blob — differs from mnemonic signing message
const BUYER_BLOB_SIGNING_MSG = 'Sign to derive your buyer-secret encryption key.\n\nThis key encrypts your payment privacy data.\n\nDo not share.';

// Blob structure stored in DB
interface BuyerSecretBlob {
  ciphertext: number[];  // encrypted { x25519_priv: hex, r_pay: hex, meta: {...} }
  iv: number[];
  salt: number[];
  aad: string;           // `${chainId}/${productAddress}/${buyerAddress}`
  version: string;       // "1.0"
  pubkey: string;        // x25519 public key hex (unencrypted — needed before decryption)
}
```

**AAD binding** — the AAD is included as additional authenticated data for AES-GCM. Web Crypto AES-GCM supports AAD via `additionalData` in the algorithm params:

```typescript
await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad) },
  key,
  plaintextBytes
);
```

**Key collision prevention:** The existing `crypto.js` uses a fixed MetaMask signing message. The buyer blob uses a different message. Both produce different PBKDF2-derived keys even with the same MetaMask account.

### Pattern 3: Schnorr Sigma Equality Proof (Rust)

**What:** Prove that two Pedersen commitments `C_price = v*B + r_price*B_blinding` and `C_pay = v*B + r_pay*B_blinding` commit to the same scalar `v` without revealing `v`.

**Math (Chaum-Pedersen protocol, Fiat-Shamir heuristic):**

Given: `C_price`, `C_pay` (both compressed Ristretto points)
Witness: `(v, r_price, r_pay)` where `C_price - C_pay = (r_price - r_pay)*B_blinding`

This reduces to a DLEQ (discrete log equality) proof on the generator `B_blinding`:
- `D = C_price - C_pay = (r_price - r_pay) * B_blinding`
- Prove knowledge of `delta_r = r_price - r_pay` such that `D = delta_r * B_blinding`

**Schnorr sigma protocol:**
1. Prover picks random `k` in Z_q
2. Announcement: `R = k * B_blinding`
3. Challenge: `c = H(transcript || C_price || C_pay || R)` — via Merlin transcript
4. Response: `s = k + c * delta_r` (mod group order)
5. Verifier checks: `s * B_blinding == R + c * D`

**Rust implementation skeleton:**
```rust
// zkp-backend/src/zk/equality_proof.rs
use bulletproofs::PedersenGens;
use curve25519_dalek_ng::{
    ristretto::{CompressedRistretto, RistrettoPoint},
    scalar::Scalar,
};
use merlin::Transcript;
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct EqualityProof {
    pub r_announcement: [u8; 32],  // CompressedRistretto of R = k*B_blinding
    pub s_response: [u8; 32],      // Scalar s = k + c*delta_r
}

pub fn prove_equality(
    c_price: CompressedRistretto,
    c_pay: CompressedRistretto,
    v: u64,
    r_price: Scalar,
    r_pay: Scalar,
    binding_context: &[u8],       // JSON bytes of {productId, txRef, chainId, escrowAddr, stage}
) -> Result<EqualityProof, String> {
    let pc_gens = PedersenGens::default();
    let delta_r = r_price - r_pay;

    let mut transcript = Transcript::new(b"EqualityProof-v1");
    transcript.append_message(b"context", binding_context);
    transcript.append_message(b"C_price", c_price.as_bytes());
    transcript.append_message(b"C_pay", c_pay.as_bytes());

    let mut rng = OsRng;
    let k = Scalar::random(&mut rng);
    let r_point = &k * pc_gens.B_blinding;
    let r_compressed = r_point.compress();

    transcript.append_message(b"R", r_compressed.as_bytes());

    // Fiat-Shamir challenge
    let mut c_bytes = [0u8; 64];
    transcript.challenge_bytes(b"challenge", &mut c_bytes);
    let c = Scalar::from_bytes_mod_order_wide(&c_bytes);

    let s = k + c * delta_r;

    Ok(EqualityProof {
        r_announcement: r_compressed.to_bytes(),
        s_response: s.to_bytes(),
    })
}

pub fn verify_equality(
    c_price: CompressedRistretto,
    c_pay: CompressedRistretto,
    proof: &EqualityProof,
    binding_context: &[u8],
) -> bool {
    let pc_gens = PedersenGens::default();

    let mut transcript = Transcript::new(b"EqualityProof-v1");
    transcript.append_message(b"context", binding_context);
    transcript.append_message(b"C_price", c_price.as_bytes());
    transcript.append_message(b"C_pay", c_pay.as_bytes());
    transcript.append_message(b"R", &proof.r_announcement);

    let mut c_bytes = [0u8; 64];
    transcript.challenge_bytes(b"challenge", &mut c_bytes);
    let c = Scalar::from_bytes_mod_order_wide(&c_bytes);

    let r_point = match CompressedRistretto(proof.r_announcement).decompress() {
        Some(p) => p,
        None => return false,
    };
    let s = Scalar::from_canonical_bytes(proof.s_response).unwrap_or(Scalar::ZERO);

    // D = C_price - C_pay
    let cp = match c_price.decompress() { Some(p) => p, None => return false };
    let cpay = match c_pay.decompress() { Some(p) => p, None => return false };
    let d = cp - cpay;

    // Check: s * B_blinding == R + c * D
    let lhs = &s * pc_gens.B_blinding;
    let rhs = r_point + &c * d;
    lhs.compress() == rhs.compress()
}
```

**Binding context serialization:** Use `serde_json::to_vec(&binding_context_struct)` to produce deterministic JSON bytes for the transcript.

### Pattern 4: New Backend API Routes

**Following the identical pattern in `backend/api/server.js`:**

```javascript
// backend/api/server.js additions

// Prepared statements at startup
const stmtUpsertBuyerSecret = db.prepare(`
  INSERT OR REPLACE INTO buyer_secrets
    (product_address, buyer_address, encrypted_blob, disclosure_pubkey, c_pay, updated_at)
  VALUES
    (@productAddress, @buyerAddress, @encryptedBlob, @disclosurePubkey, @cPay, datetime('now'))
`);

const stmtGetBuyerSecret = db.prepare(
  'SELECT * FROM buyer_secrets WHERE product_address = ? AND buyer_address = ?'
);

// POST /buyer-secrets — upsert buyer secret blob at payment time
app.post('/buyer-secrets', (req, res) => { /* ... */ });

// GET /buyer-secrets/:productAddress/:buyerAddress — read blob
app.get('/buyer-secrets/:productAddress/:buyerAddress', (req, res) => { /* ... */ });

// PATCH /buyer-secrets/:productAddress/:buyerAddress/encrypted-opening — seller writes ciphertext
app.patch('/buyer-secrets/:productAddress/:buyerAddress/encrypted-opening', (req, res) => { /* ... */ });

// PATCH /buyer-secrets/:productAddress/:buyerAddress/equality-proof — buyer writes proof
app.patch('/buyer-secrets/:productAddress/:buyerAddress/equality-proof', (req, res) => { /* ... */ });
```

### Pattern 5: `dispatchWithMode` Extension for Equality Proof

**Following the identical pattern in `zkpClient.js`:**

```javascript
// frontend/src/utils/equalityProofClient.js (new file)
import { generateEqualityProofBackend, verifyEqualityProofBackend } from './providers/equalityProofBackendProvider';
import { generateEqualityProofWasm, verifyEqualityProofWasm } from './providers/equalityProofWasmProvider'; // Phase 2+

async function dispatchEqualityProofWithMode({ operation, params, backendFn, wasmFn, comparer }) {
  // Identical dispatchWithMode logic from zkpClient.js
  // Initial deployment: backend mode only (wasmFn stubs throw "not yet implemented")
}

export async function generateEqualityProof(params) {
  return dispatchEqualityProofWithMode({
    operation: 'generate-equality-proof',
    params,
    backendFn: generateEqualityProofBackend,
    wasmFn: generateEqualityProofWasm,
    comparer: (a, b) => a?.proof === b?.proof,
  });
}

export async function verifyEqualityProof(params) {
  return dispatchEqualityProofWithMode({
    operation: 'verify-equality-proof',
    params,
    backendFn: verifyEqualityProofBackend,
    wasmFn: verifyEqualityProofWasm,
    comparer: (a, b) => Boolean(a?.verified) === Boolean(b?.verified),
  });
}
```

### Pattern 6: `appendAttestationData` in vcBuilder.mjs

**Following the identical deep-clone + field-set pattern of `appendPaymentProof`:**

```javascript
// frontend/src/utils/vcBuilder.mjs — new export
export function appendAttestationData(vc, { attestationFields, previousVersionCid }) {
  const updated = JSON.parse(JSON.stringify(vc));

  // Initialize attestation if not present
  if (!updated.credentialSubject.attestation) {
    updated.credentialSubject.attestation = { attestationVersion: '1.0' };
  }

  // Merge new fields (incremental — preserves previously written fields)
  Object.assign(updated.credentialSubject.attestation, attestationFields);

  if (previousVersionCid) {
    updated.previousVersion = previousVersionCid;
  }

  return updated;
}
```

**Write sequence:**
1. Payment time: `attestationFields = { disclosurePubKey, buyerPaymentCommitment: { commitment, proof, bindingContext } }`
2. After confirmOrder: `attestationFields = { encryptedOpening: { ciphertext, ephemeralPubKey, iv } }`
3. After proof generation: `attestationFields = { paymentEqualityProof: { proof, bindingContext } }`

### Anti-Patterns to Avoid

- **Storing plaintext `x25519_priv` server-side:** The encrypted blob must be stored; server never sees the private key. Only the `pubkey` (public key) is stored unencrypted in the DB for the seller to read.
- **Deriving x25519 keypair from wallet signature:** Explicitly forbidden (CONTEXT.md); wallet signatures are not stable KDF inputs across providers. Use `x25519.utils.randomPrivateKey()`.
- **Using the same PBKDF2 signing message as mnemonic encryption:** Would cause key collision — the buyer blob signing message must differ from the Railgun mnemonic signing message.
- **Storing `v` (price value) in the buyer blob:** Explicitly forbidden. `v` is retrieved at proof time from the decrypted `encryptedOpening`.
- **Blocking payment flow on blob write failure:** Non-blocking write with own try/catch — same as Phase 11 `saveProductMeta` pattern.
- **On-chain contract changes for C_pay:** Explicitly deferred. Off-chain only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| x25519 key generation | Custom Curve25519 impl | `x25519.utils.randomPrivateKey()` from `@noble/curves/ed25519` | Constant-time, audited, already in node_modules |
| x25519 DH | Manual scalar multiplication | `x25519.getSharedSecret(privKey, pubKey)` | Handles cofactor clearing (RFC 7748 §6.1) |
| ECIES symmetric key derivation | Raw shared secret as AES key | HKDF-SHA256 from `@noble/hashes/hkdf` | Shared secret has non-uniform distribution; HKDF provides proper key material |
| Fiat-Shamir challenge | Manual `sha256(...)` | `merlin::Transcript::challenge_bytes()` | Already in codebase; provides domain-separated, context-bound challenges |
| Ristretto point arithmetic | Custom group ops | `curve25519_dalek_ng` already in Cargo.toml | Constant-time, audited |
| AES-GCM blob encryption | Custom cipher | `crypto.subtle.encrypt` AES-GCM (Web Crypto) | Already used in `crypto.js` for mnemonic; FIPS-validated |

**Key insight:** The codebase already has all cryptographic primitives needed. Phase 12 is primarily a wiring exercise; the only genuinely new code is the Rust equality proof module.

---

## Common Pitfalls

### Pitfall 1: x25519 Public Key Byte Format Mismatch

**What goes wrong:** `@noble/curves` `x25519.getPublicKey()` returns a 32-byte `Uint8Array`. If stored as hex (64 chars) and retrieved as a string, the byte conversion must be consistent at encryption and decryption time.

**Why it happens:** Mixing `Uint8Array` ↔ hex string representations without explicit `hexToBytes`/`bytesToHex` helpers.

**How to avoid:** Create a single `ecies.js` utility with explicit `hexToBytes`/`bytesToHex` helpers used at every boundary. Always store keys as lowercase hex strings (64 chars = 32 bytes).

**Warning signs:** AES-GCM decryption throws `DOMException: The operation failed for an operation-specific reason` (wrong derived key).

### Pitfall 2: Scalar Reduction Before Using as Pedersen Blinding

**What goes wrong:** `r_pay` is generated as 32 random bytes. `curve25519_dalek_ng::scalar::Scalar::from_bytes_mod_order()` reduces mod group order. The commitment is `C_pay = v*B + r_pay_reduced*B_blinding`. The stored blob must store `r_pay` as the raw bytes so the Rust backend can re-reduce and get the same scalar.

**Why it happens:** Forgetting that `Scalar::from_bytes_mod_order()` is lossy (modular reduction). The JS side must send the exact 32 bytes that were sent to the backend at C_pay generation time.

**How to avoid:** Store `r_pay` as the exact 32-byte hex that was submitted to the ZKP backend for `C_pay` generation. Do not apply any JS-side transformation to it.

### Pitfall 3: Merlin Transcript Order Matters

**What goes wrong:** Equality proof verify fails even with correct inputs because the prover and verifier appended transcript messages in different orders.

**Why it happens:** Transcript is a running hash; order is significant. If binding_context is appended after C_price in prove but before C_price in verify, the challenge `c` will differ.

**How to avoid:** Document the canonical order in code comments and enforce via tests: `context → C_price → C_pay → R → challenge`. Never change order between prove and verify.

### Pitfall 4: AES-GCM AAD Mismatch on Blob Decryption

**What goes wrong:** Buyer blob decryption fails with `DOMException: operation failed` even with correct key, because the AAD used for encryption differs from the AAD provided for decryption.

**Why it happens:** `aad` is `${chainId}/${productAddress}/${buyerAddress}`. If `productAddress` is checksummed during encryption but lowercase during decryption (or vice versa), the AAD bytes differ.

**How to avoid:** Always lowercase `productAddress` and `buyerAddress` before constructing AAD. The existing pattern in `server.js` lowercases addresses — apply the same normalization client-side.

### Pitfall 5: Signing Message Key Collision

**What goes wrong:** Buyer blob decryption silently fails if the buyer's wallet has already signed to generate the mnemonic key (same PBKDF2 input → same AES key → wrong key for blob).

**Why it happens:** The existing `crypto.js` uses a fixed signing message (decision `fixed-signing-message`). Using the same message for the buyer blob would derive the same key.

**How to avoid:** Use a distinct signing message for buyer blob derivation (e.g., `'EV Supply Chain: Sign to protect your payment privacy data for {productAddress}'`). The productAddress in the message also provides context binding at the signing message level.

### Pitfall 6: Worker Timeout for WASM Equality Proofs

**What goes wrong:** The Schnorr sigma proof (Workstream B) will take some time in WASM. The existing `wasmProvider.js` has a 120-second default timeout. If proof generation exceeds this, the worker errors.

**Why it happens:** Schnorr sigma proofs are lighter than Bulletproofs range proofs (no inner product argument), so they should be well under 1 second — but the WASM worker spin-up adds latency.

**How to avoid:** In the initial backend-mode deployment (no WASM yet), this is not a concern. When WASM bindings are added, benchmark on target hardware. The equality proof should generate in under 50ms natively.

### Pitfall 7: `confirmOrder` Read — Buyer Pubkey Not Yet in DB

**What goes wrong:** Seller calls `confirmOrder` but `getBuyerSecretBlob` returns null because the buyer's blob wasn't persisted (network error, race condition).

**Why it happens:** The blob write is non-blocking (try/catch, fire-and-forget). If the network write failed, the DB has no entry.

**How to avoid:** The seller's `confirmOrder` path should handle the null case gracefully: skip the ECIES encryption step, log a warning, and proceed with `confirmOrder` (on-chain must not be blocked). The `encryptedOpening` field will simply be absent from the VC; the buyer sees "Price verification not yet available" UI state.

---

## Code Examples

### Existing: `encryptMnemonic` Pattern (crypto.js) — Reuse for Buyer Blob

```javascript
// Source: frontend/src/lib/railgun-clean/crypto.js (lines 86-111)
// Pattern to reuse: identical structure, different signing message
export async function encryptMnemonic(mnemonic, signature) {
  const salt = getOrCreateSalt();
  const key = await deriveKeyFromSignature(signature, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(mnemonic)
  );
  return { iv: Array.from(iv), salt: Array.from(salt), data: Array.from(new Uint8Array(encryptedBuffer)) };
}
// Phase 12 extension: add `additionalData` (AAD) param to encrypt call
```

### Existing: `dispatchWithMode` Pattern (zkpClient.js) — Extend for Equality Proof

```javascript
// Source: frontend/src/utils/zkp/zkpClient.js (lines 55-85)
async function dispatchWithMode({ operation, params, backendFn, wasmFn, comparer }) {
  const mode = getZkpMode(); // reads REACT_APP_ZKP_MODE
  if (mode === ZKP_MODE_BACKEND) return backendFn(params);
  if (mode === ZKP_MODE_WASM) return wasmFn(params);
  // Shadow mode: run both, compare, log mismatch
  const backendResult = await backendFn(params);
  try {
    const wasmResult = await wasmFn(params);
    runShadowComparison({ operation, backendResult, wasmResult, comparer });
  } catch (error) { /* log but return backendResult */ }
  return backendResult;
}
```

### Existing: `appendPaymentProof` Pattern (vcBuilder.mjs) — Extend for Attestation

```javascript
// Source: frontend/src/utils/vcBuilder.mjs (lines 233-262)
export function appendPaymentProof(vc, { buyerAddr, memoHash, railgunTxRef, previousVersionCid }) {
  const updated = JSON.parse(JSON.stringify(vc)); // deep clone — never mutate original
  updated.credentialSubject.payment = { timestamp: new Date().toISOString(), /* ... */ };
  updated.previousVersion = previousVersionCid;
  return updated;
}
// Phase 12: appendAttestationData follows identical deep-clone pattern
```

### Existing: DB Route Pattern (server.js) — Extend for buyer_secrets

```javascript
// Source: backend/api/server.js (lines 97-116) — POST /metadata pattern
app.post('/metadata', (req, res) => {
  const { productAddress, productMeta, ... } = req.body;
  if (!productAddress || !productMeta) return res.status(400).json({ error: '...' });
  try {
    const addr = productAddress.toLowerCase();
    stmtUpsert.run({ productAddress: addr, productMeta: JSON.stringify(productMeta), ... });
    return res.status(201).json({ success: true, productAddress: addr });
  } catch (error) { return res.status(500).json({ error: 'Internal server error' }); }
});
```

### New: Rust ZKP Endpoint for Equality Proof

```rust
// Source: zkp-backend/src/main.rs pattern — POST /zkp/generate-equality-proof
#[derive(Deserialize)]
struct EqualityProofRequest {
    c_price_hex: String,         // 32-byte hex
    c_pay_hex: String,           // 32-byte hex
    v: u64,                      // price value
    r_price_hex: String,         // 32-byte scalar hex
    r_pay_hex: String,           // 32-byte scalar hex
    binding_context: serde_json::Value, // {productId, txRef, chainId, escrowAddr, stage}
}

#[derive(Serialize)]
struct EqualityProofResponse {
    proof: String,               // hex-encoded proof bytes
    verified: bool,              // immediate self-verification flag
}

#[post("/zkp/generate-equality-proof")]
async fn generate_equality_proof_ep(req: web::Json<EqualityProofRequest>) -> impl Responder {
    // parse hex fields, call equality_proof::prove_equality(), return hex proof
}
```

### New: `buyerSecretApi.js` Frontend Utility

```javascript
// Pattern: mirrors productMetaApi.js exactly
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

// Throw on write failure (same contract as saveProductMeta)
export async function saveBuyerSecretBlob({ productAddress, buyerAddress, encryptedBlob, disclosurePubkey, cPay }) {
  const res = await fetch(`${BACKEND_URL}/buyer-secrets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productAddress: productAddress.toLowerCase(),
      buyerAddress: buyerAddress.toLowerCase(),
      encryptedBlob, disclosurePubkey, cPay,
    }),
  });
  if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error || `saveBuyerSecretBlob failed: ${res.status}`); }
  return res.json();
}

// Return null on read failure (same contract as getProductMeta)
export async function getBuyerSecretBlob(productAddress, buyerAddress) {
  try {
    const res = await fetch(`${BACKEND_URL}/buyer-secrets/${productAddress.toLowerCase()}/${buyerAddress.toLowerCase()}`);
    if (res.status === 404) return null;
    if (!res.ok) { console.warn(`getBuyerSecretBlob: unexpected status ${res.status}`); return null; }
    return res.json();
  } catch (err) { console.warn('getBuyerSecretBlob: network error', err.message); return null; }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Web Crypto API has no X25519 support | Chrome 113+, Firefox 130+ ship native X25519 via SubtleCrypto (`importKey('raw', ..., 'X25519', ...)`) | 2023-2024 | Could use native `deriveKey` for ECIES DH, but `@noble/curves` is simpler and already installed |
| Schnorr equality proofs required external crate | Can be implemented directly on `curve25519_dalek_ng` primitives with Merlin | Current | No new Rust crate needed — pure `curve25519_dalek_ng` + `merlin` (both already in Cargo.toml) |
| WASM worker already exists | `wasmProvider.js` uses Web Worker message-passing pattern (120s timeout) | Phase 4 | Equality proof WASM bindings slot into the same worker via new message types |

**Deprecated/outdated:**
- `bulletproofs::r1cs::Prover/Verifier` API: Not needed for equality proofs. Equality proof uses raw Ristretto arithmetic + Merlin, not the R1CS constraint system.
- `snarkjs` (in frontend/package.json): Not used for this phase — Schnorr sigma proofs are simpler and don't require a setup ceremony.

---

## Open Questions

1. **Is `@noble/hashes` available transitively?**
   - What we know: `@noble/curves` is pulled by `@railgun-community/wallet 10.4.0`; `@noble/hashes` is typically a co-dependency.
   - What's unclear: Whether it's in `frontend/node_modules/@noble/hashes` without explicit installation.
   - Recommendation: Run `ls frontend/node_modules/@noble/` early in Wave 0. If absent, `npm install @noble/hashes --prefix frontend`.

2. **Does the `buyer_secrets` table belong to a separate DB file or same `metadata.sqlite`?**
   - What we know: `db.js` creates a single WAL-mode SQLite file. Adding buyer_secrets as a new table in the same file is simplest.
   - What's unclear: Whether there are scaling or separation concerns.
   - Recommendation: Single DB file (simplest). Separate table `buyer_secrets` (not columns on `product_metadata` — different lifecycle, different access patterns: seller reads it, buyer writes to it).

3. **WASM build for equality proof module**
   - What we know: The WASM build is done via `wasm-pack build ../zkp-backend/zkp-wasm ...` (see `frontend/package.json` scripts). The new equality proof Rust code must be accessible from the `zkp-wasm` crate.
   - What's unclear: Whether `zkp-wasm/src/lib.rs` imports from `src/zk/` via the lib crate or needs direct duplication.
   - Recommendation: Add `equality_proof.rs` to `zkp-backend/src/zk/`, export via `lib.rs` (`pub mod zk;`), and in `zkp-wasm/src/lib.rs` call `bulletproof_demo::zk::equality_proof::prove_equality(...)`. This is the same pattern used for `pedersen.rs` in the WASM bindings.

4. **Signing message for buyer blob derivation — user experience**
   - What we know: Must differ from the mnemonic signing message.
   - What's unclear: Best UX — should it be a fixed string or include productAddress?
   - Recommendation: Fixed string with clear context (e.g., `'EV Supply Chain Buyer Privacy Key v1'`). Including productAddress would require a new MetaMask signature per product, which is bad UX. A fixed message means one signature produces keys for all purchases (acceptable for this prototype).

---

## Database Schema

### New Table: `buyer_secrets`

```sql
CREATE TABLE IF NOT EXISTS buyer_secrets (
  product_address    TEXT NOT NULL,
  buyer_address      TEXT NOT NULL,
  encrypted_blob     TEXT NOT NULL,   -- JSON: { ciphertext, iv, salt, aad, version, pubkey }
  disclosure_pubkey  TEXT NOT NULL,   -- x25519 pubkey hex (unencrypted, needed by seller)
  c_pay              TEXT,            -- Pedersen commitment hex (C_pay)
  c_pay_proof        TEXT,            -- range proof hex for C_pay
  encrypted_opening  TEXT,            -- JSON: { ciphertext, ephemeralPubKey, iv } — written by seller
  equality_proof     TEXT,            -- JSON: { proof, bindingContext } — written by buyer
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (product_address, buyer_address)
);
```

**Rationale for separate table:** `product_metadata` is written by the seller. `buyer_secrets` is written by the buyer. Different actors, different lifecycles, different access patterns. Clean separation avoids nulling out large product_metadata rows with buyer data.

---

## VC Schema — `credentialSubject.attestation` Object

```json
{
  "credentialSubject": {
    "attestation": {
      "attestationVersion": "1.0",
      "disclosurePubKey": "<32-byte x25519 pubkey hex>",
      "buyerPaymentCommitment": {
        "commitment": "<C_pay hex>",
        "proof": "<range proof hex for C_pay>",
        "bindingContext": {
          "productId": "<string>",
          "txRef": "<memoHash hex>",
          "chainId": "<string>",
          "escrowAddr": "<product contract address>",
          "stage": "payment"
        }
      },
      "encryptedOpening": {
        "ciphertext": "<hex>",
        "ephemeralPubKey": "<32-byte x25519 hex>",
        "iv": "<12-byte hex>"
      },
      "paymentEqualityProof": {
        "proof": "<schnorr sigma proof hex>",
        "bindingContext": {
          "productId": "<string>",
          "txRef": "<memoHash hex>",
          "chainId": "<string>",
          "escrowAddr": "<product contract address>",
          "stage": "equality"
        }
      }
    }
  }
}
```

**Write sequence:**
- `disclosurePubKey` + `buyerPaymentCommitment` — at payment time in `PrivatePaymentModal`
- `encryptedOpening` — at confirmOrder in `ProductDetail.handleConfirmOrder`
- `paymentEqualityProof` — deferred, buyer-triggered in `ProductDetail` buyer panel

---

## Flow Integration Points (Exact Code Locations)

### Write Path 1: Payment Time — `PrivatePaymentModal.jsx`

**Current:** After `recordPrivatePayment` succeeds, sets `step = 'complete'`.

**Extension (after `recordPrivatePayment` succeeds, non-blocking):**
1. Generate `x25519_priv = x25519.utils.randomPrivateKey()`, compute `x25519_pub = x25519.getPublicKey(x25519_priv)`
2. Generate `r_pay = crypto.getRandomValues(new Uint8Array(32))`
3. Generate `C_pay` via `generateValueCommitmentWithBlinding({ value: parsedAmount, blindingHex: bytesToHex(r_pay) })`
4. Encrypt buyer-secret blob via `encryptMnemonic`-style AES-GCM with buyer-blob signing message
5. `saveBuyerSecretBlob(...)` — non-blocking try/catch
6. Optionally cache blob to localStorage (same key format as product_metadata cache)
7. Call `appendAttestationData(currentVC, { disclosurePubKey, buyerPaymentCommitment: ... })`
8. Upload updated VC to IPFS + `updateVcCid`

### Write Path 2: confirmOrder — `ProductDetail.handleConfirmOrder`

**Current:** Builds `finalVc`, signs, uploads IPFS, calls `contract.confirmOrder(newCid)`.

**Extension (between step 1 "Sign VC" and step 2 "Upload IPFS"):**
1. `getBuyerSecretBlob(productAddress, buyerAddress)` — read buyer's disclosure pubkey
2. If blob found: `encryptOpening(disclosurePubkey, { value, blinding_price: deterministic_blinding })`
3. `appendAttestationData(finalVc, { encryptedOpening })` — add to VC before IPFS upload
4. PATCH buyer_secrets `encrypted_opening` field in DB (non-blocking)

**Note:** `value` (price in wei) is available from `product` state. `blinding_price` is `generateDeterministicBlinding(productAddress, sellerAddress)` — same function already used for `C_price` generation.

### Write Path 3: Buyer Panel — `ProductDetail.jsx` buyer panel

**Workstream A ("Verify Price" button):**
1. Load buyer-secret blob from DB (read `encryptedBlob`)
2. Prompt buyer to sign for key derivation (decrypt blob)
3. Extract `x25519_priv` from blob
4. `decryptOpening(encryptedOpening, x25519_priv)` → `{ value, blinding_price }`
5. Compute `C_check = Pedersen(value, blinding_price)` via `generateValueCommitmentWithBlinding`
6. Compare `C_check === VC.credentialSubject.priceCommitment.commitment`
7. Show pass/fail inline (no IPFS write needed)

**Workstream B ("Generate Equality Proof" button — only shown after A passes):**
1. Use `{ value, blinding_price }` from step 4 above (or re-decrypt)
2. Get `r_pay` from decrypted blob
3. Call `generateEqualityProof({ c_price, c_pay, v: value, r_price: blinding_price, r_pay, bindingContext })`
4. `appendAttestationData(currentVC, { paymentEqualityProof: { proof, bindingContext } })`
5. Upload VC to IPFS + `updateVcCid` + PATCH buyer_secrets `equality_proof`

---

## Sources

### Primary (HIGH confidence)

- Live codebase — `zkp-backend/src/zk/pedersen.rs`: Confirmed `PedersenGens::default()`, Merlin transcript pattern, `curve25519_dalek_ng::Scalar`, `RangeProof` API
- Live codebase — `zkp-backend/Cargo.toml`: Confirmed `curve25519-dalek-ng = "4.1.1"`, `bulletproofs = "4.0.0"`, `merlin = "3"`, `sha2 = "0.10"`
- Live codebase — `zkp-backend/src/main.rs`: Confirmed actix-web endpoint pattern, `Scalar::from_bytes_mod_order()`, `CompressedRistretto` serialization
- Live codebase — `frontend/src/lib/railgun-clean/crypto.js`: Confirmed AES-GCM + PBKDF2 pattern, `crypto.subtle.encrypt/decrypt`, `getOrCreateSalt()` pattern
- Live codebase — `frontend/src/utils/zkp/zkpClient.js`: Confirmed `dispatchWithMode`, `ZKP_MODE_*` constants, shadow comparison pattern
- Live codebase — `frontend/src/utils/productMetaApi.js`: Confirmed throw-on-write / null-on-read contract, `BACKEND_URL` env var pattern
- Live codebase — `backend/api/server.js`: Confirmed prepared-statements-at-startup, WAL mode, address lowercase normalization
- Live codebase — `frontend/src/utils/zkp/providers/wasmProvider.js`: Confirmed Web Worker message-passing pattern, 120s timeout
- [Bulletproofs PedersenGens docs](https://docs.rs/bulletproofs/latest/bulletproofs/struct.PedersenGens.html): Confirmed `B` and `B_blinding` generators, `commit(value, blinding)` method

### Secondary (MEDIUM confidence)

- [@noble/curves GitHub README](https://github.com/paulmillr/noble-curves): Confirmed `x25519.utils.randomPrivateKey()`, `x25519.getPublicKey()`, `x25519.getSharedSecret()` API
- [WICG WebCrypto Secure Curves](https://wicg.github.io/webcrypto-secure-curves/): Confirmed native X25519 in modern browser SubtleCrypto (Chrome 113+, Firefox 130+)
- [ecies.org/js DETAILS](http://ecies.org/js/DETAILS.html): Confirmed x25519 ECIES construction: ephemeral keypair + HKDF-SHA256 + AES-GCM-256

### Tertiary (LOW confidence — verify before implementing)

- Transitive `@noble/hashes` availability: assumed present via `@railgun-community/wallet`. **Verify with `ls frontend/node_modules/@noble/`.**
- Schnorr sigma proof size: Expected ~64 bytes (32 bytes `R` + 32 bytes `s`). Unverified benchmark.

---

## Metadata

**Confidence breakdown:**
- Existing codebase patterns: HIGH — read directly from source files
- Standard stack: HIGH — all libraries confirmed from Cargo.toml and package.json
- x25519 ECIES construction: HIGH — confirmed from @noble/curves docs and ecies.org
- Schnorr sigma math: HIGH — standard Chaum-Pedersen, verified from multiple cryptographic sources
- Architecture patterns: HIGH — derived from existing Phase 11 patterns in same codebase
- Pitfalls: MEDIUM — derived from pattern analysis and cryptographic first principles; some edge cases may emerge during implementation

**Research date:** 2026-03-03
**Valid until:** 2026-06-03 (stable cryptographic primitives; library APIs unlikely to change)
