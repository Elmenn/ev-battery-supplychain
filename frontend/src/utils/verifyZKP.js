// client/src/utils/verifyZKP.js

/**
 * Extracts the ZKP proof for the price from a VC.
 * Returns an object with commitment and proof, or throws if missing/malformed.
 */
export function extractZKPProof(vc) {
  let price = vc?.credentialSubject?.price;
  if (typeof price === "string") {
    try {
      price = JSON.parse(price);
    } catch {
      price = {};
    }
  }
  const zkp = price?.zkpProof;
  if (!zkp || !zkp.commitment || !zkp.proof) {
    throw new Error("❌ ZKP proof is missing or malformed in VC (expected at credentialSubject.price.zkpProof)");
  }
  return {
    commitment: zkp.commitment,
    proof: zkp.proof,
    protocol: zkp.protocol,
    version: zkp.version,
    encoding: zkp.encoding,
    verified: zkp.verified,
    description: zkp.description,
    proofType: zkp.proofType,
    bindingTag: zkp.bindingTag, // ✅ Extract binding tag if available
    bindingContext: zkp.bindingContext, // ✅ Extract binding context if available
  };
}
