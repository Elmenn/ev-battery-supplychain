//! Chaum-Pedersen DLEQ equality proof.
//!
//! Proves that C_price and C_pay commit to the same scalar v,
//! i.e. D = C_price - C_pay = delta_r * B_blinding  where delta_r = r_price - r_pay.
//!
//! Transcript order (MUST match between prove and verify):
//!   context -> C_price -> C_pay -> R -> challenge

use bulletproofs::PedersenGens;
use curve25519_dalek_ng::{
    ristretto::CompressedRistretto,
    scalar::Scalar,
};
use merlin::Transcript;
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EqualityProof {
    /// Compressed Ristretto point R = k * B_blinding (32 bytes hex-encoded by callers)
    pub r_announcement: [u8; 32],
    /// Scalar s = k + c * delta_r (32 bytes)
    pub s_response: [u8; 32],
}

/// Generate a Schnorr sigma equality proof.
///
/// # Arguments
/// - `c_price` — Pedersen commitment to the price (seller-generated)
/// - `c_pay`   — Pedersen commitment to the payment amount (buyer-generated)
/// - `r_price` — blinding factor used in c_price
/// - `r_pay`   — blinding factor used in c_pay
/// - `binding_context` — deterministic JSON bytes binding the proof to this transaction
///
/// # Returns
/// `Ok(EqualityProof)` on success; `Err(String)` if point decompression fails.
pub fn prove_equality(
    c_price: CompressedRistretto,
    c_pay: CompressedRistretto,
    r_price: Scalar,
    r_pay: Scalar,
    binding_context: &[u8],
) -> Result<EqualityProof, String> {
    let pc_gens = PedersenGens::default();
    let delta_r = r_price - r_pay;

    let mut transcript = Transcript::new(b"EqualityProof-v1");
    transcript.append_message(b"context", binding_context);
    transcript.append_message(b"C_price", c_price.as_bytes());
    transcript.append_message(b"C_pay", c_pay.as_bytes());

    let k = Scalar::random(&mut OsRng);
    let r_point = &k * &pc_gens.B_blinding;
    let r_compressed = r_point.compress();

    transcript.append_message(b"R", r_compressed.as_bytes());

    let mut c_bytes = [0u8; 64];
    transcript.challenge_bytes(b"challenge", &mut c_bytes);
    let c = Scalar::from_bytes_mod_order_wide(&c_bytes);

    let s = k + c * delta_r;

    Ok(EqualityProof {
        r_announcement: r_compressed.to_bytes(),
        s_response: s.to_bytes(),
    })
}

/// Verify a Schnorr sigma equality proof.
///
/// Returns `true` iff the proof is valid: s * B_blinding == R + c * D
pub fn verify_equality(
    c_price: CompressedRistretto,
    c_pay: CompressedRistretto,
    proof: &EqualityProof,
    binding_context: &[u8],
) -> bool {
    let pc_gens = PedersenGens::default();

    let mut transcript = Transcript::new(b"EqualityProof-v1");
    transcript.append_message(b"context", binding_context);
    transcript.append_message(b"C_price", c_price.as_bytes());
    transcript.append_message(b"C_pay", c_pay.as_bytes());
    transcript.append_message(b"R", &proof.r_announcement);

    let mut c_bytes = [0u8; 64];
    transcript.challenge_bytes(b"challenge", &mut c_bytes);
    let c = Scalar::from_bytes_mod_order_wide(&c_bytes);

    let r_point = match CompressedRistretto(proof.r_announcement).decompress() {
        Some(p) => p,
        None => return false,
    };
    let s = match Scalar::from_canonical_bytes(proof.s_response) {
        Some(sc) => sc,
        None => return false,
    };

    // D = C_price - C_pay
    let cp = match c_price.decompress() {
        Some(p) => p,
        None => return false,
    };
    let cpay = match c_pay.decompress() {
        Some(p) => p,
        None => return false,
    };
    let d = cp - cpay;

    // Check: s * B_blinding == R + c * D
    let lhs = &s * &pc_gens.B_blinding;
    let rhs = r_point + &c * d;
    lhs.compress() == rhs.compress()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn commitment(value: u64, blinding_byte: u8) -> (CompressedRistretto, Scalar) {
        let pc_gens = PedersenGens::default();
        let blinding = Scalar::from_bytes_mod_order([blinding_byte; 32]);
        let commitment = pc_gens.commit(Scalar::from(value), blinding);
        (commitment.compress(), blinding)
    }

    #[test]
    fn valid_equality_proof_verifies() {
        let context_hash = [0x11u8; 32];
        let (c_price, r_price) = commitment(42, 0x22);
        let (c_pay, r_pay) = commitment(42, 0x33);

        let proof = prove_equality(c_price, c_pay, r_price, r_pay, &context_hash)
            .expect("proof generation should succeed");

        assert!(verify_equality(c_price, c_pay, &proof, &context_hash));
    }

    #[test]
    fn wrong_context_hash_fails() {
        let proof_context = [0x44u8; 32];
        let verify_context = [0x55u8; 32];
        let (c_price, r_price) = commitment(42, 0x66);
        let (c_pay, r_pay) = commitment(42, 0x77);

        let proof = prove_equality(c_price, c_pay, r_price, r_pay, &proof_context)
            .expect("proof generation should succeed");

        assert!(!verify_equality(c_price, c_pay, &proof, &verify_context));
    }

    #[test]
    fn mismatched_commitment_fails() {
        let context_hash = [0x88u8; 32];
        let (c_price, r_price) = commitment(42, 0x99);
        let (c_pay, r_pay) = commitment(42, 0xaau8);
        let (c_other, _) = commitment(41, 0xbbu8);

        let proof = prove_equality(c_price, c_pay, r_price, r_pay, &context_hash)
            .expect("proof generation should succeed");

        assert!(!verify_equality(c_price, c_other, &proof, &context_hash));
    }
}
