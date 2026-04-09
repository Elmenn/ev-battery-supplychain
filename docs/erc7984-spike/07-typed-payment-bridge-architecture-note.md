# Typed Payment-Bridge Architecture Note

This note translates the handwritten ERC-7984 sketch into a clean architecture description and records the current decision logic around adding a public `unitPrice` state variable later.

## Core idea

The intended model is:

- `price` is public
- `quantity` is private
- `total` is private
- `paid amount` is private

The main arithmetic relationship is:

- `total = price * quantity`

The main verification relationship is:

- `paid amount = total`

So the architecture separates:

- private settlement execution on-chain
- proof and audit artifacts off-chain

## Variables in the model

Public:

- `price`
- product identity
- order identity
- seller / buyer / transporter addresses
- final phase / settlement outcome

Private or commitment-backed:

- `quantity`
- `total`
- `paid amount`

Derived commitments:

- `c_qty`
- `c_total`
- `c_pay`

Where:

- `c_qty` hides the private quantity
- `c_total` hides the private total
- `c_pay` hides the confidential amount actually paid into ERC-7984 escrow

## Main proof goals

The sketch is essentially expressing two proof statements:

1. Multiplicative consistency:
- prove that `c_total` hides a value equal to `price * quantity`

2. Payment consistency:
- prove that `c_pay` hides the same value as `c_total`

That gives an auditor enough evidence to conclude:

- the confidential amount paid on-chain matches the hidden order total
- the hidden order total is consistent with the public unit price and the hidden quantity

## Architecture split

### On-chain side

The on-chain ERC-7984 / fhEVM side is responsible for:

- confidential buyer payment deposit
- confidential seller bond
- confidential seller delivery fee
- confidential transporter bond
- equality-gated state transitions
- final payout and delivery settlement

This gives private settlement behavior directly in the contract path.

### Off-chain VRC side

The off-chain VRC side is responsible for carrying:

- public price
- quantity commitment
- total commitment
- payment commitment
- proof objects
- archive metadata

This gives the verifier a structured artifact that explains the confidential settlement economically, without requiring the on-chain contract to store every proof object directly.

## Current VRC lifecycle decision

For the current paper-aligned ERC-7984 flow, the system should use a single commitment VRC.

The intended order of operations is:

1. buyer places the confidential order by depositing through the ERC-7984 path
2. seller posts the confidential seller bond and finalizes seller equality
3. seller builds the commitment VRC
4. seller signs the VRC and uploads it to IPFS
5. seller confirms the order on-chain with the real CID
6. seller ships the asset and shares the CID / artifact reference operationally
7. transporter confirms delivery against the bound VRC hash
8. contract releases settlement

Important consequences:

- there is only one VRC
- there is only one IPFS upload
- there is no second final VRC before the deadline
- quantity remains off-chain in commitments / proofs, not public calldata
- the contract binds `hash(CID)` on-chain, while the CID remains the human-facing artifact

## Trust boundaries

The backend is useful in the spike, but it should not become the trust anchor.

The intended trust-minimized model is:

- on-chain ERC-7984 escrow state is authoritative for settlement state
- signed VRC content is authoritative for issuer-bound off-chain claims
- proof objects are authoritative only insofar as they verify independently
- IPFS CID and payload hash are authoritative for artifact integrity
- backend rows are convenience caches and recovery aids

So the backend may:

- index
- cache
- recover
- serve

But the backend should not be the thing a verifier must simply trust for:

- the true order phase
- the true VC hash bound in contract
- the true economic relationship between price, quantity, total, and paid amount

### Practical source-of-truth split

On-chain should be the source of truth for:

- product / escrow address
- order id
- seller / buyer / transporter addresses
- order phase
- delivered status
- equality attestation outcome
- final bound `vcHash`
- payment token address
- any future public `unitPrice`, if added

The signed VRC should be the source of truth for:

- quantity commitment
- total commitment
- payment commitment
- proof objects
- issuer-bound economic statements
- archive payload integrity once content-addressed

The backend should be treated as:

- a projection layer
- a recovery layer
- a search / archive convenience layer

Not as:

- a standalone trust root

### Current implementation direction

To stay aligned with that trust boundary, the spike should prefer:

- chain state over backend state where both exist
- CID/hash cross-checks instead of blind backend reuse
- coherence validation instead of accepting contradictory proof rows

This is especially important for the payment-bridge fields, because contradictory backend rows can otherwise make the VRC path look more trustworthy than it really is.

## Public vs private data boundary

This section records the intended privacy boundary for the current paper-aligned ERC-7984 model.

The main rule is:

- the public commitment VRC must not re-expose the private values that ERC-7984 is trying to hide

So the system must distinguish clearly between:

- public on-chain data
- public commitment VRC data
- private recovery / reconstruction data

### Public by design

These fields are intentionally public in the current model:

- product identity
- order identity
- seller address
- buyer address
- transporter address once selected
- escrow / product contract address
- payment token address
- public unit price
- unit price hash
- final phase / delivered outcome
- bound `vcHash`
- the commitment VRC CID when shared operationally

This is acceptable because the current privacy target is:

- public price
- private quantity
- private total
- private paid amount

### Public commitment VRC

The signed IPFS commitment VRC should contain only what is needed for:

- seller commitment at confirm-order time
- later delivery confirmation by bound hash
- verifier reconstruction of the privacy-preserving economic statement

The current locked commitment artifact is `schemaVersion: "6.1"`.

Its intended semantics are:

- seller signs it during `Confirm Order`
- it is uploaded once to IPFS
- `confirmOrderById(orderId, cid)` binds its CID hash on-chain
- later delivery references the bound hash, not a modified artifact

So the public VRC includes:

- issuer / holder identities
- product / order identity
- public unit price and unit price hash
- quantity / total / payment commitments
- settlement policy
- seller bond attestation status
- payment-bridge statement and opaque `depositReference`
- verifier-needed public proof objects in `privacyProofs`
- context hash and proof-source metadata

The public VRC does not include:

- transporter address
- transporter bond attestation placeholder state
- delivery outcome
- plaintext quantity
- plaintext total
- plaintext paid amount
- hidden openings / blindings
- raw buyer deposit transaction hash

For the final model, auditors and verifiers should be able to verify:

- `total = price * quantity`
- `paid amount = total`

using only:

- on-chain state
- the single signed VRC on IPFS

So any proof objects needed for those checks should live in the public VRC itself rather than only in a backend sidecar.

In particular, the commitment VRC should prefer:

- `depositReference`

over:

- raw `depositTxHash`

because the reference is enough to bind the payment-bridge statement without exposing more direct linkage than necessary.

### Final `6.1` field shape

The final commitment VRC shape for the current paper-aligned flow is:

- `issuer`
- `holder`
- `credentialSubject.listing`
- `credentialSubject.order`
  - with buyer address but without transporter address
- `credentialSubject.commitments`
- `credentialSubject.settlementPolicy`
- `credentialSubject.equalityAttestations.sellerBond`
- `credentialSubject.paymentBridge`
- `credentialSubject.privacyProofs`
- `credentialSubject.attestation`

The most important exclusions are:

- no `order.transporterAddress`
- no `equalityAttestations.transporterBond`
- no plaintext quantity / total / paid amount
- no raw `depositTxHash`

This makes the signed artifact consistent with the intended confirm-order semantics:

- transporter participation happens later in the protocol
- delivery is confirmed against the bound VRC hash
- the commitment VRC itself should describe the order commitment, not later delivery state

### Private recovery bundle

The following data may still exist for recovery, debugging, or proof regeneration, but it should be treated as private support data rather than as part of the public artifact:

- plaintext quantity helper values
- plaintext total helper values
- plaintext payment helper values
- proof-side openings or encrypted openings
- raw buyer deposit tx hash if retained for reconstruction
- backend snapshot rows used to rebuild a VRC after interruption

This layer is allowed to be richer because it is not the publication boundary.

### Why this distinction matters

Without this boundary, the system can fail in a subtle way:

- ERC-7984 keeps payment private on-chain
- but the uploaded VRC accidentally reveals the same economics in plaintext

That would defeat the point of using confidential settlement in the first place.

So the intended privacy story is:

- the contract keeps the payment path confidential
- the public VRC exposes only commitments and proof-binding metadata
- private helper values remain in a separate recovery layer and are not treated as the public credential

### Current implementation direction

The spike should continue moving toward:

- a public commitment VRC that is commitment-based
- a private recovery bundle used only for rebuild / audit support
- backend snapshot rows treated as private operational state, not as the published artifact

That means future cleanup should keep asking:

- does this field need to be public in the signed VRC?
- or is it only needed for local recovery and proof tooling?

## Clean typed view of the sketch

```text
Public listing layer
  price
  product metadata
  order metadata

Private commitment layer
  c_qty   = commit(quantity)
  c_total = commit(total)
  c_pay   = commit(paid amount)

Proof layer
  prove total = price * quantity
  prove paid amount = total

On-chain confidential settlement layer
  buyer deposits confidential amount
  seller deposits confidential bond
  transporter deposits confidential bond
  contract enforces settlement transitions

Off-chain VRC / audit layer
  archive commitments
  archive proofs
  archive delivery / attestation outcomes
  verify economic consistency later
```

## Relationship to the current spike

What is already aligned with the sketch:

- confidential settlement is happening natively through ERC-7984
- public price hash already exists on-chain
- the main marketplace flow now completes through `Delivered`
- quantity / total / payment commitments are generated in the main buyer flow
- those commitments are now generated through a real browser-local WASM path in the fresh live ERC-7984 buyer flow
- those commitments and proof objects are now persisted in the backend snapshot path
- VRCs now carry payment-bridge structure and public proof objects
- the quantity-total and total-payment equality proofs are now also generated through the live browser-local WASM path for fresh buyer orders
- fresh VRCs can now be audited successfully for:
  - signature validity
  - CID / on-chain hash anchoring
  - provenance continuity
  - `total = price * quantity`
  - `paid amount = total`

What is still incomplete relative to the sketch:

- the main ERC-7984 marketplace path now matches the sketch, but not every older or legacy path is guaranteed to emit the same proof-complete artifact
- historical pre-hardening artifacts can still fail audit and should be treated as legacy outputs rather than as the current expected result
- the verifier now covers the full `price * quantity = total = paid` statement for fresh artifacts, but the auditor UX and reporting surface still need final polish
- the long-term pure-auditor goal still needs tightening so verification depends as little as possible on backend convenience services
- the contract-shape refinement to add public on-chain `unitPrice` alongside `unitPriceHash` is now implemented

## Current status summary

As of the current spike state, the sketch should be read as:

- achieved for the main ERC-7984 marketplace path
- hardened enough to produce fresh auditable VRCs
- now demonstrated with a fresh live order whose saved snapshot recorded `WASM` commitment/proof engines for the buyer-side payment-bridge path
- still open for production cleanup, legacy-path cleanup, and final verifier UX refinement

## Why this split is useful

This design avoids two extremes:

1. Putting everything on-chain
- too heavy
- awkward for proof objects
- harder to evolve

2. Leaving everything off-chain
- weak trust model
- poor settlement guarantees

Instead:

- settlement logic stays on-chain
- arithmetic commitments and proofs are carried off-chain in the VRC/archive path

That is the main architectural value of the sketch.

## Comparison intuition

### Legacy privacy-rail model

- privacy system external to the marketplace contract
- private payment handled by a separate rail
- more integration complexity

### ERC-7984 model

- privacy is native to the payment token / escrow path
- confidential balances live in the ERC-7984 token ledger
- contract can gate order phases directly on private payment and private collateral state

So the off-chain VRC is not replacing settlement.
It is complementing settlement with auditability and proof binding.

## Decision note: public `unitPrice` state variable

The sketch assumes price is public.

That raises a design question:

- should the contract keep only `unitPriceHash`
- or should it also store a public numeric `unitPrice`

### Current contract shape

Today the contract already has:

- `uint64 public unitPrice`
- `unitPriceHash`

### Argument for keeping only `unitPriceHash`

Pros:

- minimal on-chain surface
- integrity binding to listing metadata
- price is not forced into a specific numeric storage path

Cons:

- off-chain bridge/proof layer must recover the actual price elsewhere
- more friction for VRC generation and verification
- harder to reason about `total = price * quantity` from chain state alone

### Argument for adding public `unitPrice`

Pros:

- matches the intended model where price is public
- simplifies proof construction and verification
- simplifies VRC generation
- reduces backend reconstruction complexity
- improves auditability

Cons:

- one more on-chain field
- less minimal than hash-only storage

### Current recommendation

The chosen direction is:

- keep `unitPriceHash`
- add `uint64 public unitPrice`

That would preserve listing integrity binding while also giving the system a canonical public numeric price.

### Current decision status

Implemented for the current ERC-7984 path.

### Practical trigger for deciding

We should decide in favor of a public `unitPrice` on-chain if any of these remain painful:

- VRC generation needs too much backend reconstruction
- verifier logic depends too heavily on off-chain listing metadata
- payment-bridge proofs are awkward because price is only represented as a hash
- product UX expects price to be clearly public anyway

## Supervisor-level summary

One sentence:

> The sketch describes a split architecture where ERC-7984 handles private settlement on-chain, while the VRC carries off-chain commitments and proofs showing that the confidential paid amount corresponds to a hidden total derived from a public price and a private quantity.

Short version:

- public price
- private quantity
- private total
- private paid amount
- on-chain confidential settlement
- off-chain proof-bearing VRC
