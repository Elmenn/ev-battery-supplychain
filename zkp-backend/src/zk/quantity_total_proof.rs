//! Quantity-total relation proof.
//!
//! Proves that C_total commits to `unit_price * quantity` without revealing
//! either quantity or total. Given:
//!   C_quantity = quantity * B + r_quantity * B_blinding
//!   C_total    = total    * B + r_total    * B_blinding
//! and a public `unit_price`, we prove:
//!   total = unit_price * quantity
//! by showing:
//!   D = C_total - unit_price * C_quantity = delta_r * B_blinding
//! where:
//!   delta_r = r_total - unit_price * r_quantity

use bulletproofs::PedersenGens;
use curve25519_dalek_ng::{
    ristretto::CompressedRistretto,
    scalar::Scalar,
};
use merlin::Transcript;
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct QuantityTotalProof {
    pub r_announcement: [u8; 32],
    pub s_response: [u8; 32],
}

pub fn prove_quantity_total(
    c_quantity: CompressedRistretto,
    c_total: CompressedRistretto,
    unit_price: Scalar,
    r_quantity: Scalar,
    r_total: Scalar,
    context_hash: &[u8],
) -> Result<QuantityTotalProof, String> {
    let pc_gens = PedersenGens::default();
    let delta_r = r_total - (unit_price * r_quantity);

    let mut transcript = Transcript::new(b"QuantityTotalProof-v1");
    transcript.append_message(b"context_hash", context_hash);
    transcript.append_message(b"unit_price", unit_price.as_bytes());
    transcript.append_message(b"C_quantity", c_quantity.as_bytes());
    transcript.append_message(b"C_total", c_total.as_bytes());

    let k = Scalar::random(&mut OsRng);
    let r_point = &k * &pc_gens.B_blinding;
    let r_compressed = r_point.compress();

    transcript.append_message(b"R", r_compressed.as_bytes());

    let mut c_bytes = [0u8; 64];
    transcript.challenge_bytes(b"challenge", &mut c_bytes);
    let c = Scalar::from_bytes_mod_order_wide(&c_bytes);
    let s = k + c * delta_r;

    Ok(QuantityTotalProof {
        r_announcement: r_compressed.to_bytes(),
        s_response: s.to_bytes(),
    })
}

pub fn verify_quantity_total(
    c_quantity: CompressedRistretto,
    c_total: CompressedRistretto,
    unit_price: Scalar,
    proof: &QuantityTotalProof,
    context_hash: &[u8],
) -> bool {
    let pc_gens = PedersenGens::default();

    let mut transcript = Transcript::new(b"QuantityTotalProof-v1");
    transcript.append_message(b"context_hash", context_hash);
    transcript.append_message(b"unit_price", unit_price.as_bytes());
    transcript.append_message(b"C_quantity", c_quantity.as_bytes());
    transcript.append_message(b"C_total", c_total.as_bytes());
    transcript.append_message(b"R", &proof.r_announcement);

    let mut c_bytes = [0u8; 64];
    transcript.challenge_bytes(b"challenge", &mut c_bytes);
    let c = Scalar::from_bytes_mod_order_wide(&c_bytes);

    let r_point = match CompressedRistretto(proof.r_announcement).decompress() {
        Some(point) => point,
        None => return false,
    };
    let s = match Scalar::from_canonical_bytes(proof.s_response) {
        Some(scalar) => scalar,
        None => return false,
    };

    let cq = match c_quantity.decompress() {
        Some(point) => point,
        None => return false,
    };
    let ct = match c_total.decompress() {
        Some(point) => point,
        None => return false,
    };

    let d = ct - (&unit_price * &cq);
    let lhs = &s * &pc_gens.B_blinding;
    let rhs = r_point + (&c * d);
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
    fn valid_quantity_total_proof_verifies() {
        let unit_price = Scalar::from(17u64);
        let context_hash = [0x11u8; 32];
        let (c_quantity, r_quantity) = commitment(9, 0x22);
        let (c_total, r_total) = commitment(153, 0x33);

        let proof = prove_quantity_total(
            c_quantity,
            c_total,
            unit_price,
            r_quantity,
            r_total,
            &context_hash,
        )
        .expect("proof generation should succeed");

        assert!(verify_quantity_total(
            c_quantity,
            c_total,
            unit_price,
            &proof,
            &context_hash,
        ));
    }

    #[test]
    fn wrong_total_fails_verification() {
        let unit_price = Scalar::from(17u64);
        let context_hash = [0x44u8; 32];
        let (c_quantity, r_quantity) = commitment(9, 0x55);
        let (c_wrong_total, r_wrong_total) = commitment(154, 0x66);

        let proof = prove_quantity_total(
            c_quantity,
            c_wrong_total,
            unit_price,
            r_quantity,
            r_wrong_total,
            &context_hash,
        )
        .expect("proof generation should succeed");

        assert!(!verify_quantity_total(
            c_quantity,
            c_wrong_total,
            unit_price,
            &proof,
            &context_hash,
        ));
    }

    #[test]
    fn wrong_unit_price_fails_verification() {
        let unit_price = Scalar::from(17u64);
        let wrong_unit_price = Scalar::from(18u64);
        let context_hash = [0x77u8; 32];
        let (c_quantity, r_quantity) = commitment(9, 0x88);
        let (c_total, r_total) = commitment(153, 0x99);

        let proof = prove_quantity_total(
            c_quantity,
            c_total,
            unit_price,
            r_quantity,
            r_total,
            &context_hash,
        )
        .expect("proof generation should succeed");

        assert!(!verify_quantity_total(
            c_quantity,
            c_total,
            wrong_unit_price,
            &proof,
            &context_hash,
        ));
    }

    #[test]
    fn wrong_context_hash_fails_verification() {
        let unit_price = Scalar::from(17u64);
        let proof_context = [0xabu8; 32];
        let verify_context = [0xcdu8; 32];
        let (c_quantity, r_quantity) = commitment(9, 0xef);
        let (c_total, r_total) = commitment(153, 0x10);

        let proof = prove_quantity_total(
            c_quantity,
            c_total,
            unit_price,
            r_quantity,
            r_total,
            &proof_context,
        )
        .expect("proof generation should succeed");

        assert!(!verify_quantity_total(
            c_quantity,
            c_total,
            unit_price,
            &proof,
            &verify_context,
        ));
    }
}
