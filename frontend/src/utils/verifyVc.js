import { TypedDataEncoder, getAddress, isAddress, verifyTypedData } from "ethers";
import {
  VC_SIGN_PAYLOAD_FORMAT_LEGACY,
  VC_SIGN_PAYLOAD_FORMAT_V4_ERC7984_TYPED,
  getVcSigningDomain,
  getVcTypedDataSpec,
} from "./signVcWithMetamask";

const BACKEND_URL = process.env.REACT_APP_VC_BACKEND_URL || "http://localhost:5000";

const IPFS_GATEWAYS = [
  "https://gateway.pinata.cloud/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
];

const DEFAULT_CHAIN_ID = (() => {
  const parsed = Number(process.env.REACT_APP_CHAIN_ID);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 11155111;
})();

function toNoStoreOptions(options = {}) {
  return {
    cache: "no-store",
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  };
}

export function normalizeVcCid(cid) {
  return String(cid || "").replace(/^ipfs:\/\//, "").trim();
}

function stripFragment(value) {
  return typeof value === "string" ? value.replace(/#.*$/, "") : value;
}

function parseChainReference(value) {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;

  if (/^0x[0-9a-f]+$/i.test(normalized)) {
    const fromHex = Number.parseInt(normalized, 16);
    return Number.isFinite(fromHex) && fromHex > 0 ? fromHex : null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function extractChainId(identifier) {
  if (!identifier || typeof identifier !== "string") return null;
  const parts = stripFragment(identifier).toLowerCase().split(":");
  if (parts.length < 4) return null;
  return parseChainReference(parts[2]);
}

function normalizeAddress(address) {
  if (!address || typeof address !== "string" || !isAddress(address)) return null;
  return getAddress(address).toLowerCase();
}

function extractAddressFromDidIdentifier(identifier) {
  if (!identifier || typeof identifier !== "string") return null;
  const bare = stripFragment(identifier.trim());
  const parts = bare.split(":");
  if (parts.length < 3) return null;
  if (parts[0].toLowerCase() !== "did" || parts[1].toLowerCase() !== "ethr") return null;
  return normalizeAddress(parts[parts.length - 1]);
}

function buildProofArray(vc) {
  if (Array.isArray(vc?.proof)) return vc.proof;
  if (vc?.proofs && typeof vc.proofs === "object") return Object.values(vc.proofs);
  return [];
}

function resolvePayloadFormat(vc, issuerProof) {
  if (issuerProof?.payloadFormat) {
    return issuerProof.payloadFormat;
  }

  if (
    (String(vc?.schemaVersion || "") === "6.0" || String(vc?.schemaVersion || "") === "6.1") &&
    vc?.credentialSchema &&
    vc?.credentialStatus &&
    vc?.credentialSubject?.paymentBridge
  ) {
    return VC_SIGN_PAYLOAD_FORMAT_V4_ERC7984_TYPED;
  }

  return VC_SIGN_PAYLOAD_FORMAT_LEGACY;
}

async function fetchJson(url) {
  const response = await fetch(url, toNoStoreOptions());
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  return response.json();
}

export async function fetchVCFromIPFS(cid) {
  const normalizedCid = normalizeVcCid(cid);
  if (!normalizedCid) throw new Error("Missing VC CID");

  let lastError = null;
  for (const gateway of IPFS_GATEWAYS) {
    const url = `${gateway}${normalizedCid}`;
    try {
      return await fetchJson(url);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`Failed to fetch VC from IPFS for ${normalizedCid}`);
}

async function fetchVCFromServerWithMeta(cid, backendUrl = BACKEND_URL) {
  const normalizedCid = normalizeVcCid(cid);
  const res = await fetch(`${backendUrl}/fetch-vc`, toNoStoreOptions({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cid: normalizedCid }),
  }));

  if (!res.ok) throw new Error("Failed to fetch VC from server");
  const data = await res.json();
  return { vc: data.vc, source: "Backend Fallback" };
}

export async function fetchVCWithSource(cid, backendUrl = BACKEND_URL) {
  const normalizedCid = normalizeVcCid(cid);
  if (!normalizedCid) throw new Error("Missing VC CID");

  try {
    const vc = await fetchVCFromIPFS(normalizedCid);
    return { vc, source: "IPFS", cid: normalizedCid };
  } catch (ipfsError) {
    const backendResult = await fetchVCFromServerWithMeta(normalizedCid, backendUrl);
    return {
      ...backendResult,
      cid: normalizedCid,
      fallbackReason: ipfsError?.message || "IPFS fetch failed",
    };
  }
}

export async function fetchVCFromServer(cid, backendUrl = BACKEND_URL) {
  const { vc } = await fetchVCFromServerWithMeta(cid, backendUrl);
  return vc;
}

export async function fetchVCPreferIPFS(cid, backendUrl = BACKEND_URL) {
  return fetchVCWithSource(cid, backendUrl);
}

export async function fetchVCStatusFromServer(cid, backendUrl = BACKEND_URL) {
  const normalizedCid = normalizeVcCid(cid);
  const res = await fetch(
    `${backendUrl}/vc-status/${encodeURIComponent(normalizedCid)}`,
    toNoStoreOptions()
  );
  if (!res.ok) {
    throw new Error("Failed to fetch VC status from server");
  }
  return res.json();
}

export async function archiveVCWithServer(cid, vc, source = "api", backendUrl = BACKEND_URL) {
  const res = await fetch(`${backendUrl}/vc-archive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cid, vc, source }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to archive VC on server");
  }

  return res.json();
}

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

  return response.json();
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

function normalizeValue(value) {
  if (value === undefined || value === null) return null;
  return String(value).trim();
}

function normalizeAddressValue(value) {
  const normalized = normalizeValue(value);
  return normalized ? normalized.toLowerCase() : null;
}

function didToAddress(value) {
  const normalized = normalizeValue(value);
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  const marker = ":0x";
  const markerIndex = lower.lastIndexOf(marker);
  if (markerIndex === -1) return lower;
  return lower.slice(markerIndex + 1);
}

function getComponentCredentials(vc) {
  const listingComponents = vc?.credentialSubject?.listing?.componentCredentials;
  if (Array.isArray(listingComponents)) return listingComponents;

  const subjectComponents = vc?.credentialSubject?.componentCredentials;
  if (Array.isArray(subjectComponents)) return subjectComponents;

  return [];
}

export async function verifyVCChainLocally(startCid, options = {}) {
  const maxDepth = Number(options.maxDepth || 50);
  const normalizedStartCid = normalizeVcCid(startCid);
  if (!normalizedStartCid) {
    throw new Error("startCid is required");
  }

  const visited = new Set();
  const nodes = [];
  const edges = [];
  const byCid = new Map();
  const stack = [normalizedStartCid];

  const continuity = {
    verified: true,
    reason: null,
    cycleDetected: false,
    missingLink: false,
    truncated: false,
    invalidReferences: false,
  };

  while (stack.length > 0) {
    const currentCid = stack.pop();
    if (!currentCid) continue;

    if (visited.has(currentCid)) continue;
    if (visited.size >= maxDepth) {
      continuity.verified = false;
      continuity.truncated = true;
      continuity.reason = `Max node limit ${maxDepth} reached while traversing provenance graph`;
      break;
    }

    visited.add(currentCid);

    let vc;
    try {
      const fetched = await fetchVCWithSource(currentCid);
      vc = fetched.vc;
    } catch (error) {
      continuity.verified = false;
      continuity.missingLink = true;
      continuity.reason = `Failed to fetch CID ${currentCid}: ${error.message || String(error)}`;
      continue;
    }

    const subject = vc?.credentialSubject || {};
    const componentCredentials = getComponentCredentials(vc)
      .map((entry) => normalizeValue(entry))
      .filter(Boolean);

    const node = {
      cid: currentCid,
      productId: normalizeValue(subject.productId),
      productContract: normalizeAddressValue(subject.productContract),
      subjectId: normalizeAddressValue(subject.id),
      chainId: normalizeValue(subject.chainId),
      issuerDid: normalizeValue(vc?.issuer?.id),
      issuerAddress: didToAddress(vc?.issuer?.id),
      holderDid: normalizeValue(vc?.holder?.id),
      holderAddress: didToAddress(vc?.holder?.id),
      componentCredentials,
    };

    nodes.push(node);
    byCid.set(currentCid, node);

    for (const childCid of componentCredentials) {
      edges.push({ from: currentCid, to: childCid });
      if (childCid === currentCid) {
        continuity.verified = false;
        continuity.cycleDetected = true;
        continuity.reason = `Self-cycle detected at CID ${currentCid}`;
      }
      if (!visited.has(childCid)) {
        stack.push(childCid);
      }
    }
  }

  if (!continuity.reason) {
    continuity.reason = continuity.verified
      ? "Unbroken component-linked provenance path"
      : "Provenance continuity check failed";
  }

  const identity = {
    verified: true,
    reason: null,
    baseline: null,
    mismatches: [],
  };

  if (nodes.length > 0) {
    const baseline = {
      productId: nodes[0].productId,
      productContract: nodes[0].productContract,
      subjectId: nodes[0].subjectId,
      chainId: nodes[0].chainId,
    };
    identity.baseline = baseline;

    for (const node of nodes.slice(1)) {
      for (const field of Object.keys(baseline)) {
        const expected = baseline[field];
        const actual = node[field];
        if (expected && actual && expected !== actual) {
          identity.mismatches.push({
            cid: node.cid,
            field,
            expected,
            actual,
          });
        }
      }
    }
  }

  identity.verified = identity.mismatches.length === 0;
  identity.reason = identity.verified
    ? "Asset identity is consistent across provenance graph"
    : "Identity mismatch detected across provenance graph";

  const governance = {
    verified: true,
    reason: null,
    violations: [],
  };

  for (const edge of edges) {
    const parent = byCid.get(edge.from);
    const child = byCid.get(edge.to);
    if (!parent || !child) {
      governance.verified = false;
      governance.violations.push({
        from: edge.from,
        to: edge.to,
        reason: "Referenced component VC could not be loaded",
      });
      continue;
    }

    const parentIssuer = parent.issuerAddress;
    const childHolder = child.holderAddress;
    if (!parentIssuer || !childHolder || parentIssuer !== childHolder) {
      governance.verified = false;
      governance.violations.push({
        from: edge.from,
        to: edge.to,
        expectedIssuer: childHolder,
        actualIssuer: parentIssuer,
        reason: "Governance mismatch: parent issuer must equal component holder",
      });
    }
  }

  governance.reason = governance.verified
    ? "Issuer-holder governance is consistent across component links"
    : "Governance mismatch detected across component links";

  return {
    success: continuity.verified && identity.verified && governance.verified,
    continuity,
    identity,
    governance,
    chainLength: nodes.length,
    nodes,
    edges,
    source: "Local",
  };
}

export async function verifyVCChainPreferLocal(cid, maxDepth = 50) {
  try {
    return await verifyVCChainLocally(cid, { maxDepth });
  } catch (error) {
    const fallbackResult = await verifyVCChainWithServer(cid, maxDepth);
    return {
      ...fallbackResult,
      source: "Backend Fallback",
      fallbackReason: error?.message || "Local provenance verification could not complete",
    };
  }
}

function verifyProofLocally({ proof, dataToVerify, payloadTypes, role, expectedDid, chainId, contractAddress }) {
  const result = {
    matching_vc: false,
    matching_signer: false,
    signature_verified: false,
    recovered_address: null,
    expected_address: null,
    skipped: false,
    error: null,
  };

  if (!proof) {
    result.error = `No ${role} proof provided`;
    return result;
  }

  const verificationMethod = proof.verificationMethod;
  if (!verificationMethod || !verificationMethod.toLowerCase().startsWith("did:ethr:")) {
    throw new Error(`Unsupported verificationMethod in ${role} proof`);
  }

  const expectedAddress = extractAddressFromDidIdentifier(expectedDid);
  const methodAddress = extractAddressFromDidIdentifier(verificationMethod);

  if (!expectedAddress || !methodAddress) {
    throw new Error(`Unsupported DID/address format for ${role}`);
  }

  result.expected_address = expectedAddress;
  result.matching_vc = expectedAddress === methodAddress;
  if (!result.matching_vc) {
    result.error = `DID mismatch for ${role}`;
    return result;
  }

  const effectiveChainId = chainId || extractChainId(verificationMethod) || extractChainId(expectedDid) || DEFAULT_CHAIN_ID;
  const domains = [getVcSigningDomain(effectiveChainId)];
  if (contractAddress) {
    domains.push(getVcSigningDomain(effectiveChainId, contractAddress));
  }

  let lastError = null;
  for (const domain of domains) {
    try {
      const payloadHash = TypedDataEncoder.hash(domain, payloadTypes, dataToVerify);
      if (proof.payloadHash && proof.payloadHash !== payloadHash) {
        lastError = `Payload hash mismatch for ${role}`;
        continue;
      }

      const recovered = verifyTypedData(domain, payloadTypes, dataToVerify, proof.jws);
      result.recovered_address = recovered ? recovered.toLowerCase() : null;
      result.matching_signer = result.recovered_address === expectedAddress;
      result.signature_verified = result.matching_signer;
      if (result.signature_verified) {
        return result;
      }

      lastError = `Recovered signer mismatch for ${role}`;
    } catch (error) {
      lastError = error?.message || String(error);
    }
  }

  result.error = lastError || `Signature verification failed for ${role}`;
  return result;
}

export async function verifyVCLocally(vc, contractAddress = null) {
  const proofArr = buildProofArray(vc);
  if (!proofArr.length) {
    throw new Error("No proofs found in VC");
  }

  const issuerProof =
    proofArr.find((proof) => proof?.role === "seller") ||
    proofArr.find((proof) =>
      proof?.verificationMethod?.toLowerCase().includes(vc?.issuer?.id?.toLowerCase?.() || "")
    );

  const payloadFormat = resolvePayloadFormat(vc, issuerProof);
  const { payload: dataToVerify, types: payloadTypes } = getVcTypedDataSpec(vc, payloadFormat);
  const holderDid = dataToVerify?.holder?.id?.toLowerCase?.();

  const holderProof =
    proofArr.find((proof) => proof?.role === "holder" || proof?.role === "buyer") ||
    proofArr.find((proof) => proof?.verificationMethod?.toLowerCase().includes(holderDid || ""));

  const issuerChainId =
    extractChainId(issuerProof?.verificationMethod) ||
    extractChainId(dataToVerify?.issuer?.id) ||
    DEFAULT_CHAIN_ID;

  const holderChainId =
    extractChainId(holderProof?.verificationMethod) ||
    extractChainId(dataToVerify?.holder?.id) ||
    issuerChainId;

  const issuer = verifyProofLocally({
    proof: issuerProof,
    dataToVerify,
    payloadTypes,
    role: "issuer",
    expectedDid: dataToVerify?.issuer?.id,
    chainId: issuerChainId,
    contractAddress,
  });

  let holder;
  if (!holderProof) {
    holder = {
      matching_vc: true,
      matching_signer: true,
      signature_verified: true,
      recovered_address: null,
      expected_address: null,
      skipped: true,
      error: null,
    };
  } else {
    holder = verifyProofLocally({
      proof: holderProof,
      dataToVerify,
      payloadTypes,
      role: "holder",
      expectedDid: dataToVerify?.holder?.id,
      chainId: holderChainId,
      contractAddress,
    });
  }

  return {
    success: issuer.signature_verified && holder.signature_verified,
    message: "Local VC verification complete.",
    issuer,
    holder,
    source: "Local",
    payloadFormat,
  };
}

export async function verifyVCPreferLocal(vc, contractAddress = null) {
  try {
    const localResult = await verifyVCLocally(vc, contractAddress);
    return localResult;
  } catch (error) {
    const fallbackResult = await verifyVCWithServer(vc, contractAddress);
    return {
      ...fallbackResult,
      success:
        fallbackResult?.success ??
        (fallbackResult?.issuer?.signature_verified === true &&
          fallbackResult?.holder?.signature_verified !== false),
      source: "Backend Fallback",
      fallbackReason: error?.message || "Local verification could not complete",
    };
  }
}
