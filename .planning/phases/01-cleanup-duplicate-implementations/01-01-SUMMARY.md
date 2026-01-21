---
phase: 01-cleanup-duplicate-implementations
plan: 01
subsystem: railgun-integration
tags: [railgun, exports, consolidation, api]
dependency-graph:
  requires: []
  provides: [railgun-clean-api, consolidated-exports]
  affects: [01-02, 01-03, components]
tech-stack:
  added: []
  patterns: [single-entry-point, barrel-exports, deprecated-stubs]
key-files:
  created:
    - frontend/src/lib/railgun-clean/index.js
    - frontend/src/lib/railgun-clean/balances.js
    - frontend/src/lib/railgun-clean/connection.js
    - frontend/src/lib/railgun-clean/shield.js
  modified: []
decisions:
  - id: deprecated-stubs
    summary: Use console.warn stubs for deprecated functions
    rationale: Allows components to still call deprecated functions without breaking
  - id: alias-pattern
    summary: Use aliases for backward compatibility
    rationale: privateTransfer -> paySellerV2, initRailgunEngine -> bootstrap
  - id: sdk-direct
    summary: Connection uses SDK via railgun-client-browser.js
    rationale: Clean dependency - no legacy shim imports
metrics:
  duration: 16m
  completed: 2026-01-21
---

# Phase 01 Plan 01: Consolidate Railgun Exports Summary

**One-liner:** Created complete railgun-clean public API with 17+ exports, deprecated stubs, and SDK-direct connection flow.

## Tasks Completed

| Task | Description | Commit | Key Files |
|------|-------------|--------|-----------|
| 1 | Audit component imports and map required functions | 7dc65689 | index.js |
| 2 | Extract and consolidate missing functions | 40f2079f | balances.js, connection.js, shield.js, index.js |
| 3 | Wire connection.js to use SDK directly | (verified) | connection.js, bootstrap.js |

## What Changed

### index.js - Complete Public API
- Added comprehensive API documentation header
- Added deprecated stubs: `setSignerAndProvider`, `setRailgunIdentity`, `getRailgunAddressFromCredentials`
- Added backward-compatible aliases: `privateTransfer`, `initRailgunEngine`, `getPrivateBalances`, `connectRailgunWallet`, `getCurrentWallet`
- Added `refreshBalances` wrapper
- Exports 17+ functions covering all component needs

### balances.js - Rewritten
- `getAllBalances()` now works without parameters
- Gets EOA balances from MetaMask (ETH + WETH)
- Gets Railgun balances from SDK using stored walletID
- Returns `{ success, data: { eoa, railgun } }` format

### connection.js - Enhanced
- `disconnectRailgun()` now clears localStorage
- Tracks walletID and railgunAddress in state
- `getRailgunState()` merges in-memory state with localStorage
- `isRailgunConnectedForEOA()` checks both state and localStorage

### shield.js - Extended
- Added `wrapETHtoWETH()` - standalone ETH to WETH wrapping
- Added `estimateShieldWETH()` - rough gas estimation
- Made backend shield recording best-effort (non-blocking)

## Functions Now Exported

### Connection (5)
- `connectRailgun(options)` - Connect wallet
- `disconnectRailgun()` - Clear connection
- `restoreRailgunConnection(addr)` - Restore from localStorage
- `isRailgunConnectedForEOA(addr)` - Check connection
- `getRailgunState()` - Get connection state

### Bootstrap (4)
- `bootstrap(options)` - Initialize SDK
- `initRailgunForBrowser(options)` - Alias for bootstrap
- `initRailgunEngine(options)` - Alias for bootstrap
- `stopRailgunEngineBrowser()` - No-op cleanup

### Balances (3)
- `getAllBalances()` - Get EOA + Railgun balances
- `refreshBalances(force, timeout)` - Trigger refresh
- `getPrivateBalances()` - Alias for getAllBalances

### Payments (3)
- `paySellerV2(params)` - Execute private transfer
- `privateTransfer(params)` - Alias for paySellerV2
- `checkWalletState(eoaAddress)` - Check wallet loaded

### Shielding (4)
- `shieldWETH(amount, signer)` - Wrap ETH and record shield
- `getWETHBalance(address, provider)` - Get WETH balance
- `wrapETHtoWETH(amount, signer)` - Wrap ETH only
- `estimateShieldWETH(amount)` - Estimate gas

### State (3)
- `getWalletState()` - Get in-memory state
- `updateWalletState(updates)` - Update state
- `resetWalletState()` - Clear state

### Deprecated (3)
- `setSignerAndProvider()` - console.warn stub
- `setRailgunIdentity()` - console.warn stub
- `getRailgunAddressFromCredentials()` - throws with helpful message

### Compatibility (2)
- `connectRailgunWallet()` - Alias for RailgunSimple.tsx
- `getCurrentWallet()` - Get current wallet info

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

1. **All functions exported:** 17+ functions exported from index.js
2. **No legacy imports:** `grep "legacy-shim|browser-init"` returns no matches in railgun-clean/
3. **Deprecated functions log warnings:** Verified setSignerAndProvider and setRailgunIdentity log console.warn
4. **All files exist:** Verified all 7 railgun-clean files exist

## Next Phase Readiness

**Blockers:** None

**Ready for:**
- 01-02: Update component imports
- 01-03: Delete legacy files

**Dependencies resolved:**
- All functions components need are now exported
- Components can import any function from railgun-clean
- No runtime "X is not a function" errors expected
