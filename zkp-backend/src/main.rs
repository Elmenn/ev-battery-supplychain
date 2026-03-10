//! Actix‑web entry point exposing classic Bulletproof (BP) **and** Bulletproofs‑Plus (BP⁺) endpoints.

use bulletproof_demo::zk;

use actix_cors::Cors;
use actix_web::{post, web, App, HttpResponse, HttpServer, Responder};
use curve25519_dalek_ng::{scalar::Scalar, ristretto::CompressedRistretto as NgCompressed}; // Dalek‑NG (classic BP)
use hex::{decode as hex_decode, FromHex, ToHex};
use num_bigint::BigUint;
use serde::{Deserialize, Serialize};
use serde_json::json;

// ─── Local circuits ────────────────────────────────────────────────────────
use zk::bp_plus_pedersen::{prove_txid_commitment as prove_plus, verify_txid_commitment as verify_plus};
use zk::txid_pedersen_proof::{prove_txid_commitment, prove_txid_commitment_from_hex, prove_txid_commitment_from_hex_with_binding, verify_txid_commitment, verify_txid_commitment_with_binding};
use bulletproofs::r1cs::ConstraintSystem;
use zk::pedersen::{commit_scalar_with_blinding, prove_value_commitment, prove_value_commitment_with_blinding, prove_value_commitment_with_binding, verify_value_commitment, verify_value_commitment_with_binding};
use zk::equality_proof::{prove_equality, verify_equality, EqualityProof};
use zk::quantity_total_proof::{prove_quantity_total, verify_quantity_total, QuantityTotalProof};


fn bad_req(msg: &str) -> HttpResponse {
    HttpResponse::BadRequest().json(json!({ "error": msg }))
}

fn parse_hex32_bytes(hex_str: &str) -> Option<[u8; 32]> {
    <[u8; 32]>::from_hex(hex_str.trim_start_matches("0x")).ok()
}

fn parse_compressed_ristretto(hex_str: &str) -> Option<curve25519_dalek_ng::ristretto::CompressedRistretto> {
    parse_hex32_bytes(hex_str).map(curve25519_dalek_ng::ristretto::CompressedRistretto)
}

fn parse_scalar_hex(hex_str: &str) -> Option<Scalar> {
    parse_hex32_bytes(hex_str).map(Scalar::from_bytes_mod_order)
}

fn parse_context_hash_hex(hex_str: &str) -> Option<[u8; 32]> {
    parse_hex32_bytes(hex_str)
}

fn parse_decimal_scalar_strict(value: &str) -> Option<Scalar> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    let parsed = BigUint::parse_bytes(trimmed.as_bytes(), 10)?;
    let bytes_le = parsed.to_bytes_le();
    if bytes_le.len() > 32 {
        return None;
    }

    let mut scalar_bytes = [0u8; 32];
    scalar_bytes[..bytes_le.len()].copy_from_slice(&bytes_le);
    Scalar::from_canonical_bytes(scalar_bytes)
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
    println!("[API] /zkp/generate - Classic BP generation");
    let bytes = match hex_decode(tx.tx_hash.trim_start_matches("0x")) {
        Ok(b) if b.len() >= 32 => b,
        _ => {
            println!("[API] ❌ Invalid tx_hash format");
            return HttpResponse::BadRequest().json(json!({"error":"invalid tx_hash"}));
        },
    };
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes[..32]);
    let value = Scalar::from_bytes_mod_order(arr);

    println!("[API] Generating proof...");
    let (commitment, proof_bytes, _) = prove_txid_commitment(value);
    let _verified = verify_txid_commitment(commitment, proof_bytes.clone());
    println!("[API] ✅ Proof generated: {} bytes", proof_bytes.len());

    HttpResponse::Ok().json(ProofResponse::new(&[commitment.to_bytes()], proof_bytes))
}

#[derive(Deserialize)]
struct ZkpVerifyInput { 
    commitment: String, 
    proof: String,
    #[serde(default)]
    binding_tag_hex: Option<String>, // Feature 2: Optional binding tag for linkable commitments
}

#[post("/zkp/verify")]
async fn verify_zkp(input: web::Json<ZkpVerifyInput>) -> impl Responder {
    println!("[API] /zkp/verify - Received verification request");
    
    let com_bytes: [u8; 32] = match <[u8;32]>::from_hex(&input.commitment) {
        Ok(b) => {
            println!("[API] ✅ Commitment parsed: {} bytes", b.len());
            b
        },
        Err(e) => {
            println!("[API] ❌ Failed to parse commitment: {:?}", e);
            return HttpResponse::BadRequest().json(json!({"error":"bad commitment"}));
        },
    };
    
    let proof_bytes = match Vec::from_hex(&input.proof) {
        Ok(p) => {
            println!("[API] ✅ Proof parsed: {} bytes", p.len());
            p
        },
        Err(e) => {
            println!("[API] ❌ Failed to parse proof: {:?}", e);
            return HttpResponse::BadRequest().json(json!({"error":"bad proof"}));
        },
    };
    
    // Parse binding tag if provided (Feature 2: Linkable Commitment)
    let binding_tag = if let Some(ref binding_hex) = input.binding_tag_hex {
        println!("[API] Binding tag provided for verification: {} (length: {})", binding_hex, binding_hex.len());
        match hex::decode(binding_hex.strip_prefix("0x").unwrap_or(binding_hex)) {
            Ok(bytes) if bytes.len() == 32 => {
                println!("[API] ✅ Binding tag parsed successfully: {} bytes", bytes.len());
                Some(bytes)
            },
            Ok(bytes) => {
                println!("[API] ❌ Invalid binding tag length: expected 32 bytes, got {}", bytes.len());
                return HttpResponse::BadRequest().json(json!({
                    "error": "invalid binding_tag_hex: must be 32 bytes (64 hex chars)"
                }));
            },
            Err(e) => {
                println!("[API] ❌ Failed to decode binding tag hex: {:?}", e);
                return HttpResponse::BadRequest().json(json!({
                    "error": "invalid binding_tag_hex: must be valid hex"
                }));
            },
        }
    } else {
        println!("[API] No binding tag provided (backward compatible verification)");
        None
    };
    
    // Verify with optional binding tag
    println!("[API] Verifying TX hash commitment{}...", if binding_tag.is_some() { " with binding tag" } else { "" });
    let ok = verify_txid_commitment_with_binding(
        NgCompressed(com_bytes), 
        proof_bytes,
        binding_tag.as_ref().map(|b| b.as_slice()),
    );
    
    if ok {
        println!("[API] ✅ Verification SUCCESS");
    } else {
        println!("[API] ❌ Verification FAILED");
    }
    
    HttpResponse::Ok().json(ZkpVerifyResult { verified: ok })
}

// =============================================================================
// Transaction Hash Commitment endpoints (for privacy)
// =============================================================================

#[derive(Deserialize)]
struct TxHashCommitRequest { 
    tx_hash: String,
    #[serde(default)]
    binding_tag_hex: Option<String>, // Feature 2: Optional binding tag for linkable commitments
}

#[derive(Serialize)]
struct TxHashCommitResponse {
    commitment: String,
    proof: String,
    verified: bool,
}

/// Generate a Pedersen commitment to a transaction hash
/// This hides the transaction hash in the VC, making it harder to link to Etherscan
/// Feature 2: Supports optional binding_tag_hex to link purchase and delivery TX commitments
#[post("/zkp/commit-tx-hash")]
async fn commit_tx_hash(req: web::Json<TxHashCommitRequest>) -> impl Responder {
    println!("[API] /zkp/commit-tx-hash - Received request");
    let tx_hash = req.tx_hash.trim();
    println!("[API] TX hash: {} (length: {})", tx_hash, tx_hash.len());
    
    // Validate hex format
    let tx_hash_clean = tx_hash.strip_prefix("0x").unwrap_or(tx_hash);
    if tx_hash_clean.len() != 64 {
        println!("[API] ❌ Invalid tx_hash format: expected 64 hex chars, got {}", tx_hash_clean.len());
        return HttpResponse::BadRequest().json(json!({
            "error": "Invalid tx_hash format. Expected 64 hex characters (32 bytes)"
        }));
    }
    println!("[API] ✅ TX hash format valid");
    
    // Parse binding tag if provided (Feature 2: Linkable Commitment)
    let binding_tag = if let Some(ref binding_hex) = req.binding_tag_hex {
        println!("[API] Binding tag provided: {} (length: {})", binding_hex, binding_hex.len());
        match hex::decode(binding_hex.strip_prefix("0x").unwrap_or(binding_hex)) {
            Ok(bytes) if bytes.len() == 32 => {
                println!("[API] ✅ Binding tag parsed successfully: {} bytes", bytes.len());
                Some(bytes)
            },
            Ok(bytes) => {
                println!("[API] ❌ Invalid binding tag length: expected 32 bytes, got {}", bytes.len());
                return HttpResponse::BadRequest().json(json!({
                    "error": "invalid binding_tag_hex: must be 32 bytes (64 hex chars)"
                }));
            },
            Err(e) => {
                println!("[API] ❌ Failed to decode binding tag hex: {:?}", e);
                return HttpResponse::BadRequest().json(json!({
                    "error": "invalid binding_tag_hex: must be valid hex"
                }));
            },
        }
    } else {
        println!("[API] No binding tag provided (backward compatible mode)");
        None
    };
    
    // Generate commitment with optional binding tag
    println!("[API] Generating TX hash commitment{}...", if binding_tag.is_some() { " with binding tag" } else { "" });
    let (commitment, proof_bytes, verified) = prove_txid_commitment_from_hex_with_binding(
        tx_hash,
        binding_tag.as_ref().map(|b| b.as_slice()),
    );
    
    println!("[API] ✅ Commitment generated: {} bytes, proof: {} bytes, verified: {}", 
             commitment.as_bytes().len(), proof_bytes.len(), verified);
    
    HttpResponse::Ok().json(TxHashCommitResponse {
        commitment: hex::encode(commitment.as_bytes()),
        proof: hex::encode(&proof_bytes),
        verified,
    })
}

// =============================================================================
// Bulletproofs‑Plus endpoints (64‑bit range proof)
// =============================================================================

#[derive(Deserialize)]
struct TxHashPayload { tx_hash: String }

#[post("/zkp/prove_plus")]
async fn prove_plus_ep(payload: web::Json<TxHashPayload>) -> impl Responder {
    println!("[API] /zkp/prove_plus - BP+ proof generation");
    let bytes = match hex_decode(payload.tx_hash.trim_start_matches("0x")) {
        Ok(b) => b,
        Err(_) => {
            println!("[API] ❌ Invalid hex format");
            return bad_req("bad hex");
        },
    };
    if bytes.len() < 32 {
        println!("[API] ❌ TX hash too short: {} bytes", bytes.len());
        return bad_req("tx_hash too short");
    }

    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes[..32]);
    println!("[API] Generating BP+ proof...");
    let (coms, proof) = prove_plus(arr);
    println!("[API] ✅ BP+ proof generated: {} commitments, proof: {} bytes", coms.len(), proof.len());
    HttpResponse::Ok().json(ProofResponse::new(&coms, proof))
}

#[derive(Deserialize)]
struct ProofVerifyPayload {
    commitments: Vec<String>,
    proof: String,
}

#[post("/zkp/verify_plus")]
async fn verify_plus_ep(payload: web::Json<ProofVerifyPayload>) -> impl Responder {
    println!("[API] /zkp/verify_plus - BP+ verification");
    use curve25519_dalek::ristretto::CompressedRistretto;
    let commitments: Result<Vec<_>, _> = payload.commitments.iter()
        .map(|hex| <[u8;32]>::from_hex(hex).map(CompressedRistretto))
        .collect();
    let commitments = match commitments {
        Ok(c) => {
            println!("[API] ✅ Parsed {} commitments", c.len());
            c
        },
        Err(_) => {
            println!("[API] ❌ Failed to parse commitments");
            return HttpResponse::BadRequest().json(json!({"error":"bad commitments"}));
        },
    };
    let proof = match Vec::from_hex(&payload.proof) {
        Ok(p) => {
            println!("[API] ✅ Parsed proof: {} bytes", p.len());
            p
        },
        _ => {
            println!("[API] ❌ Failed to parse proof");
            return HttpResponse::BadRequest().json(json!({"error":"bad proof"}));
        },
    };
    println!("[API] Verifying BP+ proof...");
    let ok = verify_plus(commitments, proof);
    println!("[API] {} BP+ verification", if ok { "✅" } else { "❌" });
    HttpResponse::Ok().json(ZkpVerifyResult { verified: ok })
}

#[post("/zkp/generate_bp4")]
async fn generate_bp4(tx: web::Json<ZkpRequest>) -> impl Responder {
    println!("[API] /zkp/generate_bp4 - 4-limb BP generation");
    let bytes = match hex_decode(tx.tx_hash.trim_start_matches("0x")) {
        Ok(b) if b.len() >= 32 => b,
        _ => {
            println!("[API] ❌ Invalid tx_hash format");
            return HttpResponse::BadRequest().json(json!({"error":"invalid tx_hash"}));
        },
    };
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes[..32]);
    println!("[API] Generating 4-limb proof...");
    let (commitments, proof_bytes, verified) = zk::txid_pedersen_proof::prove_txid_commitment_4limb(arr);
    if !verified {
        println!("[API] ❌ Proof generation failed");
        return HttpResponse::InternalServerError().json(json!({"error":"proof failed"}));
    }
    println!("[API] ✅ 4-limb proof generated: {} commitments, proof: {} bytes", commitments.len(), proof_bytes.len());
    HttpResponse::Ok().json(ProofResponse::new(&commitments, proof_bytes))
}

#[derive(Deserialize)]
struct BP4VerifyInput {
    commitments: Vec<String>,
    proof: String,
}

#[post("/zkp/verify_bp4")]
async fn verify_bp4(input: web::Json<BP4VerifyInput>) -> impl Responder {
    println!("[API] /zkp/verify_bp4 - 4-limb BP verification");
    use curve25519_dalek_ng::ristretto::CompressedRistretto;
    let commitments: Result<Vec<_>, _> = input.commitments.iter()
        .map(|hex| <[u8;32]>::from_hex(hex).map(CompressedRistretto))
        .collect();
    let commitments = match commitments {
        Ok(c) => {
            println!("[API] ✅ Parsed {} commitments", c.len());
            c
        },
        Err(_) => {
            println!("[API] ❌ Failed to parse commitments");
            return HttpResponse::BadRequest().json(json!({"error":"bad commitments"}));
        },
    };
    let proof = match Vec::from_hex(&input.proof) {
        Ok(p) => {
            println!("[API] ✅ Parsed proof: {} bytes", p.len());
            p
        },
        _ => {
            println!("[API] ❌ Failed to parse proof");
            return HttpResponse::BadRequest().json(json!({"error":"bad proof"}));
        },
    };
    println!("[API] Verifying 4-limb proof...");
    // Use the same verification logic as in the prover
    let pc_gens = bulletproofs::PedersenGens::default();
    let bp_gens = bulletproofs::BulletproofGens::new(64, 4);
    let mut transcript = merlin::Transcript::new(b"TxIDPedersenZKP4Limb");
    let mut verifier = bulletproofs::r1cs::Verifier::new(&mut transcript);
    for com in &commitments {
        let var = verifier.commit(*com);
        verifier.constrain(var - var); // always zero, just to keep structure
    }
    let proof_obj = match bulletproofs::r1cs::R1CSProof::from_bytes(&proof) {
        Ok(p) => p,
        Err(_) => {
            println!("[API] ❌ Malformed proof");
            return HttpResponse::BadRequest().json(json!({"error":"malformed proof"}));
        },
    };
    let ok = verifier.verify(&proof_obj, &pc_gens, &bp_gens).is_ok();
    println!("[API] {} 4-limb verification", if ok { "✅" } else { "❌" });
    HttpResponse::Ok().json(ZkpVerifyResult { verified: ok })
}

// =============================================================================
// Server bootstrap
// =============================================================================

#[derive(Deserialize)]
#[serde(untagged)]
enum IntegerLike {
    U64(u64),
    DecimalString(String),
}

impl IntegerLike {
    fn parse_u64(&self, field_name: &str) -> Result<u64, HttpResponse> {
        match self {
            Self::U64(value) => Ok(*value),
            Self::DecimalString(value) => value
                .trim()
                .parse::<u64>()
                .map_err(|_| bad_req(&format!("{field_name} must be a decimal u64 string"))),
        }
    }

    fn parse_scalar(&self, field_name: &str) -> Result<Scalar, HttpResponse> {
        let scalar = match self {
            Self::U64(value) => Scalar::from(*value),
            Self::DecimalString(value) => parse_decimal_scalar_strict(value).ok_or_else(|| {
                bad_req(&format!(
                    "{field_name} must be a canonical non-negative decimal scalar below the curve order"
                ))
            })?,
        };
        Ok(scalar)
    }
}

#[derive(Deserialize)]
struct ValueCommitRequest { value: IntegerLike }

#[derive(Serialize)]
struct ValueCommitResponse { commitment: String, proof: String }

#[post("/zkp/commit-value")]
async fn commit_value(req: web::Json<ValueCommitRequest>) -> impl Responder {
    let value = match req.value.parse_u64("value") {
        Ok(value) => value,
        Err(response) => return response,
    };
    println!("[API] /zkp/commit-value - Value commitment (value: {})", value);
    let (commitment, proof_bytes, _verified) = prove_value_commitment(value);
    let commitment_hex = hex::encode(commitment.as_bytes());
    let proof_len = proof_bytes.len();
    let proof_hex = hex::encode(&proof_bytes);
    println!("[API] ✅ Value commitment generated: proof {} bytes", proof_len);
    HttpResponse::Ok().json(ValueCommitResponse {
        commitment: commitment_hex,
        proof: proof_hex,
    })
}

#[derive(Deserialize)]
struct ValueVerifyRequest { commitment: String, proof: String }

#[derive(Serialize)]
struct ValueVerifyResponse { verified: bool }

#[post("/zkp/verify-value")]
async fn verify_value(req: web::Json<ValueVerifyRequest>) -> impl Responder {
    println!("[API] /zkp/verify-value - Value commitment verification");
    let com_bytes = match <[u8;32]>::from_hex(&req.commitment) {
        Ok(b) => b,
        Err(_) => {
            println!("[API] ❌ Failed to parse commitment");
            return HttpResponse::BadRequest().json(json!({"error":"bad commitment"}));
        },
    };
    let proof_bytes = match Vec::from_hex(&req.proof) {
        Ok(p) => p,
        Err(_) => {
            println!("[API] ❌ Failed to parse proof");
            return HttpResponse::BadRequest().json(json!({"error":"bad proof"}));
        },
    };
    println!("[API] Verifying value commitment...");
    let verified = verify_value_commitment(curve25519_dalek_ng::ristretto::CompressedRistretto(com_bytes), proof_bytes);
    println!("[API] {} Value verification", if verified { "✅" } else { "❌" });
    HttpResponse::Ok().json(ValueVerifyResponse { verified })
}

#[derive(Deserialize)]
struct ValueCommitmentRequest {
    value: IntegerLike,
}

#[derive(Serialize)]
struct ValueCommitmentResponse {
    commitment: String, // hex-encoded
    proof: String,      // hex-encoded
    verified: bool,
}

#[post("/zkp/generate-value-commitment")]
async fn generate_value_commitment(req: web::Json<ValueCommitmentRequest>) -> impl Responder {
    let value = match req.value.parse_u64("value") {
        Ok(value) => value,
        Err(response) => return response,
    };
    println!("[API] /zkp/generate-value-commitment - Value: {}", value);
    let (commitment, proof_bytes, verified) = prove_value_commitment(value);
    let proof_len = proof_bytes.len();
    println!("[API] ✅ Generated: proof {} bytes, verified: {}", proof_len, verified);
    HttpResponse::Ok().json(ValueCommitmentResponse {
        commitment: hex::encode(commitment.as_bytes()),
        proof: hex::encode(proof_bytes),
        verified,
    })
}

#[derive(Deserialize)]
struct ValueCommitmentWithBlindingRequest {
    value: IntegerLike,
    blinding_hex: String, // 32-byte hex string (64 hex chars)
}

#[derive(Serialize)]
struct ScalarCommitmentResponse {
    commitment: String,
    proof: Option<String>,
    verified: bool,
    proof_type: String,
}

#[post("/zkp/generate-value-commitment-with-blinding")]
async fn generate_value_commitment_with_blinding_ep(req: web::Json<ValueCommitmentWithBlindingRequest>) -> impl Responder {
    let value = match req.value.parse_u64("value") {
        Ok(value) => value,
        Err(response) => return response,
    };
    println!("[API] /zkp/generate-value-commitment-with-blinding - Value: {}", value);
    // Parse blinding factor from hex string
    let blinding_bytes = match hex_decode(req.blinding_hex.trim_start_matches("0x")) {
        Ok(b) if b.len() == 32 => {
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&b[..32]);
            arr
        },
        _ => {
            println!("[API] ❌ Invalid blinding_hex format");
            return HttpResponse::BadRequest().json(json!({ "error": "invalid blinding_hex: must be 32 bytes (64 hex chars)" }));
        },
    };
    
    let blinding = Scalar::from_bytes_mod_order(blinding_bytes);
    println!("[API] ✅ Blinding factor parsed");
    
    let (commitment, proof_bytes, verified) = prove_value_commitment_with_blinding(value, blinding);
    let proof_len = proof_bytes.len();
    println!("[API] ✅ Generated with blinding: proof {} bytes, verified: {}", proof_len, verified);
    HttpResponse::Ok().json(ValueCommitmentResponse {
        commitment: hex::encode(commitment.as_bytes()),
        proof: hex::encode(proof_bytes),
        verified,
    })
}

#[post("/zkp/generate-scalar-commitment-with-blinding")]
async fn generate_scalar_commitment_with_blinding_ep(
    req: web::Json<ValueCommitmentWithBlindingRequest>
) -> impl Responder {
    let value = match req.value.parse_scalar("value") {
        Ok(value) => value,
        Err(response) => return response,
    };
    println!("[API] /zkp/generate-scalar-commitment-with-blinding");

    let blinding_bytes = match hex_decode(req.blinding_hex.trim_start_matches("0x")) {
        Ok(b) if b.len() == 32 => {
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&b[..32]);
            arr
        },
        _ => {
            println!("[API] Invalid blinding_hex format");
            return HttpResponse::BadRequest().json(json!({ "error": "invalid blinding_hex: must be 32 bytes (64 hex chars)" }));
        },
    };

    let blinding = Scalar::from_bytes_mod_order(blinding_bytes);
    let commitment = commit_scalar_with_blinding(value, blinding);

    HttpResponse::Ok().json(ScalarCommitmentResponse {
        commitment: hex::encode(commitment.as_bytes()),
        proof: None,
        verified: true,
        proof_type: "pedersen-scalar-v2".to_string(),
    })
}

#[derive(Deserialize)]
struct ValueCommitmentWithBindingRequest {
    value: IntegerLike,
    blinding_hex: String, // 32-byte hex string (64 hex chars)
    binding_tag_hex: Option<String>, // Optional 32-byte hex string (64 hex chars)
}

#[post("/zkp/generate-value-commitment-with-binding")]
async fn generate_value_commitment_with_binding_ep(req: web::Json<ValueCommitmentWithBindingRequest>) -> impl Responder {
    let value = match req.value.parse_u64("value") {
        Ok(value) => value,
        Err(response) => return response,
    };
    println!("[API] /zkp/generate-value-commitment-with-binding - Value: {}", value);
    // Parse blinding factor from hex string
    let blinding_bytes = match hex_decode(req.blinding_hex.trim_start_matches("0x")) {
        Ok(b) if b.len() == 32 => {
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&b[..32]);
            arr
        },
        _ => {
            println!("[API] ❌ Invalid blinding_hex format");
            return HttpResponse::BadRequest().json(json!({ "error": "invalid blinding_hex: must be 32 bytes (64 hex chars)" }));
        },
    };
    
    let blinding = Scalar::from_bytes_mod_order(blinding_bytes);
    println!("[API] ✅ Blinding factor parsed");
    
    // Parse binding tag if provided
    let binding_tag = if let Some(ref binding_hex) = req.binding_tag_hex {
        println!("[API] Binding tag provided");
        match hex_decode(binding_hex.trim_start_matches("0x")) {
            Ok(b) if b.len() == 32 => {
                println!("[API] ✅ Binding tag parsed: {} bytes", b.len());
                Some(b)
            },
            _ => {
                println!("[API] ❌ Invalid binding_tag_hex format");
                return HttpResponse::BadRequest().json(json!({ "error": "invalid binding_tag_hex: must be 32 bytes (64 hex chars)" }));
            },
        }
    } else {
        println!("[API] No binding tag provided");
        None
    };
    
    let (commitment, proof_bytes, verified) = prove_value_commitment_with_binding(
        value,
        blinding,
        binding_tag.as_ref().map(|b| b.as_slice()),
    );
    let proof_len = proof_bytes.len();
    println!("[API] ✅ Generated with binding: proof {} bytes, verified: {}", proof_len, verified);
    HttpResponse::Ok().json(ValueCommitmentResponse {
        commitment: hex::encode(commitment.as_bytes()),
        proof: hex::encode(proof_bytes),
        verified,
    })
}

#[derive(Deserialize)]
struct ValueVerifyInput {
    commitment: String, // hex
    proof: String,      // hex
    binding_tag_hex: Option<String>, // Optional 32-byte hex string (64 hex chars)
}

#[derive(Serialize)]
struct ValueVerifyResult {
    verified: bool,
}

#[post("/zkp/verify-value-commitment")]
async fn verify_value_commitment_ep(input: web::Json<ValueVerifyInput>) -> impl Responder {
    println!("[API] /zkp/verify-value-commitment - Value commitment verification");
    let com_bytes = match <[u8;32]>::from_hex(&input.commitment) {
        Ok(b) => {
            println!("[API] ✅ Commitment parsed: {} bytes", b.len());
            b
        },
        Err(_) => {
            println!("[API] ❌ Failed to parse commitment");
            return HttpResponse::BadRequest().json(json!({ "error": "bad commitment" }));
        },
    };
    let proof_bytes = match Vec::from_hex(&input.proof) {
        Ok(p) => {
            println!("[API] ✅ Proof parsed: {} bytes", p.len());
            p
        },
        Err(_) => {
            println!("[API] ❌ Failed to parse proof");
            return HttpResponse::BadRequest().json(json!({ "error": "bad proof" }));
        },
    };
    
    // Parse binding tag if provided
    let binding_tag = if let Some(ref binding_hex) = input.binding_tag_hex {
        println!("[API] Binding tag provided for verification");
        match hex_decode(binding_hex.trim_start_matches("0x")) {
            Ok(b) if b.len() == 32 => {
                println!("[API] ✅ Binding tag parsed: {} bytes", b.len());
                Some(b)
            },
            _ => {
                println!("[API] ❌ Invalid binding tag format");
                return HttpResponse::BadRequest().json(json!({ "error": "invalid binding_tag_hex: must be 32 bytes (64 hex chars)" }));
            },
        }
    } else {
        println!("[API] No binding tag provided (backward compatible)");
        None
    };
    
    println!("[API] Verifying value commitment{}...", if binding_tag.is_some() { " with binding tag" } else { "" });
    let verified = verify_value_commitment_with_binding(
        curve25519_dalek_ng::ristretto::CompressedRistretto(com_bytes),
        proof_bytes,
        binding_tag.as_ref().map(|b| b.as_slice()),
    );
    println!("[API] {} Value commitment verification", if verified { "✅" } else { "❌" });
    HttpResponse::Ok().json(ValueVerifyResult { verified })
}

// =============================================================================
// Equality proof endpoints (Chaum-Pedersen DLEQ Schnorr sigma protocol)
// =============================================================================

#[derive(Deserialize)]
struct EqualityProofRequest {
    c_price_hex: String,      // 32-byte hex (64 chars), Pedersen commitment to price
    c_pay_hex: String,        // 32-byte hex (64 chars), Pedersen commitment to payment
    r_price_hex: String,      // 32-byte scalar hex — blinding of c_price
    r_pay_hex: String,        // 32-byte scalar hex — blinding of c_pay
    #[serde(default)]
    binding_context: serde_json::Value, // {productId, txRef, chainId, escrowAddr, stage}
    #[serde(default)]
    context_hash_hex: Option<String>,
}

#[derive(Serialize)]
struct EqualityProofResponse {
    proof_r_hex: String,   // hex of r_announcement (32 bytes)
    proof_s_hex: String,   // hex of s_response (32 bytes)
    verified: bool,        // immediate self-verification flag
}

#[derive(Deserialize)]
struct EqualityVerifyRequest {
    c_price_hex: String,
    c_pay_hex: String,
    proof_r_hex: String,
    proof_s_hex: String,
    #[serde(default)]
    binding_context: serde_json::Value,
    #[serde(default)]
    context_hash_hex: Option<String>,
}

#[derive(Serialize)]
struct EqualityVerifyResponse {
    verified: bool,
}

#[derive(Deserialize)]
struct QuantityTotalProofRequest {
    c_quantity_hex: String,
    c_total_hex: String,
    unit_price_wei: String,
    r_quantity_hex: String,
    r_total_hex: String,
    context_hash_hex: String,
}

#[derive(Deserialize)]
struct QuantityTotalVerifyRequest {
    c_quantity_hex: String,
    c_total_hex: String,
    unit_price_wei: String,
    proof_r_hex: String,
    proof_s_hex: String,
    context_hash_hex: String,
}

#[derive(Serialize)]
struct QuantityTotalProofResponse {
    proof_r_hex: String,
    proof_s_hex: String,
    verified: bool,
}

#[derive(Serialize)]
struct QuantityTotalVerifyResponse {
    verified: bool,
}

#[derive(Deserialize)]
struct TotalPaymentEqualityProofRequest {
    c_total_hex: String,
    c_pay_hex: String,
    r_total_hex: String,
    r_pay_hex: String,
    context_hash_hex: String,
}

#[derive(Deserialize)]
struct TotalPaymentEqualityVerifyRequest {
    c_total_hex: String,
    c_pay_hex: String,
    proof_r_hex: String,
    proof_s_hex: String,
    context_hash_hex: String,
}

#[post("/zkp/generate-equality-proof")]
async fn generate_equality_proof_ep(req: web::Json<EqualityProofRequest>) -> impl Responder {
    println!("[API] /zkp/generate-equality-proof");

    let c_price = match parse_compressed_ristretto(&req.c_price_hex) {
        Some(c) => c,
        None => return bad_req("invalid c_price_hex: must be 32 bytes (64 hex chars)"),
    };
    let c_pay = match parse_compressed_ristretto(&req.c_pay_hex) {
        Some(c) => c,
        None => return bad_req("invalid c_pay_hex: must be 32 bytes (64 hex chars)"),
    };
    let r_price = match parse_scalar_hex(&req.r_price_hex) {
        Some(s) => s,
        None => return bad_req("invalid r_price_hex"),
    };
    let r_pay = match parse_scalar_hex(&req.r_pay_hex) {
        Some(s) => s,
        None => return bad_req("invalid r_pay_hex"),
    };

    let binding_bytes = if let Some(context_hash_hex) = &req.context_hash_hex {
        match parse_context_hash_hex(context_hash_hex) {
            Some(bytes) => bytes.to_vec(),
            None => return bad_req("invalid context_hash_hex"),
        }
    } else {
        serde_json::to_vec(&req.binding_context).unwrap_or_default()
    };

    match prove_equality(c_price, c_pay, r_price, r_pay, &binding_bytes) {
        Ok(proof) => {
            let verified = verify_equality(c_price, c_pay, &proof, &binding_bytes);
            println!("[API] Equality proof generated, self-verified: {}", verified);
            HttpResponse::Ok().json(EqualityProofResponse {
                proof_r_hex: hex::encode(proof.r_announcement),
                proof_s_hex: hex::encode(proof.s_response),
                verified,
            })
        }
        Err(e) => {
            println!("[API] Equality proof generation failed: {}", e);
            HttpResponse::InternalServerError().json(json!({ "error": e }))
        }
    }
}

#[post("/zkp/verify-equality-proof")]
async fn verify_equality_proof_ep(req: web::Json<EqualityVerifyRequest>) -> impl Responder {
    println!("[API] /zkp/verify-equality-proof");

    let c_price = match parse_compressed_ristretto(&req.c_price_hex) {
        Some(c) => c,
        None => return bad_req("invalid c_price_hex"),
    };
    let c_pay = match parse_compressed_ristretto(&req.c_pay_hex) {
        Some(c) => c,
        None => return bad_req("invalid c_pay_hex"),
    };

    let r_bytes = match parse_hex32_bytes(&req.proof_r_hex) {
        Some(bytes) => bytes,
        None => return bad_req("invalid proof_r_hex"),
    };
    let s_bytes = match parse_hex32_bytes(&req.proof_s_hex) {
        Some(bytes) => bytes,
        None => return bad_req("invalid proof_s_hex"),
    };

    let proof = EqualityProof { r_announcement: r_bytes, s_response: s_bytes };
    let binding_bytes = if let Some(context_hash_hex) = &req.context_hash_hex {
        match parse_context_hash_hex(context_hash_hex) {
            Some(bytes) => bytes.to_vec(),
            None => return bad_req("invalid context_hash_hex"),
        }
    } else {
        serde_json::to_vec(&req.binding_context).unwrap_or_default()
    };

    let verified = verify_equality(c_price, c_pay, &proof, &binding_bytes);
    println!("[API] Equality proof verification: {}", verified);
    HttpResponse::Ok().json(EqualityVerifyResponse { verified })
}

#[post("/zkp/generate-quantity-total-proof")]
async fn generate_quantity_total_proof_ep(req: web::Json<QuantityTotalProofRequest>) -> impl Responder {
    println!("[API] /zkp/generate-quantity-total-proof");

    let c_quantity = match parse_compressed_ristretto(&req.c_quantity_hex) {
        Some(value) => value,
        None => return bad_req("invalid c_quantity_hex"),
    };
    let c_total = match parse_compressed_ristretto(&req.c_total_hex) {
        Some(value) => value,
        None => return bad_req("invalid c_total_hex"),
    };
    let unit_price = match parse_decimal_scalar_strict(&req.unit_price_wei) {
        Some(value) => value,
        None => return bad_req("invalid unit_price_wei"),
    };
    let r_quantity = match parse_scalar_hex(&req.r_quantity_hex) {
        Some(value) => value,
        None => return bad_req("invalid r_quantity_hex"),
    };
    let r_total = match parse_scalar_hex(&req.r_total_hex) {
        Some(value) => value,
        None => return bad_req("invalid r_total_hex"),
    };
    let context_hash = match parse_context_hash_hex(&req.context_hash_hex) {
        Some(bytes) => bytes,
        None => return bad_req("invalid context_hash_hex"),
    };

    match prove_quantity_total(c_quantity, c_total, unit_price, r_quantity, r_total, &context_hash) {
        Ok(proof) => {
            let verified = verify_quantity_total(c_quantity, c_total, unit_price, &proof, &context_hash);
            HttpResponse::Ok().json(QuantityTotalProofResponse {
                proof_r_hex: hex::encode(proof.r_announcement),
                proof_s_hex: hex::encode(proof.s_response),
                verified,
            })
        }
        Err(error) => HttpResponse::InternalServerError().json(json!({ "error": error })),
    }
}

#[post("/zkp/verify-quantity-total-proof")]
async fn verify_quantity_total_proof_ep(req: web::Json<QuantityTotalVerifyRequest>) -> impl Responder {
    println!("[API] /zkp/verify-quantity-total-proof");

    let c_quantity = match parse_compressed_ristretto(&req.c_quantity_hex) {
        Some(value) => value,
        None => return bad_req("invalid c_quantity_hex"),
    };
    let c_total = match parse_compressed_ristretto(&req.c_total_hex) {
        Some(value) => value,
        None => return bad_req("invalid c_total_hex"),
    };
    let unit_price = match parse_decimal_scalar_strict(&req.unit_price_wei) {
        Some(value) => value,
        None => return bad_req("invalid unit_price_wei"),
    };
    let context_hash = match parse_context_hash_hex(&req.context_hash_hex) {
        Some(bytes) => bytes,
        None => return bad_req("invalid context_hash_hex"),
    };
    let proof = QuantityTotalProof {
        r_announcement: match parse_hex32_bytes(&req.proof_r_hex) {
            Some(bytes) => bytes,
            None => return bad_req("invalid proof_r_hex"),
        },
        s_response: match parse_hex32_bytes(&req.proof_s_hex) {
            Some(bytes) => bytes,
            None => return bad_req("invalid proof_s_hex"),
        },
    };

    let verified = verify_quantity_total(c_quantity, c_total, unit_price, &proof, &context_hash);
    HttpResponse::Ok().json(QuantityTotalVerifyResponse { verified })
}

#[post("/zkp/generate-total-payment-equality-proof")]
async fn generate_total_payment_equality_proof_ep(req: web::Json<TotalPaymentEqualityProofRequest>) -> impl Responder {
    println!("[API] /zkp/generate-total-payment-equality-proof");

    let c_total = match parse_compressed_ristretto(&req.c_total_hex) {
        Some(value) => value,
        None => return bad_req("invalid c_total_hex"),
    };
    let c_pay = match parse_compressed_ristretto(&req.c_pay_hex) {
        Some(value) => value,
        None => return bad_req("invalid c_pay_hex"),
    };
    let r_total = match parse_scalar_hex(&req.r_total_hex) {
        Some(value) => value,
        None => return bad_req("invalid r_total_hex"),
    };
    let r_pay = match parse_scalar_hex(&req.r_pay_hex) {
        Some(value) => value,
        None => return bad_req("invalid r_pay_hex"),
    };
    let context_hash = match parse_context_hash_hex(&req.context_hash_hex) {
        Some(bytes) => bytes,
        None => return bad_req("invalid context_hash_hex"),
    };

    match prove_equality(c_total, c_pay, r_total, r_pay, &context_hash) {
        Ok(proof) => {
            let verified = verify_equality(c_total, c_pay, &proof, &context_hash);
            HttpResponse::Ok().json(EqualityProofResponse {
                proof_r_hex: hex::encode(proof.r_announcement),
                proof_s_hex: hex::encode(proof.s_response),
                verified,
            })
        }
        Err(error) => HttpResponse::InternalServerError().json(json!({ "error": error })),
    }
}

#[post("/zkp/verify-total-payment-equality-proof")]
async fn verify_total_payment_equality_proof_ep(req: web::Json<TotalPaymentEqualityVerifyRequest>) -> impl Responder {
    println!("[API] /zkp/verify-total-payment-equality-proof");

    let c_total = match parse_compressed_ristretto(&req.c_total_hex) {
        Some(value) => value,
        None => return bad_req("invalid c_total_hex"),
    };
    let c_pay = match parse_compressed_ristretto(&req.c_pay_hex) {
        Some(value) => value,
        None => return bad_req("invalid c_pay_hex"),
    };
    let context_hash = match parse_context_hash_hex(&req.context_hash_hex) {
        Some(bytes) => bytes,
        None => return bad_req("invalid context_hash_hex"),
    };
    let proof = EqualityProof {
        r_announcement: match parse_hex32_bytes(&req.proof_r_hex) {
            Some(bytes) => bytes,
            None => return bad_req("invalid proof_r_hex"),
        },
        s_response: match parse_hex32_bytes(&req.proof_s_hex) {
            Some(bytes) => bytes,
            None => return bad_req("invalid proof_s_hex"),
        },
    };

    let verified = verify_equality(c_total, c_pay, &proof, &context_hash);
    HttpResponse::Ok().json(EqualityVerifyResponse { verified })
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    println!("[SERVER] =========================================");
    println!("[SERVER] Starting ZKP Backend Server");
    println!("[SERVER] Listening on http://127.0.0.1:5010");
    println!("[SERVER] =========================================");
    HttpServer::new(|| {
        App::new()
            .wrap(Cors::default().allow_any_origin().allow_any_method().allow_any_header())
            .service(generate_zkp)
            .service(verify_zkp)
            .service(commit_tx_hash)
            .service(prove_plus_ep)
            .service(verify_plus_ep)
            .service(generate_bp4)
            .service(verify_bp4)
            .service(commit_value)
            .service(verify_value)
            .service(generate_value_commitment)
            .service(generate_value_commitment_with_blinding_ep)
            .service(generate_scalar_commitment_with_blinding_ep)
            .service(generate_value_commitment_with_binding_ep)
            .service(verify_value_commitment_ep)
            .service(generate_equality_proof_ep)
            .service(verify_equality_proof_ep)
            .service(generate_quantity_total_proof_ep)
            .service(verify_quantity_total_proof_ep)
            .service(generate_total_payment_equality_proof_ep)
            .service(verify_total_payment_equality_proof_ep)
    })
    .bind(("127.0.0.1", 5010))?
    .run()
    .await
}

#[cfg(test)]
mod tests {
    use super::parse_decimal_scalar_strict;

    #[test]
    fn parse_decimal_scalar_strict_accepts_large_canonical_value() {
        let value = "340282366920938463463374607431768211455";
        assert!(parse_decimal_scalar_strict(value).is_some());
    }

    #[test]
    fn parse_decimal_scalar_strict_rejects_non_canonical_scalar() {
        let value = "7237005577332262213973186563042994240857116359379907606001950938285454250990";
        assert!(parse_decimal_scalar_strict(value).is_none());
    }
}
