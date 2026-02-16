# Roadmap: Railgun Integration Fix + Escrow Redesign

**Milestone:** v1.0-railgun-fix
**Created:** 2026-01-20
**Updated:** 2026-02-17

## Goal

Fix the broken Railgun integration and redesign the escrow flow for private-only payments with proper incentive design, transporter-confirmed delivery, and a single consolidated VC.

## Success Criteria

### Phases 1-6 (Railgun Foundation)
1. User can connect Railgun wallet in browser
2. User can wrap ETH to WETH
3. User can shield WETH (public to private balance)
4. User can make private payment transfer to seller's 0zk address
5. Payment is recorded on-chain via `recordPrivatePayment()`
6. No console errors during the flow

### Phases 7-10 (Escrow Redesign)
7. Contract supports private-only purchases (no public path)
8. Seller deposits collateral when creating product
9. Seller assigns transporter directly in `confirmOrder` (no bidding)
10. Transporter confirms delivery via hash verification
11. Escrow releases sellerDeposit → seller, transporterFee → transporter
12. Single consolidated VC (not 3 stages) with hash-only on-chain storage
13. End-to-end private flow works on Sepolia

---

## Phase 1: Cleanup Duplicate Implementations ✓

**Goal:** Remove redundant Railgun files and establish single source of truth

**Status:** COMPLETE (2026-01-21)

**Plans:** 3/3 complete

Plans:
- [x] 01-01-PLAN.md — Consolidate exports and extract working code from legacy files
- [x] 01-02-PLAN.md — Update component imports and remove legacy workarounds
- [x] 01-03-PLAN.md — Delete legacy files and verify clean state

**Deliverables:**
- [x] Audit all existing Railgun-related files
- [x] Determine which implementation to keep (`railgun-clean/` structure)
- [x] Remove or consolidate legacy shim files
- [x] Update all component imports to use single implementation
- [x] Verify no functionality lost during cleanup

**Result:** Single Railgun implementation (railgun-clean/), 12,531 lines of dead code removed

---

## Phase 2: Wallet Connection in Browser ✓

**Goal:** Working Railgun wallet connection with persistent encrypted storage

**Status:** COMPLETE (2026-01-22)

**Plans:** 2/2 complete

Plans:
- [x] 02-01-PLAN.md — Implement encrypted mnemonic storage with fixed signing message
- [x] 02-02-PLAN.md — Add copy button, retry logic, and UX improvements

**Deliverables:**
- [x] Fix RailgunConnectionButton component
- [x] Implement wallet ID retrieval/creation
- [x] Display connection status correctly
- [x] Handle wallet derivation from mnemonic
- [x] Test connection with MetaMask + Railgun

**Key Components:**
- `frontend/src/components/railgun/RailgunConnectionButton.jsx`
- `frontend/src/lib/railgun-clean/connection.js`
- `frontend/src/lib/railgun-clean/crypto.js` (new)

**Result:** User can click connect, sign MetaMask message, see Railgun address with copy button, connection persists across refreshes

---

## Phase 3: ETH to WETH Wrapping ✓

**Goal:** Fix wrapETHtoWETH to work with existing UI by making signer parameter optional

**Status:** COMPLETE (2026-01-22)

**Plans:** 1/1 complete

Plans:
- [x] 03-01-PLAN.md — Make signer optional in wrapETHtoWETH with MetaMask auto-resolution

**Why Third:** WETH is required for Railgun shielding (ETH cannot be shielded directly)

**Deliverables:**
- [x] Make signer parameter optional in wrapETHtoWETH()
- [x] Add automatic signer resolution from window.ethereum
- [x] Improve error handling (ACTION_REJECTED, INSUFFICIENT_FUNDS)
- [x] Verify wrap flow works end-to-end

**Key Files:**
- `frontend/src/lib/railgun-clean/shield.js` (modify)
- `frontend/src/components/railgun/PrivateFundsDrawer.jsx` (no changes needed)

**Result:** User can wrap ETH to WETH, balance updates, MetaMask prompts correctly

---

## Phase 4: WETH Shielding (Public to Private) ✓

**Goal:** Move WETH from public wallet to Railgun private balance with side-by-side balance display

**Status:** COMPLETE (2026-01-27)

**Plans:** 1/1 complete

Plans:
- [x] 04-01-PLAN.md — Fix shield.js SDK types and update UI with side-by-side balances + Etherscan toast

**Why Fourth:** Private balance needed before private transfers

**Deliverables:**
- [x] Fix shieldWETH to use TXIDVersion enum (not string literals)
- [x] Side-by-side public/private WETH balance display
- [x] Spinner with "Shielding WETH..." during operation
- [x] Toast notification with Etherscan link on success
- [x] Private balance updates after shield confirms

**Key Files:**
- `frontend/src/lib/railgun-clean/shield.js` (fix SDK types)
- `frontend/src/components/railgun/PrivateFundsDrawer.jsx` (UI updates)

**Result:** User can shield WETH, sees side-by-side balances, gets Etherscan link in toast, pending balance displays correctly

---

## Phase 5: Private Payment Transfer ✓

**Goal:** Send private payment from buyer to seller's 0zk address

**Status:** COMPLETE (2026-02-05)

**Plans:** 2/2 complete

Plans:
- [x] 05-01-PLAN.md — Create transfer.js with 3-step SDK flow (estimate, prove, populate)
- [x] 05-02-PLAN.md — Wire up UI with progress feedback and store transaction references

**Why Fifth:** Core feature - the actual privacy-preserving payment

**Deliverables:**
- [x] Implement private transfer to 0zk address using SDK 3-step flow
- [x] Handle POI (Proof of Innocence) verification (automatic in SDK 10.x)
- [x] Generate memoHash for transaction
- [x] Extract railgunTxRef from nullifiers for on-chain recording
- [x] Show progress during 20-30 second proof generation
- [x] Handle transaction confirmation

**Key Files:**
- `frontend/src/lib/railgun-clean/operations/transfer.js` (create)
- `frontend/src/lib/railgun-clean/payments.js` (update)
- `frontend/src/components/railgun/PrivatePaymentModal.jsx` (update)

**Acceptance:** User can send private payment, sees proof generation progress, transaction completes on Sepolia

---

## Phase 6: On-Chain Recording ✓

**Goal:** Record private payment reference on ProductEscrow contract after Railgun transfer confirms

**Status:** COMPLETE (2026-02-05)

**Plans:** 2/2 complete

Plans:
- [x] 06-01-PLAN.md — Add recordPrivatePayment call and error decoding
- [x] 06-02-PLAN.md — Update UI with purchased badge and transaction display

**Result:** recordPrivatePayment flow working, error decoding, purchased badge, transaction references displayed

---

## Phase 7: Smart Contract Redesign ✓

**Goal:** Rewrite ProductEscrow contract for private-only flow with seller/transporter bond staking, transporter-confirmed delivery via hash verification, and bytes32 vcHash storage

**Status:** COMPLETE (2026-02-16)

**Plans:** 3 plans

Plans:
- [x] 07-01-PLAN.md — Rewrite ProductEscrow_Initializer.sol and update ProductFactory.sol
- [x] 07-02-PLAN.md — Core tests: lifecycle, phase transitions, bond mechanics, access control, reentrancy
- [x] 07-03-PLAN.md — Timeout/slash tests and deployment migration script

**Why Seventh:** Foundation for all subsequent UI work — contract must be right first

**Key Changes:**
- Private-only purchases (remove `purchasePublic`, `depositPurchase`, `depositPurchasePrivate`)
- Add `sellerDeposit` collateral held in escrow
- `confirmOrder(vcHash)` — seller confirms order after purchase
- Keep transporter bidding (`createTransporter`, seller selects via `setTransporter`)
- Seller deposits transporterFee when selecting transporter
- `confirmDelivery(hash)` — called by **transporter** (not buyer) after hash verification
- Store `keccak256(vcCID)` on-chain, emit full CID in events only (gas optimization)
- Fix double-payment bug in `_timeout()`
- Clean up redundant purchase paths

**Deliverables:**
- [x] New ProductEscrow_Initializer.sol with redesigned flow
- [x] Updated ProductFactory.sol (if initialize params change)
- [x] Deployment script for Sepolia
- [x] Contract tests for new flow

---

## Phase 8: Single VC Architecture

**Goal:** Consolidate 3-stage VC chain into a single append-only Verifiable Credential

**Status:** NOT YET COMPLETE

**Plans:** 3 plans

Plans:
- [ ] 08-01-PLAN.md — Rewrite vcBuilder.mjs with append-only VC functions, delete CJS duplicate
- [ ] 08-02-PLAN.md — Add IPFS fetchJson utility with caching/retry, update EIP-712 signing types
- [ ] 08-03-PLAN.md — Create vcVerifier.js with consolidated verification logic

**Why Eighth:** VC structure affects both contract events and UI — design before wiring

**Key Changes:**
- One VC document that accumulates proofs over its lifecycle
- Seller creates VC at product listing (initial state)
- Proofs appended: seller signature, buyer payment proof (memoHash), delivery confirmation
- Single IPFS upload per mutation (new version replaces old, linked via `previousVersion`)
- Hash-only on-chain storage (`bytes32` instead of `string vcCid`)
- VC contains Pedersen commitment + ZKP range proof for price verification

**Deliverables:**
- [ ] Redesigned VC schema (single document with proof chain)
- [ ] Updated vcBuilder.mjs
- [ ] Updated IPFS upload/fetch utilities
- [ ] VC verification logic for consolidated format

---

## Phase 9: UI Rework

**Goal:** Update all UI flows to match new contract and VC architecture

**Status:** COMPLETE (2026-02-16)

**Why Ninth:** UI builds on top of finalized contract + VC design

**Key Changes:**
- Remove public purchase UI (keep private-only)
- Seller flow: create product with deposit → confirm order → select transporter from bids + deposit fee
- Buyer flow: Railgun transfer → recordPrivatePayment → view VC
- Transporter flow: bid on delivery → receive Hash from seller → verify Hash' from buyer → confirmDelivery on-chain
- Update ProductDetail.jsx, ProductCard.jsx, PrivatePaymentModal.jsx

**Deliverables:**
- [ ] Updated seller product creation (with sellerDeposit)
- [ ] Updated seller order confirmation + transporter selection from bids
- [ ] Private-only purchase flow (remove public buttons)
- [ ] Transporter delivery confirmation UI (hash verification)
- [ ] Buyer hash presentation UX

---

## Phase 10: Cleanup & E2E Integration

**Goal:** Remove dead code from old flow, verify end-to-end on Sepolia

**Status:** COMPLETE (2026-02-16)

**Why Tenth:** Final integration after all pieces are in place

**Key Changes:**
- Delete old contract code (ProductEscrow.sol if superseded)
- Remove dead UI paths (public purchase, bidding, buyer delivery confirmation)
- E2E test: product creation → private payment → order confirmation → delivery → fund release
- Gas comparison: old vs. new contract (for thesis)
- Verify VC chain integrity end-to-end

**Deliverables:**
- [ ] Dead code removal
- [ ] E2E flow verified on Sepolia
- [ ] Gas optimization report
- [ ] No console errors in full flow

---

## Phase Dependencies

```
Phase 1-6 (Railgun Foundation) ✓
    |
Phase 7 (Contract Redesign)
    |
Phase 8 (Single VC Architecture)
    |
Phase 9 (UI Rework)
    |
Phase 10 (Cleanup & E2E)
```

Note: Phase 8 (VC) could partially overlap with Phase 7 (Contract) since VC schema design is independent of contract implementation. Details during planning.

---

## Agreed Design Decisions (2026-02-16)

1. **Transporter confirms delivery** (not buyer) — 3-party hash verification
2. **Seller deposits collateral** — skin in the game, returned on successful delivery
3. **Keep transporter bidding** — transporters bid fees, seller selects winner
4. **Transporter paid from escrow** — not off-chain, trustless
5. **VC hash on-chain, CID in events** — gas optimization
6. **Private-only purchases** — no public purchase path, Railgun is the only payment method

---

## Known Risks

1. **SDK 50% scan reset bug** — workaround may need reimplementation if issue recurs
2. **Browser compatibility** — Railgun SDK designed for Node, may need polyfills
3. **Sepolia testnet** — Need to ensure Railgun infrastructure available on Sepolia
4. **Contract migration** — Existing deployed products will use old contract; new products use new contract
5. **Single VC complexity** — Append-only VC needs careful schema design to avoid bloat

---

*Created: 2026-01-20 | Updated: 2026-02-17 | Milestone: v1.0-railgun-fix*
