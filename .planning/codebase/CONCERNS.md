# Codebase Concerns

**Analysis Date:** 2026-01-20

## Tech Debt

**Massive serve-html.ts File (11,360 lines):**
- Issue: Single TypeScript file handles entire Railgun backend API - monolithic, hard to maintain
- Files: `frontend/src/lib/serve-html.ts`
- Impact: Difficult to test, debug, and modify. Changes risk breaking unrelated functionality
- Fix approach: Split into modules: `engine-init.ts`, `wallet-management.ts`, `transaction-handling.ts`, `api-routes.ts`, `callbacks.ts`

**Duplicate Railgun Implementation Files:**
- Issue: Multiple overlapping Railgun implementations causing confusion
- Files:
  - `frontend/src/lib/railgun-clean/` (new structure)
  - `frontend/src/lib/railgun-legacy-shim.js`
  - `frontend/src/lib/railgun-browser-init.js`
  - `frontend/src/lib/railgun-client-browser.js`
- Impact: Inconsistent API usage, redundant code, unclear which to use
- Fix approach: Complete migration to `railgun-clean/`, remove legacy shims, update all imports

**TODO Comments Indicating Incomplete Features:**
- Issue: Multiple TODO comments for unimplemented Railgun features
- Files:
  - `frontend/src/components/railgun/PrivateFundsDrawer.jsx:30` - "Update to use new Railgun structure"
  - `frontend/src/components/railgun/PrivateFundsDrawer.jsx:115` - "Implement wrapETHtoWETH in new structure"
  - `frontend/src/components/railgun/PrivateFundsDrawer.jsx:153` - "Implement estimateShieldWETH in new structure"
  - `frontend/src/components/railgun/PrivatePaymentModal.jsx:9` - "Update to use new Railgun structure"
  - `frontend/src/components/railgun/RailgunConnectionButton.jsx:4` - "Update to use new Railgun structure"
  - `frontend/src/components/marketplace/ProductFormStep2_5_Railgun.jsx:4,6` - Multiple TODOs
- Impact: Features like ETH wrapping and shielding are stubbed with errors
- Fix approach: Implement each TODO, starting with wrapETHtoWETH, then remove legacy shim

**Debug Code Left in Production:**
- Issue: Debug events, console.log statements, and debug endpoints remain in codebase
- Files:
  - `contracts/ProductEscrow.sol:112-114` - Debug events (Debug, DebugUint, DebugBool)
  - `frontend/src/lib/serve-html.ts:5415` - TEST/DEBUG ENDPOINTS section
  - 2,227 console.log/warn/error calls across 52 frontend files
- Impact: Performance overhead, log noise, potential information leakage
- Fix approach: Remove debug events from contract, gate debug endpoints behind env flag, implement proper logging library

**Solidity Custom Errors Commented Out:**
- Issue: Gas-saving custom errors disabled for Truffle v5 compatibility
- Files: `contracts/ProductEscrow.sol:4-22`
- Impact: Higher gas costs, less descriptive error messages
- Fix approach: Upgrade Truffle or migrate to Hardhat which supports custom errors

**Excessive TypeScript `any` Usage:**
- Issue: 50+ uses of `any` type defeating TypeScript benefits
- Files:
  - `frontend/src/lib/serve-html.ts` - 30+ any casts
  - `frontend/src/lib/poi/poi-node-request.ts` - Multiple any params
- Impact: Runtime type errors, reduced IDE assistance
- Fix approach: Define proper interfaces for SDK types, replace any with specific types

## Known Bugs

**SDK UTXO Scan Reset at 50%:**
- Symptoms: UTXO merkletree scan resets at 50% progress, never completes
- Files: `frontend/src/lib/serve-html.ts:1028`
- Trigger: Race condition between write queue flush and gap detection in SDK
- Workaround: Code patches slowSyncV2 method (lines 128-176), monitors for reset pattern and resolves anyway

**Wallet Display Bug (Buyer/Seller Address Confusion):**
- Symptoms: Wrong wallet addresses displayed for buyer/seller
- Files: `frontend/src/components/marketplace/ProductDetail.jsx:111`
- Trigger: State updates during wallet changes
- Workaround: Separate state variables for buyerEOA, sellerEOA, buyerRailgun, sellerRailgun (lines 112-115)

## Security Considerations

**API Keys in Environment Files:**
- Risk: Alchemy API key exposed in committed .env files
- Files:
  - `backend/railgun/.env:8` - Contains Alchemy API key
  - `.env:1` - Contains Sepolia RPC with API key
- Current mitigation: Files are in .gitignore but appear in git status as modified
- Recommendations: Rotate exposed keys, ensure .env files in .gitignore, use secrets manager

**OPAQUE_HANDLE_SECRET in .env:**
- Risk: Cryptographic secret stored in plaintext config file
- Files: `backend/railgun/.env:3`
- Current mitigation: None visible
- Recommendations: Use environment variables from secrets manager, not file-based config

**Backend Stores Wallet Mnemonics:**
- Risk: Backend API stores and returns wallet mnemonics on request
- Files: `frontend/src/lib/railgun-legacy-shim.js:21-56` - fetchWalletCredentials function
- Current mitigation: HTTPS assumed for API calls
- Recommendations: Consider client-side key generation, or hardware wallet integration

**Excessive localStorage Usage:**
- Risk: Sensitive wallet connection data stored in browser localStorage
- Files: Multiple files (50+ localStorage calls)
  - `frontend/src/components/railgun/PrivatePaymentModal.jsx` - 21 calls
  - `frontend/src/components/marketplace/ProductDetail.jsx` - 23 calls
  - `frontend/src/lib/railgun-legacy-shim.js` - 5 calls
- Current mitigation: Only walletID stored, not mnemonic
- Recommendations: Audit all localStorage usage, consider sessionStorage for sensitive data

**Global Window Variables for State:**
- Risk: Using window._ prefixed globals for state creates XSS attack surface
- Files: `frontend/src/components/railgun/PrivatePaymentModal.jsx:79-240`
- Current mitigation: None
- Recommendations: Use React context or state management library instead of window globals

## Performance Bottlenecks

**Large Generated GraphQL Schema Files:**
- Problem: Introspection schema files are 27,556 lines each
- Files: `frontend/src/lib/railgun/railgun-txids/graphql/.graphclient/sources/*/introspectionSchema.ts` (5 files)
- Cause: Auto-generated GraphQL client includes full introspection
- Improvement path: Configure graphclient to exclude introspection, or lazy-load schemas

**Large Component Files:**
- Problem: Key components exceed 1,500 lines
- Files:
  - `frontend/src/components/marketplace/ProductDetail.jsx` - 2,265 lines
  - `frontend/src/components/railgun/PrivatePaymentModal.jsx` - 1,574 lines
- Cause: Feature accumulation without refactoring
- Improvement path: Extract subcomponents, separate concerns into custom hooks

**Synchronous Balance Refresh on Every Drawer Open:**
- Problem: refreshBalances called twice when PrivateFundsDrawer opens
- Files: `frontend/src/components/railgun/PrivateFundsDrawer.jsx:76,85`
- Cause: useEffect calls refreshBalances, then duplicate call at line 85
- Improvement path: Remove duplicate call, add debouncing

## Fragile Areas

**PrivatePaymentModal Connection State Machine:**
- Files: `frontend/src/components/railgun/PrivatePaymentModal.jsx:77-240`
- Why fragile: Complex multi-step connection detection with window globals, timers, check counts
- Safe modification: Add extensive logging, write integration tests before changing
- Test coverage: No automated tests for connection flow

**ProductDetail VC Signing Flow:**
- Files: `frontend/src/components/marketplace/ProductDetail.jsx:1200-1450`
- Why fragile: Multi-party signing with localStorage persistence, complex state dependencies
- Safe modification: Trace full flow before changes, test with multiple wallets
- Test coverage: No unit tests for React components

**Railgun SDK Monkey Patching:**
- Files: `frontend/src/lib/serve-html.ts:128-176`
- Why fragile: Patches private SDK method (slowSyncV2) via prototype manipulation
- Safe modification: SDK updates may break patch, needs verification on every upgrade
- Test coverage: Manual verification only

## Scaling Limits

**SQLite Database for Railgun Data:**
- Current capacity: Single-user development/demo
- Limit: Concurrent writes will block, no horizontal scaling
- Scaling path: Migrate to PostgreSQL for multi-user production

**Single Backend Instance:**
- Current capacity: One user at a time for Railgun operations
- Limit: Engine initialization is singleton, wallet cache is in-memory Map
- Scaling path: Redis for wallet cache, stateless API design, separate engine service

## Dependencies at Risk

**@railgun-community/wallet SDK:**
- Risk: Complex privacy SDK with documented bugs (50% scan reset)
- Impact: Core functionality depends on SDK working correctly
- Migration plan: Monitor SDK releases, maintain workaround patches

**Deprecated Network Names:**
- Risk: Multiple deprecated network names still referenced
- Files:
  - `frontend/src/lib/transactions/tx-gas-details.ts:85-88`
  - `frontend/src/lib/railgun/railgun-txids/quick-sync/txid-graphql-client.ts:22-25`
- Impact: Future SDK updates may remove these
- Migration plan: Remove deprecated network handling code

**setSignerAndProvider Deprecated:**
- Risk: Legacy shim marks functions as deprecated but still used
- Files: `frontend/src/lib/railgun-legacy-shim.js:307,311`
- Impact: Components using legacy API will need updates
- Migration plan: Complete migration to railgun-clean module

## Missing Critical Features

**ETH Wrapping/Shielding Not Implemented:**
- Problem: wrapETHtoWETH throws "not yet implemented" error
- Files: `frontend/src/components/railgun/PrivateFundsDrawer.jsx:116`
- Blocks: Users cannot shield ETH for private payments

**No Rate Limiting on Backend APIs:**
- Problem: All Railgun API endpoints exposed without rate limiting
- Files: `backend/railgun/api/railgun-api.js`
- Blocks: Production deployment, DoS protection

## Test Coverage Gaps

**No Frontend Component Tests:**
- What's not tested: All React components (ProductDetail, PrivatePaymentModal, PrivateFundsDrawer, etc.)
- Files: `frontend/src/components/`
- Risk: UI regressions go unnoticed, refactoring is risky
- Priority: High

**Smart Contract Tests Exist But No CI:**
- What's not tested: Automated test execution on commits
- Files: `test/*.test.js` (24 test files exist)
- Risk: Tests may break silently, coverage may decrease
- Priority: Medium

**Integration Tests Missing:**
- What's not tested: Full flow (frontend -> backend -> contract -> IPFS -> Railgun)
- Files: No integration test suite
- Risk: Component integration failures missed
- Priority: High

**Railgun SDK Integration Tests:**
- What's not tested: Private payment flow end-to-end
- Files: `frontend/src/lib/railgun-clean/`, `frontend/src/lib/serve-html.ts`
- Risk: SDK updates may break integration silently
- Priority: Medium

---

*Concerns audit: 2026-01-20*
