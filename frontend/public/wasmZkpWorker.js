const DEFAULT_WASM_BASE_PATH = "/wasm/zkp-wasm";

let wasmModulePromise = null;
let wasmEntrypointUrlCache = null;

function resolveWasmEntrypointUrl(publicUrl) {
  const normalizedPublic = (publicUrl || "").replace(/\/$/, "");
  return `${normalizedPublic}${DEFAULT_WASM_BASE_PATH}/zkp_wasm.js`;
}

function resolveWasmBinaryUrl(publicUrl) {
  const normalizedPublic = (publicUrl || "").replace(/\/$/, "");
  return `${normalizedPublic}${DEFAULT_WASM_BASE_PATH}/zkp_wasm_bg.wasm`;
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

async function loadWasmModule(publicUrl) {
  const entryUrl = resolveWasmEntrypointUrl(publicUrl);
  const binaryUrl = resolveWasmBinaryUrl(publicUrl);

  if (!wasmModulePromise || wasmEntrypointUrlCache !== entryUrl) {
    wasmEntrypointUrlCache = entryUrl;
    wasmModulePromise = (async () => {
      let mod;
      try {
        mod = await import(entryUrl);
      } catch {
        throw new Error(
          `Failed to import ZKP WASM module at "${entryUrl}". Build wasm artifacts first.`,
        );
      }

      if (typeof mod.default !== "function") {
        throw new Error("Invalid ZKP WASM module: missing default init export.");
      }

      await mod.default(binaryUrl);
      return mod;
    })().catch((error) => {
      wasmModulePromise = null;
      wasmEntrypointUrlCache = null;
      throw error;
    });
  }

  return wasmModulePromise;
}

async function runOperation(method, payload, publicUrl) {
  const wasm = await loadWasmModule(publicUrl);

  if (method === "generate-value-commitment-with-blinding") {
    return wasm.generate_value_commitment_with_blinding(
      normalizeValue(payload.value),
      normalizeHex(payload.blindingHex),
    );
  }

  if (method === "generate-value-commitment-with-binding") {
    return wasm.generate_value_commitment_with_binding(
      normalizeValue(payload.value),
      normalizeHex(payload.blindingHex),
      payload.bindingTagHex ? normalizeHex(payload.bindingTagHex) : undefined,
    );
  }

  if (method === "verify-value-commitment") {
    return wasm.verify_value_commitment(
      normalizeHex(payload.commitment),
      normalizeHex(payload.proof),
      payload.bindingTagHex ? normalizeHex(payload.bindingTagHex) : undefined,
    );
  }

  throw new Error(`Unsupported wasm worker method "${method}".`);
}

globalThis.onmessage = async (event) => {
  const { id, method, payload, publicUrl } = event.data || {};
  if (!id || !method) {
    return;
  }

  try {
    const result = await runOperation(method, payload || {}, publicUrl || "");
    globalThis.postMessage({ id, ok: true, result });
  } catch (error) {
    globalThis.postMessage({
      id,
      ok: false,
      error: error?.message || String(error),
    });
  }
};

