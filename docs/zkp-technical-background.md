# Zero-Knowledge Proofs: Technical Background & Concepts

This document provides a comprehensive background on the cryptographic technologies used in our EV Battery Supply Chain DApp, including Zero-Knowledge Proofs (ZKPs), Pedersen Commitments, and Bulletproofs.

---

## Table of Contents

1. [Introduction to Zero-Knowledge Proofs](#introduction-to-zero-knowledge-proofs)
2. [Pedersen Commitments](#pedersen-commitments)
3. [Bulletproofs](#bulletproofs)
4. [Ristretto255 Curve](#ristretto255-curve)
5. [How They Work Together](#how-they-work-together)
6. [Security Properties](#security-properties)
7. [Design Decisions](#design-decisions)

---

## Introduction to Zero-Knowledge Proofs

### What is a Zero-Knowledge Proof?

A **Zero-Knowledge Proof (ZKP)** is a cryptographic protocol that allows one party (the **prover**) to prove to another party (the **verifier**) that they know a value or that a statement is true, without revealing any information about the value itself, except that the statement is true.

### Key Properties

1. **Completeness:** If the statement is true, an honest prover can convince an honest verifier.
2. **Soundness:** If the statement is false, no prover (even a dishonest one) can convince an honest verifier.
3. **Zero-Knowledge:** The verifier learns nothing about the secret value beyond what can be inferred from the statement being true.

### Real-World Analogy

Imagine you want to prove you know the combination to a safe without revealing the combination. You could:
- Open the safe in front of the verifier (reveals the combination)
- Use a ZKP: Prove you can open it without showing how

A ZKP allows you to demonstrate knowledge without revealing the knowledge itself.

### Types of ZKPs

#### Interactive vs. Non-Interactive

- **Interactive ZKPs:** Require multiple rounds of communication between prover and verifier.
- **Non-Interactive ZKPs (NIZKs):** Require only one message from prover to verifier. Bulletproofs are NIZKs.

#### Succinct vs. Non-Succinct

- **Succinct ZKPs:** Proof size and verification time are logarithmic in the statement size (e.g., SNARKs).
- **Non-Succinct ZKPs:** Proof size grows with statement complexity (e.g., Bulletproofs are linear in the number of constraints).

### Use Cases in Our System

In our EV Battery Supply Chain DApp, ZKPs are used to:
- **Prove price range:** Prove that a price is within a valid range (0 < price < 2^64) without revealing the actual price.
- **Maintain privacy:** Keep transaction amounts confidential while allowing verification.
- **Ensure integrity:** Verify that commitments are correct without revealing the underlying values.

---

## Pedersen Commitments

### What is a Pedersen Commitment?

A **Pedersen Commitment** is a cryptographic commitment scheme that allows you to commit to a value without revealing it, with the property that the commitment can be opened later to reveal the original value.

### Mathematical Definition

A Pedersen commitment is computed as:

```
C = v*G + r*H
```

Where:
- `C` is the commitment (a point on an elliptic curve)
- `v` is the value being committed to (the price in our case)
- `r` is a random blinding factor (secret)
- `G` and `H` are generator points on the curve (public)
- `*` denotes scalar multiplication on the elliptic curve
- `+` denotes point addition on the elliptic curve

### Properties

1. **Hiding:** The commitment `C` reveals no information about `v` (computationally hiding).
2. **Binding:** It is computationally infeasible to find two different pairs `(v, r)` and `(v', r')` that produce the same commitment `C`.
3. **Additive Homomorphism:** Commitments can be added: `Com(v1, r1) + Com(v2, r2) = Com(v1 + v2, r1 + r2)`.

### Why Use Pedersen Commitments?

1. **Privacy:** The committed value remains hidden until the commitment is opened.
2. **Verifiability:** Anyone can verify that a commitment was computed correctly.
3. **Non-malleability:** Once committed, the value cannot be changed without detection.
4. **Efficiency:** Commitments are small (32 bytes for Ristretto255) and fast to compute.

### In Our System

We use Pedersen commitments to:
- **Commit to prices:** Store a commitment to the product price on-chain without revealing it.
- **Enable ZKPs:** The commitment serves as the public input for range proofs.
- **Ensure integrity:** Bind the price to the product in an immutable way.

### Opening a Commitment

To open (reveal) a commitment, the prover provides:
- The original value `v`
- The blinding factor `r`

The verifier then computes `v*G + r*H` and checks if it equals the commitment `C`.

---

## Bulletproofs

### What are Bulletproofs?

**Bulletproofs** are a non-interactive zero-knowledge proof system that allows you to prove that a committed value lies within a specific range (e.g., 0 ≤ value < 2^n) without revealing the value.

### Key Features

1. **No Trusted Setup:** Unlike SNARKs, Bulletproofs don't require a trusted setup ceremony.
2. **Short Proofs:** Proof size is logarithmic in the range size (though larger than SNARKs).
3. **Fast Verification:** Verification is efficient, though slower than SNARKs.
4. **Range Proofs:** Specifically designed for proving value ranges.

### How Bulletproofs Work

#### High-Level Overview

1. **Commitment:** The prover commits to a value using a Pedersen commitment.
2. **Proof Generation:** The prover generates a proof that the committed value is in the range [0, 2^n).
3. **Verification:** The verifier checks the proof without learning the value.

#### Technical Details

Bulletproofs use:
- **Inner Product Argument:** The core of Bulletproofs, proving that an inner product relation holds.
- **Polynomial Commitment:** Committing to a polynomial that represents the value in binary.
- **Fiat-Shamir Heuristic:** Converting interactive proofs to non-interactive using a hash function.

### Range Proofs

A range proof proves that a committed value `v` satisfies:
```
0 ≤ v < 2^n
```

For our system, we use `n = 64`, meaning we prove:
```
0 ≤ price < 2^64
```

This ensures the price is a valid 64-bit unsigned integer.

### Proof Size and Performance

- **Proof Size:** ~672 bytes for a 64-bit range proof
- **Generation Time:** ~100-200ms (depends on hardware)
- **Verification Time:** ~10-50ms (depends on hardware)

### In Our System

We use Bulletproofs to:
- **Prove price validity:** Prove that the committed price is in a valid range.
- **Maintain privacy:** Keep the actual price hidden while allowing verification.
- **Enable auditability:** Allow third parties to verify price validity without learning the price.

---

## Ristretto255 Curve

### What is Ristretto255?

**Ristretto255** is a prime-order group built from the edwards25519 curve, providing a clean abstraction over the curve's cofactor issues.

### Why Ristretto255?

1. **Prime Order:** Eliminates cofactor-related security issues.
2. **Efficiency:** Fast operations on modern hardware.
3. **Standardization:** Well-studied and widely used (used by Bulletproofs).
4. **32-byte Points:** Compact representation (32 bytes for compressed points).

### Technical Details

- **Base Field:** GF(2^255 - 19)
- **Point Compression:** Points are represented as 32-byte compressed Ristretto points
- **Security Level:** ~128 bits of security

### In Our System

We use Ristretto255 because:
- **Bulletproofs Standard:** Bulletproofs are designed to work with Ristretto255.
- **Efficiency:** Fast commitment and proof operations.
- **Compactness:** Small commitment size (32 bytes) reduces on-chain storage costs.

---

## How They Work Together

### The Complete Flow

1. **Commitment Generation:**
   - Seller chooses a price `v` and a blinding factor `r`
   - Computes Pedersen commitment: `C = v*G + r*H`
   - Stores `C` on-chain (32 bytes)

2. **Proof Generation:**
   - Prover (seller or buyer) generates a Bulletproof range proof
   - Proof proves: "I know `v` and `r` such that `C = v*G + r*H` and `0 ≤ v < 2^64`"
   - Proof is included in the VC

3. **Verification:**
   - Verifier extracts commitment `C` and proof from VC
   - Verifies the Bulletproof proof
   - If valid, knows that `0 ≤ v < 2^64` without learning `v`

### Security Guarantees

1. **Privacy:** The price `v` remains hidden (computationally hiding).
2. **Integrity:** The commitment cannot be changed without detection (binding).
3. **Validity:** The proof ensures the price is in a valid range.
4. **Verifiability:** Anyone can verify the proof without trusted parties.

---

## Security Properties

### What ZKPs Protect Against

1. **Price Leakage:** The actual price is never revealed on-chain or in VCs (only the commitment).
2. **Invalid Prices:** The range proof ensures prices are valid (0 ≤ price < 2^64).
3. **Commitment Tampering:** The binding property prevents changing the committed value.
4. **Proof Forgery:** The soundness property prevents creating valid proofs for invalid values.

### What ZKPs Don't Protect Against

1. **Brute Force:** If the value space is small, an attacker could try all possible values.
   - **Mitigation:** Use large value spaces (64-bit range provides 2^64 possibilities).

2. **Timing Attacks:** Proof generation time might leak information.
   - **Mitigation:** Use constant-time algorithms (Bulletproofs implementations do this).

3. **Side-Channel Attacks:** Power consumption or other side channels might leak information.
   - **Mitigation:** Use hardened implementations and secure environments.

### Trust Assumptions

1. **Cryptographic Assumptions:**
   - Discrete logarithm problem is hard (ensures hiding and binding).
   - Hash functions are secure (for Fiat-Shamir).

2. **Implementation Trust:**
   - Bulletproofs library is correctly implemented.
   - No bugs in the ZKP backend.

3. **No Trusted Setup:**
   - Bulletproofs don't require trusted setup (unlike SNARKs).

---

## Design Decisions

### Why Pedersen Commitments?

1. **Efficiency:** Fast to compute and verify.
2. **Standard:** Well-studied and widely used.
3. **Compatibility:** Works seamlessly with Bulletproofs.

### Why Bulletproofs?

1. **No Trusted Setup:** Eliminates trust in a setup ceremony.
2. **Range Proofs:** Specifically designed for our use case.
3. **Efficiency:** Good balance between proof size and verification time.

### Why Ristretto255?

1. **Bulletproofs Standard:** Bulletproofs are designed for Ristretto255.
2. **Efficiency:** Fast operations on modern hardware.
3. **Compactness:** Small point size reduces storage costs.

### Why Deterministic Blinding?

1. **Reproducibility:** Seller and buyer can generate the same commitment.
2. **Verifiability:** Allows verification that commitments match.
3. **Simplicity:** Easier to implement and debug.

**Note:** See [Security Improvements](#security-improvements) for discussion of potential enhancements.

---

## Security Improvements

### Current Implementation

Our current implementation uses:
- **Deterministic Blinding:** `blinding = keccak256(productAddress || sellerAddress)`
- **Public Blinding:** Anyone can compute the blinding factor
- **Basic Proof Binding:** Proofs are bound to commitments, but not to specific VCs

### Potential Improvements

See the [Security Enhancements Analysis](#security-enhancements-analysis) section for detailed discussion of proposed improvements.

---

## Further Reading

1. **Zero-Knowledge Proofs:**
   - [Zero-Knowledge Proofs: An Illustrated Primer](https://www.zkproof.org/)
   - [What are zk-SNARKs?](https://z.cash/technology/zksnarks/)

2. **Pedersen Commitments:**
   - [Pedersen Commitment Scheme](https://en.wikipedia.org/wiki/Commitment_scheme#Pedersen_commitment)

3. **Bulletproofs:**
   - [Bulletproofs: Short Proofs for Confidential Transactions](https://eprint.iacr.org/2017/1066.pdf)
   - [Bulletproofs Implementation](https://github.com/dalek-cryptography/bulletproofs)

4. **Ristretto255:**
   - [The Ristretto Group](https://ristretto.group/)
   - [Ristretto255: A Prime-Order Group](https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-ristretto255-decaf448)

---

## Glossary

- **Commitment:** A cryptographic value that hides information but can be opened later.
- **Blinding Factor:** A random value used to hide the committed value.
- **Range Proof:** A ZKP that proves a value is in a specific range.
- **Non-Interactive Proof:** A proof that requires only one message from prover to verifier.
- **Hiding:** The property that a commitment reveals no information about the committed value.
- **Binding:** The property that a commitment cannot be opened to a different value.
- **Soundness:** The property that invalid statements cannot be proven.
- **Completeness:** The property that valid statements can always be proven.
- **Zero-Knowledge:** The property that the verifier learns nothing beyond the statement's truth.

