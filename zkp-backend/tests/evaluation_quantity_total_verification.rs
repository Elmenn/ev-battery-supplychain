//! Fiat-Shamir vs Bulletproof comparison for the shared statement:
//! `total = unitPrice * quantity`

use bulletproof_demo::zk::bp_quantity_total_proof::{
    prove_quantity_total_bulletproof, verify_quantity_total_bulletproof,
};
use bulletproof_demo::zk::quantity_total_proof::{
    prove_quantity_total, verify_quantity_total, QuantityTotalProof,
};
use bulletproofs::PedersenGens;
use curve25519_dalek_ng::ristretto::CompressedRistretto;
use curve25519_dalek_ng::scalar::Scalar;
use std::time::Instant;

struct Stats {
    median: f64,
    q1: f64,
    q3: f64,
    iqr: f64,
    min: f64,
    max: f64,
    mean: f64,
    std_dev: f64,
}

fn calculate_stats(times: &[f64]) -> Stats {
    let mut sorted = times.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());

    let n = sorted.len();
    let median = if n % 2 == 0 {
        (sorted[n / 2 - 1] + sorted[n / 2]) / 2.0
    } else {
        sorted[n / 2]
    };

    let q1 = sorted[n / 4];
    let q3 = sorted[(3 * n) / 4];
    let iqr = q3 - q1;
    let min = sorted[0];
    let max = sorted[n - 1];
    let mean = times.iter().sum::<f64>() / n as f64;
    let variance = times.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / n as f64;
    let std_dev = variance.sqrt();

    Stats {
        median,
        q1,
        q3,
        iqr,
        min,
        max,
        mean,
        std_dev,
    }
}

fn build_shared_fixture() -> (
    CompressedRistretto,
    CompressedRistretto,
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
    fn compare_quantity_total_verification_time() {
        println!("\n🧪 Fiat-Shamir vs Bulletproof: total = unitPrice * quantity proof verification\n");

        const RUNS: usize = 100;
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

        assert!(verify_quantity_total(c_quantity, c_total, unit_price, &fs_proof, &context));
        assert!(verify_quantity_total_bulletproof(c_quantity, c_total, unit_price, &bp_proof, &context));

        let fs_proof_copy = QuantityTotalProof {
            r_announcement: fs_proof.r_announcement,
            s_response: fs_proof.s_response,
        };

        let mut fs_times = Vec::with_capacity(RUNS);
        let mut bp_times = Vec::with_capacity(RUNS);

        for i in 0..RUNS {
            let fs_start = Instant::now();
            let fs_verified = verify_quantity_total(c_quantity, c_total, unit_price, &fs_proof_copy, &context);
            fs_times.push(fs_start.elapsed().as_nanos() as f64 / 1_000_000.0);

            let bp_start = Instant::now();
            let bp_verified =
                verify_quantity_total_bulletproof(c_quantity, c_total, unit_price, &bp_proof, &context);
            bp_times.push(bp_start.elapsed().as_nanos() as f64 / 1_000_000.0);

            assert!(fs_verified);
            assert!(bp_verified);

            if (i + 1) % 10 == 0 {
                print!(".");
                use std::io::Write;
                std::io::stdout().flush().unwrap();
            }
        }
        println!("\n");

        let fs_stats = calculate_stats(&fs_times);
        let bp_stats = calculate_stats(&bp_times);

        println!("=== Verification time statistics ({} runs) ===\n", RUNS);
        println!("Fiat-Shamir quantity-total proof:");
        println!("  Median: {:.3} ms", fs_stats.median);
        println!("  IQR: {:.3} ms (Q1: {:.3}, Q3: {:.3})", fs_stats.iqr, fs_stats.q1, fs_stats.q3);
        println!("  Min: {:.3} ms", fs_stats.min);
        println!("  Max: {:.3} ms", fs_stats.max);
        println!("  Mean: {:.3} ms", fs_stats.mean);
        println!("  Std Dev: {:.3} ms\n", fs_stats.std_dev);

        println!("Bulletproof quantity-total proof:");
        println!("  Median: {:.3} ms", bp_stats.median);
        println!("  IQR: {:.3} ms (Q1: {:.3}, Q3: {:.3})", bp_stats.iqr, bp_stats.q1, bp_stats.q3);
        println!("  Min: {:.3} ms", bp_stats.min);
        println!("  Max: {:.3} ms", bp_stats.max);
        println!("  Mean: {:.3} ms", bp_stats.mean);
        println!("  Std Dev: {:.3} ms\n", bp_stats.std_dev);

        println!("=== Summary ===");
        println!(
            "Verification median: Fiat-Shamir = {:.3} ms, Bulletproof = {:.3} ms",
            fs_stats.median, bp_stats.median
        );
        println!(
            "Verification mean:   Fiat-Shamir = {:.3} ms, Bulletproof = {:.3} ms",
            fs_stats.mean, bp_stats.mean
        );

        assert!(fs_stats.median >= 0.0);
        assert!(bp_stats.median >= 0.0);
    }
}
