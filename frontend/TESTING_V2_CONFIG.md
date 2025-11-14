# Testing V2-Only Configuration

## Quick Test Checklist

### 1. **Start the App** ✅
```bash
cd frontend
npm start
```

### 2. **Check Browser Console for Errors**
Open DevTools (F12) and look for:
- ❌ **NO** ENS errors (`UNCONFIGURED_NAME`)
- ❌ **NO** "Cannot read properties of undefined" errors
- ✅ Bootstrap message: `✅ Railgun bootstrap: Sepolia config patched BEFORE SDK imports (V2 only)`
- ✅ Enhancement message: `✅ Enhanced Sepolia network config (V2 only, bootstrap base + runtime enhancements)`

### 3. **Verify NETWORK_CONFIG in Console**
```javascript
// Run in browser console:
console.log('NETWORK_CONFIG[Sepolia]:', RGV2.shared.NETWORK_CONFIG[RGV2.shared.NetworkName.EthereumSepolia]);
```

**Expected:**
```javascript
{
  chain: { type: 0, id: 11155111 },
  name: "Ethereum_Sepolia",
  proxyContract: "0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea",
  shieldContracts: {
    V2_PoseidonMerkle: {
      railgunShield: "0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea"
    }
  },
  poi: {
    launchBlock: 5944700,
    gatewayUrls: ["https://ppoi-agg.horsewithsixlegs.xyz"],
    aggregatorURLs: ["https://ppoi-agg.horsewithsixlegs.xyz"]
  },
  // NO V3 contract addresses should exist
}
```

**Check for V3 (should NOT exist):**
```javascript
const cfg = RGV2.shared.NETWORK_CONFIG[RGV2.shared.NetworkName.EthereumSepolia];
console.log('V3 contracts:', {
  accumulator: cfg.poseidonMerkleAccumulatorV3Contract,  // Should be undefined
  verifier: cfg.poseidonMerkleVerifierV3Contract,         // Should be undefined
  tokenVault: cfg.tokenVaultV3Contract,                   // Should be undefined
});
// All should be undefined
```

### 4. **Test Engine Initialization**
```javascript
// Run in browser console:
await RGV2.initEngine({ rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com' });
```

**Expected:** No errors, engine should start successfully

### 5. **Diagnostic: Full Setup Check**
```javascript
// Run comprehensive diagnostic:
await RGV2.diagnoseSepoliaSetup();
```

**Expected output:**
- ✅ Using official NETWORK_CONFIG
- ✅ Scan callbacks set
- ✅ Balance callback set
- ✅ Provider loaded
- ✅ Wallet loaded (if connected)

### 6. **Test Shielding (if wallet connected)**
```javascript
// A) Check wallet connection
console.log('Wallet ID:', RGV2.walletID);
console.log('Railgun Address:', RGV2.railgunAddress);

// B) Test gas estimation (small amount)
await RGV2.estimateShieldWETH(0.001);

// C) If successful, test actual shield
await RGV2.shieldWETH(0.001);
```

**Expected:** No ENS errors, no "map of undefined" errors

### 7. **Check Balance Buckets**
```javascript
// After shielding, refresh balances
await RGV2.refreshBalances();

// Check balance cache
const cache = RGV2.getBalanceCache();
console.log('Balance buckets:', Object.keys(cache || {}));

// Check specific buckets
for (const bucket of ['ShieldPending', 'Spendable', 'MissingInternalPOI', 'MissingExternalPOI']) {
  const tokens = RGV2.getBalanceCache(null, bucket);
  console.log(`${bucket}:`, tokens?.length || 0, 'tokens');
}
```

**Expected:**
- ShieldPending: > 0 after shielding
- Other buckets may be populated based on POI status

### 8. **Test SDK Functions (No Errors)**
```javascript
// Test functions that read by networkName (previously failed):
const txidVersion = RGV2.SEPOLIA.txidVersion;
const networkName = RGV2.SEPOLIA.networkName;
const walletID = RGV2.walletID;

// These should NOT throw "undefined" errors:
try {
  const balances = await RGV2.RG.getSerializedERC20Balances(
    networkName,
    walletID,
    [RGV2.SEPOLIA.WETH]
  );
  console.log('✅ getSerializedERC20Balances works:', balances);
} catch (e) {
  console.error('❌ getSerializedERC20Balances failed:', e.message);
}
```

### 9. **Check for ENS Errors in Network Tab**
1. Open DevTools → Network tab
2. Filter by "Failed" requests
3. Look for errors related to empty contract addresses or ENS resolution

**Expected:** No failed ENS resolution requests

### 10. **Verify Singleton Behavior**
```javascript
// Check if SDK and app use same NETWORK_CONFIG instance:
const appConfig = RGV2.shared.NETWORK_CONFIG[RGV2.shared.NetworkName.EthereumSepolia];
const sdkRead = await RGV2.RG.getEngine?.()?.networkConfigs?.get?.(RGV2.shared.NetworkName.EthereumSepolia);

console.log('App config proxyContract:', appConfig?.proxyContract);
console.log('SDK config proxyContract:', sdkRead?.proxyContract);

// They should match (same object reference if singleton works)
console.log('Same instance:', appConfig === sdkRead);
```

## Troubleshooting

### If you see ENS errors:
1. **Check console for empty string contract addresses:**
   ```javascript
   const cfg = RGV2.shared.NETWORK_CONFIG[RGV2.shared.NetworkName.EthereumSepolia];
   // Check all contract address fields
   console.log('All addresses:', {
     proxy: cfg.proxyContract,
     shield: cfg.shieldContracts?.V2_PoseidonMerkle?.railgunShield,
     v3acc: cfg.poseidonMerkleAccumulatorV3Contract?.address,
     v3ver: cfg.poseidonMerkleVerifierV3Contract?.address,
     v3vault: cfg.tokenVaultV3Contract?.address,
   });
   // Any should NOT be empty strings ""
   ```

2. **Force reload and check import order:**
   - Hard refresh (Ctrl+Shift+R)
   - Check console for bootstrap message FIRST
   - Then check for enhancement message

### If NETWORK_CONFIG is undefined:
1. **Check import order in index.js:**
   ```javascript
   // Should be:
   // 1. setup-rgv2-only.js
   // 2. railgun-bootstrap.js
   // 3. railgunV2SepoliaClient.js
   ```

2. **Check webpack singleton:**
   - Verify `config-overrides.js` has `splitChunks` for `@railgun-community/shared-models`
   - Restart dev server after webpack changes

## Success Criteria

✅ **No ENS errors** in console or network tab  
✅ **NETWORK_CONFIG[Sepolia] exists** and has all V2 fields  
✅ **No V3 contract addresses** in config  
✅ **SDK functions work** without "undefined" errors  
✅ **Shielding works** without errors  
✅ **Balance buckets populate** after shielding







