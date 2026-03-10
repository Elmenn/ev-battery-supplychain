/**
 * productMetaApi.js
 *
 * Thin wrapper around the three backend metadata REST endpoints:
 *   POST   /metadata
 *   GET    /metadata/:address
 *   PATCH  /metadata/:address/vc-cid
 *
 * All functions normalise the product address to lowercase before sending
 * so the backend SQLite query always matches regardless of checksum form.
 *
 * Read functions (getProductMeta) return null instead of throwing when:
 *   - The server returns 404 (product created before Phase 11 migration)
 *   - The server is unreachable (network error, dev backend not running)
 * This enables callers to implement a localStorage fallback without
 * try/catch boilerplate at every call site.
 */

const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

/**
 * Upsert full product listing metadata.
 * Called once by ProductFormStep3 after successful escrow deployment.
 *
 * @param {object} params
 * @param {string} params.productAddress - Ethereum address (any case)
 * @param {object} params.productMeta    - Full listingMeta JSON object
 * @param {string} params.priceWei       - BigInt as string
 * @param {string} params.priceCommitment - Pedersen commitment hex
 * @param {string} params.sellerRailgunAddress - 0zk... address
 * @returns {Promise<{success: boolean, productAddress: string}>}
 * @throws {Error} on non-2xx response or network failure
 */
export async function saveProductMeta({
  productAddress,
  productMeta,
  priceWei,
  priceCommitment,
  sellerRailgunAddress,
  unitPriceWei,
  unitPriceHash,
  listingSnapshotCid,
  listingSnapshotJson,
  listingSnapshotSig,
  schemaVersion,
}) {
  const res = await fetch(`${BACKEND_URL}/metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productAddress: productAddress.toLowerCase(),
      productMeta,
      priceWei,
      priceCommitment,
      sellerRailgunAddress,
      unitPriceWei: unitPriceWei || null,
      unitPriceHash: unitPriceHash || null,
      listingSnapshotCid: listingSnapshotCid || null,
      listingSnapshotJson: listingSnapshotJson || null,
      listingSnapshotSig: listingSnapshotSig || null,
      schemaVersion: schemaVersion || null,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `saveProductMeta failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch all metadata for a product address.
 * Returns null (not a rejection) when:
 *   - Server returns 404 (pre-migration product, no DB row)
 *   - Network error (backend unavailable)
 *
 * Callers should fall back to localStorage when this returns null.
 *
 * @param {string} address - Product contract address (any case)
 * @returns {Promise<object|null>} Metadata object or null
 */
export async function getProductMeta(address) {
  try {
    const res = await fetch(
      `${BACKEND_URL}/metadata/${address.toLowerCase()}`
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      console.warn(`getProductMeta: unexpected status ${res.status}`);
      return null;
    }
    return res.json();
  } catch (err) {
    // Network error or JSON parse failure — treat as cache miss
    console.warn('getProductMeta: network error, falling back to localStorage', err.message);
    return null;
  }
}

/**
 * Update the vcCid field for an existing product row.
 * Called by ProductDetail after seller uploads the final VC to IPFS.
 *
 * @param {string} address - Product contract address (any case)
 * @param {string} vcCid   - IPFS CID of the uploaded VC
 * @returns {Promise<{success: boolean}>}
 * @throws {Error} on non-2xx response or network failure
 */
export async function updateVcCid(address, vcCid) {
  const res = await fetch(
    `${BACKEND_URL}/metadata/${address.toLowerCase()}/vc-cid`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vcCid }),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `updateVcCid failed: ${res.status}`);
  }
  return res.json();
}
