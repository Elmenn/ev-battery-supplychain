---
phase: 10-cleanup-e2e
created: 2026-02-18
status: context-gathered
---

# Phase 10: Cleanup & E2E Integration — Context

**Goal:** Remove dead code from old flow, verify end-to-end on Ganache, produce gas comparison report

## Area 1: Dead Code Scope

### Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Old ProductEscrow.sol | Delete completely | Git history preserves it. New contract is ProductEscrow_Initializer.sol |
| Old build artifacts | Delete (ProductEscrow.json, IProductEscrow.json, etc.) | Only new contract artifacts needed |
| Old migration scripts | Delete (anything referencing old contract) | 2_deploy_redesigned.js is the active migration |
| Deprecated stubs in vcBuilder.mjs | Remove now | Phase 9 verified no callers remain. Stubs were transitional. |
| Old test files (SimpleProductEscrow.test.js) | Delete | EscrowRedesign.test.js + EscrowTimeouts.test.js cover new contract |
| Import cleanup aggressiveness | Targeted only | Remove clearly dead paths (old public purchase UI, old bidding, old buyer delivery). Don't lint everything. |

### Scope

**DELETE:**
- `contracts/ProductEscrow.sol` (old contract, if it exists)
- Old build artifacts in `build/contracts/` for removed contracts
- `SimpleProductEscrow.test.js` or any test referencing old interface
- Old migration scripts (pre-redesign)
- Deprecated stubs: `buildStage2VC`, `buildStage3VC` from vcBuilder.mjs
- Dead UI paths: any remaining public purchase buttons, old buyer delivery confirmation
- `MaliciousReentrant.sol` build artifacts if only used by old tests
- Accumulated root-level documentation files from development (CHECK_NETWORK.ps1, NUL, various .md troubleshooting files)

**KEEP:**
- `MaliciousReentrant.sol` contract + test (used by EscrowRedesign reentrancy tests)
- `ReentrancyGuard.sol` (active dependency)
- All Phase 1-9 work
- `.planning/` directory (project history)

## Area 2: E2E Test Strategy

### Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary environment | Ganache (local) | Fast, deterministic, guaranteed working. Sepolia as stretch goal only. |
| Evidence format | Script + log output | Automated, reproducible. Better than screenshots for verification. |
| Test accounts | Ganache preset accounts | accounts[0]=seller, accounts[1]=buyer, accounts[2]=transporter. Simple, deterministic. |
| Railgun scope | Contract flow only | Railgun SDK already verified in Phases 5-6. Skip to avoid Sepolia infra dependency. |

### E2E Flow to Test

Full contract lifecycle on Ganache:
1. **Deploy**: Factory + clone creation
2. **Create Product**: Seller creates product with bond (accounts[0])
3. **Record Payment**: Buyer calls recordPrivatePayment with mock memoHash/txRef (accounts[1])
4. **Confirm Order**: Seller calls confirmOrder with vcCID (accounts[0])
5. **Transporter Bid**: Transporter calls createTransporter with bond (accounts[2])
6. **Select Transporter**: Seller calls setTransporter + deposits fee (accounts[0])
7. **Confirm Delivery**: Transporter calls confirmDelivery with hash (accounts[2])
8. **Verify Final State**: Check all funds released correctly, bonds returned, phase = Delivered

Script should output: tx hashes, gas used per operation, final balances, pass/fail per step.

## Area 3: Gas Comparison Report

### Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Operations to compare | Core lifecycle ops | createProduct, recordPrivatePayment, confirmOrder, setTransporter, confirmDelivery |
| Report location | docs/GAS_COMPARISON.md | Version-controlled, easy to reference from thesis |
| Cost units | Gas units only | Report gas units + ETH at reference gas price (e.g., 30 gwei). USD too volatile. |

### Report Structure

```
# Gas Comparison: Old vs New Contract

## Methodology
- Environment: Ganache
- Gas price: 30 gwei (reference)
- Compiler: solc 0.8.x

## Results

| Operation | Old Contract (gas) | New Contract (gas) | Delta | % Change |
|-----------|-------------------|-------------------|-------|----------|
| Deploy Factory | ... | ... | ... | ... |
| Create Product | ... | ... | ... | ... |
| Record Payment | ... | ... | ... | ... |
| Confirm Order | ... | ... | ... | ... |
| Set Transporter | ... | ... | ... | ... |
| Confirm Delivery | ... | ... | ... | ... |

## Analysis
[Brief interpretation for thesis]
```

Note: "Old contract" gas numbers may need to come from existing test logs or re-deployment of old contract from git history. If old contract is too different to compare apples-to-apples (different function signatures), document the closest equivalent operations.

## Area 4: Console Error Audit

### Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Railgun SDK noise | Allowlist known SDK logs | Document known messages as expected. Only flag messages outside allowlist. |
| Error threshold | Document all, fix app-only | Log everything, fix errors from our code. Document SDK/framework noise as acceptable. |
| Build mode | Both (prod + dev) | Production build for thesis claim, dev mode for catching remaining issues. |

### Audit Process

1. Run production build (`npm run build` + serve)
2. Open DevTools console, clear it
3. Walk through full flow (or as much as possible without Railgun)
4. Capture all console output
5. Categorize: App Error | App Warning | SDK Noise | Framework Noise
6. Fix all App Errors
7. Document remaining items with "known and acceptable" rationale

### Known SDK Noise (allowlist)

- Railgun SDK initialization logs
- POI (Proof of Innocence) sync messages
- Quick-sync fallback warnings (expected from our empty stubs)
- React dev mode warnings (strict mode double-render, etc.)

## Deferred Ideas

- Auditor role UI/UX (discussed in Phase 9, deferred to future milestone)
- Sepolia deployment (stretch goal, not blocking thesis)

---

*Created: 2026-02-18*
