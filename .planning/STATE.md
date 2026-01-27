# Project State

**Updated:** 2026-01-27

## Current Position

- **Phase:** 5 of 6 (Private Transfer) - Plan 1 complete
- **Plan:** 1 of ? in phase
- **Status:** Phase 5 Plan 1 complete, ready for Plan 2 (UI Integration)

Progress: [========================------] 5/6 phases in progress

Last activity: 2026-01-27 - Completed 05-01-PLAN.md (Private Transfer Core)

## Living Memory

### Key Decisions

| ID | Decision | Rationale | Phase |
|----|----------|-----------|-------|
| deprecated-stubs | Use console.warn stubs for deprecated functions | Allows components to still call deprecated functions without breaking | 01-01 |
| alias-pattern | Use aliases for backward compatibility (privateTransfer -> paySellerV2) | Components use different names for same function | 01-01 |
| sdk-direct | Connection uses SDK via railgun-client-browser.js | Clean dependency - no legacy shim imports | 01-01 |
| top-level-imports | Use top-level named imports instead of dynamic imports | Cleaner code, better tree-shaking, easier to track dependencies | 01-02 |
| keep-client-browser | Keep railgun-client-browser.js | railgun-clean modules depend on it for SDK access | 01-03 |
| fixed-signing-message | Use fixed signing message (no timestamp) | Same signature always produces same encryption key - deterministic wallet recovery | 02-01 |
| pbkdf2-100k | PBKDF2 with 100k iterations for key derivation | Balance between brute-force resistance and user experience | 02-01 |
| encrypted-payload-format | Store { iv, salt, data } arrays in localStorage | JSON-serializable, self-contained encrypted payload | 02-01 |
| retry-with-backoff | SDK init retries 3 times with exponential backoff | Silent failure recovery before showing errors to user | 02-02 |
| optional-signer | wrapETHtoWETH obtains signer from MetaMask if not provided | PrivateFundsDrawer calls without signer - auto-resolution enables existing UI | 03-01 |
| friendly-errors | User-facing error messages instead of technical errors | "MetaMask not connected" instead of "Signer required" | 03-01 |
| signature-derived-key | Derive encryptionKey from signature (not stored in localStorage) | Better security - key only exists transiently during operations | 05-01 |
| bigint-transfer-amounts | Use BigInt for transfer amounts (not string like shield) | SDK transfer functions expect BigInt, shield uses string | 05-01 |
| memo-txref-return | Return memoHash and railgunTxRef from privateTransfer | Required for Phase 6 on-chain recording via recordPrivatePayment() | 05-01 |

### Issues Log

- ~~Multiple duplicate Railgun implementations causing confusion~~ RESOLVED (Phase 1)
- ~~11,360-line serve-html.ts monolith needs extraction~~ RESOLVED (Phase 1 Plan 3 - deleted)
- ~~Non-deterministic wallet creation due to timestamp in signing message~~ RESOLVED (Phase 2 Plan 1)
- ~~wrapETHtoWETH signer parameter required~~ RESOLVED (Phase 3 Plan 1 - now optional)
- ~~SDK.getPrivateBalances not available~~ RESOLVED (Phase 4 - balance callback pattern)
- ~~Shielding and private balances~~ RESOLVED (Phase 4 - full shield flow working)

### Context

**PHASE 5 PLAN 1 COMPLETE!**

Private transfer core function implemented:
- 3-step SDK flow: gasEstimateForUnprovenTransfer -> generateTransferProof -> populateProvedTransfer
- encryptionKey derived from MetaMask signature (not stored)
- Progress callback for UI during 20-30 second proof generation
- Returns memoHash and railgunTxRef for on-chain recording (Phase 6)

Key pattern established: operations/ subdirectory for complex SDK operations.

Next: UI integration to connect privateTransfer to PrivatePaymentModal.

## Session Continuity

- **Last session:** 2026-01-27
- **Stopped at:** Completed 05-01-PLAN.md
- **Resume file:** .planning/phases/05-private-transfer/05-02-PLAN.md (when created)

## Commits This Session

| Hash | Message |
|------|---------|
| fbd1b77d | feat(05-01): create transfer.js with 3-step SDK flow |
| 23921d55 | feat(05-01): export privateTransfer from index.js |

## Phase 1 Summary

**Total cleanup impact:**
- 12,531 lines of dead code deleted
- ~555KB of unnecessary files removed
- 6 Railgun components updated to clean imports
- Single source of truth established (railgun-clean/)

## Phase 2 Summary

**Wallet connection features:**
- Encrypted mnemonic storage with AES-GCM (crypto.js)
- Fixed signing message for deterministic key derivation
- Copy button for Railgun address
- Retry logic for SDK initialization (3 attempts, exponential backoff)
- Improved UX (SVG spinner, friendly error messages)

## Phase 3 Summary

**ETH to WETH wrapping:**
- wrapETHtoWETH function with auto-signer resolution
- Optional signer pattern established
- User-friendly transaction error messages

## Phase 4 Summary

**WETH Shielding:**
- Fixed SDK parameter types (networkName vs chain)
- Side-by-side Public/Private balance display
- Spinner with "Shielding WETH..." during operation
- Toast with Etherscan link on success
- Pending balance indicator
- Non-blocking balance refresh (transaction success is what matters)

## Phase 5 Summary

**Private Transfer Core:**
- privateTransfer function with 3-step SDK flow
- encryptionKey derived from signature (better security)
- Progress callback during proof generation
- Returns memoHash and railgunTxRef for Phase 6
- operations/ subdirectory pattern established

---

*Last updated: 2026-01-27*
