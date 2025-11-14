# TXID Sync Investigation - Key Findings

## 🔍 **Root Cause Analysis**

After investigating the SDK source code, here's what we found:

### **The Flow (from engine source)**

1. `syncRailgunTransactionsV2(networkName)` → calls engine
2. `engine.performSyncRailgunTransactionsV2(chain, trigger)`
   - Calls `quickSyncRailgunTransactionsV2(chain, latestGraphID)` ✅ **Fetches from GraphQL**
   - Then calls `handleNewRailgunTransactionsV2(...)`
3. `handleNewRailgunTransactionsV2()`:
   - Calls `getLatestValidatedTxidIndex(txidVersion, chain)` ← **FAILS HERE**
   - If `undefined`, `shouldAddNewRailgunTransactions` returns `true` (allows adding)
   - If throws, entire sync fails silently
4. `txidMerkletree.queueRailgunTransactions(toQueue, latestValidatedTxidIndex)`

### **Critical Discovery**

**File**: `engine/dist/railgun-engine.js` (lines 549-556)

```javascript
async getLatestValidatedTxidIndex(txidVersion, chain) {
  if (this.isPOINode) {
    return undefined;  // ← POI nodes bypass validation!
  }
  const { txidIndex } = await this.getLatestValidatedRailgunTxid(txidVersion, chain);
  return latestValidatedTxidIndex;
}
```

**File**: `engine/dist/railgun-engine.js` (lines 541-548)

```javascript
async shouldAddNewRailgunTransactions(txidVersion, chain, latestValidatedTxidIndex) {
  if (!isDefined(latestValidatedTxidIndex)) {
    return true;  // ← If undefined, ALLOWS adding transactions!
  }
  // ... otherwise checks if ahead
}
```

### **The Problem**

**File**: `wallet/dist/services/poi/poi-node-request.js` (lines 69-88)

When `getLatestValidatedRailgunTxid` is called:
1. It calls `attemptRequestWithFallbacks()` which tries all POI node URLs
2. **If all POI nodes fail, it THROWS an error** (line 77)
3. This exception propagates up to `handleNewRailgunTransactionsV2` (line 623)
4. **No try-catch** around `getLatestValidatedTxidIndex` in `handleNewRailgunTransactionsV2`
5. Exception bubbles to `performSyncRailgunTransactionsV2` catch block (line 609)
6. Error is logged but sync marked as "Incomplete" - **transactions never added!**

### **Why It Fails on Sepolia**

1. POI node requests for `getLatestValidatedRailgunTxid` likely fail (network not fully configured in POI node)
2. Exception is thrown instead of returning `undefined`
3. Exception prevents `shouldAddNewRailgunTransactions` from ever being checked
4. Transactions fetched from GraphQL are never queued to the merkletree

## ✅ **Solution Approaches**

### **Option 1: Wrap getLatestValidatedTxidIndex with Try-Catch** (RECOMMENDED)

**Location**: `engine/dist/railgun-engine.js` line 623

**Fix**: Modify `handleNewRailgunTransactionsV2` to catch errors from `getLatestValidatedTxidIndex`:

```javascript
async handleNewRailgunTransactionsV2(...) {
  let latestValidatedTxidIndex;
  try {
    latestValidatedTxidIndex = await this.getLatestValidatedTxidIndex(txidVersion, chain);
  } catch (error) {
    // If POI node fails, treat as undefined (allows adding transactions)
    debugger.log(`Failed to get validated TXID index, proceeding without validation: ${error.message}`);
    latestValidatedTxidIndex = undefined;
  }
  
  const shouldAddNewRailgunTransactions = await this.shouldAddNewRailgunTransactions(...);
  // ... rest of function
}
```

**Challenge**: This requires modifying the SDK source, which would need to be:
- Forked or
- Patched at runtime (risky) or
- Requested as a PR to the SDK

### **Option 2: Ensure POI Node Returns Valid Data**

If POI node can successfully return `{ txidIndex: 0, merkleroot: '...' }` (even if tree is empty), then:
1. `getLatestValidatedTxidIndex` returns a valid number (not undefined)
2. `shouldAddNewRailgunTransactions` checks if we're ahead
3. If local tree is at -1 and validated is 0, it allows adding

**Requires**: POI node properly configured for Sepolia

### **Option 3: Run Engine in POI Node Mode**

**File**: `engine/dist/railgun-engine.js` (line 550-552)

If `this.isPOINode = true`, `getLatestValidatedTxidIndex` returns `undefined` immediately, bypassing all POI node requests!

**How to enable**: Pass `isPOINode: true` when initializing the engine.

**Location**: Check where `RailgunEngine.initForWallet` or `RailgunEngine.initForPOINode` is called.

**Challenge**: May affect other engine behavior - needs testing.

### **Option 4: Fix POI Node Configuration**

Ensure POI node at `https://ppoi-agg.horsewithsixlegs.xyz`:
1. Has Sepolia network configured
2. Can handle `ValidatedTXID` RPC requests for Sepolia
3. Returns valid responses instead of errors

## 🎯 **Immediate Action Items**

1. **Test POI Node Response**:
   ```javascript
   const engine = RG.getEngine();
   const poiRequester = engine.getLatestValidatedRailgunTxid;
   try {
     const result = await poiRequester(TXIDVersion.V2_PoseidonMerkle, { type: 0, id: 11155111 });
     console.log('POI node response:', result);
   } catch (error) {
     console.log('POI node error:', error.message);
   }
   ```

2. **Check if isPOINode flag exists**:
   ```javascript
   const engine = RG.getEngine();
   console.log('Is POI Node?', engine.isPOINode);
   ```

3. **Try GraphQL fetch manually**:
   ```javascript
   const txs = await RG.quickSyncRailgunTransactionsV2({ type: 0, id: 11155111 }, null);
   console.log('Fetched transactions:', txs.length);
   ```

## 📊 **Verification Checklist**

After implementing fix:
- [ ] `getLatestRailgunTxidData(V2, Sepolia).txidIndex >= 0`
- [ ] `validateRailgunTxidExists(V2, Sepolia, '0x35d98f0b...f87a') === true`
- [ ] `getSpendableUTXOsForToken(Sepolia, wid, WETH)` returns notes
- [ ] TXID tree `treeLengths[0] > 0`

## 🔗 **Key Files Referenced**

- `frontend/node_modules/@railgun-community/engine/dist/railgun-engine.js`
  - Line 549-556: `getLatestValidatedTxidIndex`
  - Line 541-548: `shouldAddNewRailgunTransactions`
  - Line 622-750: `handleNewRailgunTransactionsV2`
  - Line 557-621: `performSyncRailgunTransactionsV2`

- `frontend/node_modules/@railgun-community/wallet/dist/services/poi/poi-node-request.js`
  - Line 69-88: `attemptRequestWithFallbacks` (throws on failure)
  - Line 101-109: `getLatestValidatedRailgunTxid`

- `frontend/node_modules/@railgun-community/wallet/dist/services/railgun/railgun-txids/railgun-txid-sync-graph-v2.js`
  - Line 12-33: `txsSubgraphSourceNameForNetwork` (includes Sepolia!)




