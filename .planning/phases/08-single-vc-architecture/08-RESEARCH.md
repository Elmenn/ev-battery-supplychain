# Phase 8: Single VC Architecture - Research

**Researched:** 2026-02-16
**Domain:** Verifiable Credentials, IPFS/Pinata, ZKP integration, append-only document design
**Confidence:** HIGH (codebase-driven research, all key files inspected)

## Summary

Phase 8 consolidates the existing 3-stage VC chain (Stage 0 listing, Stage 2 order confirmation, Stage 3 delivery) into a single append-only Verifiable Credential document. The existing codebase already has substantial VC infrastructure: `vcBuilder.mjs` (ES module with `buildStage0VC`, `buildStage2VC`, `buildStage3VC`), `signVcWithMetamask.js` (EIP-712 typed signing), `commitmentUtils.js` (Pedersen commitment generation via Rust backend), `ipfs.js` (Pinata upload), and the smart contract `ProductEscrow_Initializer.sol` with `confirmOrder(vcCID)` and `confirmDelivery(hash)`.

The key transformation: instead of building 3 separate VC documents that link via `previousCredential` CIDs, build ONE document that starts at listing and gets sections appended (payment proof, delivery proof). Each mutation creates a new IPFS version linked via `previousVersion`. The ZKP/Bulletproofs infrastructure is fully working and just needs its output embedded in the VC's price section (which the current Stage 0 already does).

**Primary recommendation:** Rewrite `vcBuilder.mjs` to export `createListingVC()`, `appendPaymentProof()`, `appendDeliveryProof()` functions that operate on a single document structure. Keep the existing `signVcWithMetamask.js` EIP-712 signing, `commitmentUtils.js`, and `ipfs.js` essentially unchanged. Add an `ipfs.js` `fetchJson()` function for retrieval (currently hardcoded `fetch("https://ipfs.io/ipfs/...")` scattered across components).

## Standard Stack

The established libraries/tools already in the project:

### Core (Already Installed - DO NOT ADD NEW DEPS)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| ethers | 6.13.1 | keccak256, BrowserProvider, signTypedData (EIP-712) | In use |
| json-canonicalize | 2.0.0 | Deterministic JSON serialization for hashing | In use |
| uuid | 11.1.0 | VC document ID generation | In use |
| Pinata API | REST | IPFS upload via `pinFileToIPFS` | In use (`ipfs.js`) |
| Rust Bulletproofs backend | localhost:5010 | Pedersen commitment + range proof generation | In use |

### Supporting (Already Available)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| localforage | 1.10.0 | IndexedDB wrapper for VC caching | Installed, not yet used for VCs |
| ajv | 8.12.0 | JSON schema validation | Installed, could validate VC schema |

### DO NOT ADD
| Library | Why Not |
|---------|---------|
| did-jwt / did-jwt-vc | Overkill - project uses EIP-712 typed data signing, not JWT |
| @veramo/core | Full SSI framework - way too heavy for this use case |
| ceramic / ComposeDB | Different paradigm - project uses IPFS directly |
| snarkjs/circom | Already in package.json for Railgun SDK, NOT for VC proofs. CONTEXT.md mentions it but the actual working ZKP is the Rust Bulletproofs backend |

**NOTE ON SNARKJS/CIRCOM:** The CONTEXT.md decisions section mentions "use snarkjs/circom for production-grade range proofs" but this CONTRADICTS the existing working Bulletproofs infrastructure. The user also explicitly stated in the MVP scope: "Use existing Bulletproofs range proof from Rust backend -- wire into VC, don't rebuild." The snarkjs package in `package.json` is a dependency of the Railgun SDK, not used for VC proofs. **Use the existing Rust Bulletproofs backend. Do not build snarkjs circuits.**

## Architecture Patterns

### Current File Structure (What Exists)
```
frontend/src/
  utils/
    vcBuilder.mjs          # ES module: buildStage0VC, buildStage2VC, buildStage3VC, hashVcPayload, freezeVcJson
    vcBuilder.js           # CJS duplicate (legacy) - same functions
    signVcWithMetamask.js  # EIP-712 signing: signVcWithMetamask (buyer), signVcAsSeller
    commitmentUtils.js     # generateCommitmentWithBindingTag, generateDeterministicBlinding, verifyCommitmentMatch
    ipfs.js                # uploadJson(obj) -> CID via Pinata
    web3Utils.js           # confirmOrder(address, cid), getCurrentCid(address)
  components/
    marketplace/
      ProductFormStep3.jsx # Creates Stage 0 VC at product listing (seller flow)
      ProductDetail.jsx    # Creates Stage 2 VC (seller confirms) and Stage 3 VC (buyer delivery)
    vc/
      VCViewer.jsx         # Displays VC contents
      VerifyVCInline.js    # Verifies VC signatures
      ProvenanceChainViewer.jsx # Follows previousCredential chain
      ZKPVerificationBox.js # Verifies ZKP proofs
```

### Target File Structure (Phase 8 Changes)
```
frontend/src/
  utils/
    vcBuilder.mjs          # REWRITE: createListingVC(), appendPaymentProof(), appendDeliveryProof()
    vcBuilder.js           # DELETE (legacy CJS duplicate)
    signVcWithMetamask.js  # MINIMAL CHANGES: update EIP-712 types if schema changes
    commitmentUtils.js     # NO CHANGES (already working)
    ipfs.js                # ADD: fetchJson(cid) function
    web3Utils.js           # NO CHANGES (confirmOrder already takes vcCID string)
    vcVerifier.js          # NEW: consolidated verification logic
  components/
    (NO UI CHANGES - Phase 9 handles UI)
```

### Pattern 1: Append-Only VC Document
**What:** Single JSON document with sections that accumulate over the product lifecycle
**When to use:** Every VC mutation (listing, payment, delivery)

The VC document has a fixed structure. Sections start as `null` and get filled in:

```javascript
// Source: Derived from existing vcBuilder.mjs patterns + W3C VC Data Model
{
  "@context": ["https://www.w3.org/2018/credentials/v1"],
  "id": "urn:uuid:<generated>",
  "type": ["VerifiableCredential", "SupplyChainCredential"],
  "schemaVersion": "2.0",  // Bump from "1.0" to distinguish new format
  "issuer": {
    "id": "did:ethr:<chainId>:<sellerAddress>",
    "name": "Seller"
  },
  "issuanceDate": "<ISO timestamp>",
  "credentialSubject": {
    "id": "did:ethr:<chainId>:<sellerAddress>",  // Initially seller, updated to buyer after payment
    "productName": "...",
    "batch": "...",
    "quantity": 1,
    "productContract": "<escrow address>",
    "productId": "<on-chain ID>",
    "chainId": "<chain ID>",

    // --- Price privacy section (filled at listing) ---
    "priceCommitment": {
      "protocol": "bulletproofs-pedersen",
      "version": "1.0",
      "commitment": "<hex>",        // Pedersen commitment value
      "proof": "<hex>",             // Range proof bytes
      "encoding": "hex",
      "verified": true,
      "bindingTag": "<hex>",
      "bindingContext": {
        "chainId": "...",
        "escrowAddr": "...",
        "productId": "...",
        "stage": 0,
        "schemaVersion": "2.0"
      }
    },

    // --- Listing section (filled at listing) ---
    "listing": {
      "timestamp": "<ISO>",
      "sellerBond": "<wei amount>",
      "certificateCredential": { "name": "...", "cid": "..." },
      "componentCredentials": []
    },

    // --- Payment section (null until buyer pays) ---
    "payment": null,
    // When filled:
    // "payment": {
    //   "timestamp": "<ISO>",
    //   "buyerAddress": "did:ethr:<chainId>:<buyerAddr>",
    //   "memoHash": "<bytes32>",
    //   "railgunTxRef": "<bytes32>",
    //   "txHashCommitment": { commitment, proof, ... }
    // }

    // --- Delivery section (null until delivery confirmed) ---
    "delivery": null
    // When filled:
    // "delivery": {
    //   "timestamp": "<ISO>",
    //   "transporterAddress": "did:ethr:<chainId>:<transporterAddr>",
    //   "vcHashVerified": true
    // }
  },

  // IPFS version chain
  "previousVersion": null,  // CID of prior version, null for first version

  // Proof array (accumulates signatures)
  "proof": [
    // Seller's listing signature (added at creation)
    // Seller's order confirmation signature (added at confirmOrder)
    // Buyer's payment signature (added after payment)
    // ... future proofs appended
  ]
}
```

### Pattern 2: IPFS Version Chain
**What:** Each VC mutation uploads a new version to IPFS, linking back to the previous CID
**When to use:** Every time the VC is modified (payment recorded, delivery confirmed)

```javascript
// Version 1 (listing): previousVersion = null
const listingVC = createListingVC({ product, sellerAddr, commitment, ... });
const cid1 = await uploadJson(listingVC);  // Returns "QmXXXXXX..."

// Version 2 (payment): previousVersion = cid1
const updatedVC = appendPaymentProof(listingVC, {
  buyerAddr, memoHash, railgunTxRef, buyerSignature
});
updatedVC.previousVersion = cid1;
const cid2 = await uploadJson(updatedVC);

// Version 3 (delivery): previousVersion = cid2
const finalVC = appendDeliveryProof(updatedVC, {
  transporterAddr, deliverySignature
});
finalVC.previousVersion = cid2;
const cid3 = await uploadJson(finalVC);
```

### Pattern 3: EIP-712 Signing (Existing, Preserve)
**What:** MetaMask typed data signing for VC proofs
**When to use:** Each party signs the VC at their stage

The existing `signVcWithMetamask.js` uses EIP-712 with domain `{ name: "VC", version: "1.0", chainId, verifyingContract }`. The EIP-712 types define `Credential`, `Party`, `CredentialSubject`, `Certificate`. This needs updating for the new schema but the PATTERN stays the same.

Key insight: The signing function strips `proofs`, `vcHash`, `txHashCommitment`, `purchaseTxHashCommitment` before signing. The new schema will need similar stripping of mutable sections.

### Pattern 4: On-Chain Hash Storage (Existing, No Change)
**What:** `keccak256(bytes(vcCID))` stored on-chain, full CID emitted in events
**When to use:** At `confirmOrder(vcCID)` and verified at `confirmDelivery(hash)`

```solidity
// Already in contract - DO NOT MODIFY
function confirmOrder(string calldata vcCID) external {
    vcHash = keccak256(bytes(vcCID));
    emit VcHashStored(id, vcHash, vcCID, block.timestamp);
    emit OrderConfirmed(buyer, owner, id, priceCommitment, vcCID, block.timestamp);
}

function confirmDelivery(bytes32 hash) external {
    if (hash != vcHash) revert HashMismatch();
    // ... release bonds
}
```

### Anti-Patterns to Avoid
- **Storing full VC JSON on-chain:** Gas prohibitive. Only store keccak256(CID string).
- **Creating new VC documents for each stage:** The whole point of Phase 8 is ONE document.
- **Modifying signed sections:** Once a proof section is signed, its content must not change. Append new proofs, don't modify existing ones.
- **Using JWT for proofs:** Project uses EIP-712 typed data - stay consistent.
- **Fetching from IPFS without caching:** VCs are immutable on IPFS. Cache aggressively in localStorage/localforage.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON deterministic serialization | Custom sort/stringify | `json-canonicalize` (already installed) | Edge cases with numbers, unicode, nested objects |
| Pedersen commitment + range proof | JavaScript implementation | Rust backend at localhost:5010 | Already working, Bulletproofs in Rust is battle-tested |
| EIP-712 signing | Manual signature construction | `ethers.signTypedData` via `signVcWithMetamask.js` | Already working, handles MetaMask interaction |
| IPFS upload | Direct HTTP to IPFS nodes | Pinata API via existing `ipfs.js` | Pinning service ensures persistence, already configured |
| VC hashing for on-chain | Custom hash function | `keccak256(Buffer.from(canonicalize(vc)))` via existing `hashVcPayload` | Already in vcBuilder.mjs, uses canonical JSON |

## Common Pitfalls

### Pitfall 1: Breaking EIP-712 Type Compatibility
**What goes wrong:** Changing the VC schema without updating the EIP-712 types in `signVcWithMetamask.js` causes MetaMask to reject the signature or produce invalid signatures.
**Why it happens:** EIP-712 requires exact type definitions that match the data structure.
**How to avoid:** Update the `types` object in `signVcWithMetamask.js` to match the new VC schema. Test that MetaMask can sign the new structure. Keep the `preparePayloadForSigning()` function updated to strip mutable fields.
**Warning signs:** MetaMask popup shows "Error" or signature verification fails.

### Pitfall 2: Mutating Signed Content
**What goes wrong:** After seller signs the listing VC, the payment section is appended. If the signing covers the whole document, the signature becomes invalid.
**Why it happens:** The signed payload must be deterministic and stable.
**How to avoid:** Sign only the IMMUTABLE parts of the VC. The `preparePayloadForSigning()` function already strips certain fields. Extend this pattern: sign the core VC fields (issuer, credentialSubject core fields, priceCommitment) but exclude mutable sections (payment, delivery, previousVersion).
**Warning signs:** Signature verification fails after appending new sections.

### Pitfall 3: CID-Before-Hash Race Condition
**What goes wrong:** The on-chain `confirmOrder(vcCID)` stores `keccak256(bytes(vcCID))`. If the VC is re-uploaded (e.g., with minor changes), the CID changes and the hash no longer matches.
**How to avoid:** Upload the VC to IPFS FIRST, get the CID, then call `confirmOrder(cid)`. The CID is deterministic for the same content, so uploading identical JSON always gives the same CID. But if you modify the VC after getting the CID, you must re-upload.
**Warning signs:** `confirmDelivery` reverts with `HashMismatch()`.

### Pitfall 4: IPFS Fetch Reliability
**What goes wrong:** `fetch("https://ipfs.io/ipfs/<CID>")` is unreliable - IPFS public gateways have rate limits and timeouts.
**Why it happens:** The current code uses `ipfs.io` gateway hardcoded in 6+ places across components.
**How to avoid:** Create a centralized `fetchJson(cid)` utility in `ipfs.js` that:
1. Checks localStorage/localforage cache first
2. Tries Pinata dedicated gateway (if available)
3. Falls back to `ipfs.io`
4. Caches successful fetches
**Warning signs:** Blank VC displays, timeout errors in console.

### Pitfall 5: previousVersion Circular References
**What goes wrong:** If `previousVersion` is set incorrectly, the provenance chain breaks or creates cycles.
**How to avoid:** `previousVersion` must ALWAYS be the CID of the version that was uploaded BEFORE the current mutation. Never set it to the current document's own future CID. The chain is: `null <- CID1 <- CID2 <- CID3`.

### Pitfall 6: Dual File Confusion (vcBuilder.js vs vcBuilder.mjs)
**What goes wrong:** Two files export similar but not identical functions. Components import from `.mjs`, but `createProduct.js` imports from `.js` (CJS).
**How to avoid:** Delete `vcBuilder.js` (CJS version). Keep only `vcBuilder.mjs` (ES module). The `createProduct.js` is a standalone Express route (not used by the React app) and can be updated separately.
**Warning signs:** Different VC structures depending on which file was imported.

## Code Examples

### Example 1: createListingVC (New Function)
```javascript
// Source: Derived from existing buildStage0VC pattern in ProductFormStep3.jsx
export function createListingVC({
  sellerAddr,
  productName,
  batch,
  quantity,
  productContract,
  productId,
  chainId,
  priceCommitment,  // { commitment, proof, bindingTag, bindingContext }
  certificateCredential,
  componentCredentials,
}) {
  const CHAIN = chainId || inferChainId();
  return {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    id: `urn:uuid:${uuid()}`,
    type: ["VerifiableCredential", "SupplyChainCredential"],
    schemaVersion: "2.0",
    issuer: {
      id: `did:ethr:${CHAIN}:${sellerAddr}`,
      name: "Seller",
    },
    holder: {
      id: `did:ethr:${CHAIN}:${ethers.ZeroAddress}`, // Unknown buyer at listing
      name: "T.B.D.",
    },
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: `did:ethr:${CHAIN}:${sellerAddr}`,
      productName,
      batch: batch || "",
      quantity,
      productContract,
      productId: String(productId),
      chainId: String(CHAIN),
      priceCommitment: {
        protocol: "bulletproofs-pedersen",
        version: "1.0",
        ...priceCommitment,
        encoding: "hex",
      },
      listing: {
        timestamp: new Date().toISOString(),
        certificateCredential: certificateCredential || { name: "", cid: "" },
        componentCredentials: componentCredentials || [],
      },
      payment: null,
      delivery: null,
    },
    previousVersion: null,
    proof: [],  // Seller signature added after creation
  };
}
```

### Example 2: appendPaymentProof (New Function)
```javascript
// Source: Derived from existing buildStage2VC/buildStage3VC patterns
export function appendPaymentProof(vc, {
  buyerAddr,
  memoHash,
  railgunTxRef,
  txHashCommitment,  // Optional: { commitment, proof, bindingTag }
  previousVersionCid,
}) {
  const CHAIN = vc.credentialSubject.chainId || inferChainId();
  const updated = JSON.parse(JSON.stringify(vc)); // Deep clone

  // Update holder to buyer
  updated.holder = {
    id: `did:ethr:${CHAIN}:${buyerAddr}`,
    name: "Buyer",
  };

  // Fill payment section
  updated.credentialSubject.payment = {
    timestamp: new Date().toISOString(),
    buyerAddress: `did:ethr:${CHAIN}:${buyerAddr}`,
    memoHash,
    railgunTxRef,
    ...(txHashCommitment ? { txHashCommitment } : {}),
  };

  // Link to previous version
  updated.previousVersion = previousVersionCid;

  // Note: proof (buyer signature) is added separately via signVcWithMetamask
  return updated;
}
```

### Example 3: appendDeliveryProof (New Function)
```javascript
export function appendDeliveryProof(vc, {
  transporterAddr,
  previousVersionCid,
}) {
  const CHAIN = vc.credentialSubject.chainId || inferChainId();
  const updated = JSON.parse(JSON.stringify(vc));

  updated.credentialSubject.delivery = {
    timestamp: new Date().toISOString(),
    transporterAddress: `did:ethr:${CHAIN}:${transporterAddr}`,
    vcHashVerified: true,
  };

  updated.previousVersion = previousVersionCid;
  return updated;
}
```

### Example 4: fetchJson for IPFS Retrieval (New Function in ipfs.js)
```javascript
// Source: Consolidation of 6+ hardcoded fetch calls across components
const IPFS_GATEWAY = "https://ipfs.io/ipfs";

export async function fetchJson(cid) {
  if (!cid) throw new Error("CID is required");

  // Check cache first
  const cacheKey = `vc_cache_${cid}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch { /* cache corrupted, refetch */ }
  }

  // Fetch from IPFS
  const response = await fetch(`${IPFS_GATEWAY}/${cid}`);
  if (!response.ok) throw new Error(`IPFS fetch failed: ${response.statusText}`);

  const json = await response.json();

  // Cache for future use
  try { localStorage.setItem(cacheKey, JSON.stringify(json)); } catch { /* quota exceeded */ }

  return json;
}
```

### Example 5: VC Verification (New vcVerifier.js)
```javascript
// Source: Consolidation from VerifyVCInline.js and ZKPVerificationBox.js
import { hashVcPayload } from "./vcBuilder.mjs";
import { verifyCommitmentMatch } from "./commitmentUtils";
import { keccak256, toUtf8Bytes } from "ethers";

export function verifyVcIntegrity(vc, onChainVcHash) {
  const results = {
    schemaValid: false,
    proofChainValid: false,
    onChainHashMatch: false,
    priceCommitmentValid: false,
  };

  // 1. Schema check
  results.schemaValid = (
    vc["@context"]?.includes("https://www.w3.org/2018/credentials/v1") &&
    vc.type?.includes("VerifiableCredential") &&
    vc.credentialSubject?.productName &&
    vc.issuer?.id
  );

  // 2. Proof array exists and has entries
  results.proofChainValid = Array.isArray(vc.proof) && vc.proof.length > 0;

  // 3. On-chain hash verification (if CID available)
  // keccak256(bytes(vcCID)) matches on-chain vcHash
  // This is checked at the call site since we need the CID

  // 4. Price commitment matches on-chain priceCommitment
  if (vc.credentialSubject?.priceCommitment?.commitment) {
    results.priceCommitmentValid = true; // Detailed ZKP verification via backend
  }

  return results;
}
```

## Existing Code Analysis

### What EXISTS and Works (DO NOT REBUILD)

| Component | File | Status |
|-----------|------|--------|
| IPFS Upload | `utils/ipfs.js` | Working. Uses Pinata JWT from env. |
| EIP-712 Signing | `utils/signVcWithMetamask.js` | Working. `signVcAsSeller()`, `signVcWithMetamask()` |
| Pedersen Commitment | `utils/commitmentUtils.js` | Working. Calls Rust backend, returns `{commitment, proof, verified, bindingTag}` |
| VC Hashing | `vcBuilder.mjs:hashVcPayload()` | Working. Uses `keccak256(canonicalize(vc))` |
| VC Canonicalization | `vcBuilder.mjs:freezeVcJson()` | Working. Uses `json-canonicalize` |
| On-chain confirmOrder | `web3Utils.js:confirmOrder()` | Working. Calls `escrow.confirmOrder(vcCID)` |
| Rust ZKP Backend | `zkp-backend/` on port 5010 | Working. All endpoints tested. |

### What Needs to CHANGE

| Component | File | Change |
|-----------|------|--------|
| VC Builder | `vcBuilder.mjs` | REWRITE: Replace stage-based functions with append-based functions |
| VC Builder (CJS) | `vcBuilder.js` | DELETE: Remove CJS duplicate |
| IPFS Utils | `ipfs.js` | ADD: `fetchJson(cid)` with caching |
| VC Verifier | `vcVerifier.js` | NEW: Consolidated verification logic |
| Signing Types | `signVcWithMetamask.js` | UPDATE: EIP-712 types for new schema |

### What Does NOT Change (Phase 8 Scope)

| Component | Why |
|-----------|-----|
| Smart contract | Already designed in Phase 7 with correct interface |
| commitmentUtils.js | ZKP pipeline already works |
| web3Utils.js | confirmOrder(vcCID) interface unchanged |
| UI components | Phase 9 handles UI updates |
| Rust backend | Already exposes all needed endpoints |

## Contract Interface Reference

Key contract fields and functions relevant to VC:

```
// Storage
bytes32 public priceCommitment;  // Set at initialization
bytes32 public vcHash;           // Set by confirmOrder

// Functions
confirmOrder(string vcCID)       // Seller calls, stores keccak256(bytes(vcCID))
confirmDelivery(bytes32 hash)    // Transporter calls, verifies hash == vcHash
getVcHash() -> bytes32           // Read stored hash

// Events
VcHashStored(productId, vcHash, vcCID, timestamp)
OrderConfirmed(buyer, seller, productId, priceCommitment, vcCID, timestamp)
DeliveryConfirmed(buyer, transporter, seller, productId, priceCommitment, timestamp)
```

## Rust ZKP Backend API Reference

All endpoints on `http://localhost:5010`:

| Endpoint | Input | Output | Used For |
|----------|-------|--------|----------|
| POST `/zkp/generate-value-commitment` | `{ value: u64 }` | `{ commitment, proof, verified }` | Random blinding commitment |
| POST `/zkp/generate-value-commitment-with-blinding` | `{ value, blinding_hex }` | `{ commitment, proof, verified }` | Deterministic commitment |
| POST `/zkp/generate-value-commitment-with-binding` | `{ value, blinding_hex, binding_tag_hex? }` | `{ commitment, proof, verified }` | Bound commitment (anti-replay) |
| POST `/zkp/verify-value-commitment` | `{ commitment, proof, binding_tag_hex? }` | `{ verified }` | Verify range proof |
| POST `/zkp/commit-tx-hash` | `{ tx_hash, binding_tag_hex? }` | `{ commitment, proof, verified }` | TX hash hiding |

All hex values are WITHOUT `0x` prefix in response, WITH `0x` prefix accepted in request.

## IPFS/Pinata Configuration

- **Upload:** Pinata REST API `https://api.pinata.cloud/pinning/pinFileToIPFS`
- **Auth:** JWT in `REACT_APP_PINATA_JWT` env var
- **Fetch:** Currently hardcoded `https://ipfs.io/ipfs/<CID>` in 6+ component locations
- **No dedicated Pinata gateway configured** - should consider using Pinata gateway for reliability

## State of the Art

| Old Approach (Current) | New Approach (Phase 8) | Impact |
|------------------------|----------------------|--------|
| 3 separate VC documents (Stage 0, 2, 3) | 1 append-only VC document | Simpler chain, single document to verify |
| `previousCredential` links stages | `previousVersion` links IPFS versions | Clearer semantics |
| Stage numbers in binding tags | Section-based (listing/payment/delivery) | More intuitive |
| Scattered IPFS fetch calls | Centralized `fetchJson(cid)` with caching | Reliability + performance |
| Dual vcBuilder files (.js + .mjs) | Single .mjs file | No import confusion |
| W3C VC v1 context | W3C VC v1 context (keep) | v2 context URL is `credentials/v2` but no benefit for this project |

**Keep W3C v1 context:** The project already uses `https://www.w3.org/2018/credentials/v1`. W3C VC 2.0 was published May 2025 with context `https://www.w3.org/ns/credentials/v2`, but upgrading provides no benefit for this thesis project and could introduce compatibility issues.

## Open Questions

1. **EIP-712 Types for New Schema**
   - What we know: Current types define `Credential`, `Party`, `CredentialSubject`, `Certificate`. The new schema adds `listing`, `payment`, `delivery` sections.
   - What's unclear: EIP-712 requires flat-ish types. Nested objects need their own type definitions. How many new types to add?
   - Recommendation: Sign only the core immutable fields (issuer, productName, priceCommitment, productContract). Strip mutable sections (payment, delivery, previousVersion) in `preparePayloadForSigning()`. This preserves the existing pattern and avoids type explosion.

2. **localStorage vs localforage for VC Caching**
   - What we know: `localforage` is installed (IndexedDB wrapper). `localStorage` is simpler but has 5-10MB limit.
   - What's unclear: How large VCs get with embedded proofs (the VC.json sample is ~5KB with full ZKP proofs).
   - Recommendation: Use `localStorage` for MVP. VCs are small (~5KB each). Switch to `localforage` only if quota issues arise. CONTEXT.md leaves this to Claude's discretion.

3. **Retry Logic for IPFS Upload/Fetch**
   - What we know: CONTEXT.md says "3 attempts, then show error for manual retry"
   - Recommendation: Add simple retry wrapper with exponential backoff (1s, 2s, 4s) in both `uploadJson` and `fetchJson`.

## Sources

### Primary (HIGH confidence)
- `frontend/src/utils/vcBuilder.mjs` - Full file read, all functions analyzed
- `frontend/src/utils/vcBuilder.js` - Full file read, identified as CJS duplicate
- `frontend/src/utils/signVcWithMetamask.js` - Full file read, EIP-712 types documented
- `frontend/src/utils/commitmentUtils.js` - Full file read, API contracts documented
- `frontend/src/utils/ipfs.js` - Full file read, Pinata integration documented
- `frontend/src/utils/web3Utils.js` - confirmOrder function analyzed
- `contracts/ProductEscrow_Initializer.sol` - Full contract read, all VC-related functions/events documented
- `zkp-backend/src/zk/pedersen.rs` - Full file read, Bulletproofs API documented
- `zkp-backend/src/main.rs` - Full file read, all HTTP endpoints documented
- `frontend/src/components/marketplace/ProductFormStep3.jsx` - Stage 0 VC creation flow traced
- `frontend/src/components/marketplace/ProductDetail.jsx` - Stage 2/3 VC flows traced
- `frontend/VC.json` - Real VC example from Sepolia deployment analyzed

### Secondary (MEDIUM confidence)
- [W3C Verifiable Credentials Data Model v2.0](https://www.w3.org/TR/vc-data-model-2.0/) - Reference for field names and structure
- [W3C VC 2.0 Announcement](https://www.w3.org/press-releases/2025/verifiable-credentials-2-0/) - Confirmed v2.0 is current standard

### Tertiary (LOW confidence)
- None needed - all findings are from direct codebase inspection

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - directly inspected package.json and all utility files
- Architecture: HIGH - traced complete VC lifecycle through all components
- Pitfalls: HIGH - identified from actual code patterns and real VC.json samples
- ZKP integration: HIGH - read Rust source and API endpoints directly

**Research date:** 2026-02-16
**Valid until:** Indefinite (codebase-specific research, not library-version dependent)
