import {
  generateScalarCommitmentWithBlindingPreferWasm,
  generateValueCommitmentWithBlindingPreferWasm,
} from "../zkp/zkpClient";
import {
  assertVerifiedProof,
  generateQuantityTotalProofPreferWasm,
  generateTotalPaymentEqualityProofPreferWasm,
  verifyQuantityTotalProofPreferWasm,
  verifyTotalPaymentEqualityProofPreferWasm,
} from "../equalityProofClient";
import { assertScalarValue, assertU64Value, generateRandomBlinding } from "../commitmentUtils";
import {
  buildDepositReference,
  buildErc7984ContextHashSeed,
  computeCanonicalBridgeHash,
} from "./paymentBridgeModel";

function normalizeMaybeString(value) {
  return value == null ? "" : String(value);
}

function normalizeBytes32Output(value, fieldName) {
  if (!value) {
    throw new Error(`${fieldName} is required`);
  }
  const normalized = String(value).trim().toLowerCase();
  const prefixed = normalized.startsWith("0x") ? normalized : `0x${normalized}`;
  if (!/^0x[0-9a-f]{64}$/i.test(prefixed)) {
    throw new Error(`${fieldName} must be a 32-byte hex string`);
  }
  return prefixed;
}

function summarizeProofEngine(...sources) {
  const normalized = sources.filter(Boolean);
  if (normalized.length === 0) {
    return "unknown";
  }
  if (normalized.every((source) => source === "WASM")) {
    return "zkp-wasm";
  }
  if (normalized.some((source) => source === "WASM")) {
    return "zkp-wasm-with-backend-fallback";
  }
  return "zkp-backend";
}

function deriveQuantityValue({ buyerQuantity, buyerAmount, unitPriceWei }) {
  const buyer = BigInt(assertU64Value(buyerAmount, "buyerAmount"));

  if (buyerQuantity != null && String(buyerQuantity).trim() !== "") {
    if (!unitPriceWei) {
      throw new Error("unitPriceWei is required when buyerQuantity is provided.");
    }
    const quantity = assertScalarValue(String(buyerQuantity).trim(), "buyerQuantity");
    const unitPrice = BigInt(assertU64Value(unitPriceWei, "unitPriceWei"));
    const expectedTotal = unitPrice * BigInt(quantity);
    if (expectedTotal !== buyer) {
      throw new Error(
        `buyerAmount must equal unitPriceWei * buyerQuantity. Expected ${expectedTotal.toString()}, got ${buyer.toString()}.`
      );
    }
    return quantity;
  }

  if (!unitPriceWei) {
    return "";
  }

  const unitPrice = BigInt(assertU64Value(unitPriceWei, "unitPriceWei"));
  if (unitPrice === 0n || buyer === 0n || buyer % unitPrice !== 0n) {
    return "";
  }

  return assertScalarValue((buyer / unitPrice).toString(), "quantity");
}

export async function generateBuyerPaymentBridgeSidecar({
  chainId,
  orderId,
  productId = "",
  productAddress,
  paymentToken,
  buyerAddress,
  sellerAddress,
  transporterAddress = "",
  unitPriceWei = "",
  unitPriceHash,
  buyerAmount,
  buyerQuantity = "",
  depositTxHash,
}) {
  const normalizedBuyerAmount = assertU64Value(buyerAmount, "buyerAmount");
  const contextHash = computeCanonicalBridgeHash(
    buildErc7984ContextHashSeed({
      orderId,
      productId,
      chainId,
      escrowAddress: productAddress,
      paymentToken,
      buyerAddress,
      sellerAddress,
      unitPriceHash,
      transporterAddress,
    })
  );
  const depositReference = buildDepositReference({
    depositTxHash,
    orderId,
    depositKind: "BuyerPurchase",
    paymentToken,
    escrowAddress: productAddress,
    buyerAddress,
  });

  const rTotal = generateRandomBlinding();
  const rPay = generateRandomBlinding();
  const [totalCommitmentResult, paymentCommitmentResult] = await Promise.all([
    generateValueCommitmentWithBlindingPreferWasm({
      value: normalizedBuyerAmount,
      blindingHex: `0x${rTotal}`,
    }),
    generateValueCommitmentWithBlindingPreferWasm({
      value: normalizedBuyerAmount,
      blindingHex: `0x${rPay}`,
    }),
  ]);

  const totalCommitment = normalizeBytes32Output(totalCommitmentResult.commitment, "totalCommitment");
  const paymentCommitment = normalizeBytes32Output(
    paymentCommitmentResult.commitment,
    "paymentCommitment"
  );

  const paymentEqualityProof = await generateTotalPaymentEqualityProofPreferWasm({
    cTotalHex: totalCommitment,
    cPayHex: paymentCommitment,
    rTotalHex: `0x${rTotal}`,
    rPayHex: `0x${rPay}`,
    contextHashHex: contextHash,
  });
  await assertVerifiedProof(paymentEqualityProof, "ERC-7984 total-payment equality proof");
  await assertVerifiedProof(
    await verifyTotalPaymentEqualityProofPreferWasm({
      cTotalHex: totalCommitment,
      cPayHex: paymentCommitment,
      proofRHex: paymentEqualityProof.proof_r_hex,
      proofSHex: paymentEqualityProof.proof_s_hex,
      contextHashHex: contextHash,
    }),
    "ERC-7984 total-payment equality proof"
  );

  const quantityValue = deriveQuantityValue({
    buyerQuantity,
    buyerAmount: normalizedBuyerAmount,
    unitPriceWei,
  });

  let quantityCommitment = null;
  let quantityProof = null;
  let quantityTotalProof = null;

  if (quantityValue) {
    const rQuantity = generateRandomBlinding();
    const quantityCommitmentResult = await generateScalarCommitmentWithBlindingPreferWasm({
      value: quantityValue,
      blindingHex: `0x${rQuantity}`,
    });
    const normalizedQuantityCommitment = normalizeBytes32Output(
      quantityCommitmentResult.commitment,
      "quantityCommitment"
    );

    quantityTotalProof = await generateQuantityTotalProofPreferWasm({
      cQuantityHex: normalizedQuantityCommitment,
      cTotalHex: totalCommitment,
      unitPriceWei: normalizeMaybeString(unitPriceWei),
      rQuantityHex: `0x${rQuantity}`,
      rTotalHex: `0x${rTotal}`,
      contextHashHex: contextHash,
    });
    await assertVerifiedProof(quantityTotalProof, "ERC-7984 quantity-total proof");
    await assertVerifiedProof(
      await verifyQuantityTotalProofPreferWasm({
        cQuantityHex: normalizedQuantityCommitment,
        cTotalHex: totalCommitment,
        unitPriceWei: normalizeMaybeString(unitPriceWei),
        proofRHex: quantityTotalProof.proof_r_hex,
        proofSHex: quantityTotalProof.proof_s_hex,
        contextHashHex: contextHash,
      }),
      "ERC-7984 quantity-total proof"
    );

    quantityCommitment = normalizedQuantityCommitment;
    quantityProof = {
      type: "quantity-total-sigma",
      quantity: quantityValue,
      unitPriceWei: normalizeMaybeString(unitPriceWei),
      commitmentProof: quantityCommitmentResult.proof || null,
      commitmentProofType: quantityCommitmentResult.proof_type || "",
      commitmentEngine: quantityCommitmentResult.source || "zkp-backend",
      proofEngine: quantityTotalProof.source || "zkp-backend",
      ...quantityTotalProof,
    };
  }

  return {
    productId: normalizeMaybeString(productId),
    unitPriceWei: normalizeMaybeString(unitPriceWei),
    contextHash,
    quantityCommitment,
    quantityProof,
    totalCommitment,
    totalProof: {
      type: "pedersen-value-commitment",
      value: normalizedBuyerAmount,
      commitmentProof: totalCommitmentResult.proof || null,
      commitmentProofType: totalCommitmentResult.proof_type || "",
      commitmentEngine: totalCommitmentResult.source || "zkp-backend",
    },
    paymentCommitment,
    paymentProof: {
      type: "total-payment-equality-sigma",
      value: normalizedBuyerAmount,
      commitmentProof: paymentCommitmentResult.proof || null,
      commitmentProofType: paymentCommitmentResult.proof_type || "",
      commitmentEngine: paymentCommitmentResult.source || "zkp-backend",
      proofEngine: paymentEqualityProof.source || "zkp-backend",
      ...paymentEqualityProof,
    },
    proofBundle: {
      version: "1.0",
      source: "erc7984-browser-proof-sidecar",
      proofEngine: summarizeProofEngine(
        totalCommitmentResult.source,
        paymentCommitmentResult.source,
        quantityProof?.commitmentEngine,
        paymentEqualityProof.source,
        quantityTotalProof?.source
      ),
      contextHash,
      quantityValue: quantityValue || "",
      unitPriceWei: normalizeMaybeString(unitPriceWei),
      totalValue: normalizedBuyerAmount,
      totalCommitment,
      paymentCommitment,
      depositTxHash: normalizeMaybeString(depositTxHash),
      depositReference,
    },
    paymentEqualityProof,
    quantityTotalProof,
  };
}
