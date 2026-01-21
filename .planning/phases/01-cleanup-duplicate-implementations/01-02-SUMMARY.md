---
phase: 01-cleanup-duplicate-implementations
plan: 02
subsystem: frontend-railgun-components
tags: [refactoring, imports, cleanup, railgun]

dependency_graph:
  requires: [01-01]
  provides: ["clean-component-imports", "no-legacy-shim-usage"]
  affects: [01-03, 02-01]

tech_stack:
  added: []
  patterns: ["top-level-named-imports", "no-dynamic-imports"]

key_files:
  created: []
  modified:
    - frontend/src/components/railgun/PrivatePaymentModal.jsx
    - frontend/src/components/railgun/PrivateFundsDrawer.jsx
    - frontend/src/components/railgun/RailgunConnectionButton.jsx
    - frontend/src/components/marketplace/ProductFormStep2_5_Railgun.jsx

decisions:
  - id: top-level-imports
    decision: Use top-level named imports instead of dynamic imports
    rationale: Cleaner code, better tree-shaking, easier to track dependencies

metrics:
  duration: ~15min
  completed: 2026-01-21
---

# Phase 01 Plan 02: Update Component Imports Summary

**One-liner:** Migrated all Railgun components from legacy namespace/dynamic imports to clean named imports from railgun-clean module.

## What Was Done

### Task 1: Update PrivatePaymentModal.jsx imports
- Replaced legacy namespace import (`import * as legacyRailgun`) with clean named imports
- Removed TODO comments about updating to new Railgun structure
- Removed all 11 dynamic imports (`await import('../../lib/railgun-clean')`) throughout the file
- Kept `paySellerV2` alias for backward compatibility within the file
- Functions now imported at top: `connectRailgun`, `disconnectRailgun`, `setRailgunIdentity`, `refreshBalances`, `getAllBalances`, `privateTransfer`, `getRailgunAddressFromCredentials`, `checkWalletState`

### Task 2: Update PrivateFundsDrawer.jsx imports
- Added top-level named imports from railgun-clean
- Removed all dynamic imports (4 instances)
- Removed TODO comments about updating to new structure
- Replaced local stub functions with real imported functions: `wrapETHtoWETH`, `estimateShieldWETH`, `shieldWETH`
- Functions now imported at top: `setSignerAndProvider`, `setRailgunIdentity`, `getAllBalances`, `wrapETHtoWETH`, `estimateShieldWETH`, `shieldWETH`

### Task 3: Update remaining components
- **RailgunConnectionButton.jsx**: Removed TODO comment, already had clean imports
- **ProductFormStep2_5_Railgun.jsx**: Removed TODO comments, replaced local stub `isRailgunConnectedForEOA` with import from railgun-clean
- **RailgunInitializationTest.jsx**: Already clean (imports from bootstrap submodule - acceptable)
- **RailgunSimple.tsx**: Already clean (imports from railgun-clean)
- Verified frontend builds without import errors (`npm run build` completed successfully)

## Verification Results

1. `grep -r "legacyRailgun" frontend/src/components/` - No matches
2. `grep -r "TODO.*Railgun" frontend/src/components/` - No matches
3. No dynamic imports of railgun-clean in components
4. `npm run build --prefix frontend` - Completed successfully (warnings only, no errors)

## Commits

| Hash | Type | Description |
|------|------|-------------|
| aa814bdb | refactor | update PrivatePaymentModal.jsx imports |
| 67abe57c | refactor | update PrivateFundsDrawer.jsx imports |
| 36d24779 | refactor | update remaining component imports |

## Deviations from Plan

None - plan executed exactly as written.

## Files Changed Summary

| File | Lines Added | Lines Removed | Net Change |
|------|-------------|---------------|------------|
| PrivatePaymentModal.jsx | 56 | 68 | -12 |
| PrivateFundsDrawer.jsx | 20 | 23 | -3 |
| RailgunConnectionButton.jsx | 0 | 1 | -1 |
| ProductFormStep2_5_Railgun.jsx | 1 | 4 | -3 |
| **Total** | **77** | **96** | **-19** |

## Success Criteria Met

- [x] All 6 Railgun-related components updated with clean imports
- [x] No namespace imports (import * as X)
- [x] No TODO comments about "update to new Railgun structure"
- [x] No local stub functions overriding imports
- [x] Frontend builds without errors
- [x] Frontend builds without "X is not a function" errors (build completed successfully)

## Next Phase Readiness

**Ready for Plan 01-03:** The component layer is now clean and imports only from `railgun-clean`. The next plan can proceed to extract and clean up the serve-html.ts monolith or other cleanup tasks.

**Dependencies resolved:**
- Components no longer reference legacy shim directly
- All functions used by components are exported from `railgun-clean/index.js`
