const { verifyTypedData, TypedDataEncoder } = require("ethers");

// Matching EIP-712 domain and types
const DEFAULT_CHAIN_ID = (() => {
  const env = process.env.VC_CHAIN_ID || process.env.CHAIN_ID;
  if (env) {
    const parsed = Number(env);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 11155111;
})();
const BASE_DOMAIN = {
  name: "VC",
  version: "1.0",
};

const types = {
  Credential: [
    { name: "id", type: "string" },
    { name: "@context", type: "string[]" },
    { name: "type", type: "string[]" },
    { name: "issuer", type: "Party" },
    { name: "holder", type: "Party" },
    { name: "issuanceDate", type: "string" },
    { name: "credentialSubject", type: "CredentialSubject" },
  ],
  Party: [
    { name: "id", type: "string" },
    { name: "name", type: "string" },
  ],
  CredentialSubject: [
    { name: "id", type: "string" },
    { name: "productName", type: "string" },
    { name: "batch", type: "string" },
    { name: "quantity", type: "uint256" },
    { name: "previousCredential", type: "string" },
    { name: "componentCredentials", type: "string[]" },
    { name: "certificateCredential", type: "Certificate" },
    { name: "price", type: "string" }, // 
  ],
  Certificate: [
    { name: "name", type: "string" },
    { name: "cid", type: "string" },
  ],
};

function extractChainId(identifier) {
  if (!identifier || typeof identifier !== "string") {
    return null;
  }
  const normalized = identifier.toLowerCase();
  const colonParts = normalized.split(":");
  if (colonParts.length < 4) {
    return null;
  }
  const chainPart = colonParts[2];
  const numeric = Number(chainPart);
  return Number.isNaN(numeric) ? null : numeric;
}

function prepareForVerification(vc) {
  // Support both object and array proof formats
  let proofArr = [];
  if (Array.isArray(vc.proof)) {
    proofArr = vc.proof;
  } else if (vc.proofs) {
    // legacy object format
    proofArr = Object.values(vc.proofs);
  }
  const { proof, proofs, ...rest } = vc;
  const clone = JSON.parse(JSON.stringify(rest));

  if (clone.credentialSubject?.vcHash) {
    delete clone.credentialSubject.vcHash;
  }
  if (clone.credentialSubject?.transactionId !== undefined) {
    delete clone.credentialSubject.transactionId;
  }

  // Serialize price as string for EIP-712
  if (clone.credentialSubject?.price && typeof clone.credentialSubject.price !== "string") {
    clone.credentialSubject.price = JSON.stringify(clone.credentialSubject.price);
  }

  if (clone.issuer?.id) clone.issuer.id = clone.issuer.id.toLowerCase();
  if (clone.holder?.id) clone.holder.id = clone.holder.id.toLowerCase();
  if (clone.credentialSubject?.id) clone.credentialSubject.id = clone.credentialSubject.id.toLowerCase();

  console.log("[verifyVC.js] Payload to verify (with price as string):", clone);
  return { proofArr, dataToVerify: clone };
}

async function verifyProof(proof, dataToVerify, role, chainId) {
  const result = {
    matching_vc: false,
    matching_signer: false,
    signature_verified: false,
    recovered_address: null,
    expected_address: null,
    error: null,
  };

  if (!proof) {
    result.error = `❌ No ${role} proof provided`;
    console.error(result.error);
    return result;
  }

  const effectiveChainId = chainId ?? DEFAULT_CHAIN_ID;
  const domain = { ...BASE_DOMAIN, chainId: effectiveChainId };

  try {
    const payloadHash = TypedDataEncoder.hash(domain, types, dataToVerify);
    console.log(`[verifyVC.js] [${role.toUpperCase()}] EIP-712 types:`, types);
    console.log(`[verifyVC.js] [${role.toUpperCase()}] Hash in Proof (payloadHash):`, proof.payloadHash);
    console.log(`[verifyVC.js] [${role.toUpperCase()}] Hash recomputed (EIP-712):`, payloadHash);

    if (proof.payloadHash && payloadHash !== proof.payloadHash) {
      console.warn(`[verifyVC.js] [${role}] Payload hash mismatch!\n  ↪ expected: ${proof.payloadHash}\n  ↪ actual:   ${payloadHash}`);
    }

    const recovered = verifyTypedData(domain, types, dataToVerify, proof.jws);
    result.recovered_address = recovered;

    const verificationMethod = proof.verificationMethod;
    if (!verificationMethod?.toLowerCase().startsWith("did:ethr:")) {
      result.error = `❌ Invalid verificationMethod format in ${role} proof`;
      console.error(result.error);
      return result;
    }

    const expectedAddress = verificationMethod.split(":").pop().toLowerCase().replace(/#.*$/, "");
    result.expected_address = expectedAddress;

    const vcDeclaredId =
      role === "issuer" ? dataToVerify.issuer?.id : dataToVerify.holder?.id;

    if (!vcDeclaredId || !vcDeclaredId.toLowerCase().includes(expectedAddress)) {
      result.error = `❌ DID mismatch: VC ${role}.id (${vcDeclaredId}) ≠ ${verificationMethod}`;
      console.error(result.error);
      return result;
    }

    result.matching_vc = true;
    result.matching_signer = recovered.toLowerCase() === expectedAddress;
    result.signature_verified = result.matching_signer;

    if (result.signature_verified) {
      console.log(`[verifyVC.js] [${role}] Signature matches expected address.`);
    } else {
      result.error = `❌ Signature does not match expected address for ${role}`;
      console.warn(result.error);
    }
  } catch (err) {
    result.error = `❌ [${role}] Verification failed: ${err.message}`;
    console.error(result.error);
  }

  return result;
}

async function verifyVC(vcjsonData, isCertificate) {
  console.log("\n===============================");
  console.log("🔍 Starting Verifiable Credential verification");

  const { proofArr, dataToVerify } = prepareForVerification(vcjsonData);
  if (!proofArr || proofArr.length === 0) throw new Error("❌ No proofs found in VC");

  // Find issuer and holder proofs by matching verificationMethod
  const issuerDid = dataToVerify.issuer?.id?.toLowerCase();
  const holderDid = dataToVerify.holder?.id?.toLowerCase();
  const issuerProof = proofArr.find(p => p.verificationMethod?.toLowerCase().includes(issuerDid));
  const holderProof = proofArr.find(p => p.verificationMethod?.toLowerCase().includes(holderDid));
  console.log("[verifyVC.js] Selected issuerProof:", issuerProof);
  console.log("[verifyVC.js] Selected holderProof:", holderProof);

  const issuerChainId =
    extractChainId(issuerProof?.verificationMethod) ??
    extractChainId(dataToVerify.issuer?.id) ??
    DEFAULT_CHAIN_ID;

  const holderChainId =
    extractChainId(holderProof?.verificationMethod) ??
    extractChainId(dataToVerify.holder?.id) ??
    issuerChainId ??
    DEFAULT_CHAIN_ID;

  const issuerResult = await verifyProof(issuerProof, dataToVerify, "issuer", issuerChainId);
  const holderResult = isCertificate
    ? null
    : await verifyProof(holderProof, dataToVerify, "holder", holderChainId);

  console.log("🔚 VC Verification Results:", { issuer: issuerResult, holder: holderResult });
  console.log("===============================\n");

  return { issuer: issuerResult, holder: holderResult };
}

module.exports = { verifyVC };

