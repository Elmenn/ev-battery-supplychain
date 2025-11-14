# Testing Guide - After Scan Complete

## Step 1: Check if Target Transaction Was Indexed

```powershell
# Check if your target transaction exists
docker exec -it railgun-sepolia-v2-db-1 psql -U postgres -d squid -c "SELECT id, block_number, array_length(nullifiers, 1) as nullifier_count, array_length(commitments, 1) as commitment_count FROM transaction WHERE transaction_hash = '\x35d98f0b0f011f74e6f3bf0f56c15106fb4799bf44040b2d009a54a7db91f87a';"
```

**Expected:**
- Should return 1 row
- `block_number` = 9536064
- `nullifier_count` > 0 (if events were parsed)
- `commitment_count` > 0 (if events were parsed)

## Step 2: Check Debug Logs (if available)

Look in the processor logs for:
```
🎯 FOUND TARGET TRANSACTION! Block: 9536064, Hash: 0x35d98f0b0f011f74e6f3bf0f56c15106fb4799bf44040b2d009a54a7db91f87a
[Target TX] Log 0: topics=2, topic0=0x..., dataLength=...
```

This shows what events were emitted.

## Step 3: Start GraphQL Server

```powershell
# In a new terminal
cd subsquid/railgun-sepolia-v2
npm run serve
```

Server should start on `http://localhost:4000/graphql`

## Step 4: Test GraphQL Query

### Option A: Browser Console

```javascript
// Open browser console on your frontend app
const query = `query {
  transactions(where: { transactionHash_eq: "0x35d98f0b0f011f74e6f3bf0f56c15106fb4799bf44040b2d009a54a7db91f87a" }) {
    id
    transactionHash
    blockNumber
    nullifiers
    commitments
  }
}`;

const res = await fetch('http://localhost:4000/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query })
});

const data = await res.json();
console.log('Target transaction:', JSON.stringify(data, null, 2));
```

### Option B: GraphQL Playground

1. Open `http://localhost:4000/graphql` in browser
2. Run query:
```graphql
query {
  transactions(where: { transactionHash_eq: "0x35d98f0b0f011f74e6f3bf0f56c15106fb4799bf44040b2d009a54a7db91f87a" }) {
    id
    transactionHash
    blockNumber
    nullifiers
    commitments
  }
}
```

**Expected:**
- Should return transaction with your hash
- `nullifiers` array should not be empty (if events were parsed)
- `commitments` array should not be empty (if events were parsed)

## Step 5: Test SDK Sync

### 5.1: Verify GraphQL Override is Active

```javascript
// In browser console
console.log('Override URL:', window.__OVERRIDE_SEPOLIA_V2_SUBGRAPH__);
// Should show: http://localhost:4000/graphql
```

### 5.2: Clear Mesh Cache and Sync

```javascript
// Clear GraphQL Mesh cache
if (window.RGV2?._meshes) {
  Object.keys(window.RGV2._meshes).forEach(key => delete window.RGV2._meshes[key]);
  console.log('✅ Mesh cache cleared');
}

// Run sync
await window.RGV2.RG.syncRailgunTransactionsV2(window.RGV2.SEPOLIA.networkName);
```

### 5.3: Check if TXID is in Tree

```javascript
// Check if transaction is in TXID tree
const found = await window.RGV2.findAndValidateRailgunTXID('0x35d98f0b0f011f74e6f3bf0f56c15106fb4799bf44040b2d009a54a7db91f87a');
console.log('TXID validation:', found);

// Should show:
// { found: true, inRXList: true, inTXIDTree: true, ... }
```

### 5.4: Check Spendability

```javascript
// Check if funds are spendable
await window.RGV2.checkSpendabilityRequirements();
```

**Expected:**
- TXID should be in TXID tree
- Funds should transition from ShieldPending to Spendable

## Step 6: Troubleshooting

### If arrays are empty:

1. **Check logs** - See what events were emitted:
   ```powershell
   # Look for [Target TX] logs in processor output
   ```

2. **Check if events exist** - Query logs directly:
   ```powershell
   # Check if there are any logs for this transaction
   docker exec -it railgun-sepolia-v2-db-1 psql -U postgres -d squid -c "SELECT COUNT(*) FROM nullifier WHERE transaction_hash = '\x35d98f0b0f011f74e6f3bf0f56c15106fb4799bf44040b2d009a54a7db91f87a';"
   ```

3. **If no logs found** - The transaction might not have emitted events, or we need to improve event parsing

### If sync fails:

1. **Check GraphQL endpoint** - Verify requests go to localhost:4000:
   ```javascript
   // Watch Network tab in browser DevTools
   // Should see requests to http://localhost:4000/graphql
   ```

2. **Check GraphQL response** - Verify data format matches SDK expectations:
   ```javascript
   // Log the GraphQL response
   // Compare with SDK's expected format
   ```

3. **Check TXID format** - Verify the `id` field matches SDK expectations:
   ```javascript
   // The id should be in format: 0x + blockNumber (64 hex) + position (64 hex) + zeros (64 hex)
   ```

## Success Criteria

✅ **Transaction is indexed** - Appears in database  
✅ **Arrays are populated** - nullifiers and commitments are not empty  
✅ **GraphQL returns data** - Query works and returns transaction  
✅ **SDK can sync** - `syncRailgunTransactionsV2` completes without errors  
✅ **TXID in tree** - Transaction appears in TXID merkletree  
✅ **Funds are spendable** - Status changes from ShieldPending to Spendable  




