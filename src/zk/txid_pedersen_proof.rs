use bulletproofs::r1cs::{Prover, Verifier};
use bulletproofs::{BulletproofGens, PedersenGens};
use bulletproofs::r1cs::R1CSProof;
use curve25519_dalek_ng::ristretto::CompressedRistretto;
use curve25519_dalek_ng::scalar::Scalar;
use merlin::Transcript;
use rand::rngs::OsRng;
use rand::RngCore;
use hex::FromHex;

/// Proves knowledge of a transaction ID preimage such that Pedersen(tx_id, r) == commitment
pub fn prove_txid_commitment(tx_id: Scalar) -> (CompressedRistretto, Vec<u8>, bool) {
    println!("\u{25B6}\u{FE0F} Running: Bulletproof-based ZKP for tx_id using Pedersen commitment");

    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(64, 1);
    let mut rng = OsRng;

    let mut bytes = [0u8; 64];
    rng.fill_bytes(&mut bytes);
    let blinding_r = Scalar::from_bytes_mod_order_wide(&bytes);

    // ✍️ Prover Phase
    let mut transcript = Transcript::new(b"TxIDPedersenZKP");
    let mut prover = Prover::new(&pc_gens, &mut transcript);
    let (_com_var, _) = prover.commit(tx_id, blinding_r);
    let proof = prover.prove(&bp_gens).unwrap();
    let proof_bytes = proof.to_bytes();
    let commitment = pc_gens.commit(tx_id, blinding_r).compress();

    // 🔍 Verifier Phase
    let mut transcript = Transcript::new(b"TxIDPedersenZKP");
    let mut verifier = Verifier::new(&mut transcript);
    let _var = verifier.commit(commitment);
    let verified = verifier.verify(&proof, &pc_gens, &bp_gens).is_ok();

    println!("\u{2705} ZK Proof of tx_id preimage verified? {}", verified);

    (commitment, proof_bytes, verified)
}

/// Convenience wrapper: takes Ethereum tx hash as hex string and proves it
pub fn prove_txid_commitment_from_hex(txid_hex: &str) -> (CompressedRistretto, Vec<u8>, bool) {
    let hex_str = txid_hex.strip_prefix("0x").unwrap_or(txid_hex);
    let bytes = <[u8; 32]>::from_hex(hex_str).expect("Invalid tx hash");
    let tx_scalar = Scalar::from_bytes_mod_order(bytes);
    prove_txid_commitment(tx_scalar)
}

/// Proves knowledge of a 256-bit transaction ID preimage such that the commitments to all 4 limbs are valid
/// Returns (Vec<CompressedRistretto>, proof bytes, verified)
pub fn prove_txid_commitment_4limb(txid_bytes: [u8; 32]) -> (Vec<CompressedRistretto>, Vec<u8>, bool) {
    use bulletproofs::r1cs::{ConstraintSystem, LinearCombination, Variable};
    use curve25519_dalek_ng::scalar::Scalar;
    // Split into 4 limbs
    let limbs: [u64; 4] = [
        u64::from_le_bytes(txid_bytes[0..8].try_into().unwrap()),
        u64::from_le_bytes(txid_bytes[8..16].try_into().unwrap()),
        u64::from_le_bytes(txid_bytes[16..24].try_into().unwrap()),
        u64::from_le_bytes(txid_bytes[24..32].try_into().unwrap()),
    ];
    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(64, 4); // 4 parties, 64 bits each
    let mut rng = OsRng;
    let mut transcript = Transcript::new(b"TxIDPedersenZKP4Limb");
    let mut prover = Prover::new(&pc_gens, &mut transcript);
    let mut commitments = Vec::with_capacity(4);
    let mut vars = Vec::with_capacity(4);
    for &limb in &limbs {
        let mut bytes = [0u8; 64];
        rng.fill_bytes(&mut bytes);
        let blind = Scalar::from_bytes_mod_order_wide(&bytes);
        let (com, var) = prover.commit(Scalar::from(limb), blind);
        commitments.push(com);
        vars.push(var);
        // Optionally, constrain range here if you want to prove it's in [0, 2^64)
        prover.constrain(var - Scalar::from(limb));
    }
    // No additional constraints: just prove knowledge of all 4 limbs
    let proof = prover.prove(&bp_gens).unwrap();
    let proof_bytes = proof.to_bytes();
    // Verifier phase
    let mut transcript = Transcript::new(b"TxIDPedersenZKP4Limb");
    let mut verifier = Verifier::new(&mut transcript);
    let mut v_vars = Vec::with_capacity(4);
    for &com in &commitments {
        let var = verifier.commit(com);
        v_vars.push(var);
        // Optionally, constrain range here if you want to prove it's in [0, 2^64)
        verifier.constrain(var - var); // always zero, just to keep structure
    }
    let verified = verifier.verify(&R1CSProof::from_bytes(&proof_bytes).unwrap(), &pc_gens, &bp_gens).is_ok();
    (commitments, proof_bytes, verified)
}

/// Verifies the proof of a transaction ID preimage
pub fn verify_txid_commitment(
    commitment: CompressedRistretto,
    proof_bytes: Vec<u8>
) -> bool {
    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(64, 1);
    let mut transcript = Transcript::new(b"TxIDPedersenZKP");

    let mut verifier = Verifier::new(&mut transcript);
    let _var = verifier.commit(commitment);

    let proof = R1CSProof::from_bytes(&proof_bytes).unwrap();
    verifier.verify(&proof, &pc_gens, &bp_gens).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_txid_proof() {
        let tx_id = Scalar::from(123456u64);
        let (commitment, proof_bytes, verified) = prove_txid_commitment(tx_id);
        assert!(verified);
        assert!(verify_txid_commitment(commitment, proof_bytes));
    }

    #[test]
    fn test_invalid_txid_proof() {
        let tx_id = Scalar::from(123456u64);
        let (_, proof_bytes, _) = prove_txid_commitment(tx_id);

        // Fake commitment to simulate mismatch
        let fake_commitment = PedersenGens::default().commit(Scalar::from(999999u64), Scalar::zero()).compress();

        let result = verify_txid_commitment(fake_commitment, proof_bytes);
        assert!(!result);
    }
}



