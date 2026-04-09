//! Core-only verification comparison for `payment = total`.
//!
//! This benchmark removes Bulletproof proof deserialization from the timed
//! region so we can compare verifier-core work more directly.

use bulletproof_demo::zk::bp_payment_total_proof::{
    prove_payment_total_equality, verify_payment_total_equality_with_proof,
};
use bulletproof_demo::zk::equality_proof::{prove_equality, verify_equality, EqualityProof};
use bulletproofs::r1cs::R1CSProof;
use bulletproofs::PedersenGens;
use curve25519_dalek_ng::ristretto::CompressedRistretto;
use curve25519_dalek_ng::scalar::Scalar;
use std::time::Instant;

struct Stats {
    median: f64,
    q1: f64,
    q3: f64,
    iqr: f64,
    mean: f64,
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
    let mean = times.iter().sum::<f64>() / n as f64;
    Stats { median, q1, q3, iqr, mean }
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

#[test]
fn compare_payment_total_verification_core_time() {
    println!("\n🧪 Core-only verification: payment = total\n");

    const RUNS: usize = 100;
    let (c_total, c_pay, total_value, payment_value, r_total, r_pay, context) = build_shared_fixture();

    let fs_proof = prove_equality(c_total, c_pay, r_total, r_pay, &context).unwrap();
    let bp_proof_bytes = prove_payment_total_equality(
        c_total,
        c_pay,
        total_value,
        payment_value,
        r_total,
        r_pay,
        &context,
    )
    .unwrap();
    let bp_proof = R1CSProof::from_bytes(&bp_proof_bytes).unwrap();

    assert!(verify_equality(c_total, c_pay, &fs_proof, &context));
    assert!(verify_payment_total_equality_with_proof(c_total, c_pay, &bp_proof, &context));

    let fs_proof_copy = EqualityProof {
        r_announcement: fs_proof.r_announcement,
        s_response: fs_proof.s_response,
    };

    let mut fs_times = Vec::with_capacity(RUNS);
    let mut bp_times = Vec::with_capacity(RUNS);

    for i in 0..RUNS {
        let fs_start = Instant::now();
        let fs_verified = verify_equality(c_total, c_pay, &fs_proof_copy, &context);
        fs_times.push(fs_start.elapsed().as_nanos() as f64 / 1_000_000.0);

        let bp_start = Instant::now();
        let bp_verified = verify_payment_total_equality_with_proof(c_total, c_pay, &bp_proof, &context);
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

    let fs = calculate_stats(&fs_times);
    let bp = calculate_stats(&bp_times);

    println!("Fiat-Shamir median: {:.3} ms", fs.median);
    println!("Bulletproof median (pre-parsed proof): {:.3} ms", bp.median);
    println!("Fiat-Shamir mean: {:.3} ms", fs.mean);
    println!("Bulletproof mean (pre-parsed proof): {:.3} ms", bp.mean);
    println!("Fiat-Shamir IQR: {:.3} ms (Q1 {:.3}, Q3 {:.3})", fs.iqr, fs.q1, fs.q3);
    println!("Bulletproof IQR: {:.3} ms (Q1 {:.3}, Q3 {:.3})", bp.iqr, bp.q1, bp.q3);
}
