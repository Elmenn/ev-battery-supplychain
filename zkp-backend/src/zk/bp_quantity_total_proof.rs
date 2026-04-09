use bulletproofs::r1cs::{ConstraintSystem, Prover, R1CSProof, Verifier};
use bulletproofs::{BulletproofGens, PedersenGens};
use curve25519_dalek_ng::ristretto::CompressedRistretto;
use curve25519_dalek_ng::scalar::Scalar;
use merlin::Transcript;

const LABEL: &[u8] = b"QuantityTotalBP-v1";

fn append_binding_context(transcript: &mut Transcript, unit_price: Scalar, binding_context: &[u8]) {
    transcript.append_message(b"context_hash", binding_context);
    transcript.append_message(b"unit_price", unit_price.as_bytes());
}

pub fn prove_quantity_total_bulletproof_raw(
    expected_c_quantity: CompressedRistretto,
    expected_c_total: CompressedRistretto,
    quantity_value: Scalar,
    total_value: Scalar,
    unit_price: Scalar,
    r_quantity: Scalar,
    r_total: Scalar,
    binding_context: &[u8],
) -> Result<Vec<u8>, String> {
    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(128, 1);

    let mut transcript = Transcript::new(LABEL);
    append_binding_context(&mut transcript, unit_price, binding_context);

    let mut prover = Prover::new(&pc_gens, &mut transcript);
    let (c_quantity, v_quantity) = prover.commit(quantity_value, r_quantity);
    let (c_total, v_total) = prover.commit(total_value, r_total);

    if c_quantity != expected_c_quantity {
        return Err("provided quantity opening does not match c_quantity".to_string());
    }
    if c_total != expected_c_total {
        return Err("provided total opening does not match c_total".to_string());
    }

    prover.constrain(v_total - (unit_price * v_quantity));

    prover
        .prove(&bp_gens)
        .map(|proof| proof.to_bytes())
        .map_err(|error| format!("bulletproof prove failed: {error}"))
}

pub fn prove_quantity_total_bulletproof(
    expected_c_quantity: CompressedRistretto,
    expected_c_total: CompressedRistretto,
    quantity_value: Scalar,
    total_value: Scalar,
    unit_price: Scalar,
    r_quantity: Scalar,
    r_total: Scalar,
    binding_context: &[u8],
) -> Result<Vec<u8>, String> {
    let proof_bytes = prove_quantity_total_bulletproof_raw(
        expected_c_quantity,
        expected_c_total,
        quantity_value,
        total_value,
        unit_price,
        r_quantity,
        r_total,
        binding_context,
    )?;

    if !verify_quantity_total_bulletproof(
        expected_c_quantity,
        expected_c_total,
        unit_price,
        &proof_bytes,
        binding_context,
    ) {
        return Err("bulletproof prove failed: generated proof does not verify".to_string());
    }

    Ok(proof_bytes)
}

pub fn verify_quantity_total_bulletproof(
    c_quantity: CompressedRistretto,
    c_total: CompressedRistretto,
    unit_price: Scalar,
    proof_bytes: &[u8],
    binding_context: &[u8],
) -> bool {
    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(128, 1);

    let mut transcript = Transcript::new(LABEL);
    append_binding_context(&mut transcript, unit_price, binding_context);

    let mut verifier = Verifier::new(&mut transcript);
    let v_quantity = verifier.commit(c_quantity);
    let v_total = verifier.commit(c_total);
    verifier.constrain(v_total - (unit_price * v_quantity));

    let proof = match R1CSProof::from_bytes(proof_bytes) {
        Ok(proof) => proof,
        Err(_) => return false,
    };

    verifier.verify(&proof, &pc_gens, &bp_gens).is_ok()
}

pub fn verify_quantity_total_bulletproof_with_proof(
    c_quantity: CompressedRistretto,
    c_total: CompressedRistretto,
    unit_price: Scalar,
    proof: &R1CSProof,
    binding_context: &[u8],
) -> bool {
    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(128, 1);

    let mut transcript = Transcript::new(LABEL);
    append_binding_context(&mut transcript, unit_price, binding_context);

    let mut verifier = Verifier::new(&mut transcript);
    let v_quantity = verifier.commit(c_quantity);
    let v_total = verifier.commit(c_total);
    verifier.constrain(v_total - (unit_price * v_quantity));

    verifier.verify(proof, &pc_gens, &bp_gens).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn commitment(value: u64, blinding_byte: u8) -> (CompressedRistretto, Scalar, Scalar) {
        let pc_gens = PedersenGens::default();
        let blind = Scalar::from_bytes_mod_order([blinding_byte; 32]);
        let value_scalar = Scalar::from(value);
        let commitment = pc_gens.commit(value_scalar, blind).compress();
        (commitment, value_scalar, blind)
    }

    #[test]
    fn valid_quantity_total_bulletproof_verifies() {
        let context = [0x11u8; 32];
        let unit_price = Scalar::from(17u64);
        let (c_quantity, quantity_value, r_quantity) = commitment(9, 0x22);
        let (c_total, total_value, r_total) = commitment(153, 0x33);

        let proof = prove_quantity_total_bulletproof(
            c_quantity,
            c_total,
            quantity_value,
            total_value,
            unit_price,
            r_quantity,
            r_total,
            &context,
        )
        .expect("proof generation should succeed");

        assert!(verify_quantity_total_bulletproof(
            c_quantity,
            c_total,
            unit_price,
            &proof,
            &context
        ));
    }

    #[test]
    fn wrong_context_fails_verification() {
        let proof_context = [0x44u8; 32];
        let verify_context = [0x55u8; 32];
        let unit_price = Scalar::from(17u64);
        let (c_quantity, quantity_value, r_quantity) = commitment(9, 0x66);
        let (c_total, total_value, r_total) = commitment(153, 0x77);

        let proof = prove_quantity_total_bulletproof(
            c_quantity,
            c_total,
            quantity_value,
            total_value,
            unit_price,
            r_quantity,
            r_total,
            &proof_context,
        )
        .expect("proof generation should succeed");

        assert!(!verify_quantity_total_bulletproof(
            c_quantity,
            c_total,
            unit_price,
            &proof,
            &verify_context
        ));
    }

    #[test]
    fn wrong_unit_price_fails_verification() {
        let context = [0x88u8; 32];
        let unit_price = Scalar::from(17u64);
        let wrong_unit_price = Scalar::from(18u64);
        let (c_quantity, quantity_value, r_quantity) = commitment(9, 0x99);
        let (c_total, total_value, r_total) = commitment(153, 0xaau8);

        let proof = prove_quantity_total_bulletproof(
            c_quantity,
            c_total,
            quantity_value,
            total_value,
            unit_price,
            r_quantity,
            r_total,
            &context,
        )
        .expect("proof generation should succeed");

        assert!(!verify_quantity_total_bulletproof(
            c_quantity,
            c_total,
            wrong_unit_price,
            &proof,
            &context
        ));
    }

    #[test]
    fn invalid_relation_fails_generation() {
        let context = [0xbbu8; 32];
        let unit_price = Scalar::from(17u64);
        let (c_quantity, quantity_value, r_quantity) = commitment(9, 0xccu8);
        let (c_total, total_value, r_total) = commitment(154, 0xddu8);

        let error = prove_quantity_total_bulletproof(
            c_quantity,
            c_total,
            quantity_value,
            total_value,
            unit_price,
            r_quantity,
            r_total,
            &context,
        )
        .expect_err("proof generation should fail when total != unit_price * quantity");

        assert!(error.contains("prove failed"));
    }
}
