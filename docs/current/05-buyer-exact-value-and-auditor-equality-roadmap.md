# Buyer Exact-Value and Auditor Consistency Roadmap

This file now reflects the shipped order-based quantity/private-total model.
The older price-only `C_price == C_pay` roadmap is superseded by the current implementation.

## Purpose
The current system aims to guarantee:
1. the public listing unit price is anchored and signed
2. the private order total is consistent with that unit price and the buyer's private quantity
3. the private payment amount equals the private order total

All default verification remains privacy-preserving and off-chain, with on-chain anchor hashes only.

---

## Current System Baseline

### Commitments
- `C_qty`: buyer commitment to private quantity
- `C_total`: buyer commitment to private order total
- `C_pay`: buyer commitment to the Railgun payment amount

### Public vs private values
Public:
- `unitPriceWei`
- `unitPriceHash`
- `productId`
- `chainId`
- `escrowAddr`
- `orderId`
- `memoHash`
- `railgunTxRef`
- `contextHash`

Private:
- `quantity`
- `totalWei`
- openings / blindings for `C_qty`, `C_total`, `C_pay`

### Anchors and references
- on-chain listing anchor: `unitPriceHash`
- payment references: `memoHash`, `railgunTxRef`
- per-order identifier: `orderId`
- canonical binding hash:
  - `contextHash = keccak256(abi.encode(orderId, memoHash, railgunTxRef, productId, chainId, escrowAddr, unitPriceHash))`
- VC anchor on-chain: `vcHash = keccak256(CID)` at `confirmOrderById`

### Active storage paths
- listing metadata: `product_metadata`
- order records: `product_orders`
- recoverable proof-bearing order row: `product_orders`
- archived VC JSON: `vc_archives`
- credential-status registry: `vc_status`

### Active verification paths
- credential-status check verifies the VC is currently `active`
- quantity-total proof verifies `totalWei = unitPriceWei * quantity`
- total-payment equality proof verifies `C_total == C_pay`
- auditor verification binds both checks to the same `contextHash`

---

## Current Math Statements

## Statement A: Quantity-Total Relation
The system proves:

`totalWei = unitPriceWei * quantity`

without revealing `quantity` or `totalWei`.

Public inputs:
- `unitPriceWei`
- `C_qty`
- `C_total`
- `contextHash`

Private witness:
- `quantity`
- `totalWei`
- openings / blindings for `C_qty` and `C_total`

Acceptance:
- correct private quantity and total for the public unit price: pass
- wrong unit price, wrong quantity relation, or wrong bound context: fail

## Statement B: Total-Payment Equality
The system proves:

`C_total` and `C_pay` commit to the same hidden scalar

without revealing that scalar.

Public inputs:
- `C_total`
- `C_pay`
- `contextHash`

Private witness:
- openings / blindings for `C_total` and `C_pay`

Acceptance:
- matching total and payment under the same context: pass
- tampered commitments, swapped proof, or different context: fail

---

## Current Data Flow
1. Seller lists with public `unitPriceWei` and on-chain `unitPriceHash`.
2. Buyer chooses private `quantity`.
3. Frontend computes `totalWei`.
4. Frontend generates `C_qty`, `C_total`, `C_pay`.
5. Frontend generates:
   - quantity-total proof
   - total-payment equality proof
6. Buyer completes Railgun transfer and captures `memoHash` / `railgunTxRef`.
7. Frontend writes a backend recovery bundle for the order row, including the proof payloads.
8. Frontend records the order on-chain via `recordPrivateOrderPayment(...)`.
9. Backend reconciliation / indexer can refresh the canonical order row from chain.
10. Seller builds and signs the final order VC.
11. Frontend uploads and archives the VC.
12. Seller anchors the VC CID on-chain with `confirmOrderById(...)`.
13. Auditor loads the final VRC, status row, and verifies the active checks directly from the embedded proofs.

---

## Current VRC / Order-Row Conventions

Primary VC fields:
- `credentialSubject.listing.unitPriceWei`
- `credentialSubject.listing.unitPriceHash`
- `credentialSubject.listing.listingSnapshotCid`
- `credentialSubject.order.orderId`
- `credentialSubject.order.productId`
- `credentialSubject.order.escrowAddr`
- `credentialSubject.order.chainId`
- `credentialSubject.order.buyerAddress`
- `credentialSubject.order.memoHash`
- `credentialSubject.order.railgunTxRef`
- `credentialSubject.commitments.quantityCommitment`
- `credentialSubject.commitments.totalCommitment`
- `credentialSubject.commitments.paymentCommitment`
- `credentialSubject.attestation.contextHash`
- `credentialSubject.zkProofs`

Primary recoverable order-row proof fields:
- `orderId`
- `encryptedBlob`
- `disclosurePubkey`
- `encryptedQuantityOpening`
- `encryptedTotalOpening`
- `quantityTotalProof`
- `paymentEqualityProof`
- `proofBundle`

Operational rule:
- the final VRC carries the stable anchors and the proof payloads
- auditors verify directly from the VRC without a separate auxiliary lookup

---

## Testing Plan

### Unit tests
- commitment generation for `quantity`, `total`, and `payment`
- `contextHash` canonicalization
- quantity-total proof verification
- total-payment equality verification

### Integration tests
- create listing with `createProductV2`
- buyer private quantity order flow
- recovery-bundle persistence for a proof-bearing order row
- seller `confirmOrderById`
- auditor verify from one self-contained final VRC

### Security tests
- replay with different `orderId`: fail
- replay with different `memoHash` or `railgunTxRef`: fail
- cross-product proof swap: fail
- wrong `unitPriceWei`: fail
- proof / commitment / context tamper: fail

### Performance tests
- proof generation latency for both proofs
- proof verification latency in auditor flow
- UI responsiveness while proofs are generated

---

## Risks and Mitigations
- Risk: current binding is application-level, not Railgun-native amount binding.
  - Mitigation: strict `contextHash` binding using Railgun references and order anchors.
- Risk: numeric drift in JavaScript.
  - Mitigation: exact integer-string handling in frontend and strict scalar-path normalization before proof calls.
- Risk: proof / VC schema drift.
  - Mitigation: explicit field names, schema versions, and a single self-contained final VRC format.
- Risk: browser crash or device switch during payment flow.
  - Mitigation: backend recovery bundle, reconcile route, and event-driven indexer refresh.
- Risk: single IPFS gateway / pin failure during audit retrieval.
  - Mitigation: backend `vc_archives` plus archive-first fetch with multi-gateway fallback.
- Risk: a structurally valid VC remains usable after it should be operationally retired.
  - Mitigation: backend `vc_status` registry with auditor credential-status verification.
- Risk: one active order per escrow is a current product-model constraint.
  - Mitigation: treat the shipped design as single-active-order and extend to multi-order only with an explicit contract redesign.

---

## Decision Gates Ahead
- Gate G1: Sepolia end-to-end V2 flow is reproducible for seller, buyer, and auditor
- Gate G1a: backend recovery / indexer / archive / status hardening works in the Sepolia flow
- Gate G2: proof performance is acceptable on target devices
- Gate G3: auditor export/report format is stable enough for external review
- Gate G4: decide whether future work should move from two proofs to a more unified circuit
- Gate G5: decide whether future work should pursue Railgun-native amount binding

---

## Future Scope
- merge the two current proofs into a more compact proof system if warranted
- support true multi-order-per-product contract semantics
- add stronger historical listing snapshot guarantees
- explore direct Railgun-native cryptographic amount binding

## References
- `docs/current/01-end-to-end-flow.md`
- `docs/current/02-railgun-integration.md`
- `docs/current/03-auditor-verification.md`
- `docs/current/04-did-signing-and-verification-standards.md`
- `docs/phase12-buyer-attestation.md`
