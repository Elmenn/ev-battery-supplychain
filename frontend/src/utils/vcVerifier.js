// utils/vcVerifier.js -- VC verification utilities for v2.0 single-VC architecture
import { hashVcPayload } from "./vcBuilder.mjs";
import { verifyCommitmentMatch } from "./commitmentUtils";
import { keccak256, toUtf8Bytes } from "ethers";

/**
 * Validate that a VC object has the required structure for a v2.0 VC.
 *
 * Checks @context, type, issuer, holder, issuanceDate, credentialSubject fields,
 * priceCommitment, and proof array. Warnings (prefixed "WARNING: ") do not
 * cause the result to be invalid.
 *
 * @param {object} vc - The Verifiable Credential object to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function verifyVcSchema(vc) {
  const errors = [];

  // vc is truthy and is an object
  if (!vc || typeof vc !== "object") {
    return { valid: false, errors: ["VC is not a valid object"] };
  }

  // @context
  if (
    !Array.isArray(vc["@context"]) ||
    !vc["@context"].includes("https://www.w3.org/2018/credentials/v1")
  ) {
    errors.push(
      '@context must be an array containing "https://www.w3.org/2018/credentials/v1"'
    );
  }

  // type
  if (
    !Array.isArray(vc.type) ||
    !vc.type.includes("VerifiableCredential")
  ) {
    errors.push('type must be an array containing "VerifiableCredential"');
  }

  // schemaVersion
  if (vc.schemaVersion !== "2.0") {
    errors.push(
      "WARNING: schemaVersion is not 2.0 (found: " +
        String(vc.schemaVersion) +
        ")"
    );
  }

  // issuer
  if (
    !vc.issuer ||
    typeof vc.issuer.id !== "string" ||
    !vc.issuer.id.startsWith("did:ethr:")
  ) {
    errors.push('issuer must have an id string starting with "did:ethr:"');
  }

  // holder
  if (!vc.holder || typeof vc.holder.id !== "string") {
    errors.push("holder must have an id string");
  }

  // issuanceDate
  if (typeof vc.issuanceDate !== "string" || vc.issuanceDate.length === 0) {
    errors.push("issuanceDate must be a non-empty string");
  }

  // credentialSubject
  if (
    !vc.credentialSubject ||
    typeof vc.credentialSubject !== "object"
  ) {
    errors.push("credentialSubject must be an object");
  } else {
    // productName
    if (
      typeof vc.credentialSubject.productName !== "string" ||
      vc.credentialSubject.productName.length === 0
    ) {
      errors.push("credentialSubject.productName must be a non-empty string");
    }

    // productContract
    if (
      typeof vc.credentialSubject.productContract !== "string" ||
      vc.credentialSubject.productContract.length === 0
    ) {
      errors.push(
        "credentialSubject.productContract must be a non-empty string"
      );
    }

    // priceCommitment (v2.0) vs price (v1.0)
    const pc = vc.credentialSubject.priceCommitment;
    const price = vc.credentialSubject.price;

    if (pc && typeof pc === "object") {
      if (typeof pc.commitment !== "string") {
        errors.push(
          "credentialSubject.priceCommitment.commitment must be a string"
        );
      }
      if (typeof pc.proof !== "string") {
        errors.push(
          "credentialSubject.priceCommitment.proof must be a string"
        );
      }
    } else if (price !== undefined) {
      errors.push(
        "WARNING: v1.0 price field detected (backward compatible)"
      );
    } else {
      errors.push(
        "credentialSubject must have priceCommitment (v2.0) or price (v1.0)"
      );
    }
  }

  // proof array
  if (!Array.isArray(vc.proof)) {
    errors.push("proof must be an array");
  }

  // valid = no real errors (warnings don't count)
  const realErrors = errors.filter((e) => !e.startsWith("WARNING: "));
  return { valid: realErrors.length === 0, errors };
}

/**
 * Validate the proof array has structurally valid entries.
 *
 * NOTE: This does NOT verify cryptographic signatures. It validates
 * structure only (type, jws, verificationMethod, role).
 *
 * @param {object} vc - The Verifiable Credential object
 * @returns {{ valid: boolean, proofCount: number, roles: string[], errors: string[] }}
 */
export function verifyProofChain(vc) {
  const errors = [];

  if (!vc || !Array.isArray(vc.proof) || vc.proof.length === 0) {
    return {
      valid: false,
      proofCount: 0,
      roles: [],
      errors: ["proof must be a non-empty array"],
    };
  }

  const roles = new Set();

  vc.proof.forEach((entry, i) => {
    if (typeof entry.type !== "string") {
      errors.push(`proof[${i}].type must be a string`);
    }
    if (typeof entry.jws !== "string" || entry.jws.length === 0) {
      errors.push(`proof[${i}].jws must be a non-empty string`);
    }
    if (
      typeof entry.verificationMethod !== "string" ||
      !entry.verificationMethod.startsWith("did:ethr:")
    ) {
      errors.push(
        `proof[${i}].verificationMethod must be a string starting with "did:ethr:"`
      );
    }
    if (typeof entry.role !== "string") {
      errors.push(`proof[${i}].role must be a string`);
    } else {
      roles.add(entry.role);
    }
  });

  return {
    valid: errors.length === 0,
    proofCount: vc.proof.length,
    roles: [...roles],
    errors,
  };
}

/**
 * Verify that keccak256(toUtf8Bytes(cid)) matches the on-chain stored vcHash.
 *
 * @param {string} cid - The IPFS CID of the VC
 * @param {string} onChainVcHash - The bytes32 hash from the contract (hex string with 0x prefix)
 * @returns {{ valid: boolean, computedHash: string, onChainHash: string, error?: string }}
 */
export function verifyOnChainHash(cid, onChainVcHash) {
  if (!cid || !onChainVcHash) {
    return {
      valid: false,
      computedHash: "",
      onChainHash: "",
      error: "CID and on-chain hash are required",
    };
  }

  const computedHash = keccak256(toUtf8Bytes(cid));
  const match =
    computedHash.toLowerCase() === onChainVcHash.toLowerCase();

  return {
    valid: match,
    computedHash,
    onChainHash: onChainVcHash,
  };
}

/**
 * Verify that the VC's price commitment matches the on-chain publicPriceCommitment.
 *
 * Handles both v2.0 (priceCommitment object) and v1.0 (price string with
 * embedded commitment) formats. Delegates normalization to verifyCommitmentMatch.
 *
 * @param {object} vc - The Verifiable Credential object
 * @param {string} onChainCommitment - The bytes32 commitment from contract (hex string)
 * @returns {{ valid: boolean, vcCommitment: string, onChainCommitment: string, error?: string }}
 */
export function verifyPriceCommitment(vc, onChainCommitment) {
  let vcCommitment = null;

  // v2.0: priceCommitment object
  if (vc?.credentialSubject?.priceCommitment?.commitment) {
    vcCommitment = vc.credentialSubject.priceCommitment.commitment;
  }
  // v1.0 fallback: price field may be a JSON string with commitment
  else if (vc?.credentialSubject?.price) {
    try {
      const parsed =
        typeof vc.credentialSubject.price === "string"
          ? JSON.parse(vc.credentialSubject.price)
          : vc.credentialSubject.price;
      if (parsed && parsed.commitment) {
        vcCommitment = parsed.commitment;
      }
    } catch {
      // Not JSON, no commitment extractable
    }
  }

  if (!vcCommitment) {
    return {
      valid: false,
      vcCommitment: "",
      onChainCommitment: onChainCommitment || "",
      error: "No price commitment found in VC",
    };
  }

  // Pass values directly to verifyCommitmentMatch -- it handles 0x normalization
  const match = verifyCommitmentMatch(vcCommitment, onChainCommitment);

  return {
    valid: match,
    vcCommitment,
    onChainCommitment: onChainCommitment || "",
  };
}

/**
 * Run all applicable verification checks and return a combined result.
 *
 * Always runs schema and proof-chain checks. On-chain hash and price
 * commitment checks only run when the corresponding options are provided.
 *
 * @param {object} vc - The Verifiable Credential object
 * @param {object} [options={}] - Optional parameters
 * @param {string} [options.cid] - IPFS CID for on-chain hash verification
 * @param {string} [options.onChainVcHash] - bytes32 from contract for hash verification
 * @param {string} [options.onChainCommitment] - bytes32 from contract for commitment verification
 * @returns {{
 *   schema: { valid: boolean, errors: string[] },
 *   proofChain: { valid: boolean, proofCount: number, roles: string[], errors: string[] },
 *   onChainHash: object | null,
 *   priceCommitment: object | null,
 *   overall: boolean
 * }}
 */
export function verifyVcIntegrity(vc, options = {}) {
  const schema = verifyVcSchema(vc);
  const proofChain = verifyProofChain(vc);

  let onChainHash = null;
  if (options.cid && options.onChainVcHash) {
    onChainHash = verifyOnChainHash(options.cid, options.onChainVcHash);
  }

  let priceCommitment = null;
  if (options.onChainCommitment) {
    priceCommitment = verifyPriceCommitment(vc, options.onChainCommitment);
  }

  // overall: true only if all checks that ran returned valid === true
  let overall = schema.valid && proofChain.valid;
  if (onChainHash !== null) {
    overall = overall && onChainHash.valid;
  }
  if (priceCommitment !== null) {
    overall = overall && priceCommitment.valid;
  }

  return {
    schema,
    proofChain,
    onChainHash,
    priceCommitment,
    overall,
  };
}
