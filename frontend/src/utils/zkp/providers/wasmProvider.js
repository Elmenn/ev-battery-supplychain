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
  throw new Error(
    "[ZKP][wasm] generate-scalar-commitment-with-blinding is not implemented. Use REACT_APP_ZKP_MODE=backend."
  );
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
