# Evaluation Chapter Checklist

## Current Structure (Section Numbers)
1. Evaluation Plan & Metrics
2. Privacy Analysis (price + tx-hash commitments)
3. Gas Costs & Storage
4. Bulletproofs Performance
5. Auditor Verification Workflow
6. Functional Correctness
7. Security Validation
8. Discussion (trade-offs, limitations, future work)

## Data Needed (Re-run / Fill)
- **Privacy:** final test logs showing no plaintext price/tx-hash in storage, events, or VCs; sample VC snapshot.
- **Gas:** rerun `npx truffle test test/GasMeasurement.test.js` after final contract changes; capture mean/min/max.
- **Storage footprint:** confirm slot count (15) and dynamic data notes; update if contract state changed.
- **Bulletproofs timing:** rerun `cargo run --release --bench range-proof` (include seed + commit hash).
- **Auditor timings:** remeasure UI/CLI verifier after final deployment (record on-chain read, IPFS fetch, ZKP verify).
- **Functional tests:** rerun PhaseMachine, timeout, transporter, and new tx-hash/linkable tests (`npx truffle test` suite).
- **Security tests:** rerun replay/swap, wrong binding tag, wrong commitment, and VC integrity suites.
- **Baseline data:** if referencing factory savings/naïve storage, keep the scripts/output used to derive percentages.

## Suggestions / Reminders
- Remove or replace any placeholders (commit hashes, seeds) with final wording.
- Ensure all tables referenced in text actually exist (and vice versa).
- Align terminology with implementation (e.g., `publicPriceCommitment`, `vcCid`, `DeliveryConfirmedWithCommitment`).
- Note any limitations explicitly (public flow still shows `msg.value`; backend dependency).

1. What changed in the design since last time (privacy)

“Last time we only hid the price with a Bulletproof range proof.
Since then I’ve extended the privacy layer in three directions:

First, I now also hide the purchase and delivery transaction hashes: they only appear as Pedersen commitments with their own ZK proofs, never as raw tx hashes on-chain or in the VC.

Second, I added binding tags for both price and tx-hash proofs, derived from the VC + escrow context (chainId, escrow address, product id, stage, previous VC, etc.), so proofs are cryptographically tied to one product and cannot be replayed or swapped across VCs, contracts, or chains.

Third, I cleaned up all public artefacts: in the contract storage, events, and VC JSON there is now no plaintext price and no plaintext tx hash at all—only commitments, binding tags, and metadata.

The only remaining leakage is the public msg.value in the current payment flow, which I plan to address in the future Railgun-based private payment integration.”

If you want it even shorter, you can compress it to:

“We moved from ‘only price hidden via ZKP’ to a full scheme where both prices and transaction hashes are committed and proven in zero-knowledge, with context-bound binding tags so proofs can’t be reused across products or chains, and no plaintext prices/tx IDs appear anywhere in storage, events, or VCs.”

2. How I structured the evaluation chapter

“The evaluation chapter now has a clear structure:

First, I define the evaluation plan and metrics: privacy, gas + storage, proof performance, auditor workflow, and functional correctness/security, plus the baselines (naïve on-chain VC storage, SNARKs as a theoretical comparison, and full contract deployment vs. minimal proxies).

Then I present results in four blocks:

Privacy analysis: show that no plaintext price/tx hash appears in any artefact, and that all valid price and tx-hash proofs verify while corrupted ones are rejected (including replay/swap/cross-chain tests).

Gas and storage: measure gas for the core flows and compare anchors-only vs. naïve ‘full VC on-chain’, showing about 90%+ gas savings and very small on-chain storage per product.

Proof performance: measure Bulletproof proof size and generation/verification times, and briefly position them against Groth16 (only theoretically) to justify the ‘no trusted setup’ choice.

Auditor + correctness: measure end-to-end auditor verification time and scalability with longer provenance chains, and map the test suites to state-machine correctness, invariants, and access control.

Finally, there’s a discussion section that ties the numbers back to the design trade-offs (deterministic blinding, off-chain verification, Bulletproofs vs SNARKs) and explicitly lists limitations and future work.”

You can close with:

“I’d like your feedback mainly on whether this scope of evaluation is appropriate for the thesis level, and if there are any additional metrics or comparisons you think I should add or simplify before I freeze the chapter.”


