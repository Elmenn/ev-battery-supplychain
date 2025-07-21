//! Actix‑web entry point exposing classic Bulletproof (BP) **and** Bulletproofs‑Plus (BP⁺) endpoints.

mod zk;

use actix_cors::Cors;
use actix_web::{post, web, App, HttpResponse, HttpServer, Responder};
use curve25519_dalek::ristretto::CompressedRistretto as PlusCompressed;           // upstream Dalek (BP⁺)
use curve25519_dalek_ng::{scalar::Scalar, ristretto::CompressedRistretto as NgCompressed}; // Dalek‑NG (classic BP)
use hex::{decode as hex_decode, FromHex, ToHex};
use serde::{Deserialize, Serialize};
use serde_json::json;

// ─── Local circuits ────────────────────────────────────────────────────────
use zk::bp_plus_pedersen::{prove_txid_commitment as prove_plus, verify_txid_commitment as verify_plus};
use zk::txid_pedersen_proof::{prove_txid_commitment, verify_txid_commitment};
use bulletproofs::r1cs::ConstraintSystem;


fn bad_req(msg: &str) -> HttpResponse {
    HttpResponse::BadRequest().json(json!({ "error": msg }))
}

// =============================================================================
// Classic Bulletproof (R1CS) endpoints
// =============================================================================

#[derive(Deserialize)]
struct ZkpRequest { tx_hash: String }

#[derive(Serialize)]
struct ProofResponse { commitments: Vec<String>, proof: String }
impl ProofResponse {
    fn new<T>(coms: &[T], proof: Vec<u8>) -> Self
    where
        T: ProofCommitmentBytes,
    {
        Self {
            commitments: coms.iter().map(|c| hex::encode(c.commitment_bytes())).collect(),
            proof: proof.encode_hex::<String>(),
        }
    }
}

trait ProofCommitmentBytes {
    fn commitment_bytes(&self) -> &[u8];
}

impl ProofCommitmentBytes for curve25519_dalek::ristretto::CompressedRistretto {
    fn commitment_bytes(&self) -> &[u8] {
        self.as_bytes()
    }
}

impl ProofCommitmentBytes for [u8; 32] {
    fn commitment_bytes(&self) -> &[u8] {
        self.as_ref()
    }
}

impl ProofCommitmentBytes for curve25519_dalek_ng::ristretto::CompressedRistretto {
    fn commitment_bytes(&self) -> &[u8] {
        self.as_bytes()
    }
}

#[derive(Serialize)]
struct ZkpVerifyResult { verified: bool }

#[post("/zkp/generate")]
async fn generate_zkp(tx: web::Json<ZkpRequest>) -> impl Responder {
    let bytes = match hex_decode(tx.tx_hash.trim_start_matches("0x")) {
        Ok(b) if b.len() >= 32 => b,
        _ => return HttpResponse::BadRequest().json(json!({"error":"invalid tx_hash"})),
    };
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes[..32]);
    let value = Scalar::from_bytes_mod_order(arr);

    let (commitment, proof_bytes, _) = prove_txid_commitment(value);
    let _verified = verify_txid_commitment(commitment, proof_bytes.clone());

    HttpResponse::Ok().json(ProofResponse::new(&[commitment.to_bytes()], proof_bytes))
}

#[derive(Deserialize)]
struct ZkpVerifyInput { commitment: String, proof: String }

#[post("/zkp/verify")]
async fn verify_zkp(input: web::Json<ZkpVerifyInput>) -> impl Responder {
    let com_bytes: [u8; 32] = match <[u8;32]>::from_hex(&input.commitment) {
        Ok(b) => b,
        _ => return HttpResponse::BadRequest().json(json!({"error":"bad commitment"})),
    };
    let proof_bytes = match Vec::from_hex(&input.proof) {
        Ok(p) => p,
        _ => return HttpResponse::BadRequest().json(json!({"error":"bad proof"})),
    };
    let ok = verify_txid_commitment(NgCompressed(com_bytes), proof_bytes);
    HttpResponse::Ok().json(ZkpVerifyResult { verified: ok })
}

// =============================================================================
// Bulletproofs‑Plus endpoints (64‑bit range proof)
// =============================================================================

#[derive(Deserialize)]
struct TxHashPayload { tx_hash: String }

#[post("/zkp/prove_plus")]
async fn prove_plus_ep(payload: web::Json<TxHashPayload>) -> impl Responder {
    let bytes = match hex_decode(payload.tx_hash.trim_start_matches("0x")) {
        Ok(b) => b,
        Err(_) => return bad_req("bad hex"),
    };
    if bytes.len() < 32 {
        return bad_req("tx_hash too short");
    }

    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes[..32]);
    let (coms, proof) = prove_plus(arr);
    HttpResponse::Ok().json(ProofResponse::new(&coms, proof))
}

#[derive(Deserialize)]
struct ProofVerifyPayload {
    commitments: Vec<String>,
    proof: String,
}

#[post("/zkp/verify_plus")]
async fn verify_plus_ep(payload: web::Json<ProofVerifyPayload>) -> impl Responder {
    use curve25519_dalek::ristretto::CompressedRistretto;
    let commitments: Result<Vec<_>, _> = payload.commitments.iter()
        .map(|hex| <[u8;32]>::from_hex(hex).map(CompressedRistretto))
        .collect();
    let commitments = match commitments {
        Ok(c) => c,
        Err(_) => return HttpResponse::BadRequest().json(json!({"error":"bad commitments"})),
    };
    let proof = match Vec::from_hex(&payload.proof) {
        Ok(p) => p,
        _ => return HttpResponse::BadRequest().json(json!({"error":"bad proof"})),
    };
    let ok = verify_plus(commitments, proof);
    HttpResponse::Ok().json(ZkpVerifyResult { verified: ok })
}

#[post("/zkp/generate_bp4")]
async fn generate_bp4(tx: web::Json<ZkpRequest>) -> impl Responder {
    let bytes = match hex_decode(tx.tx_hash.trim_start_matches("0x")) {
        Ok(b) if b.len() >= 32 => b,
        _ => return HttpResponse::BadRequest().json(json!({"error":"invalid tx_hash"})),
    };
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes[..32]);
    let (commitments, proof_bytes, verified) = zk::txid_pedersen_proof::prove_txid_commitment_4limb(arr);
    if !verified {
        return HttpResponse::InternalServerError().json(json!({"error":"proof failed"}));
    }
    HttpResponse::Ok().json(ProofResponse::new(&commitments, proof_bytes))
}

#[derive(Deserialize)]
struct BP4VerifyInput {
    commitments: Vec<String>,
    proof: String,
}

#[post("/zkp/verify_bp4")]
async fn verify_bp4(input: web::Json<BP4VerifyInput>) -> impl Responder {
    use curve25519_dalek_ng::ristretto::CompressedRistretto;
    let commitments: Result<Vec<_>, _> = input.commitments.iter()
        .map(|hex| <[u8;32]>::from_hex(hex).map(CompressedRistretto))
        .collect();
    let commitments = match commitments {
        Ok(c) => c,
        Err(_) => return HttpResponse::BadRequest().json(json!({"error":"bad commitments"})),
    };
    let proof = match Vec::from_hex(&input.proof) {
        Ok(p) => p,
        _ => return HttpResponse::BadRequest().json(json!({"error":"bad proof"})),
    };
    // Use the same verification logic as in the prover
    let pc_gens = bulletproofs::PedersenGens::default();
    let bp_gens = bulletproofs::BulletproofGens::new(64, 4);
    let mut transcript = merlin::Transcript::new(b"TxIDPedersenZKP4Limb");
    let mut verifier = bulletproofs::r1cs::Verifier::new(&mut transcript);
    for com in &commitments {
        let var = verifier.commit(*com);
        verifier.constrain(var - var); // always zero, just to keep structure
    }
    let proof_obj = bulletproofs::r1cs::R1CSProof::from_bytes(&proof).unwrap();
    let ok = verifier.verify(&proof_obj, &pc_gens, &bp_gens).is_ok();
    HttpResponse::Ok().json(ZkpVerifyResult { verified: ok })
}

// =============================================================================
// Server bootstrap
// =============================================================================

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| {
        App::new()
            .wrap(Cors::default().allow_any_origin().allow_any_method().allow_any_header())
            .service(generate_zkp)
            .service(verify_zkp)
            .service(prove_plus_ep)
            .service(verify_plus_ep)
            .service(generate_bp4)
            .service(verify_bp4)
    })
    .bind(("127.0.0.1", 5010))?
    .run()
    .await
}
