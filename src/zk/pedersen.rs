use bulletproofs::r1cs::{ConstraintSystem, Prover, Verifier};
use bulletproofs::{BulletproofGens, PedersenGens};
use curve25519_dalek_ng::scalar::Scalar;
use merlin::Transcript;
use rand::rngs::OsRng;
use rand::RngCore;

pub fn prove_equal_42() {
    // Step 1: Secret value
    let secret_value: u64 = 42;

    // Step 2: Generators
    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(64, 1);
    let mut rng = OsRng;

    // Step 3: Prover commits to secret
    let mut prover_transcript = Transcript::new(b"ZKPDemo");
    let (proof, committed_value) = {
        let mut prover = Prover::new(&pc_gens, &mut prover_transcript);

        // Blinding factor (random scalar)
        let mut bytes = [0u8; 64];
        rng.fill_bytes(&mut bytes);
        let blinding = Scalar::from_bytes_mod_order_wide(&bytes);

        // Commit to secret value with blinding
        let (com, var) = prover.commit(Scalar::from(secret_value), blinding);

        // Constrain: var == 42
        prover.constrain(var - Scalar::from(42u64));

        // Create proof
        let proof = prover.prove(&bp_gens).unwrap();
        (proof, com)
    };

    // Step 4: Verifier checks the proof
    let mut verifier_transcript = Transcript::new(b"ZKPDemo");
    let verified = {
        let mut verifier = Verifier::new(&mut verifier_transcript);
        let var = verifier.commit(committed_value);
        verifier.constrain(var - Scalar::from(42u64));
        verifier.verify(&proof, &pc_gens, &bp_gens).is_ok()
    };

    println!("✅ Proof verified? {}", verified);
}
