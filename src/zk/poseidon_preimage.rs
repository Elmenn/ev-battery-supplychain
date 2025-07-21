// src/zk/poseidon_preimage.rs

use ark_ed_on_bls12_381::Fq;
use ark_r1cs_std::{
    alloc::AllocVar,
    eq::EqGadget,
    fields::fp::FpVar,
};
use ark_relations::r1cs::{
    ConstraintSystem, ConstraintSynthesizer, ConstraintSystemRef, SynthesisError,
};
use ark_sponge::{
    CryptographicSponge,
    constraints::CryptographicSpongeVar,
    poseidon::{
        PoseidonSponge,
        PoseidonConfig,
        constraints::PoseidonSpongeVar,
    },
};

// ✅ Manually construct Poseidon parameters
fn poseidon_config() -> PoseidonConfig<Fq> {
    let full_rounds = 8;
    let partial_rounds = 57;
    let alpha = 5;

    let mds = vec![
        vec![Fq::from(1u64), Fq::from(2u64), Fq::from(3u64)],
        vec![Fq::from(4u64), Fq::from(5u64), Fq::from(6u64)],
        vec![Fq::from(7u64), Fq::from(8u64), Fq::from(9u64)],
    ];
    let ark = vec![vec![Fq::from(1u64); 3]; full_rounds + partial_rounds];

    PoseidonConfig::new(
        full_rounds,
        partial_rounds,
        alpha,
        mds,
        ark,
        2,
        1,
    )
}

#[derive(Clone)]
struct PoseidonPreimageCircuit {
    pub x: Fq,
    pub y: Fq,
    pub z: Fq,
    pub hash: Fq,
}

impl ConstraintSynthesizer<Fq> for PoseidonPreimageCircuit {
    fn generate_constraints(self, cs: ConstraintSystemRef<Fq>) -> Result<(), SynthesisError> {
        let hash_var = FpVar::new_input(cs.clone(), || Ok(self.hash))?;

        let x_var = FpVar::new_witness(cs.clone(), || Ok(self.x))?;
        let y_var = FpVar::new_witness(cs.clone(), || Ok(self.y))?;
        let z_var = FpVar::new_witness(cs.clone(), || Ok(self.z))?;

        let mut sponge = PoseidonSpongeVar::new(cs.clone(), &poseidon_config());
        sponge.absorb(&x_var)?;
        sponge.absorb(&y_var)?;
        sponge.absorb(&z_var)?;
        let result_var = sponge.squeeze_field_elements(1)?[0].clone();

        result_var.enforce_equal(&hash_var)?;
        Ok(())
    }
}

pub fn prove_poseidon_preimage() {
    println!("▶️ Running: Poseidon preimage proof");

    let x = Fq::from(1u64);
    let y = Fq::from(2u64);
    let z = Fq::from(3u64);

    let mut sponge = PoseidonSponge::<Fq>::new(&poseidon_config());
    sponge.absorb(&x);
    sponge.absorb(&y);
    sponge.absorb(&z);
    let hash = sponge.squeeze_field_elements(1)[0];

    println!("✅ Public Poseidon hash = {}", hash);

    let circuit = PoseidonPreimageCircuit { x, y, z, hash };

    let cs = ConstraintSystem::<Fq>::new_ref();
    circuit.generate_constraints(cs.clone()).unwrap();

    assert!(cs.is_satisfied().unwrap());
    println!("✅ Poseidon preimage constraint system satisfied 🎉");
}
