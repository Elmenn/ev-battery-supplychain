import {
  generateScalarCommitmentWithBlindingPreferWasm,
  generateValueCommitmentWithBindingPreferWasm,
  generateValueCommitmentWithBlindingPreferWasm,
} from "../zkp/zkpClient";
import {
  assertVerifiedProof,
  generatePrivatePriceQuantityTotalBulletproof,
  generateQuantityTotalProofPreferWasm,
  generateTotalPaymentEqualityBulletproof,
  generateTotalPaymentEqualityProofPreferWasm,
  verifyPrivatePriceQuantityTotalBulletproof,
  verifyQuantityTotalProofPreferWasm,
  verifyTotalPaymentEqualityBulletproof,
  verifyTotalPaymentEqualityProofPreferWasm,
} from "../equalityProofClient";
import { assertScalarValue, assertU64Value, generateRandomBlinding } from "../commitmentUtils";
import {
  buildCpayBindingTag,
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

function normalizeScalarHex(value, fieldName) {
  return normalizeBytes32Output(value, fieldName);
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

async function createPaymentCommitments({
  normalizedBuyerAmount,
  chainId,
  escrowAddress,
  orderId,
  depositTxHash,
}) {
  const normalizedDepositTxHash = normalizeBytes32Output(depositTxHash, "depositTxHash");
  const cpayBindingTagHex = buildCpayBindingTag({
    chainId,
    escrowAddress,
    orderId,
    depositTxHash: normalizedDepositTxHash,
  });

  const rTotal = generateRandomBlinding();
  const rPay = generateRandomBlinding();
  const [totalCommitmentResult, paymentCommitmentResult] = await Promise.all([
    generateValueCommitmentWithBlindingPreferWasm({
      value: normalizedBuyerAmount,
      blindingHex: `0x${rTotal}`,
    }),
    generateValueCommitmentWithBindingPreferWasm({
      value: normalizedBuyerAmount,
      blindingHex: `0x${rPay}`,
      bindingTagHex: cpayBindingTagHex,
    }),
  ]);

  return {
    rTotal,
    rPay,
    cpayBindingTagHex,
    totalCommitmentResult,
    paymentCommitmentResult,
    totalCommitment: normalizeBytes32Output(totalCommitmentResult.commitment, "totalCommitment"),
    paymentCommitment: normalizeBytes32Output(
      paymentCommitmentResult.commitment,
      "paymentCommitment"
    ),
  };
}

async function generatePublicPriceSidecar({
  normalizedBuyerAmount,
  quantityValue,
  unitPriceWei,
  contextHash,
  totalCommitment,
  paymentCommitment,
  cpayBindingTagHex,
  rTotal,
  rPay,
  totalCommitmentResult,
  paymentCommitmentResult,
  depositReference,
  depositTxHash,
}) {
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
    unitPriceWei: normalizeMaybeString(unitPriceWei),
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
      bindingTag: cpayBindingTagHex,
      proofEngine: paymentEqualityProof.source || "zkp-backend",
      ...paymentEqualityProof,
    },
    proofBundle: {
      version: "1.0",
      source: "erc7984-browser-proof-sidecar",
      priceVisibility: "public",
      proofFamily: "fiat-shamir",
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
      cpayBindingTagHex,
      depositTxHash: normalizeMaybeString(depositTxHash),
      depositReference,
    },
    paymentEqualityProof,
    quantityTotalProof,
  };
}

async function generatePrivatePriceSidecar({
  normalizedBuyerAmount,
  quantityValue,
  contextHash,
  priceCommitment,
  priceWitnessWei,
  priceBlindingHex,
  totalCommitment,
  paymentCommitment,
  cpayBindingTagHex,
  rTotal,
  rPay,
  totalCommitmentResult,
  paymentCommitmentResult,
  depositReference,
  depositTxHash,
}) {
  const normalizedPriceWitness = assertScalarValue(priceWitnessWei, "privatePriceWei");
  const normalizedPriceBlinding = normalizeScalarHex(priceBlindingHex, "privatePriceBlindingHex");
  const normalizedPriceCommitment = normalizeBytes32Output(priceCommitment, "priceCommitment");

  const priceCommitmentResult = await generateScalarCommitmentWithBlindingPreferWasm({
    value: normalizedPriceWitness,
    blindingHex: normalizedPriceBlinding,
  });
  const recomputedPriceCommitment = normalizeBytes32Output(
    priceCommitmentResult.commitment,
    "recomputedPriceCommitment"
  );
  if (recomputedPriceCommitment !== normalizedPriceCommitment) {
    throw new Error("Seller-shared private price package does not match the on-chain price commitment.");
  }

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

    quantityTotalProof = await generatePrivatePriceQuantityTotalBulletproof({
      cPriceHex: normalizedPriceCommitment,
      cQuantityHex: normalizedQuantityCommitment,
      cTotalHex: totalCommitment,
      priceValue: normalizedPriceWitness,
      quantityValue,
      totalValue: normalizedBuyerAmount,
      rPriceHex: normalizedPriceBlinding,
      rQuantityHex: `0x${rQuantity}`,
      rTotalHex: `0x${rTotal}`,
      contextHashHex: contextHash,
    });
    await assertVerifiedProof(
      quantityTotalProof,
      "ERC-7984 private-price quantity-total Bulletproof"
    );
    await assertVerifiedProof(
      await verifyPrivatePriceQuantityTotalBulletproof({
        cPriceHex: normalizedPriceCommitment,
        cQuantityHex: normalizedQuantityCommitment,
        cTotalHex: totalCommitment,
        proofHex: quantityTotalProof.proof_hex,
        contextHashHex: contextHash,
      }),
      "ERC-7984 private-price quantity-total Bulletproof"
    );

    quantityCommitment = normalizedQuantityCommitment;
    quantityProof = {
      type: "quantity-total-bulletproof-private-price",
      quantity: quantityValue,
      priceCommitment: normalizedPriceCommitment,
      commitmentProof: quantityCommitmentResult.proof || null,
      commitmentProofType: quantityCommitmentResult.proof_type || "",
      commitmentEngine: quantityCommitmentResult.source || "zkp-backend",
      proofEngine: quantityTotalProof.source || "zkp-backend",
      proofHex: quantityTotalProof.proof_hex,
      proofSizeBytes: quantityTotalProof.proof_size_bytes,
      verified: Boolean(quantityTotalProof.verified),
    };
  }

  const paymentEqualityProof = await generateTotalPaymentEqualityBulletproof({
    cTotalHex: totalCommitment,
    cPayHex: paymentCommitment,
    totalValue: normalizedBuyerAmount,
    paymentValue: normalizedBuyerAmount,
    rTotalHex: `0x${rTotal}`,
    rPayHex: `0x${rPay}`,
    contextHashHex: contextHash,
  });
  await assertVerifiedProof(
    paymentEqualityProof,
    "ERC-7984 total-payment equality Bulletproof"
  );
  await assertVerifiedProof(
    await verifyTotalPaymentEqualityBulletproof({
      cTotalHex: totalCommitment,
      cPayHex: paymentCommitment,
      proofHex: paymentEqualityProof.proof_hex,
      contextHashHex: contextHash,
    }),
    "ERC-7984 total-payment equality Bulletproof"
  );

  return {
    unitPriceWei: "",
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
      type: "total-payment-equality-bulletproof",
      value: normalizedBuyerAmount,
      commitmentProof: paymentCommitmentResult.proof || null,
      commitmentProofType: paymentCommitmentResult.proof_type || "",
      commitmentEngine: paymentCommitmentResult.source || "zkp-backend",
      bindingTag: cpayBindingTagHex,
      proofEngine: paymentEqualityProof.source || "zkp-backend",
      proofHex: paymentEqualityProof.proof_hex,
      proofSizeBytes: paymentEqualityProof.proof_size_bytes,
      verified: Boolean(paymentEqualityProof.verified),
    },
    proofBundle: {
      version: "1.0",
      source: "erc7984-browser-proof-sidecar",
      priceVisibility: "private",
      proofFamily: "bulletproof",
      proofEngine: summarizeProofEngine(
        priceCommitmentResult.source,
        totalCommitmentResult.source,
        paymentCommitmentResult.source,
        quantityProof?.commitmentEngine,
        quantityTotalProof?.source,
        paymentEqualityProof.source
      ),
      contextHash,
      quantityValue: quantityValue || "",
      priceCommitment: normalizedPriceCommitment,
      totalValue: normalizedBuyerAmount,
      totalCommitment,
      paymentCommitment,
      cpayBindingTagHex,
      depositTxHash: normalizeMaybeString(depositTxHash),
      depositReference,
    },
    paymentEqualityProof,
    quantityTotalProof,
  };
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
  priceVisibility = "public",
  priceCommitment = "",
  priceWitnessWei = "",
  priceBlindingHex = "",
}) {
  const normalizedBuyerAmount = assertU64Value(buyerAmount, "buyerAmount");
  const priceAnchor =
    priceVisibility === "private"
      ? normalizeBytes32Output(priceCommitment || unitPriceHash, "priceCommitment")
      : normalizeBytes32Output(unitPriceHash, "unitPriceHash");
  const effectiveUnitPriceWei =
    priceVisibility === "private" ? normalizeMaybeString(priceWitnessWei) : normalizeMaybeString(unitPriceWei);

  const contextHash = computeCanonicalBridgeHash(
    buildErc7984ContextHashSeed({
      orderId,
      productId,
      chainId,
      escrowAddress: productAddress,
      paymentToken,
      buyerAddress,
      sellerAddress,
      unitPriceHash: priceAnchor,
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

  const { rTotal, rPay, cpayBindingTagHex, totalCommitmentResult, paymentCommitmentResult, totalCommitment, paymentCommitment } =
    await createPaymentCommitments({
      normalizedBuyerAmount,
      chainId,
      escrowAddress: productAddress,
      orderId,
      depositTxHash,
    });

  const quantityValue = deriveQuantityValue({
    buyerQuantity,
    buyerAmount: normalizedBuyerAmount,
    unitPriceWei: effectiveUnitPriceWei,
  });

  const sharedParams = {
    normalizedBuyerAmount,
    quantityValue,
    contextHash,
    totalCommitment,
    paymentCommitment,
    cpayBindingTagHex,
    rTotal,
    rPay,
    totalCommitmentResult,
    paymentCommitmentResult,
    depositReference,
    depositTxHash,
  };

  const profileSidecar =
    priceVisibility === "private"
      ? await generatePrivatePriceSidecar({
          ...sharedParams,
          priceCommitment: priceAnchor,
          priceWitnessWei: effectiveUnitPriceWei,
          priceBlindingHex,
        })
      : await generatePublicPriceSidecar({
          ...sharedParams,
          unitPriceWei: effectiveUnitPriceWei,
        });

  return {
    productId: normalizeMaybeString(productId),
    contextHash,
    ...profileSidecar,
  };
}
