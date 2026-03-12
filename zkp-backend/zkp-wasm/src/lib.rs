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
struct ScalarCommitmentResponse {
    commitment: String,
    proof: Option<String>,
    verified: bool,
    proof_type: String,
}

#[derive(Serialize)]
struct EqualityProofResponse {
    proof_r_hex: String,
    proof_s_hex: String,
    verified: bool,
}

#[derive(Serialize)]
struct VerifyResponse {
    verified: bool,
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

fn parse_decimal_scalar_strict(value: &str) -> Result<Scalar, JsValue> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(JsValue::from_str("invalid value: empty decimal string"));
    }

    let parsed = BigUint::parse_bytes(trimmed.as_bytes(), 10)
        .ok_or_else(|| JsValue::from_str("invalid value: expected decimal scalar string"))?;
    let bytes_le = parsed.to_bytes_le();
    if bytes_le.len() > 32 {
        return Err(JsValue::from_str(
            "invalid value: decimal scalar exceeds 32-byte canonical range",
        ));
    }

    let mut scalar_bytes = [0u8; 32];
    scalar_bytes[..bytes_le.len()].copy_from_slice(&bytes_le);
    Scalar::from_canonical_bytes(scalar_bytes).ok_or_else(|| {
        JsValue::from_str("invalid value: expected canonical non-negative decimal scalar")
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

fn parse_optional_binding_tag(binding_tag_hex: Option<String>) -> Result<Option<Vec<u8>>, JsValue> {
    match binding_tag_hex {
        Some(value) => {
            let arr = parse_fixed_32_hex(&value, "binding_tag_hex")?;
            Ok(Some(arr.to_vec()))
        }
        None => Ok(None),
    }
}

fn parse_commitment_hex(input: &str, field_name: &str) -> Result<CompressedRistretto, JsValue> {
    Ok(CompressedRistretto(parse_fixed_32_hex(input, field_name)?))
}

fn parse_scalar_hex(input: &str, field_name: &str) -> Result<Scalar, JsValue> {
    Ok(Scalar::from_bytes_mod_order(parse_fixed_32_hex(input, field_name)?))
}

fn to_js_value<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(value)
        .map_err(|_| JsValue::from_str("failed to serialize wasm response"))
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
        Ok(proof) => proof,
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
    binding_context: &[u8],
) -> Result<EqualityProof, JsValue> {
    let pc_gens = PedersenGens::default();
    let delta_r = r_left - r_right;

    let mut transcript = Transcript::new(b"EqualityProof-v1");
    transcript.append_message(b"context", binding_context);
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

    Ok(EqualityProof {
        r_announcement: r_compressed.to_bytes(),
        s_response: s.to_bytes(),
    })
}

fn verify_equality_internal(
    c_left: CompressedRistretto,
    c_right: CompressedRistretto,
    proof: &EqualityProof,
    binding_context: &[u8],
) -> bool {
    let pc_gens = PedersenGens::default();

    let mut transcript = Transcript::new(b"EqualityProof-v1");
    transcript.append_message(b"context", binding_context);
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
    let left = match c_left.decompress() {
        Some(point) => point,
        None => return false,
    };
    let right = match c_right.decompress() {
        Some(point) => point,
        None => return false,
    };

    let d = left - right;
    let lhs = &s * &pc_gens.B_blinding;
    let rhs = r_point + &c * d;
    lhs.compress() == rhs.compress()
}

fn prove_quantity_total_internal(
    c_quantity: CompressedRistretto,
    c_total: CompressedRistretto,
    unit_price: Scalar,
    r_quantity: Scalar,
    r_total: Scalar,
    context_hash: &[u8],
) -> Result<QuantityTotalProof, JsValue> {
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

    Ok(QuantityTotalProof {
        r_announcement: r_compressed.to_bytes(),
        s_response: s.to_bytes(),
    })
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
    let quantity = match c_quantity.decompress() {
        Some(point) => point,
        None => return false,
    };
    let total = match c_total.decompress() {
        Some(point) => point,
        None => return false,
    };

    let d = total - (&unit_price * &quantity);
    let lhs = &s * &pc_gens.B_blinding;
    let rhs = r_point + (&c * d);
    lhs.compress() == rhs.compress()
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
pub fn generate_value_commitment_with_binding(
    value: String,
    blinding_hex: String,
    binding_tag_hex: Option<String>,
) -> Result<JsValue, JsValue> {
    let value_u64 = parse_u64(&value)?;
    let blinding = Scalar::from_bytes_mod_order(parse_fixed_32_hex(&blinding_hex, "blinding_hex")?);
    let binding_tag = parse_optional_binding_tag(binding_tag_hex)?;

    let (commitment, proof_bytes, verified) =
        prove_value_commitment_with_binding_internal(value_u64, blinding, binding_tag.as_deref())?;

    to_js_value(&ValueCommitmentResponse {
        commitment: hex::encode(commitment.as_bytes()),
        proof: hex::encode(proof_bytes),
        verified,
    })
}

#[wasm_bindgen]
pub fn verify_value_commitment(
    commitment_hex: String,
    proof_hex: String,
    binding_tag_hex: Option<String>,
) -> Result<JsValue, JsValue> {
    let commitment = parse_commitment_hex(&commitment_hex, "commitment")?;
    let proof_bytes = parse_hex_vec(&proof_hex, "proof")?;
    let binding_tag = parse_optional_binding_tag(binding_tag_hex)?;

    to_js_value(&VerifyResponse {
        verified: verify_value_commitment_with_binding_internal(
            commitment,
            proof_bytes,
            binding_tag.as_deref(),
        ),
    })
}

#[wasm_bindgen]
pub fn generate_scalar_commitment_with_blinding(
    value: String,
    blinding_hex: String,
) -> Result<JsValue, JsValue> {
    let value_scalar = parse_decimal_scalar_strict(&value)?;
    let blinding = Scalar::from_bytes_mod_order(parse_fixed_32_hex(&blinding_hex, "blinding_hex")?);
    let commitment = PedersenGens::default()
        .commit(value_scalar, blinding)
        .compress();

    to_js_value(&ScalarCommitmentResponse {
        commitment: hex::encode(commitment.as_bytes()),
        proof: None,
        verified: true,
        proof_type: "pedersen-scalar-v2".to_string(),
    })
}

#[wasm_bindgen]
pub fn generate_equality_proof(
    c_left_hex: String,
    c_right_hex: String,
    r_left_hex: String,
    r_right_hex: String,
    context_hash_hex: String,
) -> Result<JsValue, JsValue> {
    let c_left = parse_commitment_hex(&c_left_hex, "c_left_hex")?;
    let c_right = parse_commitment_hex(&c_right_hex, "c_right_hex")?;
    let r_left = parse_scalar_hex(&r_left_hex, "r_left_hex")?;
    let r_right = parse_scalar_hex(&r_right_hex, "r_right_hex")?;
    let context_hash = parse_fixed_32_hex(&context_hash_hex, "context_hash_hex")?;

    let proof = prove_equality_internal(c_left, c_right, r_left, r_right, &context_hash)?;
    let verified = verify_equality_internal(c_left, c_right, &proof, &context_hash);

    to_js_value(&EqualityProofResponse {
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
    let c_left = parse_commitment_hex(&c_left_hex, "c_left_hex")?;
    let c_right = parse_commitment_hex(&c_right_hex, "c_right_hex")?;
    let context_hash = parse_fixed_32_hex(&context_hash_hex, "context_hash_hex")?;
    let proof = EqualityProof {
        r_announcement: parse_fixed_32_hex(&proof_r_hex, "proof_r_hex")?,
        s_response: parse_fixed_32_hex(&proof_s_hex, "proof_s_hex")?,
    };

    to_js_value(&VerifyResponse {
        verified: verify_equality_internal(c_left, c_right, &proof, &context_hash),
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
    let c_quantity = parse_commitment_hex(&c_quantity_hex, "c_quantity_hex")?;
    let c_total = parse_commitment_hex(&c_total_hex, "c_total_hex")?;
    let unit_price = parse_decimal_scalar_strict(&unit_price_wei)?;
    let r_quantity = parse_scalar_hex(&r_quantity_hex, "r_quantity_hex")?;
    let r_total = parse_scalar_hex(&r_total_hex, "r_total_hex")?;
    let context_hash = parse_fixed_32_hex(&context_hash_hex, "context_hash_hex")?;

    let proof = prove_quantity_total_internal(
        c_quantity,
        c_total,
        unit_price,
        r_quantity,
        r_total,
        &context_hash,
    )?;
    let verified = verify_quantity_total_internal(c_quantity, c_total, unit_price, &proof, &context_hash);

    to_js_value(&EqualityProofResponse {
        proof_r_hex: hex::encode(proof.r_announcement),
        proof_s_hex: hex::encode(proof.s_response),
        verified,
    })
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
    let c_quantity = parse_commitment_hex(&c_quantity_hex, "c_quantity_hex")?;
    let c_total = parse_commitment_hex(&c_total_hex, "c_total_hex")?;
    let unit_price = parse_decimal_scalar_strict(&unit_price_wei)?;
    let context_hash = parse_fixed_32_hex(&context_hash_hex, "context_hash_hex")?;
    let proof = QuantityTotalProof {
        r_announcement: parse_fixed_32_hex(&proof_r_hex, "proof_r_hex")?,
        s_response: parse_fixed_32_hex(&proof_s_hex, "proof_s_hex")?,
    };

    to_js_value(&VerifyResponse {
        verified: verify_quantity_total_internal(c_quantity, c_total, unit_price, &proof, &context_hash),
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
    generate_equality_proof(c_total_hex, c_pay_hex, r_total_hex, r_pay_hex, context_hash_hex)
}

#[wasm_bindgen]
pub fn verify_total_payment_equality_proof(
    c_total_hex: String,
    c_pay_hex: String,
    proof_r_hex: String,
    proof_s_hex: String,
    context_hash_hex: String,
) -> Result<JsValue, JsValue> {
    verify_equality_proof(c_total_hex, c_pay_hex, proof_r_hex, proof_s_hex, context_hash_hex)
}
