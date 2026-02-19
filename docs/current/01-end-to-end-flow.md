# End-to-End Flow (Current Implementation)

This document describes only the active private FCFS flow currently implemented.

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

## 1) Seller Lists Product
1. Seller fills product info and optional component VC CIDs.
2. In Step 2, each component CID is fetched and governance-checked:
   - connected seller must equal component VC holder DID address.
   - mismatch blocks Next.
3. In Step 2.5, Railgun connection is mandatory (no public-only skip).
4. In Step 3:
   - factory deploys escrow clone via `createProduct(name, placeholderCommitment)` with seller bond.
   - ZKP backend generates price commitment + proof + binding tag.
   - listing metadata is stored in localStorage (`productMeta_*`, `priceWei_*`, `priceCommitment_*`, `sellerRailgunAddress_*`).
   - no VC is uploaded at listing time.

## 2) Buyer Pays Privately (FCFS)
In `PrivatePaymentModal.jsx`:
1. Buyer sends Railgun private transfer (`privateTransfer`).
2. App then records on-chain payment using:
   - `recordPrivatePayment(productId, memoHash, railgunTxRef)`.
3. Contract behavior in `recordPrivatePayment`:
   - first valid caller becomes `buyer` (FCFS).
   - phase moves `Listed -> Purchased`.
4. If transfer succeeds but recording fails, app stores pending data locally and shows `Retry Recording` (no re-send of funds).

## 3) Seller Confirms Order and Creates VC
In `ProductDetail.jsx` (`handleConfirmOrder`):
1. Reads on-chain payment fields (`buyer`, `memoHash`, `railgunTxRef`).
2. Builds one final VC using `createFinalOrderVC` with:
   - listing data + payment section together.
3. Seller signs VC (`signVcAsSeller`).
4. Uploads VC to IPFS (gets CID).
5. Calls `confirmOrder(cid)` on escrow.
6. Contract stores only `vcHash = keccak256(bytes(cid))` on-chain.

## 4) Transporter + Delivery
1. Transporters bid after `OrderConfirmed`.
2. Seller selects transporter via `setTransporter` (escrow deposits delivery fee) -> phase `Bound`.
3. Transporter calls `confirmDelivery(hash)` where `hash == vcHash`.
4. Contract releases seller bond and transporter payout, then phase `Delivered`.

### Delivery Verification Hash (QR) in this flow
- The UI card "Delivery Verification Hash" displays the on-chain `vcHash` (`keccak256(cid)`).
- The QR code encodes a URL deep-link payload: product route + hash + chain ID + VC CID query params.
- The plain hash is still shown and copyable for compatibility.
- For local development, set `REACT_APP_QR_BASE_URL` to a phone-reachable URL (LAN IP or tunnel) so scanned links open off-device.
- Seller shares this hash with the selected transporter; transporter submits that exact value to `confirmDelivery(hash)`.
- Purpose: bind delivery confirmation to the exact VC CID anchored at `confirmOrder`, preventing CID/hash mismatch.
- Security note: this hash is not secret (it is public on-chain). Access control still comes from `onlyTransporter`.

## Important Notes
- UI no longer requires manual buyer designation.
- `designateBuyer` function still exists in contract ABI but is not used by current UI flow.
- Current VC model is single-final VC anchored at `confirmOrder`.
