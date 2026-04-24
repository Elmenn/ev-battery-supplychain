import { Contract } from "ethers";
import { EqualityStatus } from "./equalityAttestationModel";

const PRODUCT_ESCROW_ABI = [
  "function name() view returns (string)",
  "function unitPrice() view returns (uint64)",
  "function unitPriceHash() view returns (bytes32)",
  "function priceCommitment() view returns (bytes32)",
  "function priceVisibility() view returns (uint8)",
  "function paymentToken() view returns (address)",
  "function buyer() view returns (address)",
  "function owner() view returns (address)",
  "function transporter() view returns (address)",
  "function phase() view returns (uint8)",
  "function activeOrderId() view returns (bytes32)",
  "function getVcHash() view returns (bytes32)",
  "function delivered() view returns (bool)",
  "function hasBuyerDeposit() view returns (bool)",
  "function hasSellerBondDeposit() view returns (bool)",
  "function hasSellerDeliveryFeeDeposit() view returns (bool)",
  "function hasTransporterSecurityDeposit() view returns (bool)",
  "function getSellerBondEqualityAttestation() view returns (uint8 status, bytes32 handle, uint64 requestedAt, uint64 verifiedAt)",
  "function getTransporterBondEqualityAttestation() view returns (uint8 status, bytes32 handle, uint64 requestedAt, uint64 verifiedAt)",
];

function normalizeAddress(value) {
  const normalized = value ? String(value).trim().toLowerCase() : "";
  return normalized === "0x0000000000000000000000000000000000000000" ? "" : normalized;
}

function mapEqualityStatus(status) {
  switch (Number(status)) {
    case 1:
      return EqualityStatus.Pending;
    case 2:
      return EqualityStatus.VerifiedTrue;
    case 3:
      return EqualityStatus.VerifiedFalse;
    default:
      return EqualityStatus.None;
  }
}

function mapAttestation(target, raw) {
  return {
    target,
    status: mapEqualityStatus(raw?.status ?? raw?.[0] ?? 0),
    handle: raw?.handle ?? raw?.[1] ?? null,
    requestedAt: Number(raw?.requestedAt ?? raw?.[2] ?? 0) || null,
    verifiedAt: Number(raw?.verifiedAt ?? raw?.[3] ?? 0) || null,
  };
}

export async function readProductEscrowState(provider, escrowAddress) {
  if (!provider) {
    throw new Error("provider is required");
  }
  if (!escrowAddress) {
    throw new Error("escrowAddress is required");
  }

  const escrow = new Contract(escrowAddress, PRODUCT_ESCROW_ABI, provider);
  const [
    name,
    unitPrice,
    unitPriceHash,
    priceCommitment,
    priceVisibility,
    paymentToken,
    buyer,
    owner,
    transporter,
    phase,
    activeOrderId,
    vcHash,
    delivered,
    hasBuyerDeposit,
    hasSellerBondDeposit,
    hasSellerDeliveryFeeDeposit,
    hasTransporterSecurityDeposit,
    sellerBondAttestationRaw,
    transporterBondAttestationRaw,
  ] = await Promise.all([
    escrow.name(),
    escrow.unitPrice(),
    escrow.unitPriceHash(),
    escrow.priceCommitment().catch(() => null),
    escrow.priceVisibility().catch(() => 0),
    escrow.paymentToken(),
    escrow.buyer(),
    escrow.owner(),
    escrow.transporter(),
    escrow.phase(),
    escrow.activeOrderId(),
    escrow.getVcHash(),
    escrow.delivered(),
    escrow.hasBuyerDeposit(),
    escrow.hasSellerBondDeposit(),
    escrow.hasSellerDeliveryFeeDeposit(),
    escrow.hasTransporterSecurityDeposit(),
    escrow.getSellerBondEqualityAttestation(),
    escrow.getTransporterBondEqualityAttestation(),
  ]);

  return {
    escrowAddress: normalizeAddress(escrowAddress),
    name: name || "",
    unitPriceWei: unitPrice != null ? unitPrice.toString() : "",
    unitPriceHash,
    priceCommitment: priceCommitment || unitPriceHash,
    priceVisibility: Number(priceVisibility) === 1 ? "private" : "public",
    paymentToken: normalizeAddress(paymentToken),
    buyerAddress: normalizeAddress(buyer),
    sellerAddress: normalizeAddress(owner),
    transporterAddress: normalizeAddress(transporter),
    phase: Number(phase),
    activeOrderId,
    vcHash,
    delivered: Boolean(delivered),
    hasBuyerDeposit: Boolean(hasBuyerDeposit),
    hasSellerBondDeposit: Boolean(hasSellerBondDeposit),
    hasSellerDeliveryFeeDeposit: Boolean(hasSellerDeliveryFeeDeposit),
    hasTransporterSecurityDeposit: Boolean(hasTransporterSecurityDeposit),
    sellerBondAttestation: mapAttestation("sellerBondMatchesBuyerDeposit", sellerBondAttestationRaw),
    transporterBondAttestation: mapAttestation(
      "transporterBondMatchesBuyerDeposit",
      transporterBondAttestationRaw
    ),
  };
}
