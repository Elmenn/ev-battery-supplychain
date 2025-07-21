use bulletproofs::r1cs::{ConstraintSystem, Prover, Verifier};
use bulletproofs::{BulletproofGens, PedersenGens};
use curve25519_dalek_ng::scalar::Scalar;
use merlin::Transcript;
use rand::rngs::OsRng;
use rand::RngCore;

pub fn prove_sum() {
    let x_val: u64 = 20;
    let y_val: u64 = 22;
    let z_val = x_val + y_val;

    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(64, 1);
    let mut rng = OsRng;

    let mut prover_transcript = Transcript::new(b"SumProof");
    let (proof, coms) = {
        let mut prover = Prover::new(&pc_gens, &mut prover_transcript);

        // Commit x
        let mut x_bytes = [0u8; 64];
        rng.fill_bytes(&mut x_bytes);
        let x_blinding = Scalar::from_bytes_mod_order_wide(&x_bytes);
        let (com_x, var_x) = prover.commit(Scalar::from(x_val), x_blinding);

        // Commit y
        let mut y_bytes = [0u8; 64];
        rng.fill_bytes(&mut y_bytes);
        let y_blinding = Scalar::from_bytes_mod_order_wide(&y_bytes);
        let (com_y, var_y) = prover.commit(Scalar::from(y_val), y_blinding);

        // Commit z
        let mut z_bytes = [0u8; 64];
        rng.fill_bytes(&mut z_bytes);
        let z_blinding = Scalar::from_bytes_mod_order_wide(&z_bytes);
        let (com_z, var_z) = prover.commit(Scalar::from(z_val), z_blinding);

        // Constrain: x + y - z == 0
        prover.constrain(var_x + var_y - var_z);

        let proof = prover.prove(&bp_gens).unwrap();
        (proof, vec![com_x, com_y, com_z])
    };

    // --- Verifier side ---
    let mut verifier_transcript = Transcript::new(b"SumProof");
    let verified = {
        let mut verifier = Verifier::new(&mut verifier_transcript);
        let var_x = verifier.commit(coms[0]);
        let var_y = verifier.commit(coms[1]);
        let var_z = verifier.commit(coms[2]);

        verifier.constrain(var_x + var_y - var_z);
        verifier.verify(&proof, &pc_gens, &bp_gens).is_ok()
    };

    println!("✅ x + y = z proof verified? {}", verified);
}
