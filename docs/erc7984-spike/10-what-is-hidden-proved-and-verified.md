# What Is Hidden, Proved, And Verified

This note explains the current ERC-7984 marketplace privacy model in a simple order:

1. what is hidden
2. what is proved
3. how it is proved
4. what is later verified

It is written for the current working ERC-7984 path, not the older Railgun-first path.

## Short version

The system keeps the sensitive order arithmetic hidden, but still gives later auditors enough evidence to check that the confidential settlement was economically consistent.

In one sentence:

- the buyer pays privately on-chain
- the real quantity and total stay hidden
- the VRC carries commitments and proofs
- later the verifier checks that the hidden paid amount really matched the hidden total, and that the hidden total was consistent with the public price

## 1. What Is Hidden

### Public values

These are intentionally public or recoverable as public business facts:

- product identity
- product metadata
- order identity
- seller address
- buyer address
- transporter address
- order phase and settlement outcome
- public unit price

In the current implementation, the public unit price is available in the VRC and off-chain metadata path. The contract still primarily anchors `unitPriceHash`, which is why the public `unitPrice` question is still an open design discussion.

### Hidden values

These are the main confidential values in the payment-bridge model:

- `quantity`
- `total`
- `paid amount`

We do not want to reveal:

- how many units were privately ordered
- the hidden total corresponding to that quantity
- the confidential amount deposited into the ERC-7984 escrow path

### What appears instead of the hidden values

Instead of publishing the raw values, the VRC carries commitments:

- `c_qty`
- `c_total`
- `c_pay`

Meaning:

- `c_qty` commits to hidden quantity
- `c_total` commits to hidden total
- `c_pay` commits to hidden paid amount

So the visible artifact contains commitment objects, not the raw sensitive numbers.

## 2. What We Want To Prove

There are two main economic proof statements in the current design.

### Statement A: quantity-to-total consistency

We want to prove:

- `total = unitPrice * quantity`

without revealing:

- `quantity`
- `total`

This is the higher-level business statement.

### Statement B: payment-to-total consistency

We want to prove:

- `paid amount = total`

without revealing:

- `paid amount`
- `total`

This is the settlement-consistency statement.

### Relation-level equality on-chain

Separately, the contract also supports relation-level equality checks for operational transitions, such as:

- seller bond equals expected target amount
- transporter bond equals expected target amount

Those on-chain equality attestations are important, but they are not the same thing as the higher-level business statement `total = unitPrice * quantity`.

## 3. How We Prove It

The current architecture uses two different proof layers.

### A. On-chain confidential settlement layer

ERC-7984 / fhEVM handles the confidential transfers and confidential balances.

This layer is used for:

- buyer confidential purchase deposit
- seller confidential bond
- seller confidential delivery fee
- transporter confidential bond
- equality-gated contract transitions
- final payout logic

This layer proves enough for the contract to control workflow and settlement.

It does not carry every business proof object directly on-chain.

### B. Off-chain VRC proof layer

The VRC carries the audit-facing proof material:

- commitments
- payment-bridge context
- public proof records
- attestation context
- archive and signature data

This is where the economic explanation lives.

In the current fresh ERC-7984 path, the VRC carries the proof material for:

- quantity-total consistency
- total-payment equality

### Cryptographic basis

The current proof backend is built on:

- Pedersen-style commitments for hidden values
- Bulletproofs primitives in the Rust proving backend

So when we talk about hidden `quantity`, `total`, and `paid amount`, the system is not just hiding them informally.
It is committing to them cryptographically and then proving relations about those committed values.

Important precision:

- the low-level proving foundation is Bulletproofs-based
- the marketplace-specific economic statements are implemented as higher-level relations on top of that commitment/proof backend

### Why split the proof model

Because putting everything on-chain would be heavy and awkward, while leaving everything off-chain would be too weak.

So the split is:

- on-chain for confidential settlement and state enforcement
- off-chain VRC for proof-carrying auditability

## 4. What Is Later Verified

Later, the auditor/verifier surface checks several different things.

### Artifact integrity

The verifier checks:

- the VRC can be loaded
- the seller signature is valid
- the VRC CID matches the on-chain bound hash

This answers:

- is this the right artifact
- was it signed by the expected seller
- is it really the one anchored to the order

### Operational status

The verifier can also check:

- marketplace VC status
- provenance chain continuity
- governance consistency across the provenance chain

These checks are useful, but today they are still partly backend-assisted rather than fully decentralized.

### Economic proof verification

For fresh ERC-7984 artifacts, the verifier checks:

1. quantity-total proof
- verifies that the hidden total is consistent with:
  - public `unitPrice`
  - hidden `quantity`

2. total-payment equality proof
- verifies that the hidden paid amount equals the hidden total

So the verifier does not learn the hidden values themselves.
It learns that the mathematical relationships are valid.

## 5. What The Auditor Learns Without Seeing Secrets

If the artifact verifies successfully, the auditor can conclude:

- the seller signed the archived commitment VRC
- the archived CID is the one bound to the order on-chain
- the hidden order total is consistent with the public unit price and the hidden quantity
- the hidden confidential payment amount matches that hidden total
- the operational settlement flow reached the recorded on-chain phase

What the auditor does not learn:

- the raw quantity
- the raw hidden total
- the raw confidential payment amount

## 6. Current Limitation To Explain Clearly

This is the most important nuance to explain to a supervisor:

- the full system now proves `price * quantity = total = paid` for fresh artifacts
- but the contract alone does not prove all of that on-chain

More precisely:

- the contract layer proves relation-level settlement facts needed for workflow
- the VRC layer proves the richer business semantics later during audit

So the complete privacy and audit story is:

- partly enforced on-chain
- partly explained and verified off-chain through the VRC

## 7. Current State Of The Implementation

### Achieved now

For the current main ERC-7984 path, we have:

- confidential settlement on-chain
- VRC commitments archived
- VRC proof records archived
- fresh proof bundles hardened before persistence
- live browser-local WASM commitment generation for:
  - quantity commitment
  - total commitment
  - payment commitment
- live browser-local WASM proof generation for:
  - quantity-total proof
  - total-payment equality proof
- verifier checks for:
  - signature
  - anchor
  - quantity-total proof
  - total-payment equality proof

### Fresh WASM milestone

This is now more than a build-time capability.

A fresh live ERC-7984 order was created with:

- `orderId = 0xcba15dd04eb68f7cf8925871452bb2d3a1658f270ea959f0a96ab3ab2ccf2122`

The saved order snapshot showed:

- `quantityProof.commitmentEngine = "WASM"`
- `quantityProof.proofEngine = "WASM"`
- `paymentProof.commitmentEngine = "WASM"`
- `paymentProof.proofEngine = "WASM"`
- `totalProof.commitmentEngine = "WASM"`

So the fresh buyer-side path is now using real browser-local WASM for the main commitment and proof steps, not only backend fallback.

### Still future work

The remaining future work is mostly about trust minimization and hardening:

- reduce backend dependence in the verifier
- extend the browser-local WASM path from the current buyer proof flow to any remaining legacy or less-used proof paths
- reduce dependence on backend order snapshots
- decide whether public on-chain `unitPrice` should be added

## 8. Simple Talking Version

If you need to explain it quickly in a meeting:

> We hide the sensitive order arithmetic, especially quantity, total, and paid amount. We publish commitments instead of raw values. Then we attach proofs in the VRC showing that the hidden total matches the public price times the hidden quantity, and that the hidden paid amount matches that hidden total. Later the verifier checks the VRC signature, the on-chain anchor, and those proof relationships without ever learning the hidden numbers.
