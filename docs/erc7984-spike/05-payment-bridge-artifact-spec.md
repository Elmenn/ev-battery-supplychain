# Payment Bridge Artifact Specification

## Purpose

This document defines the canonical bridge artifact that connects:

- the private order-math proof layer
- the actual ERC-7984 confidential buyer deposit

without revealing:

- private quantity
- hidden total
- buyer payment amount

This is the Phase B artifact referenced by:

- `docs/erc7984-spike/04-private-quantity-payment-bridge-options.md`

## Problem statement

The current spike can now enforce, on-chain:

- `seller bond == buyer deposit`
- `transporter bond == buyer deposit`

And it now funds those confidential balances through a real public-to-private funding path:

- public ERC-20 deposit
- funding wrapper contract
- confidential ERC-7984 mint to depositor

What it still cannot prove is:

- the buyer deposit equals the same hidden total used in the order-math proof layer

That missing link is the payment bridge.

## Current milestone status

As of March 18, 2026, the spike has already proven the surrounding app flow on Sepolia:

- browser ERC-7984 settlement through `Delivered`
- ERC-7984 VRC build/sign/upload/archive/verify
- backend status registration for the archived VRC

At the time of the original note, what was not yet proven was the bridge itself. That is no longer the right reading for the fresh main-path artifacts.

In the current main ERC-7984 path:

- `paymentBridge.contextHash` and `paymentBridge.bridgeHash` are populated
- `paymentBridge.depositSide.depositTxHash` and `depositReference` are populated
- `paymentBridge.verification.method` is populated as `proof-bound-deposit-reference`
- fresh artifacts now carry the commitment/proof material needed for auditors to verify:
  - `hiddenTotal = unitPrice * hiddenQuantity`
  - `buyerDeposit = hiddenTotal`

So the current milestone should be read as:

- VRC infrastructure around the bridge is live
- fresh proof-complete artifacts are now achievable in the main path
- older archived artifacts may still reflect the earlier pre-hardening behavior and should be treated as legacy outputs
- the remaining work is trust-minimization and cleanup, not basic proof-path viability

## Design goal

The payment bridge artifact must let an auditor conclude:

- `hiddenTotal = unitPrice * hiddenQuantity`
- `buyerDeposit = hiddenTotal`

without learning either `hiddenTotal` or `hiddenQuantity`.

## Recommended artifact model

The bridge artifact should be a signed, proof-carrying record embedded in the final ERC-7984 VRC and optionally archived separately in backend order state.

It should not try to expose the buyer deposit plaintext.

It should carry:

1. canonical binding context
2. a proof-side payment commitment
3. a deposit-side confidential reference
4. a relation statement describing what was proven
5. verifier metadata

## Recommended verifier statement

The bridge artifact should represent this exact statement:

- `C_total` commits to the same hidden value as the confidential ERC-7984 buyer deposit witness

Operationally, the statement is:

- the buyer deposit value used in the ERC-7984 transfer equals the hidden total already proven by the order-math proof layer

## Why this should be a separate artifact

Do not overload:

- `quantityTotalProof`
- `paymentEqualityProof`
- on-chain equality attestation

Those already have distinct jobs.

The bridge artifact should be explicit because it binds two different worlds:

- off-chain proof witness world
- on-chain confidential deposit world

That boundary is exactly what auditors will ask about.

## Canonical artifact fields

Recommended top-level shape:

```json
{
  "version": "1.0",
  "bridgeType": "erc7984-confidential-payment-bridge",
  "statement": "buyerDepositEqualsHiddenTotal",
  "contextHash": "0x...",
  "bridgeHash": "0x...",
  "proofSide": {
    "totalCommitment": "0x...",
    "contextHash": "0x..."
  },
  "depositSide": {
    "paymentToken": "0x...",
    "escrowAddress": "0x...",
    "orderId": "0x...",
    "buyerAddress": "0x...",
    "depositTxHash": "0x...",
    "depositReference": "0x..."
  },
  "verification": {
    "method": "proof-bound-deposit-reference",
    "status": "bound"
  }
}
```

## Field semantics

### `version`

Artifact schema version for bridge evolution.

Recommended initial value:

- `"1.0"`

### `bridgeType`

Recommended fixed value:

- `"erc7984-confidential-payment-bridge"`

### `statement`

Recommended fixed value:

- `"buyerDepositEqualsHiddenTotal"`

This keeps the artifact self-explanatory to auditors.

### `contextHash`

Canonical bridge binding anchor.

This should be a new ERC-7984-specific `contextHash`, not a reused Railgun one.

It should bind:

- `orderId`
- `productId`
- `chainId`
- `escrowAddress`
- `paymentToken`
- `buyerAddress`
- `sellerAddress`
- `unitPriceHash`

Optional:

- selected transporter address when final VRC is issued after binding

This becomes the main cross-layer anchor shared by:

- order-math proof payloads
- payment bridge artifact
- final VRC attestation section

## `bridgeHash`

Canonical hash of the artifact payload after normalization.

Recommended purpose:

- immutable stable reference for VRC embedding and backend archive rows

## `proofSide`

This is the hidden-value side coming from the order-math layer.

Recommended fields:

- `totalCommitment`
- `contextHash`

The bridge artifact does not need to duplicate the full quantity-total proof payload if the final VRC already embeds it.

The bridge only needs to reference the exact `totalCommitment` it binds to.

## `depositSide`

This is the escrow-side reference set.

Recommended fields:

- `paymentToken`
- `escrowAddress`
- `orderId`
- `buyerAddress`
- `depositTxHash`
- `depositReference`

### `depositReference`

This is the critical field.

It should be the canonical reference that the bridge treats as the on-chain representation of the confidential deposit.

At this stage, the best placeholder design is:

- a deterministic hash derived from:
  - deposit tx hash
  - orderId
  - deposit kind
  - token address
  - escrow address
  - buyer address

This is not yet the final cryptographic answer to the bridge problem, but it gives us a precise artifact boundary and a stable archival handle.

## `verification`

Recommended fields:

- `method`
- `status`

Recommended initial method:

- `"proof-bound-deposit-reference"`

Recommended status values:

- `pending`
- `bound`
- `failed`

## Bridge hash canonicalization

The bridge hash should be computed from a canonical JSON serialization of:

- `version`
- `bridgeType`
- `statement`
- `contextHash`
- `proofSide`
- `depositSide`
- `verification.method`

It should not include mutable verification timestamps or operator-side notes.

## Recommended phased interpretation

### Phase B1: Prototype bridge artifact

The artifact is archival and verifier-facing first.

It binds:

- the proof-side `totalCommitment`
- the deposit-side canonical reference set

This phase is enough to wire:

- VRC shape

This is effectively the current shipped state of the spike browser/VRC path, with one caveat:

- the artifact is present and archived
- the verifier metadata is present
- in the current main path, the VRC also carries the proof material needed for fresh auditor verification
- backend archive
- auditor UI

What is still not perfect is not the basic bridge path itself, but the degree of trust minimization around it:

- older archived artifacts may predate the proof-hardening changes
- some fallback or legacy paths may still emit weaker artifacts
- backend convenience services are still part of the practical verifier surface in the spike

### Phase B2: Strong binding upgrade

Later, the artifact can carry a stronger cryptographic proof payload that directly proves:

- deposit witness equals proof-side hidden total witness

When that exists, the artifact version should increment rather than silently changing semantics.

## Why this is still useful before the perfect cryptographic bridge exists

Because it prevents the system from hand-waving the bridge boundary.

Even if the first version is not the final strongest proof construction, it forces:

- one canonical context
- one canonical reference set
- one explicit verifier statement
- one clear future upgrade path

That is much better than spreading the bridge logic across:

- ad hoc frontend state
- contract logs
- unstructured VC notes

## Recommended VRC embedding

The final ERC-7984 VRC should carry a new section:

```json
"paymentBridge": {
  "version": "1.0",
  "bridgeType": "erc7984-confidential-payment-bridge",
  "statement": "buyerDepositEqualsHiddenTotal",
  "bridgeHash": "0x...",
  "contextHash": "0x...",
  "proofSide": {
    "totalCommitment": "0x..."
  },
  "depositSide": {
    "paymentToken": "0x...",
    "escrowAddress": "0x...",
    "orderId": "0x...",
    "buyerAddress": "did:ethr:...",
    "depositTxHash": "0x...",
    "depositReference": "0x..."
  },
  "verification": {
    "method": "proof-bound-deposit-reference",
    "status": "bound"
  }
}
```

This section should be part of the signed VRC payload.

Current spike implementation note:

- the local VRC builder/signing/backend verification path now supports this section inside the current ERC-7984 commitment VRC path
- the proof source metadata for that VRC currently defaults to `wasm-sidecar`
- the backend archive route now validates this section in the current ERC-7984 commitment VRC path and returns extracted bridge metadata in the archive response
- the current main flow now generates and persists the order-math proof material used by the auditor checks
- fresh artifacts now verify successfully in the auditor for:
  - quantity-total consistency
  - total-payment equality
- older pre-hardening artifacts may still fail those checks and should be treated as legacy outputs rather than as the current expected result

## Auditor interpretation

With the full ERC-7984 design in place, the auditor should verify:

1. quantity-total proof:
   - `hiddenTotal = unitPrice * hiddenQuantity`
2. payment bridge:
   - the VRC proof-side hidden total is the one referenced by the buyer deposit artifact
3. seller bond equality attestation:
   - seller bond equals buyer deposit
4. transporter bond equality attestation:
   - transporter bond equals buyer deposit

That produces a coherent audit story:

- correct hidden order math
- correct hidden escrow funding
- correct hidden collateral policy

## Remaining future work

The payment bridge is no longer just a placeholder artifact in the main path, but there is still useful future work:

- reduce dependence on backend convenience services so the auditor can rely more strictly on VRC IPFS data plus on-chain state
- make the artifact guarantees uniform across all browser/fallback/legacy paths, not only the current main path
- decide whether public on-chain `unitPrice` should be added alongside `unitPriceHash` to simplify future verification
- improve audit/report UX so bridge status reads like a clean trust summary rather than a debugging surface
- revisit whether a stronger future bridge version should bind the deposit witness to the hidden total witness more directly, with a version bump instead of silent semantic drift

## Shared model files

This artifact shape is mirrored in:

- `frontend/src/utils/erc7984/paymentBridgeModel.js`
- `backend/api/erc7984/paymentBridgeModel.js`

## Next implementation consequence

The next frontend/backend/VRC slice should use this artifact shape directly instead of inventing new field names on the fly.

It is acceptable for the first implementation to mark:

- `verification.method = "proof-bound-deposit-reference"`

while the deeper cryptographic bridge remains a later upgrade.
