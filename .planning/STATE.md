# Project State

**Updated:** 2026-02-05

## Current Position

- **Phase:** 6 of 6 (On-Chain Recording)
- **Plan:** 1 of 2 in phase - COMPLETE
- **Status:** Phase 6 Plan 1 complete, ready for Phase 6 Plan 2 (UI updates)

Progress: [██████████████████████████████████] 6/6 phases in progress (Plan 1/2 done)

Last activity: 2026-02-05 - Completed 06-01-PLAN.md (recordPrivatePayment flow)

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
| quick-sync-empty-stubs | Quick-sync stubs return empty arrays instead of throwing | SDK falls back to on-chain scanning - slower but reliable | 05-02 |
| immediate-recording | recordPrivatePayment called in same flow as privateTransfer | Single-step purchase flow for better UX | 06-01 |
| preflight-static-call | Preflight check with staticCall before sending tx | Catches contract errors before gas is spent | 06-01 |
| gas-headroom-20pct | Gas estimation with 20% buffer | Prevents out-of-gas failures on recording tx | 06-01 |

### Issues Log

- ~~Multiple duplicate Railgun implementations causing confusion~~ RESOLVED (Phase 1)
- ~~11,360-line serve-html.ts monolith needs extraction~~ RESOLVED (Phase 1 Plan 3 - deleted)
- ~~Non-deterministic wallet creation due to timestamp in signing message~~ RESOLVED (Phase 2 Plan 1)
- ~~wrapETHtoWETH signer parameter required~~ RESOLVED (Phase 3 Plan 1 - now optional)
- ~~SDK.getPrivateBalances not available~~ RESOLVED (Phase 4 - balance callback pattern)
- ~~Shielding and private balances~~ RESOLVED (Phase 4 - full shield flow working)
- ~~Quick-sync stub files throwing errors, breaking SDK sync~~ RESOLVED (Phase 5 - stubs now return empty arrays)

### Context

**PHASE 6 PLAN 1 COMPLETE!**

On-chain recording flow implemented:
- decodeContractError function handles all 9 ProductEscrow custom errors
- recordPrivatePayment called immediately after privateTransfer succeeds
- Preflight check with staticCall validates before sending transaction
- Gas estimation with 20% headroom
- localStorage status: pending -> recording -> confirmed
- Success toast with Etherscan link

Next: Phase 6 Plan 2 - UI updates to show purchase status.

## Session Continuity

- **Last session:** 2026-02-05
- **Stopped at:** Completed 06-01-PLAN.md
- **Next:** Phase 6 Plan 2 (UI updates)
- **Resume file:** .planning/phases/06-on-chain-recording/06-02-PLAN.md

## Commits This Session

| Hash | Message |
|------|---------|
| 02cb7399 | feat(06-01): add decodeContractError for ProductEscrow errors |
| c4110ee2 | feat(06-01): add recordPrivatePayment flow to PrivatePaymentModal |

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

## Phase 6 Summary (In Progress)

**On-Chain Recording:**
- Plan 1 COMPLETE: recordPrivatePayment flow in PrivatePaymentModal
- decodeContractError for user-friendly error messages
- Preflight check with staticCall pattern
- Gas estimation with 20% headroom
- Success toast with Etherscan link

---

*Last updated: 2026-02-05*
