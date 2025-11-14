# Subsquid Indexer Implementation Plan

## What We Learned from SDK Source

### 1. Exact GraphQL Query Format
From `railgun-txids-query.graphql`:
```graphql
query GetRailgunTransactionsByTxid($txid: Bytes) {
  transactions(where: { transactionHash_eq: $txid }) {
    id
    nullifiers
    commitments
    transactionHash
    boundParamsHash
    blockNumber
    utxoTreeIn
    utxoTreeOut
    utxoBatchStartPositionOut
    hasUnshield
    unshieldToken { tokenType, tokenSubID, tokenAddress }
    unshieldToAddress
    unshieldValue
    blockTimestamp
    verificationHash
  }
}
```

### 2. Real Sepolia Transaction Example (from test)
```javascript
{
  commitments: ['0x213b8672321b8b6d4165528e3146b1c25da4656fd93db74efa3258416e20b5d9', ...],
  nullifiers: ['0x25234f8100ee0b86e2f331f255d982ba60d05710ceae8f226f6254addd362b1f'],
  txid: 'e629e8f89ab98fee9dadacb9323746e4c150dee57917218509e94d9e35cc1db0',
  blockNumber: 5963806,
  // ... other fields
}
```

### 3. Critical Requirements
- Entity name MUST be `transactions` (lowercase, plural)
- `transactionHash` is the Ethereum tx hash (your tx: `0x35d98f0b...f87a`)
- `id` is a composite GraphQL ID (not just transactionHash)
- Fields must match exactly (case-sensitive)

## Step-by-Step Implementation

### Phase 1: Minimal Working Version (Test First!)
1. ✅ Create schema matching SDK query exactly
2. ✅ Index transactions TO Railgun proxy contract
3. ✅ Extract basic fields from transaction
4. ⏳ Test GraphQL query works
5. ⏳ Verify SDK can query it

### Phase 2: Parse Contract Events
1. Parse Railgun contract logs to extract:
   - `nullifiers` (from Nullified event)
   - `commitments` (from Commitment event)
   - `boundParamsHash` (from transaction data)
   - `utxoTreeIn/Out` (from event data)
   - `verificationHash` (from transaction data)

### Phase 3: Full Coverage
1. Index all blocks from launch (5944700)
2. Ensure your transaction at block 9536064 is indexed
3. Point SDK to local GraphQL endpoint
4. Sync TXID tree

## Avoiding Previous Errors

### Lessons Learned:
1. ✅ Schema field names must match GraphQL query exactly
2. ✅ Entity names must be lowercase plural (`transactions`, not `Transaction`)
3. ✅ Use `transactionHash_eq` for filtering (not `hash_eq`)
4. ✅ Test GraphQL queries before full implementation
5. ✅ Start minimal, add complexity incrementally

## Testing Strategy

1. **Test 1**: Verify transaction exists on-chain ✅ DONE
2. **Test 2**: Index transaction to database
3. **Test 3**: Query via GraphQL and verify format
4. **Test 4**: SDK can query our local endpoint
5. **Test 5**: SDK can sync TXID tree

