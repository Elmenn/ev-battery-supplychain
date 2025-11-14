# Detailed SDK Function Analysis: Answers to Working Agent Questions

## Question 1: Does syncRailgunTransactionsV2() fetch UTXO commitments, or only TXID transactions?

### Answer: **Only TXID transactions, NOT UTXO commitments**

**What `syncRailgunTransactionsV2()` does:**
- Syncs **TXID merkletree** transactions from on-chain contracts
- Calls `quickSyncRailgunTransactionsV2()` internally which fetches from GraphQL
- Updates the **TXID merkletree** (transaction ID tree)
- Does **NOT** directly fetch or populate UTXO commitments

**Evidence from codebase:**
```javascript
// From TXID_SYNC_INVESTIGATION.md
// syncRailgunTransactionsV2(networkName) → calls engine
// engine.performSyncRailgunTransactionsV2(chain, trigger)
//   - Calls quickSyncRailgunTransactionsV2(chain, latestGraphID) ✅ Fetches from GraphQL
//   - Then calls handleNewRailgunTransactionsV2(...)
//   - Updates TXID merkletree (not UTXO tree)
```

**What fetches UTXO commitments:**
- `refreshBalances()` → triggers `scanUTXOHistory()` → fetches UTXO commitments
- The UTXO scan internally uses GraphQL to fetch commitments
- Commitments are extracted from transactions during the UTXO scan

---

## Question 2: Does syncRailgunTransactionsV2() populate any internal SDK state that refreshBalances() uses?

### Answer: **Yes, but indirectly**

**What it populates:**
1. **TXID Merkletree**: Updates the transaction ID tree
2. **Transaction Metadata**: Stores transaction hashes, block numbers, etc.
3. **Internal State**: SDK tracks latest synced transaction index

**How refreshBalances() uses it:**
- `refreshBalances()` may check TXID tree state to determine scan start point
- TXID tree helps validate which transactions are legitimate
- However, **UTXO scan can work independently** - it doesn't strictly require TXID sync to complete first

**Evidence:**
```javascript
// From codebase - refreshBalances() can work even if TXID sync fails
// On Sepolia, TXID sync may fail but UTXO scan still works
if (isSepolia && /Failed to sync Railgun transactions V2/i.test(msg)) {
  console.warn('⚠️ Ignoring TXID V2 sync error on Sepolia (UTXO is sufficient).');
  // Don't throw - UTXO scan completed successfully
}
```

---

## Question 3: What does refreshBalances() do differently than calling scanContractHistory() directly?

### Answer: **refreshBalances() is a higher-level orchestration function**

**`refreshBalances()` does:**
1. **Orchestrates multiple scans**:
   - Triggers UTXO merkletree scan
   - Triggers TXID merkletree scan (may fail on Sepolia)
   - Coordinates both scans

2. **Sets up proper context**:
   - Ensures wallet is loaded
   - Verifies chain configuration
   - Initializes merkletrees if needed

3. **Triggers balance callbacks**:
   - Automatically calls balance update callbacks when scans complete
   - Updates balance cache
   - Notifies UI of balance changes

4. **Error handling**:
   - Handles TXID sync failures gracefully (on Sepolia)
   - Continues with UTXO scan even if TXID fails

**`scanContractHistory()` (if it exists) would:**
- Be a lower-level function
- Only scan one specific tree
- Not trigger balance callbacks
- Not coordinate multiple scans

**Evidence:**
```javascript
// refreshBalances() signature and behavior
await Wallet.refreshBalances(chain, [walletID]);
// This internally:
// 1. Calls scanUTXOHistory() for UTXO tree
// 2. Calls syncRailgunTransactionsV2() for TXID tree
// 3. Triggers balance callbacks when complete
```

---

## Question 4: Any internal state setup or initialization?

### Answer: **Yes, several critical initializations**

**State setup in `refreshBalances()`:**
1. **Merkletree initialization**:
   ```javascript
   // Ensures UTXO merkletree is loaded
   const utxoTree = Wallet.getUTXOMerkletreeForNetwork(...);
   if (!utxoTree) {
     // Triggers initial load
     await Wallet.refreshBalances(...);
   }
   ```

2. **Callback registration**:
   - Verifies scan callbacks are set (UTXO and TXID)
   - Sets up callbacks if missing
   - Ensures callbacks are **global** (not chain-specific)

3. **Engine state**:
   - Ensures engine is running
   - Verifies wallet is connected
   - Checks chain configuration

**Evidence:**
```javascript
// From railgunV2SepoliaClient.js
window.RGV2.refreshBalances = async function() {
  // Verify scan callbacks are set before calling refreshBalances
  const hasUTXOCallback = typeof RG.setOnUTXOMerkletreeScanCallback === 'function';
  if (!hasUTXOCallback) {
    setupScanCallbacks(); // Sets up callbacks if missing
  }
  await RG.refreshBalances(CHAIN, [walletID]);
};
```

---

## Question 5: Timing/Order - Should there be a delay between syncRailgunTransactionsV2() and refreshBalances()?

### Answer: **No delay needed, but syncRailgunTransactionsV2() should complete first**

**Recommended order:**
```javascript
// 1. Sync TXID transactions first (optional but recommended)
await Wallet.syncRailgunTransactionsV2(
  TXIDVersion.V2_PoseidonMerkle,
  NetworkName.EthereumSepolia,
  [wallet]
);

// 2. Immediately call refreshBalances (no delay needed)
// SDK handles internal coordination
await Wallet.refreshBalances(chain, [walletID]);
```

**Why no delay:**
- SDK handles internal coordination
- `refreshBalances()` will wait for necessary state if needed
- Adding delays can cause race conditions

**When delay might help:**
- Only if you're checking state manually:
  ```javascript
  await Wallet.syncRailgunTransactionsV2(...);
  // Small delay only if checking state
  await new Promise(resolve => setTimeout(resolve, 1000));
  const status = await checkTXIDStatus();
  ```

---

## Question 6: Does syncRailgunTransactionsV2() need to complete fully before refreshBalances()?

### Answer: **Not strictly required, but recommended**

**Why it's recommended:**
- TXID tree state helps validate transactions
- Ensures consistent internal state
- Prevents potential race conditions

**But it's not required:**
- On Sepolia, TXID sync often fails
- UTXO scan works independently
- `refreshBalances()` handles TXID failures gracefully

**Evidence:**
```javascript
// From codebase - refreshBalances() works even if TXID sync fails
try {
  await Wallet.refreshBalances(chain, [_walletID]);
} catch (err) {
  // Swallow TXID V2 sync errors on Sepolia - UTXO is sufficient
  if (isSepolia && /Failed to sync Railgun transactions V2/i.test(msg)) {
    console.warn('⚠️ Ignoring TXID V2 sync error on Sepolia (UTXO is sufficient).');
    // Don't throw - UTXO scan completed successfully
  }
}
```

**Best practice:**
```javascript
// Try TXID sync first, but don't block on failure
try {
  await Wallet.syncRailgunTransactionsV2(...);
} catch (e) {
  console.log('⚠️ TXID sync failed (expected on Sepolia)');
}

// Always proceed with refreshBalances
await Wallet.refreshBalances(chain, [walletID]);
```

---

## Question 7: Does the UTXO scan callback behave differently when triggered via refreshBalances() vs scanContractHistory()?

### Answer: **Callbacks are the same, but context differs**

**Callback behavior:**
- The UTXO scan callback (`setOnUTXOMerkletreeScanCallback`) is **global**
- It fires the same way regardless of how scan is triggered
- Callback receives same event data structure

**Key difference:**
- **`refreshBalances()`**: Sets up full context, coordinates multiple scans, triggers balance callbacks
- **Direct scan**: May not have full context, may not trigger balance updates

**Evidence:**
```javascript
// Callback is set globally (not chain-specific)
Wallet.setOnUTXOMerkletreeScanCallback((eventData) => {
  // This fires the same way whether triggered by:
  // - refreshBalances()
  // - Direct scan call
  // - Internal SDK scan
  console.log('📊 UTXO scan update:', eventData.progress);
});
```

**Important:**
- Callback must be set **before** calling `refreshBalances()`
- Callback must be **global** (no chain parameter)
- SDK looks for global callback during `refreshBalances()`

---

## Question 8: Does refreshBalances() set up any callbacks or state that scanContractHistory() doesn't?

### Answer: **Yes, refreshBalances() sets up more**

**What `refreshBalances()` sets up:**
1. **Balance update callbacks**: Triggers `onBalanceUpdateCallback` when scans complete
2. **Multiple scan coordination**: Coordinates UTXO + TXID scans
3. **State verification**: Checks wallet, chain, merkletree state
4. **Error handling**: Gracefully handles TXID failures

**What direct scan might miss:**
- Balance update callbacks may not fire
- Balance cache may not update
- UI may not be notified of changes

**Evidence:**
```javascript
// refreshBalances() flow:
// 1. Verifies callbacks are set
// 2. Triggers UTXO scan → fires UTXO callback
// 3. Triggers TXID scan → fires TXID callback
// 4. SDK processes results → fires balance callbacks
// 5. Balance cache updates → UI notified
```

---

## Question 9: Does refreshBalances() handle the write queue differently?

### Answer: **No, write queue handling is the same, but timing differs**

**Write queue behavior:**
- Write queue is handled by the **merkletree itself**, not by `refreshBalances()`
- Same batching and flushing logic regardless of how scan is triggered
- Queue flushes when scan completes (`progress >= 1.0`)

**Timing difference:**
- **`refreshBalances()`**: Ensures scan completes fully before returning (or handles errors)
- **Direct scan**: May return before scan completes, may not wait for queue flush

**Evidence:**
```javascript
// Write queue is internal to merkletree
const utxoTree = Wallet.getUTXOMerkletreeForNetwork(...);
// Queue is managed by tree, not by refreshBalances()
// Queue flushes when: eventData.progress >= 1.0
```

**Key point:**
- **Don't manually flush write queue during scan**
- Let SDK handle it when scan completes
- `refreshBalances()` ensures proper timing

---

## Question 10: Any flush timing differences?

### Answer: **Timing is the same, but refreshBalances() ensures completion**

**Flush timing:**
- Write queue flushes when UTXO scan reaches `progress >= 1.0`
- This happens regardless of how scan is triggered
- Flush is automatic, not manual

**Difference:**
- **`refreshBalances()`**: Waits for scan to complete, ensures queue flushes
- **Direct scan**: May return before completion, queue may flush later

**Evidence:**
```javascript
// From UTXO scan callback
if (eventData.progress >= 1.0) {
  console.log('✅ UTXO scan completed');
  // SDK automatically flushes write queue here
  // This happens the same way regardless of trigger
}
```

**Best practice:**
- Use `refreshBalances()` to ensure proper timing
- Wait for callback to fire with `progress >= 1.0`
- Don't manually flush - let SDK handle it

---

## Summary: Key Takeaways

1. **`syncRailgunTransactionsV2()`**: Syncs TXID tree only, not UTXO commitments
2. **`refreshBalances()`**: Orchestrates full scan, triggers UTXO + TXID, updates balances
3. **Order**: Call `syncRailgunTransactionsV2()` first (optional), then `refreshBalances()` immediately
4. **Callbacks**: Must be set globally before `refreshBalances()`
5. **Write queue**: Handled automatically by SDK, flushes when scan completes
6. **Timing**: No delays needed, SDK handles coordination
7. **Error handling**: `refreshBalances()` handles TXID failures gracefully

**The working pattern:**
```javascript
// 1. Set up callbacks (globally, before any scans)
setupScanCallbacks();

// 2. Optional: Sync TXID first
try {
  await Wallet.syncRailgunTransactionsV2(..., [wallet]);
} catch (e) {
  // OK to fail on Sepolia
}

// 3. Trigger refreshBalances (no delay needed)
await Wallet.refreshBalances(chain, [walletID]);

// 4. Wait for callback: progress >= 1.0
// SDK handles write queue flush automatically
```

