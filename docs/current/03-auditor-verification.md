# Auditor Verification (Current Model)

This matches the current auditor UI and backend behavior.

## Active Verification Checks
In `VerifyVCInline.js`, Run All executes:
1. VC signatures (backend `/verify-vc`)
2. ZKP price proof validity
3. Current VC hash anchor (`hash(CID)` vs on-chain `getVcHash()`)
4. Provenance continuity over component graph
5. Governance consistency over component links
6. Chain-wide on-chain anchor checks for each provenance node

## 1) Signature Verification
- Backend file: `backend/api/verifyVC.js`
- Endpoint: `POST /verify-vc`
- Verifies EIP-712 typed-data proof for issuer (seller): https://eips.ethereum.org/EIPS/eip-712
- Uses `did:ethr` registry-based DID resolution (Ethr DID Registry) to validate
  that `proof.verificationMethod` is present in the resolved DID Document and
  authorized for `proofPurpose` before signature acceptance (did:ethr + ERC-1056):
  https://github.com/decentralized-identity/ethr-did-resolver/blob/master/doc/did-method-spec.md
  and https://eips.ethereum.org/EIPS/eip-1056
- Resolver config via backend env:
  - `VC_DID_RESOLUTION_MODE=registry|legacy` (default `registry`)
  - `VC_DID_RPC_URL` (or chain-specific `VC_DID_RPC_URL_<chainId>`)
  - optional `VC_ETHR_REGISTRY_ADDRESS` (or `VC_ETHR_REGISTRY_<chainId>`)
  - optional `VC_DID_ALLOW_BARE_METHOD=true` for transitional legacy proofs
- Holder proof is accepted as optional (`skipped=true` if absent).

## 1.1) DID Signing and Verification (Dedicated)
This section describes the active DID signing/verification behavior as implemented in code.

### Signing Path (Frontend)
- Files:
  - `frontend/src/components/marketplace/ProductDetail.jsx`
  - `frontend/src/utils/signVcWithMetamask.js`
- Flow:
  1. Seller builds final VC (`createFinalOrderVC`).
  2. Seller signs typed data (`signVcAsSeller` -> `signPayload`).
  3. Proof is appended to `vc.proof[]` and uploaded to IPFS.
- EIP-712 domain used for signing (https://eips.ethereum.org/EIPS/eip-712):
  - `name: "VC"`
  - `version: "1.0"`
  - `chainId` (wallet network or `REACT_APP_CHAIN_ID` override)
  - optional `verifyingContract` (product escrow address)
- Proof fields produced:
  - `type: "EcdsaSecp256k1Signature2019"`
  - `proofPurpose: "assertionMethod"`
  - `verificationMethod: did:ethr:<chainId>:<address>#controller`
  - `jws` (typed-data signature)
  - `payloadHash` (`TypedDataEncoder.hash(domain, types, payload)`)
  - `role` (`seller` or `holder`)

### Verification Path (Backend)
- File: `backend/api/verifyVC.js`
- Flow:
  1. Rebuild canonical payload (`preparePayloadForVerification`) and remove non-signed mutable fields.
  2. Resolve DID (`did-resolver` + `ethr-did-resolver`) in `registry` mode.
  3. Confirm `proof.verificationMethod` exists in resolved DID Document.
  4. Confirm method is authorized for `proof.proofPurpose` (default `assertionMethod`).
  5. Extract expected Ethereum address from resolved verification method (`blockchainAccountId` / `ethereumAddress` / method id).
  6. Verify `payloadHash` (if present) and recover signer with `verifyTypedData`.
  7. Accept signature only if recovered signer equals resolved DID method address.
- Mode toggles:
  - `VC_DID_RESOLUTION_MODE=registry|legacy` (default `registry`)
  - `legacy` mode skips DID document resolution and checks address directly from `verificationMethod`
  - `VC_DID_ALLOW_BARE_METHOD=true` allows transitional bare method matching for legacy proofs

### Standards Basis
This section separates standards requirements from project-specific implementation details.

- DID Documents, `verificationMethod`, and verification relationships (including `assertionMethod`) come from DID Core: https://www.w3.org/TR/did-core/
- Verification relationship semantics (which keys are authorized for which purpose) are further clarified in Controlled Identifiers: https://www.w3.org/TR/controller-document/
- `did:ethr` resolution is method-specific: the method defines DID Document derivation from Ethereum state and resolver behavior: https://github.com/decentralized-identity/ethr-did-resolver/blob/master/doc/did-method-spec.md
- The underlying Ethereum DID registry model is ERC-1056: https://eips.ethereum.org/EIPS/eip-1056
- VC document shape (`issuer`, `holder`, `credentialSubject`, `proof`) is aligned with VC Data Model 2.0 core concepts: https://www.w3.org/TR/vc-data-model-2.0/
- Signature cryptography is EIP-712 typed-data signing/recovery (domain-separated): https://eips.ethereum.org/EIPS/eip-712
- VC Data Integrity defines interoperable proof suites and cryptosuites; this repo currently does not implement full VC Data Integrity proof processing: https://www.w3.org/TR/vc-data-integrity/

### Compliance Statement
| Capability | Status | What this repo does | Standards basis |
| --- | --- | --- | --- |
| DID method resolution (`did:ethr`) | Implemented | Resolves issuer/holder DID to DID Document using `did-resolver` + `ethr-did-resolver`, with chain-aware RPC/registry config. | DID Core (resolution model): https://www.w3.org/TR/did-core/ ; did:ethr method spec: https://github.com/decentralized-identity/ethr-did-resolver/blob/master/doc/did-method-spec.md ; ERC-1056: https://eips.ethereum.org/EIPS/eip-1056 |
| `verificationMethod` + `proofPurpose` authorization checks | Implemented | Requires proof method to exist in resolved DID Document and be authorized for the stated purpose (`assertionMethod` default). | DID Core verification relationships: https://www.w3.org/TR/did-core/ ; Controlled Identifiers: https://www.w3.org/TR/controller-document/ |
| EIP-712 cryptographic signature verification | Implemented | Re-hashes typed payload, optionally binds `verifyingContract`, recovers signer, and matches recovered address to resolved DID method address. | EIP-712: https://eips.ethereum.org/EIPS/eip-712 |
| Full VC Data Integrity / JOSE proof-suite interoperability | Not fully implemented | Uses project-specific proof object fields (`jws`, `payloadHash`, `role`) and EIP-712 verification logic; does not implement full VC Data Integrity cryptosuite processing. | VC Data Integrity: https://www.w3.org/TR/vc-data-integrity/ ; VC Data Model 2.0: https://www.w3.org/TR/vc-data-model-2.0/ |

Detailed standards mapping: `docs/current/04-did-signing-and-verification-standards.md`.

## 2) ZKP Verification
- UI extracts proof from `credentialSubject.priceCommitment` (legacy fallback supported).
- Utility: `frontend/src/utils/verifyZKP.js`
- Sends commitment/proof to ZKP backend verify endpoint.

## 3) Current VC Hash Anchor
- UI computes `keccak256(cid)`.
- Reads contract `getVcHash()` from `credentialSubject.productContract`.
- Passes only if both hashes match exactly.

## 4) Provenance Continuity (Component DAG)
- Backend file: `backend/api/verifyVCChain.js`
- Endpoint: `POST /verify-vc-chain`
- Traverses `componentCredentials` graph (not `previousVersion`).
- Flags missing links, cycles, truncation (`maxDepth`).

## 5) Governance Consistency
For each edge `parent -> component`:
- `parent.issuerAddress` must equal `component.holderAddress`.
- Any mismatch is returned in `governance.violations`.

## 6) Chain-Wide Anchors
- For each node in provenance traversal:
  - compute `keccak256(node.cid)`
  - compare with node contract `getVcHash()`
- UI reports checked count and failed nodes.

## Removed from Current Model
These are intentionally not part of current auditor checks:
- TX hash commitment verification cards
- Purchase transaction verification cards
- Delivery transaction verification cards

## Backend Endpoints Summary
- `POST /fetch-vc`
- `POST /verify-vc`
- `POST /verify-vc-chain`

Default backend URL in frontend: `REACT_APP_VC_BACKEND_URL` (fallback `http://localhost:5000`).
