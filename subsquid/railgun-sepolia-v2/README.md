# Railgun Sepolia V2 Subsquid Indexer

## Purpose
Index Railgun V2 transactions on Sepolia testnet to provide a GraphQL API that the Railgun SDK can query.

## Problem
Your transaction `0x35d98f0b0f011f74e6f3bf0f56c15106fb4799bf44040b2d009a54a7db91f87a` (block 9536064) is:
- ✅ On-chain (confirmed)
- ❌ NOT in public Railgun subgraph
- ❌ NOT in local TXID merkletree
- ❌ Funds stuck in ShieldPending

## Solution
Build a self-hosted Subsquid indexer that:
1. Indexes all Railgun transactions on Sepolia
2. Exposes them via GraphQL API
3. SDK can query it to sync TXID tree
4. Funds become spendable

## Implementation Status

✅ **Phase 1**: Schema created (matches SDK expectations)
⏳ **Phase 2**: Processor implementation (minimal version)
⏳ **Phase 3**: Event parsing (extract nullifiers, commitments)
⏳ **Phase 4**: Testing & SDK integration

## Key Files

- `schema.graphql` - GraphQL schema matching SDK query format
- `src/processor.ts` - Indexer logic (to be implemented)
- `src/processor-config.ts` - Processor configuration
- `IMPLEMENTATION_PLAN.md` - Detailed implementation steps
- `TESTING_STRATEGY.md` - Incremental testing approach

## Next Steps

1. Implement minimal processor (index transactions only)
2. Test GraphQL query works
3. Enhance to parse contract events
4. Point SDK to local endpoint
5. Verify TXID sync works

