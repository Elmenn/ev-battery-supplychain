# ProductEscrow to ERC-7984 Redesign

## Archive status

This note is a historical redesign record.

Active implementation references are in:

- `contracts/erc7984/ProductFactoryConfidential.sol`
- `contracts/erc7984/ProductEscrowConfidential_Initializer.sol`
- `contracts/erc7984/ProductEscrowConfidential_PrivatePrice.sol`

Legacy contracts mentioned in older parts of this note are no longer in the active flow.

## Implementation update: March 13, 2026

The original note below described the redesign direction. The active spike implementation has now moved further and proved the following:

- the factory-based product escrow path works locally
- the same path works on Sepolia through confidential settlement
- the public ETH bond layer has been removed from the active factory path
- the active collateral model is now:
  - buyer confidential purchase deposit
  - seller confidential bond deposit
  - seller confidential delivery-fee deposit
  - transporter confidential bond deposit

### What the active implementation now does

In the active contract path:

- buyer deposits the confidential paid amount
- seller deposits a confidential bond intended to mirror the buyer paid amount
- seller confirmation depends on both buyer funding and seller bond funding
- transporter is still selected publicly
- seller delivery fee remains a separate confidential deposit
- transporter posts a confidential bond intended to mirror the buyer paid amount
- successful delivery pays:
  - seller = buyer payment + seller bond
  - transporter = seller delivery fee + transporter bond
- timeout logic redistributes confidential balances without any public ETH bond side effects

### Important current limitation

The active implementation requires the seller/transporter confidential bond deposits to exist, but it does not yet cryptographically enforce on-chain that:

- `seller bond == buyer paid amount`
- `transporter bond == buyer paid amount`

That equality is currently enforced operationally by the smoke/test workflow, not by a hard on-chain encrypted-equality gate.

### Files that reflect the current implemented model

- `contracts/erc7984/ProductEscrowConfidential_Initializer.sol`
- `contracts/erc7984/ProductFactoryConfidential.sol`
- `test/erc7984/ProductFactoryConfidential.test.js`
- `scripts/erc7984/smoke-factory-sepolia.js`

## Source contract being redesigned

Reference source: `C:\Users\yamen\Downloads\ProductEscrow.sol`

## Goal

Redesign the original payable-ETH escrow into an ERC-7984 confidential-token escrow while preserving the same business flow:

- buyer pays into escrow
- seller confirms order
- transporter is selected
- transporter posts security deposit
- delivery is confirmed or cancelled
- escrow pays seller / transporter / buyer according to phase rules

## High-level shift

The original contract mixes:

- public business state
- public money values
- native ETH transfers

The ERC-7984 redesign keeps:

- public business state and workflow

but replaces:

- `msg.value`
- `transfer(...)`
- public on-chain payment amounts

with:

- confidential ERC-7984 token transfers
- confidential escrow-held balances
- confidential payouts from escrow

## What remains public vs private

### Public

- `productId`
- `name`
- `seller`
- `buyer`
- `transporter`
- order / delivery phase
- timestamps and timeouts
- token address used for settlement
- optional public `unitPrice` if the marketplace still wants a public listing price

### Private

- purchase amount deposited by buyer
- seller bond amount
- transporter delivery fee
- transporter security deposit
- seller payout amount
- buyer refund amount
- transporter payout / penalty amount

## Core redesign decisions

### 1. Replace ETH with one confidential settlement token

The original contract is ETH-native. ERC-7984 is token-native.

So the redesigned escrow uses:

- `IERC7984 paymentToken`

All custody and settlement happens in that token.

### 2. Keep role/state logic public

Privacy should focus on value flow, not on hiding who the seller or transporter is. That keeps the workflow understandable and auditable.

### 3. Hold separate confidential balances per order purpose

Instead of one public ETH balance, store confidential balance handles for:

- buyer purchase deposit
- seller bond deposit
- seller-funded transporter fee deposit
- transporter security deposit

This makes delivery confirmation and cancellation logic easier to express.

### 4. Use callback-based deposits first

Incoming confidential payments should use:

- `confidentialTransferAndCall(...)`

That keeps the same conceptual “pay into escrow” model as the original contract.

## Proposed contract: `ProductEscrowConfidentialV1`

### Public storage

```solidity
IERC7984 public immutable paymentToken;
uint256 public productId;
string public name;
address public seller;
address public buyer;
address public transporter;
uint64 public purchaseTimestamp;
uint64 public deliveryDeadline;
bool public purchased;

enum EscrowPhase {
    Listed,
    BuyerPaid,
    SellerConfirmed,
    TransporterBound,
    Delivered,
    Cancelled
}

EscrowPhase public phase;
```

### Confidential storage

```solidity
euint64 private _buyerDeposit;
euint64 private _sellerDeliveryFeeDeposit;
euint64 private _transporterSecurityDeposit;
```

Optional later:

```solidity
euint64 private _unitPrice;
euint64 private _deliveryFeeQuoted;
euint64 private _securityDepositRequired;
```

For V1, quoted values can remain public if desired, while actual settlement flows are private.

## Deposit callback model

The escrow should distinguish which confidential deposit is being made.

### Proposed callback payload

```solidity
abi.encode(
    bytes32 orderId,
    DepositKind kind
)
```

Where:

```solidity
enum DepositKind {
    BuyerPurchase,
    SellerBond,
    SellerDeliveryFee,
    TransporterSecurityDeposit
}
```

The callback:

- validates token sender
- validates expected actor for that deposit kind
- stores the encrypted amount in the correct confidential balance slot
- advances phase if the deposit completes a required step

## Function-by-function redesign

### Constructor

### Original

```solidity
constructor(string memory _name, uint _price, address _owner)
```

### Redesigned

```solidity
constructor(
    uint256 productId_,
    string memory name_,
    address seller_,
    IERC7984 paymentToken_,
    uint64 deliveryWindowSeconds_
)
```

Notes:

- remove public plaintext `price`
- add `paymentToken`
- set public delivery window policy

### `depositPurchase() payable`

### Original meaning

Buyer deposits the product payment into escrow.

### Redesigned

Replace with confidential callback deposit:

```solidity
function onConfidentialTransferReceived(
    address operator,
    address from,
    euint64 amount,
    bytes calldata data
) external returns (ebool);
```

Behavior for `DepositKind.BuyerPurchase`:

- require `phase == Listed`
- require `from != seller`
- set `buyer = from`
- set `_buyerDeposit = amount`
- set `purchased = true`
- set `purchaseTimestamp`
- set `phase = BuyerPaid`

### `confirmOrder(string vcCID)`

### Original meaning

Seller confirms the purchase and starts delivery timing.

### Redesigned

```solidity
function confirmOrder(bytes32 orderId, string calldata vcCID) external onlySeller
```

Behavior:

- require `phase == BuyerPaid`
- require seller confidential bond funding to be present
- set `purchaseTimestamp = block.timestamp`
- set `deliveryDeadline = block.timestamp + configuredWindow`
- set `phase = SellerConfirmed`
- optionally anchor `vcHash = keccak256(bytes(vcCID))`

### `createTransporter(uint _feeInEther)`

### Original meaning

Transporters register publicly with a fee quote.

### Redesigned

This can stay mostly public:

```solidity
function createTransporter(uint64 quotedFee) external
```

Reason:

- this is market configuration, not actual settlement movement
- keeping transporter bidding public is simpler

Optional later:

- transporter fee quote can become confidential too, but that is not required for the first redesign

### `setTransporter(address payable _transporter) external payable`

### Original meaning

Seller selects transporter and deposits delivery fee.

### Redesigned

Split into:

```solidity
function setTransporter(address transporter_) external onlySeller
```

and a confidential seller deposit through callback:

- seller calls `paymentToken.confidentialTransferAndCall(address(this), ..., abi.encode(orderId, DepositKind.SellerDeliveryFee))`

Behavior:

- `setTransporter(...)` sets transporter identity only
- callback for `SellerDeliveryFee` stores `_sellerDeliveryFeeDeposit`
- once transporter is chosen and seller fee deposit exists, set `phase = TransporterBound`

### `sellerBond()`

### Active implemented meaning

The active factory path now includes a seller confidential bond deposit after buyer payment and before seller confirmation:

```solidity
paymentToken.confidentialTransferAndCall(
    address(this),
    ...,
    abi.encode(orderId, DepositKind.SellerBond)
)
```

Behavior:

- require `phase == Purchased`
- require `from == seller`
- store `_sellerBondDeposit`
- allow seller confirmation only after this bond exists

### `securityDeposit() payable`

### Original meaning

Transporter posts security deposit equal to price.

### Redesigned

Transporter confidential deposit through callback:

- transporter calls `confidentialTransferAndCall(...)`
- callback receives `DepositKind.TransporterSecurityDeposit`

Behavior:

- require `msg.sender == paymentToken`
- require `from == transporter`
- require transporter already assigned
- store `_transporterSecurityDeposit = amount`
- in the current spike workflow, this confidential bond is intended to equal the buyer paid amount

### `confirmDelivery(string vcCID)`

### Original meaning

Buyer confirms delivery:

- seller gets price
- transporter gets security deposit + delivery fee
- ownership moves to buyer

### Redesigned

```solidity
function confirmDelivery(bytes32 orderId, string calldata vcCID) external onlyBuyer
```

Behavior:

- require `phase == TransporterBound`
- require current time within delivery deadline
- confidential-transfer `_buyerDeposit + _sellerBondDeposit` to seller
- confidential-transfer `_sellerDeliveryFeeDeposit + _transporterSecurityDeposit` to transporter
- set `seller = buyer` only if ownership transfer is still desired in this product model
- set `phase = Delivered`

Important:

- the payout sum to transporter requires encrypted addition
- escrow must grant appropriate FHE permissions to the token during payout

### `withdrawProductPrice()`

### Original meaning

Buyer triggers direct payout when transporter is set.

### Redesigned

This function is probably not needed as a separate path.

Why:

- `confirmDelivery(...)` already becomes the correct release trigger
- the original function appears inconsistent with the delivery flow because it pays transporter `price + deliveryFee`, which likely overpays

Recommendation:

- remove it in confidential V1

### `cancelDelivery()`

### Original meaning

Seller cancels and the contract redistributes:

- transporter gets `0.2 * price + deliveryFee + price`
- seller gets `0.1 * price`
- buyer gets `0.7 * price`

### Redesigned

```solidity
function cancelDelivery(bytes32 orderId) external onlySeller
```

Behavior:

- require `phase == TransporterBound`
- compute confidential splits from `_buyerDeposit`
- confidential-transfer seller share
- confidential-transfer buyer refund share
- confidential-transfer transporter penalty/fee share plus return of `_transporterSecurityDeposit` as policy requires
- set `phase = Cancelled`

Important note:

The original percentages should be re-validated before porting because the current math is hard to justify economically and mixes delivery fee, deposit, and product price in a way that may not reflect the intended policy.

So for V1 redesign:

- do not blindly preserve the exact split formula
- preserve the *idea* of seller cancel leading to private redistribution

### `checkAndDeleteProduct()` / `deleteProduct()`

### Original meaning

After timeout, emit deletion and wipe state.

### Redesigned

Avoid deleting confidential state aggressively.

Use:

```solidity
function markExpired(bytes32 orderId) external
```

Behavior:

- require deadline exceeded
- set phase to expired/cancelled equivalent
- keep history for audit

Why:

- confidential escrow systems should preserve settlement history
- deleting state is poor for auditability and dispute handling

## Recommended events

```solidity
event BuyerDepositRecorded(bytes32 indexed orderId, address indexed buyer);
event SellerDeliveryFeeRecorded(bytes32 indexed orderId, address indexed seller);
event TransporterSecurityDepositRecorded(bytes32 indexed orderId, address indexed transporter);
event OrderConfirmed(bytes32 indexed orderId, string vcCID);
event TransporterAssigned(bytes32 indexed orderId, address indexed transporter);
event DeliveryConfirmed(bytes32 indexed orderId, string vcCID);
event DeliveryCancelled(bytes32 indexed orderId);
event ConfidentialPayoutReleased(bytes32 indexed orderId, address indexed recipient, bytes32 payoutKind);
```

## Minimal V1 implementation scope

The cleanest first implementation of this redesign should include only:

1. buyer confidential deposit into escrow
2. seller confirm
3. transporter assignment
4. seller confidential release
5. buyer confirm delivery

Leave these for V2:

- confidential cancellation split math
- transporter bid marketplace redesign
- wrapped asset integration
- VC anchoring and auditor redesign

## Practical conclusion

Yes, the original `ProductEscrow.sol` can be re-expressed as an ERC-7984 escrow.

The clean translation is:

- keep the workflow public
- move all value custody and settlement to confidential ERC-7984 token balances
- replace payable functions with confidential callback deposits
- remove the public ETH bond layer from the active factory path
- replace ETH transfers with confidential escrow payouts

The main architectural change is not the state machine. It is the settlement layer:

- from native ETH + public amounts
- to confidential token custody + encrypted payouts

## Best next implementation step

Implement `ProductEscrowConfidentialV1.sol` with:

- buyer confidential deposit
- seller confirm
- seller release path
- transporter assignment placeholder

and keep cancellation math for a follow-up slice.
