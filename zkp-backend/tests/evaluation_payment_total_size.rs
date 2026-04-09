//! Fiat-Shamir vs Bulletproof comparison for proof size on the shared statement:
//! `payment = total`

use bulletproof_demo::zk::bp_payment_total_proof::prove_payment_total_equality;
use bulletproof_demo::zk::equality_proof::prove_equality;
use bulletproofs::PedersenGens;
use curve25519_dalek_ng::scalar::Scalar;

fn build_shared_fixture() -> (
    curve25519_dalek_ng::ristretto::CompressedRistretto,
    curve25519_dalek_ng::ristretto::CompressedRistretto,
    Scalar,
    Scalar,
    Scalar,
    Scalar,
    [u8; 32],
) {
    let pc_gens = PedersenGens::default();
    let total_value = Scalar::from(400_000_000_000_000u64);
    let payment_value = Scalar::from(400_000_000_000_000u64);
    let r_total = Scalar::from_bytes_mod_order([0x11; 32]);
    let r_pay = Scalar::from_bytes_mod_order([0x22; 32]);
    let c_total = pc_gens.commit(total_value, r_total).compress();
    let c_pay = pc_gens.commit(payment_value, r_pay).compress();
    let context = [0xabu8; 32];
    (c_total, c_pay, total_value, payment_value, r_total, r_pay, context)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compare_payment_total_proof_size() {
        println!("\n🧪 Fiat-Shamir vs Bulletproof: payment = total proof size\n");

        let (c_total, c_pay, total_value, payment_value, r_total, r_pay, context) =
            build_shared_fixture();

        let fs_proof = prove_equality(c_total, c_pay, r_total, r_pay, &context)
            .expect("Fiat-Shamir proof generation should succeed");
        let bp_proof = prove_payment_total_equality(
            c_total,
            c_pay,
            total_value,
            payment_value,
            r_total,
            r_pay,
            &context,
        )
        .expect("Bulletproof proof generation should succeed");

        let fs_proof_size = fs_proof.r_announcement.len() + fs_proof.s_response.len();
        let bp_proof_size = bp_proof.len();

        println!("Fiat-Shamir proof size: {} bytes", fs_proof_size);
        println!("  - R announcement: {} bytes", fs_proof.r_announcement.len());
        println!("  - s response: {} bytes", fs_proof.s_response.len());
        println!("Bulletproof proof size: {} bytes", bp_proof_size);

        println!("\n=== Summary ===");
        println!(
            "Proof size comparison: Fiat-Shamir = {} bytes, Bulletproof = {} bytes",
            fs_proof_size, bp_proof_size
        );

        assert_eq!(fs_proof_size, 64);
        assert!(bp_proof_size > 0);
    }
}
