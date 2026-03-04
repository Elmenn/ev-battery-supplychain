---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: "Checkpoint reached: 13-03 Task 1 complete, awaiting human verify (Task 2)"
last_updated: "2026-03-04T16:58:50.685Z"
last_activity: 2026-03-04 - Completed 13-02-PLAN.md (simplify Workstream A, auto-run useEffect, update buyer panel JSX)
progress:
  total_phases: 13
  completed_phases: 10
  total_plans: 42
  completed_plans: 35
  percent: 81
---

# Project State

**Updated:** 2026-02-26

## Current Position

- **Phase:** 13 of 13 (Pre-Payment Price Commitment Verification)
- **Plan:** 2 of 3 in phase (13-02 complete)
- **Status:** In Progress

Progress: [████████░░] 81% (34/42 plans complete)

Last activity: 2026-03-04 - Completed 13-02-PLAN.md (simplify Workstream A, auto-run useEffect, update buyer panel JSX)

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
| fcfs-buyer | First non-seller caller of recordPrivatePayment becomes buyer (FCFS) | Open marketplace pattern with automatic buyer assignment at payment time | 07-FCFS |
| vc-schema-v2 | schemaVersion "2.0" for append-only VCs vs old "1.0" stage-based | Clear distinction between old and new VC formats | 08-01 |
| zero-addr-holder | Unknown buyer uses ZeroAddress in holder DID at listing time | FCFS pattern means buyer unknown at listing | 08-01 |
| throw-on-deprecated | Deprecated stubs throw descriptive errors (not silent no-ops) | Developers immediately know which new function to use | 08-01 |
| ipfs-cache-prefix | Use vc_cache_ prefix for localStorage IPFS cache keys | Namespaced to avoid collisions with other localStorage usage | 08-02 |
| no-retry-4xx | Skip retry on 4xx errors, only retry network/5xx | 4xx errors are deterministic - retrying wastes time | 08-02 |
| flatten-listing-for-eip712 | Flatten v2.0 listing sub-object before EIP-712 signing | Reuses existing EIP-712 types without modification | 08-02 |
| warnings-dont-fail | WARNING:-prefixed errors don't fail schema validation | v1.0 VCs with price field instead of priceCommitment are still valid | 08-03 |
| structure-only-proofs | verifyProofChain validates structure, not cryptographic signatures | Crypto verification requires server-side endpoint | 08-03 |
| delegate-normalization | verifyPriceCommitment delegates 0x normalization to verifyCommitmentMatch | Avoids duplicating normalization logic | 08-03 |
| centralized-escrow-helpers | Single escrowHelpers.js for all contract reads | Eliminates scattered ethers.Contract instantiation across components | 09-01 |
| bond-fetch-on-mount | Fetch bondAmount via read-only provider on component mount | User sees bond before deciding to proceed | 09-03 |
| confirmation-modal-pattern | Two-step deployment: button shows modal, modal triggers transaction | Prevents accidental ETH locking | 09-03 |
| v2-proof-array | Store issuer proof in VC proof array instead of proofs.issuerProof object | v2.0 schema uses proof array for append-only proofs | 09-03 |
| sqlite-singleton-module | db.js exports one Database instance; server.js does require('./db') | Isolates DB init from routing logic, independently testable | 11-01 |
| address-normalise-lowercase | All route handlers lowercase :address before DB ops | Eliminates case-sensitive mismatch from findLocalStorageValueByAddress pattern | 11-01 |
| prepared-statements-at-startup | stmtUpsert, stmtGet, stmtUpdateVcCid prepared once after app init | Avoids re-parsing SQL on every request | 11-01 |
| db-path-env-override | DB_PATH from process.env.DB_PATH with default relative path | Allows Docker/production override without code changes | 11-01 |
| null-return-read-contract | getProductMeta returns null for 404 and network errors instead of throwing | Enables localStorage fallback at call site without try/catch boilerplate | 11-02 |
| throw-write-contract | saveProductMeta and updateVcCid throw on failure | Write errors must be surfaced; silently swallowing would leave DB and UI out of sync | 11-02 |
| module-level-BACKEND_URL | REACT_APP_BACKEND_URL env var with http://localhost:5000 default at module level | No prop drilling from App.js; matches verifyVc.js pattern | 11-02 |
| db-as-step-3 | DB lookup is step 3 in resolveSellerRailgunAddress (after two localStorage paths) | Seller's own device never hits API; only cross-device buyers reach DB call | 11-05 |
| session-cache-db-result | DB-returned sellerRailgunAddress cached to localStorage after DB hit | Subsequent modal opens in same session use fast localStorage path | 11-05 |
| async-iife-useeffect | priceWei useEffect uses (async () => {})() pattern | useEffect callbacks cannot be declared async directly | 11-05 |
| merlin-transcript-fixed-order | Transcript order context->C_price->C_pay->R->challenge must be identical in prove and verify | Any deviation breaks Fiat-Shamir binding and causes verify to return false | 12-02 |
| self-verify-in-generate | prove_equality immediately followed by verify_equality in generate endpoint | Surfaces transcript mismatch bugs before returning 200 to caller | 12-02 |
| from-bytes-mod-order-for-input | Use Scalar::from_bytes_mod_order (not from_canonical_bytes) when parsing user-supplied scalars | from_canonical_bytes rejects values >= group order, breaking valid user inputs | 12-02 |
| binding-context-as-json-value | binding_context typed as serde_json::Value in endpoint structs | Serialized deterministically via serde_json::to_vec for Merlin transcript binding | 12-02 |
| buyer-secrets-composite-pk | Use (product_address, buyer_address) as composite PK; INSERT OR REPLACE handles upsert atomically | Single table covers full lifecycle for any buyer-product pair | 12-01 |
| disclose-pubkey-unencrypted | disclosure_pubkey stored unencrypted alongside encrypted_blob | Seller must read pubkey during confirmOrder without buyer decryption key | 12-01 |
| nullable-lifecycle-columns | c_pay, c_pay_proof, encrypted_opening, equality_proof are nullable; written in separate lifecycle steps | Each column is written by a different party at a different time | 12-01 |
| meta-not-onchain-commitment | Use meta.priceCommitment from DB (real Pedersen C_price) not product.priceCommitment (on-chain keccak256 placeholder) | On-chain priceCommitment is always a keccak256 placeholder; real C_price lives in DB/VC | 13-01 |
| phase-only-gate | Verify Price badge gated on product.phase === Phase.Listed only — no priceCommitment check | On-chain field is always truthy (placeholder); gating on it is meaningless; DB-missing case surfaces as error state | 13-01 |
| buy-button-unblocked | Buy with Railgun button not blocked by verification status | Buyer autonomy — verification is informational, not a gate | 13-01 |
| workstream-a-no-metamask | Workstream A uses getProductMeta + generateDeterministicBlinding (no wallet signing) | r_price is deterministic — buyer can derive it without seller's encrypted opening | 13-02 |
| auto-run-primitive-deps | useEffect deps are [role.role, product?.phase, auditVC] — handleWorkstreamA excluded | Function reference changes each render; primitive deps prevent infinite re-render | 13-02 |
| silent-workstream-a | Workstream A shown as status indicator only (no button) | It is infrastructure gating Workstream B, not a user action; auto-run is fast and deterministic | 13-02 |

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

**PHASE 11 COMPLETE** (All 5 plans done)

- 09-01 COMPLETE: Shared components and escrow helpers
  - escrowHelpers.js: Phase enum, getProductState (with memoHash/railgunTxRef), detectRole
  - PhaseTimeline, HashDisplay (QR), CountdownTimer, BondCard shared components
  - qrcode.react installed

- 09-03 COMPLETE: Seller flow + web3Utils
  - ProductFormStep3: bond disclosure card, confirmation modal, createListingVC v2.0
  - web3Utils: simplified confirmOrder(addr, vcCID), ethers-only (Web3.js removed)
  - Note: ProductDetail.jsx still passes stale 3rd arg to confirmOrder (harmless, future cleanup)

- 11-01 COMPLETE: SQLite backend + CORS fix + metadata REST endpoints
  - better-sqlite3@12.6.2 installed
  - backend/api/db.js: singleton Database, WAL mode, auto-creates data/ dir, product_metadata table
  - backend/api/server.js: CORS updated (GET+PATCH added), POST/GET/PATCH /metadata routes, prepared statements at startup
  - All addresses normalised to lowercase server-side; DB file auto-created at backend/api/data/metadata.sqlite

- 11-02 COMPLETE: productMetaApi.js frontend utility
  - frontend/src/utils/productMetaApi.js: saveProductMeta, getProductMeta, updateVcCid
  - getProductMeta returns null (not throw) for 404 and network errors - localStorage fallback contract
  - saveProductMeta and updateVcCid throw on failure - write errors surfaced
  - BACKEND_URL from REACT_APP_BACKEND_URL env var with http://localhost:5000 default

- 11-03 COMPLETE: ProductFormStep3.jsx write-path wiring
  - Added import { saveProductMeta } from productMetaApi
  - saveProductMeta called after localStorage writes in handleConfirm
  - Wrapped in own try/catch: DB failure never blocks seller flow
  - sellerWalletID excluded from DB call; all localStorage writes preserved

- 11-04 COMPLETE: ProductDetail.jsx DB-first reads and updateVcCid writes
  - DB-first vcCid useEffect and handleConfirmOrder productMeta reads
  - Non-blocking updateVcCid writes after IPFS upload and manual audit CID entry

- 11-05 COMPLETE: PrivatePaymentModal.jsx DB-first resolution
  - Added getProductMeta import from productMetaApi.js
  - resolveSellerRailgunAddress: 3-step resolution (localStorage direct, localStorage meta, DB)
  - DB result cached to localStorage for session performance
  - priceWei useEffect: async IIFE with localStorage first, DB fallback
  - pending_private_payment_* lines untouched (ephemeral retry cache remains localStorage-only)

All Phase 11 plans complete. Cross-device metadata persistence fully wired.

**PHASE 12 IN PROGRESS** (2/7 plans done)

- 12-01 COMPLETE: buyer_secrets table + REST API
  - backend/api/db.js: buyer_secrets table with composite PK (product_address, buyer_address)
  - backend/api/server.js: 4 prepared statements + POST/GET/2xPATCH /buyer-secrets routes
  - All address params lowercased; nullable lifecycle columns (c_pay, c_pay_proof, encrypted_opening, equality_proof)

- 12-02 COMPLETE: Chaum-Pedersen DLEQ Schnorr sigma proof + ZKP endpoints
  - zkp-backend/src/zk/equality_proof.rs: prove_equality() and verify_equality() with Merlin transcript
  - Transcript order fixed: context->C_price->C_pay->R->challenge (identical in prove+verify)
  - zkp-backend/src/main.rs: POST /zkp/generate-equality-proof (self-verifies, returns verified:true) and POST /zkp/verify-equality-proof
  - cargo build exits 0; binary compiles cleanly

## Roadmap Evolution

- Phase 11 added: SQLite metadata persistence for cross-device support (2026-02-26)
- Phase 12 added: Buyer Attestation + Deferred Equality Proving (2026-03-03)

## Session Continuity

- **Last session:** 2026-03-04T16:58:30.632Z
- **Stopped at:** Checkpoint reached: 13-03 Task 1 complete, awaiting human verify (Task 2)
- **Next:** 11-03 (ProductFormStep3.jsx - wire saveProductMeta after escrow deploy)
- **Resume file:** None

## Commits This Session

| Hash | Message |
|------|---------|
| 5cae1ba5 | feat(11-04): update vcCid write sites to also call updateVcCid |
| 3ebaa7a3 | feat(11-04): update read sites - DB-first vcCid useEffect and handleConfirmOrder productMeta |
| 9ade14e2 | feat(11-05): wire PrivatePaymentModal to resolve metadata from DB |
| cb901612 | feat(11-02): create productMetaApi.js frontend utility |
| 14e9242e | feat(11-01): fix CORS and add metadata REST endpoints to server.js |
| d8344100 | feat(11-01): install better-sqlite3 and create db.js |

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

## Phase 9 Summary (partial - paused)

**UI Rework:**
- Plan 1 COMPLETE: escrowHelpers.js + shared components (PhaseTimeline, HashDisplay, CountdownTimer, BondCard)
- Plan 3 COMPLETE: ProductFormStep3 bond disclosure + createListingVC v2.0, web3Utils ethers-only
- Plans 2, 4, 5, 6: not yet executed (superseded by Phase 11 priority)

## Phase 11 Summary (in progress)

**SQLite Metadata Persistence:**
- Plan 1 COMPLETE: better-sqlite3 installed, db.js singleton, CORS fix (GET+PATCH), three metadata REST endpoints
- Plan 2 COMPLETE: productMetaApi.js with saveProductMeta/getProductMeta/updateVcCid, null-return read contract, throw-on-failure write contract
- Plan 4 COMPLETE: ProductDetail.jsx wired DB-first reads (vcCid, productMeta, sellerRailgunAddress) + non-blocking updateVcCid writes after IPFS upload and manual audit CID entry
- Plan 5 COMPLETE: PrivatePaymentModal.jsx wired with DB-first resolution for sellerRailgunAddress (3-step) and priceWei (2-step with async IIFE); cross-device buying enabled

---

*Last updated: 2026-02-26T11:33Z*
