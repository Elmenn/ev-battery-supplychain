# Phase 7: Smart Contract Redesign - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Rewrite ProductEscrow contract for private-only purchases. Remove all public purchase paths. Add seller/transporter bond staking, transporter-confirmed delivery via hash verification, and hash-only VC storage on-chain. Fix existing bugs (double payment in _timeout).

</domain>

<decisions>
## Implementation Decisions

### Escrow Economics
- **Seller bond:** Fixed amount, price-independent, **configurable by factory owner** (does NOT reveal product price)
  - Supervisor approved: fixed bond with configurable amount
  - Private Railgun deposit explored but infeasible (Railgun is wallet-to-wallet, contracts can't receive private transfers)
  - Thesis will discuss private deposits as future work / limitation
- **Transporter bond:** Same fixed bond model as seller, staked when bidding
- **Transporter fee:** Seller deposits transporter fee into escrow when selecting winning bid
- **Buyer funds:** Zero ETH from buyer touches the contract. Payment is entirely via Railgun
- **On success:** Both bonds returned + transporter gets fee from escrow
- **On failure:** Full slash to counterparty (seller fails -> bond to buyer, transporter fails -> bond to seller)

### Phase Lifecycle
- **States:** Listed -> Purchased -> OrderConfirmed -> Bound -> Delivered (+ Expired)
- **Listed:** Seller creates product + deposits bond + price commitment on-chain
- **Purchased:** Buyer pays via Railgun + calls recordPrivatePayment (caller becomes buyer)
- **OrderConfirmed:** Seller confirms order + uploads single VC to IPFS + stores vcHash on-chain. Opens bidding window
- **Bound:** Seller selects transporter from bids + deposits transporter fee
- **Delivered:** Transporter calls confirmDelivery(hash) after hash verification with buyer
- **Expired:** Reachable from Purchased, OrderConfirmed, or Bound on timeout
- **Timeout windows:** 2 days each (seller confirm, bidding, delivery)
- **Timeout callers:** Permissionless (anyone can trigger after window expires)

### Delivery Verification (3-party hash protocol)
- **Hash = keccak256(vcCID)** already stored on-chain at OrderConfirmed
- **Transporter reads hash from contract** (public getter, no off-chain coordination needed)
- **Buyer fetches VC from IPFS**, computes keccak256(CID), shows hash in app UI
- **Transporter compares** buyer's hash with on-chain hash
- **If match:** Transporter calls confirmDelivery(hash) — contract verifies hash == storedVcHash
- **If no match / dispute:** No dispute mechanism. Timeout handles it (transporter bond slashed)
- **Hash exchange UX:** Both parties see hash in app UI (Claude's discretion on exact UX)

### Private Payment Recording
- **Access control:** Anyone can call recordPrivatePayment. Caller becomes the buyer
- **Validation (strict):** non-zero hashes + not already paid + phase == Listed + caller != seller
- **No on-chain amount verification.** Contract stores memoHash + railgunTxRef as references only. The ZKP in the VC proves amount correctness separately
- **Anti-replay:** Global memo reuse guard (usedMemoHash mapping)

### On-chain VC Storage
- Store keccak256(vcCID) as bytes32 on-chain (not full CID string)
- Emit full CID in events only (indexed off-chain)
- Gas savings: bytes32 vs variable-length string storage

### Purchase Paths
- **Private only.** Remove: purchasePublic(), depositPurchase(), depositPurchasePrivate()
- **Single entry point:** recordPrivatePayment() is the only way to buy

### Claude's Discretion
- Hash exchange UX details (visual comparison in app)
- Default bond amount for Sepolia testnet (configurable by factory owner)
- Event naming and parameter design
- Internal function structure and gas optimizations
- Error message wording for custom errors

</decisions>

<specifics>
## Specific Ideas

- Flow matches the figure provided by user: deploy -> depositFunds -> VRC to IPFS -> confirmOrder -> deliver -> verify hash -> confirmDelivery -> release
- Seller deposit: supervisor approved fixed configurable bond (private Railgun deposit infeasible due to wallet-to-wallet limitation)
- The strongest incentive model for real industry use is the goal
- Price must NEVER appear on-chain in any form (not as msg.value, not derivable from any public data)

</specifics>

<deferred>
## Deferred Ideas

- QR code for hash exchange at delivery (nice UX but adds scope — Phase 9 or later)
- On-chain ZKP verifier for amount proof (too complex for current scope, noted for future)
- Private Railgun deposit for seller collateral (infeasible with current Railgun architecture — thesis limitation / future work)
- Configurable timeout windows per product (keep 2-day fixed for now)

</deferred>

## Open Questions

- None — all blocking decisions resolved

---

*Phase: 07-smart-contract-redesign*
*Context gathered: 2026-02-16*
