const { keccak256, toUtf8Bytes } = require("ethers");

const PaymentBridgeVerificationStatus = Object.freeze({
  Pending: "pending",
  Bound: "bound",
  Failed: "failed",
});

const PaymentBridgeVerificationMethod = Object.freeze({
  ProofBoundDepositReference: "proof-bound-deposit-reference",
});

const PAYMENT_BRIDGE_STATUS_VALUES = new Set(Object.values(PaymentBridgeVerificationStatus));
const PAYMENT_BRIDGE_METHOD_VALUES = new Set(Object.values(PaymentBridgeVerificationMethod));

function normalizeMaybeString(value) {
  return value == null ? null : String(value);
}

function computeCanonicalBridgeHash(payload) {
  return keccak256(toUtf8Bytes(JSON.stringify(payload)));
}

function buildDepositReference({
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
        depositTxHash: normalizeMaybeString(depositTxHash) || "",
        orderId: normalizeMaybeString(orderId) || "",
        depositKind: normalizeMaybeString(depositKind) || "",
        paymentToken: normalizeMaybeString(paymentToken) || "",
        escrowAddress: normalizeMaybeString(escrowAddress) || "",
        buyerAddress: normalizeMaybeString(buyerAddress) || "",
      })
    )
  );
}

function buildPaymentBridgeArtifact({
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
    contextHash: normalizeMaybeString(contextHash) || "",
    proofSide: {
      totalCommitment: normalizeMaybeString(totalCommitment) || "",
      contextHash: normalizeMaybeString(contextHash) || "",
    },
    depositSide: {
      paymentToken: normalizeMaybeString(paymentToken) || "",
      escrowAddress: normalizeMaybeString(escrowAddress) || "",
      orderId: normalizeMaybeString(orderId) || "",
      buyerAddress: normalizeMaybeString(buyerAddress) || "",
      depositTxHash: normalizeMaybeString(depositTxHash) || "",
      depositReference: normalizeMaybeString(depositReference) || "",
    },
    verification: {
      method: normalizeMaybeString(verificationMethod) || PaymentBridgeVerificationMethod.ProofBoundDepositReference,
      status: normalizeMaybeString(verificationStatus) || PaymentBridgeVerificationStatus.Pending,
    },
  };

  return {
    ...artifact,
    bridgeHash: computeCanonicalBridgeHash(artifact),
  };
}

function validatePaymentBridgeArtifact(artifact, fieldName = "paymentBridge") {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    throw new Error(`${fieldName} must be an object`);
  }

  if (artifact.version !== "1.0") {
    throw new Error(`${fieldName}.version must be 1.0`);
  }

  if (artifact.bridgeType !== "erc7984-confidential-payment-bridge") {
    throw new Error(`${fieldName}.bridgeType must be erc7984-confidential-payment-bridge`);
  }

  if (artifact.statement !== "buyerDepositEqualsHiddenTotal") {
    throw new Error(`${fieldName}.statement must be buyerDepositEqualsHiddenTotal`);
  }

  if (!artifact.contextHash || typeof artifact.contextHash !== "string") {
    throw new Error(`${fieldName}.contextHash is required`);
  }

  if (!artifact.bridgeHash || typeof artifact.bridgeHash !== "string") {
    throw new Error(`${fieldName}.bridgeHash is required`);
  }

  if (!artifact.proofSide || typeof artifact.proofSide !== "object") {
    throw new Error(`${fieldName}.proofSide is required`);
  }

  if (!artifact.depositSide || typeof artifact.depositSide !== "object") {
    throw new Error(`${fieldName}.depositSide is required`);
  }

  if (!artifact.verification || typeof artifact.verification !== "object") {
    throw new Error(`${fieldName}.verification is required`);
  }

  if (!PAYMENT_BRIDGE_METHOD_VALUES.has(artifact.verification.method)) {
    throw new Error(`${fieldName}.verification.method is not supported`);
  }

  if (!PAYMENT_BRIDGE_STATUS_VALUES.has(artifact.verification.status)) {
    throw new Error(`${fieldName}.verification.status is not supported`);
  }
}

module.exports = {
  PaymentBridgeVerificationStatus,
  PaymentBridgeVerificationMethod,
  PAYMENT_BRIDGE_STATUS_VALUES,
  PAYMENT_BRIDGE_METHOD_VALUES,
  computeCanonicalBridgeHash,
  buildDepositReference,
  buildPaymentBridgeArtifact,
  validatePaymentBridgeArtifact,
};

