// utils/verifyVc.js
const BACKEND_URL = "http://localhost:5000";

export async function fetchVCFromServer(cid, backendUrl) {
  const res = await fetch(`${backendUrl}/fetch-vc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cid }),
  });

  if (!res.ok) throw new Error("Failed to fetch VC from server");
  const data = await res.json();
  return data.vc;
}

export async function verifyVCWithServer(vc) {

  const response = await fetch(`${BACKEND_URL}/verify-vc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ vc, isCertificate: false }),
  });

  if (!response.ok) {
    throw new Error("Failed to verify VC on server");
  }

  const data = await response.json();

  return data;
}

