# Private Quantity and Confidential Payment Bridge Options

## Question this document answers

If the ERC-7984 spike keeps:

- `quantity` private
- buyer payment confidential in escrow

then what exactly should an auditor be able to verify?

The minimum defensible answer is not just:

- seller bond equals buyer deposit
- transporter bond equals buyer deposit

That only proves escrow-policy consistency.

For traceability and commercial correctness, the auditor should also be able to conclude:

- the hidden buyer payment corresponds to the hidden order total
- the hidden order total corresponds to `public unit price * hidden quantity`

without learning the hidden quantity or the hidden payment amount.

## Recommended audit target

The best target statement is:

- `hiddenTotal = unitPrice * hiddenQuantity`
- `buyerConfidentialDeposit = hiddenTotal`
- `sellerBond = buyerConfidentialDeposit`
- `transporterBond = buyerConfidentialDeposit`

If all four relations hold, the auditor can verify:

- the buyer paid the correct amount for the hidden quantity
- the collateral policy was enforced
- no sensitive amount had to be revealed

## Important distinction

There are two different verification layers.

### 1. Business-math verification

This is the proof that:

- `hiddenTotal = unitPrice * hiddenQuantity`

This is conceptually the same role as the current main-repo quantity-total proof.

### 2. Escrow-settlement verification

This is the proof that:

- `buyerConfidentialDeposit = hiddenTotal`
- `sellerBond = buyerConfidentialDeposit`
- `transporterBond = buyerConfidentialDeposit`

This is new in the ERC-7984 path because the payment now flows through confidential escrow.

## Options considered

### Option A: Only on-chain equality attestations

Model:

- buyer deposit is confidential
- seller/transporter bonds are confidential
- contract attests:
  - seller bond equals buyer deposit
  - transporter bond equals buyer deposit

Pros:

- simplest extension of the current spike
- directly enforceable with fhEVM equality handles plus public-decryption proofs
- strong escrow-policy enforcement

Cons:

- does not prove buyer deposit equals `unitPrice * quantity`
- does not preserve the current system's strongest audit statement
- insufficient if the goal is end-to-end commercial traceability

Conclusion:

- necessary
- not sufficient

### Option B: Make the order total public

Model:

- quantity stays private
- total becomes public
- bonds/deposits can then be publicly checked against total

Pros:

- easy to audit
- easy to enforce

Cons:

- leaks commercially sensitive order value
- weakens the privacy objective substantially
- unnecessary given the current system already keeps total private

Conclusion:

- reject

### Option C: Keep current VRC math proof model and separately attest escrow policy

Model:

- preserve off-chain proof that `hiddenTotal = unitPrice * hiddenQuantity`
- preserve proof that a payment-side hidden value equals `hiddenTotal`
- separately use fhEVM equality attestation for:
  - seller bond equals buyer deposit
  - transporter bond equals buyer deposit

Pros:

- closest to the main repo's current audit model
- keeps quantity and total private
- gives strong business-math verification
- gives strong escrow-policy verification

Cons:

- still leaves one bridge problem:
  - how to prove the VRC's hidden payment-side value equals the actual ERC-7984 buyer deposit

Conclusion:

- strongest direction conceptually
- but incomplete unless we solve the bridge

### Option D: Add a dedicated payment-bridge artifact between VRC proofs and ERC-7984 deposit

Model:

- preserve the main repo's off-chain VRC proof layer:
  - `hiddenTotal = unitPrice * hiddenQuantity`
- add a new dedicated bridge layer proving:
  - `buyerConfidentialDeposit = provedHiddenTotal`
- keep on-chain equality attestation for seller/transporter bonds against buyer deposit

Pros:

- best audit story
- preserves private quantity and private payment
- separates concerns cleanly:
  - VRC proves order math
  - contract proves escrow-policy equality
  - bridge proves the confidential deposit is the same value as the proved total

Cons:

- most design work
- needs one extra cryptographic or attestation mechanism

Conclusion:

- recommended

## Recommended architecture

The best design for traceability while preserving privacy is Option D.

That means the spike should not collapse everything into one mechanism.

It should use three layers:

### Layer 1: VRC order-math proof

Purpose:

- prove `hiddenTotal = unitPrice * hiddenQuantity`

Recommended approach:

- keep the current main-repo style proof family conceptually
- carry the proof payload in the ERC-7984 VRC

This preserves the strongest business meaning of the current system.

### Layer 2: Payment-bridge proof/attestation

Purpose:

- prove the actual buyer ERC-7984 confidential deposit equals the same hidden total used in the VRC proof layer

This is the new hard problem introduced by the ERC-7984 redesign.

### Layer 3: On-chain collateral equality attestation

Purpose:

- prove seller bond equals buyer deposit
- prove transporter bond equals buyer deposit

Recommended approach:

- use the handle-bound fhEVM equality attestation design from:
  - `docs/erc7984-spike/03-confidential-equality-attestation-and-audit-plan.md`

## What exactly the auditor should verify

For the final ERC-7984 design, the auditor should be able to verify:

1. VC signature validity
2. credential status
3. final `vcHash` anchor
4. `hiddenTotal = unitPrice * hiddenQuantity`
5. buyer confidential deposit equals the same hidden total
6. seller bond equals buyer deposit
7. transporter bond equals buyer deposit
8. workflow phase and payout end state

The auditor should not learn:

- `quantity`
- `hiddenTotal`
- buyer payment amount
- seller bond amount
- transporter bond amount

## The real bridge problem

The unsolved problem is not quantity privacy itself.

The real problem is:

- how to bind an off-chain proof-side hidden value to the on-chain ERC-7984 confidential deposit value

without revealing the amount.

That bridge must be explicit in the design.

## Candidate bridge mechanisms

### Bridge candidate 1: Cryptographic payment commitment bound to deposit witness

Model:

- buyer generates a payment-side commitment off-chain
- buyer proves it equals the hidden total used in the quantity proof
- buyer also proves that the confidential ERC-7984 deposit was created from that same witness/value

Pros:

- strongest cryptographic story
- best auditor/verifier position

Cons:

- hardest to implement
- depends on what ERC-7984/fhEVM input material can be stably referenced in proofs

Status:

- ideal target
- research required

### Bridge candidate 2: Contract-issued equality attestation against a second confidential declared total

Model:

- buyer submits:
  - confidential deposit amount
  - confidential declared total handle
- contract attests deposit equals declared total
- VRC proof layer must then bind declared total to the hidden total proof witness

Pros:

- fits fhEVM primitives better than a fully external cryptographic bridge

Cons:

- still needs a proof binding declared total to the VRC's hidden total witness
- only moves the bridge one step

Status:

- possible intermediate design

### Bridge candidate 3: Trusted issuer/operator attestation

Model:

- backend, seller, or operator attests that the observed deposit corresponds to the VRC payment witness

Pros:

- easiest operationally

Cons:

- weakest trust model
- loses the strongest independent-auditor property

Status:

- not recommended as the final design
- acceptable only as an explicit prototype shortcut

## Recommended phased plan

### Phase A: Finish escrow-policy enforcement

Implement:

- seller bond equality attestation
- transporter bond equality attestation

This is still the right next contract slice because it is directly enforceable now.

### Phase B: Define the payment-bridge artifact

Before broad frontend/backend implementation, define a single canonical bridge artifact that answers:

- what exact hidden value is shared between the VRC proof layer and the confidential ERC-7984 deposit
- how it is referenced
- how it is verified by auditors

This should be documented before coding the VRC 6.0 path.

### Phase C: Build ERC-7984 VRC 6.0

Add an ERC-7984-specific VRC path that carries:

- listing/order anchors
- settlement policy
- order-math proof payload
- payment-bridge artifact
- collateral equality attestations

### Phase D: Wire frontend/backend/auditor flow

Frontend:

- buyer generates proof bundle and bridge artifact
- seller issues final VRC
- auditor UI verifies all layers

Backend:

- archive-first retrieval
- credential status
- proof/attestation verification helpers

## Concrete recommendation

The spike should proceed with this explicit decision:

- keep `quantity` private
- keep `total` private
- keep buyer payment private
- keep bond amounts private
- preserve order-math proof verification in the VRC layer
- add a dedicated payment-bridge layer
- add on-chain equality attestation for collateral policy

That is the best privacy/traceability tradeoff currently visible from this codebase and fhEVM stack.

## Next exact design task

The next design slice after seller-side equality attestation should be:

- define the payment-bridge artifact and verification flow

That should happen before building the ERC-7984 frontend and VRC 6.0 implementation in earnest.

That artifact is now specified in:

- `docs/erc7984-spike/05-payment-bridge-artifact-spec.md`
