const DEFAULT_WORKER_TIMEOUT_MS = 120000;

let wasmWorker = null;
let nextRequestId = 1;
const pendingRequests = new Map();

function resetWorkerState(errorMessage) {
  pendingRequests.forEach(({ reject, timer }) => {
    if (timer) clearTimeout(timer);
    reject(new Error(errorMessage));
  });
  pendingRequests.clear();

  if (wasmWorker) {
    try {
      wasmWorker.terminate();
    } catch {
      // no-op
    }
    wasmWorker = null;
  }
}

function ensureWasmWorker() {
  if (!wasmWorker) {
    const publicUrl = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
    const workerUrl = `${publicUrl}/wasmZkpWorker.js`;

    wasmWorker = new Worker(
      workerUrl,
      {
        type: "module",
      },
    );

    wasmWorker.onmessage = (event) => {
      const { id, ok, result, error } = event.data || {};
      const pending = pendingRequests.get(id);
      if (!pending) return;

      if (pending.timer) clearTimeout(pending.timer);
      pendingRequests.delete(id);

      if (ok) {
        pending.resolve(result);
      } else {
        pending.reject(new Error(error || "Unknown wasm worker error"));
      }
    };

    wasmWorker.onerror = (event) => {
      const errorText = event?.message || "Unhandled wasm worker error";
      resetWorkerState(`[ZKP][wasm] ${errorText}`);
    };
  }
  return wasmWorker;
}

function normalizeHex(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeValue(value) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid value for wasm proving: ${value}`);
    }
    return Math.trunc(value).toString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new Error("Invalid value for wasm proving: empty string");
    }
    return trimmed;
  }
  throw new Error(`Unsupported value type for wasm proving: ${typeof value}`);
}

function mapWasmError(operation, error) {
  const message = error?.message || String(error);
  return new Error(`[ZKP][wasm] ${operation} failed: ${message}`);
}

function callWorker(method, payload, timeoutMs = DEFAULT_WORKER_TIMEOUT_MS) {
  const worker = ensureWasmWorker();
  const id = `${Date.now()}-${nextRequestId++}`;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`WASM worker timeout after ${timeoutMs}ms for "${method}"`));
    }, timeoutMs);

    pendingRequests.set(id, { resolve, reject, timer });
    worker.postMessage({
      id,
      method,
      payload,
      publicUrl: (process.env.PUBLIC_URL || "").replace(/\/$/, ""),
    });
  });
}

export async function generateValueCommitmentWithBlindingWasm({
  value,
  blindingHex,
}) {
  try {
    const result = await callWorker("generate-value-commitment-with-blinding", {
      value: normalizeValue(value),
      blindingHex: normalizeHex(blindingHex),
    });
    return result;
  } catch (error) {
    throw mapWasmError("generate-value-commitment-with-blinding", error);
  }
}

export async function generateValueCommitmentWithBindingWasm({
  value,
  blindingHex,
  bindingTagHex,
}) {
  try {
    const result = await callWorker("generate-value-commitment-with-binding", {
      value: normalizeValue(value),
      blindingHex: normalizeHex(blindingHex),
      bindingTagHex: bindingTagHex ? normalizeHex(bindingTagHex) : undefined,
    });
    return result;
  } catch (error) {
    throw mapWasmError("generate-value-commitment-with-binding", error);
  }
}

export async function generateScalarCommitmentWithBlindingWasm() {
  try {
    const result = await callWorker("generate-scalar-commitment-with-blinding", {
      value: normalizeValue(arguments[0]?.value),
      blindingHex: normalizeHex(arguments[0]?.blindingHex),
    });
    return result;
  } catch (error) {
    throw mapWasmError("generate-scalar-commitment-with-blinding", error);
  }
}

export async function verifyValueCommitmentWasm({
  commitment,
  proof,
  bindingTagHex,
}) {
  try {
    const result = await callWorker("verify-value-commitment", {
      commitment: normalizeHex(commitment),
      proof: normalizeHex(proof),
      bindingTagHex: bindingTagHex ? normalizeHex(bindingTagHex) : undefined,
    });
    return result;
  } catch (error) {
    throw mapWasmError("verify-value-commitment", error);
  }
}

export async function generateEqualityProofWasm({
  cPriceHex,
  cPayHex,
  rPriceHex,
  rPayHex,
  contextHashHex,
}) {
  try {
    const result = await callWorker("generate-equality-proof", {
      cPriceHex: normalizeHex(cPriceHex),
      cPayHex: normalizeHex(cPayHex),
      rPriceHex: normalizeHex(rPriceHex),
      rPayHex: normalizeHex(rPayHex),
      contextHashHex: normalizeHex(contextHashHex),
    });
    return result;
  } catch (error) {
    throw mapWasmError("generate-equality-proof", error);
  }
}

export async function verifyEqualityProofWasm({
  cPriceHex,
  cPayHex,
  proofRHex,
  proofSHex,
  contextHashHex,
}) {
  try {
    const result = await callWorker("verify-equality-proof", {
      cPriceHex: normalizeHex(cPriceHex),
      cPayHex: normalizeHex(cPayHex),
      proofRHex: normalizeHex(proofRHex),
      proofSHex: normalizeHex(proofSHex),
      contextHashHex: normalizeHex(contextHashHex),
    });
    return result;
  } catch (error) {
    throw mapWasmError("verify-equality-proof", error);
  }
}

export async function generateQuantityTotalProofWasm({
  cQuantityHex,
  cTotalHex,
  unitPriceWei,
  rQuantityHex,
  rTotalHex,
  contextHashHex,
}) {
  try {
    const result = await callWorker("generate-quantity-total-proof", {
      cQuantityHex: normalizeHex(cQuantityHex),
      cTotalHex: normalizeHex(cTotalHex),
      unitPriceWei: normalizeValue(unitPriceWei),
      rQuantityHex: normalizeHex(rQuantityHex),
      rTotalHex: normalizeHex(rTotalHex),
      contextHashHex: normalizeHex(contextHashHex),
    });
    return result;
  } catch (error) {
    throw mapWasmError("generate-quantity-total-proof", error);
  }
}

export async function verifyQuantityTotalProofWasm({
  cQuantityHex,
  cTotalHex,
  unitPriceWei,
  proofRHex,
  proofSHex,
  contextHashHex,
}) {
  try {
    const result = await callWorker("verify-quantity-total-proof", {
      cQuantityHex: normalizeHex(cQuantityHex),
      cTotalHex: normalizeHex(cTotalHex),
      unitPriceWei: normalizeValue(unitPriceWei),
      proofRHex: normalizeHex(proofRHex),
      proofSHex: normalizeHex(proofSHex),
      contextHashHex: normalizeHex(contextHashHex),
    });
    return result;
  } catch (error) {
    throw mapWasmError("verify-quantity-total-proof", error);
  }
}

export async function generateTotalPaymentEqualityProofWasm({
  cTotalHex,
  cPayHex,
  rTotalHex,
  rPayHex,
  contextHashHex,
}) {
  try {
    const result = await callWorker("generate-total-payment-equality-proof", {
      cTotalHex: normalizeHex(cTotalHex),
      cPayHex: normalizeHex(cPayHex),
      rTotalHex: normalizeHex(rTotalHex),
      rPayHex: normalizeHex(rPayHex),
      contextHashHex: normalizeHex(contextHashHex),
    });
    return result;
  } catch (error) {
    throw mapWasmError("generate-total-payment-equality-proof", error);
  }
}

export async function verifyTotalPaymentEqualityProofWasm({
  cTotalHex,
  cPayHex,
  proofRHex,
  proofSHex,
  contextHashHex,
}) {
  try {
    const result = await callWorker("verify-total-payment-equality-proof", {
      cTotalHex: normalizeHex(cTotalHex),
      cPayHex: normalizeHex(cPayHex),
      proofRHex: normalizeHex(proofRHex),
      proofSHex: normalizeHex(proofSHex),
      contextHashHex: normalizeHex(contextHashHex),
    });
    return result;
  } catch (error) {
    throw mapWasmError("verify-total-payment-equality-proof", error);
  }
}
