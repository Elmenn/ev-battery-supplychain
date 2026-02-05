# Phase 6: On-Chain Recording - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Record private payment reference on ProductEscrow contract to link the Railgun transaction to the supply chain product state. After calling `recordPrivatePayment(memoHash, railgunTxRef)`, the product moves to `Phase.Purchased` with `PurchaseMode.Private`. UI updates to reflect purchased state.

</domain>

<decisions>
## Implementation Decisions

### Transaction Timing
- Call recordPrivatePayment **immediately** after Railgun transfer confirms — single flow, not separate step
- Store pending state in **localStorage** so it persists across page refreshes
- If user refreshes mid-flow, they see pending state and can retry recording

### Error Handling
- Show **specific error messages** by decoding contract revert reasons (e.g., "Product already purchased")
- Generic "Recording failed" is not acceptable — user needs to understand what happened

### UI State Feedback
- Show disabled button with **"Already Purchased"** text after purchase (not hidden)
- Display **transaction references** (txHash with Etherscan link, memoHash) after purchase
- Show **"Purchased" badge on marketplace cards** — not just detail page

### Transaction Flow
- **Buyer pays gas** for recordPrivatePayment call
- Show **success toast with Etherscan link** after recording (consistent with shield operation)
- **Investigate contract** to determine if buyer must be msg.sender or if anyone can call

### Claude's Discretion
- MetaMask popup UX (whether to warn about 2 transactions upfront)
- Intermediate pending state visual design
- Retry strategy for failed recording (auto-retry vs manual button)
- Manual retry button on product page (if recording fails)
- Logging approach (console + localStorage vs console only)
- Gas pre-check before recording attempt
- Purchased badge visual design

</decisions>

<specifics>
## Specific Ideas

- Toast notification pattern should match Phase 4 shield operation (Etherscan link)
- Disabled button UX — show "Already Purchased" not just grayed out
- Transaction references should be visible (user explicitly requested this)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-on-chain-recording*
*Context gathered: 2026-02-05*
