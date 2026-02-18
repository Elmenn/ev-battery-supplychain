# Phase 10: Cleanup & E2E Integration - Research

**Researched:** 2026-02-18
**Domain:** Dead code removal, E2E testing, gas comparison, console audit
**Confidence:** HIGH (codebase investigation, no external dependencies)

## Summary

Phase 10 is a cleanup and validation phase. The codebase has accumulated significant dead code from the old contract interface (pre-Phase 7 redesign), 135 files in the old `frontend/src/lib/railgun/` directory that are unused, ~40 root-level development documentation files, and 18+ old test files that reference the superseded contract API. The new contract (`ProductEscrow_Initializer.sol`) uses a 2-parameter `createProduct(name, commitment)` with bond-as-value, while old tests call a 3-parameter version with explicit price. `App.js` still imports and calls `buildStage3VC` (a deprecated stub that now throws) and contains an entire old delivery handler using the pre-redesign flow.

The E2E test script is straightforward: the existing `EscrowRedesign.test.js` already demonstrates the full lifecycle pattern with helper functions (`deployAndCreate`, `advanceToOrderConfirmed`, `advanceToBound`). The E2E script can follow this exact pattern but output gas data and pass/fail per step. For gas comparison, the old contract's gas data must be retrieved from git history since `GasMeasurement.test.js` uses the old interface, or we can deploy the old contract from git history and measure side-by-side.

**Primary recommendation:** Execute in 3 plans: (1) dead code deletion, (2) E2E test script + gas comparison report, (3) App.js cleanup + console error audit.

## Standard Stack

No new libraries needed. This phase uses existing tooling only.

### Core (Already Installed)
| Tool | Version | Purpose | Status |
|------|---------|---------|--------|
| Truffle | existing | Test runner, compilation, migration | Already configured |
| Ganache | existing | Local blockchain for E2E | Port 8545 configured in truffle-config.js |
| Solidity | 0.8.21 | Compiler (optimizer on, 200 runs) | Already configured |
| web3.js | truffle-bundled | Test assertions, gas measurement | Available in test context |

### Supporting
| Tool | Purpose | When to Use |
|------|---------|-------------|
| `git show` / `git log` | Retrieve old contract for gas comparison | If old contract gas data is needed from history |
| `npx truffle test --network development` | Run specific test files | E2E script execution |

## Architecture Patterns

### E2E Test Script Pattern

The E2E script should follow the existing `EscrowRedesign.test.js` helper pattern, which is proven and clean:

```javascript
// Source: test/EscrowRedesign.test.js (existing pattern)
const BOND = toWei("0.01", "ether");
const FEE  = toWei("0.005", "ether");
const VCID = "ipfs://QmTestVcCid12345";

// Step 1: Deploy
impl = await ProductEscrow_Initializer.new({ from: deployer });
factory = await ProductFactory.new(impl.address, { from: deployer });
await factory.setBondAmount(BOND, { from: deployer });

// Step 2: Create product (seller deposits bond)
commitment = randomHex(32);
const tx = await factory.createProduct("Test Battery", commitment, {
  from: seller,
  value: BOND
});
escAddr = tx.logs.find(l => l.event === "ProductCreated").args.product;
esc = await ProductEscrow_Initializer.at(escAddr);

// Step 3: Record private payment (buyer)
const memo = randomHex(32);
const txRef = randomHex(32);
await esc.recordPrivatePayment(1, memo, txRef, { from: buyer });

// Step 4: Confirm order (seller)
await esc.confirmOrder(VCID, { from: seller });

// Step 5: Transporter bid (transporter deposits bond)
await esc.createTransporter(FEE, { from: transporter, value: BOND });

// Step 6: Select transporter (seller deposits fee)
await esc.setTransporter(transporter, { from: seller, value: FEE });

// Step 7: Confirm delivery (transporter provides vcHash)
const vcHash = web3.utils.soliditySha3({ type: "string", value: VCID });
await esc.confirmDelivery(vcHash, { from: transporter });
```

### Gas Measurement Pattern

Each operation should capture `tx.receipt.gasUsed`:

```javascript
const tx = await esc.recordPrivatePayment(1, memo, txRef, { from: buyer });
console.log(`recordPrivatePayment: ${tx.receipt.gasUsed} gas`);
```

### Dead Code Deletion Pattern

Delete in dependency order:
1. Contracts first (no runtime dependencies)
2. Build artifacts second (generated files)
3. Test files third (reference deleted contracts)
4. Frontend code last (may reference utilities being cleaned)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gas measurement | Custom gas profiling tool | `tx.receipt.gasUsed` from Truffle | Built into every transaction receipt |
| Old contract gas data | Re-run old GasMeasurement.test.js | Deploy old contract from git, measure in same E2E script | Old test references functions that no longer exist on new contract |
| Console error capture | Automated browser testing | Manual DevTools walkthrough + documented results | One-time audit, not worth automation overhead |

## Common Pitfalls

### Pitfall 1: Deleting Files Still Imported Elsewhere
**What goes wrong:** Deleting a file that is still imported causes build failures.
**Why it happens:** Imports may exist in unexpected places (App.js still imports buildStage3VC).
**How to avoid:** Before deleting any file, grep for all imports/requires of that file across the entire codebase.
**Warning signs:** Build fails after deletion.

**Known import chain to fix:**
- `App.js` line 12: `import { buildStage3VC } from "./utils/vcBuilder.mjs"` -- must remove import AND the `handleDelivery` function that uses it (lines 53-201)
- `App.js` line 13: `import { generateTxHashCommitmentBindingTag } from "./utils/commitmentUtils"` -- used only in handleDelivery, remove with it
- `App.js` line 9: `import { getCurrentCid } from "./utils/web3Utils"` -- used only in handleDelivery
- `App.js` line 11: `import { signVcWithMetamask } from "./utils/signVcWithMetamask"` -- used only in handleDelivery
- `ProductDetail.jsx` line 226: `onConfirmDelivery={handleDelivery}` prop -- will need to stop passing this

### Pitfall 2: Build Artifacts Not Matching Source
**What goes wrong:** Stale build artifacts (e.g., `ProductEscrow.json`) in `build/contracts/` reference a contract that no longer exists in `contracts/`.
**Why it happens:** Truffle does not automatically clean build artifacts when source files are deleted.
**How to avoid:** Manually delete stale build artifacts. Do NOT delete `ProductEscrow_Initializer.json`, `ProductFactory.json`, `MaliciousReentrant.json`, `ReentrancyGuard.json`, or OpenZeppelin artifacts (`Clones.json`, `Context.json`, `Ownable.json`, `Errors.json`, `Create2.json`).
**Safe to delete:** `ProductEscrow.json`, `IProductEscrow.json` (old interface).

### Pitfall 3: Old Tests That Look Like New Tests
**What goes wrong:** Some test files use `ProductEscrow_Initializer` artifacts but call old-interface functions (3-param createProduct, purchasePublic, etc.).
**Why it happens:** The old contract WAS named ProductEscrow_Initializer before the Phase 7 rewrite changed its API.
**How to avoid:** Categorize by function signatures, not by artifact names.

### Pitfall 4: Gas Comparison Apples-to-Oranges
**What goes wrong:** Old and new contracts have different function names and flows, making direct comparison misleading.
**Why it happens:** The redesign changed the flow fundamentally (purchasePublic vs recordPrivatePayment, revealAndConfirmDelivery vs confirmDelivery).
**How to avoid:** Map equivalent operations explicitly. Document that functions are not 1:1 but represent the "equivalent step" in each flow.

### Pitfall 5: MaliciousReentrant.sol Confusion
**What goes wrong:** Accidentally deleting MaliciousReentrant.sol or its build artifact, breaking EscrowBonds.test.js.
**Why it happens:** It looks like a test-only artifact from the old contract.
**How to avoid:** Per CONTEXT.md decision: KEEP `MaliciousReentrant.sol` and its test. It is actively used by EscrowBonds.test.js (new contract reentrancy tests).

## Code Examples

### E2E Test Script Structure

```javascript
// test/E2E_FullLifecycle.test.js
const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const ProductFactory = artifacts.require("ProductFactory");
const { toWei, randomHex, soliditySha3 } = web3.utils;

contract("E2E Full Lifecycle", accounts => {
  const [deployer, seller, buyer, transporter] = accounts;
  const BOND = toWei("0.01", "ether");
  const FEE  = toWei("0.005", "ether");
  const VCID = "ipfs://QmTestVcCidE2E";
  const gasLog = {};

  it("runs complete lifecycle and reports gas", async () => {
    // 1. Deploy
    const impl = await ProductEscrow_Initializer.new({ from: deployer });
    const factory = await ProductFactory.new(impl.address, { from: deployer });
    const setBondTx = await factory.setBondAmount(BOND, { from: deployer });
    gasLog["setBondAmount"] = setBondTx.receipt.gasUsed;

    // 2. Create product
    const commitment = randomHex(32);
    const createTx = await factory.createProduct("EV Battery Module", commitment, {
      from: seller, value: BOND
    });
    gasLog["createProduct"] = createTx.receipt.gasUsed;
    const escAddr = createTx.logs.find(l => l.event === "ProductCreated").args.product;
    const esc = await ProductEscrow_Initializer.at(escAddr);

    // 3. Record payment
    const memo = randomHex(32);
    const txRef = randomHex(32);
    const payTx = await esc.recordPrivatePayment(1, memo, txRef, { from: buyer });
    gasLog["recordPrivatePayment"] = payTx.receipt.gasUsed;

    // 4. Confirm order
    const confirmTx = await esc.confirmOrder(VCID, { from: seller });
    gasLog["confirmOrder"] = confirmTx.receipt.gasUsed;

    // 5. Transporter bid
    const bidTx = await esc.createTransporter(FEE, { from: transporter, value: BOND });
    gasLog["createTransporter"] = bidTx.receipt.gasUsed;

    // 6. Select transporter
    const selectTx = await esc.setTransporter(transporter, { from: seller, value: FEE });
    gasLog["setTransporter"] = selectTx.receipt.gasUsed;

    // 7. Confirm delivery
    const vcHash = soliditySha3({ type: "string", value: VCID });
    const deliverTx = await esc.confirmDelivery(vcHash, { from: transporter });
    gasLog["confirmDelivery"] = deliverTx.receipt.gasUsed;

    // 8. Verify final state
    assert.equal((await esc.phase()).toString(), "4"); // Phase.Delivered
    assert.equal(await esc.delivered(), true);

    // Output gas report
    console.log("\n========== GAS REPORT (New Contract) ==========");
    Object.entries(gasLog).forEach(([op, gas]) => {
      console.log(`  ${op}: ${gas} gas`);
    });
    console.log("================================================\n");
  });
});
```

### Gas Comparison: Operation Mapping

| Old Contract Operation | New Contract Operation | Notes |
|------------------------|----------------------|-------|
| `createProduct(name, commitment, price)` | `createProduct(name, commitment) + {value: bond}` | New includes bond deposit |
| `setPublicPriceWithCommitment(price, commitment)` | N/A (removed) | No public price in new flow |
| `purchasePublic({value: price})` | `recordPrivatePayment(id, memo, txRef)` | No ETH transfer in new (payment is off-chain via Railgun) |
| `confirmOrderWithCommitment(vcCID, commitment)` | `confirmOrder(vcCID)` | Simplified, no commitment param |
| `createTransporter(fee) + securityDeposit({value})` | `createTransporter(fee, {value: bond})` | Combined into single tx |
| `setTransporter(addr, {value: fee})` | `setTransporter(addr, {value: fee})` | Same signature |
| `revealAndConfirmDelivery(value, blinding, vcCID)` | `confirmDelivery(vcHash)` | Transporter calls (not buyer), hash-only |

## Dead Code Inventory

### Verified Dead: Contracts & Build Artifacts

| Item | Path | Reason | Confidence |
|------|------|--------|------------|
| Old ProductEscrow.sol | `contracts/ProductEscrow.sol` | Exists in git HEAD but superseded by ProductEscrow_Initializer.sol | HIGH |
| ProductEscrow.json | `build/contracts/ProductEscrow.json` | Build artifact for deleted contract | HIGH |
| IProductEscrow.json | `build/contracts/IProductEscrow.json` | Old interface artifact, not used by new contract | HIGH |

### Verified Dead: Test Files (18 files using old interface)

| File | Interface Used | External Deps | Confidence |
|------|----------------|---------------|------------|
| SimpleProductEscrow.test.js | OLD (3-param createProduct) | None | HIGH |
| GasMeasurement.test.js | OLD (purchasePublic, revealAndConfirmDelivery) | None | HIGH |
| ProductEscrow.confidential.test.js | OLD (depositPurchase, 3-param createProduct) | None | HIGH |
| ProductEscrow.railgun.comprehensive.test.js | OLD (references `ProductEscrow` artifact) | None | HIGH |
| ProductEscrow.railgun.test.js | OLD (references `ProductEscrow` artifact) | None | HIGH |
| EndToEndFlow.test.js | OLD (purchasePublic) | axios, ZKP backend | HIGH |
| AuditorScalability.test.js | OLD (purchasePublic) | axios, ZKP backend | HIGH |
| AuditorVerification.test.js | OLD (purchasePublic) | axios, ZKP backend | HIGH |
| FundsAccounting.test.js | OLD (purchasePublic) | None | HIGH |
| PhaseMachine.test.js | OLD (purchasePublic) | None | HIGH |
| Reentrancy.test.js | OLD (purchasePublic) | None | HIGH |
| StorageMeasurement.test.js | OLD (purchasePublic) | None | HIGH |
| LinkableCommitment.test.js | OLD (purchasePublic) | axios | HIGH |
| TxHashCommitment.test.js | OLD (purchasePublic) | axios | HIGH |
| PurchaseTxHashCommitment.test.js | OLD (purchasePublic) | axios | HIGH |
| DeliveryTxHashCommitment.test.js | OLD | axios | HIGH |
| SecurityVCIntegrity.test.js | OLD (purchasePublic) | axios | HIGH |
| TransactionVerification.test.js | OLD (purchasePublic) | axios | HIGH |
| IPFSCaching.test.js | OLD | axios | HIGH |
| SecurityReplaySwap.test.js | OLD | axios | HIGH |

### Verified Dead: Test Files - UNCLEAR (need individual assessment)

| File | Notes | Recommendation | Confidence |
|------|-------|----------------|------------|
| AccessControl.test.js | Uses OLD 3-param createProduct; tests factory ownership/pause | DELETE (uses old factory API with price param) | HIGH |
| BaselineComparison.test.js | Gas estimation utilities, no contract calls beyond createProduct | DELETE (theoretical gas modeling, not useful with new contract) | HIGH |
| FactoryPatternSavings.test.js | Uses OLD 3-param createProduct | DELETE | HIGH |
| ProductCreation.test.js | Uses 2-param createProduct (NO price) but does NOT use setBondAmount | INVESTIGATE - may be partially compatible or broken | MEDIUM |

### Verified KEEP: Test Files (3 files using new interface)

| File | Reason |
|------|--------|
| EscrowRedesign.test.js | New contract lifecycle tests (setBondAmount, recordPrivatePayment) |
| EscrowBonds.test.js | New contract bond/access/reentrancy tests |
| EscrowTimeouts.test.js | New contract timeout tests |

### Verified Dead: Old Railgun Directory (135 files)

| Path | File Count | Status |
|------|-----------|--------|
| `frontend/src/lib/railgun/` | 135 files | Zero imports found from any component. All components use `railgun-clean/`. Safe to delete entire directory. |

No component in `frontend/src/` imports from `lib/railgun/` -- all use `lib/railgun-clean/` exclusively (verified via grep).

### Verified Dead: Root-Level Dev Files

The following files in the project root are development artifacts that should be deleted:

**PowerShell/Script files:**
- `CHECK_NETWORK.ps1`, `test_step5.ps1`, `test-docker-setup.ps1`
- `test_full_flow_step7.js`, `test-railgun-flow.js`
- `NUL` (Windows artifact from incorrect redirect)

**Flattened contract:**
- `ProductFactory_flat.sol` (verification artifact, not needed)

**Development documentation (not README.md):**
- `CLONE_VERIFICATION_REPORT.md`, `COMPILATION_FIXES.md`, `COPY_FILES_INSTRUCTIONS.md`
- `diagnose_verification_failures.md`, `EVALUATION_READINESS_CHECKLIST.md`
- `FRESH_BUILD_TEST_RESULTS.md`, `JS_CONVERSION_PLAN.md`, `MESSAGE_TO_SUCCESSOR.md`
- `MIGRATION_DECISION.md`, `QUICK_SECURITY_CHECK.md`, `QUICK_START_FOR_TUTOR.md`
- All 13 `RAILGUN_*.md` files (cleanup plans/summaries from Phase 1)
- `REPRODUCIBILITY_CHECKLIST.md`, `SECURITY_TEST_SUMMARY.md`, `SECURITY_VERIFICATION_GUIDE.md`
- `START_GANACHE.md`, `SUBSQUID_REMOVAL_SUMMARY.md`, `TEST_DOCKER_SETUP.md`
- `test_step7_bug_fixes.md`, `TESTING_CHECKLIST.md`, `TROUBLESHOOTING_FACTORY_DEPLOYMENT.md`
- `VERIFICATION_TIMING_EXPLANATION.md`, `WIRING_STATUS.md`

**Other:**
- `commit_message.txt`, `sage.txt`, `test_verification_issues.html`

**KEEP:** `README.md`, `truffle-config.js`, `package.json`, `package-lock.json`, `docker-compose.yml`

Total root-level files to delete: ~40+ files

### Verified Dead: Frontend Code

| Item | Path | Why Dead | Confidence |
|------|------|----------|------------|
| `handleDelivery` function | `App.js` lines 53-201 | Uses old flow: buildStage3VC, signVcWithMetamask, getCurrentCid, ZKP backend, old confirmDelivery | HIGH |
| `buildStage3VC` import | `App.js` line 12 | Deprecated stub that throws | HIGH |
| `generateTxHashCommitmentBindingTag` import | `App.js` line 13 | Only used by handleDelivery | HIGH |
| `signVcWithMetamask` import | `App.js` line 11 | Only used by handleDelivery | HIGH |
| `getCurrentCid` import | `App.js` line 9 | Only used by handleDelivery | MEDIUM - verify no other callers |
| `onConfirmDelivery` prop | `App.js` line 226 | Props dead handleDelivery to ProductDetail | HIGH |
| Deprecated vcBuilder stubs | `vcBuilder.mjs` lines 293-303 | buildStage2VC, buildStage3VC - throw errors | HIGH |

### Verified Dead: Scripts Directory

| Item | Path | Reason |
|------|------|--------|
| `migrate-railgun-imports.js` | `scripts/migrate-railgun-imports.js` | One-time migration script from Phase 1 | HIGH |
| `check-size.js` | `scripts/check-size.js` | Development utility | MEDIUM |

### Verified Dead: Migration Scripts

| Item | Path | Reason | Confidence |
|------|------|--------|------------|
| `1_initial_migration.js` | `migrations/1_initial_migration.js` | Deploys without setBondAmount; uses old pattern | HIGH |

**KEEP:** `2_deploy_redesigned.js` (active migration with setBondAmount)

### Potentially Dead: Frontend Utilities

| Item | Path | Used By | Confidence |
|------|------|---------|------------|
| `commitmentUtils.js` | `frontend/src/utils/commitmentUtils.js` | Only App.js handleDelivery + tests | MEDIUM - check test files |
| `signVcWithMetamask.js` | `frontend/src/utils/signVcWithMetamask.js` | App.js + ProductFormStep3 + ProductDetail | MEDIUM - check if new flow still uses it |
| `verifyZKP.js` | `frontend/src/utils/verifyZKP.js` | Unknown | LOW - needs investigation |
| `verifyVc.js` | `frontend/src/utils/verifyVc.js` | ProductDetail imports fetchVCFromServer | KEEP |

## Gas Comparison Strategy

### Approach: Deploy Old Contract from Git History

The old contract exists in git history. Strategy:

1. **Retrieve old contract source:** `git show <old-commit>:contracts/ProductEscrow_Initializer.sol`
2. **Problem:** Cannot compile two versions of same contract name simultaneously in Truffle.
3. **Better approach:** Run old gas measurement FIRST (checkout old contract, run test, capture output), then switch back to new contract and run new gas measurement.
4. **Simplest approach:** Hard-code old gas numbers from the existing `GasMeasurement.test.js` output if it was ever run, OR manually extract from git and run once.

**Recommended approach:** Write the E2E test to capture new contract gas numbers. For old contract numbers, either:
- (a) Run `GasMeasurement.test.js` against the old contract from git history in a temporary checkout, OR
- (b) Use the `BaselineComparison.test.js` theoretical estimates if actual measurements aren't available.

Since the operations don't map 1:1, the gas comparison table should clearly document the flow differences.

### Key Operations to Compare

| Operation | Old Contract Function | New Contract Function |
|-----------|----------------------|----------------------|
| Deploy Factory | `ProductFactory.new(impl)` | Same |
| Create Product | `createProduct(name, commitment, price)` | `createProduct(name, commitment) {value: bond}` |
| Purchase | `purchasePublic({value})` | `recordPrivatePayment(id, memo, txRef)` |
| Confirm Order | `confirmOrderWithCommitment(cid, commitment)` | `confirmOrder(cid)` |
| Transporter Setup | `createTransporter(fee) + securityDeposit({value})` | `createTransporter(fee, {value: bond})` |
| Select Transporter | `setTransporter(addr, {value: fee})` | Same signature |
| Confirm Delivery | `revealAndConfirmDelivery(value, blinding, cid)` | `confirmDelivery(hash)` |

## Console Error Audit Approach

### Known SDK Noise (from CONTEXT.md allowlist)
- Railgun SDK initialization logs
- POI sync messages
- Quick-sync fallback warnings (expected from empty stubs)
- React dev mode warnings (strict mode double-render)

### Audit Process
1. Run `npm run build` in frontend/
2. Serve with `npx serve -s build`
3. Open DevTools, clear console
4. Walk through: connect wallet -> view marketplace -> create product -> view product detail
5. Capture all console output
6. Categorize: App Error | App Warning | SDK Noise | Framework Noise
7. Also run dev mode (`npm start`) and capture differences

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 3-param createProduct with price | 2-param createProduct with bond-as-value | Phase 7 (2026-02-16) | All old tests incompatible |
| purchasePublic (ETH transfer) | recordPrivatePayment (no ETH, Railgun reference) | Phase 7 | Fundamentally different purchase flow |
| Buyer confirms delivery | Transporter confirms delivery via hash | Phase 7 | Different actor, different verification |
| 3-stage VC chain | Single append-only VC | Phase 8 (2026-02-17) | buildStage2VC/buildStage3VC deprecated |
| Multiple Railgun directories | Single railgun-clean/ | Phase 1 (2026-01-21) | Old railgun/ directory is dead code |

## Open Questions

1. **ProductCreation.test.js compatibility**
   - What we know: Uses 2-param createProduct (no price) but does not call setBondAmount
   - What's unclear: Whether it will pass with the new factory that requires bondAmount > 0
   - Recommendation: Test it; likely fails due to BondAmountNotSet error. Delete if broken.

2. **Old contract gas data availability**
   - What we know: GasMeasurement.test.js exists with old interface; old contract exists in git history
   - What's unclear: Whether these tests were ever run and output captured
   - Recommendation: Retrieve old contract from git, deploy it in a temporary test, measure gas, then delete. Or just note "old gas data unavailable" and measure new only.

3. **signVcWithMetamask.js usage scope**
   - What we know: Imported by App.js (dead handleDelivery), ProductFormStep3.jsx, and ProductDetail.jsx
   - What's unclear: Whether ProductFormStep3 and ProductDetail use the v2.0 signing function or the old one
   - Recommendation: Check during implementation; keep if used by v2.0 flow.

4. **test/fixtures/ directory**
   - What we know: Directory exists in test/
   - What's unclear: Contents and whether they're used by new or old tests
   - Recommendation: Check contents; delete if only used by old tests.

## Sources

### Primary (HIGH confidence)
- Direct codebase investigation of all files mentioned
- `contracts/ProductEscrow_Initializer.sol` - verified current contract API
- `contracts/ProductFactory.sol` - verified createProduct signature (2 params + value)
- `test/EscrowRedesign.test.js` - verified new test pattern
- `test/GasMeasurement.test.js` - verified old interface usage
- `frontend/src/lib/railgun/` - verified 135 files, zero imports
- `frontend/src/App.js` - verified dead handleDelivery function
- grep across entire codebase for import chains

### Secondary (MEDIUM confidence)
- Git history check for old ProductEscrow.sol (confirmed in HEAD)
- Test file categorization via function signature grep

## Metadata

**Confidence breakdown:**
- Dead code inventory: HIGH - directly verified via grep and file inspection
- E2E test pattern: HIGH - based on existing EscrowRedesign.test.js proven pattern
- Gas comparison strategy: MEDIUM - old contract gas data retrieval needs validation
- Console audit: HIGH - process is straightforward manual walkthrough

**Research date:** 2026-02-18
**Valid until:** 2026-03-18 (stable codebase, no external dependencies)
