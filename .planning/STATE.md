# Project State

**Updated:** 2026-01-21

## Current Position

- **Phase:** 2 of 6 (Wallet Connection)
- **Plan:** 1 of 2 complete
- **Status:** In progress

Progress: [==========--------------------] 2/6 phases in progress

Last activity: 2026-01-21 - Completed 02-01-PLAN.md (Encrypted Mnemonic Storage)

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

### Issues Log

- ~~Multiple duplicate Railgun implementations causing confusion~~ RESOLVED (Phase 1)
- ~~11,360-line serve-html.ts monolith needs extraction~~ RESOLVED (Phase 1 Plan 3 - deleted)
- ~~Non-deterministic wallet creation due to timestamp in signing message~~ RESOLVED (Phase 2 Plan 1)
- `wrapETHtoWETH` now implemented in shield.js

### Context

**PHASE 2 IN PROGRESS**

Plan 01 complete - Encrypted mnemonic storage:
- crypto.js created with AES-GCM encryption utilities
- connection.js uses fixed signing message
- Mnemonic encrypted before localStorage storage
- createWalletFromSignature accepts mnemonic for wallet restoration

Remaining: Plan 02 (if exists)

Current Railgun wallet flow:
1. User signs fixed message with MetaMask
2. Signature used to derive AES-256 encryption key via PBKDF2
3. Mnemonic encrypted with AES-GCM before storage
4. Same signature always decrypts same mnemonic (wallet persistence)

## Session Continuity

- **Last session:** 2026-01-21
- **Stopped at:** Completed 02-01-PLAN.md
- **Resume file:** .planning/phases/02-wallet-connection/02-02-PLAN.md

## Commits This Session

| Hash | Message |
|------|---------|
| dedd6b57 | feat(02-01): create crypto.js with AES-GCM encryption utilities |
| bfcc0296 | feat(02-01): update connection.js with fixed signing message and encrypted storage |
| 0bd59f5c | feat(02-01): update createWalletFromSignature to accept optional mnemonic |

## Phase 1 Summary

**Total cleanup impact:**
- 12,531 lines of dead code deleted
- ~555KB of unnecessary files removed
- 6 Railgun components updated to clean imports
- Single source of truth established (railgun-clean/)

## Phase 2 Progress

**Plan 01 complete:**
- Encrypted mnemonic storage with AES-GCM
- Fixed signing message for deterministic key derivation
- 3 files created/modified

---

*Last updated: 2026-01-21*
