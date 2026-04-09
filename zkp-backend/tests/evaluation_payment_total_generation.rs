//! Fiat-Shamir vs Bulletproof comparison for the shared statement:
//! `payment = total`
//!
//! This test measures proof generation time for both proof families using the
//! same committed inputs and the same binding context.

use bulletproof_demo::zk::bp_payment_total_proof::{prove_payment_total_equality, prove_payment_total_equality_raw};
use bulletproof_demo::zk::equality_proof::prove_equality;
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
    fn compare_payment_total_generation_time() {
        println!("\n🧪 Fiat-Shamir vs Bulletproof: payment = total proof generation\n");

        const RUNS: usize = 100;
        let (c_total, c_pay, total_value, payment_value, r_total, r_pay, context) =
            build_shared_fixture();

        let _ = prove_equality(c_total, c_pay, r_total, r_pay, &context).unwrap();
        let _ = prove_payment_total_equality(
            c_total,
            c_pay,
            total_value,
            payment_value,
            r_total,
            r_pay,
            &context,
        )
        .unwrap();

        let mut fs_times = Vec::with_capacity(RUNS);
        let mut bp_times = Vec::with_capacity(RUNS);

        for i in 0..RUNS {
            let fs_start = Instant::now();
            let fs_proof = prove_equality(c_total, c_pay, r_total, r_pay, &context)
                .expect("Fiat-Shamir proof generation should succeed");
            fs_times.push(fs_start.elapsed().as_nanos() as f64 / 1_000_000.0);

            let bp_start = Instant::now();
            let bp_proof = prove_payment_total_equality_raw(
                c_total,
                c_pay,
                total_value,
                payment_value,
                r_total,
                r_pay,
                &context,
            )
            .expect("Bulletproof proof generation should succeed");
            bp_times.push(bp_start.elapsed().as_nanos() as f64 / 1_000_000.0);

            assert_eq!(fs_proof.r_announcement.len(), 32);
            assert!(!bp_proof.is_empty());

            if (i + 1) % 10 == 0 {
                print!(".");
                use std::io::Write;
                std::io::stdout().flush().unwrap();
            }
        }
        println!("\n");

        let fs_stats = calculate_stats(&fs_times);
        let bp_stats = calculate_stats(&bp_times);

        println!("=== Generation time statistics ({} runs) ===\n", RUNS);
        println!("Fiat-Shamir sigma proof:");
        println!("  Median: {:.3} ms", fs_stats.median);
        println!("  IQR: {:.3} ms (Q1: {:.3}, Q3: {:.3})", fs_stats.iqr, fs_stats.q1, fs_stats.q3);
        println!("  Min: {:.3} ms", fs_stats.min);
        println!("  Max: {:.3} ms", fs_stats.max);
        println!("  Mean: {:.3} ms", fs_stats.mean);
        println!("  Std Dev: {:.3} ms\n", fs_stats.std_dev);

        println!("Bulletproof equality proof:");
        println!("  Median: {:.3} ms", bp_stats.median);
        println!("  IQR: {:.3} ms (Q1: {:.3}, Q3: {:.3})", bp_stats.iqr, bp_stats.q1, bp_stats.q3);
        println!("  Min: {:.3} ms", bp_stats.min);
        println!("  Max: {:.3} ms", bp_stats.max);
        println!("  Mean: {:.3} ms", bp_stats.mean);
        println!("  Std Dev: {:.3} ms\n", bp_stats.std_dev);

        println!("=== Summary ===");
        println!(
            "Generation median: Fiat-Shamir = {:.3} ms, Bulletproof = {:.3} ms",
            fs_stats.median, bp_stats.median
        );
        println!(
            "Generation mean:   Fiat-Shamir = {:.3} ms, Bulletproof = {:.3} ms",
            fs_stats.mean, bp_stats.mean
        );

        assert!(fs_stats.median > 0.0);
        assert!(bp_stats.median > 0.0);
    }
}
