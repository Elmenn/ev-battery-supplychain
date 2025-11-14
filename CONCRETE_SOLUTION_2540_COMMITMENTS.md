# Concrete Solution: How to Get All 2540 Commitments Stored

## Database (IndexedDB) Behavior

### Database Initialization

**Database Name**: `engine.db` (IndexedDB, accessed via LevelDB wrapper)

**When Scan Starts**:
- **Database is NOT automatically cleared** - it persists across browser sessions
- If you've run scans before, the database may already contain commitments
- The SDK **appends/updates** data, it doesn't clear it first
- If you want a fresh start, you must manually clear the database

### Database Write Process

1. **SDK Initializes Database** (when engine starts):
   ```javascript
   const db = new LevelDB('engine.db');
   await RG.startRailgunEngine(..., db, ...);
   ```

2. **During Scan**:
   - SDK fetches commitments from GraphQL
   - Processes them via `commitmentListener` callback
   - **Batches writes** into a write queue
   - Writes are **appended/updated** (not replacing existing data)

3. **Write Queue Flushing**:
   - SDK maintains an internal write queue
   - Writes are batched for performance
   - Queue is flushed when scan completes (`progress >= 1.0`)
   - **Don't manually flush during scan** - let SDK handle it

### Clearing Database (If Needed)

If you want to start fresh (empty database):

```javascript
// Option 1: Clear IndexedDB database
async function clearDatabase() {
  // Delete the engine.db database
  const deleteRequest = indexedDB.deleteDatabase('engine.db');
  await new Promise((resolve, reject) => {
    deleteRequest.onsuccess = () => resolve();
    deleteRequest.onerror = () => reject(deleteRequest.error);
  });
  
  // Or use LevelDB wrapper
  const db = new LevelDB('engine.db');
  await new Promise((resolve, reject) => {
    db.clear((err) => err ? reject(err) : resolve());
  });
}

// Option 2: Use SDK reset functions
await Wallet.resetFullTXIDMerkletreesV2(...);
await Wallet.fullResetTXIDMerkletreesV2(...);
```

**Important**: 
- Clearing database is **optional** - SDK can append to existing data
- If you clear, you'll need to rescan everything
- If you don't clear, SDK will update existing commitments and add new ones

## What Works in This Repo (2540 commitments stored)

### Key Success Factors

1. **Let SDK Complete Its Natural Flow**
   - Don't interrupt the scan process
   - Don't call `refreshBalances()` multiple times while scanning
   - Wait for `progress >= 1.0` in the UTXO scan callback

2. **Proper Callback Setup**
   - Set UTXO scan callback **globally** (not chain-specific)
   - Wait for scan to complete naturally
   - Don't trigger another refresh when scan completes

3. **No Manual Write Queue Flushing**
   - The SDK handles write queue internally
   - Don't manually flush during scan
   - Let the SDK complete its batch writes

## The Working Code Pattern

### 1. Set Up UTXO Scan Callback (CRITICAL)

```javascript
// Set as GLOBAL callback (no chain parameter) - required for refreshBalances to work
if (typeof Wallet.setOnUTXOMerkletreeScanCallback === 'function') {
  const utxoCallback = (eventData) => {
    console.log('📊 UTXO scan update:', eventData.progress, eventData.scanStatus);
    
    // If UTXO scan completes, just log - DON'T trigger another refresh
    if (eventData.progress >= 1.0) {
      console.log('✅ UTXO scan completed');
      // NOTE: Do NOT call refreshBalances here - it triggers another scan
      // The SDK handles write queue flushing internally when scan completes
    }
  };
  
  // Set the callback globally (required for SDK to find it during refreshBalances)
  Wallet.setOnUTXOMerkletreeScanCallback(utxoCallback);
  console.log('✅ UTXO scan callback registered (global)');
}
```

### 2. Initialize and Trigger Scan

```javascript
async function initializeUTXOHistory() {
  // Step 1: Ensure engine is running
  await ensureEngineRunning();
  
  // Step 2: Get wallet
  const wallet = await Wallet.walletForID(walletID);
  
  // Step 3: Trigger sync (this fetches from GraphQL and processes)
  await Wallet.syncRailgunTransactionsV2(
    TXIDVersion.V2_PoseidonMerkle,
    NetworkName.EthereumSepolia,
    [wallet]
  );
  
  // Step 4: Trigger refreshBalances (this scans UTXO history)
  const chain = { type: 0, id: 11155111 }; // Sepolia
  await Wallet.refreshBalances(chain, [walletID]);
  
  // Step 5: WAIT - Don't interrupt the scan
  // The SDK will:
  //   - Fetch 2540 commitments from GraphQL
  //   - Process them via commitmentListener
  //   - Batch write them to IndexedDB
  //   - Flush write queue when scan completes
  //   - Call callback with progress = 1.0
  
  console.log('⏳ Waiting for UTXO scan to complete...');
  // Don't do anything else - let the SDK work
}
```

### 3. Wait for Scan to Complete

```javascript
// In your callback, wait for progress = 1.0
// Then verify storage:

async function verifyStorage() {
  const utxoTree = Wallet.getUTXOMerkletreeForNetwork(
    TXIDVersion.V2_PoseidonMerkle,
    NetworkName.EthereumSepolia
  );
  
  const treeLengths = utxoTree.treeLengths || [];
  const totalStored = treeLengths.reduce((sum, len) => sum + len, 0);
  
  console.log(`📊 Stored: ${totalStored} commitments`);
  
  if (totalStored >= 2540) {
    console.log('✅ SUCCESS! All commitments stored');
  } else {
    console.log(`⚠️ Missing ${2540 - totalStored} commitments`);
  }
}
```

## What NOT to Do (Causes 1176 instead of 2540)

### ❌ DON'T: Interrupt the Scan

```javascript
// BAD - This interrupts the scan
await Wallet.refreshBalances(chain, [walletID]);
await new Promise(resolve => setTimeout(resolve, 1000)); // Too short!
await Wallet.refreshBalances(chain, [walletID]); // Interrupts first scan!
```

### ❌ DON'T: Manually Flush Write Queue During Scan

```javascript
// BAD - This can cause partial writes
await Wallet.refreshBalances(chain, [walletID]);
// ... scan in progress ...
await utxoTree.updateTreesFromWriteQueue(); // Interrupts batch processing!
```

### ❌ DON'T: Call refreshBalances in Callback

```javascript
// BAD - This causes infinite loop and interrupts writes
if (eventData.progress >= 1.0) {
  await Wallet.refreshBalances(chain, [walletID]); // Triggers another scan!
}
```

### ❌ DON'T: Use Chain-Specific Callback

```javascript
// BAD - SDK won't find this during refreshBalances
Wallet.setOnUTXOMerkletreeScanCallback(chain, callback); // Wrong!
```

## Complete Working Implementation

### Step-by-Step with Database Context

```javascript
// 0. OPTIONAL: Clear database if you want fresh start
async function initializeFresh() {
  // Only if you want to start from scratch
  await clearDatabase(); // See clearDatabase() function above
  console.log('🗑️ Database cleared - will start fresh scan');
}

// 1. Set up callback ONCE (before any scans)
function setupUTXOCallback() {
  if (typeof Wallet.setOnUTXOMerkletreeScanCallback === 'function') {
    let scanComplete = false;
    
    const utxoCallback = (eventData) => {
      console.log('📊 UTXO scan:', eventData.progress, eventData.scanStatus);
      
      if (eventData.progress >= 1.0) {
        console.log('✅ UTXO scan completed');
        scanComplete = true;
        // SDK has already flushed write queue internally
        // Just verify storage now
        verifyStorage();
      }
    };
    
    // Set globally (no chain parameter)
    Wallet.setOnUTXOMerkletreeScanCallback(utxoCallback);
    console.log('✅ UTXO callback registered');
    
    return () => scanComplete;
  }
}

// 2. Initialize UTXO history
async function initializeUTXOHistory(clearDB = false) {
  console.log('🔄 Initializing UTXO history...');
  
  // OPTIONAL: Clear database if requested
  if (clearDB) {
    console.log('🗑️ Clearing database for fresh start...');
    await clearDatabase();
    // Wait for database to be fully cleared
    await new Promise(resolve => setTimeout(resolve, 1000));
  } else {
    console.log('📊 Using existing database (will append/update)');
  }
  
  // Ensure engine running (this initializes/opens the database)
  await ensureEngineRunning();
  // Database is now open: engine.db (IndexedDB)
  
  // Get wallet
  const wallet = await Wallet.walletForID(walletID);
  
  // Sync transactions (fetches from GraphQL)
  console.log('📡 Syncing transactions from GraphQL...');
  await Wallet.syncRailgunTransactionsV2(
    TXIDVersion.V2_PoseidonMerkle,
    NetworkName.EthereumSepolia,
    [wallet]
  );
  
  // Trigger UTXO scan
  console.log('🔄 Triggering UTXO scan...');
  const chain = { type: 0, id: 11155111 };
  await Wallet.refreshBalances(chain, [walletID]);
  
  // WAIT - Let SDK complete naturally
  // During this time:
  //   - SDK fetches 2540 commitments from GraphQL
  //   - Processes them (commitmentListener called for each)
  //   - Batches writes to IndexedDB (engine.db)
  //   - Flushes write queue when scan completes
  console.log('⏳ Waiting for scan to complete (this may take 1-2 minutes)...');
  
  // Poll for completion (or use callback)
  let attempts = 0;
  while (attempts < 120) { // 2 minutes max
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const utxoTree = Wallet.getUTXOMerkletreeForNetwork(
      TXIDVersion.V2_PoseidonMerkle,
      NetworkName.EthereumSepolia
    );
    
    if (utxoTree && !utxoTree.isScanning) {
      const treeLengths = utxoTree.treeLengths || [];
      const totalStored = treeLengths.reduce((sum, len) => sum + len, 0);
      
      if (totalStored >= 2540) {
        console.log(`✅ SUCCESS! ${totalStored} commitments stored`);
        return { success: true, stored: totalStored };
      }
    }
    
    attempts++;
  }
  
  // Final check
  const utxoTree = Wallet.getUTXOMerkletreeForNetwork(
    TXIDVersion.V2_PoseidonMerkle,
    NetworkName.EthereumSepolia
  );
  const treeLengths = utxoTree.treeLengths || [];
  const totalStored = treeLengths.reduce((sum, len) => sum + len, 0);
  
  return { success: totalStored >= 2540, stored: totalStored };
}

// 3. Verify storage (reads from IndexedDB)
async function verifyStorage() {
  const utxoTree = Wallet.getUTXOMerkletreeForNetwork(
    TXIDVersion.V2_PoseidonMerkle,
    NetworkName.EthereumSepolia
  );
  
  if (!utxoTree) {
    console.log('❌ UTXO tree not available');
    return;
  }
  
  // Read tree lengths from IndexedDB
  const treeLengths = utxoTree.treeLengths || [];
  const totalStored = treeLengths.reduce((sum, len) => sum + len, 0);
  
  // Check write queue (in-memory, not yet persisted)
  const writeQueue = utxoTree.writeQueue || [];
  const queueLength = Array.isArray(writeQueue) ? writeQueue.length : Object.keys(writeQueue).length;
  
  console.log('\n📊 STORAGE VERIFICATION (from IndexedDB):');
  console.log(`   Database: engine.db (IndexedDB)`);
  console.log(`   Stored: ${totalStored} commitments`);
  console.log(`   Expected: 2540 commitments`);
  console.log(`   Write queue: ${queueLength} items (not yet persisted)`);
  console.log(`   Is scanning: ${utxoTree.isScanning || false}`);
  
  if (totalStored >= 2540 && queueLength === 0 && !utxoTree.isScanning) {
    console.log('✅ SUCCESS! All commitments stored in IndexedDB and scan complete');
  } else if (queueLength > 0) {
    console.log(`⚠️ Write queue has ${queueLength} items - may need to wait longer`);
    console.log('   → These will be persisted when queue flushes');
  } else if (totalStored < 2540) {
    console.log(`⚠️ Missing ${2540 - totalStored} commitments`);
    console.log('   → Check if scan completed or if write queue needs flushing');
  }
}
```

## Key Differences from Broken Implementation

| Broken (1176 stored) | Working (2540 stored) |
|---------------------|---------------------|
| Calls `refreshBalances()` multiple times | Calls once and waits |
| Manually flushes write queue during scan | Lets SDK flush internally |
| Uses chain-specific callback | Uses global callback |
| Interrupts scan with timeouts | Waits for natural completion |
| Calls `refreshBalances()` in callback | Only logs in callback |

## Database Write Flow Diagram

```
1. Engine Starts
   └─> Opens IndexedDB: engine.db
       └─> Database may be empty OR contain existing data

2. syncRailgunTransactionsV2()
   └─> Fetches 2540 commitments from GraphQL
       └─> Returns transaction data (not yet written to DB)

3. refreshBalances()
   └─> Triggers UTXO scan
       └─> SDK processes commitments:
           ├─> commitmentListener called for each (0-2539)
           ├─> Decrypts commitments
           ├─> Validates commitments
           └─> Queues writes to IndexedDB (batched)

4. Write Queue Processing (SDK Internal)
   └─> Batches writes for performance
       └─> Writes to IndexedDB: engine.db
           ├─> Updates existing commitments (if any)
           └─> Inserts new commitments

5. Scan Completes (progress >= 1.0)
   └─> SDK flushes write queue
       └─> All 2540 commitments now in IndexedDB
           └─> Persists across browser sessions
```

## Summary

**The secret is: Let the SDK do its job without interruption.**

1. Set callback globally
2. Call `refreshBalances()` once
3. Wait for `progress >= 1.0`
4. SDK handles write queue internally
5. Verify storage after completion

**Don't try to "help" the SDK by manually flushing or calling refreshBalances multiple times - that's what causes the 1176/2540 issue!**

