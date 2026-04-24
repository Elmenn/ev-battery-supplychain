use bulletproofs::r1cs::{ConstraintSystem, Prover, R1CSProof, Verifier};
use bulletproofs::{BulletproofGens, PedersenGens};
use curve25519_dalek_ng::ristretto::CompressedRistretto;
use curve25519_dalek_ng::scalar::Scalar;
use merlin::Transcript;

const LABEL: &[u8] = b"PrivatePriceQuantityTotalBP-v1";

fn append_binding_context(transcript: &mut Transcript, binding_context: &[u8]) {
    transcript.append_message(b"context_hash", binding_context);
}

pub fn prove_private_price_quantity_total_bulletproof_raw(
    expected_c_price: CompressedRistretto,
    expected_c_quantity: CompressedRistretto,
    expected_c_total: CompressedRistretto,
    price_value: Scalar,
    quantity_value: Scalar,
    total_value: Scalar,
    r_price: Scalar,
    r_quantity: Scalar,
    r_total: Scalar,
    binding_context: &[u8],
) -> Result<Vec<u8>, String> {
    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(256, 1);

    let mut transcript = Transcript::new(LABEL);
    append_binding_context(&mut transcript, binding_context);

    let mut prover = Prover::new(&pc_gens, &mut transcript);
    let (c_price, v_price) = prover.commit(price_value, r_price);
    let (c_quantity, v_quantity) = prover.commit(quantity_value, r_quantity);
    let (c_total, v_total) = prover.commit(total_value, r_total);

    if c_price != expected_c_price {
        return Err("provided price opening does not match c_price".to_string());
    }
    if c_quantity != expected_c_quantity {
        return Err("provided quantity opening does not match c_quantity".to_string());
    }
    if c_total != expected_c_total {
        return Err("provided total opening does not match c_total".to_string());
    }

    let (_, _, v_product) = prover.multiply(v_price.into(), v_quantity.into());
    prover.constrain(v_product - v_total);

    prover
        .prove(&bp_gens)
        .map(|proof| proof.to_bytes())
        .map_err(|error| format!("bulletproof prove failed: {error}"))
}

pub fn prove_private_price_quantity_total_bulletproof(
    expected_c_price: CompressedRistretto,
    expected_c_quantity: CompressedRistretto,
    expected_c_total: CompressedRistretto,
    price_value: Scalar,
    quantity_value: Scalar,
    total_value: Scalar,
    r_price: Scalar,
    r_quantity: Scalar,
    r_total: Scalar,
    binding_context: &[u8],
) -> Result<Vec<u8>, String> {
    let proof_bytes = prove_private_price_quantity_total_bulletproof_raw(
        expected_c_price,
        expected_c_quantity,
        expected_c_total,
        price_value,
        quantity_value,
        total_value,
        r_price,
        r_quantity,
        r_total,
        binding_context,
    )?;

    if !verify_private_price_quantity_total_bulletproof(
        expected_c_price,
        expected_c_quantity,
        expected_c_total,
        &proof_bytes,
        binding_context,
    ) {
        return Err("bulletproof prove failed: generated proof does not verify".to_string());
    }

    Ok(proof_bytes)
}

pub fn verify_private_price_quantity_total_bulletproof(
    c_price: CompressedRistretto,
    c_quantity: CompressedRistretto,
    c_total: CompressedRistretto,
    proof_bytes: &[u8],
    binding_context: &[u8],
) -> bool {
    let proof = match R1CSProof::from_bytes(proof_bytes) {
        Ok(proof) => proof,
        Err(_) => return false,
    };

    verify_private_price_quantity_total_bulletproof_with_proof(
        c_price,
        c_quantity,
        c_total,
        &proof,
        binding_context,
    )
}

pub fn verify_private_price_quantity_total_bulletproof_with_proof(
    c_price: CompressedRistretto,
    c_quantity: CompressedRistretto,
    c_total: CompressedRistretto,
    proof: &R1CSProof,
    binding_context: &[u8],
) -> bool {
    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(256, 1);

    let mut transcript = Transcript::new(LABEL);
    append_binding_context(&mut transcript, binding_context);

    let mut verifier = Verifier::new(&mut transcript);
    let v_price = verifier.commit(c_price);
    let v_quantity = verifier.commit(c_quantity);
    let v_total = verifier.commit(c_total);

    let (_, _, v_product) = verifier.multiply(v_price.into(), v_quantity.into());
    verifier.constrain(v_product - v_total);

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
    fn valid_private_price_quantity_total_bulletproof_verifies() {
        let context = [0x11u8; 32];
        let (c_price, price_value, r_price) = commitment(17, 0x22);
        let (c_quantity, quantity_value, r_quantity) = commitment(9, 0x33);
        let (c_total, total_value, r_total) = commitment(153, 0x44);

        let proof = prove_private_price_quantity_total_bulletproof(
            c_price,
            c_quantity,
            c_total,
            price_value,
            quantity_value,
            total_value,
            r_price,
            r_quantity,
            r_total,
            &context,
        )
        .expect("proof generation should succeed");

        assert!(verify_private_price_quantity_total_bulletproof(
            c_price,
            c_quantity,
            c_total,
            &proof,
            &context,
        ));
    }

    #[test]
    fn wrong_context_fails_verification() {
        let proof_context = [0x55u8; 32];
        let verify_context = [0x66u8; 32];
        let (c_price, price_value, r_price) = commitment(17, 0x77);
        let (c_quantity, quantity_value, r_quantity) = commitment(9, 0x88);
        let (c_total, total_value, r_total) = commitment(153, 0x99);

        let proof = prove_private_price_quantity_total_bulletproof(
            c_price,
            c_quantity,
            c_total,
            price_value,
            quantity_value,
            total_value,
            r_price,
            r_quantity,
            r_total,
            &proof_context,
        )
        .expect("proof generation should succeed");

        assert!(!verify_private_price_quantity_total_bulletproof(
            c_price,
            c_quantity,
            c_total,
            &proof,
            &verify_context,
        ));
    }

    #[test]
    fn wrong_commitment_is_rejected() {
        let context = [0xaau8; 32];
        let (c_price, price_value, r_price) = commitment(17, 0xbb);
        let (c_quantity, quantity_value, r_quantity) = commitment(9, 0xcc);
        let (c_total, total_value, r_total) = commitment(153, 0xdd);
        let (c_wrong, _, _) = commitment(18, 0xee);

        let error = prove_private_price_quantity_total_bulletproof(
            c_wrong,
            c_quantity,
            c_total,
            price_value,
            quantity_value,
            total_value,
            r_price,
            r_quantity,
            r_total,
            &context,
        )
        .expect_err("proof generation should reject mismatched price opening");

        assert!(error.contains("does not match"));
    }

    #[test]
    fn invalid_relation_fails_generation() {
        let context = [0xf0u8; 32];
        let (c_price, price_value, r_price) = commitment(17, 0x01);
        let (c_quantity, quantity_value, r_quantity) = commitment(9, 0x02);
        let (c_total, total_value, r_total) = commitment(154, 0x03);

        let error = prove_private_price_quantity_total_bulletproof(
            c_price,
            c_quantity,
            c_total,
            price_value,
            quantity_value,
            total_value,
            r_price,
            r_quantity,
            r_total,
            &context,
        )
        .expect_err("proof generation should fail when price * quantity != total");

        assert!(error.contains("prove failed"));
    }
}
