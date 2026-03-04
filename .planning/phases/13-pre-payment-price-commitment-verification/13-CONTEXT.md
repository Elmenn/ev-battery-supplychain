# Phase 13: Pre-Payment Price Commitment Verification — Context

**Gathered:** 2026-03-04
**Status:** Ready for planning
**Source:** Design discussion (conversation context)

<domain>
## Phase Boundary

Shift buyer price verification from post-payment (current Phase 12 model) to pre-payment.
Add a lightweight cryptographic check on the product detail page that confirms the seller's
on-chain commitment matches the listed price — before the payment modal opens.

Also simplify the post-payment buyer panel (Workstream A + B) by removing the ECIES
dependency from Workstream A, since r_price is deterministic and the buyer can compute
it without the seller's encrypted opening.

**What this phase does NOT change:**
- Phase 12 ECIES encrypted opening stays in the codebase — it serves auditor-facing
  disclosure (seller proves they honestly disclosed value to buyer), not buyer protection
- Phase 12 equality proof (C_price == C_pay) stays unchanged — it's for third-party
  auditors who don't know the price, not for the buyer
- No changes to the ZKP backend, smart contracts, or DB schema

</domain>

<decisions>
## Implementation Decisions

### Pre-payment verify badge

- **Placement:** On the product detail page, displayed near the price / before the "Buy" button.
  Buyer sees the verification result BEFORE the payment modal opens.
- **Trigger:** Button or auto-run when the product page loads (prefer button — explicit user action,
  avoids unnecessary ZKP calls on every page visit).
- **Label:** "Verify Price" (consistent with Phase 12 language, pre-payment context).
- **No MetaMask required:** Pure computation — no wallet signing needed.
- **Inputs (all available client-side without seller cooperation):**
  - `priceWei` — fetched from backend DB via existing `getProductMeta(address)` call
    (already loaded in ProductDetail for the confirmOrder flow)
  - `r_price` — computed deterministically: `generateDeterministicBlinding(address, product.owner)`
    (same formula used by seller; `address` = escrow contract address from URL params,
    `product.owner` = seller address from on-chain state)
  - `C_price` — from `product.priceCommitment` (on-chain, already loaded)
- **Verification logic:** Call ZKP backend to compute `C_check = commit(priceWei, r_price)`,
  compare hex with on-chain `C_price`. Use existing `openAndVerifyCommitment` from commitmentUtils.js.
- **Result display:**
  - Pass: green badge "Price commitment verified — listed price matches on-chain commitment"
  - Fail: red warning "Price commitment mismatch — do not proceed with payment"
  - Loading: spinner with "Verifying price commitment..."
- **Gating:** The "Buy" / open payment modal button is NOT hard-blocked by verification status.
  Buyer sees the badge and makes their own decision. (No forced gate — respects buyer autonomy,
  avoids UX friction if ZKP backend is temporarily down.)

### Workstream A simplification (post-payment panel)

- **Remove the manual "Verify Price" button** from the post-payment buyer panel.
  Pre-payment verify replaces this entirely.
- **Auto-run Workstream A silently** when the buyer panel becomes visible
  (i.e., when `role === 'buyer' && phase >= OrderConfirmed && auditVC exists`).
- **Remove ECIES dependency from Workstream A:**
  Currently Workstream A decrypts `encryptedOpening` from the VC to get `{value, r_price}`.
  After this phase: derive `r_price = generateDeterministicBlinding(address, product.owner)`
  directly. Get `value` from `priceWei` in the DB (same source as pre-payment verify).
  The `encryptedOpening` ECIES decrypt is no longer needed for Workstream A.
- **What Workstream A still does:** recomputes C_price from (value, r_price), compares with
  VC's `credentialSubject.priceCommitment.commitment`. Sets `workstreamAResult = true` if match.
  This gates Workstream B (Generate Equality Proof).
- **`decryptedOpening` state variable:** becomes unused in Workstream A. Remove it if Workstream B
  also no longer needs it (see below).

### Workstream B simplification (equality proof generation)

- **Remove `decryptedOpening` as input to Workstream B.**
  Currently Workstream B reads `r_price` from `decryptedOpening.blinding_price` (cached from
  Workstream A's ECIES decrypt). After this phase: compute `r_price` deterministically inline.
- **`rPriceHex` derivation:** `generateDeterministicBlinding(address, product.owner)` — same
  single line used elsewhere. No state dependency.
- **`blobPlaintext` cache:** still needed for `r_pay` (from buyer's encrypted blob). Keep as-is.
- **Second MetaMask prompt avoidance:** still works — `blobPlaintext` cached from any prior
  blob decrypt (e.g. if buyer had previously decrypted for another reason). If not cached,
  fetch row and decrypt once.
- **`decryptedOpening` and `setDecryptedOpening` state:** remove entirely if ECIES decrypt
  is no longer called in either workstream.

### State cleanup

Remove from ProductDetail.jsx state:
- `decryptedOpening` / `setDecryptedOpening` — no longer needed
- Any imports of `decryptOpening` from ecies.js if it's no longer called in the buyer panel handlers

Keep:
- `blobPlaintext` / `setBlobPlaintext` — still needed for `r_pay` in Workstream B
- All workstream loading/result/error state — still needed
- `encryptedOpening` decrypt in Workstream A can be removed; the function import can be
  removed IF it's not used elsewhere in ProductDetail

### Purposeful framing in UI

- Pre-payment badge text should make clear this is a cryptographic guarantee:
  "The seller's on-chain price commitment matches the listed price."
- Workstream A result (auto-run) can be shown as a subtle status indicator,
  not a prominent manual step. It's infrastructure for Workstream B, not a user action.

### Claude's Discretion

- Exact positioning of the pre-payment badge in the JSX layout
- Whether pre-payment verify auto-runs on page load vs button click
  (user preference: button — but agent may implement auto-run if it reads this and
  decides button is redundant given auto-run is fast and cacheable)
- Error handling for ZKP backend unavailability (show "Unable to verify — ZKP backend offline"
  rather than fail silently)
- Whether to show a loading indicator during pre-payment verify or just show result inline

</decisions>

<specifics>
## Specific References

**Key files for this phase:**
- `frontend/src/components/marketplace/ProductDetail.jsx` — main file, all changes here
- `frontend/src/utils/commitmentUtils.js` — `generateDeterministicBlinding`, `openAndVerifyCommitment`
- `frontend/src/utils/productMetaApi.js` — `getProductMeta` (already called in confirmOrder)

**Deterministic blinding formula (already in codebase):**
```js
// commitmentUtils.js
export function generateDeterministicBlinding(productAddress, sellerAddress) {
  // returns keccak256(productAddress, sellerAddress) as 64-char hex, no 0x prefix
}
```

**Data already available in ProductDetail at render time:**
- `address` — from `useParams()`, escrow contract address
- `product.owner` — seller address, from `getProductState()`
- `product.priceCommitment` — on-chain commitment hex
- `dbData.priceWei` — from `getProductMeta(address)`, fetched in confirmOrder and loadable earlier

**Workstream A current flow (to be simplified):**
1. getBuyerSecretBlob → decryptBuyerBlob → cache blobPlaintext  ← KEEP
2. decryptOpening(encryptedOpening, x25519_priv) → cache decryptedOpening  ← REMOVE
3. openAndVerifyCommitment(value, blinding_price, cPriceHex)  ← KEEP but use deterministic inputs

**Workstream B current flow (to be simplified):**
1. Use cached blobPlaintext.r_pay  ← KEEP
2. Use cached decryptedOpening.blinding_price as rPriceHex  ← REPLACE with deterministic
3. generateEqualityProof(...)  ← KEEP unchanged

</specifics>

<deferred>
## Deferred Ideas

- Forced gate: blocking payment if verification fails (deferred — respects buyer autonomy)
- Auto-run pre-payment verify on page load (deferred — button preferred for explicit UX)
- Removing ECIES entirely from the codebase (deferred — it still serves the auditor path)
- Moving priceWei into the on-chain contract for fully trustless price verification (deferred)

</deferred>

---

*Phase: 13-pre-payment-price-commitment-verification*
*Context gathered: 2026-03-04 via design discussion*
