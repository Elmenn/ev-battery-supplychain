/**
 * productMetaApi.js
 *
 * Thin wrapper around the three backend metadata REST endpoints:
 *   POST   /metadata
 *   GET    /metadata/:address
 *   PATCH  /metadata/:address/vc-cid
 */

const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";

function readLocalProductMeta(address) {
  if (!address) return null;

  try {
    const normalizedAddress = address.toLowerCase();
    const productMetaRaw =
      localStorage.getItem(`productMeta_${normalizedAddress}`) ||
      localStorage.getItem(`productMeta_${address}`);
    const unitPriceWei =
      localStorage.getItem(`unitPriceWei_${normalizedAddress}`) ||
      localStorage.getItem(`unitPriceWei_${address}`);
    const unitPriceHash =
      localStorage.getItem(`unitPriceHash_${normalizedAddress}`) ||
      localStorage.getItem(`unitPriceHash_${address}`);
    const priceCommitment =
      localStorage.getItem(`priceCommitment_${normalizedAddress}`) ||
      localStorage.getItem(`priceCommitment_${address}`);
    const productMeta = productMetaRaw ? JSON.parse(productMetaRaw) : null;

    if (!productMeta && !unitPriceWei && !unitPriceHash && !priceCommitment) {
      return null;
    }

    return {
      productAddress: normalizedAddress,
      productMeta,
      priceWei: unitPriceWei || productMeta?.unitPriceWei || null,
      priceCommitment:
        priceCommitment || productMeta?.priceCommitment || unitPriceHash || productMeta?.unitPriceHash || null,
      sellerRailgunAddress: productMeta?.sellerRailgunAddress || null,
      unitPriceWei: unitPriceWei || productMeta?.unitPriceWei || null,
      unitPriceHash: unitPriceHash || productMeta?.unitPriceHash || null,
      listingSnapshotCid: productMeta?.listingSnapshotCid || null,
      listingSnapshotJson: null,
      listingSnapshotSig: null,
      schemaVersion: productMeta?.schemaVersion || null,
      vcCid: productMeta?.vcCid || null,
      createdAt: productMeta?.createdAt || null,
      updatedAt: productMeta?.updatedAt || productMeta?.createdAt || null,
      source: "localStorage",
    };
  } catch (error) {
    console.warn("readLocalProductMeta: failed to parse local metadata", error.message);
    return null;
  }
}

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
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      productAddress: productAddress.toLowerCase(),
      productMeta,
      priceWei,
      priceCommitment,
      sellerRailgunAddress: sellerRailgunAddress ? sellerRailgunAddress : null,
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

export async function getProductMeta(address) {
  try {
    const res = await fetch(`${BACKEND_URL}/metadata/${address.toLowerCase()}`);
    if (res.status === 404) return readLocalProductMeta(address);
    if (!res.ok) {
      console.warn(`getProductMeta: unexpected status ${res.status}`);
      return readLocalProductMeta(address);
    }
    return res.json();
  } catch (err) {
    console.warn("getProductMeta: network error, falling back to localStorage", err.message);
    return readLocalProductMeta(address);
  }
}

export async function updateVcCid(address, vcCid) {
  const res = await fetch(
    `${BACKEND_URL}/metadata/${address.toLowerCase()}/vc-cid`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vcCid }),
    }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `updateVcCid failed: ${res.status}`);
  }

  return res.json();
}
