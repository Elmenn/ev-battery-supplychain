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
- Verifies EIP-712 proof for issuer (seller).
- Holder proof is accepted as optional (`skipped=true` if absent).

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
