/**
 * equalityProofClient.js — Dual-mode dispatch for Schnorr sigma equality proofs.
 *
 * Mirrors the dispatchWithMode pattern from zkpClient.js.
 * Phase 1 deployment: backend mode only.
 * WASM stubs throw "not yet implemented" — when WASM bindings are added later,
 * replace the stubs with real WASM calls and enable shadow mode comparison.
 *
 * Equality proof backend endpoints (port 5010):
 *   POST /zkp/generate-equality-proof
 *   POST /zkp/verify-equality-proof
 *   POST /zkp/generate-quantity-total-proof
 *   POST /zkp/verify-quantity-total-proof
 *   POST /zkp/generate-total-payment-equality-proof
 *   POST /zkp/verify-total-payment-equality-proof
 */

import { getZkpMode, ZKP_MODE_BACKEND, ZKP_MODE_WASM } from './zkp/zkpClient';

const DEFAULT_ZKP_BACKEND_URL = 'http://localhost:5010';

function resolveBackendUrl() {
  return process.env.REACT_APP_ZKP_BACKEND_URL || DEFAULT_ZKP_BACKEND_URL;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ZKP backend error: ${errorText}`);
  }
  return response.json();
}

// --- Backend provider functions ---------------------------------------------

async function generateEqualityProofBackend({
  cPriceHex,
  cPayHex,
  rPriceHex,
  rPayHex,
  bindingContext,
  contextHashHex,
}) {
  return postJson(`${resolveBackendUrl()}/zkp/generate-equality-proof`, {
    c_price_hex: cPriceHex,
    c_pay_hex: cPayHex,
    r_price_hex: rPriceHex,
    r_pay_hex: rPayHex,
    binding_context: bindingContext,
    context_hash_hex: contextHashHex || undefined,
  });
}

async function verifyEqualityProofBackend({
  cPriceHex,
  cPayHex,
  proofRHex,
  proofSHex,
  bindingContext,
  contextHashHex,
}) {
  return postJson(`${resolveBackendUrl()}/zkp/verify-equality-proof`, {
    c_price_hex: cPriceHex,
    c_pay_hex: cPayHex,
    proof_r_hex: proofRHex,
    proof_s_hex: proofSHex,
    binding_context: bindingContext,
    context_hash_hex: contextHashHex || undefined,
  });
}

async function generateQuantityTotalProofBackend({
  cQuantityHex,
  cTotalHex,
  unitPriceWei,
  rQuantityHex,
  rTotalHex,
  contextHashHex,
}) {
  return postJson(`${resolveBackendUrl()}/zkp/generate-quantity-total-proof`, {
    c_quantity_hex: cQuantityHex,
    c_total_hex: cTotalHex,
    unit_price_wei: unitPriceWei,
    r_quantity_hex: rQuantityHex,
    r_total_hex: rTotalHex,
    context_hash_hex: contextHashHex,
  });
}

async function verifyQuantityTotalProofBackend({
  cQuantityHex,
  cTotalHex,
  unitPriceWei,
  proofRHex,
  proofSHex,
  contextHashHex,
}) {
  return postJson(`${resolveBackendUrl()}/zkp/verify-quantity-total-proof`, {
    c_quantity_hex: cQuantityHex,
    c_total_hex: cTotalHex,
    unit_price_wei: unitPriceWei,
    proof_r_hex: proofRHex,
    proof_s_hex: proofSHex,
    context_hash_hex: contextHashHex,
  });
}

async function generateTotalPaymentEqualityProofBackend({
  cTotalHex,
  cPayHex,
  rTotalHex,
  rPayHex,
  contextHashHex,
}) {
  return postJson(`${resolveBackendUrl()}/zkp/generate-total-payment-equality-proof`, {
    c_total_hex: cTotalHex,
    c_pay_hex: cPayHex,
    r_total_hex: rTotalHex,
    r_pay_hex: rPayHex,
    context_hash_hex: contextHashHex,
  });
}

async function verifyTotalPaymentEqualityProofBackend({
  cTotalHex,
  cPayHex,
  proofRHex,
  proofSHex,
  contextHashHex,
}) {
  return postJson(`${resolveBackendUrl()}/zkp/verify-total-payment-equality-proof`, {
    c_total_hex: cTotalHex,
    c_pay_hex: cPayHex,
    proof_r_hex: proofRHex,
    proof_s_hex: proofSHex,
    context_hash_hex: contextHashHex,
  });
}

// --- WASM stubs (Phase 1: not yet implemented) ------------------------------

async function generateEqualityProofWasm(_params) {
  throw new Error(
    '[EqualityProof] WASM backend not yet implemented. Set REACT_APP_ZKP_MODE=backend.'
  );
}

async function verifyEqualityProofWasm(_params) {
  throw new Error(
    '[EqualityProof] WASM backend not yet implemented. Set REACT_APP_ZKP_MODE=backend.'
  );
}

async function generateQuantityTotalProofWasm(_params) {
  throw new Error(
    '[EqualityProof] WASM quantity-total backend not yet implemented. Set REACT_APP_ZKP_MODE=backend.'
  );
}

async function verifyQuantityTotalProofWasm(_params) {
  throw new Error(
    '[EqualityProof] WASM quantity-total backend not yet implemented. Set REACT_APP_ZKP_MODE=backend.'
  );
}

async function generateTotalPaymentEqualityProofWasm(_params) {
  throw new Error(
    '[EqualityProof] WASM total-payment equality backend not yet implemented. Set REACT_APP_ZKP_MODE=backend.'
  );
}

async function verifyTotalPaymentEqualityProofWasm(_params) {
  throw new Error(
    '[EqualityProof] WASM total-payment equality backend not yet implemented. Set REACT_APP_ZKP_MODE=backend.'
  );
}

// --- Dispatch ---------------------------------------------------------------

function compareEqualityProofResult(backendResult, wasmResult) {
  return (
    String(backendResult?.proof_r_hex || '').toLowerCase() ===
    String(wasmResult?.proof_r_hex || '').toLowerCase()
  );
}

function compareVerifyResult(backendResult, wasmResult) {
  return Boolean(backendResult?.verified) === Boolean(wasmResult?.verified);
}

async function dispatchEqualityWithMode({ operation, params, backendFn, wasmFn, comparer }) {
  const mode = getZkpMode();

  if (mode === ZKP_MODE_BACKEND) {
    return backendFn(params);
  }

  if (mode === ZKP_MODE_WASM) {
    return wasmFn(params);
  }

  // Shadow mode: run backend authoritatively, compare with WASM
  const backendResult = await backendFn(params);
  try {
    const wasmResult = await wasmFn(params);
    if (!comparer(backendResult, wasmResult)) {
      console.warn(`[EqualityProof][shadow] Mismatch in ${operation}`, { backendResult, wasmResult });
    }
  } catch (err) {
    console.warn(`[EqualityProof][shadow] WASM execution failed in ${operation}:`, err.message);
  }
  return backendResult;
}

// --- Public API -------------------------------------------------------------

/**
 * Generate a Schnorr sigma equality proof via the ZKP backend.
 *
 * @param {object} params
 * @param {string} params.cPriceHex     - C_price commitment hex (seller's commitment)
 * @param {string} params.cPayHex       - C_pay commitment hex (buyer's commitment)
 * @param {string} params.rPriceHex     - Blinding factor of C_price (deterministic blinding)
 * @param {string} params.rPayHex       - Blinding factor of C_pay (random r_pay from blob)
 * @param {object} params.bindingContext - { productId, txRef, chainId, escrowAddr, stage }
 * @returns {Promise<{ proof_r_hex: string, proof_s_hex: string, verified: boolean }>}
 */
export async function generateEqualityProof(params) {
  return dispatchEqualityWithMode({
    operation: 'generate-equality-proof',
    params,
    backendFn: generateEqualityProofBackend,
    wasmFn: generateEqualityProofWasm,
    comparer: compareEqualityProofResult,
  });
}

/**
 * Verify a Schnorr sigma equality proof via the ZKP backend.
 *
 * @param {object} params
 * @param {string} params.cPriceHex     - C_price commitment hex
 * @param {string} params.cPayHex       - C_pay commitment hex
 * @param {string} params.proofRHex     - proof.r_announcement hex
 * @param {string} params.proofSHex     - proof.s_response hex
 * @param {object} params.bindingContext - { productId, txRef, chainId, escrowAddr, stage }
 * @returns {Promise<{ verified: boolean }>}
 */
export async function verifyEqualityProof(params) {
  return dispatchEqualityWithMode({
    operation: 'verify-equality-proof',
    params,
    backendFn: verifyEqualityProofBackend,
    wasmFn: verifyEqualityProofWasm,
    comparer: compareVerifyResult,
  });
}

export async function generateQuantityTotalProof(params) {
  return dispatchEqualityWithMode({
    operation: 'generate-quantity-total-proof',
    params,
    backendFn: generateQuantityTotalProofBackend,
    wasmFn: generateQuantityTotalProofWasm,
    comparer: compareEqualityProofResult,
  });
}

export async function verifyQuantityTotalProof(params) {
  return dispatchEqualityWithMode({
    operation: 'verify-quantity-total-proof',
    params,
    backendFn: verifyQuantityTotalProofBackend,
    wasmFn: verifyQuantityTotalProofWasm,
    comparer: compareVerifyResult,
  });
}

export async function generateTotalPaymentEqualityProof(params) {
  return dispatchEqualityWithMode({
    operation: 'generate-total-payment-equality-proof',
    params,
    backendFn: generateTotalPaymentEqualityProofBackend,
    wasmFn: generateTotalPaymentEqualityProofWasm,
    comparer: compareEqualityProofResult,
  });
}

export async function verifyTotalPaymentEqualityProof(params) {
  return dispatchEqualityWithMode({
    operation: 'verify-total-payment-equality-proof',
    params,
    backendFn: verifyTotalPaymentEqualityProofBackend,
    wasmFn: verifyTotalPaymentEqualityProofWasm,
    comparer: compareVerifyResult,
  });
}
