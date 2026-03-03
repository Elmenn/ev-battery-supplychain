use bulletproofs::{BulletproofGens, PedersenGens, RangeProof};
use curve25519_dalek_ng::ristretto::CompressedRistretto;
use curve25519_dalek_ng::scalar::Scalar;
use merlin::Transcript;
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

fn parse_u64(value: &str) -> Result<u64, JsValue> {
    value
        .trim()
        .parse::<u64>()
        .map_err(|_| JsValue::from_str("invalid value: expected unsigned 64-bit integer string"))
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
