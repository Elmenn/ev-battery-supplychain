import { TypedDataEncoder, BrowserProvider } from "ethers";

/**
 * Prepares a VC payload for signing by:
 * - Deep cloning
 * - Removing `.proofs` and `.credentialSubject.vcHash`
 * - Lowercasing critical IDs
 * - Serializing price as string
 * - Ensuring schemaVersion is set (defaults to "1.0" if not present)
 */
export function preparePayloadForSigning(vc) {
  const clone = JSON.parse(JSON.stringify(vc));

  delete clone.proofs;

  if (clone.credentialSubject?.vcHash) {
    delete clone.credentialSubject.vcHash;
  }
  // Remove transaction-related fields from signing payload (they're not part of EIP-712 types)
  if (clone.credentialSubject?.transactionId !== undefined) {
    delete clone.credentialSubject.transactionId;
  }
  if (clone.credentialSubject?.txHashCommitment !== undefined) {
    delete clone.credentialSubject.txHashCommitment;
  }
  // Phase 1: Exclude purchase TX hash commitment from signing (same as delivery TX hash commitment)
  if (clone.credentialSubject?.purchaseTxHashCommitment !== undefined) {
    delete clone.credentialSubject.purchaseTxHashCommitment;
  }

  // v2.0: Strip mutable sections (payment, delivery, previousVersion)
  // These are appended after listing signature, so must not be part of signed payload
  if (clone.credentialSubject?.payment !== undefined) {
    delete clone.credentialSubject.payment;
  }
  if (clone.credentialSubject?.delivery !== undefined) {
    delete clone.credentialSubject.delivery;
  }
  if (clone.previousVersion !== undefined) {
    delete clone.previousVersion;
  }

  // v2.0: Serialize priceCommitment object to price string for EIP-712 compatibility
  if (clone.credentialSubject?.priceCommitment && typeof clone.credentialSubject.priceCommitment === 'object') {
    try {
      clone.credentialSubject.price = JSON.stringify(clone.credentialSubject.priceCommitment);
    } catch {
      clone.credentialSubject.price = String(clone.credentialSubject.priceCommitment);
    }
    delete clone.credentialSubject.priceCommitment;
  }

  if (clone.credentialSubject?.price && typeof clone.credentialSubject.price !== "string") {
    try {
      clone.credentialSubject.price = JSON.stringify(clone.credentialSubject.price);
    } catch {
      clone.credentialSubject.price = String(clone.credentialSubject.price);
    }
  }

  // ✅ Ensure all required EIP-712 fields are present
  if (!clone.credentialSubject) {
    clone.credentialSubject = {};
  }
  
  // v2.0: Flatten listing sub-object for EIP-712 compatibility
  // v2.0 nests certificateCredential and componentCredentials under listing;
  // flattening makes them compatible with existing EIP-712 types
  if (clone.credentialSubject?.listing) {
    clone.credentialSubject.certificateCredential = clone.credentialSubject.listing.certificateCredential || { name: "", cid: "" };
    clone.credentialSubject.componentCredentials = clone.credentialSubject.listing.componentCredentials || [];
    delete clone.credentialSubject.listing;
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

  // ✅ Ensure schemaVersion is set (defaults to "1.0" for backward compatibility)
  if (!clone.schemaVersion) {
    clone.schemaVersion = "1.0";
  }

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

async function signPayload(vc, signer, role = "holder", contractAddress = null) {
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
    // ✅ Add verifyingContract to bind signature to specific contract (prevents cross-contract replay)
    ...(contractAddress ? { verifyingContract: contractAddress } : {}),
  };

  const types = {
    Credential: [
      { name: "id", type: "string" },
      { name: "@context", type: "string[]" },
      { name: "type", type: "string[]" },
      { name: "schemaVersion", type: "string" }, // ✅ Add schemaVersion to EIP-712 types
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

/**
 * Sign VC as holder (buyer)
 * @param {Object} vc - Verifiable Credential object
 * @param {Object} signer - Ethers signer (from MetaMask)
 * @param {string} [contractAddress] - Optional contract address for verifyingContract binding
 * @returns {Promise<Object>} Proof object with signature
 */
export async function signVcWithMetamask(vc, signer, contractAddress = null) {
  return await signPayload(vc, signer, "holder", contractAddress);
}

/**
 * Sign VC as seller (issuer)
 * @param {Object} vc - Verifiable Credential object
 * @param {Object} signer - Ethers signer (from MetaMask)
 * @param {string} [contractAddress] - Optional contract address for verifyingContract binding
 * @returns {Promise<Object>} Proof object with signature
 */
export async function signVcAsSeller(vc, signer, contractAddress = null) {
  return await signPayload(vc, signer, "seller", contractAddress);
}
