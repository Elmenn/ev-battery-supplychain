// client/src/utils/ipfs.js
// works with create-react-app / react-scripts

// Optional now: backend upload is the primary path, browser Pinata upload is only a fallback.
const JWT = process.env.REACT_APP_PINATA_JWT

const IPFS_GATEWAY = "https://ipfs.io/ipfs";
const VC_BACKEND_URL = process.env.REACT_APP_VC_BACKEND_URL || "http://localhost:5000";

/**
 * Retry helper with exponential backoff.
 * Retries on network errors and 5xx responses.
 * Does NOT retry on 4xx client errors.
 * @param {Function} fn - async function to retry
 * @param {number} maxRetries - maximum number of attempts (default 3)
 * @returns {Promise<*>} result of fn
 */
async function withRetry(fn, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // Do not retry 4xx client errors
      if (err.status && err.status >= 400 && err.status < 500) {
        throw err;
      }
      if (attempt < maxRetries - 1) {
        const delay = 1000 * Math.pow(2, attempt);
        console.warn(`Retry attempt ${attempt + 1}/${maxRetries} failed: ${err.message}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

async function uploadJsonViaBackend(obj) {
  const res = await fetch(`${VC_BACKEND_URL}/vc-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vc: obj,
      source: "frontend-backend-upload",
    }),
  });

  if (!res.ok) {
    let errMsg = res.statusText || "Backend VC upload failed";
    try {
      const body = await res.json();
      errMsg = body.error || body.message || JSON.stringify(body);
    } catch {}
    const err = new Error(`Backend VC upload failed: ${errMsg}`);
    err.status = res.status;
    throw err;
  }

  const payload = await res.json();
  const cid = String(payload?.cid || "").trim();
  if (!cid) {
    throw new Error("Backend VC upload returned no CID");
  }
  return cid;
}

/**
 * Upload arbitrary JSON to Pinata and return the IPFS CID.
 * Retries up to 3 times with exponential backoff on network/5xx errors.
 * @param {object} obj - a plain JS object
 * @returns {Promise<string>} the new IPFS CID
 */
export async function uploadJson(obj) {
  return withRetry(async () => {
    try {
      return await uploadJsonViaBackend(obj);
    } catch (backendError) {
      console.warn(`Backend VC upload failed, falling back to browser Pinata upload: ${backendError.message}`);
    }

    // Format JSON with 2-space indentation for readability
    // This is safe because:
    // - EIP-712 signatures use structured data, not the JSON string
    // - vcHash uses canonicalize() which is format-independent
    // - VCs are parsed from JSON when fetched, so formatting doesn't affect parsing
    const formattedJson = JSON.stringify(obj, null, 2);
    const blob = new Blob([formattedJson], { type: "application/json" })
    const form = new FormData()
    form.append("file", blob, "vc.json")

    if (!JWT) {
      throw new Error(
        "Browser Pinata fallback is unavailable because REACT_APP_PINATA_JWT is missing."
      );
    }

    const res = await fetch(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${JWT}`,
        },
        body: form,
      }
    )

    if (!res.ok) {
      // try to extract JSON error, else fallback to status text
      let errMsg = res.statusText
      try {
        const errJson = await res.json()
        errMsg = errJson.error?.details || JSON.stringify(errJson)
      } catch {}
      const err = new Error(`Pinata upload failed: ${errMsg}`);
      err.status = res.status;
      throw err;
    }

    const { IpfsHash } = await res.json()
    try {
      await fetch(`${VC_BACKEND_URL}/vc-archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cid: IpfsHash,
          vc: obj,
          source: "frontend-upload",
        }),
      });
    } catch (archiveError) {
      console.warn(`VC archive write failed for ${IpfsHash}: ${archiveError.message}`);
    }

    return IpfsHash
  });
}

/**
 * Fetch JSON from IPFS by CID with localStorage caching and retry logic.
 * @param {string} cid - IPFS CID (with or without "ipfs://" prefix)
 * @returns {Promise<object>} parsed JSON from IPFS
 */
export async function fetchJson(cid) {
  if (!cid) {
    throw new Error("CID is required");
  }

  // Strip ipfs:// prefix if present
  cid = cid.replace(/^ipfs:\/\//, "");

  // Check localStorage cache
  const cacheKey = `vc_cache_${cid}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // Corrupted cache entry, remove and continue to fetch
      localStorage.removeItem(cacheKey);
    }
  }

  // Fetch with retry
  const json = await withRetry(async () => {
    const response = await fetch(`${IPFS_GATEWAY}/${cid}`);
    if (!response.ok) {
      const err = new Error(`IPFS fetch failed: ${response.statusText}`);
      err.status = response.status;
      throw err;
    }
    return await response.json();
  });

  // Cache the result (silently handle quota exceeded)
  try {
    localStorage.setItem(cacheKey, JSON.stringify(json));
  } catch {
    /* storage quota exceeded, skip caching */
  }

  return json;
}
