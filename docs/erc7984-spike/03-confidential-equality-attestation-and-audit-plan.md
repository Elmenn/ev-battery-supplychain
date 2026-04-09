# Confidential Equality Attestation and Audit Plan

## Why this document exists

## Implementation update: March 13, 2026

The first Phase A slice is now implemented in the active spike path:

- seller bond equality handle is computed on deposit
- seller bond equality handle is made publicly decryptable
- on-chain `finalizeEqualityAttestation(...)` verifies the public decryption proof
- `confirmOrderById(...)` is gated on seller bond equality status == `VerifiedTrue`
- transporter bond equality handle is computed on deposit
- transporter bond equality handle is made publicly decryptable
- on-chain `finalizeEqualityAttestation(...)` now supports transporter bond equality verification too
- `confirmDelivery(...)` is gated on transporter bond equality status == `VerifiedTrue`

What is still pending:

- buyer-payment-to-hidden-total bridge design and implementation
- ERC-7984 VRC 6.0 path

The active spike now proves a confidential-only collateral model on Sepolia:

- buyer confidential purchase deposit
- seller confidential bond deposit
- seller confidential delivery-fee deposit
- transporter confidential bond deposit

What is still missing is hard enforcement that:

- `seller bond == buyer paid amount`
- `transporter bond == buyer paid amount`

The current flow enforces those equalities operationally in tests and smoke scripts, but not yet by contract-verified confidential logic.

This document defines the next design slice that is both privacy-preserving and implementable with the current fhEVM stack.

For the broader private-quantity and auditability design decision that sits above this mechanism, see:

- `docs/erc7984-spike/04-private-quantity-payment-bridge-options.md`

## Constraint from the current fhEVM stack

The current contract path records confidential deposits synchronously inside `onConfidentialTransferReceived(...)`.

The stack gives us:

- encrypted equality with `FHE.eq(...)`
- public-decryption permissioning with `FHE.makePubliclyDecryptable(...)`
- KMS proof verification with `FHE.checkSignatures(...)`

What it does not give us cleanly in the current callback-only flow is:

- a safe same-transaction branch from encrypted equality into public state transition

So the next enforceable design should not try to do:

1. deposit
2. encrypted compare
3. immediately branch on plaintext result in the same callback

Instead it should do:

1. deposit
2. compute encrypted equality handle
3. mark that handle publicly decryptable
4. receive a later public decryption result plus KMS proof
5. update public gating state only after proof verification

## Recommended enforcement model

### Core idea

Treat confidential bond equality as a contract-verifiable attestation step.

The contract computes an encrypted equality result:

- `sellerBondEqBuyer = FHE.eq(_sellerBondDeposit, _buyerDeposit)`
- `transporterBondEqBuyer = FHE.eq(_transporterSecurityDeposit, _buyerDeposit)`

Then it makes each equality handle publicly decryptable and stores that handle as a pending attestation target.

Later, a public decryption callback/submit function verifies the KMS proof and records the boolean result:

- `true` means the confidential equality policy has been satisfied
- `false` means the policy failed

No amount is revealed. Only the equality result becomes public.

### Why this fits the privacy goal

It reveals:

- that a required equality relation holds or fails
- when it was attested
- which order/role the attestation belongs to

It does not reveal:

- the buyer paid amount
- the seller bond amount
- the transporter bond amount

That is a reasonable privacy tradeoff for auditor-verifiable policy enforcement.

## Proposed contract changes

Target file:

- `contracts/erc7984/ProductEscrowConfidential_Initializer.sol`

### New enums

```solidity
enum EqualityTarget {
    SellerBondMatchesBuyerDeposit,
    TransporterBondMatchesBuyerDeposit
}

enum EqualityStatus {
    None,
    Pending,
    VerifiedTrue,
    VerifiedFalse
}
```

### New storage

```solidity
struct EqualityAttestation {
    EqualityStatus status;
    bytes32 handle;
    uint64 requestedAt;
    uint64 verifiedAt;
}

mapping(uint8 => EqualityAttestation) private _equalityAttestations;
```

Recommended mapping:

- `uint8(EqualityTarget.SellerBondMatchesBuyerDeposit)`
- `uint8(EqualityTarget.TransporterBondMatchesBuyerDeposit)`

### New events

```solidity
event EqualityAttestationRequested(
    bytes32 indexed orderId,
    EqualityTarget indexed target,
    bytes32 indexed handle
);

event EqualityAttestationVerified(
    bytes32 indexed orderId,
    EqualityTarget indexed target,
    bool result
);
```

### New internal flow

When seller bond is deposited:

1. compute `eqHandle = FHE.eq(_sellerBondDeposit, _buyerDeposit)`
2. call `FHE.makePubliclyDecryptable(eqHandle)`
3. store `Pending` equality attestation for seller target
4. emit `EqualityAttestationRequested(...)`

When transporter bond is deposited:

1. compute `eqHandle = FHE.eq(_transporterSecurityDeposit, _buyerDeposit)`
2. call `FHE.makePubliclyDecryptable(eqHandle)`
3. store `Pending` equality attestation for transporter target
4. emit `EqualityAttestationRequested(...)`

### New public proof-verification function

Recommended shape:

```solidity
function finalizeEqualityAttestation(
    bytes32 orderId,
    EqualityTarget target,
    bytes calldata abiEncodedCleartexts,
    bytes calldata decryptionProof
) external nonReentrant;
```

Recommended behavior:

1. require the order is still active
2. load the stored equality handle for `target`
3. require attestation status is `Pending`
4. call `FHE.checkSignatures(handlesList, abiEncodedCleartexts, decryptionProof)`
5. decode `abiEncodedCleartexts` as `bool`
6. set status to `VerifiedTrue` or `VerifiedFalse`
7. emit `EqualityAttestationVerified(...)`

Contract trust is anchored to the stored equality handle, not to a user-asserted amount.

### New gating rules

`confirmOrderById(...)` should require:

- buyer deposit present
- seller bond deposit present
- seller bond equality attestation status == `VerifiedTrue`

`confirmDelivery(...)` should require:

- buyer deposit present
- seller bond deposit present
- seller delivery fee deposit present
- transporter bond deposit present
- transporter bond equality attestation status == `VerifiedTrue`

### Timeout behavior

When `sellerTimeout()`, `bidTimeout()`, or `deliveryTimeout()` clears the active order, the contract should also clear any pending/verified equality attestation state for that order.

That prevents stale attestation reuse.

## Why handle-bound verification is enough

The important invariant is:

- the contract must only accept an equality result for the exact encrypted comparison handle it created from the current order state

If the contract checks the stored handle and verifies the KMS proof against that handle, the attestation is already bound to:

- the current escrow contract
- the current order lifecycle
- the current encrypted deposits

That means we do not need to reveal the amount and we do not need a separate plaintext equality witness.

## Recommended implementation order

Do not implement both equality targets at once.

### Slice 1

Implement seller bond equality attestation first.

Reasons:

- it is the earlier workflow gate
- it blocks `confirmOrderById(...)`
- it is simpler to test than the transporter path

### Slice 2

Extend the same mechanism to transporter bond equality attestation and gate `confirmDelivery(...)`.

## Test impact

Target file:

- `test/erc7984/ProductFactoryConfidential.test.js`

Add tests for:

1. seller cannot confirm while seller equality attestation is pending
2. seller can confirm after attested `true`
3. seller cannot confirm after attested `false`
4. delivery cannot complete while transporter equality attestation is pending
5. delivery can complete after attested `true`
6. timeout clears pending equality-attestation state
7. stale proof submission for cleared/expired order reverts

Local mock testing can simulate the verification callback by directly supplying a deterministic proof path or a contract-only test hook if fhEVM tooling makes proof generation too heavy for unit tests.

## Sepolia smoke impact

Target file:

- `scripts/erc7984/smoke-factory-sepolia.js`

New smoke flow should become:

1. deploy token + implementation + factory
2. create product clone
3. buyer deposits confidential purchase amount
4. seller deposits confidential bond
5. request/finalize seller equality attestation
6. seller confirms order
7. transporter selected
8. seller deposits confidential delivery fee
9. transporter deposits confidential bond
10. request/finalize transporter equality attestation
11. transporter confirms delivery
12. decrypt end balances

The smoke script should log:

- equality handle requested
- equality attestation result
- tx hash of each attestation finalize step

## VRC redesign for ERC-7984

The main repo VRC logic should be reused conceptually, not copied blindly.

The current shipped VRC is built around:

- Railgun payment references
- quantity/total/payment commitments
- Bulletproof proof payloads

The ERC-7984 redesign needs a different final artifact.

### Recommended VRC direction

Create a separate ERC-7984 VRC schema version rather than forcing the current Railgun fields into the spike.

Recommended next schema version:

- `schemaVersion: "6.0-erc7984-spike"`

Important:

- this document covers the collateral-equality mechanism
- it does not fully solve the separate problem of proving that the buyer ERC-7984 confidential deposit equals the hidden order total proved in the VRC layer

That bridge problem is now treated as a first-class design item in:

- `docs/erc7984-spike/04-private-quantity-payment-bridge-options.md`

Recommended new `credentialSubject` sections:

- `listing`
- `order`
- `settlementPolicy`
- `confidentialAssertions`
- `attestation`

### `listing`

Keep:

- product metadata
- `unitPriceHash`
- certificate/component references

Do not keep Railgun-specific payment routing fields.

### `order`

Keep:

- `orderId`
- `productId`
- `escrowAddr`
- `chainId`
- `buyerAddress`
- selected `transporterAddress` if final
- final workflow timestamps if useful

### `settlementPolicy`

New section describing the privacy policy without revealing values:

- settlement token address
- buyer deposit required: `true`
- seller bond policy: `equalToBuyerDeposit`
- transporter bond policy: `equalToBuyerDeposit`
- seller delivery fee policy: `separateConfidentialDeposit`

### `confidentialAssertions`

New section carrying public evidence about hidden-value relations:

- seller bond equality attestation:
  - status
  - on-chain attestation tx hash
  - handle hash
- transporter bond equality attestation:
  - status
  - on-chain attestation tx hash
  - handle hash

Important:

- store boolean result and proof references
- do not store clear amounts

### `attestation`

Keep an order-bound `contextHash`, but redefine its inputs for the ERC-7984 flow.

Recommended context inputs:

- chainId
- escrow address
- orderId
- productId
- unitPriceHash
- payment token
- seller address
- buyer address
- transporter address if bound

This keeps the final VRC self-contained and bound to one escrow/order context even without Railgun references.

## Frontend adaptation plan

Target area:

- `frontend/src/components/erc7984`
- `frontend/src/utils/erc7984`

The spike frontend currently has no active ERC-7984 UI implementation, so the cleanest path is to build spike-specific helpers first.

### Required UI state additions

The product/order screen will need explicit public state for:

- seller bond deposited
- seller bond equality attestation pending/verified/failed
- transporter bond deposited
- transporter bond equality attestation pending/verified/failed

### Required client helpers

The frontend should own these responsibilities:

1. detect when an equality handle is ready on-chain
2. request public decryption through the fhEVM client path
3. submit the resulting proof to `finalizeEqualityAttestation(...)`
4. include attestation evidence in the spike VRC builder

That client-side shape is captured in:

- `frontend/src/utils/erc7984/equalityAttestationModel.js`

## Backend adaptation plan

Target area:

- `backend/api/erc7984`

The main repo backend already provides the right architectural pattern:

- archive-first VC retrieval
- credential status
- order reconciliation
- verifier routes

The spike should reuse that pattern with ERC-7984-specific payloads.

### Recommended first backend additions

1. order equality-attestation archive row
2. request validation for equality-attestation payloads
3. VRC archive/status endpoints reusing the existing archive-first model
4. verifier endpoint that checks:
   - seller signature
   - credential status
   - on-chain `vcHash`
   - on-chain equality attestation status

The shared payload shape for backend work is captured in:

- `backend/api/erc7984/equalityAttestationModel.js`

## Auditor and verifier model

The auditor should be able to verify policy compliance without learning the hidden amount.

### What the auditor should verify

1. the final VRC signature
2. current credential status
3. final `vcHash` anchor on-chain
4. seller bond equality attestation result on-chain
5. transporter bond equality attestation result on-chain
6. escrow phase progression and payout end state

### What the auditor should not learn

- buyer paid amount
- seller bond amount
- transporter bond amount

### What the auditor can still conclude

- seller bond matched buyer deposit
- transporter bond matched buyer deposit
- the confidential policy was enforced before final state progression

This is much closer to the original privacy goal than the Railgun-based workaround because the escrow itself becomes the policy-enforcement point.

## Main limitation that remains even after this slice

Even with contract-verified equality attestation, the system will still prove only relation-level facts such as:

- amount A equals amount B

It will not prove higher-level business semantics such as:

- hidden total equals `unitPrice * quantity`

unless we add a separate confidential-quantity/VRC proof layer back into the ERC-7984 design.

That should be treated as a later phase, not mixed into the first equality-enforcement slice.

## Recommended next exact files

Contract slice:

- `contracts/erc7984/ProductEscrowConfidential_Initializer.sol`
- `test/erc7984/ProductFactoryConfidential.test.js`
- `scripts/erc7984/smoke-factory-sepolia.js`

VRC/backend/frontend slice after that:

- `frontend/src/utils/erc7984/equalityAttestationModel.js`
- `frontend/src/utils/erc7984/vrcBuilder.js`
- `frontend/src/components/erc7984/*`
- `backend/api/erc7984/equalityAttestationModel.js`
- `backend/api/erc7984/*`
