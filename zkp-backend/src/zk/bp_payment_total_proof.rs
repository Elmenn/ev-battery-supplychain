use bulletproofs::r1cs::{ConstraintSystem, Prover, R1CSProof, Verifier};
use bulletproofs::{BulletproofGens, PedersenGens};
use curve25519_dalek_ng::ristretto::CompressedRistretto;
use curve25519_dalek_ng::scalar::Scalar;
use merlin::Transcript;

const LABEL: &[u8] = b"PaymentTotalEqualityBP-v1";

fn append_binding_context(transcript: &mut Transcript, binding_context: &[u8]) {
    transcript.append_message(b"context", binding_context);
}

/// Prove that two Pedersen commitments open to the same hidden scalar value.
///
/// This is the Bulletproof/R1CS counterpart of the existing Fiat-Shamir sigma
/// proof for the marketplace relation `payment = total`.
///
/// The prover must provide the openings for both commitments so the proof can
/// be built against the already-persisted commitment values.
pub fn prove_payment_total_equality_raw(
    expected_c_total: CompressedRistretto,
    expected_c_pay: CompressedRistretto,
    total_value: Scalar,
    payment_value: Scalar,
    r_total: Scalar,
    r_pay: Scalar,
    binding_context: &[u8],
) -> Result<Vec<u8>, String> {
    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(128, 1);

    let mut transcript = Transcript::new(LABEL);
    append_binding_context(&mut transcript, binding_context);

    let mut prover = Prover::new(&pc_gens, &mut transcript);
    let (c_total, v_total) = prover.commit(total_value, r_total);
    let (c_pay, v_pay) = prover.commit(payment_value, r_pay);

    if c_total != expected_c_total {
        return Err("provided total opening does not match c_total".to_string());
    }
    if c_pay != expected_c_pay {
        return Err("provided payment opening does not match c_pay".to_string());
    }

    // Core marketplace statement: payment = total
    prover.constrain(v_total - v_pay);

    prover
        .prove(&bp_gens)
        .map(|proof| proof.to_bytes())
        .map_err(|error| format!("bulletproof prove failed: {error}"))
}

pub fn prove_payment_total_equality(
    expected_c_total: CompressedRistretto,
    expected_c_pay: CompressedRistretto,
    total_value: Scalar,
    payment_value: Scalar,
    r_total: Scalar,
    r_pay: Scalar,
    binding_context: &[u8],
) -> Result<Vec<u8>, String> {
    let proof_bytes = prove_payment_total_equality_raw(
        expected_c_total,
        expected_c_pay,
        total_value,
        payment_value,
        r_total,
        r_pay,
        binding_context,
    )?;

    if !verify_payment_total_equality(expected_c_total, expected_c_pay, &proof_bytes, binding_context) {
        return Err("bulletproof prove failed: generated proof does not verify".to_string());
    }

    Ok(proof_bytes)
}

pub fn verify_payment_total_equality(
    c_total: CompressedRistretto,
    c_pay: CompressedRistretto,
    proof_bytes: &[u8],
    binding_context: &[u8],
) -> bool {
    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(128, 1);

    let mut transcript = Transcript::new(LABEL);
    append_binding_context(&mut transcript, binding_context);

    let mut verifier = Verifier::new(&mut transcript);
    let v_total = verifier.commit(c_total);
    let v_pay = verifier.commit(c_pay);
    verifier.constrain(v_total - v_pay);

    let proof = match R1CSProof::from_bytes(proof_bytes) {
        Ok(proof) => proof,
        Err(_) => return false,
    };

    verifier.verify(&proof, &pc_gens, &bp_gens).is_ok()
}

pub fn verify_payment_total_equality_with_proof(
    c_total: CompressedRistretto,
    c_pay: CompressedRistretto,
    proof: &R1CSProof,
    binding_context: &[u8],
) -> bool {
    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(128, 1);

    let mut transcript = Transcript::new(LABEL);
    append_binding_context(&mut transcript, binding_context);

    let mut verifier = Verifier::new(&mut transcript);
    let v_total = verifier.commit(c_total);
    let v_pay = verifier.commit(c_pay);
    verifier.constrain(v_total - v_pay);

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
    fn valid_payment_total_bulletproof_verifies() {
        let context = [0x11u8; 32];
        let (c_total, total_value, r_total) = commitment(60, 0x22);
        let (c_pay, payment_value, r_pay) = commitment(60, 0x33);

        let proof = prove_payment_total_equality(
            c_total,
            c_pay,
            total_value,
            payment_value,
            r_total,
            r_pay,
            &context,
        )
        .expect("proof generation should succeed");

        assert!(verify_payment_total_equality(c_total, c_pay, &proof, &context));
    }

    #[test]
    fn wrong_context_fails_verification() {
        let proof_context = [0x44u8; 32];
        let verify_context = [0x55u8; 32];
        let (c_total, total_value, r_total) = commitment(60, 0x66);
        let (c_pay, payment_value, r_pay) = commitment(60, 0x77);

        let proof = prove_payment_total_equality(
            c_total,
            c_pay,
            total_value,
            payment_value,
            r_total,
            r_pay,
            &proof_context,
        )
        .expect("proof generation should succeed");

        assert!(!verify_payment_total_equality(
            c_total,
            c_pay,
            &proof,
            &verify_context,
        ));
    }

    #[test]
    fn mismatched_commitment_is_rejected() {
        let context = [0x88u8; 32];
        let (c_total, total_value, r_total) = commitment(60, 0x99);
        let (c_pay, payment_value, r_pay) = commitment(60, 0xaau8);
        let (c_wrong, _, _) = commitment(61, 0xbbu8);

        let error = prove_payment_total_equality(
            c_total,
            c_wrong,
            total_value,
            payment_value,
            r_total,
            r_pay,
            &context,
        )
        .expect_err("proof generation should reject a mismatched opening");

        assert!(error.contains("does not match"));
        assert!(!verify_payment_total_equality(c_total, c_pay, b"bad-proof", &context));
    }

    #[test]
    fn unequal_values_fail_proof_generation() {
        let context = [0xccu8; 32];
        let (c_total, total_value, r_total) = commitment(60, 0xddu8);
        let (c_pay, payment_value, r_pay) = commitment(61, 0xeeu8);

        let error = prove_payment_total_equality(
            c_total,
            c_pay,
            total_value,
            payment_value,
            r_total,
            r_pay,
            &context,
        )
        .expect_err("proof generation should fail when payment != total");

        assert!(error.contains("prove failed"));
    }
}
