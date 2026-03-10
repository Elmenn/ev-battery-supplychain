import { TypedDataEncoder, BrowserProvider } from "ethers";
import { buildVcSigningAnchorPayload } from "./vcBuilder.mjs";

export const VC_SIGN_PAYLOAD_FORMAT_LEGACY = "eip712-legacy-price-string";
export const VC_SIGN_PAYLOAD_FORMAT_V2_TYPED = "eip712-v2-order-typed";

const LEGACY_EIP712_TYPES = {
  Credential: [
    { name: "id", type: "string" },
    { name: "@context", type: "string[]" },
    { name: "type", type: "string[]" },
    { name: "schemaVersion", type: "string" },
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
    { name: "sellerRailgunAddress", type: "string" },
    { name: "price", type: "string" },
  ],
  Certificate: [
    { name: "name", type: "string" },
    { name: "cid", type: "string" },
  ],
};

const V2_TYPED_EIP712_TYPES = {
  Credential: [
    { name: "id", type: "string" },
    { name: "@context", type: "string[]" },
    { name: "type", type: "string[]" },
    { name: "schemaVersion", type: "string" },
    { name: "issuer", type: "Party" },
    { name: "holder", type: "Party" },
    { name: "issuanceDate", type: "string" },
    { name: "credentialSubject", type: "CredentialSubjectV2" },
  ],
  Party: [
    { name: "id", type: "string" },
    { name: "name", type: "string" },
  ],
  CredentialSubjectV2: [
    { name: "id", type: "string" },
    { name: "productName", type: "string" },
    { name: "batch", type: "string" },
    { name: "quantity", type: "uint256" },
    { name: "previousCredential", type: "string" },
    { name: "listing", type: "Listing" },
    { name: "order", type: "Order" },
    { name: "commitments", type: "Commitments" },
    { name: "attestation", type: "Attestation" },
  ],
  Listing: [
    { name: "unitPriceWei", type: "string" },
    { name: "unitPriceHash", type: "string" },
    { name: "listingSnapshotCid", type: "string" },
    { name: "sellerRailgunAddress", type: "string" },
    { name: "certificateCredential", type: "Certificate" },
    { name: "componentCredentials", type: "string[]" },
  ],
  Certificate: [
    { name: "name", type: "string" },
    { name: "cid", type: "string" },
  ],
  Order: [
    { name: "orderId", type: "string" },
    { name: "productId", type: "string" },
    { name: "escrowAddr", type: "string" },
    { name: "chainId", type: "string" },
    { name: "buyerAddress", type: "string" },
    { name: "memoHash", type: "string" },
    { name: "railgunTxRef", type: "string" },
  ],
  Commitments: [
    { name: "quantityCommitment", type: "string" },
    { name: "totalCommitment", type: "string" },
    { name: "paymentCommitment", type: "string" },
  ],
  Attestation: [
    { name: "attestationVersion", type: "string" },
    { name: "contextHash", type: "string" },
    { name: "disclosurePubKey", type: "string" },
    { name: "proofSource", type: "ProofSource" },
  ],
  ProofSource: [
    { name: "type", type: "string" },
    { name: "orderId", type: "string" },
    { name: "version", type: "string" },
  ],
};

function normalizeId(value) {
  return typeof value === "string" ? value.toLowerCase() : value;
}

function normalizeMaybeString(value) {
  return value == null ? "" : String(value);
}

function buildBaseClone(vc) {
  const clone = JSON.parse(JSON.stringify(vc || {}));

  delete clone.proofs;
  delete clone.proof;

  if (!clone.credentialSubject || typeof clone.credentialSubject !== "object") {
    clone.credentialSubject = {};
  }

  delete clone.credentialSubject.vcHash;
  delete clone.credentialSubject.transactionId;
  delete clone.credentialSubject.txHashCommitment;
  delete clone.credentialSubject.purchaseTxHashCommitment;

  delete clone.credentialSubject.payment;
  delete clone.credentialSubject.delivery;
  delete clone.previousVersion;

  if (!clone.schemaVersion) {
    clone.schemaVersion = "1.0";
  }
  if (!clone.issuer) clone.issuer = { id: "", name: "" };
  if (!clone.holder) clone.holder = { id: "", name: "" };
  if (!clone.credentialSubject.id) {
    clone.credentialSubject.id = String(clone.issuer?.id || "");
  }
  if (clone.issuer?.id) clone.issuer.id = normalizeId(clone.issuer.id);
  if (clone.holder?.id) clone.holder.id = normalizeId(clone.holder.id);
  if (clone.credentialSubject?.id) clone.credentialSubject.id = normalizeId(clone.credentialSubject.id);

  clone.credentialSubject.productName = String(clone.credentialSubject.productName || "");
  clone.credentialSubject.batch = String(clone.credentialSubject.batch || "");
  if (clone.credentialSubject.quantity == null) clone.credentialSubject.quantity = 0;
  if (clone.credentialSubject.previousCredential == null) clone.credentialSubject.previousCredential = "";

  return clone;
}

function buildLegacyPayload(vc) {
  const clone = buildBaseClone(vc);
  const stableAnchorPayload = buildVcSigningAnchorPayload(clone.credentialSubject);

  delete clone.credentialSubject.order;
  delete clone.credentialSubject.commitments;
  delete clone.credentialSubject.attestation;

  const signedPricePayload = {};
  if (clone.credentialSubject?.priceCommitment && typeof clone.credentialSubject.priceCommitment === "object") {
    signedPricePayload.priceCommitment = clone.credentialSubject.priceCommitment;
    delete clone.credentialSubject.priceCommitment;
  }
  if (stableAnchorPayload) {
    signedPricePayload.v2OrderAnchors = stableAnchorPayload;
  }

  if (Object.keys(signedPricePayload).length > 0) {
    try {
      clone.credentialSubject.price = JSON.stringify(signedPricePayload);
    } catch {
      clone.credentialSubject.price = String(signedPricePayload);
    }
  }

  if (clone.credentialSubject?.listing) {
    clone.credentialSubject.certificateCredential =
      clone.credentialSubject.listing.certificateCredential || { name: "", cid: "" };
    clone.credentialSubject.componentCredentials =
      clone.credentialSubject.listing.componentCredentials || [];
    clone.credentialSubject.sellerRailgunAddress =
      clone.credentialSubject.listing.sellerRailgunAddress || "";
    delete clone.credentialSubject.listing;
  }

  if (!clone.credentialSubject.certificateCredential) {
    clone.credentialSubject.certificateCredential = { name: "", cid: "" };
  }
  clone.credentialSubject.certificateCredential.name = String(
    clone.credentialSubject.certificateCredential.name || ""
  );
  clone.credentialSubject.certificateCredential.cid = String(
    clone.credentialSubject.certificateCredential.cid || ""
  );
  if (!Array.isArray(clone.credentialSubject.componentCredentials)) {
    clone.credentialSubject.componentCredentials = [];
  }
  clone.credentialSubject.componentCredentials = clone.credentialSubject.componentCredentials
    .filter((item) => item != null)
    .map((item) => String(item));
  if (clone.credentialSubject.price == null) clone.credentialSubject.price = "";
  if (typeof clone.credentialSubject.sellerRailgunAddress !== "string") {
    clone.credentialSubject.sellerRailgunAddress = "";
  }

  return clone;
}

function buildTypedV2Payload(vc) {
  const clone = buildBaseClone(vc);
  const listing = clone.credentialSubject?.listing || {};
  const order = clone.credentialSubject?.order || {};
  const commitments = clone.credentialSubject?.commitments || {};
  const attestation = clone.credentialSubject?.attestation || {};

  clone.credentialSubject = {
    id: clone.credentialSubject.id,
    productName: clone.credentialSubject.productName,
    batch: clone.credentialSubject.batch,
    quantity: clone.credentialSubject.quantity,
    previousCredential: String(clone.credentialSubject.previousCredential || ""),
    listing: {
      unitPriceWei: normalizeMaybeString(listing.unitPriceWei),
      unitPriceHash: normalizeMaybeString(listing.unitPriceHash),
      listingSnapshotCid: normalizeMaybeString(listing.listingSnapshotCid),
      sellerRailgunAddress: normalizeMaybeString(listing.sellerRailgunAddress),
      certificateCredential: {
        name: String(listing.certificateCredential?.name || ""),
        cid: String(listing.certificateCredential?.cid || ""),
      },
      componentCredentials: Array.isArray(listing.componentCredentials)
        ? listing.componentCredentials.filter((item) => item != null).map((item) => String(item))
        : [],
    },
    order: {
      orderId: normalizeMaybeString(order.orderId),
      productId: normalizeMaybeString(order.productId),
      escrowAddr: normalizeMaybeString(order.escrowAddr),
      chainId: normalizeMaybeString(order.chainId),
      buyerAddress: normalizeMaybeString(order.buyerAddress),
      memoHash: normalizeMaybeString(order.memoHash),
      railgunTxRef: normalizeMaybeString(order.railgunTxRef),
    },
    commitments: {
      quantityCommitment: normalizeMaybeString(commitments.quantityCommitment),
      totalCommitment: normalizeMaybeString(commitments.totalCommitment),
      paymentCommitment: normalizeMaybeString(commitments.paymentCommitment),
    },
    attestation: {
      attestationVersion: String(attestation.attestationVersion || "2.0"),
      contextHash: normalizeMaybeString(attestation.contextHash),
      disclosurePubKey: normalizeMaybeString(attestation.disclosurePubKey),
      proofSource: {
        type: String(attestation.proofSource?.type || ""),
        orderId: normalizeMaybeString(attestation.proofSource?.orderId),
        version: String(attestation.proofSource?.version || ""),
      },
    },
  };

  return clone;
}

function resolvePayloadForSigning(vc) {
  const hasTypedV2Anchors = Boolean(buildVcSigningAnchorPayload(vc?.credentialSubject));
  if (hasTypedV2Anchors) {
    return {
      payloadFormat: VC_SIGN_PAYLOAD_FORMAT_V2_TYPED,
      types: V2_TYPED_EIP712_TYPES,
      payload: buildTypedV2Payload(vc),
    };
  }

  return {
    payloadFormat: VC_SIGN_PAYLOAD_FORMAT_LEGACY,
    types: LEGACY_EIP712_TYPES,
    payload: buildLegacyPayload(vc),
  };
}

export function preparePayloadForSigning(vc) {
  return resolvePayloadForSigning(vc).payload;
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
  const provider =
    signer?.provider ??
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
    ...(contractAddress ? { verifyingContract: contractAddress } : {}),
  };

  const { payloadFormat, types, payload } = resolvePayloadForSigning(vc);
  const signerAddress = await signer.getAddress();
  const signature = await signer.signTypedData(domain, types, payload);
  const payloadHash = TypedDataEncoder.hash(domain, types, payload);

  return {
    type: "EcdsaSecp256k1Signature2019",
    created: new Date().toISOString(),
    proofPurpose: "assertionMethod",
    verificationMethod: `did:ethr:${configuredChainId}:${signerAddress.toLowerCase()}#controller`,
    jws: signature,
    payloadHash,
    payloadFormat,
    role,
  };
}

export async function signVcWithMetamask(vc, signer, contractAddress = null) {
  return await signPayload(vc, signer, "holder", contractAddress);
}

export async function signVcAsSeller(vc, signer, contractAddress = null) {
  return await signPayload(vc, signer, "seller", contractAddress);
}
