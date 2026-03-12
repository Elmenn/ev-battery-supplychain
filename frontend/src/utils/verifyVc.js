// utils/verifyVc.js
const BACKEND_URL = process.env.REACT_APP_VC_BACKEND_URL || "http://localhost:5000";

export async function fetchVCFromServer(cid, backendUrl = BACKEND_URL) {
  const res = await fetch(`${backendUrl}/fetch-vc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cid }),
  });

  if (!res.ok) throw new Error("Failed to fetch VC from server");
  const data = await res.json();
  return data.vc;
}

export async function fetchVCStatusFromServer({ cid = null, vc = null } = {}, backendUrl = BACKEND_URL) {
  const statusUrl = vc?.credentialStatus?.id;
  const route = statusUrl && /^https?:\/\//i.test(String(statusUrl))
    ? statusUrl
    : `${backendUrl}/vc-status/${encodeURIComponent(String(cid || "").replace(/^ipfs:\/\//, "").trim())}`;

  const res = await fetch(route);
  if (!res.ok) {
    throw new Error("Failed to fetch VC status from server");
  }
  return res.json();
}

/**
 * Verify VC with backend server
 * @param {Object} vc - Verifiable Credential object
 * @param {string} [contractAddress] - Optional contract address for verifyingContract binding
 * @returns {Promise<Object>} Verification result
 */
export async function verifyVCWithServer(vc, contractAddress = null) {
  const response = await fetch(`${BACKEND_URL}/verify-vc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      vc,
      ...(contractAddress ? { contractAddress } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to verify VC on server");
  }

  const data = await response.json();
  return data;
}

export async function verifyVCChainWithServer(cid, maxDepth = 50) {
  const response = await fetch(`${BACKEND_URL}/verify-vc-chain`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cid, maxDepth }),
  });

  if (!response.ok) {
    throw new Error("Failed to verify VC chain on server");
  }

  return response.json();
}
