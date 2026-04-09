const EqualityTarget = Object.freeze({
  SellerBondMatchesBuyerDeposit: "sellerBondMatchesBuyerDeposit",
  TransporterBondMatchesBuyerDeposit: "transporterBondMatchesBuyerDeposit",
});

const EqualityStatus = Object.freeze({
  None: "none",
  Pending: "pending",
  VerifiedTrue: "verified_true",
  VerifiedFalse: "verified_false",
  Cleared: "cleared",
});

const EQUALITY_TARGET_VALUES = new Set(Object.values(EqualityTarget));
const EQUALITY_STATUS_VALUES = new Set(Object.values(EqualityStatus));

function normalizeMaybeString(value) {
  return value == null ? null : String(value);
}

function buildEqualityAttestationRecord({
  orderId,
  target,
  status = EqualityStatus.None,
  handle = null,
  requestedAt = null,
  verifiedAt = null,
  verifiedTxHash = null,
}) {
  return {
    orderId: normalizeMaybeString(orderId) || "",
    target: normalizeMaybeString(target) || "",
    status: normalizeMaybeString(status) || EqualityStatus.None,
    handle: normalizeMaybeString(handle),
    requestedAt: requestedAt == null ? null : Number(requestedAt),
    verifiedAt: verifiedAt == null ? null : Number(verifiedAt),
    verifiedTxHash: normalizeMaybeString(verifiedTxHash),
  };
}

function validateEqualityAttestationRecord(record, fieldName = "record") {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(`${fieldName} must be an object`);
  }

  if (typeof record.orderId !== "string" || record.orderId.length === 0) {
    throw new Error(`${fieldName}.orderId is required`);
  }

  if (!EQUALITY_TARGET_VALUES.has(record.target)) {
    throw new Error(`${fieldName}.target must be a supported equality target`);
  }

  if (!EQUALITY_STATUS_VALUES.has(record.status)) {
    throw new Error(`${fieldName}.status must be a supported equality status`);
  }

  if (record.handle != null && (typeof record.handle !== "string" || record.handle.length === 0)) {
    throw new Error(`${fieldName}.handle must be a non-empty string when provided`);
  }

  if (record.verifiedTxHash != null && (typeof record.verifiedTxHash !== "string" || record.verifiedTxHash.length === 0)) {
    throw new Error(`${fieldName}.verifiedTxHash must be a non-empty string when provided`);
  }
}

function buildConfidentialSettlementPolicy({
  paymentToken,
  sellerBondPolicy = "equalToBuyerDeposit",
  transporterBondPolicy = "equalToBuyerDeposit",
  sellerDeliveryFeePolicy = "separateConfidentialDeposit",
}) {
  return {
    paymentToken: normalizeMaybeString(paymentToken) || "",
    buyerDepositRequired: true,
    sellerBondPolicy,
    transporterBondPolicy,
    sellerDeliveryFeePolicy,
  };
}

module.exports = {
  EqualityTarget,
  EqualityStatus,
  EQUALITY_TARGET_VALUES,
  EQUALITY_STATUS_VALUES,
  buildEqualityAttestationRecord,
  buildConfidentialSettlementPolicy,
  validateEqualityAttestationRecord,
};

