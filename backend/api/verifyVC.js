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

// ✅ Old types (without schemaVersion) - for backward compatibility with old VCs
const typesOld = {
  Credential: [
    { name: "id", type: "string" },
    { name: "@context", type: "string[]" },
    { name: "type", type: "string[]" },
    // ❌ No schemaVersion - old VCs were signed without it
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
    { name: "price", type: "string" },
  ],
  Certificate: [
    { name: "name", type: "string" },
    { name: "cid", type: "string" },
  ],
};

// ✅ New types (with schemaVersion) - for new VCs
const typesNew = {
  Credential: [
    { name: "id", type: "string" },
    { name: "@context", type: "string[]" },
    { name: "type", type: "string[]" },
    { name: "schemaVersion", type: "string" }, // ✅ schemaVersion added
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
    { name: "price", type: "string" },
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

  // ✅ Detect if this is an old VC (no schemaVersion in original)
  const isOldVC = !vc.schemaVersion;

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

  // ✅ Ensure all required EIP-712 fields are present
  if (!clone.credentialSubject) {
    clone.credentialSubject = {};
  }
  
  // Ensure certificateCredential is present (required by EIP-712 types)
  if (!clone.credentialSubject.certificateCredential) {
    clone.credentialSubject.certificateCredential = {
      name: '',
      cid: '',
    };
  }
  
  // Ensure other required fields have defaults
  if (clone.credentialSubject.previousCredential === undefined || clone.credentialSubject.previousCredential === null) {
    clone.credentialSubject.previousCredential = '';
  }
  if (!Array.isArray(clone.credentialSubject.componentCredentials)) {
    clone.credentialSubject.componentCredentials = [];
  }

  if (clone.issuer?.id) clone.issuer.id = clone.issuer.id.toLowerCase();
  if (clone.holder?.id) clone.holder.id = clone.holder.id.toLowerCase();
  if (clone.credentialSubject?.id) clone.credentialSubject.id = clone.credentialSubject.id.toLowerCase();

  // ✅ For old VCs: DON'T add schemaVersion (they were signed without it)
  // ✅ For new VCs: schemaVersion should already be present, or default to "1.0"
  if (!isOldVC && !clone.schemaVersion) {
    clone.schemaVersion = "1.0";
  }
  // For old VCs, remove schemaVersion if it was added (shouldn't be in payload for verification)
  if (isOldVC && clone.schemaVersion) {
    delete clone.schemaVersion;
  }

  console.log(`[verifyVC.js] Detected ${isOldVC ? 'OLD' : 'NEW'} VC format (schemaVersion: ${vc.schemaVersion || 'none'})`);
  console.log("[verifyVC.js] Payload to verify (with price as string):", clone);
  return { proofArr, dataToVerify: clone, isOldVC };
}

async function verifyProof(proof, dataToVerify, role, chainId, contractAddress = null, isOldVC = false) {
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
  
  // ✅ Build verification attempts: try different type sets and domain configurations
  const attempts = [];
  
  if (isOldVC) {
    // Old VC: try with old types (no schemaVersion) and without verifyingContract
    attempts.push({
      types: typesOld,
      domain: { ...BASE_DOMAIN, chainId: effectiveChainId },
      description: 'OLD VC format (no schemaVersion, no verifyingContract)'
    });
  } else {
    // New VC: try with new types (with schemaVersion)
    // First without verifyingContract (backward compatibility)
    attempts.push({
      types: typesNew,
      domain: { ...BASE_DOMAIN, chainId: effectiveChainId },
      description: 'NEW VC format (with schemaVersion, no verifyingContract)'
    });
    
    // Then with verifyingContract if provided
    if (contractAddress) {
      attempts.push({
        types: typesNew,
        domain: { ...BASE_DOMAIN, chainId: effectiveChainId, verifyingContract: contractAddress },
        description: 'NEW VC format (with schemaVersion, with verifyingContract)'
      });
    }
  }
  
  // Also try old types for new VCs (in case of edge cases)
  if (!isOldVC) {
    attempts.push({
      types: typesOld,
      domain: { ...BASE_DOMAIN, chainId: effectiveChainId },
      description: 'Fallback: OLD types (no schemaVersion)'
    });
  }

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

  // Try each verification attempt until one works
  let lastError = null;
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    const { types: attemptTypes, domain, description } = attempt;
    
    try {
      const payloadHash = TypedDataEncoder.hash(domain, attemptTypes, dataToVerify);
      console.log(`[verifyVC.js] [${role.toUpperCase()}] Attempt ${i + 1}/${attempts.length}: ${description}`);
      console.log(`[verifyVC.js] [${role.toUpperCase()}] Hash in Proof (payloadHash):`, proof.payloadHash);
      console.log(`[verifyVC.js] [${role.toUpperCase()}] Hash recomputed (EIP-712):`, payloadHash);

      if (proof.payloadHash && payloadHash !== proof.payloadHash) {
        console.warn(`[verifyVC.js] [${role}] Payload hash mismatch!\n  ↪ expected: ${proof.payloadHash}\n  ↪ actual:   ${payloadHash}`);
        // Continue to next attempt if hash doesn't match
        if (i < attempts.length - 1) {
          lastError = `Payload hash mismatch with ${description}`;
          continue;
        }
      }

      const recovered = verifyTypedData(domain, attemptTypes, dataToVerify, proof.jws);
      result.recovered_address = recovered;
      result.matching_signer = recovered.toLowerCase() === expectedAddress;
      result.signature_verified = result.matching_signer;

      if (result.signature_verified) {
        console.log(`[verifyVC.js] [${role}] ✅ Signature verified with ${description}`);
        return result; // Success! Return immediately
      } else {
        console.warn(`[verifyVC.js] [${role}] Signature does not match with ${description}`);
        lastError = `Signature does not match expected address for ${role}`;
        // Continue to next attempt if this one didn't work
        if (i < attempts.length - 1) {
          continue;
        }
      }
    } catch (err) {
      lastError = err.message;
      console.warn(`[verifyVC.js] [${role}] Verification failed with ${description}: ${err.message}`);
      // Continue to next attempt if this one threw an error
      if (i < attempts.length - 1) {
        continue;
      }
    }
  }

  // If we get here, all attempts failed
  result.error = `❌ [${role}] Verification failed with all configurations: ${lastError || 'Unknown error'}`;
  console.error(result.error);
  return result;
}

async function verifyVC(vcjsonData, isCertificate, contractAddress = null) {
  console.log("\n===============================");
  console.log("🔍 Starting Verifiable Credential verification");

  const { proofArr, dataToVerify, isOldVC } = prepareForVerification(vcjsonData);
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

  // ✅ Pass contractAddress and isOldVC to verifyProof for proper type/domain selection
  const issuerResult = await verifyProof(issuerProof, dataToVerify, "issuer", issuerChainId, contractAddress, isOldVC);
  const holderResult = isCertificate
    ? null
    : await verifyProof(holderProof, dataToVerify, "holder", holderChainId, contractAddress, isOldVC);

  console.log("🔚 VC Verification Results:", { issuer: issuerResult, holder: holderResult });
  console.log("===============================\n");

  return { issuer: issuerResult, holder: holderResult };
}

module.exports = { verifyVC };

