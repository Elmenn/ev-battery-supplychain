const DEFAULT_ZKP_BACKEND_URL = "http://localhost:5010";

function resolveBackendUrl(zkpBackendUrl) {
  return zkpBackendUrl || process.env.REACT_APP_ZKP_BACKEND_URL || DEFAULT_ZKP_BACKEND_URL;
}

function normalizeHex(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ZKP backend error: ${errorText}`);
  }

  return response.json();
}

export async function generateValueCommitmentWithBlindingBackend({
  value,
  blindingHex,
  zkpBackendUrl,
}) {
  const baseUrl = resolveBackendUrl(zkpBackendUrl);

  return postJson(`${baseUrl}/zkp/generate-value-commitment-with-blinding`, {
    value,
    blinding_hex: normalizeHex(blindingHex),
  });
}

export async function generateValueCommitmentWithBindingBackend({
  value,
  blindingHex,
  bindingTagHex,
  zkpBackendUrl,
}) {
  const baseUrl = resolveBackendUrl(zkpBackendUrl);

  return postJson(`${baseUrl}/zkp/generate-value-commitment-with-binding`, {
    value,
    blinding_hex: normalizeHex(blindingHex),
    binding_tag_hex: normalizeHex(bindingTagHex),
  });
}

export async function verifyValueCommitmentBackend({
  commitment,
  proof,
  bindingTagHex,
  zkpBackendUrl,
}) {
  const baseUrl = resolveBackendUrl(zkpBackendUrl);

  return postJson(`${baseUrl}/zkp/verify-value-commitment`, {
    commitment: normalizeHex(commitment),
    proof: normalizeHex(proof),
    ...(bindingTagHex ? { binding_tag_hex: normalizeHex(bindingTagHex) } : {}),
  });
}

export async function verifyProofByEndpointBackend({
  endpoint,
  commitment,
  proof,
  bindingTagHex,
  zkpBackendUrl,
}) {
  const baseUrl = resolveBackendUrl(zkpBackendUrl);

  return postJson(`${baseUrl}/zkp/${endpoint}`, {
    commitment: normalizeHex(commitment),
    proof: normalizeHex(proof),
    ...(bindingTagHex ? { binding_tag_hex: normalizeHex(bindingTagHex) } : {}),
  });
}

