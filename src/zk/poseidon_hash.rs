use ark_ed_on_bls12_381::Fq;
use ark_sponge::{
    poseidon::{PoseidonConfig, PoseidonSponge},
    CryptographicSponge,
};

pub fn run_poseidon_hash_demo() {
    println!("▶️ Running: Poseidon hash demo");

    // ➕ Rounds and alpha for toy config (insecure)
    let full_rounds = 8;
    let partial_rounds = 57;
    let alpha = 17;

    // ⚙️ Fake MDS matrix: 3x3 of all 1s (just for demonstration)
    let mds = vec![
        vec![Fq::from(1), Fq::from(1), Fq::from(1)],
        vec![Fq::from(1), Fq::from(1), Fq::from(1)],
        vec![Fq::from(1), Fq::from(1), Fq::from(1)],
    ];   

    // ⚙️ Fake round constants (again, for demo — insecure)
    let total_rounds = full_rounds + partial_rounds;
    let ark = vec![vec![Fq::from(1); 3]; total_rounds]; // total_rounds × 3 constants

    // Create config
    let rate = 2;
    let capacity = 1;
    let config = PoseidonConfig::new(full_rounds, partial_rounds, alpha, mds, ark, rate, capacity);

    // 🌀 Sponge setup
    let mut sponge = PoseidonSponge::<Fq>::new(&config);

    // Inputs to hash
    let x = Fq::from(1u64);
    let y = Fq::from(2u64);
    let z = Fq::from(3u64);

    sponge.absorb(&x);
    sponge.absorb(&y);
    sponge.absorb(&z);

    let result = sponge.squeeze_field_elements::<Fq>(1)[0];

    println!("✅ Poseidon(x=1, y=2, z=3) = {}", result);
}
