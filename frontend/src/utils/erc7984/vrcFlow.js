import { createErc7984OrderVRCV6 } from "../vcBuilder.mjs";
import {
  PaymentBridgeVerificationMethod,
  PaymentBridgeVerificationStatus,
} from "./paymentBridgeModel.js";

function normalizeMaybeString(value) {
  return value == null ? "" : String(value);
}

function derivePaymentBridgeStatus({ paymentBridgeStatus, order, attestation }) {
  if (paymentBridgeStatus) {
    return paymentBridgeStatus;
  }

  const hasVerifierProofMaterial = Boolean(
    order?.paymentProof ||
      order?.totalProof ||
      order?.quantityProof ||
      attestation?.paymentEqualityProof ||
      attestation?.quantityTotalProof
  );

  return hasVerifierProofMaterial
    ? PaymentBridgeVerificationStatus.Bound
    : PaymentBridgeVerificationStatus.Pending;
}

export function buildErc7984OrderVrcFromRecovery({
  sellerAddress,
  buyerAddress,
  sellerName = "Seller",
  buyerName = "Buyer",
  productAddress,
  productMeta,
  order,
  attestation = null,
  paymentToken,
  buyerDepositTxHash = null,
  buyerDepositReference = null,
  sellerBondAttestation = null,
  paymentBridgeStatus = null,
  paymentBridgeMethod = PaymentBridgeVerificationMethod.ProofBoundDepositReference,
  proofSourceType = "local-proof-generation",
  proofSourceVersion = "1.0",
}) {
  if (!productMeta || typeof productMeta !== "object") {
    throw new Error("productMeta is required to build the ERC-7984 VRC");
  }
  if (!order || typeof order !== "object") {
    throw new Error("order is required to build the ERC-7984 VRC");
  }
  if (!sellerAddress) {
    throw new Error("sellerAddress is required to build the ERC-7984 VRC");
  }
  if (!buyerAddress) {
    throw new Error("buyerAddress is required to build the ERC-7984 VRC");
  }

  const derivedPaymentBridgeStatus = derivePaymentBridgeStatus({
    paymentBridgeStatus,
    order,
    attestation,
  });

  return createErc7984OrderVRCV6({
    sellerAddr: sellerAddress,
    buyerAddr: buyerAddress,
    sellerName,
    buyerName,
    productName: productMeta.productName || productMeta.name || "",
    batch: productMeta.batch || "",
    productContract: normalizeMaybeString(productAddress || order.productAddress || order.escrowAddress),
    productId: normalizeMaybeString(order.productId || productMeta.productId),
    chainId: normalizeMaybeString(order.chainId || productMeta.chainId),
    unitPriceWei: normalizeMaybeString(order.unitPriceWei || productMeta.unitPriceWei),
    unitPriceHash: normalizeMaybeString(order.unitPriceHash || productMeta.unitPriceHash),
    listingSnapshotCid: normalizeMaybeString(productMeta.listingSnapshotCid),
    certificateCredential: productMeta.certificateCredential || { name: "", cid: "" },
    componentCredentials: Array.isArray(productMeta.componentCredentials)
      ? productMeta.componentCredentials
      : [],
    orderId: normalizeMaybeString(order.orderId),
    escrowAddress: normalizeMaybeString(order.escrowAddress || productAddress),
    paymentToken: normalizeMaybeString(paymentToken || productMeta.paymentToken),
    quantityCommitment: normalizeMaybeString(order.quantityCommitment),
    totalCommitment: normalizeMaybeString(order.totalCommitment),
    paymentCommitment: normalizeMaybeString(order.paymentCommitment),
    contextHash: normalizeMaybeString(order.contextHash),
    disclosurePubKey: normalizeMaybeString(attestation?.disclosurePubkey),
    quantityTotalProof: order.quantityProof || attestation?.quantityTotalProof || null,
    paymentEqualityProof: order.paymentProof || attestation?.paymentEqualityProof || null,
    sellerBondAttestation,
    buyerDepositTxHash: normalizeMaybeString(
      buyerDepositTxHash || order.depositTxHash || attestation?.proofBundle?.depositTxHash
    ),
    buyerDepositReference: normalizeMaybeString(
      buyerDepositReference || attestation?.proofBundle?.depositReference
    ),
    paymentBridgeStatus: derivedPaymentBridgeStatus,
    paymentBridgeMethod,
    proofSourceType,
    proofSourceVersion,
  });
}

export async function signUploadArchiveErc7984OrderVrc({
  vrc,
  signer,
  contractAddress,
  archiveSource = "frontend-upload",
}) {
  if (!vrc || typeof vrc !== "object") {
    throw new Error("vrc is required");
  }
  if (!signer) {
    throw new Error("signer is required");
  }

  const [{ signVcAsSeller }, { uploadJson }, { archiveVCWithServer }] = await Promise.all([
    import("../signVcWithMetamask"),
    import("../ipfs"),
    import("../verifyVc"),
  ]);

  const signedVrc = JSON.parse(JSON.stringify(vrc));
  const proof = await signVcAsSeller(signedVrc, signer, contractAddress || null);
  signedVrc.proof = Array.isArray(signedVrc.proof) ? signedVrc.proof : [];
  signedVrc.proof.push(proof);

  const cid = await uploadJson(signedVrc);
  const archiveResult = await archiveVCWithServer(cid, signedVrc, archiveSource);

  return {
    cid,
    vrc: signedVrc,
    archive: archiveResult?.archive || null,
  };
}
