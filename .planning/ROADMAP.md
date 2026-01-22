# Roadmap: Railgun Integration Fix

**Milestone:** v1.0-railgun-fix
**Created:** 2026-01-20

## Goal

Fix the broken Railgun integration to enable private payments where buyers can pay sellers with hidden transaction amounts.

## Success Criteria

1. User can connect Railgun wallet in browser
2. User can wrap ETH to WETH
3. User can shield WETH (public to private balance)
4. User can make private payment transfer to seller's 0zk address
5. Payment is recorded on-chain via `recordPrivatePayment()`
6. No console errors during the flow

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

## Phase 3: ETH to WETH Wrapping

**Goal:** Fix wrapETHtoWETH to work with existing UI by making signer parameter optional

**Status:** PLANNED

**Plans:** 1 plan

Plans:
- [ ] 03-01-PLAN.md — Make signer optional in wrapETHtoWETH with MetaMask auto-resolution

**Why Third:** WETH is required for Railgun shielding (ETH cannot be shielded directly)

**Deliverables:**
- [ ] Make signer parameter optional in wrapETHtoWETH()
- [ ] Add automatic signer resolution from window.ethereum
- [ ] Improve error handling (ACTION_REJECTED, INSUFFICIENT_FUNDS)
- [ ] Verify wrap flow works end-to-end

**Key Files:**
- `frontend/src/lib/railgun-clean/shield.js` (modify)
- `frontend/src/components/railgun/PrivateFundsDrawer.jsx` (no changes needed)

**Acceptance:** User can wrap 0.01 ETH to 0.01 WETH, balance updates

---

## Phase 4: WETH Shielding (Public to Private)

**Goal:** Move WETH from public wallet to Railgun private balance

**Why Fourth:** Private balance needed before private transfers

**Deliverables:**
- [ ] Implement shield transaction generation
- [ ] Handle shield transaction signing
- [ ] Update private balance display
- [ ] Implement `estimateShieldWETH()` for gas estimation
- [ ] Handle shield confirmation

**Key Files:**
- `frontend/src/components/railgun/PrivateFundsDrawer.jsx:153`
- `frontend/src/lib/railgun-clean/operations/shield.js` (to create)

**Acceptance:** User can shield WETH, private balance shows in UI

---

## Phase 5: Private Payment Transfer

**Goal:** Send private payment from buyer to seller's 0zk address

**Why Fifth:** Core feature - the actual privacy-preserving payment

**Deliverables:**
- [ ] Implement private transfer to 0zk address
- [ ] Handle POI (Proof of Innocence) verification
- [ ] Generate memoHash for transaction
- [ ] Extract railgunTxRef from completed transfer
- [ ] Handle transaction confirmation

**Key Files:**
- `frontend/src/components/railgun/PrivatePaymentModal.jsx`
- `frontend/src/lib/railgun-clean/operations/transfer.js` (to create)

**Acceptance:** User can send private payment, transaction completes on Sepolia

---

## Phase 6: On-Chain Recording

**Goal:** Record private payment reference on ProductEscrow contract

**Why Sixth:** Links privacy payment to supply chain product state

**Deliverables:**
- [ ] Call `recordPrivatePayment(memoHash, railgunTxRef)` after transfer
- [ ] Move product to Phase.Purchased with PurchaseMode.Private
- [ ] Update UI to reflect purchased state
- [ ] Test full flow end-to-end

**Key Files:**
- `contracts/ProductEscrow_Initializer.sol`
- `frontend/src/components/marketplace/ProductDetail.jsx`

**Acceptance:** Product shows as "Purchased (Private)" after payment

---

## Phase Dependencies

```
Phase 1 (Cleanup)
    |
Phase 2 (Wallet Connection)
    |
Phase 3 (Wrap ETH)
    |
Phase 4 (Shield WETH)
    |
Phase 5 (Private Transfer)
    |
Phase 6 (On-Chain Recording)
```

---

## Known Risks

1. **SDK 50% scan reset bug** - ~~Workaround exists in codebase (serve-html.ts:128-176)~~ Note: serve-html.ts deleted in Phase 1 - workaround may need reimplementation if issue recurs
2. **Browser compatibility** - Railgun SDK designed for Node, may need polyfills
3. **Sepolia testnet** - Need to ensure Railgun infrastructure available on Sepolia

---

*Created: 2026-01-20 | Milestone: v1.0-railgun-fix*
