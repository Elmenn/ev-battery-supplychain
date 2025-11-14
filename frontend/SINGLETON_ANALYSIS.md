# Analysis: NETWORK_CONFIG Singleton Issue

## The Problem (Confirmed by User's Explanation)

Functions using `networkName` parameter crash:
- `getShieldsForTXIDVersion(networkName, ...)`
- `validateRailgunTxidExists(networkName, ...)`
- TXID sync functions

Error: `Cannot destructure property 'chain' ... as it is undefined`

**Root Cause:** SDK's internal copy of `NETWORK_CONFIG` doesn't have Sepolia config, even though we patched it.

## Current Status

### ✅ What We Have:

1. **Package Manager Level:**
   - `npm ls` shows: `@railgun-community/shared-models@8.0.0` (deduped)
   - Single instance at npm dependency resolution

2. **Webpack Configuration:**
   - **Alias:** `'@railgun-community/shared-models': require.resolve('@railgun-community/shared-models')`
   - **splitChunks:** Forces `shared-models` into common chunk `railgun-shared`

3. **Bootstrap:**
   - `railgun-bootstrap.js` patches `NETWORK_CONFIG[EthereumSepolia]` BEFORE SDK imports
   - Import order in `index.js` is correct

### ❌ Potential Gaps:

1. **Webpack Bundle-Time Resolution:**
   - Even with alias + splitChunks, webpack might create separate module instances
   - SDK modules might cache `NETWORK_CONFIG` at import time (before bootstrap patch applies)

2. **No Package Manager Resolution:**
   - We don't have `npm overrides` or `yarn resolutions`
   - While npm dedupes, explicit resolution would be more robust

## Proposed Solution (From User's Explanation)

### Option A: Package Manager Resolution (Recommended)

Add to `package.json`:
```json
{
  "overrides": {
    "@railgun-community/shared-models": "8.0.0"
  }
}
```

**Pros:**
- Forces exact version at npm install time (before webpack)
- Prevents future dependency updates from breaking singleton
- Works regardless of webpack configuration

**Cons:**
- Requires `npm install` to apply

### Option B: Enhanced Webpack Alias

Already done, but we could verify it's working with bundle analysis.

### Option C: Direct SDK Patching (Workaround)

After engine starts, directly patch SDK's internal copy:
```javascript
// After RG.startRailgunEngine()
const engine = RG.getEngine();
if (engine?.networkConfigs) {
  engine.networkConfigs.set(
    NetworkName.EthereumSepolia,
    NETWORK_CONFIG[NetworkName.EthereumSepolia]
  );
}
```

## Recommendation: Test First, Then Apply

1. **First:** Run diagnostic tests (see `DIAGNOSE_SINGLETON.md`)
2. **If singleton fails:** Add `npm overrides` + reinstall
3. **Verify:** Check webpack bundle for duplicate entries
4. **Fallback:** Use direct SDK patching if webpack fails

## Why This Makes Sense

The explanation is correct:
- ✅ UTXO scan works (chain-based) vs TXID fails (networkName-based)
- ✅ SDK has internal imports that might create separate instance
- ✅ Bootstrap patches before SDK imports, but SDK might cache at module init
- ✅ Package manager resolution is more robust than webpack alone

## Action Items

1. ✅ Created diagnostic tests (`DIAGNOSE_SINGLETON.md`)
2. ⏳ **TODO:** Run diagnostics to confirm singleton failure
3. ⏳ **TODO:** Add `npm overrides` if confirmed
4. ⏳ **TODO:** Test after changes

## Questions to Answer

1. Does webpack actually create separate instances? (Check bundle)
2. Does SDK cache NETWORK_CONFIG at module init? (Check timing)
3. Will package manager resolution fix it? (Test after applying)







