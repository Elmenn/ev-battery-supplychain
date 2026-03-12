/**
 * buyerSecretApi.js
 *
 * REST client for the four buyer_secrets endpoints added in plan 12-01:
 *   POST   /buyer-secrets
 *   GET    /buyer-secrets/:productAddress/:buyerAddress
 *   PATCH  /buyer-secrets/:productAddress/:buyerAddress/encrypted-opening
 *   PATCH  /buyer-secrets/:productAddress/:buyerAddress/equality-proof
 *
 * Contract (mirrors productMetaApi.js):
 *   - Write functions (save*, update*) THROW on failure
 *   - Read functions (get*) return null on 404 and network errors
 *   - All addresses are lowercased before URL construction
 */

const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

/**
 * Upsert the buyer-secret encrypted blob at payment time.
 * Called by PrivatePaymentModal after recordPrivatePayment succeeds (non-blocking try/catch at call site).
 *
 * @param {object} params
 * @param {string} params.productAddress  - Escrow contract address (any case)
 * @param {string} params.buyerAddress    - Buyer EOA address (any case)
 * @param {object|string} params.encryptedBlob   - AES-GCM encrypted blob { ciphertext, iv, salt, aad, version, pubkey }
 * @param {string} params.disclosurePubkey        - x25519 pubkey hex (unencrypted, for seller)
 * @param {string} [params.cPay]          - C_pay commitment hex
 * @param {string} [params.cPayProof]     - Range proof hex for C_pay
 * @throws {Error} on non-2xx or network failure
 */
export async function saveBuyerSecretBlob({
  productAddress,
  buyerAddress,
  encryptedBlob,
  disclosurePubkey,
  cPay,
  cPayProof,
}) {
  const res = await fetch(`${BACKEND_URL}/buyer-secrets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productAddress: productAddress.toLowerCase(),
      buyerAddress: buyerAddress.toLowerCase(),
      encryptedBlob,
      disclosurePubkey,
      cPay: cPay || null,
      cPayProof: cPayProof || null,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `saveBuyerSecretBlob failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch the buyer-secret row.
 * Returns the full row including encryptedBlob, disclosurePubkey, encryptedOpening, equalityProof.
 * Returns null on 404 (buyer hasn't paid yet) or network errors.
 *
 * @param {string} productAddress - Escrow contract address (any case)
 * @param {string} buyerAddress   - Buyer EOA address (any case)
 * @returns {Promise<object|null>}
 */
export async function getBuyerSecretBlob(productAddress, buyerAddress) {
  try {
    const res = await fetch(
      `${BACKEND_URL}/buyer-secrets/${productAddress.toLowerCase()}/${buyerAddress.toLowerCase()}`
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      console.warn(`getBuyerSecretBlob: unexpected status ${res.status}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.warn('getBuyerSecretBlob: network error', err.message);
    return null;
  }
}

/**
 * Update the encrypted_opening field — seller calls this after encrypting {value, blinding_price}.
 * Non-blocking at call site (seller's confirmOrder must not be blocked by this).
 *
 * @param {string} productAddress
 * @param {string} buyerAddress
 * @param {object|string} encryptedOpening - { ciphertext, ephemeralPubKey, iv }
 * @throws {Error} on failure
 */
export async function updateEncryptedOpening(productAddress, buyerAddress, encryptedOpening) {
  const res = await fetch(
    `${BACKEND_URL}/buyer-secrets/${productAddress.toLowerCase()}/${buyerAddress.toLowerCase()}/encrypted-opening`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ encryptedOpening }),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `updateEncryptedOpening failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Update the equality_proof field — buyer calls this after generating the Schnorr proof.
 *
 * @param {string} productAddress
 * @param {string} buyerAddress
 * @param {object|string} equalityProof - { proof_r_hex, proof_s_hex, bindingContext }
 * @throws {Error} on failure
 */
export async function updateEqualityProof(productAddress, buyerAddress, equalityProof) {
  const res = await fetch(
    `${BACKEND_URL}/buyer-secrets/${productAddress.toLowerCase()}/${buyerAddress.toLowerCase()}/equality-proof`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ equalityProof }),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `updateEqualityProof failed: ${res.status}`);
  }
  return res.json();
}
