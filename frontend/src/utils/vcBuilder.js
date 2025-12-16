// utils/vcBuilder.js
const { v4: uuid } = require("uuid");
const { keccak256 } = require("ethers");
const { canonicalize } = require("json-canonicalize");

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

const CHAIN = inferChainId();
const ZERO_DID = `did:ethr:${CHAIN}:0x${"0".repeat(40)}`;

export function hashVcPayload(vc) {
  // Use canonical JSON for hash
  return keccak256(Buffer.from(canonicalize(vc)));
}

// Utility to freeze/canonicalize VC JSON before signing
export function freezeVcJson(vc) {
  return canonicalize(vc);
}

/* ─────────────── Stage-0 (unchanged) ─────────────── */
export function buildStage0VC({ product, sellerAddr, issuerProof }) {
  /* ... your existing Stage-0 code ... */
}

/* ─────────────── Stage-2 (seller → buyer) ─────────────── */
export function buildStage2VC({
  stage0,
  stage0Cid,
  buyerAddr,
  sellerAddr,
  issuerProof,
  purchaseTxHashCommitment, // Phase 1: Optional purchase TX hash commitment
}) {
  if (!stage0Cid) {
    throw new Error("stage0Cid is missing – cannot link previousCredential");
  }

  const credentialSubject = {
    ...stage0.credentialSubject,
    id: `did:ethr:${CHAIN}:${buyerAddr}`,
    previousCredential: stage0Cid,
  };

  // Phase 1: Store purchase TX hash commitment for privacy
  if (purchaseTxHashCommitment) {
    credentialSubject.purchaseTxHashCommitment = purchaseTxHashCommitment;
  }

  const vc = {
    "@context": stage0["@context"],
    id: stage0.id || `https://example.edu/credentials/${uuid()}`,
    type: stage0.type || ["VerifiableCredential"],

    issuer: {
      id: `did:ethr:${CHAIN}:${sellerAddr}`,
      name: "Seller",
    },
    holder: {
      id: `did:ethr:${CHAIN}:${buyerAddr}`,
      name: "Buyer",
    },
    issuanceDate: stage0.issuanceDate, // preserve original date

    credentialSubject,

    proof: issuerProof ? [issuerProof] : [], // W3C VC proof array
  };

  return vc;
}

// --------------------------------------------------
export function buildStage3VC({ stage2, buyerProof, txHashCommitment, zkpProof, price, proofType, stage2Cid }) {
  let priceObj;
  if (typeof price !== "undefined") {
    priceObj = price;
  } else {
    priceObj = stage2.credentialSubject.price;
    if (typeof priceObj === "string") {
      try {
        priceObj = JSON.parse(priceObj);
      } catch {
        priceObj = {};
      }
    }
    priceObj = {
      ...(priceObj || {}),
      hidden: true,
      ...(zkpProof ? { zkpProof: { ...zkpProof, proofType: proofType || "zkRangeProof-v1" } } : {}),
    };
  }

  const credentialSubject = {
    ...stage2.credentialSubject,
    previousCredential: stage2Cid || stage2.credentialSubject.previousCredential, // ✅ Set to stage2Cid for linear chain S0→S1→S2
    price: JSON.stringify(priceObj),
  };

  // Phase 1: Preserve purchase TX hash commitment from stage2 (if present)
  // It's already in stage2.credentialSubject, so it's preserved via spread operator above

  // Store delivery TX hash commitment for privacy (Step 4)
  if (txHashCommitment) {
    credentialSubject.txHashCommitment = txHashCommitment;
  }

  // Start with any existing proofs (e.g., issuerProof), then add buyerProof
  const proofArr = Array.isArray(stage2.proof) ? [...stage2.proof] : [];
  if (buyerProof && Object.keys(buyerProof).length > 0) {
    proofArr.push(buyerProof);
  }

  const vc = {
    ...stage2,
    credentialSubject,
    proof: proofArr,
  };

  return vc;
}

module.exports = {
  buildStage3VC,
  freezeVcJson,
  // ... any other exports ...
};

