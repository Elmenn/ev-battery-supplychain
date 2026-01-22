# Project State

**Updated:** 2026-01-22

## Current Position

- **Phase:** 2 of 6 (Wallet Connection) - COMPLETE
- **Plan:** 2 of 2 complete
- **Status:** Phase complete, ready for Phase 3

Progress: [==========--------------------] 2/6 phases complete

Last activity: 2026-01-22 - Completed 02-02-PLAN.md (UX Improvements)

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

### Issues Log

- ~~Multiple duplicate Railgun implementations causing confusion~~ RESOLVED (Phase 1)
- ~~11,360-line serve-html.ts monolith needs extraction~~ RESOLVED (Phase 1 Plan 3 - deleted)
- ~~Non-deterministic wallet creation due to timestamp in signing message~~ RESOLVED (Phase 2 Plan 1)
- `SDK.getPrivateBalances not available` - balance fetching issue (Phase 3/4 scope)
- `wrapETHtoWETH` now implemented in shield.js

### Context

**PHASE 2 COMPLETE!**

Wallet connection flow working end-to-end:
- User clicks Connect Railgun button
- MetaMask prompts for signature (fixed message: "Railgun Wallet Encryption Key")
- Mnemonic encrypted with AES-GCM and stored in localStorage
- Railgun address displayed with copy button
- Connection persists across page refreshes (same signature decrypts same mnemonic)
- Retry logic handles SDK initialization failures silently

Human verification passed - user tested full flow.

## Session Continuity

- **Last session:** 2026-01-22
- **Stopped at:** Completed Phase 2
- **Resume file:** .planning/phases/03-eth-to-weth-wrapping/ (when created)

## Commits This Session

| Hash | Message |
|------|---------|
| dedd6b57 | feat(02-01): create crypto.js with AES-GCM encryption utilities |
| bfcc0296 | feat(02-01): update connection.js with fixed signing message and encrypted storage |
| 0bd59f5c | feat(02-01): update createWalletFromSignature to accept optional mnemonic |
| cd70ba84 | docs(02-01): complete encrypted mnemonic storage plan |
| e53fdf74 | feat(02-02): add retry wrapper to connection.js |
| b015cc25 | feat(02-02): update RailgunConnectionButton with copy button and improved UX |
| 5752151b | docs(02-02): complete UX improvements plan |

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

---

*Last updated: 2026-01-22*
