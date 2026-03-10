# Current Buyer Attestation and Equality Verification System

## System Goal

The system gives privacy-preserving assurance for price integrity:

1. The listed price matches the seller commitment (`C_price`).
2. The buyer payment commitment (`C_pay`) matches `C_price` without revealing the value.

---

## Core Commitment Model

- `C_price`: seller price commitment (Pedersen commitment).
- `C_pay`: buyer payment commitment (Pedersen commitment).
- Equality proof: Schnorr sigma proof that `C_price` and `C_pay` hide the same value.
- `quantity` is currently informational listing metadata and is not part of this equality statement.

### Important architecture detail

- The on-chain `product.priceCommitment` field is a contract initialization placeholder.
- The cryptographic `C_price` used for verification is stored in metadata/VC records.
- Price verification logic uses metadata/VC commitment sources.

---

## Backend and Prover Interfaces

### Buyer secrets backend

- `POST /buyer-secrets`
- `GET /buyer-secrets/:productAddress/:buyerAddress`
- `PATCH /buyer-secrets/:productAddress/:buyerAddress/encrypted-opening`
- `PATCH /buyer-secrets/:productAddress/:buyerAddress/equality-proof`

These endpoints store buyer disclosure material and equality-proof sidecar data.

### ZKP backend

- `POST /zkp/generate-equality-proof`
- `POST /zkp/verify-equality-proof`

These endpoints generate and verify the equality proof for `C_price == C_pay`.
Current implementation uses backend mode for equality proof operations.

---

## Buyer Flow

### 1) Pre-payment Verify Price (product listed)

The buyer clicks `Verify Price` on the product page before paying.

Verification inputs:

- `priceWei` from `getProductMeta(address)`
- `C_price` from `getProductMeta(address).priceCommitment`
- deterministic `r_price = generateDeterministicBlinding(productAddress, sellerAddress)`

The app recomputes commitment and verifies match.

UI states:

- Green: commitment verified
- Red: mismatch warning
- Amber: commitment record unavailable or verifier offline (with Retry)

The `Buy with Railgun` action remains available by design.

### 2) Payment attestation persistence

After private payment is recorded, buyer attestation data is stored through backend APIs:

- disclosure public key
- `C_pay`
- encrypted buyer secret blob (contains buyer secret material such as `r_pay`)

This attestation persistence is handled as non-blocking operational logic.

### 3) Buyer price verification panel (OrderConfirmed+)

When buyer panel is visible and VC is loaded:

- Workstream A runs automatically.
- Workstream A verifies VC `C_price` consistency using DB `priceWei` and deterministic `r_price`.
- If Workstream A passes, `Generate Equality Proof` is available.

### 4) Generate equality proof

Workstream B uses:

- `r_pay` from buyer secret blob
- deterministic `r_price`
- `C_price` and `C_pay`
- binding context (`productId`, `txRef`, `chainId`, `escrowAddr`, `stage`)

Generated proof is stored in backend sidecar:

- `buyer_secrets.equality_proof`

---

## Seller Flow at confirmOrder

At seller confirmOrder:

- seller reads buyer disclosure public key
- computes deterministic `r_price`
- encrypts `{value, r_price}` as `encryptedOpening`
- includes attestation data in VC before IPFS upload
- confirms on-chain with anchored VC CID

If encryption-side enrichment is unavailable, core on-chain confirmOrder flow still executes.

---

## Auditor Verification Flow

Auditor card verifies payment equality proof using:

- `C_price`
- `C_pay`
- proof (`proof_r_hex`, `proof_s_hex`)
- binding context

Proof source resolution:

- VC attestation proof if present
- otherwise sidecar proof from `buyer_secrets.equality_proof`

Auditor obtains pass/fail cryptographic verification without learning the amount.

---

## Anchor and Storage Strategy

- `confirmOrder` anchors one canonical VC CID on-chain (`vcHash = keccak256(CID)`).
- Equality-proof generation stores proof in sidecar backend data.
- This keeps anchored VC immutable and avoids extra IPFS uploads during proof generation.

---

## What Each Party Verifies

| Party | Verification |
|---|---|
| Buyer | Listed price matches seller commitment record before payment. |
| Buyer | VC price commitment consistency in buyer panel (Workstream A). |
| Buyer | Equality proof generation for `C_price == C_pay` (Workstream B). |
| Seller | Confidential opening package generation for buyer/audit workflows. |
| Auditor | Equality proof verification without seeing the price value. |

---

## Scope Boundary

The system verifies consistency between commitments and transaction anchors (`memoHash`, `railgunTxRef`) with off-chain cryptographic checks.

Direct cryptographic binding to internal Railgun note commitments is outside current scope.

---

## Explain Like You Are 10

Imagine two locked boxes:

- Seller box (`C_price`) hides the product price.
- Buyer box (`C_pay`) hides what buyer paid.

### Buyer check

Before paying, buyer runs a math check that says:
"The seller box matches the listed price."

### Auditor check

Later, buyer gives a math proof that says:
"My box and seller box hide the same number."

Auditor can check this is true without seeing the number.

---

## Reliability Guarantees

- Payment success UI is not blocked by attestation persistence calls.
- confirmOrder on-chain execution is not blocked by attestation enrichment calls.
- Equality proof storage does not require VC CID rewrites.
