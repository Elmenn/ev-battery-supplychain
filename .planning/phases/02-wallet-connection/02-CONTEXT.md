# Phase 2: Wallet Connection in Browser - Context

**Gathered:** 2026-01-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Working Railgun wallet connection from browser UI. User can click connect, see Railgun address displayed. This phase covers connection flow, status display, wallet derivation, and error handling. Wrapping, shielding, and transfers are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Connection Flow
- Explicit button click to initiate (not automatic)
- MetaMask must be connected BEFORE Railgun connection
- Single-step connection from user perspective (click → done)
- Connection persists across page refreshes (remember connection state)

### UI Feedback
- Simple spinner + "Connecting..." text during connection
- Connected state shows: "Railgun: 0zk123...abc456" (label + truncated address)
- Include copy button for address
- Status appears in the connect button area (button transforms to show state)

### Wallet Derivation
- Support both: import existing mnemonic OR generate new one
- Store mnemonic in browser localStorage (encrypted)
- Encryption key derived from MetaMask signature (user signs message, signature becomes key)

### Error Handling
- Silent retry 2-3 times on SDK initialization failure, only show error if all fail
- If MetaMask not connected: show "Please connect MetaMask first" (don't auto-trigger)
- Friendly error messages only, no technical details exposed to user

### Claude's Discretion
- Whether to include explicit disconnect button
- Whether to show wallet ID to user (vs just 0zk address)
- Cancellation UX (return to disconnected state vs show message)

</decisions>

<specifics>
## Specific Ideas

- Encryption via MetaMask signature is similar to how some dApps handle wallet-based encryption
- Connection should feel instant from user perspective (single step)
- Error messages should be non-technical: "Connection failed. Please try again."

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-wallet-connection*
*Context gathered: 2026-01-21*
