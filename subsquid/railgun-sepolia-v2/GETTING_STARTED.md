# Getting Started - Minimal Processor

## What This Does (Phase 1)

This minimal processor:
1. ✅ Indexes all transactions TO the Railgun proxy contract (`0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea`)
2. ✅ Stores basic fields: `transactionHash`, `blockNumber`, `blockTimestamp`
3. ✅ Uses placeholder values for complex fields (nullifiers, commitments, etc.)
4. ✅ Logs when it finds your target transaction

## Why Placeholder Values?

From the SDK source, we know the exact fields needed, but parsing Railgun contract events is complex. This approach:
- ✅ Gets your transaction indexed **immediately**
- ✅ Allows testing GraphQL queries **right away**
- ✅ Can be enhanced incrementally (Phase 2: parse events)

## Current Status

**Phase 1**: Minimal indexing ✅ Ready
- Schema matches SDK expectations
- Processor indexes transactions
- GraphQL API will expose them

**Phase 2**: Event parsing (Next)
- Parse Railgun contract logs
- Extract nullifiers, commitments, etc.
- Fill in all placeholder values

## Testing Strategy

1. **Test 1**: Run processor, verify it logs finding your transaction
2. **Test 2**: Query GraphQL to see transaction appears
3. **Test 3**: Point SDK to local endpoint, test query works
4. **Phase 2**: Enhance with event parsing

## Next Commands

```bash
cd subsquid/railgun-sepolia-v2
npm install
# Create .env file (see QUICK_START.md)
docker-compose up -d
npm run codegen
npm run build
npm run migration:generate
npm run migration:apply
npm run process  # This will index your transaction!
```

Look for: `🎯 FOUND TARGET TRANSACTION!` in the logs when it reaches block 9536064.

