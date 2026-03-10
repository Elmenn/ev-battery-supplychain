import {
  generateScalarCommitmentWithBlindingBackend,
  generateValueCommitmentWithBindingBackend,
  generateValueCommitmentWithBlindingBackend,
  verifyProofByEndpointBackend,
  verifyValueCommitmentBackend,
} from "./providers/backendProvider";
import {
  generateScalarCommitmentWithBlindingWasm,
  generateValueCommitmentWithBindingWasm,
  generateValueCommitmentWithBlindingWasm,
  verifyValueCommitmentWasm,
} from "./providers/wasmProvider";

export const ZKP_MODE_BACKEND = "backend";
export const ZKP_MODE_WASM = "wasm";
export const ZKP_MODE_SHADOW = "shadow";

const SUPPORTED_ZKP_MODES = new Set([
  ZKP_MODE_BACKEND,
  ZKP_MODE_WASM,
  ZKP_MODE_SHADOW,
]);

function getRawMode() {
  return (process.env.REACT_APP_ZKP_MODE || ZKP_MODE_BACKEND).trim().toLowerCase();
}

export function getZkpMode() {
  const mode = getRawMode();
  if (SUPPORTED_ZKP_MODES.has(mode)) {
    return mode;
  }
  console.warn(`[ZKP] Unknown REACT_APP_ZKP_MODE "${mode}". Falling back to "${ZKP_MODE_BACKEND}".`);
  return ZKP_MODE_BACKEND;
}

function logShadowMismatch(operation, details) {
  console.warn(`[ZKP][shadow] Mismatch in ${operation}`, details);
}

function runShadowComparison({
  operation,
  backendResult,
  wasmResult,
  comparer,
}) {
  try {
    if (!comparer(backendResult, wasmResult)) {
      logShadowMismatch(operation, { backendResult, wasmResult });
    }
  } catch (error) {
    console.warn(`[ZKP][shadow] Comparison failure in ${operation}:`, error);
  }
}

async function dispatchWithMode({
  operation,
  params,
  backendFn,
  wasmFn,
  comparer,
}) {
  const mode = getZkpMode();

  if (mode === ZKP_MODE_BACKEND) {
    return backendFn(params);
  }

  if (mode === ZKP_MODE_WASM) {
    return wasmFn(params);
  }

  const backendResult = await backendFn(params);
  try {
    const wasmResult = await wasmFn(params);
    runShadowComparison({
      operation,
      backendResult,
      wasmResult,
      comparer,
    });
  } catch (error) {
    console.warn(`[ZKP][shadow] WASM execution failed in ${operation}:`, error);
  }
  return backendResult;
}

function compareGenerationResult(backendResult, wasmResult) {
  return (
    String(backendResult?.commitment || "").toLowerCase() ===
      String(wasmResult?.commitment || "").toLowerCase() &&
    Boolean(backendResult?.verified) === Boolean(wasmResult?.verified)
  );
}

function compareVerificationResult(backendResult, wasmResult) {
  return Boolean(backendResult?.verified) === Boolean(wasmResult?.verified);
}

export async function generateValueCommitmentWithBlinding(params) {
  return dispatchWithMode({
    operation: "generate-value-commitment-with-blinding",
    params,
    backendFn: generateValueCommitmentWithBlindingBackend,
    wasmFn: generateValueCommitmentWithBlindingWasm,
    comparer: compareGenerationResult,
  });
}

export async function generateScalarCommitmentWithBlinding(params) {
  return dispatchWithMode({
    operation: "generate-scalar-commitment-with-blinding",
    params,
    backendFn: generateScalarCommitmentWithBlindingBackend,
    wasmFn: generateScalarCommitmentWithBlindingWasm,
    comparer: compareGenerationResult,
  });
}

export async function generateValueCommitmentWithBinding(params) {
  return dispatchWithMode({
    operation: "generate-value-commitment-with-binding",
    params,
    backendFn: generateValueCommitmentWithBindingBackend,
    wasmFn: generateValueCommitmentWithBindingWasm,
    comparer: compareGenerationResult,
  });
}

export async function verifyValueCommitment(params) {
  return dispatchWithMode({
    operation: "verify-value-commitment",
    params,
    backendFn: verifyValueCommitmentBackend,
    wasmFn: verifyValueCommitmentWasm,
    comparer: compareVerificationResult,
  });
}

export async function verifyProofByEndpoint({
  endpoint,
  commitment,
  proof,
  bindingTagHex,
  zkpBackendUrl,
}) {
  if (endpoint === "verify-value-commitment") {
    return verifyValueCommitment({
      commitment,
      proof,
      bindingTagHex,
      zkpBackendUrl,
    });
  }

  const mode = getZkpMode();
  if (mode === ZKP_MODE_WASM) {
    throw new Error(
      `Endpoint "${endpoint}" is not implemented in wasm mode yet. Use REACT_APP_ZKP_MODE=backend or shadow.`,
    );
  }

  return verifyProofByEndpointBackend({
    endpoint,
    commitment,
    proof,
    bindingTagHex,
    zkpBackendUrl,
  });
}
