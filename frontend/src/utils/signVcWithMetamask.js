import { TypedDataEncoder, BrowserProvider } from "ethers";

/**
 * Prepares a VC payload for signing by:
 * - Deep cloning
 * - Removing `.proofs` and `.credentialSubject.vcHash`
 * - Lowercasing critical IDs
 * - Serializing price as string
 */
function preparePayloadForSigning(vc) {
  const clone = JSON.parse(JSON.stringify(vc));

  delete clone.proofs;

  if (clone.credentialSubject?.vcHash) {
    delete clone.credentialSubject.vcHash;
  }
  if (clone.credentialSubject?.transactionId !== undefined) {
    delete clone.credentialSubject.transactionId;
  }

  if (clone.credentialSubject?.price && typeof clone.credentialSubject.price !== "string") {
    try {
      clone.credentialSubject.price = JSON.stringify(clone.credentialSubject.price);
    } catch {
      clone.credentialSubject.price = String(clone.credentialSubject.price);
    }
  }

  if (clone.issuer?.id) clone.issuer.id = clone.issuer.id.toLowerCase();
  if (clone.holder?.id) clone.holder.id = clone.holder.id.toLowerCase();
  if (clone.credentialSubject?.id) clone.credentialSubject.id = clone.credentialSubject.id.toLowerCase();

  return clone;
}

function resolveConfiguredChainId(fallbackChainId) {
  const envChain = process.env.REACT_APP_CHAIN_ID;
  if (envChain) {
    const parsed = Number(envChain);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return Number(fallbackChainId);
}

async function signPayload(vc, signer, role = "holder") {
  // Get the active chainId from the connected wallet (MetaMask)
  const provider =
    signer?.provider ??
    // fallback for safety (browser only)
    new BrowserProvider(window.ethereum);

  const { chainId } = await provider.getNetwork();
  const configuredChainId = resolveConfiguredChainId(chainId);
  if (configuredChainId !== Number(chainId)) {
    console.warn(
      `[signVcWithMetamask] Using configured chainId ${configuredChainId} for VC signing while wallet network is ${chainId}.`
    );
  }

  const domain = {
    name: "VC",
    version: "1.0",
    chainId: configuredChainId,
    // Optionally add verifyingContract to bind stronger, if you have one:
    // verifyingContract: FACTORY_OR_ESCROW_ADDRESS,
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
      { name: "price", type: "string" },
    ],
    Certificate: [
      { name: "name", type: "string" },
      { name: "cid", type: "string" },
    ],
  };

  const payload = preparePayloadForSigning(vc);

  const signerAddress = await signer.getAddress();
  const signature = await signer.signTypedData(domain, types, payload);
  const payloadHash = TypedDataEncoder.hash(domain, types, payload);

  return {
    type: "EcdsaSecp256k1Signature2019",
    created: new Date().toISOString(),
    proofPurpose: "assertionMethod",
    verificationMethod: `did:ethr:${configuredChainId}:${signerAddress.toLowerCase()}`,
    jws: signature,
    payloadHash,
    role,
  };
}

export async function signVcWithMetamask(vc, signer) {
  return await signPayload(vc, signer, "holder");
}

export async function signVcAsSeller(vc, signer) {
  return await signPayload(vc, signer, "seller");
}
