# Project State

**Updated:** 2026-02-17

## Current Position

- **Phase:** 8 of 10 (Single VC Architecture)
- **Plan:** 3 of 3 in phase
- **Status:** Phase 8 complete

Progress: [████████████████████████████░░░░░░] ~88% (15/17 plans complete)

Last activity: 2026-02-17 - Completed 08-03-PLAN.md (VC verifier utility)

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
| bond-at-creation | Seller bond deposited during factory.createProduct (single tx) | Better UX: one transaction for product creation + bond staking | 07-01 |
| transporter-bond-at-bid | Transporter stakes bond in createTransporter (combined bid + bond) | One transaction instead of two separate calls | 07-01 |
| withdrawbid-in-expired | withdrawBid allowed in both OrderConfirmed and Expired phases | Simplest, safest approach for transporters to reclaim bonds after timeout | 07-01 |
| bond-forwarding-pattern | Factory createProduct{value} -> clone initialize{value} -> sellerBond | Clean ETH forwarding through factory to clone at creation time | 07-01 |
| per-clone-memo-replay | usedMemoHash is per-clone storage; cross-product replay relies on separate contracts | Each escrow clone has its own storage so memo hashes don't collide | 07-02 |
| reentrancy-trycatch-pattern | MaliciousReentrant uses try/catch so outer call succeeds while re-entry blocked | Verifies ReentrancyGuard works without failing the entire transaction | 07-02 |
| fcfs-buyer | First non-seller caller of recordPrivatePayment becomes buyer (no pre-designation) | Open marketplace pattern — cleaner than requiring seller to designate buyer | 07-FCFS |
| vc-schema-v2 | schemaVersion "2.0" for append-only VCs vs old "1.0" stage-based | Clear distinction between old and new VC formats | 08-01 |
| zero-addr-holder | Unknown buyer uses ZeroAddress in holder DID at listing time | FCFS pattern means buyer unknown at listing | 08-01 |
| throw-on-deprecated | Deprecated stubs throw descriptive errors (not silent no-ops) | Developers immediately know which new function to use | 08-01 |
| ipfs-cache-prefix | Use vc_cache_ prefix for localStorage IPFS cache keys | Namespaced to avoid collisions with other localStorage usage | 08-02 |
| no-retry-4xx | Skip retry on 4xx errors, only retry network/5xx | 4xx errors are deterministic - retrying wastes time | 08-02 |
| flatten-listing-for-eip712 | Flatten v2.0 listing sub-object before EIP-712 signing | Reuses existing EIP-712 types without modification | 08-02 |
| warnings-dont-fail | WARNING:-prefixed errors don't fail schema validation | v1.0 VCs with price field instead of priceCommitment are still valid | 08-03 |
| structure-only-proofs | verifyProofChain validates structure, not cryptographic signatures | Crypto verification requires server-side endpoint | 08-03 |
| delegate-normalization | verifyPriceCommitment delegates 0x normalization to verifyCommitmentMatch | Avoids duplicating normalization logic | 08-03 |

### Issues Log

- ~~Multiple duplicate Railgun implementations causing confusion~~ RESOLVED (Phase 1)
- ~~11,360-line serve-html.ts monolith needs extraction~~ RESOLVED (Phase 1 Plan 3 - deleted)
- ~~Non-deterministic wallet creation due to timestamp in signing message~~ RESOLVED (Phase 2 Plan 1)
- ~~wrapETHtoWETH signer parameter required~~ RESOLVED (Phase 3 Plan 1 - now optional)
- ~~SDK.getPrivateBalances not available~~ RESOLVED (Phase 4 - balance callback pattern)
- ~~Shielding and private balances~~ RESOLVED (Phase 4 - full shield flow working)
- ~~Quick-sync stub files throwing errors, breaking SDK sync~~ RESOLVED (Phase 5 - stubs now return empty arrays)
- ~~MaliciousReentrant.sol references old interface~~ RESOLVED (Phase 7 Plan 2 - updated for new contract)
- Existing test files (SimpleProductEscrow.test.js) reference old interface and will fail
- ~~Migration script needs updating for new createProduct signature and setBondAmount~~ RESOLVED (07-03)

### Context

**PHASE 8 COMPLETE**

Phase 8 done (all 3 plans):
- 08-01 COMPLETE: vcBuilder.mjs rewritten with append-only single-VC pattern
  - createListingVC, appendPaymentProof, appendDeliveryProof
  - vcBuilder.js CJS duplicate deleted (145 lines)
  - Deprecated stubs for buildStage2VC/buildStage3VC
  - Note: createProduct.js Express route still uses old CJS require (Phase 9 cleanup)

- 08-02 COMPLETE: IPFS fetchJson with caching + retry, EIP-712 v2.0 signing updates
  - fetchJson(cid) with localStorage cache, retry, ipfs:// prefix stripping
  - uploadJson wrapped in retry logic
  - preparePayloadForSigning strips payment/delivery/previousVersion, flattens listing
  - Backward compatible with v1.0 VCs

- 08-03 COMPLETE: vcVerifier.js with 5 pure verification functions
  - verifyVcSchema, verifyProofChain, verifyOnChainHash, verifyPriceCommitment, verifyVcIntegrity
  - Backward compatible with v1.0 VCs (warnings don't fail validation)
  - Ready for Phase 9 UI integration

Next: Phase 9

## Session Continuity

- **Last session:** 2026-02-17
- **Stopped at:** Completed 08-03-PLAN.md (Phase 8 complete)
- **Next:** Phase 9
- **Resume file:** None

## Commits This Session

| Hash | Message |
|------|---------|
| 0755ab60 | feat(08-01): rewrite vcBuilder.mjs with append-only single-VC pattern |
| a224901e | chore(08-01): delete vcBuilder.js CJS duplicate |

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

## Phase 6 Summary

**On-Chain Recording:**
- Plan 1: recordPrivatePayment flow in PrivatePaymentModal
- Plan 2: UI updates to show purchase status
- decodeContractError for user-friendly error messages
- Preflight check with staticCall pattern
- Gas estimation with 20% headroom
- Success toast with Etherscan link

## Phase 7 Summary

**Smart Contract Redesign:**
- Plan 1 COMPLETE: Contract rewrite (private-only, bonds, hash delivery, timeouts)
- Plan 2 COMPLETE: Contract tests (82 tests, full lifecycle, bonds, access control, reentrancy)
- Plan 3 COMPLETE: Timeout tests (27 tests) + migration script
- Total: ~112 contract tests, all passing on Ganache

## Phase 8 Summary

**Single VC Architecture:**
- Plan 1 COMPLETE: vcBuilder.mjs rewritten with append-only pattern (410 -> 126 lines)
- Plan 2 COMPLETE: IPFS fetchJson with caching + retry, EIP-712 v2.0 signing
- Plan 3 COMPLETE: vcVerifier.js with 5 pure verification functions (312 lines)
- Deprecated stubs for backward compat
- Full v1.0/v2.0 backward compatibility throughout

---

*Last updated: 2026-02-17T06:46Z*

