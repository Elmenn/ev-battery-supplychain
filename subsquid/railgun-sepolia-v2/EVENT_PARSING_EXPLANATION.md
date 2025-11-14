# How We Extract Nullifiers and Commitments from Railgun Events

## Understanding Ethereum Event Logs

When a smart contract emits an event, it creates a log entry with this structure:

```
Log {
  address: "0x...",      // Contract that emitted the event
  topics: [              // Array of 32-byte values
    topics[0],           // Event signature hash (keccak256 of event name + parameters)
    topics[1],           // First indexed parameter
    topics[2],           // Second indexed parameter
    ...
  ],
  data: "0x..."          // Non-indexed parameters (ABI-encoded)
}
```

### Key Points:
- **Indexed parameters** (like `bytes32`, `address`, `uint256`) → Stored in `topics[1]`, `topics[2]`, etc.
- **Non-indexed parameters** (like `uint256[]`, complex structs) → Stored in `data`
- **Event signature** → `topics[0]` = `keccak256("EventName(param1,param2)")`

## Railgun Event Structure

Railgun contracts emit events like:

### 1. Nullified Event
```solidity
event Nullified(bytes32 indexed nullifier);
```
- **topics[0]**: `keccak256("Nullified(bytes32)")` = event signature
- **topics[1]**: The nullifier hash (32 bytes)
- **data**: Empty (no non-indexed params)

### 2. Commitment Event
```solidity
event Commitment(
    bytes32 indexed commitment,  // Indexed
    uint256 treeNumber,          // Non-indexed
    uint256 batchStartPosition,  // Non-indexed
    uint256 treePosition         // Non-indexed
);
```
- **topics[0]**: `keccak256("Commitment(bytes32,uint256,uint256,uint256)")` = event signature
- **topics[1]**: The commitment hash (32 bytes)
- **data**: ABI-encoded `(treeNumber, batchStartPosition, treePosition)`

## Current Implementation (Simplified Approach)

### What We're Doing Now:

```typescript
// For each log from Railgun contract:
if (log.topics.length >= 2) {
  // Extract bytes32 from topics[1]
  const hashBytes = hexToBytes(log.topics[1]);
  
  // Add to BOTH arrays (heuristic approach)
  transactionNullifiers.push(hashBytes);
  transactionCommitments.push(hashBytes);
  
  // Create entities for both
  // ...
}
```

### Why This Works (Partially):

1. **Most Railgun events have `bytes32` as first indexed parameter** in `topics[1]`
2. **We're extracting from `topics[1]`** (correct location for indexed bytes32)
3. **We're adding to both arrays** because:
   - We don't know which event type it is (don't have event signatures)
   - Better to have duplicates than miss data
   - The SDK will use whichever array has the right data

### Limitations:

1. **We don't distinguish event types** - We can't tell if `topics[1]` is a nullifier or commitment
2. **We're duplicating data** - Same hash might be added to both arrays
3. **We're missing non-indexed parameters** - Can't extract `treeNumber`, `batchStartPosition` from `data`
4. **We might miss events** - If an event has no indexed bytes32, we skip it

## Proper Implementation (What We Should Do)

### Step 1: Calculate Event Signatures

```typescript
// Using keccak256 (in Node.js, you'd use crypto or ethers)
const NULLIFIED_SIGNATURE = keccak256("Nullified(bytes32)");
const COMMITMENT_SIGNATURE = keccak256("Commitment(bytes32,uint256,uint256,uint256)");
const UNSHIELD_SIGNATURE = keccak256("Unshield(bytes32,address,uint256,uint256)");
```

### Step 2: Match Event Type

```typescript
const topic0 = log.topics[0].toLowerCase();

if (topic0 === NULLIFIED_SIGNATURE) {
  // This is a Nullified event
  const nullifier = log.topics[1]; // Extract from topics[1]
  transactionNullifiers.push(hexToBytes(nullifier));
  
} else if (topic0 === COMMITMENT_SIGNATURE) {
  // This is a Commitment event
  const commitment = log.topics[1]; // Extract from topics[1]
  transactionCommitments.push(hexToBytes(commitment));
  
  // Also decode data field for treeNumber, batchStartPosition, treePosition
  const decoded = abi.decode(["uint256", "uint256", "uint256"], log.data);
  // Use decoded values...
  
} else if (topic0 === UNSHIELD_SIGNATURE) {
  // This is an Unshield event
  // Extract from topics[1], topics[2], etc.
  hasUnshield = true;
}
```

### Step 3: Decode ABI Data

For non-indexed parameters, we need to decode the `data` field:

```typescript
// Using ethers.js or similar ABI decoder
const abi = new ethers.utils.AbiCoder();
const decoded = abi.decode(
  ["uint256", "uint256", "uint256"],  // Parameter types
  log.data                              // Encoded data
);
// decoded[0] = treeNumber
// decoded[1] = batchStartPosition
// decoded[2] = treePosition
```

## Why We're Using the Simplified Approach

1. **We don't have the exact event signatures** - Need to find them from Railgun ABI or calculate them
2. **Faster to implement** - Get something working first
3. **Debug logs will show us** - The actual `topic0` values so we can calculate correct signatures
4. **SDK might be tolerant** - It might work with approximate data initially

## Next Steps to Improve

1. **Find Railgun contract ABI** - Get exact event signatures
2. **Calculate event signature hashes** - Use keccak256 of event signatures
3. **Match `topics[0]` to event types** - Properly identify each event
4. **Decode `data` field** - Extract non-indexed parameters using ABI decoder
5. **Populate arrays correctly** - Only add nullifiers to nullifiers array, commitments to commitments array

## Current Status

✅ **What works:**
- Extracting bytes32 values from `topics[1]` (correct location)
- Creating entities for both nullifiers and commitments
- Populating arrays (even if with duplicates)

❌ **What needs improvement:**
- Distinguishing between event types
- Avoiding duplicates
- Extracting non-indexed parameters from `data`
- Properly identifying which hash is a nullifier vs commitment

## Debug Output

When the processor finds your target transaction, you'll see logs like:
```
[Target TX] Log 0: topics=2, topic0=0xabc123..., dataLength=98
[Target TX] Log 1: topics=2, topic0=0xdef456..., dataLength=0
```

From these logs, we can:
1. See the actual `topic0` values (event signatures)
2. Calculate what events they correspond to
3. Update the code to properly match and decode them




