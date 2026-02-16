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
      productName,
      batch: batch || "",
      quantity,
      productContract,
      productId: String(productId),
      chainId: String(chain),

      priceCommitment: {
        protocol: "bulletproofs-pedersen",
        version: "1.0",
        encoding: "hex",
        ...(priceCommitment || {}),
      },

      listing: {
        timestamp: new Date().toISOString(),
        certificateCredential: certificateCredential || { name: "", cid: "" },
        componentCredentials: componentCredentials || [],
      },

      payment: null,
      delivery: null,
    },

    previousVersion: null,
    proof: [],
  };
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

// ---------- DEPRECATED STUBS ----------
// These functions are removed in v2.0 (single-VC architecture).
// Stubs kept so existing imports compile. Phase 9 will update call sites.

/** @deprecated Use createListingVC + appendPaymentProof instead */
export function buildStage2VC() {
  throw new Error(
    "buildStage2VC removed in v2.0 -- use appendPaymentProof instead. See Phase 8 migration."
  );
}

/** @deprecated Use createListingVC + appendDeliveryProof instead */
export function buildStage3VC() {
  throw new Error(
    "buildStage3VC removed in v2.0 -- use appendDeliveryProof instead. See Phase 8 migration."
  );
}
