# Instructions for Copying Files from Working Repo

## Source Directory
`C:/Users/yamen/Railgun_community/wallet/src/services/`

## Target Directory
`frontend/src/lib/railgun/`

## Step-by-Step Copy Instructions

### Phase 1: Core Engine Files (CRITICAL - Start Here)

**Copy these files from:** `C:/Users/yamen/Railgun_community/wallet/src/services/railgun/core/`

1. **`init.ts`** → Put in: `frontend/src/lib/railgun/core/init.js` (rename .ts to .js)
2. **`load-provider.ts`** → Put in: `frontend/src/lib/railgun/core/load-provider.js`
3. **`artifacts.ts`** → Put in: `frontend/src/lib/railgun/core/artifacts.js`
4. **`merkletree.ts`** → Put in: `frontend/src/lib/railgun/core/merkletree.js` (if exists)
5. **`shields.ts`** → Put in: `frontend/src/lib/railgun/core/shields.js` (if exists)

**Note:** `engine.ts`, `providers.ts`, and `prover.ts` are already created.

### Phase 2: Wallet Management (CRITICAL)

**Copy these files from:** `C:/Users/yamen/Railgun_community/wallet/src/services/railgun/wallets/`

1. **`wallets.ts`** → Put in: `frontend/src/lib/railgun/wallets/wallets.js`
2. **`balances.ts`** → Put in: `frontend/src/lib/railgun/wallets/balances.js`
3. **`balance-update.ts`** → Put in: `frontend/src/lib/railgun/wallets/balance-update.js`
4. **`index.ts`** → Put in: `frontend/src/lib/railgun/wallets/index.js`

### Phase 3: Transactions (CRITICAL for Transfers)

**Copy these files from:** `C:/Users/yamen/Railgun_community/wallet/src/services/transactions/`

1. **`tx-transfer.ts`** → Put in: `frontend/src/lib/railgun/transactions/tx-transfer.js`
2. **`tx-proof-transfer.ts`** → Put in: `frontend/src/lib/railgun/transactions/tx-proof-transfer.js`
3. **`tx-shield.ts`** → Put in: `frontend/src/lib/railgun/transactions/tx-shield.js`
4. **`tx-shield-base-token.ts`** → Put in: `frontend/src/lib/railgun/transactions/tx-shield-base-token.js` (if exists)
5. **`tx-unshield.ts`** → Put in: `frontend/src/lib/railgun/transactions/tx-unshield.js`
6. **`tx-proof-unshield.ts`** → Put in: `frontend/src/lib/railgun/transactions/tx-proof-unshield.js` (if exists)
7. **`tx-generator.ts`** → Put in: `frontend/src/lib/railgun/transactions/tx-generator.js`
8. **`tx-gas-details.ts`** → Put in: `frontend/src/lib/railgun/transactions/tx-gas-details.js`
9. **`tx-gas-broadcaster-fee-estimator.ts`** → Put in: `frontend/src/lib/railgun/transactions/tx-gas-broadcaster-fee-estimator.js`
10. **`tx-cross-contract-calls.ts`** → Put in: `frontend/src/lib/railgun/transactions/tx-cross-contract-calls.js`
11. **`tx-notes.ts`** → Put in: `frontend/src/lib/railgun/transactions/tx-notes.js`
12. **`tx-nullifiers.ts`** → Put in: `frontend/src/lib/railgun/transactions/tx-nullifiers.js`
13. **`proof-cache.ts`** → Put in: `frontend/src/lib/railgun/transactions/proof-cache.js`
14. **`index.ts`** → Put in: `frontend/src/lib/railgun/transactions/index.js`

### Phase 4: Quick Sync (Needed for Balance Scanning)

**Copy these files from:** `C:/Users/yamen/Railgun_community/wallet/src/services/railgun/quick-sync/`

1. **`quick-sync-events.ts`** → Put in: `frontend/src/lib/railgun/quick-sync/quick-sync-events.js`
2. **`graph-query.ts`** → Put in: `frontend/src/lib/railgun/quick-sync/graph-query.js`
3. **`shared-formatters.ts`** → Put in: `frontend/src/lib/railgun/quick-sync/shared-formatters.js`

**From:** `C:/Users/yamen/Railgun_community/wallet/src/services/railgun/quick-sync/V2/`

4. **`quick-sync-events-graph-v2.ts`** → Put in: `frontend/src/lib/railgun/quick-sync/V2/quick-sync-events-graph-v2.js`
5. **`graph-type-formatters-v2.ts`** → Put in: `frontend/src/lib/railgun/quick-sync/V2/graph-type-formatters-v2.js`

**Note:** You may already have some V2 files - check first before overwriting.

### Phase 5: TXID Sync (Needed for Proof Generation)

**Copy these files from:** `C:/Users/yamen/Railgun_community/wallet/src/services/railgun/railgun-txids/`

1. **`railgun-txid-sync-graph-v2.ts`** → Put in: `frontend/src/lib/railgun/railgun-txids/railgun-txid-sync-graph-v2.js`
2. **`railgun-txid-graph-type-formatters.ts`** → Put in: `frontend/src/lib/railgun/railgun-txids/railgun-txid-graph-type-formatters.js`
3. **`railgun-txid-merkletrees.ts`** → Put in: `frontend/src/lib/railgun/railgun-txids/railgun-txid-merkletrees.js` (if exists)
4. **`blinded-commitments.ts`** → Put in: `frontend/src/lib/railgun/railgun-txids/blinded-commitments.js` (if exists)
5. **`tail-guards.ts`** → Put in: `frontend/src/lib/railgun/railgun-txids/tail-guards.js` (if exists)
6. **`index.ts`** → Put in: `frontend/src/lib/railgun/railgun-txids/index.js`

**From:** `C:/Users/yamen/Railgun_community/wallet/src/services/railgun/railgun-txids/quick-sync/`

7. **`quick-sync-txid-graph-v2.ts`** → Put in: `frontend/src/lib/railgun/railgun-txids/quick-sync/quick-sync-txid-graph-v2.js`
8. **`txid-graphql-client.ts`** → Put in: `frontend/src/lib/railgun/railgun-txids/quick-sync/txid-graphql-client.js` (if exists)

### Phase 6: POI (Proof of Innocence)

**Copy these files from:** `C:/Users/yamen/Railgun_community/wallet/src/services/poi/`

1. **`wallet-poi.ts`** → Put in: `frontend/src/lib/railgun/poi/wallet-poi.js`
2. **`wallet-poi-node-interface.ts`** → Put in: `frontend/src/lib/railgun/poi/wallet-poi-node-interface.js`
3. **`wallet-poi-requester.ts`** → Put in: `frontend/src/lib/railgun/poi/wallet-poi-requester.js` (if exists)
4. **`poi-node-request.ts`** → Put in: `frontend/src/lib/railgun/poi/poi-node-request.js`
5. **`poi-required.ts`** → Put in: `frontend/src/lib/railgun/poi/poi-required.js` (if exists)
6. **`poi-status-info.ts`** → Put in: `frontend/src/lib/railgun/poi/poi-status-info.js` (if exists)
7. **`poi-validation.ts`** → Put in: `frontend/src/lib/railgun/poi/poi-validation.ts` (if exists)
8. **`index.ts`** → Put in: `frontend/src/lib/railgun/poi/index.js`

### Phase 7: Utilities

**Copy these files from:** `C:/Users/yamen/Railgun_community/wallet/src/services/railgun/util/`

1. **`bytes.ts`** → Put in: `frontend/src/lib/railgun/util/bytes.js`
2. **`crypto.ts`** → Put in: `frontend/src/lib/railgun/util/crypto.js`
3. **`graph-util.ts`** → Put in: `frontend/src/lib/railgun/util/graph-util.js`
4. **`runtime.ts`** → Put in: `frontend/src/lib/railgun/util/runtime.js` (if exists)
5. **`index.ts`** → Put in: `frontend/src/lib/railgun/util/index.js`

### Phase 8: Artifacts

**Copy these files from:** `C:/Users/yamen/Railgun_community/wallet/src/services/artifacts/`

1. **`artifact-store.ts`** → Put in: `frontend/src/lib/railgun/artifacts/artifact-store.js` (check if we have this already)
2. **`artifact-downloader.ts`** → Put in: `frontend/src/lib/railgun/artifacts/artifact-downloader.js`
3. **`artifact-util.ts`** → Put in: `frontend/src/lib/railgun/artifacts/artifact-util.js`
4. **`artifact-hash.ts`** → Put in: `frontend/src/lib/railgun/artifacts/artifact-hash.js` (if exists)
5. **`index.ts`** → Put in: `frontend/src/lib/railgun/artifacts/index.js`

### Phase 9: Ethers Utilities

**Copy these files from:** `C:/Users/yamen/Railgun_community/wallet/src/services/ethers/`

1. **`ethers-util.ts`** → Put in: `frontend/src/lib/railgun/ethers/ethers-util.js`
2. **`index.ts`** → Put in: `frontend/src/lib/railgun/ethers/index.js`

### Phase 10: Supporting Files

**Copy these files from:** `C:/Users/yamen/Railgun_community/wallet/src/services/railgun/`

1. **`contract-query.ts`** → Put in: `frontend/src/lib/railgun/contract-query.js` (if exists)
2. **`history/transaction-history.ts`** → Put in: `frontend/src/lib/railgun/history/transaction-history.js` (if exists)
3. **`process/extract-transaction-data.ts`** → Put in: `frontend/src/lib/railgun/process/extract-transaction-data.js` (if exists)
4. **`index.ts`** → Put in: `frontend/src/lib/railgun/index.js` (we'll update this)

## Quick Copy Command (Optional)

If you prefer, you can copy entire directories and I'll help convert them:

1. Copy `railgun/core/` → `frontend/src/lib/railgun/core/`
2. Copy `railgun/wallets/` → `frontend/src/lib/railgun/wallets/`
3. Copy `transactions/` → `frontend/src/lib/railgun/transactions/`
4. Copy `railgun/quick-sync/` → `frontend/src/lib/railgun/quick-sync/`
5. Copy `railgun/railgun-txids/` → `frontend/src/lib/railgun/railgun-txids/`
6. Copy `poi/` → `frontend/src/lib/railgun/poi/`
7. Copy `railgun/util/` → `frontend/src/lib/railgun/util/`
8. Copy `artifacts/` → `frontend/src/lib/railgun/artifacts/`
9. Copy `ethers/` → `frontend/src/lib/railgun/ethers/`

Then I can:
- Convert all `.ts` → `.js`
- Update import paths
- Adapt for browser environment

## What I'll Do After You Copy

1. ✅ Convert TypeScript → JavaScript (remove types, fix syntax)
2. ✅ Update import paths to match our structure
3. ✅ Adapt Node.js code for browser (replace `fs`, `path`, etc.)
4. ✅ Fix any browser compatibility issues
5. ✅ Update exports in `index.js`
6. ✅ Test basic initialization

## Important Notes

- **Keep** `.ts` extension when copying - I'll convert to `.js`
- **Keep** original folder structure
- **Don't worry** about TypeScript errors - I'll fix them
- **Don't worry** about import paths - I'll update them
- If a file doesn't exist, skip it (it may be optional)

## Priority Order (If Copying Manually)

Start with these first (critical path):
1. ✅ Core: `init.ts`, `load-provider.ts`, `artifacts.ts`
2. ✅ Wallets: `wallets.ts`, `balances.ts`, `balance-update.ts`
3. ✅ Transactions: `tx-transfer.ts`, `tx-proof-transfer.ts`, `tx-generator.ts`, `proof-cache.ts`
4. ✅ Quick-sync: `quick-sync-events.ts`, V2 files
5. ✅ TXID: `railgun-txid-sync-graph-v2.ts`

Then add the rest incrementally.

