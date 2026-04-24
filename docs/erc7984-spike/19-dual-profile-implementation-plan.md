# Dual Marketplace Profile Implementation Plan

## Current status

As of April 13, 2026, the dual-profile track is no longer only a plan.

Implementation status:

- Phase 1 `Freeze profile semantics`: complete
- Phase 2 `Add factory-level profile selection`: complete
- Phase 3 `Add private-price escrow variant`: complete
- Phase 4 `Keep lifecycle parity`: complete at the contract shape level
- Phase 5 `Wire frontend product creation`: complete
- Phase 6 `Wire proof selection`: complete
- Phase 7 `Update VRC artifact shape`: complete
- Phase 8 `Add comparative evaluation plan`: pending

Verification status:

- both product profiles now produce complete order VRCs
- `public-price` VRCs carry Fiat-Shamir proof payloads
- `private-price` VRCs carry Bulletproof proof payloads
- auditor-side proof checks pass for both proof statements in both profiles
- backend `POST /verify-vc` now verifies:
  - seller signature
  - embedded quantity-total proof
  - embedded total-payment proof
- backend verification has been confirmed for both:
  - `public-price + Fiat-Shamir`
  - `private-price + Bulletproof`

Live deployment status:

- a dual-profile Sepolia deployment was created on April 13, 2026
- the deployment JSON was updated in [erc7984-sepolia-latest.json](c:\Users\yamen\ev-battery-supplychain-erc7984\frontend\public\erc7984-sepolia-latest.json)
- the deployment smoke-tested both profile creation paths on-chain:
  - one `public-price` product was created successfully
  - one `private-price` product was created successfully
  - both escrows returned the expected `priceVisibility` and price anchor state

Current limitation:

- the new dual-profile deployment has now been Etherscan-verified from this worktree (`2026-04-24`)
- verified addresses and links are maintained in [11-smart-contract-function-map-and-transaction-note.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\11-smart-contract-function-map-and-transaction-note.md)
- the remaining major work item is evaluation of the two profiles side by side, not baseline implementation

## Short freeze summary

At the current freeze point:

- dual-profile product creation is working
- dual-profile order VRC generation is working
- `public-price` VRC verification is working through backend `/verify-vc`
- `private-price` VRC verification is working through backend `/verify-vc`
- the next step is evaluation comparison, not more baseline verifier plumbing

## Goal

This note turns the dual-profile idea into a concrete implementation plan.

The target is to support two product profiles under the ERC-7984 marketplace:

1. `public-price`
2. `private-price`

The intended comparison is architectural:

- `public-price` profile paired with the lighter Fiat-Shamir proof path
- `private-price` profile paired with the more general Bulletproof-based path

## Scope of this plan

This plan is intentionally conservative.

It does **not** try to redesign the whole marketplace at once.

It focuses on:

- product creation model
- escrow contract shape
- proof requirements
- frontend flow changes
- evaluation readiness

## High-level design choice

The clean implementation model is:

- one shared factory family
- two product modes
- one mode chosen at listing creation time

Not recommended:

- creating two escrows for every single product instance

Recommended:

- create exactly one product escrow per product
- but choose which escrow template/profile that product uses

## Proposed product profiles

### Profile A: Public-price

Contract behavior:

- `unitPrice` stored publicly on-chain
- `unitPriceHash` may still be retained if useful for compatibility or binding

Proof layer:

- Fiat-Shamir proofs for:
  - `total = unitPrice * quantity`
  - `payment = total`

Use case:

- simpler auditability
- public catalog price
- lighter proof path

### Profile B: Private-price

Contract behavior:

- `unitPrice` not stored publicly on-chain
- a hidden-price commitment / hash anchor stored on-chain instead

Proof layer:

- Bulletproof-based path for the economic statements needed under hidden price

Use case:

- stronger confidentiality for negotiated or sensitive prices
- more private commercial model

## Recommended contract structure

There are two realistic implementation paths.

### Option 1: Two separate escrow contracts

- `ProductEscrowConfidential_PublicPrice`
- `ProductEscrowConfidential_PrivatePrice`

Advantages:

- very clear separation
- simpler reasoning about each profile
- easier later evaluation and explanation

Costs:

- more duplicated lifecycle code
- need discipline to keep both variants aligned

### Option 2: One escrow contract with a mode flag

- single escrow contract
- `priceVisibility` or `profileType` fixed during initialization

Advantages:

- less code duplication

Costs:

- more branching complexity
- easier to create tangled logic
- harder to explain and benchmark cleanly

## Recommendation

For this spike, prefer **Option 1**:

- two escrow variants
- shared lifecycle shape
- explicit profile separation

This is better for:

- implementation clarity
- evaluation clarity
- presentation clarity

## Suggested naming

- `ProductEscrowConfidential_PublicPrice`
- `ProductEscrowConfidential_PrivatePrice`
- `ProductFactoryConfidentialDualProfile`

If you want to avoid too much renaming early, the current factory can be evolved instead of replaced, but the profile distinction should still be explicit in function names and events.

## Concrete implementation phases

## Phase 1: Freeze profile semantics

Before code changes, define exactly:

- what is public in `public-price`
- what is hidden in `private-price`
- what on-chain anchor replaces public `unitPrice` in `private-price`

Minimum recommended rule:

- `public-price`:
  - public `unitPrice`
- `private-price`:
  - no public `unitPrice`
  - on-chain `unitPriceHash` only, or a dedicated price commitment anchor

Output of this phase:

- one short decision note or extension to [18-dual-marketplace-profile-comparison-note.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\18-dual-marketplace-profile-comparison-note.md)

## Phase 2: Add factory-level profile selection

Factory changes:

- product creation must include profile selection
- the creation event must expose which profile was chosen

Possible API shape:

- `createProductConfidentialPublicPrice(...)`
- `createProductConfidentialPrivatePrice(...)`

This is cleaner than:

- one overloaded create function with many optional semantics

Files likely affected:

- [ProductFactoryConfidential.sol](c:\Users\yamen\ev-battery-supplychain-erc7984\contracts\erc7984\ProductFactoryConfidential.sol)

## Phase 3: Add private-price escrow variant

Create the second escrow contract.

Public-price escrow can stay close to the current implemented model.

Private-price escrow should define:

- hidden-price anchor
- any additional state needed for hidden-price proof verification workflow
- same order lifecycle phases as far as possible

Files likely added:

- `contracts/erc7984/ProductEscrowConfidential_PublicPrice.sol`
- `contracts/erc7984/ProductEscrowConfidential_PrivatePrice.sol`

or initializer-style equivalents if you keep the clone pattern exactly as today.

## Phase 4: Keep lifecycle parity

The two profiles should keep the same business flow where possible:

- create product
- buyer purchase
- seller bond
- seller confirm
- transporter bid/select
- delivery fee
- transporter bond
- delivery confirm

Only the price/proof boundary should differ.

This matters because otherwise the later comparison becomes too noisy.

## Phase 5: Wire frontend product creation

At product creation time, the seller must choose:

- `public-price`
- `private-price`

UI changes:

- profile selector in the product form
- profile-specific price wording
- profile-specific validation

Public-price form:

- current decimal WETH input model is fine

Private-price form:

- likely different UX because public price is not shown
- at minimum the seller still needs to input the intended confidential price locally before proof generation

Files likely affected:

- [ProductFormStep1.jsx](c:\Users\yamen\ev-battery-supplychain-erc7984\frontend\src\components\marketplace\ProductFormStep1.jsx)
- [ProductFormStep3.jsx](c:\Users\yamen\ev-battery-supplychain-erc7984\frontend\src\components\marketplace\ProductFormStep3.jsx)
- [ProductFormStep4.jsx](c:\Users\yamen\ev-battery-supplychain-erc7984\frontend\src\components\marketplace\ProductFormStep4.jsx)

## Phase 6: Wire proof selection

Public-price profile:

- use the current Fiat-Shamir path

Private-price profile:

- use the Bulletproof path

Important rule:

- the chosen profile should determine the proof system
- the operator should not manually choose proof type per order

That keeps the profile comparison coherent.

Files likely affected:

- [paymentBridgeSidecar.js](c:\Users\yamen\ev-battery-supplychain-erc7984\frontend\src\utils\erc7984\paymentBridgeSidecar.js)
- [equalityProofClient.js](c:\Users\yamen\ev-battery-supplychain-erc7984\frontend\src\utils\equalityProofClient.js)
- backend proof routes and dispatch helpers

## Phase 7: Update VRC artifact shape

The VRC or bridge artifact must record:

- which marketplace profile was used
- which proof family was used

At minimum:

- `priceVisibility`
- `proofFamily`

The current implementation also records the proof payload needed for later verification:

- `proofType`
- `proofEngine`
- `proofHex` for Bulletproof paths
- `proofRHex` / `proofSHex` for Fiat-Shamir paths
- `proofSizeBytes`
- `verified`
- `priceCommitment` where relevant

This is necessary so later auditors and evaluators do not guess.

Files likely affected:

- [vcBuilder.mjs](c:\Users\yamen\ev-battery-supplychain-erc7984\frontend\src\utils\vcBuilder.mjs)
- payment-bridge model files in frontend and backend

## Phase 8: Add comparative evaluation plan

Once both profiles exist, evaluate them under parallel metrics:

- proof generation time
- proof size
- proof verification time
- gas / transaction profile
- end-to-end creation latency
- end-to-end verification latency
- privacy boundary differences

The evaluation should explicitly say:

- this is a profile-to-profile comparison
- not a universal proof-system ranking

## Minimal viable slice

The smallest useful next implementation slice is:

1. keep current public-price profile as the baseline
2. add a minimal private-price profile
3. support product creation for both
4. wire proof-family selection by profile
5. prove one end-to-end path for each profile

That is enough to start the comparison without overbuilding.

## Biggest risks

### Risk 1: Changing too many variables

If lifecycle behavior also changes heavily between profiles, the comparison becomes muddy.

Mitigation:

- keep the same business lifecycle
- change mainly the price visibility and proof path

### Risk 2: UI confusion

If the user has to understand cryptography to create a listing, the product model is too complex.

Mitigation:

- expose only:
  - public-price
  - private-price

Do not expose:

- Fiat-Shamir vs Bulletproof directly in the UI

### Risk 3: Weak private-price definition

If `private-price` is underspecified, the contract and proof design will drift.

Mitigation:

- define the exact hidden/public fields before coding

## Immediate next step

The next concrete task is no longer contract design.

The next concrete task should be:

- run comparative evaluation for `public-price` vs `private-price`

That evaluation should cover:

- end-to-end creation flow for both profiles
- proof generation time
- proof size
- proof verification time
- on-chain transaction cost and latency
- privacy-boundary differences

Optional cleanup immediately after that:

- keep contract verification links current in the docs whenever deployments rotate

## Frozen design decisions

The following decisions are now treated as fixed for the next implementation slice:

1. The marketplace will support exactly two product profiles:
   - `public-price`
   - `private-price`
2. Each product instance will use exactly one escrow profile.
3. The `public-price` profile keeps the current Fiat-Shamir path.
4. The `private-price` profile stores an on-chain Pedersen price commitment anchor.
5. The `private-price` profile uses Bulletproof-based proofs over committed values, not a public `unitPrice`.
6. Both profiles keep the same marketplace lifecycle as far as possible.

## Concrete private-price specification

This section freezes the implementation-ready shape of the `private-price` profile.

### On-chain state

The private-price escrow should store:

- `priceCommitment`
  - Pedersen commitment to the hidden price
- `priceCommitmentScheme`
  - optional short version tag if needed for future migration
- `paymentToken`
- all existing lifecycle state already used today

The private-price escrow should **not** store:

- public `unitPrice`
- public `unitPriceHash` as the main economic source of truth

If a hash anchor is still useful for cheap indexing or compatibility, it should be treated as secondary metadata only, not the authoritative price anchor.

### Public-price on-chain state

The public-price escrow keeps the current model:

- `unitPrice`
- `unitPriceHash`
- `paymentToken`
- current lifecycle state

### Proof statements

#### Public-price / Fiat-Shamir

The current statements remain:

- `total = unitPrice * quantity`
- `payment = total`

where:

- `unitPrice` is public
- `quantity`, `total`, and `payment` remain private

#### Private-price / Bulletproof

The private-price statement is defined over committed values.

The prover knows openings for:

- `C_price`
- `C_quantity`
- `C_total`
- `C_payment`

and proves that the hidden values satisfy:

- `price * quantity = total`
- `payment = total`

The public verifier checks the proof against:

- `C_price`
- `C_quantity`
- `C_total`
- `C_payment`
- the binding context for the order/product

This means the authoritative public anchor is the commitment `C_price`, while the hidden witness is the actual `price` that opens it.

### Factory API

The factory should expose two explicit creation functions:

- `createProductConfidentialPublicPrice(...)`
- `createProductConfidentialPrivatePrice(...)`

Recommended parameter shape:

#### Public-price creation

- `name`
- `unitPrice`
- `unitPriceHash`
- `paymentToken`

#### Private-price creation

- `name`
- `priceCommitment`
- `paymentToken`

Optional:

- `priceCommitmentScheme`

The creation event should include an explicit profile marker:

- `priceVisibility = public | private`

### Escrow contract layout

Recommended contract split:

- `ProductEscrowConfidential_PublicPrice`
- `ProductEscrowConfidential_PrivatePrice`

The shared behavior should stay aligned:

- purchase
- seller bond
- seller confirm
- transporter bid/select
- delivery fee
- transporter bond
- delivery confirm

Only the economic visibility and proof boundary should differ.

### Frontend product creation flow

The seller chooses one profile at listing creation time:

- `Public Price`
- `Private Price`

#### Public Price UI

- current decimal WETH input remains
- the listing shows public unit price
- current proof flow remains

#### Private Price UI

- seller enters a local confidential price
- frontend generates `priceCommitment`
- listing shows `Price: Private`
- public listing metadata must not expose the price value
- buyer purchase requires a seller-shared private price package off-chain:
  - agreed `price`
  - `priceBlinding`
  - buyer rechecks that this opening matches the on-chain `priceCommitment` before generating the Bulletproof sidecar
- seller-facing UI exposes a local `copy private price package` action for hidden-price listings

### Proof dispatch rules

The proof family must be selected automatically from the product profile.

#### Public-price

- quantity-total proof: Fiat-Shamir
- total-payment proof: Fiat-Shamir

#### Private-price

- quantity-total proof: Bulletproof over commitments
- total-payment proof: Bulletproof over commitments
- current implementation assumes the buyer has received the seller-shared opening for `C_price`

The user must never choose the proof family manually in the UI.

### VRC and metadata shape

Every artifact should record:

- `priceVisibility`
- `proofFamily`

Private-price artifacts should also record:

- `priceCommitment`

Public-price artifacts should record:

- `unitPriceWei`
- `unitPriceHash`

### Current-code impact

The current code surface shows the following migration points:

- `contracts/erc7984/ProductFactoryConfidential.sol`
  - currently assumes `uint64 unitPrice` and `bytes32 unitPriceHash`
- `contracts/erc7984/ProductEscrowConfidential_Initializer.sol`
  - currently stores public `unitPrice` and `unitPriceHash`
- `frontend/src/utils/erc7984/paymentBridgeSidecar.js`
  - currently assumes `unitPriceWei` is available for quantity derivation and proof generation

Those files should be treated as the primary first-pass modification targets.

## Recommended first implementation slice

To keep risk down, the first coding slice should be:

1. split factory creation into explicit public/private creation paths
2. add a private-price escrow variant with `priceCommitment`
3. keep public-price behavior unchanged
4. carry `priceVisibility` through listing metadata
5. make frontend product creation choose the correct path

Only after that should the full private-price proof plumbing be wired end to end.
