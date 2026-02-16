# Phase 7: Smart Contract Redesign - Research

**Researched:** 2026-02-16
**Domain:** Solidity smart contract redesign (escrow with bond staking, private-only purchases)
**Confidence:** HIGH

## Summary

This research analyzes the current `ProductEscrow_Initializer.sol` (782 lines) and `ProductFactory.sol` (204 lines) contracts in detail, mapping every function, storage variable, modifier, and event to a keep/modify/remove decision for the Phase 7 redesign. The redesign transforms the contract from a dual-mode (public+private) escrow into a private-only escrow with seller/transporter bond staking, transporter-confirmed delivery via hash verification, and bytes32 vcHash storage instead of string vcCid.

The project uses Truffle with Solidity 0.8.21, OpenZeppelin ^5.4.0 (Clones, ReentrancyGuard, Ownable), and deploys via a factory+clone pattern. There are 25+ existing test files using truffle-assertions. The redesign is primarily a rewrite of the escrow logic while keeping the factory+clone architecture intact.

**Primary recommendation:** Rewrite `ProductEscrow_Initializer.sol` from scratch using the current file as a reference rather than incremental edits. The changes are too extensive (removing ~60% of functions, adding bond mechanics, changing delivery flow) for safe incremental modification. Keep the factory pattern but extend it with bond configuration.

## Current Contract Analysis

### ProductEscrow_Initializer.sol (782 lines)

#### Storage Variables (31 total)
| Variable | Type | Slot Group | Status |
|----------|------|-----------|--------|
| `id` | uint256 | Group 1 | KEEP |
| `name` | string | Group 1 | KEEP |
| `priceCommitment` | bytes32 | Group 1 | KEEP |
| `owner` | address payable | Group 2 | KEEP |
| `buyer` | address payable | Group 2 | KEEP |
| `transporter` | address payable | Group 2 | KEEP |
| `phase` | enum Phase | Group 3 | KEEP (same enum) |
| `purchaseTimestamp` | uint64 | Group 3 | KEEP |
| `orderConfirmedTimestamp` | uint64 | Group 3 | KEEP |
| `purchased` | bool | Group 3 | KEEP |
| `delivered` | bool | Group 3 | KEEP |
| `transporterCount` | uint32 | Group 3 | KEEP |
| `deliveryFee` | uint | Separate | KEEP |
| `productPrice` | uint | Separate | **REMOVE** (no ETH from buyer) |
| `vcCid` | string | Separate | **REPLACE** with `bytes32 vcHash` |
| `purchaseMode` | enum PurchaseMode | - | **REMOVE** (always private) |
| `publicPriceWei` | uint256 | - | **REMOVE** |
| `publicPriceCommitment` | bytes32 | - | **REMOVE** |
| `commitmentFrozen` | bool | - | **REMOVE** |
| `publicEnabled` | bool | - | **REMOVE** |
| `privateEnabled` | bool | - | **REMOVE** |
| `stopped` | bool | - | KEEP |
| `securityDeposits` | mapping | - | **REPURPOSE** for transporter bonds |
| `transporters` | mapping(address=>uint) | - | KEEP (fee bids) |
| `isTransporter` | mapping(address=>bool) | - | KEEP |
| `transporterAddresses` | address[] | - | KEEP |
| `_initialized` | bool | - | KEEP |
| `factory` | address | - | KEEP |
| `privatePayments` | mapping(bytes32=>bool) | - | KEEP |
| `productMemoHashes` | mapping(uint256=>bytes32) | - | KEEP |
| `productRailgunTxRefs` | mapping(uint256=>bytes32) | - | KEEP |
| `usedMemoHash` | mapping(bytes32=>bool) | - | KEEP |
| `productPaidBy` | mapping(uint256=>address) | - | KEEP |
| `valueCommitment` | bytes32 | - | **REMOVE** |
| `valueRangeProof` | bytes | - | **REMOVE** |

#### New Storage Variables Needed
| Variable | Type | Purpose |
|----------|------|---------|
| `sellerBond` | uint256 | Amount seller deposited as bond |
| `vcHash` | bytes32 | keccak256(vcCID) stored at OrderConfirmed |
| `boundTimestamp` | uint64 | Timestamp when transporter is selected (delivery window starts here) |

**Note on bond amounts:** The bond amount is configurable by the factory owner, stored in the factory contract. Each clone reads the bond amount from the factory at creation time or at bond deposit time. Recommendation: store `bondAmount` in the clone at initialization (set by factory) to avoid cross-contract reads during bond deposit.

### ProductFactory.sol (204 lines)

#### Current State
- Uses OpenZeppelin Clones (minimal proxy pattern)
- `createProduct(name, priceCommitment, price)` -- creates clone, calls initialize
- Stores products array, productCount
- Has pause/unpause, setImplementation
- Ownable (factory owner controls implementation updates)

#### New Storage Variables Needed in Factory
| Variable | Type | Purpose |
|----------|------|---------|
| `bondAmount` | uint256 | Configurable bond amount for seller and transporter |

#### New Functions Needed in Factory
| Function | Purpose |
|----------|---------|
| `setBondAmount(uint256)` | Owner sets the required bond amount |
| `createProduct(name, priceCommitment)` | Modified - removes price param, seller sends bond as msg.value |

## Function-by-Function Keep/Modify/Remove Map

### REMOVE (public purchase functions and related)
| Function | Lines | Reason |
|----------|-------|--------|
| `setPublicEnabled(bool)` | 113-116 | No public mode |
| `setPrivateEnabled(bool)` | 118-121 | Always private |
| `setPublicPrice(uint256)` | 282-289 | No public price |
| `setPublicPriceWithCommitment(uint256, bytes32)` | 296-316 | No public price |
| `depositPurchase()` | 375-393 | Public purchase removed |
| `purchasePublic()` | 396-419 | Public purchase removed |
| `depositPurchasePrivate(bytes32, bytes32, bytes)` | 370-372 | Replaced by recordPrivatePayment |
| `_depositPurchase(bytes32, bytes32, bytes)` | 421-443 | Internal for removed functions |
| `revealAndConfirmDelivery(uint, bytes32, string)` | 523-525 | Buyer no longer confirms delivery |
| `_revealAndConfirmDelivery(uint, bytes32, string)` | 527-557 | Replaced by transporter hash verification |
| `verifyRevealedValue(uint, bytes32)` | 511-513 | No price reveal needed |
| `_verifyRevealedValue(uint, bytes32)` | 515-521 | Internal for removed function |
| `updateVcCidAfterDelivery(string, bytes32)` | 357-368 | No string CID on-chain |

### KEEP (unchanged or minimal changes)
| Function | Lines | Notes |
|----------|-------|-------|
| `computeCommitment(uint256, bytes32)` | 163-165 | Pure helper, useful |
| `pauseByFactory()` | 152-155 | Factory admin |
| `isStopped()` | 158-160 | UI getter |
| `getAllTransporters()` | 495-509 | View function for UI |
| `withdrawBid()` / `_withdrawBid()` | 699-727 | Minor: refund transporter bond instead of security deposit |
| `receive()` / `fallback()` | 775-781 | Reject unexpected ETH |

### MODIFY (significant changes)
| Function | Current Behavior | New Behavior |
|----------|-----------------|-------------|
| `initialize(...)` | Sets id, name, priceCommitment, owner, productPrice, factory | Remove productPrice param. Add bondAmount param (from factory). Seller deposits bond via `msg.value` in a separate step OR during creation |
| `confirmOrder(string vcCID)` | Stores string vcCid, sets OrderConfirmed | Compute `vcHash = keccak256(bytes(vcCID))`, store bytes32, emit CID in event only |
| `confirmOrderWithCommitment(...)` | Optional TX hash commitment | Simplify to `confirmOrder(string vcCID)` -- compute and store hash |
| `updateVcCid(string)` | Stores string | Remove (vcHash is set once at OrderConfirmed) |
| `setTransporter(address payable)` | Seller sends deliveryFee as msg.value | Same but also verify bond amount for transporter |
| `createTransporter(uint)` | Register fee bid | Also require transporter to stake bond via msg.value |
| `securityDeposit()` | Separate deposit step | **REMOVE** -- bond staked during createTransporter |
| `_confirmDelivery(string vcCID)` | Called by buyer after price reveal | Called by transporter, verify hash == vcHash |
| `_timeout()` | Refund productPrice + penalty to buyer | Slash transporter bond to seller, return seller bond |
| `_sellerTimeout()` | Refund productPrice to buyer | Slash seller bond to buyer |
| `_bidTimeout()` | Refund productPrice to buyer | Return seller bond to seller (no buyer ETH to refund). Slash nothing (nobody at fault) |
| `recordPrivatePayment(...)` | Records payment references | Same logic but remove `privateEnabled` check (always enabled) |

### NEW Functions Needed
| Function | Signature | Purpose |
|----------|-----------|---------|
| `depositSellerBond()` | `external payable onlySeller` | Seller stakes bond (msg.value == bondAmount). Called after initialize or combined with product creation |
| `confirmDelivery(bytes32 hash)` | `external onlyTransporter nonReentrant` | Transporter confirms delivery. Verifies `hash == vcHash`. Releases all bonds + transporter fee |
| `getVcHash()` | `external view returns (bytes32)` | Public getter for transporter to read hash |

## New Functions Needed - Detailed Design

### depositSellerBond()
```solidity
function depositSellerBond() external payable onlySeller nonReentrant whenNotStopped {
    if (phase != Phase.Listed) revert WrongPhase();
    if (sellerBond != 0) revert AlreadyPaid(); // already deposited
    if (msg.value != bondAmount) revert IncorrectFee();

    sellerBond = msg.value;
    // Optionally emit event
    emit SellerBondDeposited(id, msg.sender, msg.value, block.timestamp);
}
```

**Alternative design:** Combine bond deposit with product creation. Factory's `createProduct` is `payable`, forwards msg.value to clone's initialize. This is cleaner but requires the factory to handle ETH forwarding. Recommendation: separate `depositSellerBond()` for clarity and because the clone pattern makes ETH forwarding during initialization tricky (clone is created, then initialized -- ETH would need to be sent to the clone address after creation).

### createTransporter (modified)
```solidity
function createTransporter(uint _feeInWei) public payable nonReentrant whenNotStopped {
    if (phase != Phase.OrderConfirmed) revert WrongPhase();
    if (transporterCount >= MAX_BIDS) revert BidCapReached();
    if (transporters[msg.sender] != 0) revert AlreadyExists();
    if (msg.value != bondAmount) revert IncorrectFee(); // stake bond

    transporters[msg.sender] = _feeInWei;
    isTransporter[msg.sender] = true;
    transporterAddresses.push(msg.sender);
    securityDeposits[msg.sender] = msg.value; // store bond

    unchecked { transporterCount++; }

    emit TransporterCreated(msg.sender, id, block.timestamp);
}
```

### confirmDelivery (new - transporter calls)
```solidity
function confirmDelivery(bytes32 hash) external onlyTransporter nonReentrant whenNotStopped {
    if (phase != Phase.Bound) revert WrongPhase();
    if (delivered) revert AlreadyDelivered();
    if (hash != vcHash) revert RevealInvalid();
    // Check delivery window
    if (block.timestamp > boundTimestamp + DELIVERY_WINDOW) revert DeliveryTimeout();

    delivered = true;
    Phase oldPhase = phase;
    phase = Phase.Delivered;

    // Effects: zero out before transfers
    uint256 _sellerBond = sellerBond;
    uint256 _transporterBond = securityDeposits[transporter];
    uint256 _deliveryFee = deliveryFee;
    sellerBond = 0;
    securityDeposits[transporter] = 0;
    deliveryFee = 0;

    // Return seller bond
    (bool sentSeller, ) = owner.call{value: _sellerBond}("");
    if (!sentSeller) revert TransferFailed(owner, _sellerBond);

    // Return transporter bond + pay fee
    uint256 transporterPayout = _transporterBond + _deliveryFee;
    (bool sentTransporter, ) = transporter.call{value: transporterPayout}("");
    if (!sentTransporter) revert TransferFailed(transporter, transporterPayout);

    emit DeliveryConfirmed(buyer, transporter, owner, id, priceCommitment, "", block.timestamp);
    emit PhaseChanged(id, oldPhase, phase, msg.sender, block.timestamp, hash);
}
```

### confirmOrder (modified)
```solidity
function confirmOrder(string calldata vcCID) external onlySeller nonReentrant whenNotStopped {
    if (phase != Phase.Purchased) revert WrongPhase();
    if (!purchased) revert NotPurchased();

    orderConfirmedTimestamp = uint64(block.timestamp);
    phase = Phase.OrderConfirmed;

    // Store hash only, emit full CID in event
    vcHash = keccak256(bytes(vcCID));

    emit OrderConfirmed(buyer, owner, id, priceCommitment, vcCID, block.timestamp);
    emit PhaseChanged(id, Phase.Purchased, Phase.OrderConfirmed, msg.sender, block.timestamp, vcHash);
}
```

## Storage Layout Changes

### Variables to Remove (saves ~7 storage slots)
| Variable | Type | Reason |
|----------|------|--------|
| `productPrice` | uint256 | No buyer ETH in contract |
| `vcCid` | string | Replaced by bytes32 vcHash |
| `purchaseMode` | enum | Always private |
| `publicPriceWei` | uint256 | No public mode |
| `publicPriceCommitment` | bytes32 | No public mode |
| `commitmentFrozen` | bool | No public mode |
| `publicEnabled` | bool | No public mode |
| `privateEnabled` | bool | No public mode |
| `valueCommitment` | bytes32 | No Pedersen commitment needed |
| `valueRangeProof` | bytes | No range proof needed |

### Variables to Add (3 new slots)
| Variable | Type | Packed With | Reason |
|----------|------|-------------|--------|
| `sellerBond` | uint256 | Own slot | Amount of seller's staked bond |
| `vcHash` | bytes32 | Own slot | keccak256(vcCID) stored at OrderConfirmed |
| `bondAmount` | uint256 | Own slot | Required bond amount (set at init from factory) |
| `boundTimestamp` | uint64 | Pack with Group 3 | When transporter was selected (delivery window starts) |

### Net Change
- Remove ~10 variables, add 4 variables
- Significant gas savings from removing string storage (`vcCid`)
- bytes32 `vcHash` is fixed-size, much cheaper than string

## Factory Changes

### Current createProduct signature
```solidity
function createProduct(string memory name, bytes32 priceCommitment, uint256 price)
```

### New createProduct signature
```solidity
function createProduct(string memory name, bytes32 priceCommitment) external payable whenNotPaused
```

Changes:
1. Remove `price` parameter (no on-chain price)
2. Make `payable` -- seller sends bond as msg.value
3. Forward msg.value to clone for seller bond
4. Validate `msg.value == bondAmount`

### New initialize signature
```solidity
function initialize(
    uint256 _id,
    string memory _name,
    bytes32 _priceCommitment,
    address _owner,
    uint256 _bondAmount,  // was _productPrice, now bond amount from factory
    address _factory
) external payable
```

**Implementation approach:** Factory creates clone, then calls initialize. For the bond ETH:
- Option A: Factory calls `initialize{value: msg.value}()` to forward ETH to clone. Clone stores it as sellerBond.
- Option B: Factory calls initialize (no ETH), seller separately calls `depositSellerBond()` on the clone.

**Recommendation: Option A** -- single transaction for seller. Factory forwards msg.value during initialization. This keeps the UX clean (one tx to create product + stake bond).

### New factory storage and functions
```solidity
uint256 public bondAmount;  // Configurable by factory owner

function setBondAmount(uint256 _amount) external onlyOwner {
    bondAmount = _amount;
    emit BondAmountUpdated(_amount);
}
```

### Updated ProductCreated event
```solidity
event ProductCreated(
    address indexed product,
    address indexed seller,
    uint256 indexed productId,
    bytes32 priceCommitment,
    uint256 bondAmount  // was "price"
);
```

## Bond Configuration Pattern

### Factory stores global bond amount
- `bondAmount` is a single uint256 in the factory
- Factory owner calls `setBondAmount(uint256)` to change it
- New clones get the current bondAmount at creation time
- Existing clones keep their original bondAmount (stored locally in clone)

### Why store bondAmount in clone, not read from factory
- Gas: Avoid cross-contract `CALL` on every bond deposit
- Immutability: Product's bond terms are fixed at creation, not affected by later factory changes
- Simplicity: Clone is self-contained for bond validation

### Transporter bond uses same amount
- `createTransporter()` requires `msg.value == bondAmount`
- Same fixed bond for all participants ensures symmetric incentives
- Stored in `securityDeposits[transporter]` (reusing existing mapping)

### Default for Sepolia testnet
- Recommend 0.01 ETH (enough to create real incentive, small enough for testnet faucets)
- Factory owner can adjust via `setBondAmount()`

## Timeout/Slash Logic Matrix

### Current bugs to fix
1. **Double payment in `_timeout()`**: Lines 630-639 send `productPrice + penalty` to buyer, then ALSO send `penalty` again. The penalty is double-counted.
2. **`depositPurchase()` doesn't set purchaseMode**: Would revert in _confirmDelivery. Not relevant after redesign (function removed).

### New Timeout Logic (Private-Only, Bond-Based)

| Timeout | Trigger Phase | Window | Who Calls | Seller Bond | Transporter Bond | Delivery Fee | Rationale |
|---------|--------------|--------|-----------|-------------|-----------------|--------------|-----------|
| `sellerTimeout()` | Purchased | purchaseTimestamp + 2 days | Anyone | **Slash to buyer** | N/A (no transporter yet) | N/A | Seller failed to confirm order |
| `bidTimeout()` | OrderConfirmed | orderConfirmedTimestamp + 2 days | Anyone | **Return to seller** | **Return all bidder bonds** | N/A | No transporter selected, nobody at fault |
| `deliveryTimeout()` | Bound | boundTimestamp + 2 days | Anyone | **Return to seller** | **Slash to seller** | **Return to seller** | Transporter failed to deliver |

### Detailed Timeout Flows

#### sellerTimeout() -- seller failed to confirm order
```
Phase: Purchased -> Expired
Condition: block.timestamp > purchaseTimestamp + SELLER_WINDOW
Transfers:
  - sellerBond -> buyer (slash: seller failed duty)
State: phase = Expired, sellerBond = 0
```

#### bidTimeout() -- no transporter selected in time
```
Phase: OrderConfirmed -> Expired
Condition: block.timestamp > orderConfirmedTimestamp + BID_WINDOW
Transfers:
  - sellerBond -> seller (return: not seller's fault)
  - All transporter bonds -> respective transporters (return via withdrawBid or batch)
State: phase = Expired, sellerBond = 0
Note: Transporter bonds returned individually via withdrawBid() which remains available after Expired
```

#### deliveryTimeout() -- transporter failed to deliver
```
Phase: Bound -> Expired
Condition: block.timestamp > boundTimestamp + DELIVERY_WINDOW
Transfers:
  - sellerBond -> seller (return: not seller's fault)
  - transporterBond -> seller (slash: transporter failed duty)
  - deliveryFee -> seller (return: service not rendered)
State: phase = Expired, all zeroed
```

### Key Design Decision: bidTimeout and transporter bond refunds
After bidTimeout, transporters who bid but were not selected need their bonds back. Two approaches:
1. **bidTimeout returns seller bond only, transporters call withdrawBid()** -- simpler, less gas in timeout
2. **bidTimeout iterates all transporters and returns bonds** -- one tx but unbounded gas

**Recommendation: Option 1.** Keep `withdrawBid()` callable in Expired phase (when expiry came from OrderConfirmed). This avoids unbounded loops and is consistent with existing pattern.

## Event Redesign

### Events to REMOVE
| Event | Reason |
|-------|--------|
| `PublicEnabledSet` | No public mode |
| `PrivateEnabledSet` | No public mode |
| `PublicPriceSet` | No public price |
| `PublicPriceCommitmentSet` | No public price |
| `PurchasedPublic` | No public purchase |
| `PurchaseConfirmedWithCommitment` | Simplified flow |
| `DeliveryConfirmedWithCommitment` | Simplified flow |
| `ValueCommitted` | No Pedersen commitment |
| `ValueRevealed` | No price reveal |

### Events to KEEP
| Event | Notes |
|-------|-------|
| `PhaseChanged(uint256 productId, Phase from, Phase to, address actor, uint256 timestamp, bytes32 ref)` | Core lifecycle event |
| `TransporterCreated(address transporter, uint256 productId, uint256 timestamp)` | Bidding |
| `TransporterSelected(uint256 productId, address transporter, uint256 timestamp)` | Selection |
| `BidWithdrawn(address transporter, uint256 productId, uint256 timestamp)` | Withdrawal |
| `FundsTransferred(address to, uint256 productId, uint256 timestamp)` | Bond transfers |
| `PenaltyApplied(address to, uint256 productId, string reason, uint256 timestamp)` | Slashing |
| `PrivatePaymentRecorded(uint256 productId, bytes32 memoHash, bytes32 railgunTxRef, address recorder, uint256 timestamp)` | Payment |
| `PurchasedPrivate(address buyer, bytes32 memoHash, bytes32 railgunTxRef)` | Payment |
| `ProductStateChanged(...)` | Frontend indexing |

### Events to ADD
| Event | Signature | Purpose |
|-------|-----------|---------|
| `SellerBondDeposited` | `(uint256 indexed productId, address indexed seller, uint256 amount, uint256 timestamp)` | Bond staking |
| `TransporterBondDeposited` | `(uint256 indexed productId, address indexed transporter, uint256 amount, uint256 timestamp)` | Bond staking |
| `VcHashStored` | `(uint256 indexed productId, bytes32 vcHash, string vcCID, uint256 timestamp)` | Hash stored, CID in event |
| `BondSlashed` | `(uint256 indexed productId, address indexed from, address indexed to, uint256 amount, string reason, uint256 timestamp)` | Slash event |
| `BondReturned` | `(uint256 indexed productId, address indexed to, uint256 amount, uint256 timestamp)` | Bond refund |

### Events to MODIFY
| Event | Change |
|-------|--------|
| `OrderConfirmed` | Keep but ensure vcCID is in event (not stored on-chain as string) |
| `DeliveryConfirmed` | Remove string vcCID param (hash is on-chain, CID was in OrderConfirmed event) |
| `DeliveryTimeoutEvent` | Rename to `DeliveryTimeout` for consistency |
| `SellerTimeout` | Keep as-is |

## Custom Errors Redesign

### Errors to REMOVE
| Error | Reason |
|-------|--------|
| `PublicDisabled` | No public mode |
| `PrivateDisabled` | No public mode |
| `PublicPriceNotSet` | No public price |
| `InvalidPurchaseMode` | Single mode |
| `CommitmentFrozen` | Removed feature |
| `RevealInvalid` | Repurpose for hash mismatch |

### Errors to ADD
| Error | Purpose |
|-------|---------|
| `BondAlreadyDeposited()` | Seller tried to deposit bond twice |
| `BondNotDeposited()` | Action requires bond but none staked |
| `HashMismatch()` | Transporter provided wrong hash in confirmDelivery |
| `InsufficientBond()` | msg.value != bondAmount |

## Testing Infrastructure

### Current Setup
- **Framework:** Truffle with Mocha/Chai
- **Solidity:** 0.8.21 with optimizer (200 runs), Shanghai EVM
- **OpenZeppelin:** ^5.4.0
- **Test Helper:** truffle-assertions
- **Network:** Ganache (development, port 8545)
- **25+ test files** covering:
  - Access control, reentrancy
  - Phase machine transitions
  - Fund accounting
  - Product creation via factory
  - Private payment recording
  - Gas measurement

### Test Strategy for Phase 7
Tests must be largely rewritten since the contract interface changes significantly. Key test categories:

1. **Bond mechanics:** deposit, return, slash for both seller and transporter
2. **Phase transitions:** Listed -> Purchased -> OrderConfirmed -> Bound -> Delivered
3. **Timeout flows:** sellerTimeout, bidTimeout, deliveryTimeout with correct bond distribution
4. **Hash verification:** confirmDelivery with correct/incorrect hash
5. **Access control:** only seller can confirm, only transporter can deliver, anyone can timeout
6. **Reentrancy:** reuse MaliciousReentrant.sol pattern for bond withdrawal and delivery
7. **Factory integration:** bond amount config, product creation with bond
8. **Edge cases:** double bond deposit, bid after timeout, delivery after timeout

### Migration Script
The existing migration (`1_initial_migration.js`) deploys both implementation and factory. The new migration needs to:
1. Deploy new implementation
2. Call `factory.setImplementation(newImpl)` on existing factory, OR deploy new factory
3. Call `factory.setBondAmount(ethers.parseEther("0.01"))` to set default bond

**Recommendation:** Deploy fresh factory + implementation for Phase 7 (clean break). The old products on Sepolia are test data.

## Implementation Risks

### Risk 1: ETH Forwarding in Clone Pattern (MEDIUM)
**What:** OpenZeppelin Clones are minimal proxies. The `initialize()` function is called via delegatecall-like pattern, but Clones use `CALL` not `DELEGATECALL`. ETH sent to `clone.initialize{value: X}()` should work because the clone is a real contract address.
**Mitigation:** Test ETH forwarding in factory.createProduct thoroughly. Verify clone receives msg.value.
**Confidence:** HIGH -- Clones.clone() returns a real address, and calling payable functions on it with value works normally.

### Risk 2: Unbounded Transporter Array (LOW)
**What:** `transporterAddresses` array grows per product. With MAX_BIDS=20 cap, this is bounded.
**Mitigation:** Cap already exists. No change needed.

### Risk 3: Bond Amount Change Race Condition (LOW)
**What:** Factory owner changes bondAmount while a product is in progress.
**Mitigation:** Bond amount is stored in clone at initialization time. Existing products are unaffected by factory changes.

### Risk 4: Reentrancy on Bond Returns (MEDIUM)
**What:** Multiple ETH transfers in timeout/delivery functions.
**Mitigation:** Already using ReentrancyGuard + checks-effects-interactions pattern. Zero state before transfers.

### Risk 5: withdrawBid After Expired (LOW)
**What:** Transporters need to withdraw bonds after bidTimeout sets phase to Expired.
**Mitigation:** Modify withdrawBid to allow in both OrderConfirmed and Expired phases (when expiry source was bidTimeout). Or simply allow withdrawal in Expired phase always for non-selected transporters.

### Risk 6: Storage Slot Collision (LOW since rewriting)
**What:** Since we use Clones (not upgradeable proxies), there is no storage layout concern between old and new implementations. Each clone is initialized fresh.
**Mitigation:** New implementation deployed, new clones created. No upgrade path needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reentrancy protection | Custom mutex | OpenZeppelin ReentrancyGuard | Battle-tested, well-audited |
| Clone pattern | Manual proxy | OpenZeppelin Clones | Gas efficient, proven |
| Access control | Custom modifiers | Keep existing modifier pattern (onlySeller, etc.) | Already works well |
| Pausability | Custom stop flag | Keep existing `stopped` bool pattern | Simple, already works |
| Hash computation | Custom hash | `keccak256(bytes(vcCID))` | Native Solidity, no library needed |

**Key insight:** The existing patterns (ReentrancyGuard, Clones, custom modifiers) are already correct. The redesign is about business logic, not infrastructure.

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `string vcCid` stored on-chain | `bytes32 vcHash` with CID in events | Major gas savings, privacy benefit |
| Buyer calls revealAndConfirmDelivery | Transporter calls confirmDelivery(hash) | Simpler flow, transporter-initiated |
| Dual public/private purchase modes | Private-only via recordPrivatePayment | Removes ~40% of code, cleaner logic |
| No bond staking | Fixed configurable bonds for seller/transporter | Real economic incentives |
| Graduated penalty in timeout | Full slash to counterparty | Simpler, stronger incentive |
| Buyer deposits ETH | Zero buyer ETH on-chain | True payment privacy via Railgun |

## Open Questions

1. **Bond amount for Sepolia testnet**: Recommend 0.01 ETH but this is Claude's discretion per CONTEXT.md. Easy to change via `setBondAmount()`.

2. **withdrawBid in Expired phase**: Should transporters be able to withdraw bonds after any expiry, or only after bidTimeout? Recommendation: allow in Expired phase for any non-selected transporter (simplest, safest).

3. **Seller bond deposit timing**: Should bond be deposited during `createProduct` (single tx via factory) or separately via `depositSellerBond()` (two tx)? Recommendation: during createProduct for better UX, but either works.

## Sources

### Primary (HIGH confidence)
- Direct code analysis of `contracts/ProductEscrow_Initializer.sol` (782 lines, fully read)
- Direct code analysis of `contracts/ProductFactory.sol` (204 lines, fully read)
- Direct code analysis of `contracts/ProductEscrow.sol` (455 lines, legacy reference)
- Direct code analysis of `contracts/helpers/MaliciousReentrant.sol` (86 lines)
- Direct code analysis of `migrations/1_initial_migration.js`
- Direct code analysis of `truffle-config.js`
- Direct code analysis of `test/SimpleProductEscrow.test.js` (test pattern reference)
- OpenZeppelin Contracts ^5.4.0 (Clones, ReentrancyGuard, Ownable) -- installed in package.json

### Secondary (MEDIUM confidence)
- Phase 7 CONTEXT.md decisions (user-locked constraints)
- Existing test file inventory (25+ test files confirm Truffle+Mocha pattern)

### Tertiary (LOW confidence)
- None. All findings based on direct code analysis.

## Metadata

**Confidence breakdown:**
- Current contract analysis: HIGH - direct code reading, every line examined
- Function keep/modify/remove map: HIGH - based on CONTEXT.md decisions + code analysis
- New function design: HIGH - straightforward Solidity patterns, no novel techniques
- Timeout/slash logic: HIGH - well-defined in CONTEXT.md, translated to code
- Factory changes: HIGH - minor extension of existing pattern
- Bond configuration pattern: HIGH - standard factory+clone pattern
- Testing strategy: HIGH - existing infrastructure understood

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable domain, no dependency on fast-moving libraries)
