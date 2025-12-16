# Chapter 2: Background & Related Work - Concepts to Remove/Reduce

## Analysis Summary

After comparing Chapter 2 with Chapters 4 & 5 (what's actually implemented), the following concepts are **mentioned in Chapter 2 but NOT used** in the current implementation. These should be **removed or reduced** to avoid confusion and keep the background focused on what readers need to understand the actual system.

---

## ❌ **MUST REMOVE** (Not Implemented)

### 1. **§2.4 "Privacy-Preserving Transfers" (Entire Section, lines 110-142)**

**Status**: Entire section about Railgun/shielded pools, but Railgun is explicitly excluded from current report.

**Evidence**:
- User explicitly stated: "the report should document only the working parts of their repository, explicitly excluding the private payment functionality with Railgun for the time being"
- Ch.4 mentions Railgun as "future work" only
- Ch.5 mentions Railgun as "optional" and "excluded from git"
- Implementation structure document states: "Railgun private payment integration is mentioned where applicable but is not documented in full detail since the flow is not yet complete"

**Content to Remove**:
- Lines 110-142: Entire subsection including:
  - High-level model (shielded domain, private notes, nullifiers)
  - State objects and invariants (Merkle tree roots, balance conservation)
  - Settlement attestation (external attestation, bound proof)
  - Railgun: model and integration
  - Threat model and residual risks
  - Integration considerations

**What to Replace With**: 
- Remove entire section
- OR replace with a brief 1-paragraph "Future Work" mention at the end of §2.3 (ZKPs):
  ```latex
  \paragraph{Future work: privacy-preserving transfers.}
  A ZKP-only design (price commitments) still exposes on-chain payment amounts. Future work could integrate privacy-preserving transfer systems (e.g., Railgun shielded pools) to hide payment amounts and counterparties while preserving attestation capabilities. This is outside the scope of the current implementation, which focuses on price data confidentiality via ZKP commitments.
  ```

**Impact**: Removes ~33 lines (110-142), making Ch.2 more focused.

---

### 2. **Proof Motifs (§2.3, lines 79-83) - Specific Unused Examples**

**Status**: Two specific ZKP "motifs" mentioned but NOT used:
- "Hash-preimage knowledge" with Poseidon hash - NOT used
- "Set membership (optional)" - NOT used

**Evidence**:
- No Poseidon hash mentioned in Ch.4 or Ch.5
- No Merkle tree membership proofs mentioned in Ch.4 or Ch.5
- Implementation only uses **range proofs** (Bulletproofs), not hash-preimage or set membership

**Content to Remove**:
- Lines 79-83: The entire "Proof motifs we employ" paragraph with:
  - Hash-preimage knowledge example
  - Set membership example

**What to Replace With**: 
- Remove the paragraph entirely
- OR keep a generic mention without specific examples:
  ```latex
  \paragraph{ZKP primitives for commitments.}
  To prove properties of committed values (e.g., amounts) without revealing them, we use range proofs that show a committed value lies within a valid range (e.g., $v \in [0, 2^n)$). The prover demonstrates zero-knowledge predicates (e.g., $v \leq V_{\max}$) or range validity without revealing $v$. % cite
  ```
  (But this overlaps with "Commitments and selective disclosure" paragraph - better to just remove "Proof motifs" entirely and let the Bulletproofs addition cover range proofs)

**Impact**: Removes ~5 lines (79-83).

---

### 3. **Revocation Registry (§2.4.2, line 69-70)**

**Status**: "Optional registries record status or revocation signals" - NOT used in implementation.

**Evidence**:
- No revocation mentioned in Ch.4 or Ch.5
- No revocation functionality in contracts or VCs
- VCs are immutable once issued

**Content to Remove**:
- Line 70: "Optional registries record status or revocation signals without exposing full payloads—mirroring certificate ecosystem practice."

**What to Replace With**: 
- Keep only the anchoring part:
  ```latex
  \subsubsection{Anchoring}
  Anchoring records the hash of a VC (or index entry) on-chain, allowing a verifier to prove that a document existed at or before a given time. % cite
  ```

**Impact**: Removes ~1 line, renames subsection from "Anchoring and Revocation Registry" to just "Anchoring".

---

### 4. **Summary Gap Statement (line 159)**

**Status**: Mentions "evaluating privacy, cost, and latency for both a public-only and a privacy-enhanced design" - but this evaluation isn't happening since Railgun isn't implemented.

**Evidence**:
- No evaluation of Railgun variant in Ch.4 or Ch.5
- Report focuses on ZKP-only public payment design
- Railgun is explicitly excluded

**Content to Update**:
- Line 159: Current text says evaluation will compare "public-only and a privacy-enhanced design"
- Should focus on ZKP commitments for price confidentiality only

**What to Replace With**: 
```latex
The remaining gap is the controlled disclosure of payment-related information (specifically price data) on public ledgers. The rest of this thesis addresses that gap by integrating selective-disclosure proofs (ZKP commitments) into the credential and escrow flows, enabling price confidentiality while preserving auditability.
```

**Impact**: Updates 1-2 sentences to match actual scope.

---

## ⚠️ **SHOULD REDUCE/UPDATE** (References to Removed Content)

### 5. **ZKP Leakage Channels Paragraph (§2.3, line 102)**

**Status**: Mentions "This motivates a privacy-preserving transfer layer in \autoref{sec:private-transfers}" - but that section will be removed.

**Content to Update**:
- Line 102: Remove the cross-reference to removed section
- Update to acknowledge limitation without promising a solution in this thesis

**What to Replace With**: 
```latex
Hence a ZKP-only design (price commitments) still exposes on-chain payment amounts, which may reveal information about transaction values. Future work could address this via privacy-preserving transfer systems, but our current implementation focuses on price data confidentiality within VCs rather than payment amount privacy. % cite (linkage-analysis)
```

**Impact**: Updates 1-2 sentences.

---

## ✅ **KEEP** (Actually Used)

These concepts ARE used and should remain:
- **Generic ZKP discussion** (formal model, completeness/soundness/zero-knowledge) - USED conceptually
- **Credential binding** - USED (binding tag formula in Ch.4 & Ch.5)
- **Pedersen commitments** - USED (Ch.4 & Ch.5)
- **Range predicates** ($m \leq M_{\max}$) - USED conceptually (Bulletproofs range proofs)
- **Anchoring** (without revocation) - USED
- **All other sections** (Supply Chain, Blockchain, VCs, IPFS, EIP-712) - USED

---

## Summary of Changes

| Item | Section | Lines | Action | Impact |
|------|---------|-------|--------|--------|
| 1. Privacy-Preserving Transfers | §2.4 | 110-142 | **REMOVE** entire section | -33 lines |
| 2. Proof Motifs | §2.3 | 79-83 | **REMOVE** paragraph | -5 lines |
| 3. Revocation Registry | §2.4.2 | 70 | **REMOVE** revocation mention | -1 line |
| 4. Summary Gap Statement | §2.5 | 159 | **UPDATE** text | ~1-2 sentences |
| 5. Leakage Channels Reference | §2.3 | 102 | **UPDATE** cross-reference | ~1-2 sentences |

**Total Reduction**: ~40 lines removed, 3-4 sentences updated.

---

## Recommended Order of Operations

1. **First**: Remove §2.4 (Privacy-Preserving Transfers) - largest change
2. **Second**: Update summary (§2.5) to remove evaluation mention
3. **Third**: Remove proof motifs paragraph (§2.3)
4. **Fourth**: Update leakage channels paragraph (§2.3) to remove cross-reference
5. **Fifth**: Update anchoring subsection (§2.4.2) to remove revocation

After these removals, Chapter 2 will focus on:
- ✅ Concepts actually used (ZKP commitments, range proofs via Bulletproofs, VC chaining, anchoring)
- ✅ No references to unimplemented features (Railgun, revocation, specific proof motifs)

This keeps the background chapter aligned with the actual implementation scope.

