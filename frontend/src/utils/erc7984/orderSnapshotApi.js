const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";

async function parseJsonResponse(res, fallbackMessage) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || fallbackMessage || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function saveErc7984OrderSnapshot(payload) {
  const res = await fetch(`${BACKEND_URL}/erc7984/orders/snapshot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(res, `saveErc7984OrderSnapshot failed: ${res.status}`);
}
