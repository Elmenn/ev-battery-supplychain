# Diagnostic: Check if NETWORK_CONFIG Singleton is Working

## Problem
Functions using `networkName` (like `getShieldsForTXIDVersion`, `validateRailgunTxidExists`, TXID sync) crash with:
```
Cannot destructure property 'chain' ... as it is undefined
```

This suggests the SDK's internal copy of `NETWORK_CONFIG` doesn't have Sepolia config.

## Diagnostic Tests

### Test 1: Check if SDK and App Use Same NETWORK_CONFIG Instance

Run in browser console after app loads:

```javascript
// Get app's copy
const appConfig = RGV2.shared.NETWORK_CONFIG[RGV2.shared.NetworkName.EthereumSepolia];

// Try to get SDK's copy (if accessible)
const engine = RGV2.RG.getEngine?.();
const sdkConfig = engine?.networkConfigs?.get?.(RGV2.shared.NetworkName.EthereumSepolia);

console.log('=== SINGLETON TEST ===');
console.log('App config exists:', !!appConfig);
console.log('App config proxyContract:', appConfig?.proxyContract);
console.log('SDK config exists:', !!sdkConfig);
console.log('SDK config proxyContract:', sdkConfig?.proxyContract);

// CRITICAL: Check if same object reference
console.log('Same object reference:', appConfig === sdkConfig);

// If SDK config is undefined, that's the problem!
if (!sdkConfig) {
  console.error('❌ PROBLEM: SDK cannot see Sepolia config');
  console.log('SDK networkConfigs keys:', Array.from(engine?.networkConfigs?.keys() || []));
}
```

### Test 2: Test NetworkName-Based Function

```javascript
const networkName = RGV2.shared.NetworkName.EthereumSepolia;
const walletID = RGV2.walletID;

try {
  // This function reads by networkName - should fail if SDK has different copy
  const shields = await RGV2.RG.getShieldsForTXIDVersion?.(
    networkName,
    RGV2.SEPOLIA.txidVersion
  );
  console.log('✅ getShieldsForTXIDVersion works:', shields);
} catch (e) {
  console.error('❌ getShieldsForTXIDVersion failed:', e.message);
  console.error('   This confirms SDK has different NETWORK_CONFIG copy');
}
```

### Test 3: Check Webpack Bundle for Duplicates

In browser DevTools → Sources → webpack:// → node_modules

Search for `@railgun-community/shared-models` - there should be only ONE entry.

### Test 4: Verify Bootstrap Timing

Check console logs - should see in this order:
1. `✅ Railgun bootstrap: Sepolia config patched BEFORE SDK imports (V2 only)`
2. SDK initialization messages
3. `✅ Enhanced Sepolia network config (V2 only, bootstrap base + runtime enhancements)`

If order is wrong, bootstrap is running too late.

## Expected Results

✅ **If singleton works:**
- `appConfig === sdkConfig` is `true`
- `getShieldsForTXIDVersion` works without errors
- Only one webpack entry for `shared-models`

❌ **If singleton fails:**
- `appConfig !== sdkConfig` or `sdkConfig` is `undefined`
- `getShieldsForTXIDVersion` crashes with "chain is undefined"
- Multiple webpack entries for `shared-models`

## Next Steps Based on Results

### If Singleton Fails:
1. Add package manager resolution (npm overrides / yarn resolutions)
2. Verify webpack alias is working
3. Check if splitChunks is actually bundling correctly
4. Consider direct SDK patching as workaround

### If Singleton Works But Functions Still Fail:
1. Check if SDK caches NETWORK_CONFIG at module init
2. Patch SDK's internal copy directly after engine start
3. Check for lazy-loaded modules that import their own copy







