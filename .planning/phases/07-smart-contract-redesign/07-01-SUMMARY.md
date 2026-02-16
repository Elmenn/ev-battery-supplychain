---
phase: 07-smart-contract-redesign
plan: 01
subsystem: contracts
tags: [solidity, escrow, bonds, privacy, truffle, openzeppelin, clones]

# Dependency graph
requires:
  - phase: 06-on-chain-recording
    provides: recordPrivatePayment contract function and frontend integration
provides:
  - Redesigned ProductEscrow_Initializer with private-only purchases and bond staking
  - Updated ProductFactory with bond configuration and payable product creation
  - confirmDelivery hash verification for transporter delivery flow
  - Three permissionless timeout functions with correct bond distribution
affects: [07-02 (contract tests), 08 (migration/deployment), 09 (UI updates for new contract)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bond staking pattern: seller and transporter stake fixed configurable bonds"
    - "Hash verification: keccak256(vcCID) stored on-chain, transporter verifies at delivery"
    - "Permissionless timeouts: anyone can trigger after window expires"
    - "Factory bond forwarding: createProduct{value} -> initialize{value} -> sellerBond"

key-files:
  created: []
  modified:
    - contracts/ProductEscrow_Initializer.sol
    - contracts/ProductFactory.sol

key-decisions:
  - "Seller bond deposited during product creation (single tx via factory forwarding)"
  - "Transporter bond staked during createTransporter (combined bid + bond in one tx)"
  - "withdrawBid allowed in both OrderConfirmed and Expired phases"
  - "DeliveryWindowExpired error added separate from DeliveryTimeout for clarity"
  - "No depositSellerBond() function - bond always via factory initialize"

patterns-established:
  - "Bond forwarding: Factory createProduct payable -> clone initialize payable -> sellerBond stored"
  - "Hash delivery: vcHash = keccak256(vcCID) at OrderConfirmed, transporter calls confirmDelivery(hash)"
  - "Timeout distribution: sellerTimeout slashes to buyer, bidTimeout returns to seller, deliveryTimeout slashes transporter to seller"

# Metrics
duration: 6min
completed: 2026-02-16
---

# Phase 7 Plan 1: Smart Contract Redesign Summary

**Private-only escrow with seller/transporter bond staking, hash-verified delivery, and three permissionless timeout paths**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-16T13:04:38Z
- **Completed:** 2026-02-16T13:10:48Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Rewrote ProductEscrow_Initializer.sol: removed all public purchase paths (~60% of old code), added bond mechanics, hash-verified delivery, three timeout functions
- Updated ProductFactory.sol: added bondAmount config, payable createProduct that forwards seller bond to clone
- Both contracts compile cleanly with Solidity 0.8.21 via Truffle
- Zero buyer ETH on-chain: only priceCommitment (bytes32 hash) exists, no productPrice

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite ProductEscrow_Initializer.sol** - `026b9c68` (feat)
2. **Task 2: Update ProductFactory.sol with bond configuration** - `4df762f6` (feat)

## Files Created/Modified
- `contracts/ProductEscrow_Initializer.sol` - Redesigned escrow: private-only purchases, bond staking, hash delivery, timeouts (347 lines, down from 782)
- `contracts/ProductFactory.sol` - Bond configuration, payable createProduct, ETH forwarding to clone

## Decisions Made
- **Bond deposit at creation:** Seller bond deposited during factory.createProduct (single transaction) rather than separate depositSellerBond() call. Better UX, simpler flow.
- **Transporter bond at bid:** Transporter stakes bond in createTransporter (msg.value == bondAmount). Combined bid + bond in one transaction.
- **withdrawBid in Expired phase:** Transporters can withdraw bonds after any expiry (OrderConfirmed or Expired phase), not just after bidTimeout. Simplest and safest approach.
- **Separate DeliveryWindowExpired error:** Added distinct from generic DeliveryTimeout for confirmDelivery (transporter calling too late) vs deliveryTimeout function (permissionless timeout trigger).
- **No receive/fallback changes:** Escrow still rejects unexpected ETH; only initialize and createTransporter accept ETH via payable functions.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Both contracts compile and are ready for comprehensive testing (Phase 7 Plan 2)
- MaliciousReentrant.sol helper references old interface (revealAndConfirmDelivery, timeout, securityDeposit) and will need updating for reentrancy tests
- Migration script (1_initial_migration.js) needs updating for new createProduct signature and setBondAmount call
- Existing test files will need significant rewrites for new contract interface

---
*Phase: 07-smart-contract-redesign*
*Completed: 2026-02-16*
