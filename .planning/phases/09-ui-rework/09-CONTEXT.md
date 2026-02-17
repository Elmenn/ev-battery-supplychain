# Phase 9: UI Rework - Context

**Gathered:** 2026-02-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Update all UI flows to match the redesigned smart contract (Phase 7) and single VC architecture (Phase 8). Remove public purchase paths. Wire seller, buyer, and transporter flows through ProductDetail, ProductCard, PrivatePaymentModal, and MarketplaceView. No new capabilities — this phase makes the existing UI work with the new backend.

</domain>

<decisions>
## Implementation Decisions

### Seller flow
- Bond display: inline read-only "Protocol Collateral" card in product creation Step 3
- Bond confirmation: modal before tx — "You will lock X ETH bond (refundable/slash conditions apply)"
- Order confirmation: semi-automatic prompt when phase = Purchased — sticky CTA "Payment received, confirm order"
- Primary action: guided 1-click sequence (sign VC -> upload IPFS -> confirmOrder)
- Fallback: secondary "Run step-by-step / Retry" action for failure recovery
- Transporter selection: sortable bid table (fee, time, address) with "Recommended: lowest fee" badge (not auto-select)
- Fee deposit: confirmation modal on select showing exact ETH to lock as delivery fee
- Hash sharing: hash displayed in-app on seller's product view with copy button, QR code, and "copied" feedback
- Hash guidance text: "Share this hash with selected transporter; transporter must use exact value in confirmDelivery"

### Buyer flow
- Purchase action: single "Buy with Railgun" CTA opens stepped drawer (connect -> balance -> pay)
- Fast path: if already connected and funded, jump directly to pay step
- Amount entry: buyer enters/confirms agreed payment amount in buy flow (not shown on public listing)
- Balance check: immediate "Sufficient balance" / "Insufficient balance" indicator
- Commitment badge: "Price commitment verified on-chain" trust badge
- Post-purchase: "Purchased" badge + compact "Payment recorded" card with truncated memoHash/txRef + copy buttons
- VC access: "View Credential" button, full details in expandable section (collapsed by default)
- Hash visibility: buyer sees delivery hash after transporter is bound (same as seller), with copy/QR
- Hash gated by phase: visible only in Bound phase and later

### Transporter flow
- Bid discovery: filter tabs on existing marketplace view — "Needs Transporter" (OrderConfirmed), "My Bids", "Assigned to Me"
- Bid submission: modal form opened from ProductDetail button
- Modal contents: fee input, read-only bond amount, total ETH impact summary, explicit confirmation
- Bond disclosure: "Your bond is refundable unless slashed by timeout conditions" text in modal
- Delivery confirmation: pre-filled hash from product state with one-click confirm
- Fallback: editable input/paste if prefill missing or hash received off-app
- Final step: warning modal showing hash and payout result before on-chain submission
- Post-delivery: persistent payout summary card — bond returned, fee paid, total received, tx hash link, phase updated to Delivered
- Toast as secondary feedback only

### Role visibility
- ProductDetail structure: shared phase timeline at top, role-aware primary action panel in middle, collapsed other-role actions at bottom for transparency
- Phase timeline: adaptive — horizontal stepper on desktop, badge + vertical history on mobile/narrow
- Terminal states: Expired/Slashed shown in red, independent of normal path
- ProductCard badges: dual — primary phase badge (global truth) + secondary action chip (role-aware, wallet-connected only)
- Timeout UX: live countdown for actionable windows, yellow at ~25% remaining, red at ~10%
- Countdown visibility: only for roles that can still act in that phase
- Deadline display: absolute UTC/local timestamp alongside countdown

### Claude's Discretion
- Exact component structure and file organization for new UI sections
- CSS/styling approach for timeline stepper, badges, countdown
- Error state handling and retry UX details
- Loading skeleton designs during async operations
- Exact responsive breakpoints for timeline adaptation

</decisions>

<specifics>
## Specific Ideas

- Hash sharing uses both in-app display (source of truth for both roles) and copy/QR for off-app coordination — reduces delivery stalls
- Seller order confirmation is semi-automatic to handle the multi-step crypto flow (VC sign + IPFS + on-chain) but has step-by-step fallback for failure recovery
- Buyer stepped drawer with fast-path pattern: progressive disclosure for new users, skip-ahead for returning users
- Transporter bid discovery uses role-aware presets on marketplace rather than a separate page — ship fast, evolve later
- Post-delivery payout card is persistent (not just toast) because the event is financially important

</specifics>

<deferred>
## Deferred Ideas

- Auditor/verifier role UI — dedicated view for third-party auditors to verify VC chains and on-chain state. Separate phase.
- Dedicated transporter portal — if bid volume grows, consider a standalone transporter dashboard. For now, marketplace filters suffice.

</deferred>

---

*Phase: 09-ui-rework*
*Context gathered: 2026-02-17*
