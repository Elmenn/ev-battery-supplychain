use bulletproofs::{BulletproofGens, PedersenGens, RangeProof};
use curve25519_dalek_ng::ristretto::CompressedRistretto;
use curve25519_dalek_ng::scalar::Scalar;
use merlin::Transcript;
use num_bigint::BigUint;
use rand::rngs::OsRng;
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
struct ValueCommitmentResponse {
    commitment: String,
    proof: String,
    verified: bool,
}

#[derive(Serialize)]
struct ValueVerifyResponse {
    verified: bool,
}

#[derive(Serialize)]
struct EqualityVerifyResponse {
    verified: bool,
}

#[derive(Serialize)]
struct QuantityTotalVerifyResponse {
    verified: bool,
}

#[derive(Serialize)]
struct ProofGenerationResponse {
    proof_r_hex: String,
    proof_s_hex: String,
    verified: bool,
}

#[derive(Serialize)]
struct ScalarCommitmentResponse {
    commitment: String,
    proof: Option<String>,
    verified: bool,
    proof_type: String,
}

#[derive(Clone, Debug)]
struct EqualityProof {
    r_announcement: [u8; 32],
    s_response: [u8; 32],
}

#[derive(Clone, Debug)]
struct QuantityTotalProof {
    r_announcement: [u8; 32],
    s_response: [u8; 32],
}

fn parse_u64(value: &str) -> Result<u64, JsValue> {
    value
        .trim()
        .parse::<u64>()
        .map_err(|_| JsValue::from_str("invalid value: expected unsigned 64-bit integer string"))
}

fn parse_decimal_scalar_strict(value: &str, field_name: &str) -> Result<Scalar, JsValue> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(JsValue::from_str(&format!(
            "invalid {field_name}: expected canonical non-negative decimal scalar"
        )));
    }

    let parsed = BigUint::parse_bytes(trimmed.as_bytes(), 10).ok_or_else(|| {
        JsValue::from_str(&format!(
            "invalid {field_name}: expected canonical non-negative decimal scalar"
        ))
    })?;

    let bytes_le = parsed.to_bytes_le();
    if bytes_le.len() > 32 {
        return Err(JsValue::from_str(&format!(
            "invalid {field_name}: exceeds scalar byte length"
        )));
    }

    let mut scalar_bytes = [0u8; 32];
    scalar_bytes[..bytes_le.len()].copy_from_slice(&bytes_le);
    Scalar::from_canonical_bytes(scalar_bytes).ok_or_else(|| {
        JsValue::from_str(&format!(
            "invalid {field_name}: scalar is not canonical"
        ))
    })
}

fn parse_fixed_32_hex(input: &str, field_name: &str) -> Result<[u8; 32], JsValue> {
    let clean = input.trim().trim_start_matches("0x");
    let bytes = hex::decode(clean)
        .map_err(|_| JsValue::from_str(&format!("invalid {field_name}: must be valid hex")))?;

    if bytes.len() != 32 {
        return Err(JsValue::from_str(&format!(
            "invalid {field_name}: must be 32 bytes (64 hex chars)"
        )));
    }

    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes[..32]);
    Ok(out)
}

fn parse_hex_vec(input: &str, field_name: &str) -> Result<Vec<u8>, JsValue> {
    let clean = input.trim().trim_start_matches("0x");
    hex::decode(clean)
        .map_err(|_| JsValue::from_str(&format!("invalid {field_name}: must be valid hex")))
}

fn parse_compressed_ristretto(input: &str, field_name: &str) -> Result<CompressedRistretto, JsValue> {
    Ok(CompressedRistretto(parse_fixed_32_hex(input, field_name)?))
}

fn parse_proof_hex_pair(
    proof_r_hex: &str,
    proof_s_hex: &str,
) -> Result<([u8; 32], [u8; 32]), JsValue> {
    Ok((
        parse_fixed_32_hex(proof_r_hex, "proof_r_hex")?,
        parse_fixed_32_hex(proof_s_hex, "proof_s_hex")?,
    ))
}

fn parse_optional_binding_tag(binding_tag_hex: Option<String>) -> Result<Option<Vec<u8>>, JsValue> {
    match binding_tag_hex {
        Some(value) => {
            let arr = parse_fixed_32_hex(&value, "binding_tag_hex")?;
            Ok(Some(arr.to_vec()))
        }
        None => Ok(None),
    }
}

fn prove_value_commitment_with_binding_internal(
    value: u64,
    blinding: Scalar,
    binding_tag: Option<&[u8]>,
) -> Result<(CompressedRistretto, Vec<u8>, bool), JsValue> {
    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(64, 1);

    let mut transcript = Transcript::new(b"ValueRangeProof");
    if let Some(binding) = binding_tag {
        transcript.append_message(b"bind", binding);
    }

    let (proof, commitment) = RangeProof::prove_single(
        &bp_gens,
        &pc_gens,
        &mut transcript,
        value,
        &blinding,
        64,
    )
    .map_err(|_| JsValue::from_str("range proof generation failed"))?;

    let proof_bytes = proof.to_bytes();

    // Local sanity verification (matches backend behavior)
    let mut verify_transcript = Transcript::new(b"ValueRangeProof");
    if let Some(binding) = binding_tag {
        verify_transcript.append_message(b"bind", binding);
    }

    let verified = RangeProof::verify_single(
        &proof,
        &bp_gens,
        &pc_gens,
        &mut verify_transcript,
        &commitment,
        64,
    )
    .is_ok();

    Ok((commitment, proof_bytes, verified))
}

fn verify_value_commitment_with_binding_internal(
    commitment: CompressedRistretto,
    proof_bytes: Vec<u8>,
    binding_tag: Option<&[u8]>,
) -> bool {
    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(64, 1);
    let mut transcript = Transcript::new(b"ValueRangeProof");

    if let Some(binding) = binding_tag {
        transcript.append_message(b"bind", binding);
    }

    let proof = match RangeProof::from_bytes(&proof_bytes) {
        Ok(p) => p,
        Err(_) => return false,
    };

    RangeProof::verify_single(
        &proof,
        &bp_gens,
        &pc_gens,
        &mut transcript,
        &commitment,
        64,
    )
    .is_ok()
}

fn prove_equality_internal(
    c_left: CompressedRistretto,
    c_right: CompressedRistretto,
    r_left: Scalar,
    r_right: Scalar,
    context_hash: &[u8],
) -> EqualityProof {
    let pc_gens = PedersenGens::default();
    let delta_r = r_left - r_right;

    let mut transcript = Transcript::new(b"EqualityProof-v1");
    transcript.append_message(b"context", context_hash);
    transcript.append_message(b"C_price", c_left.as_bytes());
    transcript.append_message(b"C_pay", c_right.as_bytes());

    let k = Scalar::random(&mut OsRng);
    let r_point = &k * &pc_gens.B_blinding;
    let r_compressed = r_point.compress();

    transcript.append_message(b"R", r_compressed.as_bytes());

    let mut c_bytes = [0u8; 64];
    transcript.challenge_bytes(b"challenge", &mut c_bytes);
    let c = Scalar::from_bytes_mod_order_wide(&c_bytes);
    let s = k + c * delta_r;

    EqualityProof {
        r_announcement: r_compressed.to_bytes(),
        s_response: s.to_bytes(),
    }
}

fn prove_quantity_total_internal(
    c_quantity: CompressedRistretto,
    c_total: CompressedRistretto,
    unit_price: Scalar,
    r_quantity: Scalar,
    r_total: Scalar,
    context_hash: &[u8],
) -> QuantityTotalProof {
    let pc_gens = PedersenGens::default();
    let delta_r = r_total - (unit_price * r_quantity);

    let mut transcript = Transcript::new(b"QuantityTotalProof-v1");
    transcript.append_message(b"context_hash", context_hash);
    transcript.append_message(b"unit_price", unit_price.as_bytes());
    transcript.append_message(b"C_quantity", c_quantity.as_bytes());
    transcript.append_message(b"C_total", c_total.as_bytes());

    let k = Scalar::random(&mut OsRng);
    let r_point = &k * &pc_gens.B_blinding;
    let r_compressed = r_point.compress();

    transcript.append_message(b"R", r_compressed.as_bytes());

    let mut c_bytes = [0u8; 64];
    transcript.challenge_bytes(b"challenge", &mut c_bytes);
    let c = Scalar::from_bytes_mod_order_wide(&c_bytes);
    let s = k + c * delta_r;

    QuantityTotalProof {
        r_announcement: r_compressed.to_bytes(),
        s_response: s.to_bytes(),
    }
}

fn verify_equality_internal(
    c_left: CompressedRistretto,
    c_right: CompressedRistretto,
    proof: &EqualityProof,
    context_hash: &[u8],
) -> bool {
    let pc_gens = PedersenGens::default();

    let mut transcript = Transcript::new(b"EqualityProof-v1");
    transcript.append_message(b"context", context_hash);
    transcript.append_message(b"C_price", c_left.as_bytes());
    transcript.append_message(b"C_pay", c_right.as_bytes());
    transcript.append_message(b"R", &proof.r_announcement);

    let mut c_bytes = [0u8; 64];
    transcript.challenge_bytes(b"challenge", &mut c_bytes);
    let c = Scalar::from_bytes_mod_order_wide(&c_bytes);

    let r_point = match CompressedRistretto(proof.r_announcement).decompress() {
        Some(point) => point,
        None => return false,
    };
    let s = match Scalar::from_canonical_bytes(proof.s_response) {
        Some(scalar) => scalar,
        None => return false,
    };

    let c_left_point = match c_left.decompress() {
        Some(point) => point,
        None => return false,
    };
    let c_right_point = match c_right.decompress() {
        Some(point) => point,
        None => return false,
    };

    let d = c_left_point - c_right_point;
    let lhs = &s * &pc_gens.B_blinding;
    let rhs = r_point + (&c * d);
    lhs.compress() == rhs.compress()
}

fn verify_quantity_total_internal(
    c_quantity: CompressedRistretto,
    c_total: CompressedRistretto,
    unit_price: Scalar,
    proof: &QuantityTotalProof,
    context_hash: &[u8],
) -> bool {
    let pc_gens = PedersenGens::default();

    let mut transcript = Transcript::new(b"QuantityTotalProof-v1");
    transcript.append_message(b"context_hash", context_hash);
    transcript.append_message(b"unit_price", unit_price.as_bytes());
    transcript.append_message(b"C_quantity", c_quantity.as_bytes());
    transcript.append_message(b"C_total", c_total.as_bytes());
    transcript.append_message(b"R", &proof.r_announcement);

    let mut c_bytes = [0u8; 64];
    transcript.challenge_bytes(b"challenge", &mut c_bytes);
    let c = Scalar::from_bytes_mod_order_wide(&c_bytes);

    let r_point = match CompressedRistretto(proof.r_announcement).decompress() {
        Some(point) => point,
        None => return false,
    };
    let s = match Scalar::from_canonical_bytes(proof.s_response) {
        Some(scalar) => scalar,
        None => return false,
    };

    let c_quantity_point = match c_quantity.decompress() {
        Some(point) => point,
        None => return false,
    };
    let c_total_point = match c_total.decompress() {
        Some(point) => point,
        None => return false,
    };

    let d = c_total_point - (&unit_price * &c_quantity_point);
    let lhs = &s * &pc_gens.B_blinding;
    let rhs = r_point + (&c * d);
    lhs.compress() == rhs.compress()
}

fn to_js_value<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(value)
        .map_err(|_| JsValue::from_str("failed to serialize wasm response"))
}

#[wasm_bindgen(start)]
pub fn wasm_start() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn zkp_wasm_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[wasm_bindgen]
pub fn generate_value_commitment_with_blinding(
    value: String,
    blinding_hex: String,
) -> Result<JsValue, JsValue> {
    generate_value_commitment_with_binding(value, blinding_hex, None)
}

#[wasm_bindgen]
pub fn generate_scalar_commitment_with_blinding(
    value: String,
    blinding_hex: String,
) -> Result<JsValue, JsValue> {
    let scalar_value = parse_decimal_scalar_strict(&value, "value")?;
    let blinding = Scalar::from_bytes_mod_order(parse_fixed_32_hex(&blinding_hex, "blinding_hex")?);
    let commitment = PedersenGens::default().commit(scalar_value, blinding).compress();

    to_js_value(&ScalarCommitmentResponse {
        commitment: hex::encode(commitment.as_bytes()),
        proof: None,
        verified: true,
        proof_type: "pedersen-scalar-v2".to_string(),
    })
}

#[wasm_bindgen]
pub fn generate_value_commitment_with_binding(
    value: String,
    blinding_hex: String,
    binding_tag_hex: Option<String>,
) -> Result<JsValue, JsValue> {
    let value_u64 = parse_u64(&value)?;
    let blinding_bytes = parse_fixed_32_hex(&blinding_hex, "blinding_hex")?;
    let blinding = Scalar::from_bytes_mod_order(blinding_bytes);
    let binding_tag = parse_optional_binding_tag(binding_tag_hex)?;

    let (commitment, proof_bytes, verified) = prove_value_commitment_with_binding_internal(
        value_u64,
        blinding,
        binding_tag.as_deref(),
    )?;

    let response = ValueCommitmentResponse {
        commitment: hex::encode(commitment.as_bytes()),
        proof: hex::encode(proof_bytes),
        verified,
    };

    to_js_value(&response)
}

#[wasm_bindgen]
pub fn verify_value_commitment(
    commitment_hex: String,
    proof_hex: String,
    binding_tag_hex: Option<String>,
) -> Result<JsValue, JsValue> {
    let commitment_bytes = parse_fixed_32_hex(&commitment_hex, "commitment")?;
    let proof_bytes = parse_hex_vec(&proof_hex, "proof")?;
    let binding_tag = parse_optional_binding_tag(binding_tag_hex)?;

    let verified = verify_value_commitment_with_binding_internal(
        CompressedRistretto(commitment_bytes),
        proof_bytes,
        binding_tag.as_deref(),
    );

    let response = ValueVerifyResponse { verified };
    to_js_value(&response)
}

#[wasm_bindgen]
pub fn generate_equality_proof(
    c_left_hex: String,
    c_right_hex: String,
    r_left_hex: String,
    r_right_hex: String,
    context_hash_hex: String,
) -> Result<JsValue, JsValue> {
    let c_left = parse_compressed_ristretto(&c_left_hex, "c_left_hex")?;
    let c_right = parse_compressed_ristretto(&c_right_hex, "c_right_hex")?;
    let r_left = Scalar::from_bytes_mod_order(parse_fixed_32_hex(&r_left_hex, "r_left_hex")?);
    let r_right = Scalar::from_bytes_mod_order(parse_fixed_32_hex(&r_right_hex, "r_right_hex")?);
    let context_hash = parse_fixed_32_hex(&context_hash_hex, "context_hash_hex")?;

    let proof = prove_equality_internal(c_left, c_right, r_left, r_right, &context_hash);
    let verified = verify_equality_internal(c_left, c_right, &proof, &context_hash);

    to_js_value(&ProofGenerationResponse {
        proof_r_hex: hex::encode(proof.r_announcement),
        proof_s_hex: hex::encode(proof.s_response),
        verified,
    })
}

#[wasm_bindgen]
pub fn generate_quantity_total_proof(
    c_quantity_hex: String,
    c_total_hex: String,
    unit_price_wei: String,
    r_quantity_hex: String,
    r_total_hex: String,
    context_hash_hex: String,
) -> Result<JsValue, JsValue> {
    let c_quantity = parse_compressed_ristretto(&c_quantity_hex, "c_quantity_hex")?;
    let c_total = parse_compressed_ristretto(&c_total_hex, "c_total_hex")?;
    let unit_price = parse_decimal_scalar_strict(&unit_price_wei, "unit_price_wei")?;
    let r_quantity =
        Scalar::from_bytes_mod_order(parse_fixed_32_hex(&r_quantity_hex, "r_quantity_hex")?);
    let r_total = Scalar::from_bytes_mod_order(parse_fixed_32_hex(&r_total_hex, "r_total_hex")?);
    let context_hash = parse_fixed_32_hex(&context_hash_hex, "context_hash_hex")?;

    let proof = prove_quantity_total_internal(
        c_quantity,
        c_total,
        unit_price,
        r_quantity,
        r_total,
        &context_hash,
    );
    let verified = verify_quantity_total_internal(c_quantity, c_total, unit_price, &proof, &context_hash);

    to_js_value(&ProofGenerationResponse {
        proof_r_hex: hex::encode(proof.r_announcement),
        proof_s_hex: hex::encode(proof.s_response),
        verified,
    })
}

#[wasm_bindgen]
pub fn generate_total_payment_equality_proof(
    c_total_hex: String,
    c_pay_hex: String,
    r_total_hex: String,
    r_pay_hex: String,
    context_hash_hex: String,
) -> Result<JsValue, JsValue> {
    let c_total = parse_compressed_ristretto(&c_total_hex, "c_total_hex")?;
    let c_pay = parse_compressed_ristretto(&c_pay_hex, "c_pay_hex")?;
    let r_total = Scalar::from_bytes_mod_order(parse_fixed_32_hex(&r_total_hex, "r_total_hex")?);
    let r_pay = Scalar::from_bytes_mod_order(parse_fixed_32_hex(&r_pay_hex, "r_pay_hex")?);
    let context_hash = parse_fixed_32_hex(&context_hash_hex, "context_hash_hex")?;

    let proof = prove_equality_internal(c_total, c_pay, r_total, r_pay, &context_hash);
    let verified = verify_equality_internal(c_total, c_pay, &proof, &context_hash);

    to_js_value(&ProofGenerationResponse {
        proof_r_hex: hex::encode(proof.r_announcement),
        proof_s_hex: hex::encode(proof.s_response),
        verified,
    })
}

#[wasm_bindgen]
pub fn verify_equality_proof(
    c_left_hex: String,
    c_right_hex: String,
    proof_r_hex: String,
    proof_s_hex: String,
    context_hash_hex: String,
) -> Result<JsValue, JsValue> {
    let c_left = parse_compressed_ristretto(&c_left_hex, "c_left_hex")?;
    let c_right = parse_compressed_ristretto(&c_right_hex, "c_right_hex")?;
    let context_hash = parse_fixed_32_hex(&context_hash_hex, "context_hash_hex")?;
    let (proof_r, proof_s) = parse_proof_hex_pair(&proof_r_hex, &proof_s_hex)?;

    let verified = verify_equality_internal(
        c_left,
        c_right,
        &EqualityProof {
            r_announcement: proof_r,
            s_response: proof_s,
        },
        &context_hash,
    );

    to_js_value(&EqualityVerifyResponse { verified })
}

#[wasm_bindgen]
pub fn verify_quantity_total_proof(
    c_quantity_hex: String,
    c_total_hex: String,
    unit_price_wei: String,
    proof_r_hex: String,
    proof_s_hex: String,
    context_hash_hex: String,
) -> Result<JsValue, JsValue> {
    let c_quantity = parse_compressed_ristretto(&c_quantity_hex, "c_quantity_hex")?;
    let c_total = parse_compressed_ristretto(&c_total_hex, "c_total_hex")?;
    let unit_price = parse_decimal_scalar_strict(&unit_price_wei, "unit_price_wei")?;
    let context_hash = parse_fixed_32_hex(&context_hash_hex, "context_hash_hex")?;
    let (proof_r, proof_s) = parse_proof_hex_pair(&proof_r_hex, &proof_s_hex)?;

    let verified = verify_quantity_total_internal(
        c_quantity,
        c_total,
        unit_price,
        &QuantityTotalProof {
            r_announcement: proof_r,
            s_response: proof_s,
        },
        &context_hash,
    );

    to_js_value(&QuantityTotalVerifyResponse { verified })
}

#[wasm_bindgen]
pub fn verify_total_payment_equality_proof(
    c_total_hex: String,
    c_pay_hex: String,
    proof_r_hex: String,
    proof_s_hex: String,
    context_hash_hex: String,
) -> Result<JsValue, JsValue> {
    let c_total = parse_compressed_ristretto(&c_total_hex, "c_total_hex")?;
    let c_pay = parse_compressed_ristretto(&c_pay_hex, "c_pay_hex")?;
    let context_hash = parse_fixed_32_hex(&context_hash_hex, "context_hash_hex")?;
    let (proof_r, proof_s) = parse_proof_hex_pair(&proof_r_hex, &proof_s_hex)?;

    let verified = verify_equality_internal(
        c_total,
        c_pay,
        &EqualityProof {
            r_announcement: proof_r,
            s_response: proof_s,
        },
        &context_hash,
    );

    to_js_value(&EqualityVerifyResponse { verified })
}
