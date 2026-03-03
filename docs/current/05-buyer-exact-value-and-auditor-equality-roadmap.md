# Buyer Exact-Value Verification + Auditor Railgun Equality Proof Roadmap

## Purpose
This document captures the research and execution plan for two upgrades:

1. Buyer exact-value verification of the product price commitment.
2. Auditor verification that private Railgun transferred amount equals the committed product price, without revealing the amount.

The goal is to strengthen payment integrity while preserving privacy.

---

## Why This Matters

### Current strength
- We already prove that a committed price is valid and in range (`0 <= value < 2^64`) with binding context.

### Current gap
- We do not yet prove end-to-end that the **actual transferred amount** equals the committed product price in a privacy-preserving way.

### Improvement impact
- Buyer gets cryptographic assurance of exact value match.
- Auditor gets privacy-preserving consistency assurance between VC commitment and private payment.
- Stronger dispute/compliance posture.

---

## Current System Snapshot (Relevant Parts)
- Price commitment + range proof generated in seller flow and stored in VC metadata.
- Verification currently checks commitment proof validity and context binding.
- Railgun payment reference is recorded, but cryptographic equality-to-price is not yet fully proven end-to-end.

---

## Workstream A: Buyer Exact-Value Verification

## A1) Statement to verify
Buyer verifies that:
- `C_price == Pedersen(value, blinding)`

Where:
- `C_price` is commitment from VC/on-chain context.
- `value` is exact price disclosed to buyer.
- `blinding` is either shared directly or deterministically derived.

## A2) Data required
- Required:
  - `value`
  - `C_price`
  - `blinding` OR deterministic derivation inputs/version
- Optional hardening:
  - seller-signed disclosure payload hash (audit trail)

## A3) Design options
- Option A (recommended for this codebase): deterministic blinding reuse
  - Buyer derives blinding from agreed deterministic rule.
  - Seller shares only exact `value`.
- Option B: encrypted opening package
  - Seller shares `{value, blinding}` encrypted to buyer.
  - Better confidentiality control for non-deterministic blinding deployments.

## A4) Implementation tasks
1. Add `openCommitmentAndVerify(...)` utility in frontend.
2. Add UI action for buyer in product detail/audit flow:
   - Input/receive value, run local opening check.
3. Add structured result object:
   - `{ exactValueVerified: boolean, expectedCommitment, recomputedCommitment }`
4. Add optional signed disclosure record (future-friendly).

## A5) Acceptance criteria
- Given correct value/opening: verification passes.
- Given wrong value or wrong blinding: verification fails.
- No exact value leaked unless buyer chooses to reveal/export.

---

## Workstream B: Auditor Railgun Amount == Price Commitment Equality

## B1) Target statement
Auditor verifies, without learning amount, that:
- `amount_paid == amount_committed_price`
- proof is bound to `{productId, txRef, chainId, escrowAddr, stage}` to prevent replay/swap.

## B2) Key reality
- Public chain data from Railgun alone is insufficient (amount is private).
- Need an additional proof generated from private witness in wallet/prover context.

## B3) Candidate proof constructions
- Option 1 (recommended): equality proof between commitments
  - Have payment-side amount commitment and price commitment.
  - Prove in ZK they commit to same scalar.
  - Bind transcript/tag to `productId/txRef`.
- Option 2: reveal-to-auditor fallback
  - Controlled disclosure of exact values to authorized auditor (non-default).
  - Keep as dispute/regulatory fallback path.

## B4) Integration points
1. Payment commitment source
   - Ensure payer side can produce or expose commitment to transferred amount.
2. Equality proof generator
   - Extend ZKP module (WASM/backend) with equality relation circuit/protocol.
3. VC payload extension
   - Add `paymentEqualityProof` object:
     - commitment refs
     - proof bytes
     - binding context (`productId`, `txRef`, etc.)
4. Auditor verifier path
   - Add verification endpoint/utility for equality proof.

## B5) Acceptance criteria
- Auditor verification succeeds only when paid amount equals committed price.
- Fails if proof replayed with different `productId/txRef`.
- No exact amount disclosure in default audit mode.

---

## Execution Plan (Phased)

## Phase 0: Spec Freeze
- Finalize canonical statement formats:
  - Buyer opening payload schema.
  - Auditor equality proof schema + binding fields.
- Decide deterministic vs encrypted opening as default.

## Phase 1: Buyer Exact-Value (Low Risk, Fast)
- Implement A-stream utility + UI + tests.
- Deliver first, since independent of Railgun internals.

## Phase 2: Equality Proof Research Spike
- Build minimal PoC proving equality of two commitments with binding tag.
- Benchmark proof size/time on target hardware.
- Decide whether to keep Bulletproof relation or alternative proving strategy.

## Phase 3: Railgun Binding Integration
- Integrate payment-side witness/commitment extraction.
- Generate bound equality proof at payment/finalization step.
- Store proof reference in VC.

## Phase 4: Auditor End-to-End Verification
- Implement verifier UI/API checks.
- Add negative tests (swap/replay/mismatch).
- Add docs + operator runbook.

## Phase 5: Hardening + Rollout
- Run shadow mode against existing backend path.
- Gate on parity and performance thresholds.
- Keep disclosure fallback for disputes.

---

## Testing Plan

## Unit tests
- Commitment opening with:
  - valid value/opening
  - wrong value
  - wrong blinding

## Integration tests
- Full buyer flow: payment -> verify exact opening.
- Full auditor flow: VC + equality proof -> pass/fail cases.

## Security tests
- Replay proof with modified `productId` / `txRef` -> must fail.
- Swap proof between products -> must fail.
- Tamper commitment or proof bytes -> must fail.

## Performance tests
- Measure generation/verification time distributions.
- Ensure UI remains responsive (worker path).

---

## Risks and Mitigations
- Risk: Railgun witness extraction complexity.
  - Mitigation: isolate with a PoC first (Phase 2).
- Risk: Proof generation latency on browser devices.
  - Mitigation: worker execution + benchmark-based thresholds.
- Risk: Schema drift across VC versions.
  - Mitigation: explicit versioned proof objects and parsers.
- Risk: accidental disclosure of exact price.
  - Mitigation: privacy-by-default UX and explicit disclosure modes only.

---

## Decision Gates
- Gate G1 (after Phase 1): buyer opening feature stable and tested.
- Gate G2 (after Phase 2): equality proof PoC meets security + performance baseline.
- Gate G3 (after Phase 4): auditor E2E tests pass with replay/swap resistance.

---

## References (Research Inputs)
- Bulletproofs paper (general arithmetic proofs): https://eprint.iacr.org/2017/1066
- Railgun developer docs (private transaction model): https://docs.railgun.org/
- Existing repository docs:
  - `docs/current/02-railgun-integration.md`
  - `docs/current/03-auditor-verification.md`
  - `docs/current/04-did-signing-and-verification-standards.md`

---

## Recommended Next Action
Start with **Phase 1 (Buyer exact-value opening)** immediately (low complexity, high value), then run **Phase 2 PoC** for auditor equality proof before committing to full integration scope.

