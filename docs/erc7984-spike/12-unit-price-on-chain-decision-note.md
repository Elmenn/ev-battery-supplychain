# Decision Note: Public On-Chain `unitPrice`

This note now records the chosen and implemented ERC-7984 price shape.

Earlier in the spike, the open question was whether the ERC-7984 escrow path should continue storing only:

- `unitPriceHash`

or whether it should also store:

- `uint64 public unitPrice`

That decision has now been made before final smart-contract transaction and gas evaluation.

## Short answer

Decision:

- keep `unitPriceHash`
- add `uint64 public unitPrice`

This is now the active contract shape for the current architecture, especially as preparation for a clearer Fiat-Shamir/public-price statement.

## Why this question matters now

The current system already treats price as public at the business level:

- it is shown in the UI
- it is present in listing metadata
- it is present in the VRC
- the proof statement is conceptually:
  - `total = unitPrice * quantity`

But the contract currently stores only:

- `unitPriceHash`

That means the canonical public numeric price is not available directly from chain state.

This creates unnecessary friction in:

- proof explanation
- audit reconstruction
- backend independence
- future Fiat-Shamir transcript design

So this is not only a storage question.
It affects the clarity of the whole trust model.

## Implemented contract shape

The main ERC-7984 contract path now stores:

- `uint64 public unitPrice`
- `bytes32 public unitPriceHash`

in:

- [ProductEscrowConfidential_Initializer.sol](c:\Users\yamen\ev-battery-supplychain-erc7984\contracts\erc7984\ProductEscrowConfidential_Initializer.sol)

and the factory creation path now accepts:

- `string name`
- `uint64 unitPrice`
- `bytes32 unitPriceHash`
- `IERC7984 paymentToken`

in:

- [ProductFactoryConfidential.sol](c:\Users\yamen\ev-battery-supplychain-erc7984\contracts\erc7984\ProductFactoryConfidential.sol)

So the contract now anchors both:

- the canonical public numeric price
- the integrity hash for that public price

For the private-price profile, the architecture remains different by design:

- [ProductEscrowConfidential_PrivatePrice.sol](c:\Users\yamen\ev-battery-supplychain-erc7984\contracts\erc7984\ProductEscrowConfidential_PrivatePrice.sol) stores `privatePriceCommitment`
- private profile intentionally does not expose a public `unitPrice` on-chain

## Option A: Keep only `unitPriceHash`

### Advantages

- smaller on-chain surface
- slightly simpler storage layout
- preserves a minimal commitment to listing integrity
- avoids introducing another public numeric field

### Disadvantages

- chain state alone does not provide the canonical public price
- verifier logic must recover price from off-chain metadata or VRC data
- backend snapshots remain more important than they need to be
- the proof statement `total = price * quantity` is harder to explain as a chain-anchored public statement
- future Fiat-Shamir/public-price proof design becomes more awkward because the public statement input is not directly readable from the contract

### Architectural reading

This option is still defensible if the project wants:

- minimal contract state
- and accepts that price reconstruction remains partly off-chain

But it is not the cleanest trust-minimized design.

## Option B: Store both `unitPriceHash` and public `unitPrice`

### Proposed shape

- keep `bytes32 public unitPriceHash`
- add `uint64 public unitPrice`

### Advantages

- price becomes a canonical on-chain public input
- proof statements become easier to explain:
  - public `unitPrice` from chain
  - hidden `quantity`
  - hidden `total`
- verifier logic becomes cleaner and less reconstruction-heavy
- backend dependence is reduced
- VRC generation becomes simpler because the public numeric price has a chain anchor
- this fits naturally with a future Fiat-Shamir/public-price proof story
- it matches the conceptual architecture already described in the docs:
  - price public
  - quantity private
  - total private
  - paid amount private

### Disadvantages

- one more storage field in the escrow
- slightly higher deployment/initialization cost
- one more argument in the factory and initialization path
- requires frontend and doc updates

### Architectural reading

This option gives the cleanest public/private split:

- public price on-chain
- private quantity/total/payment in commitments and proofs

That is a better fit for the current direction of the spike.

## Why Fiat-Shamir pushes this decision

If the project is likely to add a stronger Fiat-Shamir-based proof description around public price, then public `unitPrice` on-chain becomes much more attractive.

Reason:

- Fiat-Shamir statements are easier to justify when the public statement inputs are canonical and directly accessible
- “public price” should ideally mean:
  - public in chain state
  - not merely public somewhere in backend metadata

So if the future statement is something like:

- prove hidden `total = unitPrice * quantity`

then having `unitPrice` directly on-chain makes the statement more natural and the audit story stronger.

## Trust-model impact

### Without public `unitPrice`

The verifier trust story is:

- chain anchors phase and `unitPriceHash`
- VRC and/or backend provide the actual public price

That is workable, but slightly muddled.

### With public `unitPrice`

The verifier trust story becomes:

- chain anchors:
  - phase
  - `vcHash`
  - payment token
  - public `unitPrice`
- VRC carries:
  - commitments
  - proof objects
  - seller signature

This is a cleaner separation.

## Smart-contract impact (implemented)

With public `unitPrice` adopted, these are the applied changes:

### Factory

In:

- [ProductFactoryConfidential.sol](c:\Users\yamen\ev-battery-supplychain-erc7984\contracts\erc7984\ProductFactoryConfidential.sol)

update creation path from:

- `createProductConfidentialV1(string name, bytes32 unitPriceHash, IERC7984 paymentToken)`

to:

- `createProductConfidentialV1(string name, uint64 unitPrice, bytes32 unitPriceHash, IERC7984 paymentToken)`

Private-profile creation stays on a separate entrypoint:

- `createProductConfidentialPrivatePrice(string name, bytes32 priceCommitment, IERC7984 paymentToken)`

### Escrow initialization

In:

- [ProductEscrowConfidential_Initializer.sol](c:\Users\yamen\ev-battery-supplychain-erc7984\contracts\erc7984\ProductEscrowConfidential_Initializer.sol)

add:

- `uint64 public unitPrice`

and store it during `initializeConfidential(...)`.

Private profile is initialized through:

- `initializeConfidentialPrivatePrice(...)`

### Frontend create-listing flow

In the listing flow:

- compute `unitPriceHash` as today
- also pass numeric `unitPrice` to the factory call

### Verifier and VRC logic

Then the verifier can treat on-chain `unitPrice` as the canonical public price input.

The VRC can still carry `unitPriceWei`, but that field becomes:

- easy to cross-check against chain
- less dependent on backend reconstruction

## Gas / evaluation implication

This is the main procedural consequence:

- final SC gas/transaction evaluation should happen after this decision

Because public `unitPrice` has now been added, the final evaluation should use this updated shape where:

- initialization calldata changes
- storage writes change
- deployment and creation gas change slightly
- final contract-shape evaluation should measure the chosen shape, not an intermediate one

So this note now implies:

1. decide the SC shape first
2. then do the receipt-based transaction/gas evaluation

## Outcome

Given the current direction of the project:

- stronger auditor story
- lower backend dependence
- likely Fiat-Shamir/public-price refinement
- already-public business price

the chosen direction was:

- **add public on-chain `unitPrice`**
- **keep `unitPriceHash`**

This preserves integrity binding while giving the protocol a clean canonical public price.

## Implementation status

This decision is now implemented in:

- [ProductFactoryConfidential.sol](c:\Users\yamen\ev-battery-supplychain-erc7984\contracts\erc7984\ProductFactoryConfidential.sol)
- [ProductEscrowConfidential_Initializer.sol](c:\Users\yamen\ev-battery-supplychain-erc7984\contracts\erc7984\ProductEscrowConfidential_Initializer.sol)
- [ProductFormStep3.jsx](c:\Users\yamen\ev-battery-supplychain-erc7984\frontend\src\components\marketplace\ProductFormStep3.jsx)
- [Erc7984ActionWorkbench.jsx](c:\Users\yamen\ev-battery-supplychain-erc7984\frontend\src\components\erc7984\Erc7984ActionWorkbench.jsx)

The factory and escrow initializer now take and persist:

- `string name`
- `uint64 unitPrice`
- `bytes32 unitPriceHash`
- `IERC7984 paymentToken`

For private-price listings, the corresponding path takes:

- `string name`
- `bytes32 priceCommitment`
- `IERC7984 paymentToken`

The frontend listing path still computes `unitPriceHash` as before, but now also passes the numeric public price on-chain.

## Suggested next step

Now that the contract shape is stable, the next smart-contract evaluation step should be:

- receipt-based transaction and gas measurement on the updated contract shape

## Related docs

- [07-typed-payment-bridge-architecture-note.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\07-typed-payment-bridge-architecture-note.md)
- [11-smart-contract-function-map-and-transaction-note.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\11-smart-contract-function-map-and-transaction-note.md)
- [10-what-is-hidden-proved-and-verified.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\10-what-is-hidden-proved-and-verified.md)
