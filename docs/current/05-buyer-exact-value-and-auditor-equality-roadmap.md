# Buyer Exact-Value and Auditor Consistency Roadmap

## Purpose
This roadmap defines how the system guarantees confidential price integrity for buyers and auditors.

Core guarantees:
1. Buyer verifies that the listed price matches the seller commitment.
2. Auditor verifies that seller and buyer commitments hide the same amount.

All default verification remains privacy-preserving and off-chain.

---

## Current System Baseline

### Commitments
- `C_price`: seller Pedersen commitment to price.
- `C_pay`: buyer Pedersen commitment to paid amount.
- `quantity` is currently descriptive metadata and not part of the active ZK equality relation.

### Anchors and references
- Transaction anchors: `memoHash`, `railgunTxRef`.
- VC anchor on-chain: `vcHash = keccak256(CID)` at `confirmOrder`.
- Equality proof storage: backend sidecar (`buyer_secrets.equality_proof`) to keep anchored VC immutable.

### Active verification paths
- Buyer pre-payment `Verify Price` uses DB/VC commitment records (`priceWei`, `priceCommitment`) plus deterministic `r_price`.
- Buyer post-payment Workstream A runs automatically when VC is loaded and validates commitment consistency.
- Buyer Workstream B generates Schnorr sigma equality proof for `C_price == C_pay`.
- Auditor verifies proof bundle from VC or sidecar source.

---

## Workstream A: Buyer Exact-Value Verification

### Statement
Buyer verifies:
- `C_price == Pedersen(value, r_price)`

### Inputs
- `value` from metadata (`priceWei`)
- `C_price` from metadata/VC commitment record
- `r_price` from deterministic derivation `generateDeterministicBlinding(productAddress, sellerAddress)`

### UX behavior
- Buyer can run `Verify Price` before payment.
- Result states: verified, mismatch warning, verifier/data unavailable (retry).
- Payment action remains user-controlled.

### Acceptance
- Correct inputs: pass.
- Wrong value or blinding context: fail.
- No public disclosure of exact value.

---

## Workstream B: Auditor Price-Payment Consistency

### Statement
Auditor verifies, without learning value:
- `C_price` and `C_pay` commit to the same hidden scalar.
- Proof is bound to context:
  - `productId`
  - `txRef`
  - `chainId`
  - `escrowAddr`
  - `stage`

### Proof system
- Schnorr sigma equality proof (Chaum-Pedersen style relation).
- Backend endpoints:
  - `POST /zkp/generate-equality-proof`
  - `POST /zkp/verify-equality-proof`
- Current implementation path is backend mode for equality proof generation/verification.

### Data flow
1. Buyer payment flow writes disclosure material and `C_pay` to backend.
2. Seller confirmOrder writes encrypted opening data for disclosure workflows.
3. Buyer generates equality proof using `C_price`, `C_pay`, `r_price`, `r_pay`, and binding context.
4. Proof is stored in sidecar backend record.
5. Auditor verifies proof with commitment pair and binding context.

### Acceptance
- Valid relation and context: pass.
- Replay/swap/tamper/context mismatch: fail.
- Exact amount remains hidden in default audit mode.

---

## VC and Schema Conventions

Primary fields used by this roadmap:
- `credentialSubject.priceCommitment`
- `credentialSubject.payment.memoHash`
- `credentialSubject.payment.railgunTxRef`
- `credentialSubject.attestation.disclosurePubKey`
- `credentialSubject.attestation.buyerPaymentCommitment`
- `credentialSubject.attestation.encryptedOpening`
- `credentialSubject.attestation.paymentEqualityProof` (when embedded)

Operational rule:
- Auditor verifier accepts proof source from VC attestation or sidecar record.

---

## Testing Plan

### Unit tests
- Commitment open/verify:
  - valid value/blinding
  - wrong value
  - wrong blinding
- Equality proof:
  - matching hidden amounts
  - mismatched hidden amounts

### Integration tests
- Buyer flow:
  - pre-payment verify
  - payment attestation persistence
  - Workstream A auto verification
  - Workstream B proof generation and storage
- Auditor flow:
  - verify from VC proof source
  - verify from sidecar proof source

### Security tests
- Replay with different `productId` or `txRef` -> fail.
- Cross-product proof swap -> fail.
- Proof/commitment/context tamper -> fail.

### Performance tests
- Measure proof generation/verification latency.
- Ensure UI responsiveness (worker path where applicable).

---

## Risks and Mitigations

- Risk: buyer-side payment commitment is self-attested.
  - Mitigation: strict binding context, transaction anchors, explicit claim boundaries.
- Risk: prover latency on constrained devices.
  - Mitigation: async UX, worker execution, benchmark thresholds.
- Risk: schema drift across VC versions.
  - Mitigation: versioned proof objects and strict parser checks.
- Risk: accidental disclosure of value.
  - Mitigation: privacy-by-default UX and explicit disclosure controls.

---

## Decision Gates

- Gate G1: buyer verify-price and Workstream A are stable and reproducible.
- Gate G2: equality proof performance and verification reliability meet baseline.
- Gate G3: auditor end-to-end replay/swap/tamper tests pass.
- Gate G4: decision on Railgun-native cryptographic amount binding scope.

---

## Future Scope: Railgun-Native Amount Binding

This roadmap binds commitments and transaction anchors at application level.
A dedicated future scope can extend to direct cryptographic binding against Railgun internal payment-amount witnesses.

---

## References
- Bulletproofs paper: https://eprint.iacr.org/2017/1066
- Railgun docs: https://docs.railgun.org/
- Internal docs:
  - `docs/current/02-railgun-integration.md`
  - `docs/current/03-auditor-verification.md`
  - `docs/current/04-did-signing-and-verification-standards.md`
  - `docs/phase12-buyer-attestation.md`
