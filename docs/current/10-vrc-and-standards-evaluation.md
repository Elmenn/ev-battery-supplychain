# VRC and Standards Evaluation (Current)

This document evaluates the current `VRC 5.0` model from two perspectives:

1. internal quality of the VRC as the system's final audit artifact
2. alignment with mainstream W3C VC / JSON-LD expectations

This is not only a schema review. It is an evaluation of whether the VRC is:
- complete
- stable
- verifiable
- explainable to external reviewers

## 1) Evaluation Goals

The evaluation should answer:

1. Does the VRC contain all fields needed for independent verification?
2. Is the VRC self-contained and stable after signing?
3. Does the VRC follow the W3C VC model closely enough to be defensible?
4. Which parts are standards-aligned versus explicitly project-specific?
5. What remaining gaps would matter in a more production-like deployment?

## 2) Scope

Evaluate the current final VRC as emitted by the shipped system.

That includes:
- top-level VC envelope
- `credentialSubject` structure
- embedded commitments
- embedded proof payloads
- `credentialSchema`
- `credentialStatus`
- issuer proof structure
- JSON-LD context use

Primary references:
- `docs/current/06-vrc-model.md`
- real emitted `VRC 5.0` JSON samples from the active implementation

## 3) Evaluation Dimensions

### A. Structural Completeness

Questions:
- does the VRC contain every field needed for full audit verification?
- can an auditor verify from:
  - VRC JSON
  - on-chain anchor
  - credential status
without an external sidecar?

### B. Immutability and Stability

Questions:
- is the VRC intended to remain unchanged after signing?
- are the embedded proof fields part of the signed payload?
- would verification break if fields were modified post-signature?

### C. Verifiability

Questions:
- can the VRC be verified end to end by the auditor UI?
- are the proof statements sufficiently bound to the order context?

### D. Standards Alignment

Questions:
- which parts match VC 2.0 conventions?
- which parts are project-specific?
- are the non-standard parts clearly scoped and defensible?

### E. Interoperability Readiness

Questions:
- can external reviewers understand the structure?
- are URLs and references stable outside localhost?
- are issuer/holder/subject semantics unambiguous?

## 4) Evaluated Samples

This evaluation is based on real emitted `VRC 5.0` files from the active implementation, including:

- `vc-0xded68964972d9b93.json`
- `vc-0x47684d147d74fbb3.json`

Both samples show the same active structural model:
- VC 2.0 envelope
- self-contained final VRC
- embedded commitments
- embedded `zkProofs`
- explicit `credentialSchema`
- explicit `credentialStatus`
- EIP-712 seller signature carried in top-level `proof`

## 5) Evaluated Findings

### A. Structural Completeness

Result: **Pass**

Observed in the emitted VRCs:
- top-level envelope fields are present:
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
- all expected subject sections are present:
  - `listing`
  - `order`
  - `commitments`
  - `zkProofs`
  - `attestation`
- all three commitments are present
- both proof objects are present
- `contextHash` is present inside `attestation` and inside each embedded proof object

Conclusion:
- the VRC is self-contained enough for audit verification without an external sidecar

### B. Immutability and Stability

Result: **Pass**

Observed:
- the VRC is generated once at seller confirmation
- the final artifact is uploaded and CID-anchored on-chain through `confirmOrderById(...)`
- the embedded `zkProofs` are part of the signed EIP-712 payload in the active `eip712-v3-order-typed` format
- the current active flow does not depend on mutable sidecar proof data

Conclusion:
- the current VRC behaves as a stable final audit artifact after signing

### C. Verifiability

Result: **Pass**

Observed from the active system:
- auditor verification succeeds from:
  - VRC JSON
  - on-chain `vcHash` anchor
  - credential status lookup
  - embedded proof payloads
- quantity-total proof and total-payment equality proof are carried directly in the VRC
- order/payment anchors are also carried directly:
  - `orderId`
  - `memoHash`
  - `railgunTxRef`
  - commitments
  - `contextHash`

Conclusion:
- the final VRC is operationally verifiable end to end in the current auditor flow

### D. Standards Alignment

Result: **Moderately strong**

Observed:
- uses VC 2.0 base context:
  - `https://www.w3.org/ns/credentials/v2`
- uses `validFrom`
- uses JSON-LD context array
- includes `credentialSchema`
- includes `credentialStatus`
- keeps issuer signature in top-level `proof`

However:
- the custom context is still locally hosted:
  - `http://localhost:5000/contexts/ev-battery-vrc-v1.jsonld`
- the schema URL is also locally hosted
- `credentialStatus` uses a project-specific type:
  - `SupplyChainCredentialStatus2026`
- top-level signature proof is Ethereum/EIP-712-oriented rather than VC Data Integrity
- `zkProofs` are domain-specific embedded evidence, not standard W3C proof suites

Conclusion:
- the VRC is standards-aware and structurally defensible, but not maximally interoperable yet

### E. Interoperability Readiness

Result: **Medium**

Strong points:
- structure is understandable
- envelope is recognizable to external VC reviewers
- schema/status references are explicit

Weaker points:
- localhost URLs prevent public interoperability as-is
- `credentialSubject.id` remains seller-oriented while `holder` is buyer-oriented
- project-specific status method and proof model require explanation

Conclusion:
- the VRC is good for demonstration, evaluation, and academic defense
- it still needs public/stable URLs and some semantic cleanup for broader ecosystem interoperability

## 6) Standards Scoring

| Dimension | Rating | Notes |
|---|---|---|
| VC 2.0 envelope alignment | High | Uses VC 2.0 base context, `validFrom`, `credentialSchema`, `credentialStatus`, and top-level `proof` |
| JSON-LD context use | Medium | Custom context exists, but is locally hosted and project-specific |
| Credential schema support | High | Explicit `credentialSchema` is present and points to a concrete JSON schema |
| Credential status support | Medium | Present and operational, but uses a project-specific status type rather than a more standard status-list method |
| Signature model clarity | Medium | Clear and operational, but based on EIP-712 rather than a mainstream VC Data Integrity proof suite |
| Domain-proof clarity | High | `zkProofs` are clearly separated from issuer signature and carry explicit proof objects |
| Interoperability readiness | Medium | Structurally good, but localhost URLs and project-specific semantics limit broader interoperability |

## 7) Results Table

| Evaluation Area | Result | Notes |
|---|---|---|
| Self-contained final artifact | Pass | No active sidecar is needed |
| Contains all audit anchors | Pass | Includes listing, order, commitment, and binding fields |
| Contains both proof payloads | Pass | `quantityTotalProof` and `totalPaymentEqualityProof` are embedded |
| Signature over stable fields | Pass | Active EIP-712 payload signs the proof-bearing final artifact |
| On-chain anchor compatibility | Pass | Final CID is anchored via `confirmOrderById(...)` and verified later against `vcHash` |
| VC 2.0 envelope alignment | Strong | Good alignment with current VC 2.0 document shape |
| JSON-LD context alignment | Moderate | Context exists, but uses localhost URI |
| Schema/status support | Strong operationally | Present and functional, but still project-specific in style |
| Public interoperability readiness | Moderate | Suitable for prototype/thesis use, but not final public interoperability |

## 8) Main Conclusion

The current `VRC 5.0` model is a strong final artifact for the implemented system.

It succeeds on the most important architectural goals:
- single final immutable audit artifact
- self-contained commitments and proof payloads
- end-to-end auditor verifiability
- explicit schema and status references
- defensible alignment with W3C VC structure

The main remaining gaps are not about internal completeness. They are about broader standards polish:
- localhost-hosted context/schema/status URLs
- project-specific status method
- EIP-712 proof style instead of a more conventional VC proof suite
- seller-oriented `credentialSubject.id` semantics

So the current assessment is:
- **strong for prototype and evaluation use**
- **moderately strong for standards alignment**
- **not yet final for broad public interoperability**

## 9) Success Criteria

The VRC model should be considered strong if:

- a verifier can audit from the VRC plus on-chain/status references
- no sidecar is needed in the active flow
- all cryptographically relevant fields are signed and stable
- standards deviations are explicit and well-bounded
- the structure is easy to explain to an external reviewer

## 10) Follow-Up Improvement Questions

After evaluation, the main follow-up questions should be:

1. Should context/schema/status URLs move to stable public hosting?
2. Should `credentialStatus` evolve toward a more standard status-list method?
3. Should issuer proof eventually move from EIP-712 to a more standard VC proof mechanism?
4. Should `credentialSubject.id` become more order-oriented or remain seller-oriented?

## 11) Related Docs

- `docs/current/03-auditor-verification.md`
- `docs/current/04-did-signing-and-verification-standards.md`
- `docs/current/06-vrc-model.md`
