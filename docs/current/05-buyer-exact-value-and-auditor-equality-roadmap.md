# Buyer Exact-Value Verification + Auditor Price-Payment Consistency Proof Roadmap

## Purpose
This document captures the research and execution plan for two upgrades:

1. Buyer exact-value verification of the product price commitment.
2. Auditor verification that buyer payment commitment and seller price commitment are equal (without revealing the amount).

The goal is to strengthen payment integrity while preserving privacy.

---

## Why This Matters

### Current strength
- We already prove that a committed price is valid and in range (`0 <= value < 2^64`) with binding context.

### Current gap
- We do not yet provide a privacy-preserving proof that the buyer and seller are cryptographically consistent on the same hidden amount.
- We also do not yet provide full cryptographic binding to Railgun internal transferred amount.

### Improvement impact
- Buyer gets cryptographic assurance of exact value match.
- Auditor gets privacy-preserving consistency assurance between seller price commitment and buyer payment commitment.
- Stronger dispute/compliance posture with explicit scope and guarantees.

---

## Current System Snapshot (Relevant Parts)
- Price commitment + range proof are generated in seller flow and stored in VC metadata.
- Verification currently checks commitment proof validity and context binding.
- Railgun payment references (`memoHash`, `railgunTxRef`) are recorded/anchored.
- Current on-chain/private-payment recording does not expose or prove exact amount equality to `C_price`.

---

## Workstream A: Buyer Exact-Value Verification

## A1) Statement to verify
Buyer verifies:
- `C_price == Pedersen(value, blinding)`

Where:
- `C_price` is commitment from VC/on-chain context.
- `value` is exact price disclosed to buyer.
- `blinding` is provided to buyer through a controlled disclosure mechanism.

## A2) Data required
- Required:
  - `value`
  - `C_price`
  - `blinding`
- Optional hardening:
  - seller-signed disclosure payload hash (audit trail)
  - disclosure metadata (`version`, `timestamp`, `recipient`) for traceability

## A3) Design options
- Option A (recommended for this codebase): encrypted opening package
  - Buyer generates a fresh `x25519` keypair and publishes the public key (with wallet-signed attestation) during payment flow.
  - Seller retrieves buyer's disclosure pubkey at `confirmOrder` and encrypts `{value, blinding}` to it.
  - Buyer decrypts and verifies locally.
  - Note: do NOT derive the disclosure keypair from a wallet signature — wallet signatures are not a stable KDF input across all providers/settings.
- Option B: deterministic blinding reuse (optional)
  - Buyer derives blinding from deterministic rule.
  - Simpler sharing model, but should be used only with explicit privacy tradeoff acceptance.

## A4) Implementation tasks
1. Add `openCommitmentAndVerify(...)` utility in frontend.
2. Add seller-to-buyer encrypted opening payload flow.
3. Add UI action for buyer in product detail/audit flow:
   - decrypt/open payload
   - run local opening check
4. Add structured result object:
   - `{ exactValueVerified: boolean, expectedCommitment, recomputedCommitment }`
5. Add optional signed disclosure record (future-friendly).

## A5) Acceptance criteria
- Given correct value/opening: verification passes.
- Given wrong value or wrong blinding: verification fails.
- No exact value leaked unless buyer chooses to reveal/export.

---

## Workstream B: Auditor Price-Payment Consistency (Model 2-lite)

## B1) Target statement
Auditor verifies, without learning amount, that:
- Seller commitment statement is valid (`C_price` commits to hidden `v`).
- Buyer commitment statement is valid (`C_pay` commits to hidden `v`).
- Equality proof shows both commitments use the same hidden scalar.
- Proofs are bound to `{productId, txRef, chainId, escrowAddr, stage}` to prevent replay/swap.

### Scope note
This phase proves seller/buyer cryptographic consistency on a hidden amount. It does **not** yet prove equality to Railgun internal transferred amount cryptographically.

## B2) Key reality
- Public chain data from Railgun alone is insufficient (amount is private).
- Current anchors (`memoHash`, `railgunTxRef`) bind to transaction reference, not directly to private amount witness.
- Full Railgun-native amount binding requires additional primitives and is scoped as future work.

## B3) Candidate proof constructions
- Option 1 (recommended now): equality proof between commitments (Model 2-lite)
  - Seller provides price commitment proof (`C_price`).
  - Buyer provides payment-side commitment proof (`C_pay`).
  - Prove in ZK they commit to the same scalar using a Bulletproofs-compatible Schnorr sigma proof (Fiat-Shamir transcript style, same curve — not a direct RangeProof API call).
  - After receiving encrypted opening from seller, buyer holds both secrets `(v, blinding_price)` and `(v, r_pay)` and is the natural prover.
  - Bind transcript/tag to `{productId, txRef, chainId, escrowAddr, stage}` context.
- Option 2 (future work): Railgun-native cryptographic binding
  - Bind equality proof to a verifiable payment-amount statement from Railgun internals.
  - Higher complexity; not primary delivery for current timeline.
- Option 3: reveal-to-auditor fallback
  - Controlled disclosure of exact values to authorized auditor (non-default).
  - Keep as dispute/regulatory fallback path.

## B4) Integration points
1. Buyer payment commitment source
   - Add buyer-side commitment object for claimed paid amount.
2. Equality proof generator
   - Extend ZKP module (WASM/backend) with equality relation proof.
3. VC payload extension
   - Add objects for:
     - seller price proof reference
     - buyer payment commitment proof
     - `paymentEqualityProof`
     - binding context (`productId`, `txRef`, `chainId`, `escrowAddr`, `stage`)
4. Auditor verifier path
   - Add verification endpoint/utility for consistency proof bundle.

## B5) Acceptance criteria
- Auditor verification succeeds only when seller and buyer hidden amounts are equal.
- Fails if proof replayed with different `productId/txRef`.
- Fails on tampered commitment/proof/context fields.
- No exact amount disclosure in default audit mode.

---

## Execution Plan (Phased)

## Phase 0: Spec Freeze
- Finalize canonical statement formats:
  - Buyer opening payload schema.
  - Auditor consistency proof schema + binding fields.
- Set encrypted opening package as default.
- Freeze explicit claim boundaries (what is guaranteed now vs future work).

## Phase 1: Buyer Exact-Value (Low Risk, Fast)
- Implement A-stream utility + encrypted opening + UI + tests.
- Deliver first, since independent of Railgun internals.

## Phase 2: Consistency Proof Research Spike (Model 2-lite)
- Build minimal PoC proving equality of seller and buyer commitments with binding tag.
- Benchmark proof size/time on target hardware.
- Keep Bulletproof-based relation unless benchmark/security findings force change.

## Phase 3: Product Integration
- Integrate buyer payment commitment + equality proof generation into payment/finalization flow.
- Store proof references in VC.

## Phase 4: Auditor End-to-End Verification
- Implement verifier UI/API checks for seller proof + buyer proof + equality proof + bindings.
- Add negative tests (swap/replay/mismatch/tamper).
- Add docs + operator runbook.

## Phase 5: Hardening + Rollout
- Run shadow mode against existing verification path.
- Gate on parity and performance thresholds.
- Keep disclosure fallback for disputes.

## Phase 6: Future Work Spike (Railgun-native Binding)
- Research and prototype cryptographic binding from Railgun internal payment amount witness to equality proof.
- Evaluate feasibility, complexity, and performance for future publication/production scope.

---

## Testing Plan

## Unit tests
- Commitment opening with:
  - valid value/opening
  - wrong value
  - wrong blinding
- Equality proof checks with:
  - matching hidden amounts
  - mismatched hidden amounts

## Integration tests
- Full buyer flow: payment -> encrypted opening -> exact opening verify.
- Full auditor flow: seller proof + buyer proof + equality proof -> pass/fail cases.

## Security tests
- Replay proof with modified `productId` / `txRef` -> must fail.
- Swap proof between products -> must fail.
- Tamper commitment/proof/context bytes -> must fail.

## Performance tests
- Measure generation/verification time distributions.
- Ensure UI remains responsive (worker path).

---

## Risks and Mitigations
- Risk: buyer payment commitment is self-attested in Model 2-lite.
  - Mitigation: explicit scope in claims, strong context binding, on-chain txRef anchors, future Railgun-native binding phase.
- Risk: proof generation latency on browser devices.
  - Mitigation: worker execution + benchmark-based thresholds.
- Risk: schema drift across VC versions.
  - Mitigation: explicit versioned proof objects and parsers.
- Risk: accidental disclosure of exact price.
  - Mitigation: privacy-by-default UX and explicit disclosure modes only.

---

## Decision Gates
- Gate G1 (after Phase 1): buyer opening feature stable and tested.
- Gate G2 (after Phase 2): consistency proof PoC meets security + performance baseline.
- Gate G3 (after Phase 4): auditor E2E tests pass with replay/swap resistance.
- Gate G4 (after Phase 6): decide whether Railgun-native binding enters next implementation cycle.

---

## References (Research Inputs)
- Bulletproofs paper (general arithmetic proofs): https://eprint.iacr.org/2017/1066
- Railgun developer docs (private transaction model): https://docs.railgun.org/
- Existing repository docs:
  - `docs/current/02-railgun-integration.md`
  - `docs/current/03-auditor-verification.md`
  - `docs/current/04-did-signing-and-verification-standards.md`

---

## Locked End-to-End Flow

| Step | Who | What |
|------|-----|-------|
| Listing | Seller | Creates `C_price` + range proof + binding → stored in VC (IPFS) |
| Payment | Buyer | Railgun transfer → creates `C_pay` + binding context + x25519 disclosure pubkey (wallet-attested) → stored in backend DB |
| confirmOrder | Seller | Encrypts `{value, blinding_price}` to buyer's x25519 pubkey → ciphertext stored in VC + DB |
| Workstream A | Buyer | Decrypts opening, verifies `C_price = Pedersen(value, blinding_price)` locally |
| Workstream B | Buyer | Using both secrets, generates Schnorr sigma equality proof → submits to auditor |
| Audit | Auditor | Verifies seller range proof + buyer equality proof + bindings, all off-chain |

## Recommended Next Action
Implement **GSD Phase 12: Buyer Attestation + Deferred Equality Proving**, covering:
1. Schema updates (`buyerPaymentCommitment`, `disclosurePubKey`, `encryptedOpening`, `paymentEqualityProof` fields in VC)
2. `PrivatePaymentModal` write path: generate `C_pay` + binding + x25519 disclosure keypair → save to DB
3. `confirmOrder` encryption path: seller retrieves buyer pubkey, encrypts opening → stores in VC + DB
4. Audit-time prover + verifier: buyer generates equality proof lazily; auditor verifies full bundle
5. Negative/replay/swap/tamper tests

Keep Railgun-native amount binding explicitly in future-work scope (Phase 6 of this roadmap) until feasibility is validated.
