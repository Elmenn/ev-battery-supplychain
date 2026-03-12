# VRC Model (Current Implementation)

This document describes the current VRC shape used by the repository after the migration to a self-contained final VRC.

In this repo, "VRC" refers to the final verifiable record/credential issued by the seller at order confirmation time. It is implemented as a W3C Verifiable Credential-shaped JSON document, signed with EIP-712 and later anchored on-chain by CID hash.

## Purpose
The current VRC is the single final audit artifact for one confirmed order.

It contains:
- the public listing anchors
- the order/payment anchors
- the three commitments
- the two embedded ZK proof payloads
- the attestation binding context
- the seller signature proof
- the credential schema reference
- the credential status reference

After it is signed and uploaded, auditors and other parties verify from:
- the VRC JSON itself
- the on-chain `vcHash = keccak256(cid)` anchor
- the credential status reference carried in the VRC
- the backend credential-status registry behind that reference

They do not need a separate sidecar proof record in the active model.

## Relationship to the W3C VC Model

## 1) What aligns directly
The current VRC follows the standard W3C VC document envelope:
- `@context`
- `id`
- `type`
- `issuer`
- `holder`
- `validFrom`
- `credentialSchema`
- `credentialStatus`
- `credentialSubject`
- `proof`

So structurally, it is a VC-shaped JSON-LD credential.

## 2) What is application-specific
The domain-specific business data lives inside `credentialSubject`, for example:
- `listing`
- `order`
- `commitments`
- `zkProofs`
- `attestation`

These are application-specific fields for this EV battery supply-chain prototype.

## 3) Important nuance about JSON-LD
The current implementation uses:

- the VC 2.0 base context:
  - `https://www.w3.org/ns/credentials/v2`
- a project-specific custom context served by the backend:
  - `http://localhost:5000/contexts/ev-battery-vrc-v1.jsonld`

The custom context is now in place, but the terms are still project-specific, for example:
- `unitPriceHash`
- `quantityCommitment`
- `zkProofs`
- `contextHash`

So the practical status is:
- W3C VC envelope: yes
- JSON-LD compatible base form: yes
- custom project JSON-LD context: yes
- globally hosted production-ready context URI: not yet

That is acceptable for the current implementation. For production, the remaining improvement is to host the custom context at a stable public URL rather than `localhost`.

## High-Level Structure

Top-level shape:

```json
{
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "http://localhost:5000/contexts/ev-battery-vrc-v1.jsonld"
  ],
  "id": "urn:uuid:...",
  "type": [
    "VerifiableCredential",
    "SupplyChainCredential",
    "OrderCommitmentCredential"
  ],
  "schemaVersion": "5.0",
  "issuer": { "...": "..." },
  "holder": { "...": "..." },
  "validFrom": "2026-03-11T18:23:42.791Z",
  "credentialSchema": { "...": "..." },
  "credentialStatus": { "...": "..." },
  "credentialSubject": { "...": "..." },
  "previousVersion": null,
  "proof": [{ "...": "..." }]
}
```

## Current Schema

## Top-Level Fields
- `@context`
  - currently:
    - `https://www.w3.org/ns/credentials/v2`
    - `http://localhost:5000/contexts/ev-battery-vrc-v1.jsonld`
- `id`
  - UUID URN for this VRC
- `type`
  - includes:
    - `VerifiableCredential`
    - `SupplyChainCredential`
    - `OrderCommitmentCredential`
- `schemaVersion`
  - current final VRC version is `"5.0"`
- `issuer`
  - seller DID object
- `holder`
  - buyer DID object
- `validFrom`
  - ISO timestamp
- `credentialSchema`
  - JSON schema reference for the current VRC shape
- `credentialStatus`
  - order-based credential-status reference
- `credentialSubject`
  - the actual order/listing/proof payload
- `previousVersion`
  - currently `null` in the single-final-VRC model
- `proof`
  - EIP-712 seller signature proof array

## `issuer` and `holder`
Current pattern:

```json
{
  "id": "did:ethr:<chainId>:<address>",
  "name": "Seller"
}
```

and similarly for the buyer in `holder`.

## `credentialSubject`
Current fields:
- `id`
- `productName`
- `batch`
- `productContract`
- `productId`
- `chainId`
- `listing`
- `order`
- `commitments`
- `zkProofs`
- `attestation`
- `delivery`

### `credentialSubject.listing`
Public listing and provenance fields:
- `timestamp`
- `unitPriceWei`
- `unitPriceHash`
- `listingSnapshotCid`
- `certificateCredential`
- `componentCredentials`
- `sellerRailgunAddress`

Notes:
- `unitPriceWei` is public in the current model
- `unitPriceHash` is the durable listing anchor
- `sellerRailgunAddress` is included for the active Railgun-based flow

### `credentialSubject.order`
Per-order anchors:
- `orderId`
- `productId`
- `escrowAddr`
- `chainId`
- `buyerAddress`
- `memoHash`
- `railgunTxRef`

Notes:
- `memoHash` and `railgunTxRef` bind the order to the private Railgun transfer reference

### `credentialSubject.commitments`
Embedded commitment anchors:
- `quantityCommitment`
- `totalCommitment`
- `paymentCommitment`

These are the public commitment values. The plaintext quantity/total and the openings are not disclosed here.

### `credentialSubject.zkProofs`
Embedded proof bundle:
- `schemaVersion`
- `quantityTotalProof`
- `totalPaymentEqualityProof`

Current proof object shape:

```json
{
  "proofType": "bulletproofs",
  "proofRHex": "<hex>",
  "proofSHex": "<hex>",
  "contextHash": "<bytes32>"
}
```

Current embedded statements:
- `quantityTotalProof`
  - proves `totalWei = unitPriceWei * quantity`
- `totalPaymentEqualityProof`
  - proves committed order total equals committed payment amount

### `credentialSubject.attestation`
Binding fields:
- `attestationVersion`
- `contextHash`
- `disclosurePubKey`

`contextHash` is the main cross-field binding anchor used by the proof flow.

### `credentialSubject.delivery`
Currently:
- `null` at order confirmation time

It is reserved for later delivery-related information.

## Signing and Verification Model

The VRC is not signed as a Linked Data Proof. In the current implementation, it is signed with EIP-712 and carried inside the VC `proof` array.

Current active proof format:
- `type: "EcdsaSecp256k1Signature2019"`
- `payloadFormat: "eip712-v3-order-typed"`

The signed payload covers the stable order anchors:
- `validFrom`
- `credentialSchema`
- `credentialStatus`
- `listing`
- `order`
- `commitments`
- `zkProofs`
- `attestation`

So in the current model, the embedded proof payloads are themselves part of the signed immutable artifact.

Implementation references:
- [vcBuilder.mjs](/c:/Users/yamen/ev-battery-supplychain/frontend/src/utils/vcBuilder.mjs)
- [signVcWithMetamask.js](/c:/Users/yamen/ev-battery-supplychain/frontend/src/utils/signVcWithMetamask.js)
- [verifyVC.js](/c:/Users/yamen/ev-battery-supplychain/backend/api/verifyVC.js)

## Placeholder Template

This is a documentation template, not a literal ready-to-sign object.

```json
{
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "http://localhost:5000/contexts/ev-battery-vrc-v1.jsonld"
  ],
  "id": "urn:uuid:<uuid>",
  "type": [
    "VerifiableCredential",
    "SupplyChainCredential",
    "OrderCommitmentCredential"
  ],
  "schemaVersion": "5.0",
  "issuer": {
    "id": "did:ethr:<chainId>:<sellerAddress>",
    "name": "Seller"
  },
  "holder": {
    "id": "did:ethr:<chainId>:<buyerAddress>",
    "name": "Buyer"
  },
  "validFrom": "<iso-timestamp>",
  "credentialSchema": {
    "id": "http://localhost:5000/schemas/ev-battery-order-vrc-v5.schema.json",
    "type": "JsonSchema"
  },
  "credentialStatus": {
    "id": "http://localhost:5000/vc-status/order/<orderId>",
    "type": "SupplyChainCredentialStatus2026",
    "statusPurpose": "revocation"
  },
  "credentialSubject": {
    "id": "did:ethr:<chainId>:<sellerAddress>",
    "productName": "<product-name>",
    "batch": "<batch-id>",
    "productContract": "<escrow-address>",
    "productId": "<product-id>",
    "chainId": "<chain-id>",
    "listing": {
      "timestamp": "<iso-timestamp>",
      "unitPriceWei": "<public-unit-price-wei>",
      "unitPriceHash": "<bytes32>",
      "listingSnapshotCid": "<optional-cid-or-empty-string>",
      "certificateCredential": {
        "name": "<certificate-name>",
        "cid": "<certificate-cid>"
      },
      "componentCredentials": [
        "<component-cid-1>",
        "<component-cid-2>"
      ],
      "sellerRailgunAddress": "<0zk...>"
    },
    "order": {
      "orderId": "<bytes32>",
      "productId": "<product-id>",
      "escrowAddr": "<escrow-address>",
      "chainId": "<chain-id>",
      "buyerAddress": "did:ethr:<chainId>:<buyerAddress>",
      "memoHash": "<bytes32>",
      "railgunTxRef": "<bytes32>"
    },
    "commitments": {
      "quantityCommitment": "<bytes32-like-commitment>",
      "totalCommitment": "<bytes32-like-commitment>",
      "paymentCommitment": "<bytes32-like-commitment>"
    },
    "zkProofs": {
      "schemaVersion": "1.0",
      "quantityTotalProof": {
        "proofType": "bulletproofs",
        "proofRHex": "<hex>",
        "proofSHex": "<hex>",
        "contextHash": "<bytes32>"
      },
      "totalPaymentEqualityProof": {
        "proofType": "bulletproofs",
        "proofRHex": "<hex>",
        "proofSHex": "<hex>",
        "contextHash": "<bytes32>"
      }
    },
    "attestation": {
      "attestationVersion": "4.0",
      "contextHash": "<bytes32>",
      "disclosurePubKey": "<hex-or-empty>"
    },
    "delivery": null
  },
  "previousVersion": null,
  "proof": [
    {
      "type": "EcdsaSecp256k1Signature2019",
      "created": "<iso-timestamp>",
      "proofPurpose": "assertionMethod",
      "verificationMethod": "did:ethr:<chainId>:<sellerAddress>#controller",
      "jws": "<signature-hex>",
      "payloadHash": "<hash>",
      "payloadFormat": "eip712-v3-order-typed",
      "role": "seller"
    }
  ]
}
```

## What the Auditor Learns
From the final VRC, the auditor learns:
- the public listing unit price
- the order/payment anchor references
- the commitment values
- the proof payloads
- the seller-signed binding across those fields

The auditor does not learn:
- plaintext `quantity`
- plaintext `totalWei`
- commitment openings / blindings

## Current Limitations
- the custom context and schema/status URLs are currently served from `http://localhost:5000/...`, which is fine for local testing but not for long-term public resolution
- the credential status mechanism is still a project-specific type (`SupplyChainCredentialStatus2026`), not a standard status-list method
- `credentialSubject.id` currently identifies the seller DID, while the buyer is represented separately in `holder` and `credentialSubject.order.buyerAddress`; this should be documented clearly as an intentional issuer-subject model choice
- delivery data is not yet populated in the current final VRC shape

## Recommended Improvements for a More Real-World Standard VRC

These are the most useful upgrades if the goal is to make the VRC easier to justify against mainstream VC practice.

## 1) Stabilize externally resolvable VC resources
The current VRC already uses VC 2.0 and already carries:
- a custom JSON-LD context
- a credential schema
- a credential status reference

The remaining gap is that these URLs are currently local development URLs:
- `http://localhost:5000/contexts/...`
- `http://localhost:5000/schemas/...`
- `http://localhost:5000/vc-status/...`

Practical effect:
- correct for local testing
- not suitable as durable public references in shared or production environments

Recommended direction:
- host these resources behind stable public URLs
- keep the payload shape unchanged if possible

## 2) Add a custom JSON-LD context for project-specific terms
This recommendation has now been implemented in basic form.

The current VRC uses domain-specific terms such as:
- `unitPriceHash`
- `quantityCommitment`
- `paymentCommitment`
- `zkProofs`
- `contextHash`

These terms are now defined through a dedicated custom context, but that context is still served from the local backend and should later move to a stable public location.

Recommended direction:
- publish a project-specific context URI
- define the application terms used inside `credentialSubject`

Practical effect:
- better JSON-LD semantics
- cleaner interoperability story
- clearer distinction between standard VC envelope terms and project-specific business terms

## 3) Keep `credentialSchema` and stabilize its hosting
This recommendation has also been implemented.

Recommended direction:
- keep publishing a JSON Schema for the current VRC shape
- continue referencing it via `credentialSchema`
- move the schema URL from localhost to a stable public location

Example direction:

```json
"credentialSchema": {
  "id": "https://example.org/schemas/ev-battery-order-vrc-v4.json",
  "type": "JsonSchema"
}
```

Practical effect:
- easier machine validation
- cleaner contract between issuer, auditor, and verifier
- easier versioning across schema revisions

## 4) Evolve `credentialStatus` toward a more standard status method
Today, credential status is no longer backend-only; it is carried inside the VRC via `credentialStatus`.

That is a meaningful improvement, but the current status type is still project-specific:

`SupplyChainCredentialStatus2026`

Recommended direction:
- keep `credentialStatus` in the VRC
- later replace the project-specific status type with a more standard status-list method if stronger interoperability is needed

Practical effect:
- status becomes part of the VC model itself
- easier to explain revocation/suspension in standard VC terms

Note:
- the backend registry can still exist operationally
- but the VRC should carry the standard status reference

## 5) Reduce redundant fields
The current `5.0` VRC already removed the old `payment` block, which was the largest redundancy in previous versions.

Recommended direction:
- keep `listing`
- keep `order`
- keep `commitments`
- keep `zkProofs`
- keep `attestation`
- remove or shrink `payment` if it does not add distinct semantics

Practical effect:
- cleaner schema
- easier validation
- less ambiguity about the canonical source of each field

## 6) Clarify domain proofs vs VC proof
Today there are two different notions of "proof":
- the top-level VC `proof` used for the seller signature
- the embedded `zkProofs` used for the order math statements

That is valid, but it should be described explicitly.

Recommended direction:
- keep top-level `proof` for issuer signature
- keep `zkProofs` as domain-level cryptographic evidence
- document that `zkProofs` are not W3C VC proof mechanisms; they are embedded application evidence

Practical effect:
- fewer conceptual misunderstandings
- easier review by people familiar with VC standards

## 7) Consider a future `evidence` block
If stronger standards polish is desired later, the embedded domain proofs could move from:
- `credentialSubject.zkProofs`

to something more explicitly evidence-oriented, such as:
- `evidence`
- or `credentialSubject.evidence`

That is not required now, but it may read more naturally to external reviewers.

## Suggested Next-Version Shape

If a cleaner, more standard-oriented VRC revision is introduced later, a good target would be:

```json
{
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://example.org/contexts/ev-battery-vrc-v1.jsonld"
  ],
  "id": "urn:uuid:<uuid>",
  "type": [
    "VerifiableCredential",
    "SupplyChainCredential",
    "OrderCommitmentCredential"
  ],
  "issuer": "did:ethr:<chainId>:<sellerAddress>",
  "validFrom": "<iso-timestamp>",
  "credentialSchema": {
    "id": "https://example.org/schemas/ev-battery-order-vrc-v5.json",
    "type": "JsonSchema"
  },
  "credentialStatus": {
    "id": "https://example.org/status/<status-entry-id>",
    "type": "BitstringStatusListEntry"
  },
  "credentialSubject": {
    "id": "did:ethr:<chainId>:<sellerAddress>",
    "listing": { "...": "..." },
    "order": { "...": "..." },
    "commitments": { "...": "..." },
    "zkProofs": { "...": "..." },
    "attestation": { "...": "..." }
  },
  "proof": [{ "...": "..." }]
}
```

This is not the current deployed shape. It is the recommended direction for a more standards-ready next version.

## Practical Recommendation
If changes are made incrementally from the current `5.0` implementation, the best order is:
1. move context/schema/status URLs from localhost to stable public URLs
2. decide whether `credentialSubject.id` should stay seller-oriented or become order-oriented
3. standardize the credential-status method further
4. simplify any remaining redundant subject fields
5. only then consider larger proof-model changes

That order improves the standards story without forcing a full redesign of the working system.

## References
- [01-end-to-end-flow.md](/c:/Users/yamen/ev-battery-supplychain/docs/current/01-end-to-end-flow.md)
- [03-auditor-verification.md](/c:/Users/yamen/ev-battery-supplychain/docs/current/03-auditor-verification.md)
- [04-did-signing-and-verification-standards.md](/c:/Users/yamen/ev-battery-supplychain/docs/current/04-did-signing-and-verification-standards.md)
- [vcBuilder.mjs](/c:/Users/yamen/ev-battery-supplychain/frontend/src/utils/vcBuilder.mjs)
- [signVcWithMetamask.js](/c:/Users/yamen/ev-battery-supplychain/frontend/src/utils/signVcWithMetamask.js)
