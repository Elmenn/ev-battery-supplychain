# Phase 14: Order-Based Private Quantity Proofs - Research

**Researched:** 2026-03-10
**Domain:** Incremental migration from product-scoped private payments to order-scoped quantity-aware proofs
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from design review)

### Locked Decisions

- Read current implementation before proposing changes
- Ground recommendations in actual files and code paths
- Prefer backward compatibility and additive migration
- Use order-based records (`orderId`) while still using Railgun payment
- Public `unitPrice`, private `quantity` and `total`
- On-chain anchors/hashes only, no plaintext order amounts
- Add quantity-aware proof relations:
  - `total = unitPrice * quantity`
  - bind proof to `memoHash`, `railgunTxRef`, `productId`, `chainId`, `escrowAddr`, and `orderId`
- Strengthen anchoring with on-chain `unitPriceHash`
- Keep VC anchoring stable and prefer sidecar storage for per-order proofs

### Practical Constraints from Current Code

- Current escrow is single-buyer/single-payment/single-VC per product
- Current backend storage is product-address keyed, not order keyed
- Current equality proof proves only `C_price == C_pay`
- Current amount path uses JS `Number` in multiple commitment/proof flows

### Deferred Ideas (out of scope for initial Phase 14 implementation)

- true multi-order concurrency within one escrow clone
- on-chain proof verification
- Railgun-native cryptographic amount binding
- final-proof circuit unification into one monolithic proof

</user_constraints>

---

## Summary

Phase 14 should be split into four implementation waves.

**Wave 1:** establish the additive order skeleton in contracts and storage.
This includes `unitPriceHash`, `orderId`, new order storage, and additive SQLite tables. The goal is to create V2 anchors without breaking legacy products.

**Wave 2:** add order-aware backend and proof endpoints.
This includes `contextHash`, quantity-total proof generation/verification, total-payment equality proof reuse, and moving all proof-relevant amount interfaces away from JS `Number`.

**Wave 3:** integrate the V2 flow into frontend UX, VC building, and auditor verification.
This includes order-aware payment recording, seller confirmation by `orderId`, sidecar proof references, and V2 audit screens while preserving legacy fallback.

**Wave 4:** test, benchmark, and update docs.
This includes contract tests, API tests, ZKP tests, UX acceptance, migration verification, and documentation refresh.

Primary recommendation: keep the contract migration additive and intentionally stop short of true many-order concurrency. The current escrow state machine is too product-centric to absorb that safely in the same phase.

---

## Standard Stack

No new architectural stack is required beyond the repo’s current components, but several existing areas must be extended together.

### Existing building blocks

| Area | Files | Reuse |
|------|-------|-------|
| Frontend order/payment flow | `ProductFormStep3.jsx`, `ProductDetail.jsx`, `PrivatePaymentModal.jsx` | Extend with `orderId`, private quantity input, and V2 payment/confirm flow |
| VC building and signing | `vcBuilder.mjs`, `signVcWithMetamask.js`, `verifyVC.js` | Extend signed payload to include stable order anchors |
| Metadata + sidecar APIs | `productMetaApi.js`, `buyerSecretApi.js`, `backend/api/server.js`, `backend/api/db.js` | Add order-scoped tables and endpoints |
| Proof dispatch | `commitmentUtils.js`, `equalityProofClient.js`, `zkp-backend/src/main.rs` | Add quantity-total proof and V2 context binding |
| Escrow lifecycle | `ProductFactory.sol`, `ProductEscrow_Initializer.sol`, `escrowHelpers.js` | Add V2 order skeleton while keeping legacy lifecycle readable |

### Existing risks verified in code

| Risk | Evidence |
|------|----------|
| on-chain `priceCommitment` is a placeholder | `ProductFormStep3.jsx` writes placeholder to factory, real Pedersen commitment goes to metadata |
| product-level payment scope | `recordPrivatePayment` and `confirmOrder` in `ProductEscrow_Initializer.sol` store one payment and one `vcHash` |
| sidecar keyed by product + buyer | `buyer_secrets` schema in `backend/api/db.js` |
| signed VC excludes mutable order/payment sections | `signVcWithMetamask.js` and `verifyVC.js` remove `payment`, `delivery`, `previousVersion` |
| unsafe number conversion | `commitmentUtils.js`, `ProductDetail.jsx`, `PrivatePaymentModal.jsx` use `Number(...)` on wei values |

---

## Architecture Patterns

### Pattern 1: Additive V2 contract surface

Do not break legacy product contracts or frontend assumptions in one step.

Recommended pattern:
- keep legacy reads and methods intact
- add V2 functions and V2 events
- detect capability in frontend/helpers before using V2 path

Suggested V2 additions:
```solidity
function recordPrivateOrderPayment(
    bytes32 orderId,
    bytes32 memoHash,
    bytes32 railgunTxRef,
    bytes32 quantityCommitment,
    bytes32 totalCommitment,
    bytes32 paymentCommitment,
    bytes32 contextHash
) external;

function confirmOrderById(bytes32 orderId, string calldata vcCID) external;
function getOrder(bytes32 orderId) external view returns (OrderRecord memory);
```

### Pattern 2: Order-sidecar separation

Current schema mixes listing metadata and buyer sidecar data at product scope. Phase 14 should separate:
- listing metadata
- order records
- private order attestations

Recommended tables:
```sql
product_orders(order_id PK, product_address, buyer_address, status, memo_hash, railgun_tx_ref, unit_price_wei, unit_price_hash, context_hash, order_vc_cid, ...)

order_private_attestations(order_id PK, product_address, buyer_address, encrypted_blob, disclosure_pubkey, quantity_total_proof_json, payment_equality_proof_json, ...)
```

### Pattern 3: Canonical context hash

Current proof context is serialized JSON. That is acceptable for Phase 12/13 equality proof, but Phase 14 should move to one stable hash shared across:
- contract event payloads
- sidecar records
- proof public inputs
- auditor verification

Recommended pattern:
```ts
contextHash = keccak256(
  abi.encode(
    orderId,
    memoHash,
    railgunTxRef,
    productId,
    chainId,
    escrowAddr,
    unitPriceHash
  )
);
```

### Pattern 4: Proof bundle instead of one giant proof

The current Rust equality proof is simple and production-ready relative to repo maturity. Reuse that incremental style.

Recommended V2 bundle:
- `quantityTotalProof`
- `paymentEqualityProof`

This keeps:
- smaller proof implementation surface
- easier auditor debugging
- simpler staged rollout and fallback behavior

### Pattern 5: Signed anchor payload, unsigned heavy proofs

Current VC signatures intentionally avoid mutable sections. For Phase 14:
- seller signature should cover stable order anchors and commitment references
- heavy proof payloads should remain sidecar-first

Recommended seller-signed fields:
- `orderId`
- `productId`
- `escrowAddr`
- `chainId`
- `buyerAddress`
- `memoHash`
- `railgunTxRef`
- `unitPriceHash`
- `quantityCommitment`
- `totalCommitment`
- `paymentCommitment`
- `contextHash`

### Pattern 6: Decimal-string / BigInt amount path

Current helpers convert wei values to `Number`. This must be replaced before quantity proofs ship.

Required rule:
- frontend sends decimal strings or hex strings
- backend/Rust parses into fixed-width integers or big integers
- no proof or commitment helper accepts JS `Number` for wei-scale values

---

## Common Pitfalls

### Pitfall 1: pretending `orderId` alone makes the escrow multi-order

Adding `orderId` fields without moving state off the product-level buyer/payment/vc slots creates false isolation. Current contract storage is still single-order in practice. Phase 14 should explicitly support one active V2 order per escrow only.

### Pitfall 2: leaving `buyer_secrets` keyed by `(product_address, buyer_address)`

That breaks repeat purchases by the same buyer for the same product and makes proof storage ambiguous. New proof sidecars must be keyed by `orderId`.

### Pitfall 3: using JSON context directly across languages

Rust, JS, and Solidity can serialize equivalent objects differently. Use canonical hashing and verify the same `contextHash` everywhere.

### Pitfall 4: keeping seller signatures blind to order anchors

If `orderId`, `memoHash`, and `railgunTxRef` remain outside the signed payload, the system still relies on unsigned glue between VC and sidecar. Phase 14 should close that gap for stable anchors.

### Pitfall 5: shipping quantity proofs on top of JS `Number`

Current code does this already for price commitments. Quantity-private totals make it worse. Fix numeric handling before proof rollout, not after.

### Pitfall 6: rewriting VC CIDs every time a buyer generates proofs

That destabilizes the audit anchor. Use sidecar storage for post-confirmation proof bundles and keep the confirmed VC CID stable.

---

## Proposed Phase Breakdown

### Plan 14-01: Order Skeleton + Anchors

Scope:
- contract V2 order skeleton
- `unitPriceHash` anchor
- order-focused DB schema
- helper read-path updates

### Plan 14-02: Backend APIs + Proof Backend

Scope:
- order CRUD / order attestation endpoints
- quantity-total proof backend
- total-payment equality proof V2 context binding
- amount interface cleanup away from `Number`

### Plan 14-03: Frontend + VC + Auditor

Scope:
- V2 listing/payment/confirm UX
- order-aware VC builder
- order-aware sidecar API clients
- auditor verification updates

### Plan 14-04: Tests + Benchmarks + Docs

Scope:
- contract/API/frontend/proof tests
- migration verification
- performance thresholds
- docs refresh

---

## Open Questions

1. Should `quantity` input first appear in the private payment modal or earlier in product detail?
- Recommendation: capture it in the buyer payment flow so the privacy boundary is explicit.

2. Should `unitPriceHash` be computed from plaintext `unitPriceWei` or from signed listing snapshot content?
- Recommendation: anchor the plaintext unit price hash directly and separately store signed snapshot JSON/CID.

3. Should V2 seller signature expand the EIP-712 types or introduce a new schemaVersion?
- Recommendation: use a new schema version and additive fields, not overloaded semantics under the current `2.0`.

4. Should legacy verifier logic stay in the same files or branch to dedicated V2 files?
- Recommendation: keep one file per subsystem for now with explicit legacy/V2 branches; split later only if complexity becomes unmanageable.

---

## Sources

### Primary (HIGH confidence)

- `frontend/src/components/marketplace/ProductFormStep3.jsx`
- `frontend/src/components/marketplace/ProductDetail.jsx`
- `frontend/src/components/railgun/PrivatePaymentModal.jsx`
- `frontend/src/components/vc/VerifyVCInline.js`
- `frontend/src/utils/vcBuilder.mjs`
- `frontend/src/utils/commitmentUtils.js`
- `frontend/src/utils/equalityProofClient.js`
- `frontend/src/utils/productMetaApi.js`
- `frontend/src/utils/buyerSecretApi.js`
- `frontend/src/utils/escrowHelpers.js`
- `backend/api/db.js`
- `backend/api/server.js`
- `backend/api/verifyVC.js`
- `zkp-backend/src/main.rs`
- `zkp-backend/src/zk/equality_proof.rs`
- `contracts/ProductFactory.sol`
- `contracts/ProductEscrow_Initializer.sol`
- `docs/current/01-end-to-end-flow.md`
- `docs/phase12-buyer-attestation.md`
- `docs/current/05-buyer-exact-value-and-auditor-equality-roadmap.md`

### Secondary (MEDIUM confidence)

- Truffle tests under `test/`
- frontend utility tests under `frontend/src/utils/__tests__/`

---

## Metadata

**Confidence breakdown:**
- Current-state file mapping: HIGH
- Migration boundary recommendation: HIGH
- Proof bundle recommendation: HIGH
- Exact V2 ABI/schema shape: MEDIUM-HIGH

**Research date:** 2026-03-10
**Valid until:** 2026-04-10
