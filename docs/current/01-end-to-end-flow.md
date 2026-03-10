# End-to-End Flow (Current Implementation)

This document describes the active private FCFS flow and the current buyer/auditor verification model.
For DID signing/verification standards mapping, see `docs/current/04-did-signing-and-verification-standards.md`.

## Scope
- Network: Sepolia
- Contracts: `ProductFactory.sol` + `ProductEscrow_Initializer.sol`
- UI flow: `ProductFormWizard` steps `1 -> 2 -> 2.5 -> 3 -> 4`
- Payment mode: private-only (Railgun required)

## Lifecycle Phases
Contract enum in `ProductEscrow_Initializer.sol`:
- `0 Listed`
- `1 Purchased`
- `2 OrderConfirmed`
- `3 Bound`
- `4 Delivered`
- `5 Expired`

---

## Commitment Model in This Flow

- `C_price`: seller Pedersen commitment to product price.
- `C_pay`: buyer Pedersen commitment to paid amount.
- Equality proof: Schnorr sigma proof that `C_price` and `C_pay` hide the same value.
- `quantity` is currently listing metadata only (not part of commitment/equality relations).

Important detail:
- On-chain `product.priceCommitment` at listing is a contract initialization placeholder.
- The cryptographic `C_price` used for buyer/auditor verification is stored in metadata/VC records.

---

## 1) Seller Lists Product
1. Seller fills product info and optional component VC CIDs.
2. In Step 2, each component CID is fetched and governance-checked:
   - connected seller must equal component VC holder DID address
   - mismatch blocks Next
3. In Step 2.5, Railgun connection is mandatory.
4. In Step 3:
   - factory deploys escrow clone via `createProduct(name, placeholderCommitment)` with seller bond
   - ZKP prover generates `C_price` + range proof + binding tag
   - listing metadata is stored (`productMeta_*`, `priceWei_*`, `priceCommitment_*`, `sellerRailgunAddress_*`)
   - no VC is uploaded at listing time

## 2) Buyer Pre-Payment Verify Price (Listed)
On product detail, buyer can run `Verify Price` before paying.

Inputs:
- `priceWei` from metadata (`getProductMeta`)
- `C_price` from metadata/VC record (`priceCommitment`)
- deterministic `r_price = generateDeterministicBlinding(productAddress, sellerAddress)`

Result states:
- verified
- mismatch warning
- verifier/data unavailable (retry)

`Buy with Railgun` remains user-controlled.

## 3) Buyer Pays Privately (FCFS) and Writes Attestation Data
In `PrivatePaymentModal.jsx`:
1. Buyer sends Railgun private transfer (`privateTransfer`).
2. App records on-chain payment:
   - `recordPrivatePayment(productId, memoHash, railgunTxRef)`
3. Contract behavior in `recordPrivatePayment`:
   - first valid caller becomes `buyer` (FCFS)
   - phase moves `Listed -> Purchased`
4. Buyer attestation data is persisted through backend APIs:
   - disclosure public key
   - `C_pay`
   - encrypted buyer secret blob (contains buyer secret material such as `r_pay`)
5. If a prior VC CID exists in metadata, buyer attestation fields can be merged into that VC and re-uploaded before final seller confirmation.

If transfer succeeds but recording fails, app keeps pending data and shows `Retry Recording` (no re-send of funds).

## 4) Seller Confirms Order and Anchors Final VC
In `ProductDetail.jsx` (`handleConfirmOrder`):
1. Reads on-chain payment fields (`buyer`, `memoHash`, `railgunTxRef`).
2. Builds one final VC using `createFinalOrderVC`.
3. Seller signs VC (`signVcAsSeller`).
4. Seller enrichment step:
   - reads buyer disclosure public key
   - computes deterministic `r_price`
   - encrypts `{value, r_price}` as `encryptedOpening`
   - adds attestation payload to VC when available
5. Uploads VC to IPFS (gets CID).
6. Calls `confirmOrder(cid)` on escrow.
7. Contract stores `vcHash = keccak256(bytes(cid))` on-chain.

## 5) Buyer Post-Payment Consistency Checks
In buyer panel (after VC is loaded, `OrderConfirmed+`):
1. Workstream A auto-runs and verifies VC `C_price` consistency using DB `priceWei` + deterministic `r_price`.
2. Workstream B generates equality proof (`C_price == C_pay`) with binding context.
3. Equality proof is stored in backend sidecar (`buyer_secrets.equality_proof`).

Storage strategy:
- anchored VC CID remains immutable
- no extra VC CID rewrite for equality-proof generation

## 6) Auditor Verification
Auditor verifies commitment consistency and equality proof from:
- VC attestation proof source, or
- sidecar proof source (`buyer_secrets.equality_proof`)

Verification checks proof + commitments + binding context, without revealing amount.
Current implementation uses backend equality-proof endpoints (`/zkp/generate-equality-proof`, `/zkp/verify-equality-proof`).

## 7) Transporter + Delivery
1. Transporters bid after `OrderConfirmed`.
2. Seller selects transporter via `setTransporter` (escrow deposits delivery fee) -> phase `Bound`.
3. Transporter calls `confirmDelivery(hash)` where `hash == vcHash`.
4. Contract releases seller bond and transporter payout, then phase `Delivered`.

### Delivery Verification Hash (QR)
- UI card displays on-chain `vcHash` (`keccak256(cid)`).
- QR encodes deep-link payload: product route + hash + chain ID + VC CID query params.
- Hash is copyable for manual confirmation.
- Seller shares hash with selected transporter.
- Transporter submits exact hash to `confirmDelivery(hash)`.

Purpose:
- bind delivery confirmation to the anchored VC CID at `confirmOrder`
- prevent CID/hash mismatch

---

## Operational Notes
- UI uses FCFS buyer capture through `recordPrivatePayment`.
- `designateBuyer` exists in ABI and is not used by active UI flow.
- Current VC model is single-final VC anchored at `confirmOrder`, with sidecar equality-proof storage for post-anchor proofs.
- Equality relation is price-only (`C_price` vs `C_pay`); quantity is not yet enforced in ZK.
