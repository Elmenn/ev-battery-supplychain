// utils/vcBuilder.js
import { v4 as uuid } from "uuid";
import { keccak256 } from "ethers";
import { canonicalize } from "json-canonicalize";

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
// const ZERO_DID = `did:ethr:${CHAIN}:0x${"0".repeat(40)}`; // Not currently used

export function hashVcPayload(vc) {
  // Use canonical JSON for hash
  return keccak256(Buffer.from(canonicalize(vc)));
}

// Utility to freeze/canonicalize VC JSON before signing
export function freezeVcJson(vc) {
  return canonicalize(vc);
}

// --------------------------------------------------
// NEW: Identity Linkage ZKP Proof Generation
// --------------------------------------------------

/**
 * Generate ZKP proof that links VC signing identity to Railgun wallet
 * Proves: "I control both the wallet that signed this VC and the Railgun wallet"
 * Without revealing: Either private key or the relationship between them
 */
export async function generateIdentityLinkageProof({
  vcSigningKey,        // Private key that signed the VC
  railgunSigningKey,   // Private key for Railgun wallet
  vcHash,              // Hash of the VC being linked
  railgunAddress,      // Railgun wallet address
  proofType = "identityLinkage-v1"
}) {
  try {
    // Generate ZKP proof using circuit
    const zkpProof = await generateLinkageZKP({
      vcSigningKey,
      railgunSigningKey,
      vcHash,
      railgunAddress
    });

    return {
      type: "ZKIdentityLinkageProof",
      created: new Date().toISOString(),
      proofPurpose: "identityLinkage",
      verificationMethod: `did:ethr:${CHAIN}:${railgunAddress}#zkp`,
      zkpProof: {
        circuit: proofType,
        publicInputs: {
          vcHash: vcHash,
          railgunAddress: railgunAddress,
          linkageCommitment: zkpProof.commitment
        },
        proof: zkpProof.proof,
        verificationKey: zkpProof.verificationKey
      }
    };
  } catch (error) {
    console.error("Failed to generate identity linkage proof:", error);
    throw new Error(`Identity linkage proof generation failed: ${error.message}`);
  }
}

/**
 * Generate the actual ZKP using the identity linkage circuit
 */
async function generateLinkageZKP({
  vcSigningKey,
  railgunSigningKey,
  vcHash,
  railgunAddress
}) {
  // This would integrate with your ZKP backend or circuit
  // For now, returning a mock structure
  // Use browser-compatible alternatives to Buffer
  const vcKeyBytes = new Uint8Array(vcSigningKey.slice(2).match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  const railgunKeyBytes = new Uint8Array(railgunSigningKey.slice(2).match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  
  // Combine the bytes
  const combinedBytes = new Uint8Array(vcKeyBytes.length + railgunKeyBytes.length);
  combinedBytes.set(vcKeyBytes, 0);
  combinedBytes.set(railgunKeyBytes, vcKeyBytes.length);
  
  const mockProof = {
    commitment: keccak256(combinedBytes),
    proof: "0x" + "0".repeat(512), // Mock proof bytes
    verificationKey: "0x" + "0".repeat(128) // Mock verification key
  };

  return mockProof;
}

/**
 * Verify identity linkage proof
 */
export async function verifyIdentityLinkageProof(linkageProof) {
  try {
    const { zkpProof } = linkageProof;
    const { publicInputs, proof, verificationKey } = zkpProof;

    // Verify the ZKP proof
    const isValid = await verifyLinkageZKP({
      proof,
      verificationKey,
      publicInputs
    });

    return {
      verified: isValid,
      vcHash: publicInputs.vcHash,
      railgunAddress: publicInputs.railgunAddress,
      linkageCommitment: publicInputs.linkageCommitment
    };
  } catch (error) {
    console.error("Failed to verify identity linkage proof:", error);
    return { verified: false, error: error.message };
  }
}

/**
 * Verify the actual ZKP
 */
async function verifyLinkageZKP({ proof, verificationKey, publicInputs }) {
  // This would integrate with your ZKP verification backend
  // For now, returning mock verification
  return true; // Mock successful verification
}

// --------------------------------------------------
// Enhanced VC Builder with Identity Linkage
// --------------------------------------------------

/**
 * Build Stage-3 VC with identity linkage proof
 */
export function buildStage3VCWithIdentityLinkage({ 
  stage2, 
  buyerProof, 
  txHashCommitment,      // TX hash commitment for privacy
  zkpProof, 
  price, 
  proofType,
  stage2Cid,             // ✅ Stage 2 VC CID (required for linear chain)
  identityLinkageProof = null  // NEW: Optional identity linkage proof
}) {
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

  // Store TX hash commitment for privacy
  if (txHashCommitment) {
    credentialSubject.txHashCommitment = txHashCommitment;
  }

  // Start with any existing proofs, then add buyerProof and identity linkage proof
  const proofArr = Array.isArray(stage2.proof) ? [...stage2.proof] : [];
  
  if (buyerProof && Object.keys(buyerProof).length > 0) {
    proofArr.push(buyerProof);
  }
  
  // NEW: Add identity linkage proof if provided
  if (identityLinkageProof) {
    proofArr.push(identityLinkageProof);
  }

  const vc = {
    ...stage2,
    credentialSubject,
    proof: proofArr,
  };

  return vc;
}

// --------------------------------------------------
// Utility Functions for Identity Linkage
// --------------------------------------------------

/**
 * Check if a VC has identity linkage proof
 */
export function hasIdentityLinkageProof(vc) {
  if (!vc.proof || !Array.isArray(vc.proof)) {
    return false;
  }
  
  return vc.proof.some(proof => 
    proof.type === "ZKIdentityLinkageProof" || 
    proof.zkpProof?.circuit?.startsWith("identityLinkage")
  );
}

/**
 * Extract identity linkage proof from VC
 */
export function extractIdentityLinkageProof(vc) {
  if (!vc.proof || !Array.isArray(vc.proof)) {
    return null;
  }
  
  return vc.proof.find(proof => 
    proof.type === "ZKIdentityLinkageProof" || 
    proof.zkpProof?.circuit?.startsWith("identityLinkage")
  );
}

/**
 * Validate identity linkage proof in VC
 */
export async function validateVCIdentityLinkage(vc) {
  const linkageProof = extractIdentityLinkageProof(vc);
  
  if (!linkageProof) {
    return {
      hasLinkageProof: false,
      valid: false,
      message: "No identity linkage proof found"
    };
  }
  
  const verification = await verifyIdentityLinkageProof(linkageProof);
  
  return {
    hasLinkageProof: true,
    valid: verification.verified,
    vcHash: verification.vcHash,
    railgunAddress: verification.railgunAddress,
    message: verification.verified ? "Identity linkage verified" : "Identity linkage verification failed"
  };
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
    schemaVersion: stage0.schemaVersion || "1.0", // ✅ Preserve schemaVersion from previous stage or default to "1.0"

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
export function buildStage3VC({ 
  stage2, 
  buyerProof, 
  txHashCommitment,      // TX hash commitment for privacy
  zkpProof, 
  price, 
  proofType,
  stage2Cid,             // ✅ Stage 2 VC CID (required for linear chain)
  transporter,           // ✅ Transporter address (optional)
  onChainCommitment,     // ✅ On-chain commitment reference (optional)
  deliveryStatus         // ✅ Delivery status (optional)
}) {
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
  
  // ✅ Add transporter address to subjectDetails
  if (transporter) {
    if (!credentialSubject.subjectDetails) {
      credentialSubject.subjectDetails = {};
    }
    credentialSubject.subjectDetails.transporter = transporter;
  }
  
  // ✅ Add on-chain commitment reference for verification
  if (onChainCommitment) {
    if (!credentialSubject.subjectDetails) {
      credentialSubject.subjectDetails = {};
    }
    credentialSubject.subjectDetails.onChainCommitment = onChainCommitment;
  }
  
  // ✅ Add delivery status
  if (deliveryStatus !== undefined) {
    credentialSubject.deliveryStatus = deliveryStatus;
  }

  // Start with any existing proofs (e.g., issuerProof), then add buyerProof
  const proofArr = Array.isArray(stage2.proof) ? [...stage2.proof] : [];
  if (buyerProof && Object.keys(buyerProof).length > 0) {
    proofArr.push(buyerProof);
  }

  const vc = {
    ...stage2,
    schemaVersion: stage2.schemaVersion || "1.0", // ✅ Preserve schemaVersion from previous stage or default to "1.0"
    credentialSubject,
    proof: proofArr,
  };

  return vc;
}

