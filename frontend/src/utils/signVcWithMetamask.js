import { TypedDataEncoder } from "ethers";

/**
 * Prepares a VC payload for signing by:
 * - Deep cloning
 * - Removing `.proofs` and `.credentialSubject.vcHash`
 * - Lowercasing critical IDs
 */
function preparePayloadForSigning(vc) {
  const clone = JSON.parse(JSON.stringify(vc));

  // Remove signature-related fields
  delete clone.proofs;

  // Remove non-signable metadata from credentialSubject
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

  // Normalize DIDs to lowercase
  if (clone.issuer?.id) {
    clone.issuer.id = clone.issuer.id.toLowerCase();
  }
  if (clone.holder?.id) {
    clone.holder.id = clone.holder.id.toLowerCase();
  }
  if (clone.credentialSubject?.id) {
    clone.credentialSubject.id = clone.credentialSubject.id.toLowerCase();
  }

  return clone;
}

/**
 * Internal function to sign a clean VC payload and return the proof.
 */
async function signPayload(vc, signer, role = "holder") {
  const domain = {
    name: "VC",
    version: "1.0",
    chainId: 1337
  };

  const types = {
    Credential: [
      { name: "id", type: "string" },
      { name: "@context", type: "string[]" },
      { name: "type", type: "string[]" },
      { name: "issuer", type: "Party" },
      { name: "holder", type: "Party" },
      { name: "issuanceDate", type: "string" },
      { name: "credentialSubject", type: "CredentialSubject" }
    ],
    Party: [
      { name: "id", type: "string" },
      { name: "name", type: "string" }
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
      { name: "cid", type: "string" }
    ]
  };

  const payload = preparePayloadForSigning(vc);

  const signerAddress = await signer.getAddress();
  const signature = await signer.signTypedData(domain, types, payload);
  const payloadHash = TypedDataEncoder.hash(domain, types, payload);

  return {
    type: "EcdsaSecp256k1Signature2019",
    created: new Date().toISOString(),
    proofPurpose: "assertionMethod",
    verificationMethod: `did:ethr:1337:${signerAddress.toLowerCase()}`,
    jws: signature,
    payloadHash
  };
}

/**
 * Sign a VC as the buyer (holder).
 */
export async function signVcWithMetamask(vc, signer) {
  return await signPayload(vc, signer, "holder");
}

/**
 * Sign a VC as the seller (issuer).
 */
export async function signVcAsSeller(vc, signer) {
  return await signPayload(vc, signer, "seller");
}
