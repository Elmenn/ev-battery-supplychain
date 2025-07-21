// client/src/utils/verifyZKP.js

export function extractZKPProof(vc) {
  const zkp = vc?.credentialSubject?.zkpProof;
  if (!zkp || !zkp.commitment || !zkp.proof) {
    throw new Error("❌ ZKP proof is missing or malformed in VC");
  }
  return {
    commitment: zkp.commitment,
    proof: zkp.proof,
  };
}
