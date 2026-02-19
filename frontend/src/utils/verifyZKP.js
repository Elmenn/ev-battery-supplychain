// client/src/utils/verifyZKP.js

/**
 * Extract the price ZKP payload from VC.
 * Supports the current schema and a legacy fallback.
 */
export function extractZKPProof(vc) {
  const priceCommitment = vc?.credentialSubject?.priceCommitment;
  if (priceCommitment?.commitment && priceCommitment?.proof) {
    return {
      commitment: priceCommitment.commitment,
      proof: priceCommitment.proof,
      protocol: priceCommitment.protocol,
      version: priceCommitment.version,
      encoding: priceCommitment.encoding,
      verified: priceCommitment.verified,
      description: priceCommitment.description,
      proofType: priceCommitment.proofType,
      bindingTag: priceCommitment.bindingTag,
      bindingContext: priceCommitment.bindingContext,
    };
  }

  // Legacy fallback.
  let price = vc?.credentialSubject?.price;
  if (typeof price === "string") {
    try {
      price = JSON.parse(price);
    } catch {
      price = {};
    }
  }

  const zkp = price?.zkpProof;
  if (zkp?.commitment && zkp?.proof) {
    return {
      commitment: zkp.commitment,
      proof: zkp.proof,
      protocol: zkp.protocol,
      version: zkp.version,
      encoding: zkp.encoding,
      verified: zkp.verified,
      description: zkp.description,
      proofType: zkp.proofType,
      bindingTag: zkp.bindingTag,
      bindingContext: zkp.bindingContext,
    };
  }

  throw new Error(
    "ZKP proof is missing or malformed in VC (expected credentialSubject.priceCommitment or credentialSubject.price.zkpProof)",
  );
}
