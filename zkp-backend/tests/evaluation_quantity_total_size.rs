//! Fiat-Shamir vs Bulletproof comparison for proof size on the shared statement:
//! `total = unitPrice * quantity`

use bulletproof_demo::zk::bp_quantity_total_proof::prove_quantity_total_bulletproof;
use bulletproof_demo::zk::quantity_total_proof::prove_quantity_total;
use bulletproofs::PedersenGens;
use curve25519_dalek_ng::scalar::Scalar;

fn build_shared_fixture() -> (
    curve25519_dalek_ng::ristretto::CompressedRistretto,
    curve25519_dalek_ng::ristretto::CompressedRistretto,
    Scalar,
    Scalar,
    Scalar,
    Scalar,
    Scalar,
    [u8; 32],
) {
    let pc_gens = PedersenGens::default();
    let unit_price = Scalar::from(200_000_000_000_000u64);
    let quantity_value = Scalar::from(2u64);
    let total_value = Scalar::from(400_000_000_000_000u64);
    let r_quantity = Scalar::from_bytes_mod_order([0x31; 32]);
    let r_total = Scalar::from_bytes_mod_order([0x41; 32]);
    let c_quantity = pc_gens.commit(quantity_value, r_quantity).compress();
    let c_total = pc_gens.commit(total_value, r_total).compress();
    let context = [0xceu8; 32];
    (
        c_quantity,
        c_total,
        quantity_value,
        total_value,
        unit_price,
        r_quantity,
        r_total,
        context,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compare_quantity_total_proof_size() {
        println!("\n🧪 Fiat-Shamir vs Bulletproof: total = unitPrice * quantity proof size\n");

        let (c_quantity, c_total, quantity_value, total_value, unit_price, r_quantity, r_total, context) =
            build_shared_fixture();

        let fs_proof = prove_quantity_total(
            c_quantity,
            c_total,
            unit_price,
            r_quantity,
            r_total,
            &context,
        )
        .expect("Fiat-Shamir proof generation should succeed");
        let bp_proof = prove_quantity_total_bulletproof(
            c_quantity,
            c_total,
            quantity_value,
            total_value,
            unit_price,
            r_quantity,
            r_total,
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
