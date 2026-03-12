// utils/vcBuilder.mjs — Single append-only VC builder (v2.0)
import { v4 as uuid } from "uuid";
import { keccak256, ZeroAddress } from "ethers";
import { canonicalize } from "json-canonicalize";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const inferChainId = () => {
  const candidates = [
    process.env.REACT_APP_CHAIN_ID,
    process.env.REACT_APP_CHAIN_ALIAS,
    process.env.REACT_APP_NETWORK_ID,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = Number(candidate);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return String(parsed);
    }
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return "1337";
};

const normalizeCommitmentHex = (value) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const normalizeMaybeString = (value) =>
  value == null ? null : String(value);

const getBackendBaseUrl = () => {
  const configured = process.env.REACT_APP_VC_BACKEND_URL || process.env.REACT_APP_BACKEND_URL;
  if (configured && typeof configured === "string" && configured.trim().length > 0) {
    return configured.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined" && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:5000`;
  }

  return "http://localhost:5000";
};

const getVrcContextUrl = () =>
  `${getBackendBaseUrl()}/contexts/ev-battery-vrc-v1.jsonld`;

const getVrcSchemaUrl = () =>
  `${getBackendBaseUrl()}/schemas/ev-battery-order-vrc-v5.schema.json`;

const getVrcStatusUrl = (orderId) =>
  `${getBackendBaseUrl()}/vc-status/order/${String(orderId || "").trim()}`;

// ---------------------------------------------------------------------------
// Utility exports (preserved from v1.0)
// ---------------------------------------------------------------------------

export function hashVcPayload(vc) {
  return keccak256(Buffer.from(canonicalize(vc)));
}

export function freezeVcJson(vc) {
  return canonicalize(vc);
}

// ---------------------------------------------------------------------------
// Core VC lifecycle functions (v2.0 append-only pattern)
// ---------------------------------------------------------------------------

/**
 * Create a listing VC (version 1 of the append-only document).
 *
 * The payment and delivery sections start as null and are filled in by
 * appendPaymentProof / appendDeliveryProof respectively.
 */
export function createListingVC({
  sellerAddr,
  sellerRailgunAddress,
  productName,
  batch,
  quantity,
  productContract,
  productId,
  chainId,
  priceCommitment,
  certificateCredential,
  componentCredentials,
}) {
  const chain = chainId || inferChainId();
  const normalizedProductName = String(productName || "");
  const normalizedBatch = String(batch || "");
  const normalizedQuantity = Number.isFinite(Number(quantity))
    ? Number(quantity)
    : 1;
  const normalizedProductContract = String(productContract || "");
  const normalizedProductId = String(productId ?? "");
  const normalizedCertificate = {
    name: String(certificateCredential?.name || ""),
    cid: String(certificateCredential?.cid || ""),
  };
  const normalizedComponents = Array.isArray(componentCredentials)
    ? componentCredentials
        .filter((item) => item != null && String(item).trim().length > 0)
        .map((item) => String(item))
    : [];

  return {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    id: `urn:uuid:${uuid()}`,
    type: ["VerifiableCredential", "SupplyChainCredential"],
    schemaVersion: "2.0",

    issuer: {
      id: `did:ethr:${chain}:${sellerAddr}`,
      name: "Seller",
    },
    holder: {
      id: `did:ethr:${chain}:${ZeroAddress}`,
      name: "T.B.D.",
    },
    issuanceDate: new Date().toISOString(),

    credentialSubject: {
      id: `did:ethr:${chain}:${sellerAddr}`,
      productName: normalizedProductName,
      batch: normalizedBatch,
      quantity: normalizedQuantity,
      productContract: normalizedProductContract,
      productId: normalizedProductId,
      chainId: String(chain),

      priceCommitment: {
        protocol: "bulletproofs-pedersen",
        version: "1.0",
        encoding: "hex",
        ...(priceCommitment || {}),
      },

      listing: {
        timestamp: new Date().toISOString(),
        certificateCredential: normalizedCertificate,
        componentCredentials: normalizedComponents,
        ...(sellerRailgunAddress
          ? { sellerRailgunAddress: sellerRailgunAddress.trim() }
          : {}),
      },

      payment: null,
      delivery: null,
    },

    previousVersion: null,
    proof: [],
  };
}

/**
 * Create one final VC at order confirmation time (single-final-VC model).
 * This VC includes listing + payment in one document and sets previousVersion to null.
 */
export function createFinalOrderVC({
  sellerAddr,
  buyerAddr,
  sellerRailgunAddress,
  productName,
  batch,
  quantity,
  productContract,
  productId,
  chainId,
  priceCommitment,
  certificateCredential,
  componentCredentials,
  memoHash,
  railgunTxRef,
}) {
  const chain = chainId || inferChainId();
  const normalizedProductName = String(productName || "");
  const normalizedBatch = String(batch || "");
  const normalizedQuantity = Number.isFinite(Number(quantity))
    ? Number(quantity)
    : 1;
  const normalizedProductContract = String(productContract || "");
  const normalizedProductId = String(productId ?? "");
  const normalizedCertificate = {
    name: String(certificateCredential?.name || ""),
    cid: String(certificateCredential?.cid || ""),
  };
  const normalizedComponents = Array.isArray(componentCredentials)
    ? componentCredentials
        .filter((item) => item != null && String(item).trim().length > 0)
        .map((item) => String(item))
    : [];

  return {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    id: `urn:uuid:${uuid()}`,
    type: ["VerifiableCredential", "SupplyChainCredential"],
    schemaVersion: "2.0",

    issuer: {
      id: `did:ethr:${chain}:${sellerAddr}`,
      name: "Seller",
    },
    holder: {
      id: `did:ethr:${chain}:${buyerAddr}`,
      name: "Buyer",
    },
    issuanceDate: new Date().toISOString(),

    credentialSubject: {
      id: `did:ethr:${chain}:${sellerAddr}`,
      productName: normalizedProductName,
      batch: normalizedBatch,
      quantity: normalizedQuantity,
      productContract: normalizedProductContract,
      productId: normalizedProductId,
      chainId: String(chain),

      priceCommitment: {
        protocol: "bulletproofs-pedersen",
        version: "1.0",
        encoding: "hex",
        ...(priceCommitment || {}),
      },

      listing: {
        timestamp: new Date().toISOString(),
        certificateCredential: normalizedCertificate,
        componentCredentials: normalizedComponents,
        ...(sellerRailgunAddress
          ? { sellerRailgunAddress: sellerRailgunAddress.trim() }
          : {}),
      },

      payment: {
        timestamp: new Date().toISOString(),
        buyerAddress: `did:ethr:${chain}:${buyerAddr}`,
        memoHash,
        railgunTxRef,
      },

      delivery: null,
    },

    previousVersion: null,
    proof: [],
  };
}

export function createFinalOrderVCV2({
  sellerAddr,
  buyerAddr,
  sellerRailgunAddress,
  productName,
  batch,
  productContract,
  productId,
  chainId,
  unitPriceWei,
  unitPriceHash,
  listingSnapshotCid,
  certificateCredential,
  componentCredentials,
  orderId,
  memoHash,
  railgunTxRef,
  quantityCommitment,
  totalCommitment,
  paymentCommitment,
  contextHash,
  disclosurePubKey,
  quantityTotalProof,
  paymentEqualityProof,
}) {
  const chain = chainId || inferChainId();
  const now = new Date().toISOString();
  const normalizedCertificate = {
    name: String(certificateCredential?.name || ""),
    cid: String(certificateCredential?.cid || ""),
  };
  const normalizedComponents = Array.isArray(componentCredentials)
    ? componentCredentials
        .filter((item) => item != null && String(item).trim().length > 0)
        .map((item) => String(item))
    : [];

  return {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      getVrcContextUrl(),
    ],
    id: `urn:uuid:${uuid()}`,
    type: ["VerifiableCredential", "SupplyChainCredential", "OrderCommitmentCredential"],
    schemaVersion: "5.0",

    issuer: {
      id: `did:ethr:${chain}:${sellerAddr}`,
      name: "Seller",
    },
    holder: {
      id: `did:ethr:${chain}:${buyerAddr}`,
      name: "Buyer",
    },
    validFrom: now,
    credentialSchema: {
      id: getVrcSchemaUrl(),
      type: "JsonSchema",
    },
    credentialStatus: {
      id: getVrcStatusUrl(orderId),
      type: "SupplyChainCredentialStatus2026",
      statusPurpose: "revocation",
    },

    credentialSubject: {
      id: `did:ethr:${chain}:${sellerAddr}`,
      productName: String(productName || ""),
      batch: String(batch || ""),
      productContract: String(productContract || ""),
      productId: String(productId ?? ""),
      chainId: String(chain),

      listing: {
        timestamp: now,
        unitPriceWei: String(unitPriceWei || ""),
        unitPriceHash: String(unitPriceHash || ""),
        listingSnapshotCid: String(listingSnapshotCid || ""),
        certificateCredential: normalizedCertificate,
        componentCredentials: normalizedComponents,
        ...(sellerRailgunAddress
          ? { sellerRailgunAddress: sellerRailgunAddress.trim() }
          : {}),
      },

      order: {
        orderId: String(orderId || ""),
        productId: String(productId ?? ""),
        escrowAddr: String(productContract || ""),
        chainId: String(chain),
        buyerAddress: `did:ethr:${chain}:${buyerAddr}`,
        memoHash: String(memoHash || ""),
        railgunTxRef: String(railgunTxRef || ""),
      },

      commitments: {
        quantityCommitment: String(quantityCommitment || ""),
        totalCommitment: String(totalCommitment || ""),
        paymentCommitment: String(paymentCommitment || ""),
      },

      zkProofs: {
        schemaVersion: "1.0",
        quantityTotalProof: quantityTotalProof
          ? {
              proofType: "bulletproofs",
              proofRHex: String(quantityTotalProof.proof_r_hex || ""),
              proofSHex: String(quantityTotalProof.proof_s_hex || ""),
              contextHash: String(quantityTotalProof.context_hash_hex || contextHash || ""),
            }
          : null,
        totalPaymentEqualityProof: paymentEqualityProof
          ? {
              proofType: "bulletproofs",
              proofRHex: String(paymentEqualityProof.proof_r_hex || ""),
              proofSHex: String(paymentEqualityProof.proof_s_hex || ""),
              contextHash: String(paymentEqualityProof.context_hash_hex || contextHash || ""),
            }
          : null,
      },

      attestation: {
        attestationVersion: "4.0",
        contextHash: String(contextHash || ""),
        ...(disclosurePubKey
          ? { disclosurePubKey: String(disclosurePubKey) }
          : {}),
      },

      delivery: null,
    },

    previousVersion: null,
    proof: [],
  };
}

export function buildVcSigningAnchorPayload(credentialSubject = {}) {
  const listing = credentialSubject?.listing || {};
  const order = credentialSubject?.order || {};
  const commitments = credentialSubject?.commitments || {};
  const zkProofs = credentialSubject?.zkProofs || {};
  const attestation = credentialSubject?.attestation || {};

  const v2Anchors = {
    listing: {
      unitPriceWei: normalizeMaybeString(listing.unitPriceWei),
      unitPriceHash: normalizeCommitmentHex(listing.unitPriceHash),
      listingSnapshotCid: normalizeMaybeString(listing.listingSnapshotCid),
      sellerRailgunAddress: normalizeMaybeString(listing.sellerRailgunAddress),
      certificateCredential: {
        name: String(listing.certificateCredential?.name || ""),
        cid: String(listing.certificateCredential?.cid || ""),
      },
      componentCredentials: Array.isArray(listing.componentCredentials)
        ? listing.componentCredentials.map((item) => String(item))
        : [],
    },
    order: {
      orderId: normalizeMaybeString(order.orderId),
      productId: normalizeMaybeString(order.productId),
      escrowAddr: normalizeMaybeString(order.escrowAddr),
      chainId: normalizeMaybeString(order.chainId),
      buyerAddress: normalizeMaybeString(order.buyerAddress),
      memoHash: normalizeCommitmentHex(order.memoHash),
      railgunTxRef: normalizeCommitmentHex(order.railgunTxRef),
    },
    commitments: {
      quantityCommitment: normalizeCommitmentHex(commitments.quantityCommitment),
      totalCommitment: normalizeCommitmentHex(commitments.totalCommitment),
      paymentCommitment: normalizeCommitmentHex(commitments.paymentCommitment),
    },
    zkProofs: {
      schemaVersion: String(zkProofs.schemaVersion || ""),
      quantityTotalProof:
        zkProofs.quantityTotalProof && typeof zkProofs.quantityTotalProof === "object"
          ? {
              proofType: String(zkProofs.quantityTotalProof.proofType || ""),
              proofRHex: normalizeMaybeString(zkProofs.quantityTotalProof.proofRHex),
              proofSHex: normalizeMaybeString(zkProofs.quantityTotalProof.proofSHex),
              contextHash: normalizeCommitmentHex(zkProofs.quantityTotalProof.contextHash),
            }
          : null,
      totalPaymentEqualityProof:
        zkProofs.totalPaymentEqualityProof && typeof zkProofs.totalPaymentEqualityProof === "object"
          ? {
              proofType: String(zkProofs.totalPaymentEqualityProof.proofType || ""),
              proofRHex: normalizeMaybeString(zkProofs.totalPaymentEqualityProof.proofRHex),
              proofSHex: normalizeMaybeString(zkProofs.totalPaymentEqualityProof.proofSHex),
              contextHash: normalizeCommitmentHex(zkProofs.totalPaymentEqualityProof.contextHash),
            }
          : null,
    },
    attestation: {
      contextHash: normalizeCommitmentHex(attestation.contextHash),
      disclosurePubKey: normalizeMaybeString(attestation.disclosurePubKey || attestation.disclosurePubkey),
    },
  };

  const hasV2Data = Object.values(v2Anchors.listing).some(Boolean)
    || Object.values(v2Anchors.order).some(Boolean)
    || Object.values(v2Anchors.commitments).some(Boolean)
    || Boolean(v2Anchors.zkProofs.quantityTotalProof)
    || Boolean(v2Anchors.zkProofs.totalPaymentEqualityProof)
    || Boolean(v2Anchors.attestation.contextHash)
    || Boolean(v2Anchors.attestation.disclosurePubKey);

  if (!hasV2Data) {
    return null;
  }

  return v2Anchors;
}

/**
 * Append payment proof to an existing VC.
 *
 * Deep-clones the input so the original is never mutated.
 * Fills the credentialSubject.payment section and updates the holder to
 * the buyer. Sets previousVersion to the CID of the prior IPFS version.
 */
export function appendPaymentProof(vc, {
  buyerAddr,
  memoHash,
  railgunTxRef,
  txHashCommitment,
  previousVersionCid,
}) {
  const chain = vc.credentialSubject.chainId || inferChainId();
  const updated = JSON.parse(JSON.stringify(vc));

  // Update holder to buyer
  updated.holder = {
    id: `did:ethr:${chain}:${buyerAddr}`,
    name: "Buyer",
  };

  // Fill payment section
  updated.credentialSubject.payment = {
    timestamp: new Date().toISOString(),
    buyerAddress: `did:ethr:${chain}:${buyerAddr}`,
    memoHash,
    railgunTxRef,
    ...(txHashCommitment ? { txHashCommitment } : {}),
  };

  // Link to previous IPFS version
  updated.previousVersion = previousVersionCid;

  return updated;
}

/**
 * Append delivery proof to an existing VC.
 *
 * Deep-clones the input so the original is never mutated.
 * Fills the credentialSubject.delivery section and sets previousVersion.
 */
export function appendDeliveryProof(vc, {
  transporterAddr,
  previousVersionCid,
}) {
  const chain = vc.credentialSubject.chainId || inferChainId();
  const updated = JSON.parse(JSON.stringify(vc));

  updated.credentialSubject.delivery = {
    timestamp: new Date().toISOString(),
    transporterAddress: `did:ethr:${chain}:${transporterAddr}`,
    vcHashVerified: true,
  };

  updated.previousVersion = previousVersionCid;

  return updated;
}

/**
 * Append (or merge) attestation data into credentialSubject.attestation.
 *
 * Attestation fields are written incrementally:
 *   1. At payment time: { disclosurePubKey, buyerPaymentCommitment }
 *   2. After confirmOrder: { encryptedOpening }
 *   3. After proof generation: { paymentEqualityProof }
 *
 * Deep-clones the input VC — never mutates the original.
 * Merges attestationFields into any existing credentialSubject.attestation object.
 *
 * @param {object} vc - Existing VC (will not be mutated)
 * @param {object} options
 * @param {object} options.attestationFields - Fields to merge into credentialSubject.attestation
 * @param {string} [options.previousVersionCid] - IPFS CID of the previous VC version
 * @returns {object} New VC with attestation fields merged
 */
export function appendAttestationData(vc, { attestationFields, previousVersionCid }) {
  const updated = JSON.parse(JSON.stringify(vc));

  // Initialize attestation section if not present
  if (!updated.credentialSubject.attestation) {
    updated.credentialSubject.attestation = { attestationVersion: '1.0' };
  }

  // Merge new fields — preserves previously written fields (incremental write pattern)
  Object.assign(updated.credentialSubject.attestation, attestationFields);

  if (previousVersionCid) {
    updated.previousVersion = previousVersionCid;
  }

  return updated;
}
