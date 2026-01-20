# Phase 01: Cleanup Duplicate Implementations - Research

**Researched:** 2026-01-20
**Domain:** Railgun SDK Integration / React Frontend
**Confidence:** HIGH

## Summary

The codebase has **5+ fragmented Railgun implementation files** attempting different approaches to browser-based wallet integration. The core problem is adapting a Node.js-focused SDK (@railgun-community/wallet) for browser use, which requires polyfills, webpack configuration, and handling CORS limitations.

**Key finding:** There are two parallel implementation directories:
1. `frontend/src/lib/railgun-clean/` - Simplified JS modules (10 files, ~400 LOC) - **target structure**
2. `frontend/src/lib/railgun/` - Full TypeScript SDK copy (~100+ files) - complex, but contains critical functions

The `railgun-clean/` folder imports from and depends on the `railgun/` TypeScript files, creating a hybrid approach. The legacy shim (`railgun-legacy-shim.js`) is the most complete implementation with 587 lines of working code.

**Primary recommendation:** Consolidate to `railgun-clean/` as the public API, extract working code from `railgun-legacy-shim.js`, and establish clear import boundaries.

## Current File Inventory

### Files to Keep/Consolidate

| File | LOC | Status | What It Does |
|------|-----|--------|--------------|
| `railgun-clean/index.js` | 27 | Keep | Public API exports |
| `railgun-clean/bootstrap.js` | 40 | Keep | Engine initialization wrapper |
| `railgun-clean/connection.js` | 99 | Keep | Connect/disconnect/restore |
| `railgun-clean/balances.js` | 42 | Keep | Balance queries |
| `railgun-clean/payments.js` | 81 | Keep | Private transfer payment |
| `railgun-clean/shield.js` | 133 | Keep | WETH wrapping and shielding |
| `railgun-clean/wallet-state.js` | 24 | Keep | In-memory state |
| `railgun-clean/utils/` | ~50 | Keep | Logger, artifact store |

### Files to Extract From Then Delete

| File | LOC | Status | What To Extract |
|------|-----|--------|-----------------|
| `railgun-legacy-shim.js` | 587 | **Extract then delete** | `initializeEngine()`, `loadWalletFromCredentials()`, `getAllBalances()`, `refreshBalances()` - these are the most complete implementations |
| `railgun-client-browser.js` | 305 | **Evaluate** | Alternative SDK wrapper with `initializeSDK()`, `createWalletFromSignature()` - different approach, may have useful patterns |

### Files to Delete

| File | Status | Reason |
|------|--------|--------|
| `serve-html.ts` | **Delete** | 11,360 line Node.js monolith - context says delete entirely, fresh start |
| `railgun-browser-init.js` | **Delete after extraction** | 510 lines duplicating bootstrap functionality |

### Files to Keep (But Not Modify in Phase 1)

| Directory | Status | Reason |
|-----------|--------|--------|
| `railgun/` (TypeScript) | Keep | Required by railgun-clean via imports - contains core SDK wrappers |
| `polyfills/` | Keep | Required for browser compatibility |

## Dependency Graph

```
Components (import from)
    |
    v
railgun-clean/index.js (public API)
    |
    +-- bootstrap.js --> railgun-client-browser.js --> @railgun-community/wallet
    |                                              --> level-js, localforage
    |
    +-- connection.js --> railgun-client-browser.js
    |
    +-- balances.js --> railgun-client-browser.js
    |
    +-- payments.js --> railgun-client-browser.js
    |
    +-- shield.js --> @railgun-community/shared-models, ethers
    |
    +-- (legacy-shim imports) --> railgun/wallets/wallets.js (TypeScript)
                              --> railgun/wallets/balance-update.js
                              --> railgun/core/engine.js
```

**Critical Observation:** The codebase has **TWO competing browser initialization approaches**:
1. `railgun-client-browser.js` - Uses `@railgun-community/wallet` SDK directly
2. `railgun-browser-init.js` - Uses local TypeScript files in `railgun/`

The legacy shim mixes both, which causes confusion.

## Component Import Analysis

| Component | Current Import | Functions Used |
|-----------|----------------|----------------|
| `RailgunConnectionButton.jsx` | `railgun-clean` | `connectRailgun`, `disconnectRailgun`, `restoreRailgunConnection` |
| `PrivateFundsDrawer.jsx` | `railgun-clean` | `setSignerAndProvider`, `setRailgunIdentity`, `getAllBalances` |
| `PrivatePaymentModal.jsx` | `railgun-clean` as `legacyRailgun` | `connectRailgun`, `setRailgunIdentity`, `disconnectRailgun`, `refreshBalances`, `getAllBalances`, `privateTransfer`, `getRailgunAddressFromCredentials` |
| `ProductFormStep2_5_Railgun.jsx` | `railgun-clean` | `connectRailgun` |
| `RailgunSimple.tsx` | `railgun-clean` | Multiple functions |
| `RailgunInitializationTest.jsx` | `railgun-clean/bootstrap` | `initRailgunForBrowser`, `stopRailgunEngineBrowser` |

**Missing Functions in railgun-clean/index.js:**
- `setSignerAndProvider` - deprecated in legacy shim, needs stub or removal
- `setRailgunIdentity` - not exported
- `refreshBalances` - not exported (exists in legacy shim)
- `privateTransfer` - not exported

## Functions That Need Implementation

| Function | Current Status | Where Code Exists |
|----------|----------------|-------------------|
| `wrapETHtoWETH()` | Throws "not yet implemented" | Needs implementation (WETH contract interaction) |
| `estimateShieldWETH()` | Throws "not yet implemented" | Needs implementation |
| `shieldWETH()` | Partial in `shield.js` | Wraps ETH but uses backend for shield recording |
| `privateTransfer()` | Throws error in legacy shim | `payments.js` has `paySellerV2` |
| `getRailgunAddressFromCredentials()` | Throws error | Needs SDK call |
| `setSignerAndProvider()` | Deprecated warning | Can be no-op |
| `setRailgunIdentity()` | Not exported | In-memory state update |

## The 50% Scan Reset Bug Workaround

**Location:** `serve-html.ts` lines 110-176

**What it does:**
1. Sets a global flag `isBuildingUtxoTree` during UTXO tree build
2. Patches `RailgunEngine.prototype.slowSyncV2` to no-op during scan
3. Prevents interleaved scans (POI/TXID/balance) from resetting at 50%

**Root cause:** Write queue hasn't flushed when SDK detects a "gap" at 50%, triggering slow-sync fallback that fails due to RPC limits (Alchemy 10-block eth_getLogs restriction).

**Assessment:** This workaround is **server-side only** (Express middleware). For browser use:
- The browser implementation in `railgun-browser-init.js` has a simpler approach
- The SDK's `createEngineDebugger` in `railgun/core/init.ts` (lines 61-84) suppresses slow-sync errors
- **Recommendation:** The debugger-based suppression is sufficient for browser; no extraction needed

## Polyfill Requirements

Current polyfills in `config-overrides.js`:

| Module | Polyfill | Required By |
|--------|----------|-------------|
| `crypto` | `crypto-browserify` | SDK cryptography |
| `stream` | `stream-browserify` | SDK streams |
| `buffer` | `buffer` | SDK binary data |
| `http` | `stream-http` | SDK HTTP requests |
| `https` | `https-browserify` | SDK HTTPS |
| `zlib` | `browserify-zlib` | SDK compression |
| `url` | `url/` | SDK URL parsing |
| `process` | `process/browser` | Environment detection |
| `fs` | false (disabled) | Not needed in browser |
| `net` | false | Not needed |
| `tls` | false | Not needed |
| `path` | false | Not needed |
| `os` | false | Not needed |
| `vm` | false | Not needed |

**Additional webpack plugins:**
- `ProvidePlugin` for `Buffer` and `process` globals
- `NormalModuleReplacementPlugin` for `@whatwg-node/fetch` shim
- Alias for singleton resolution of `@railgun-community/*` packages

**Assessment:** Current polyfill setup is correct and complete. No changes needed.

## Backend Coordination

**Backend location:** `backend/railgun/` - **Directory does not exist**

The frontend references a backend API at `http://localhost:3001/api/railgun/*` for:
- `/wallet-credentials/:userAddress` - Get wallet mnemonic and encryption key
- `/wallet-info` - Get wallet info
- `/shield` - Record shield transaction
- `/private-transfer-audit` - Audit private transfers
- `/status` - Engine status check

**Finding:** Backend Railgun service is separate from this repository or needs to be created. The frontend expects it to exist.

**For Phase 1:** Document the expected backend API but don't modify backend code.

## Architecture Patterns

### Recommended Consolidated Structure

```
frontend/src/lib/
├── railgun-clean/          # PUBLIC API (components import from here)
│   ├── index.js            # Single export point
│   ├── bootstrap.js        # Engine initialization
│   ├── connection.js       # Wallet connection
│   ├── balances.js         # Balance queries
│   ├── payments.js         # Private transfers
│   ├── shield.js           # Shielding operations
│   ├── wrap.js             # NEW: ETH to WETH wrapping
│   ├── wallet-state.js     # In-memory state
│   └── utils/
│       ├── logger.js
│       └── artifact-store.js
│
├── railgun/                # INTERNAL (do not import directly from components)
│   ├── core/               # Engine, providers, artifacts
│   ├── wallets/            # Wallet management
│   ├── transactions/       # Transaction generation
│   └── ...                 # (keep existing structure)
│
└── polyfills/              # Browser compatibility
    └── whatwg-fetch-shim.js
```

### Import Pattern for Components

```javascript
// CORRECT - import from railgun-clean
import { connectRailgun, getAllBalances, shieldWETH } from '../../lib/railgun-clean';

// INCORRECT - don't import from internal modules
import { createRailgunWallet } from '../../lib/railgun/wallets/wallets.js'; // NO
import { initializeSDK } from '../../lib/railgun-client-browser.js'; // NO
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Wallet creation | Custom crypto derivation | `@railgun-community/wallet` SDK | Complex BIP39/BIP44 derivation |
| ZK proofs | Custom proof generation | SDK's `groth16` integration | Requires trusted setup, snarkjs |
| Merkletree sync | Custom event scanning | SDK's quick-sync | Handles RPC limits, batching |
| POI validation | Custom proof-of-innocence | SDK's POI integration | Privacy guarantee requirements |

## Common Pitfalls

### Pitfall 1: Multiple SDK Initializations
**What goes wrong:** React StrictMode calls effects twice, initializing engine multiple times
**Why it happens:** No global initialization lock
**How to avoid:** Use `hasEngine()` check and global promise lock (already implemented in `railgun-browser-init.js`)
**Warning signs:** Console shows "Engine already initialized" errors

### Pitfall 2: CORS Blocking RPC Calls
**What goes wrong:** `eth_getLogs` calls fail in browser due to CORS
**Why it happens:** Public RPC endpoints don't allow browser origins
**How to avoid:** Use CORS-friendly RPCs or fallback to `window.ethereum` (MetaMask)
**Warning signs:** "Failed to load provider due to CORS" warnings

### Pitfall 3: Importing from Wrong Module
**What goes wrong:** Components import from internal modules, breaking when refactored
**Why it happens:** No clear boundary between public API and internals
**How to avoid:** Always import from `railgun-clean/index.js`
**Warning signs:** Import paths with `railgun/core/` or `railgun/wallets/`

### Pitfall 4: Missing Function Exports
**What goes wrong:** Component uses function not exported from index.js
**Why it happens:** Functions exist in internal files but not re-exported
**How to avoid:** Audit component imports, add missing exports
**Warning signs:** Runtime errors "X is not a function"

## Code Examples

### Correct Module Export Pattern
```javascript
// railgun-clean/index.js
export { bootstrap, initRailgunForBrowser } from './bootstrap';
export { connectRailgun, disconnectRailgun, restoreRailgunConnection } from './connection';
export { getAllBalances, refreshBalances } from './balances';
export { paySellerV2 as privateTransfer } from './payments';
export { shieldWETH, getWETHBalance, wrapETHtoWETH } from './shield';

// Deprecated stubs for backward compatibility
export const setSignerAndProvider = () => {
  console.warn('setSignerAndProvider is deprecated - signer managed internally');
};
export const setRailgunIdentity = () => {
  console.warn('setRailgunIdentity is deprecated - identity managed internally');
};
```

### Component Import Migration
```javascript
// BEFORE (PrivatePaymentModal.jsx)
import * as legacyRailgun from '../../lib/railgun-clean';
const { connectRailgun, setRailgunIdentity, ... } = legacyRailgun;

// AFTER
import {
  connectRailgun,
  disconnectRailgun,
  refreshBalances,
  getAllBalances,
  privateTransfer
} from '../../lib/railgun-clean';
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Multiple SDK wrappers | Single `railgun-clean/` entry | This phase | Cleaner imports |
| Backend-heavy initialization | Browser-first SDK usage | Recent | Faster connection |
| serve-html.ts monolith | Modular JS files | This phase | Maintainability |

**Deprecated/outdated:**
- `serve-html.ts` - 11,360 line monolith, delete entirely
- `railgun-legacy-shim.js` - Extract useful code, then delete
- Direct imports from `railgun/` TypeScript files - Use `railgun-clean/` instead

## Open Questions

1. **Backend API existence**
   - What we know: Frontend expects `http://localhost:3001/api/railgun/*`
   - What's unclear: Is backend in this repo? Separate repo? Needs creation?
   - Recommendation: Document expected API, defer backend work to later phase

2. **TypeScript files in railgun/**
   - What we know: ~100 TS files, webpack stubbed for build
   - What's unclear: Are these from @railgun-community/wallet or custom?
   - Recommendation: Keep as-is, they're working via dynamic imports

## Sources

### Primary (HIGH confidence)
- Direct file analysis of all Railgun-related files in repository
- `frontend/src/lib/railgun-clean/` - 10 JavaScript files analyzed
- `frontend/src/lib/railgun-legacy-shim.js` - 587 lines analyzed
- `frontend/src/lib/railgun-client-browser.js` - 305 lines analyzed
- `frontend/src/lib/serve-html.ts` - First 300 lines analyzed
- `frontend/config-overrides.js` - Full webpack configuration analyzed
- Component files analyzed for import patterns

### Secondary (MEDIUM confidence)
- @railgun-community/wallet SDK knowledge (training data)
- Webpack polyfill configuration patterns

## Metadata

**Confidence breakdown:**
- File inventory: HIGH - direct file analysis
- Dependency graph: HIGH - traced imports
- Component imports: HIGH - grep analysis
- Missing functions: HIGH - compared exports to usages
- 50% bug workaround: MEDIUM - analyzed code, didn't test
- Backend coordination: LOW - backend not found in repo

**Research date:** 2026-01-20
**Valid until:** 2026-02-20 (30 days - stable codebase cleanup)
