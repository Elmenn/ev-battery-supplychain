# Balance Functions & Helpers Reference

This document lists all functions and helpers in `railgunV2SepoliaClient.js` that are responsible for updating, calling, or syncing balances.

---

## 📋 **Core Balance Sync Functions**

### 1. `refreshBalances()` (SDK Function)
- **Location**: Called via `RG.refreshBalances(CHAIN, [walletID])`
- **Lines**: 342, 9171, 1772
- **Purpose**: Triggers SDK to refresh private balances by scanning merkletrees
- **Usage**:
  ```javascript
  await RG.refreshBalances(SEPOLIA.chain, [walletID]);
  ```
- **What it does**:
  - Triggers UTXO merkletree scan
  - Triggers TXID merkletree scan (may fail on Sepolia)
  - SDK automatically calls balance callbacks when scans update

### 2. `window.RGV2.refreshBalances()`
- **Location**: Line 9161-9211
- **Purpose**: Wrapper function that ensures scan callbacks are set before calling SDK's `refreshBalances`
- **Usage**:
  ```javascript
  await window.RGV2.refreshBalances();
  ```
- **Features**:
  - Verifies scan callbacks are available
  - Calls `setupScanCallbacks()` if needed
  - Handles Sepolia-specific TXID sync errors gracefully

---

## 🔄 **Sync Functions**

### 3. `syncTXIDTransactions({ network })`
- **Location**: Line ~3100-3200 (approximate, needs verification)
- **Purpose**: Manually sync TXID merkletree transactions for a network
- **What it does**:
  - Calls `RG.syncRailgunTransactionsV2(networkName)`
  - Captures TXID status before/after sync
  - Falls back to GraphQL sync if on-chain sync fails on Sepolia

### 4. `syncRailgunTransactionsV2(networkName)` (SDK Function)
- **Location**: Called internally by SDK
- **Lines**: 3644, 4218
- **Purpose**: SDK function to sync Railgun transactions from on-chain contracts
- **Signature**: `(networkName: NetworkName) => Promise<void>`
- **Note**: Fails silently on Sepolia if TXID contracts aren't deployed

### 5. `quickSyncRailgunTransactionsV2(chain, latestGraphID)` (SDK Function)
- **Location**: Called internally
- **Lines**: 4131, 4351
- **Purpose**: Fetches Railgun transactions from GraphQL subgraph
- **Signature**: `(chain, latestGraphID) => Promise<Transaction[]>`
- **Limitation**: Only fetches data; does NOT update TXID merkletree (requires on-chain contracts)

### 6. `waitForSync({ maxSeconds = 20 })`
- **Location**: Line 1781-1793
- **Purpose**: Waits for UTXO merkletree to be ready
- **Usage**:
  ```javascript
  await waitForSync({ maxSeconds: 30 });
  ```

---

## 📊 **Balance Callback Functions**

### 7. `balanceCallback(ev)` (Internal)
- **Location**: Line 189-316 (in `setupBalanceCallbacks()`), Line 1069-1146 (in `connectRailgun()`)
- **Purpose**: Callback function that receives balance update events from SDK
- **What it does**:
  - Receives `balanceBucket` events (Spendable, ShieldPending, etc.)
  - Parses token amounts from various field names (`tokenAmountsSerialized`, `erc20Amounts`, `tokenAmounts`)
  - Updates `window._balanceCache[walletID][bucket]` structure
  - Detects `ShieldPending` → `Spendable` transitions
- **Registration**:
  ```javascript
  RG.setOnBalanceUpdateCallback(CHAIN, balanceCallback);
  // OR (if chain-scoped not supported):
  RG.setOnBalanceUpdateCallback(balanceCallback);
  ```

### 8. `setupBalanceCallbacks()`
- **Location**: Line ~165-346
- **Purpose**: Sets up the balance update callback and initializes balance cache
- **What it does**:
  - Creates `balanceCallback` function
  - Registers callback with SDK (chain-scoped or global)
  - Initializes `window._balanceCache` as object structure
  - Calls initial `refreshBalances()` to populate cache

---

## 🌳 **Merkletree Scan Callbacks**

### 9. `setupScanCallbacks()`
- **Location**: Line 829-923
- **Purpose**: Sets up UTXO and TXID merkletree scan callbacks
- **What it does**:
  - Registers `utxoCallback` via `RG.setOnUTXOMerkletreeScanCallback()`
  - Registers `txidCallback` via `RG.setOnTXIDMerkletreeScanCallback()`
  - Sets global callbacks (no chain parameter) - required for `refreshBalances` to work
  - Detects TXID sync completion events
  - **CRITICAL**: Does NOT call `refreshBalances()` from callbacks (prevents infinite loop)

### 10. `utxoCallback(eventData)` (Internal)
- **Location**: Line 836-864
- **Purpose**: Callback for UTXO merkletree scan progress
- **What it does**:
  - Logs scan progress (0.0 to 1.0)
  - Sets timeout to prevent infinite hanging (2 minutes)
  - Clears timeout when scan completes
  - Does NOT trigger `refreshBalances()` (SDK handles balance updates automatically)

### 11. `txidCallback(eventData)` (Internal)
- **Location**: Line 876-923
- **Purpose**: Callback for TXID merkletree scan progress
- **What it does**:
  - Handles Sepolia gracefully (TXID sync may be incomplete)
  - Logs scan status (Incomplete, Complete, Error)
  - Detects and stores TXID sync completion events in `window.__RG_TXID_SYNC_COMPLETED__`
  - Does NOT trigger `refreshBalances()` from callback

---

## 💾 **Balance Cache Functions**

### 12. `getBalanceCache(walletIDParam = null, bucket = null)`
- **Location**: Line 2188-2222
- **Purpose**: **SINGLE SOURCE OF TRUTH** - Get unified balance cache (object structure)
- **Signature**: `(walletID?: string, bucket?: string) => object`
- **Usage**:
  ```javascript
  // Get all buckets for current wallet
  const cache = getBalanceCache();
  
  // Get specific bucket
  const spendable = getBalanceCache(null, 'Spendable');
  
  // Get for specific wallet
  const otherWallet = getBalanceCache('other-wallet-id');
  ```
- **Structure**: `{ [walletID]: { [bucket]: { [tokenKey]: tokenEntry } } }`
- **Features**:
  - Converts Map-based cache to object if needed (compatibility shim)
  - Returns specific wallet/bucket or full cache

### 13. `readBucketAmount(bucket, tokenAddr)`
- **Location**: Line 1816-1844
- **Purpose**: Helper to read token amount from a specific balance bucket
- **Signature**: `(bucket: string, tokenAddr: string) => bigint`
- **Usage**:
  ```javascript
  const pendingAmount = readBucketAmount('ShieldPending', SEPOLIA.WETH);
  ```
- **What it does**:
  - Tries multiple key formats (`tokenAddr.toLowerCase()`, `addr:${tokenAddr}`)
  - Scans cache values for embedded token addresses
  - Returns `BigInt` amount (or `0n` if not found)

### 14. `asBigInt(x)`
- **Location**: Line 1799-1814
- **Purpose**: Robust value extractor (handles all SDK value shapes)
- **Signature**: `(any) => bigint`
- **What it does**:
  - Handles string amounts, objects with `amountString`/`amount`, arrays of notes
  - Returns `0n` if value is null/undefined

### 15. `dumpBalanceCache()`
- **Location**: Line 2226-2238
- **Purpose**: Quick "what's in my cache?" helper for debugging
- **Usage**: Call from console
- **What it logs**:
  - Wallet ID
  - Available wallet keys
  - Bucket names
  - Sample keys from Spendable and ShieldPending buckets

### 16. `dumpBucket(bucket = 'ShieldPending')`
- **Location**: Line 2241-2247
- **Purpose**: Quick bucket inspector for debugging
- **Usage**:
  ```javascript
  dumpBucket('Spendable');
  ```
- **What it logs**:
  - All keys in the bucket
  - Sample entries (first 2)

### 17. `logBucketAmount(bucket, tokenAddr)`
- **Location**: Line 2250-2256
- **Purpose**: Helper to log bucket amount for debugging
- **Usage**:
  ```javascript
  logBucketAmount('ShieldPending', SEPOLIA.WETH);
  ```

### 18. `debugBalanceBuckets()`
- **Location**: Line 2268-2298
- **Purpose**: Debug all balance buckets directly from cache
- **Usage**: Call from console
- **What it logs**:
  - All buckets: Spendable, ShieldPending, ShieldBlocked, ProofSubmitted, MissingInternalPOI, MissingExternalPOI, Spent
  - Token count per bucket
  - Sample token addresses and amounts

---

## 💰 **Balance Retrieval Functions**

### 19. `getPrivateWETHBalances()`
- **Location**: Line 1846-1862
- **Purpose**: Get private WETH balances for current wallet
- **Signature**: `() => Promise<{ spendable: bigint, pending: bigint }>`
- **Usage**:
  ```javascript
  const { spendable, pending } = await getPrivateWETHBalances();
  ```
- **What it does**:
  - Reads `Spendable` bucket for WETH
  - Reads `ShieldPending` bucket for WETH
  - Returns both amounts as `BigInt`
- **Note**: On Sepolia, `Spendable` may be 0 if POI validation hasn't completed

---

## 🔍 **Diagnostic & Testing Functions**

### 20. `checkSpendables()`
- **Location**: Line ~2500-2600 (approximate, needs verification)
- **Purpose**: Check spendable UTXOs for a token
- **What it does**:
  - Calls `RG.getSpendableUTXOsForToken()` with multiple signature attempts
  - Tries to extract token address from various sources
  - Falls back to balance cache if SDK call fails

### 21. `diagnoseSepoliaSetup()`
- **Location**: Line ~3550-3850 (approximate, needs verification)
- **Purpose**: Diagnose Sepolia setup per official Railgun docs
- **What it checks**:
  - Official `NETWORK_CONFIG` usage
  - Scan callbacks setup
  - Balance callback setup
  - Provider loaded and working
  - Wallet loaded
- **Usage**:
  ```javascript
  await window.RGV2.diagnoseSepoliaSetup();
  ```

### 22. `diagnoseTXIDSyncFlow({ network })`
- **Location**: Line 4020-4800 (approximate)
- **Purpose**: Comprehensive diagnostic that traces TXID sync flow
- **What it does**:
  - Checks engine availability
  - Checks TXID merkletree existence
  - Checks current TXID status
  - Tests GraphQL sync capability
  - Tests on-chain sync capability
  - Compares engine-configured addresses with blockchain
  - Identifies exact failure point

### 23. `syncTXIDTransactions({ network })`
- **Location**: Line ~3100-3200 (approximate)
- **Purpose**: Manual TXID transaction sync with status tracking
- **What it does**:
  - Captures TXID status before sync
  - Calls `RG.syncRailgunTransactionsV2(networkName)`
  - Captures TXID status after sync
  - Compares `txidIndex` to detect progress
  - Falls back to GraphQL if on-chain sync fails on Sepolia

### 24. `checkCallbackEvents()`
- **Location**: Line ~3300-3400 (approximate, needs verification)
- **Purpose**: Review stored callback events (`window.__RG_TXID_SYNC_COMPLETED__`, `window.__RG_POI_VALIDATION_COMPLETED__`)
- **Usage**: Call from console to see what events were captured

---

## 🔧 **Helper Functions**

### 25. `getChainPinned()`
- **Location**: Line ~1590 (in shield functions)
- **Purpose**: Get consistent chain object reference
- **Returns**: `NETWORK_CONFIG[NetworkName.EthereumSepolia].chain`

### 26. `getRailgunAddress()`
- **Location**: Line ~1600 (in shield functions)
- **Purpose**: Get wallet's 0zk address
- **Returns**: Promise<string> (0zk address)

### 27. `setupBalanceCallbacks()` (in `connectRailgun`)
- **Location**: Line 1051-1146
- **Purpose**: Sets up balance callback during `connectRailgun`
- **What it does**:
  - Creates hardened `balanceCallback` with multiple field name support
  - Registers callback (chain-scoped or global)
  - Initializes `window._balanceCache` as object structure

---

## 🎯 **Balance Bucket Types**

The SDK uses these balance bucket types:
- `Spendable`: Funds ready to spend (POI validation complete)
- `ShieldPending`: Funds waiting for POI validation
- `ShieldBlocked`: Funds blocked (validation failed)
- `ProofSubmitted`: Proof submitted but not yet validated
- `MissingInternalPOI`: Missing internal POI proof
- `MissingExternalPOI`: Missing external POI proof
- `Spent`: Funds that have been spent

---

## 📝 **Balance Cache Structure**

```javascript
window._balanceCache = {
  [walletID]: {
    [balanceBucket]: {
      [tokenKey]: tokenEntry
    }
  }
}
```

**Example**:
```javascript
{
  "0d87e894...": {
    "Spendable": {
      "0xfff9976782d46cc05630d1f6ebab18b2324d6b14": {
        tokenType: 0,
        tokenAddress: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14",
        amountString: "1000000000000000000",
        // ... other fields
      }
    },
    "ShieldPending": { /* ... */ }
  }
}
```

---

## 🔄 **Balance Update Flow**

1. **Trigger**: `refreshBalances(CHAIN, [walletID])` called
2. **Scan**: SDK scans UTXO merkletree → `utxoCallback` fires
3. **Scan**: SDK scans TXID merkletree → `txidCallback` fires (may be incomplete on Sepolia)
4. **Update**: SDK processes scan results and calls `balanceCallback` for each bucket update
5. **Cache**: `balanceCallback` updates `window._balanceCache[walletID][bucket]`
6. **UI**: Components read from `getBalanceCache()` or `window._balanceCache`

---

## ⚠️ **Important Notes**

1. **Scan callbacks must be GLOBAL** (no chain parameter) for `refreshBalances` to find them
2. **Do NOT call `refreshBalances()` from scan callbacks** - causes infinite loop
3. **Balance updates are automatic** - SDK calls `balanceCallback` when scans update
4. **Use `getBalanceCache()` as single source of truth** - don't wire your own callbacks
5. **On Sepolia**, TXID sync may be incomplete - UTXO sync is sufficient for balances
6. **Balance cache is object structure**, not Map (for compatibility with both modules)

---

## 🚀 **Quick Reference**

### Check balances:
```javascript
const cache = window.RGV2.getBalanceCache();
const spendable = window.RGV2.readBucketAmount('Spendable', window.RGV2.NETWORK.WETH_SEPOLIA);
```

### Refresh balances:
```javascript
await window.RGV2.refreshBalances();
```

### Debug balances:
```javascript
window.RGV2.debugBalanceBuckets();
window.RGV2.dumpBalanceCache();
window.RGV2.dumpBucket('ShieldPending');
```

### Wait for sync:
```javascript
await window.RGV2.waitForSync({ maxSeconds: 30 });
```

---

## 📚 **Exported Functions (window.RGV2)**

All balance-related functions are exported in the `window.RGV2` object:
- `refreshBalances()` - Main refresh function
- `getBalanceCache()` - Read cache
- `getPrivateWETHBalances()` - Get WETH balances
- `waitForSync()` - Wait for sync
- `debugBalanceBuckets()` - Debug helper
- `dumpBalanceCache()` - Debug helper
- `dumpBucket()` - Debug helper
- `testScanCallbacks()` - Test scan callback setup







