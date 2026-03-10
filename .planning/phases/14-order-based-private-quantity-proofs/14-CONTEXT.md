# Phase 14: Order-Based Private Quantity Proofs - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning
**Source:** Current code inspection + design review for quantity-private orders

<domain>
## Phase Boundary

Move the current product-scoped private payment flow toward an order-based model that keeps:
- `unitPrice` public
- `quantity` private
- `total` private
- on-chain anchors limited to hashes/identifiers

Phase 14 is the first implementation phase for the future model described in the docs and design review. It introduces order-aware records, quantity-aware proof plumbing, and stronger anchors without rewriting the whole marketplace into a many-orders-per-product engine in one step.

**What this phase does change:**
- add `orderId` as the primary identifier for buyer payment, sidecar proof storage, and seller confirmation
- add `unitPriceHash` anchoring instead of relying on the current placeholder `product.priceCommitment`
- add quantity-aware proof inputs and sidecar schema
- add additive DB schema for orders and per-order attestations
- add V2 contract and API surfaces while preserving legacy behavior

**What this phase does NOT change:**
- no removal of legacy Phase 12/13 flow for existing products
- no full many-orders-per-product transport/delivery redesign yet
- no on-chain verification of the quantity/total proof bundle
- no direct Railgun-native cryptographic amount binding

</domain>

<decisions>
## Implementation Decisions

### Migration scope

- **Order model for Phase 14:** one active `orderId` per escrow clone
- **Why:** current escrow contract stores one buyer, one payment anchor, one VC hash, and one phase. True multi-order support would require a larger contract/state-machine rewrite than this phase should carry.
- **Compatibility rule:** add V2 methods and V2 storage; keep legacy methods readable for old products.

### Public/private value split

- **Public:** `unitPrice`, listing identity, seller identity, listing snapshot references
- **Private:** `quantity`, `total`
- **Hidden by default in audit path:** exact quantity and total
- **Buyer and auditor proof goal:** show `total = unitPrice * quantity` and `C_total == C_pay` without revealing quantity or total

### Anchoring strategy

- Add `unitPriceHash` on-chain at listing time
- Keep signed listing snapshots off-chain for historical audit
- Keep seller-confirmed order VC anchoring stable via `vcHash = keccak256(cid)` at order confirmation
- Store post-confirmation proofs in sidecar records keyed by `orderId`

### Proof architecture

- **Proof A:** quantity-total relation
  - public inputs: `unitPriceWei`, `C_quantity`, `C_total`, `contextHash`
  - witness: `quantity`, `total`, `r_quantity`, `r_total`
- **Proof B:** total-payment equality
  - public inputs: `C_total`, `C_pay`, `contextHash`
  - witness: `r_total`, `r_pay`
- **Binding primitive:** canonical `contextHash` rather than loose ad hoc JSON matching

### Context binding

- The proof bundle must bind to:
  - `orderId`
  - `memoHash`
  - `railgunTxRef`
  - `productId`
  - `chainId`
  - `escrowAddr`
  - `unitPriceHash`
- **Recommended canonical form:**
  - `contextHash = keccak256(abi.encode(orderId, memoHash, railgunTxRef, productId, chainId, escrowAddr, unitPriceHash))`

### VC and sidecar strategy

- Avoid repeated CID rewrites after proof generation
- Seller-confirmed order VC carries the order anchor fields and sidecar proof reference
- Detailed proof artifacts live in sidecar storage keyed by `orderId`
- Buyer/auditor verifiers accept proof source from VC reference or direct sidecar fetch

### Numeric safety

- Phase 14 must eliminate JS `Number` from amount-critical paths
- Current code converts wei-scale values to `Number` in commitment/proof flows; this is unsafe for totals and must be replaced with decimal strings and `BigInt`/backend-native parsing

### Claude's Discretion

- Exact Phase 14 slug and plan wave breakdown
- Whether to place DB schema work in the same wave as contract skeleton or split by file ownership
- Whether `contextHash` is computed in frontend only, backend only, or both with consistency checks
- Whether plan summaries are created as placeholders before execution

</decisions>

<specifics>
## Specific References

### Current hard-coded product scope

- `frontend/src/components/marketplace/ProductDetail.jsx`
  - seller confirm reads one on-chain `buyer`, one `memoHash`, one `railgunTxRef`
  - equality proof storage writes by `(productAddress, buyerAddress)`
- `frontend/src/components/railgun/PrivatePaymentModal.jsx`
  - payment amount defaults from product-level `priceWei`
  - buyer attestation persists one `C_pay` per product/buyer
- `backend/api/db.js`
  - `product_metadata` keyed by `product_address`
  - `buyer_secrets` keyed by `(product_address, buyer_address)`
- `contracts/ProductEscrow_Initializer.sol`
  - one buyer, one payment anchor, one `vcHash`, one lifecycle per escrow

### Current proof boundary

- `zkp-backend/src/zk/equality_proof.rs`
  - proves only `C_price == C_pay`
  - transcript binds `context`, `C_price`, `C_pay`, `R`
- `frontend/src/utils/equalityProofClient.js`
  - binding context is currently a JSON object with `productId`, `txRef`, `chainId`, `escrowAddr`, `stage`
- `frontend/src/utils/commitmentUtils.js`
  - deterministic seller blinding is product-address based

### Current signature boundary

- `frontend/src/utils/signVcWithMetamask.js`
- `backend/api/verifyVC.js`

Both strip `payment`, `delivery`, and `previousVersion` from the signed payload today. Phase 14 must decide which order fields become seller-signed rather than sidecar-only.

</specifics>

<deferred>
## Deferred Ideas

- True many-orders-per-product support inside a single escrow clone
- On-chain verifier contract for quantity-total and total-payment proofs
- Direct Railgun note/witness amount binding
- Partial fills, split shipments, or order amendments
- Controlled exact-value disclosure mode for disputes/compliance

</deferred>

---

*Phase: 14-order-based-private-quantity-proofs*
*Context gathered: 2026-03-10 via code inspection and design review*
