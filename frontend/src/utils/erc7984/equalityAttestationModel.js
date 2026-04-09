export const EqualityTarget = Object.freeze({
  SellerBondMatchesBuyerDeposit: "sellerBondMatchesBuyerDeposit",
  TransporterBondMatchesBuyerDeposit: "transporterBondMatchesBuyerDeposit",
});

export const EqualityStatus = Object.freeze({
  None: "none",
  Pending: "pending",
  VerifiedTrue: "verified_true",
  VerifiedFalse: "verified_false",
  Cleared: "cleared",
});

export function buildEqualityAttestationRecord({
  orderId,
  target,
  status = EqualityStatus.None,
  handle = null,
  requestedAt = null,
  verifiedAt = null,
  verifiedTxHash = null,
}) {
  return {
    orderId: orderId ? String(orderId) : "",
    target: target ? String(target) : "",
    status: status ? String(status) : EqualityStatus.None,
    handle: handle ? String(handle) : null,
    requestedAt: requestedAt == null ? null : Number(requestedAt),
    verifiedAt: verifiedAt == null ? null : Number(verifiedAt),
    verifiedTxHash: verifiedTxHash ? String(verifiedTxHash) : null,
  };
}

export function buildConfidentialSettlementPolicy({
  paymentToken,
  sellerBondPolicy = "equalToBuyerDeposit",
  transporterBondPolicy = "equalToBuyerDeposit",
  sellerDeliveryFeePolicy = "separateConfidentialDeposit",
}) {
  return {
    paymentToken: paymentToken ? String(paymentToken) : "",
    buyerDepositRequired: true,
    sellerBondPolicy,
    transporterBondPolicy,
    sellerDeliveryFeePolicy,
  };
}

export function buildEqualityAttestationEvidence({
  chainId,
  escrowAddress,
  orderId,
  attestation,
}) {
  return {
    chainId: chainId ? String(chainId) : "",
    escrowAddress: escrowAddress ? String(escrowAddress) : "",
    orderId: orderId ? String(orderId) : "",
    target: attestation?.target ? String(attestation.target) : "",
    status: attestation?.status ? String(attestation.status) : EqualityStatus.None,
    handle: attestation?.handle ? String(attestation.handle) : null,
    requestedAt: attestation?.requestedAt ?? null,
    verifiedAt: attestation?.verifiedAt ?? null,
    verifiedTxHash: attestation?.verifiedTxHash ? String(attestation.verifiedTxHash) : null,
  };
}

