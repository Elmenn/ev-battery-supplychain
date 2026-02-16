# Phase 8: Single VC Architecture - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Consolidate the 3-stage VC chain into a single append-only Verifiable Credential. The VC accumulates proofs over the product lifecycle (listing, payment, delivery). Includes Pedersen commitment + ZKP range proof for price privacy, IPFS storage with version linking, and hash-only on-chain storage. UI for displaying/interacting with VCs is Phase 9.

</domain>

<decisions>
## Implementation Decisions

### VC document structure
- Append-only sections: single JSON document with sections (listing, payment, delivery) that get filled in as lifecycle progresses
- W3C Verifiable Credential format: follow W3C VC Data Model spec (credentialSubject, proof, issuer, etc.)
- Seller is the VC issuer: seller creates VC at product listing, buyer and transporter append their proofs as additional proof sections
- Full product details in VC: name, description, all metadata — self-contained document, no need to look up on-chain

### Price privacy mechanism
- Both Pedersen commitment + range proof: full cryptographic pipeline
  - Pedersen commitment locks exact price at listing (integrity — seller can't change it)
  - ZKP range proof lets anyone verify price is reasonable without learning exact amount (public auditability)
  - Encrypted price in VC: price encrypted with buyer's public key, only buyer can read exact amount
- Anyone can verify anytime: public auditability without learning the price
- Full ZKP with library: use snarkjs/circom for production-grade range proofs (thesis value)

### IPFS versioning strategy
- previousVersion CID field: each new VC version contains a previousVersion field pointing to prior CID, creating a chain of immutable snapshots
- Frontend uploads directly to IPFS via Pinata API (each party uploads when they add their proof)
- Pinata as pinning service (free tier, good API)
- Retry with backoff on IPFS failure: 3 attempts, then show error for manual retry

### On-chain vs off-chain split
- Hash of IPFS CID string on-chain: keccak256(bytes(vcCID)) — CID is already content-addressed, on-chain hash verifies the CID
- Both hash + signatures for verification: on-chain hash confirms document integrity, in-document signatures from each party confirm who contributed what
- CID emitted in events: already designed in Phase 7, enables easy indexing
- Full VC document cached locally in localStorage/IndexedDB: small JSON, instant display, fetch fresh from IPFS only when new version exists

### Claude's Discretion
- Exact W3C VC JSON schema field names and nesting
- snarkjs circuit design for range proof
- Pinata API integration details
- localStorage vs IndexedDB choice for caching
- Error handling UX for failed IPFS uploads

</decisions>

<specifics>
## Specific Ideas

- FCFS buyer model: first non-seller caller of recordPrivatePayment becomes buyer — VC must accommodate buyer identity being unknown at listing time
- Pedersen commitment already exists as priceCommitment (bytes32) in the contract — VC should reference this on-chain commitment
- vcHash stored via confirmOrder(vcCID) — transporter verifies hash at delivery via confirmDelivery(hash)
- Three proof sections in lifecycle: seller listing proof, buyer payment proof (memoHash + railgunTxRef), transporter delivery confirmation

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-single-vc-architecture*
*Context gathered: 2026-02-16*
