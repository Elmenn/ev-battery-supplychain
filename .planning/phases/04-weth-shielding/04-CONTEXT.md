# Phase 4: WETH Shielding - Context

**Gathered:** 2026-01-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Move WETH from public wallet to Railgun private balance. User can shield WETH, see private balance update, and have spendable private funds for Phase 5 transfers. Gas estimation and shield confirmation handling included.

</domain>

<decisions>
## Implementation Decisions

### Balance display
- Side by side layout: show public and private WETH balances simultaneously
- Format: "Public: X WETH | Private: Y WETH" or similar clear distinction
- WETH only — focus on the token being shielded, not all supported tokens
- Loading spinner when fetching or updating balances

### Transaction feedback
- Simple spinner with status text during shield (e.g., "Shielding WETH...")
- Toast notification on success — brief, auto-dismisses
- Toast always includes "View on Etherscan" link to the transaction
- Error handling: Claude's discretion based on error type

### Claude's Discretion
- Balance update timing (optimistic vs wait for confirmation)
- Error toast behavior (retry button vs simple dismiss) based on error type
- Exact spinner placement and styling
- Gas estimation UX

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-weth-shielding*
*Context gathered: 2026-01-26*
