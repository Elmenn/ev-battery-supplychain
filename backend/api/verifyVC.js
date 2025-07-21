import { verifyTypedData, TypedDataEncoder } from "ethers";

// Matching EIP-712 domain and types
const domain = {
  name: "VC",
  version: "1.0",
  chainId: 1337,
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
  ],
  Certificate: [
    { name: "name", type: "string" },
    { name: "cid", type: "string" },
  ],
};

function prepareForVerification(vc) {
  const { proofs, ...rest } = vc;
  const clone = JSON.parse(JSON.stringify(rest));

  if (clone.credentialSubject?.vcHash) {
    delete clone.credentialSubject.vcHash;
  }
  if (clone.credentialSubject?.transactionId !== undefined) {
    delete clone.credentialSubject.transactionId;
  }

  if (clone.issuer?.id) clone.issuer.id = clone.issuer.id.toLowerCase();
  if (clone.holder?.id) clone.holder.id = clone.holder.id.toLowerCase();
  if (clone.credentialSubject?.id) clone.credentialSubject.id = clone.credentialSubject.id.toLowerCase();

  return { proofs, dataToVerify: clone };
}

async function verifyProof(proof, dataToVerify, role) {
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

  try {
    const payloadHash = TypedDataEncoder.hash(domain, types, dataToVerify);
    console.log(`\n🧪 [${role.toUpperCase()}] Verifying EIP-712 structured payload:`);
    console.log("→ Hash in Proof (payloadHash):", proof.payloadHash);
    console.log("→ Hash recomputed (EIP-712):", payloadHash);

    if (proof.payloadHash && payloadHash !== proof.payloadHash) {
      console.warn(`⚠️ [${role}] Payload hash mismatch!\n  ↪ expected: ${proof.payloadHash}\n  ↪ actual:   ${payloadHash}`);
    }

    const recovered = verifyTypedData(domain, types, dataToVerify, proof.jws);
    result.recovered_address = recovered;

    const verificationMethod = proof.verificationMethod;
    if (!verificationMethod?.startsWith("did:ethr:")) {
      result.error = `❌ Invalid verificationMethod format in ${role} proof`;
      console.error(result.error);
      return result;
    }

    const expectedAddress = verificationMethod.split(":").pop().toLowerCase();
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
      console.log(`✅ [${role}] Signature matches expected address.`);
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

export async function verifyVC(vcjsonData, isCertificate) {
  console.log("\n===============================");
  console.log("🔍 Starting Verifiable Credential verification");

  const { proofs, dataToVerify } = prepareForVerification(vcjsonData);
  if (!proofs) throw new Error("❌ No proofs section found in VC");

  const issuerResult = await verifyProof(proofs.issuerProof, dataToVerify, "issuer");
  const holderResult = isCertificate
    ? null
    : await verifyProof(proofs.holderProof, dataToVerify, "holder");

  console.log("🔚 VC Verification Results:", { issuer: issuerResult, holder: holderResult });
  console.log("===============================\n");

  return { issuer: issuerResult, holder: holderResult };
}

