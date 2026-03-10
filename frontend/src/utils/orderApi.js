const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

async function parseJsonResponse(res, fallbackMessage) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || fallbackMessage || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function saveOrder(orderPayload) {
  const res = await fetch(`${BACKEND_URL}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderPayload),
  });
  return parseJsonResponse(res, `saveOrder failed: ${res.status}`);
}

export async function saveOrderRecoveryBundle({ order, attestation }) {
  const res = await fetch(`${BACKEND_URL}/orders/recovery-bundle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order, attestation }),
  });
  return parseJsonResponse(res, `saveOrderRecoveryBundle failed: ${res.status}`);
}

export async function getOrder(orderId) {
  try {
    const res = await fetch(`${BACKEND_URL}/orders/${String(orderId).toLowerCase()}`);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return res.json();
  } catch (err) {
    console.warn('getOrder: network error', err.message);
    return null;
  }
}

export async function getLatestOrderForProductBuyer(productAddress, buyerAddress) {
  try {
    const res = await fetch(
      `${BACKEND_URL}/orders/by-product/${String(productAddress).toLowerCase()}/buyer/${String(buyerAddress).toLowerCase()}/latest`
    );
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return res.json();
  } catch (err) {
    console.warn('getLatestOrderForProductBuyer: network error', err.message);
    return null;
  }
}

export async function reconcileOrder(orderId, payload) {
  const res = await fetch(`${BACKEND_URL}/orders/${String(orderId).toLowerCase()}/reconcile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(res, `reconcileOrder failed: ${res.status}`);
}

export async function updateOrderStatus(orderId, status) {
  const res = await fetch(`${BACKEND_URL}/orders/${String(orderId).toLowerCase()}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  return parseJsonResponse(res, `updateOrderStatus failed: ${res.status}`);
}

export async function updateOrderVc(orderId, vcCid, vcHash) {
  const res = await fetch(`${BACKEND_URL}/orders/${String(orderId).toLowerCase()}/vc-cid`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vcCid, vcHash }),
  });
  return parseJsonResponse(res, `updateOrderVc failed: ${res.status}`);
}
