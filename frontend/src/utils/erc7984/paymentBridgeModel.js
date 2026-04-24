import { keccak256, toUtf8Bytes } from "ethers";

export const PaymentBridgeVerificationStatus = Object.freeze({
  Pending: "pending",
  Bound: "bound",
  Failed: "failed",
});

export const PaymentBridgeVerificationMethod = Object.freeze({
  ProofBoundDepositReference: "proof-bound-deposit-reference",
});

function normalizeBindingString(value, { lowercase = false } = {}) {
  const normalized = value == null ? "" : String(value).trim();
  return lowercase ? normalized.toLowerCase() : normalized;
}

export function buildErc7984ContextHashSeed({
  orderId,
  productId,
  chainId,
  escrowAddress,
  paymentToken,
  buyerAddress,
  sellerAddress,
  unitPriceHash,
  transporterAddress = null,
}) {
  return {
    orderId: orderId ? String(orderId) : "",
    productId: productId ? String(productId) : "",
    chainId: chainId ? String(chainId) : "",
    escrowAddress: escrowAddress ? String(escrowAddress) : "",
    paymentToken: paymentToken ? String(paymentToken) : "",
    buyerAddress: buyerAddress ? String(buyerAddress) : "",
    sellerAddress: sellerAddress ? String(sellerAddress) : "",
    unitPriceHash: unitPriceHash ? String(unitPriceHash) : "",
    transporterAddress: transporterAddress ? String(transporterAddress) : null,
  };
}

export function computeCanonicalBridgeHash(payload) {
  return keccak256(toUtf8Bytes(JSON.stringify(payload)));
}

export function buildCpayBindingTag({
  chainId,
  escrowAddress,
  orderId,
  depositTxHash,
}) {
  const payload = {
    version: "cpay-bind-v1",
    chainId: normalizeBindingString(chainId),
    escrowAddress: normalizeBindingString(escrowAddress, { lowercase: true }),
    orderId: normalizeBindingString(orderId, { lowercase: true }),
    depositTxHash: normalizeBindingString(depositTxHash, { lowercase: true }),
  };
  return computeCanonicalBridgeHash(payload);
}

export function buildDepositReference({
  depositTxHash,
  orderId,
  depositKind,
  paymentToken,
  escrowAddress,
  buyerAddress,
}) {
  return keccak256(
    toUtf8Bytes(
      JSON.stringify({
        depositTxHash: depositTxHash ? String(depositTxHash) : "",
        orderId: orderId ? String(orderId) : "",
        depositKind: depositKind ? String(depositKind) : "",
        paymentToken: paymentToken ? String(paymentToken) : "",
        escrowAddress: escrowAddress ? String(escrowAddress) : "",
        buyerAddress: buyerAddress ? String(buyerAddress) : "",
      })
    )
  );
}

export function buildPaymentBridgeArtifact({
  contextHash,
  totalCommitment,
  paymentToken,
  escrowAddress,
  orderId,
  buyerAddress,
  depositTxHash,
  depositReference,
  verificationStatus = PaymentBridgeVerificationStatus.Pending,
  verificationMethod = PaymentBridgeVerificationMethod.ProofBoundDepositReference,
}) {
  const artifact = {
    version: "1.0",
    bridgeType: "erc7984-confidential-payment-bridge",
    statement: "buyerDepositEqualsHiddenTotal",
    contextHash: contextHash ? String(contextHash) : "",
    proofSide: {
      totalCommitment: totalCommitment ? String(totalCommitment) : "",
      contextHash: contextHash ? String(contextHash) : "",
    },
    depositSide: {
      paymentToken: paymentToken ? String(paymentToken) : "",
      escrowAddress: escrowAddress ? String(escrowAddress) : "",
      orderId: orderId ? String(orderId) : "",
      buyerAddress: buyerAddress ? String(buyerAddress) : "",
      depositTxHash: depositTxHash ? String(depositTxHash) : "",
      depositReference: depositReference ? String(depositReference) : "",
    },
    verification: {
      method: verificationMethod,
      status: verificationStatus,
    },
  };

  return {
    ...artifact,
    bridgeHash: computeCanonicalBridgeHash(artifact),
  };
}
