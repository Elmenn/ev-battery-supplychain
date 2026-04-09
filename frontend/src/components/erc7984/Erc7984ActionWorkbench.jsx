import React, { useEffect, useMemo, useState } from "react";
import { Contract, ethers } from "ethers";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../ui/button";
import { readProductEscrowState } from "../../utils/erc7984/escrowState";
import { getOrder, getOrderByVcHash, updateOrderVc } from "../../utils/orderApi";
import {
  encryptUint64ForContract,
  getBrowserFhevmInstance,
  publicDecryptHandle,
  userDecryptUint64Handle,
} from "../../utils/erc7984/fhevmClient";
import {
  buildDepositReference,
  buildErc7984ContextHashSeed,
  computeCanonicalBridgeHash,
  PaymentBridgeVerificationStatus,
} from "../../utils/erc7984/paymentBridgeModel";
import {
  buildErc7984FlowDraftPatch,
  readErc7984FlowDraft,
  writeErc7984FlowDraft,
} from "../../utils/erc7984/flowDraft";
import { saveErc7984OrderSnapshot } from "../../utils/erc7984/orderSnapshotApi";
import { getProductMeta, saveProductMeta, updateVcCid } from "../../utils/productMetaApi";
import { computeUnitPriceHash } from "../../utils/commitmentUtils";
import { generateBuyerPaymentBridgeSidecar } from "../../utils/erc7984/paymentBridgeSidecar";
import {
  buildErc7984OrderVrcFromRecovery,
  signUploadArchiveErc7984OrderVrc,
} from "../../utils/erc7984/vrcFlow";

const ACTION_ESCROW_ABI = [
  "function confirmOrderById(bytes32 orderId, string vcCID)",
  "function createTransporter(uint256 quotedFee)",
  "function setTransporter(address transporter)",
  "function confirmDelivery(bytes32 orderId, bytes32 hash)",
  "event DeliveryConfirmed(bytes32 indexed orderId, uint256 indexed productId, address indexed transporter, bytes32 vcHash)",
  "function finalizeEqualityAttestation(bytes32 orderId, uint8 target, bytes abiEncodedCleartexts, bytes decryptionProof)",
  "function sellerTimeout()",
  "function bidTimeout()",
  "function deliveryTimeout()",
  "function withdrawBid()",
  "function getAllTransporters() view returns (address[] addrs, uint256[] fees)",
];

const FACTORY_ABI = [
  "function createProductConfidentialV1(string name, uint64 unitPrice, bytes32 unitPriceHash, address paymentToken) returns (address product)",
  "event ProductCreatedConfidential(address indexed product, address indexed seller, uint256 indexed productId, address paymentToken, uint64 unitPrice, bytes32 unitPriceHash)",
];

const MAX_UINT64 = (1n << 64n) - 1n;

const PUBLIC_ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function deposit() payable",
];

const FUNDING_WRAPPER_ABI = [
  "function publicToken() view returns (address)",
  "function confidentialToken() view returns (address)",
  "function deposit(uint256 amount) returns (uint64 mintedAmount)",
];

const CONFIDENTIAL_TOKEN_ABI = [
  "function confidentialBalanceOf(address account) view returns (bytes32)",
  "function confidentialTransferAndCall(address to, bytes32 handle, bytes inputProof, bytes data)",
];

const DEPOSIT_KIND = Object.freeze({
  BuyerPurchase: 0,
  SellerBond: 1,
  SellerDeliveryFee: 2,
  TransporterSecurityDeposit: 3,
});

const EQUALITY_TARGET = Object.freeze({
  SellerBondMatchesBuyerDeposit: 0,
  TransporterBondMatchesBuyerDeposit: 1,
});

const PHASE_LABELS = {
  0: "Listed",
  1: "Purchased",
  2: "Order Confirmed",
  3: "Bound",
  4: "Delivered",
  5: "Expired",
};

function mapPhaseToOrderStatus(phase) {
  switch (Number(phase)) {
    case 1:
      return "payment_recorded";
    case 2:
      return "order_confirmed";
    case 3:
      return "bound";
    case 4:
      return "delivered";
    case 5:
      return "expired";
    default:
      return "payment_pending_recording";
  }
}

function normalizeAddress(value) {
  const normalized = value ? String(value).trim().toLowerCase() : "";
  return normalized === ethers.ZeroAddress ? "" : normalized;
}

function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

function buildActionContract(address, signerOrProvider) {
  return new Contract(address, ACTION_ESCROW_ABI, signerOrProvider);
}

async function recoverDeliveryLinkageFromChain(contract, orderId) {
  if (!contract || !orderId || !ethers.isHexString(orderId, 32)) {
    return null;
  }

  try {
    const filter = contract.filters.DeliveryConfirmed(orderId);
    const logs = await contract.queryFilter(filter, 0, "latest");
    const latest = logs[logs.length - 1];
    if (!latest) {
      return null;
    }

    return {
      deliveryTxHash: normalizeOptionalBytes32(latest.transactionHash),
      deliveryConfirmedVcHash: normalizeOptionalBytes32(latest.args?.vcHash),
      deliveryConfirmedTransporter: normalizeOptionalAddress(latest.args?.transporter),
    };
  } catch (error) {
    console.warn("Failed to recover delivery linkage from chain", error);
    return null;
  }
}

function buildRole(currentUser, state) {
  const user = normalizeAddress(currentUser);
  if (!user || !state) {
    return "visitor";
  }
  if (normalizeAddress(state.sellerAddress) === user) {
    return "seller";
  }
  if (normalizeAddress(state.buyerAddress) === user) {
    return "buyer";
  }
  if (normalizeAddress(state.transporterAddress) === user) {
    return "transporter";
  }
  return "visitor";
}

function txSummary(label, hash) {
  return {
    label,
    hash,
    recordedAt: new Date().toISOString(),
  };
}

function parsePositiveInteger(value) {
  const raw = String(value || "").trim();
  if (!/^\d+$/.test(raw)) {
    throw new Error("Quoted fee must be a positive integer.");
  }
  const parsed = BigInt(raw);
  if (parsed <= 0n) {
    throw new Error("Quoted fee must be greater than zero.");
  }
  return parsed;
}

function generateOrderId() {
  return ethers.keccak256(
    ethers.toUtf8Bytes(`erc7984-browser-order-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  );
}

function buildProductMetaForCommitmentVrc(metadata, order, paymentToken) {
  const listing = metadata?.productMeta || {};
  return {
    ...listing,
    productId: listing.productId || order?.productId || "",
    chainId: listing.chainId || order?.chainId || "",
    unitPriceWei: metadata?.unitPriceWei || order?.unitPriceWei || "",
    unitPriceHash: metadata?.unitPriceHash || order?.unitPriceHash || "",
    listingSnapshotCid: metadata?.listingSnapshotCid || "",
    paymentToken: paymentToken || listing.paymentToken || "",
    certificateCredential: listing.certificateCredential || { name: "", cid: "" },
    componentCredentials: Array.isArray(listing.componentCredentials) ? listing.componentCredentials : [],
  };
}

function parseOptionalPositiveInteger(value, label) {
  const raw = String(value || "").trim();
  if (!raw) {
    throw new Error(`${label} is required.`);
  }
  return parsePositiveInteger(raw);
}

function tryParsePositiveInteger(value) {
  try {
    return parsePositiveInteger(value);
  } catch {
    return null;
  }
}

function tryParseDecimalBigInt(value) {
  if (value == null) {
    return null;
  }
  const raw = String(value).trim();
  if (!raw || !/^\d+$/.test(raw)) {
    return null;
  }
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

function normalizeOptionalBytes32(value) {
  if (value == null) {
    return null;
  }
  const raw = String(value).trim();
  if (!raw) {
    return null;
  }
  return /^0x[0-9a-fA-F]{64}$/.test(raw) ? raw : null;
}

function normalizeOptionalAddress(value) {
  if (value == null) {
    return null;
  }
  const raw = normalizeAddress(value);
  return raw && ethers.isAddress(raw) ? raw : null;
}

function normalizeOptionalNonEmptyString(value) {
  if (value == null) {
    return null;
  }
  const raw = String(value).trim();
  return raw ? raw : null;
}

function getBridgeCoherenceWarnings(order) {
  if (!order) {
    return [];
  }

  const quantityValue = tryParseDecimalBigInt(order.quantityProof?.quantity);
  const quantityUnitPrice = tryParseDecimalBigInt(order.quantityProof?.unitPriceWei);
  const orderUnitPrice = tryParseDecimalBigInt(order.unitPriceWei);
  const resolvedUnitPrice = orderUnitPrice ?? quantityUnitPrice;
  const totalValue = tryParseDecimalBigInt(order.totalProof?.value);
  const paymentValue = tryParseDecimalBigInt(order.paymentProof?.value);
  const warnings = [];

  if (
    quantityValue != null &&
    resolvedUnitPrice != null &&
    totalValue != null &&
    quantityValue * resolvedUnitPrice !== totalValue
  ) {
    warnings.push("Ignoring backend bridge row because quantity * unit price does not equal total proof value.");
  }

  if (totalValue != null && paymentValue != null && totalValue !== paymentValue) {
    warnings.push("Ignoring backend bridge row because total proof value does not equal payment proof value.");
  }

  return warnings;
}

function sanitizeOrderForTrustBoundaries(order, escrowState) {
  if (!order) {
    return { order: null, warnings: [] };
  }

  const warnings = [];
  const sanitizedOrder = { ...order };
  const chainVcHash = escrowState?.vcHash || "";
  const hasNonZeroChainVcHash = Boolean(chainVcHash && chainVcHash !== ethers.ZeroHash);

  if (hasNonZeroChainVcHash) {
    if (
      sanitizedOrder.orderVcCid &&
      ethers.keccak256(ethers.toUtf8Bytes(String(sanitizedOrder.orderVcCid))) !== chainVcHash
    ) {
      warnings.push("Ignoring backend order VC CID because it does not match the on-chain vcHash.");
      sanitizedOrder.orderVcCid = "";
    }
    if (sanitizedOrder.orderVcHash && sanitizedOrder.orderVcHash !== chainVcHash) {
      warnings.push("Ignoring backend order VC hash because it does not match the on-chain vcHash.");
    }
    sanitizedOrder.orderVcHash = chainVcHash;
  }

  const bridgeWarnings = getBridgeCoherenceWarnings(sanitizedOrder);
  if (bridgeWarnings.length > 0) {
    warnings.push(...bridgeWarnings);
    sanitizedOrder.quantityCommitment = null;
    sanitizedOrder.quantityProof = null;
    sanitizedOrder.totalCommitment = null;
    sanitizedOrder.totalProof = null;
    sanitizedOrder.paymentCommitment = null;
    sanitizedOrder.paymentProof = null;
  }

  return { order: sanitizedOrder, warnings };
}

export default function Erc7984ActionWorkbench({ provider, currentUser }) {
  const navigate = useNavigate();
  const [factoryAddressInput, setFactoryAddressInput] = useState(
    process.env.REACT_APP_FACTORY_ADDRESS || ""
  );
  const [createProductNameInput, setCreateProductNameInput] = useState("Browser ERC-7984 Product");
  const [createUnitPriceWeiInput, setCreateUnitPriceWeiInput] = useState("100");
  const [createPaymentTokenInput, setCreatePaymentTokenInput] = useState("");
  const [fundingWrapperAddressInput, setFundingWrapperAddressInput] = useState("");
  const [publicTokenAddressInput, setPublicTokenAddressInput] = useState("");
  const [tokenToolsAddressInput, setTokenToolsAddressInput] = useState("");
  const [fundAmountInput, setFundAmountInput] = useState("100");
  const [productAddressInput, setProductAddressInput] = useState("");
  const [orderIdInput, setOrderIdInput] = useState("");
  const [quotedFeeInput, setQuotedFeeInput] = useState("15");
  const [buyerAmountInput, setBuyerAmountInput] = useState("100");
  const [buyerQuantityInput, setBuyerQuantityInput] = useState("1");
  const [sellerBondAmountInput, setSellerBondAmountInput] = useState("100");
  const [sellerFeeAmountInput, setSellerFeeAmountInput] = useState("15");
  const [transporterBondAmountInput, setTransporterBondAmountInput] = useState("100");
  const [selectedTransporterInput, setSelectedTransporterInput] = useState("");
  const [escrowState, setEscrowState] = useState(null);
  const [activeOrderRow, setActiveOrderRow] = useState(null);
  const [productMetaRow, setProductMetaRow] = useState(null);
  const [bidRows, setBidRows] = useState([]);
  const [lastTx, setLastTx] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const [fhevmStatus, setFhevmStatus] = useState("idle");
  const [confidentialBalance, setConfidentialBalance] = useState(null);
  const [publicBalance, setPublicBalance] = useState(null);
  const [publicAllowance, setPublicAllowance] = useState(null);
  const [latestPrepConfig, setLatestPrepConfig] = useState(null);
  const [trustWarnings, setTrustWarnings] = useState([]);

  const resolvedProductAddress = normalizeAddress(productAddressInput);
  const resolvedFundingWrapperAddress = normalizeAddress(fundingWrapperAddressInput);
  const resolvedPublicTokenAddress = normalizeAddress(publicTokenAddressInput);
  const resolvedTokenToolsAddress = normalizeAddress(
    tokenToolsAddressInput || escrowState?.paymentToken || createPaymentTokenInput
  );
  const connectedUserAddress = normalizeAddress(currentUser);
  const role = useMemo(() => buildRole(currentUser, escrowState), [currentUser, escrowState]);
  const activeOrderId = escrowState?.activeOrderId || ethers.ZeroHash;
  const workingOrderId = activeOrderId !== ethers.ZeroHash ? activeOrderId : String(orderIdInput || "").trim();
  const currentOrderRow = useMemo(() => {
    if (!activeOrderRow || !workingOrderId || !ethers.isHexString(workingOrderId, 32)) {
      return null;
    }
    const matchingOrder =
      String(activeOrderRow.orderId || "").trim().toLowerCase() === workingOrderId.toLowerCase()
        ? activeOrderRow
        : null;
    return sanitizeOrderForTrustBoundaries(matchingOrder, escrowState).order;
  }, [activeOrderRow, workingOrderId, escrowState]);
  const currentOrderTrustWarnings = useMemo(() => {
    if (!activeOrderRow || !workingOrderId || !ethers.isHexString(workingOrderId, 32)) {
      return [];
    }
    const matchingOrder =
      String(activeOrderRow.orderId || "").trim().toLowerCase() === workingOrderId.toLowerCase()
        ? activeOrderRow
        : null;
    return sanitizeOrderForTrustBoundaries(matchingOrder, escrowState).warnings;
  }, [activeOrderRow, workingOrderId, escrowState]);
  const vcHash = escrowState?.vcHash || ethers.ZeroHash;
  const hasValidWorkingOrderId = ethers.isHexString(workingOrderId, 32);
  const derivedCreateUnitPriceHash = useMemo(() => {
    try {
      return createUnitPriceWeiInput ? computeUnitPriceHash(createUnitPriceWeiInput) : "";
    } catch {
      return "";
    }
  }, [createUnitPriceWeiInput]);
  const buyerAmountValue = useMemo(() => tryParsePositiveInteger(buyerAmountInput), [buyerAmountInput]);
  const buyerQuantityValue = useMemo(
    () => tryParsePositiveInteger(buyerQuantityInput),
    [buyerQuantityInput]
  );
  const resolvedUnitPriceWei = useMemo(
    () =>
        String(
          productMetaRow?.unitPriceWei ||
          productMetaRow?.productMeta?.unitPriceWei ||
          currentOrderRow?.unitPriceWei ||
          ""
        ).trim(),
    [productMetaRow, currentOrderRow]
  );
  const hasResolvedUnitPriceWei = Boolean(resolvedUnitPriceWei);
  const buyerDepositAmountValue = useMemo(() => {
    if (hasResolvedUnitPriceWei && buyerQuantityValue) {
      try {
        return BigInt(resolvedUnitPriceWei) * buyerQuantityValue;
      } catch {
        return null;
      }
    }
    return buyerAmountValue;
  }, [hasResolvedUnitPriceWei, resolvedUnitPriceWei, buyerQuantityValue, buyerAmountValue]);
  const buyerDepositAmountDisplay = buyerDepositAmountValue ? buyerDepositAmountValue.toString() : "";
  const requiredBondAmountValue = useMemo(() => {
    const candidates = [
      currentOrderRow?.quantityProof?.unitPriceWei && currentOrderRow?.quantityProof?.quantity
        ? (
            BigInt(currentOrderRow.quantityProof.unitPriceWei) *
            BigInt(currentOrderRow.quantityProof.quantity)
          ).toString()
        : null,
      currentOrderRow?.paymentProof?.value,
      currentOrderRow?.totalProof?.value,
      escrowState?.hasBuyerPurchaseDeposit ? null : buyerDepositAmountDisplay || null,
    ];

    for (const candidate of candidates) {
      if (candidate == null || String(candidate).trim() === "") {
        continue;
      }
      try {
        return BigInt(String(candidate).trim());
      } catch {
        // keep scanning candidates
      }
    }

    return null;
  }, [currentOrderRow, buyerDepositAmountDisplay, escrowState]);
  const requiredBondAmountDisplay = requiredBondAmountValue ? requiredBondAmountValue.toString() : "";
  const sellerBondAmountValue = useMemo(
    () => tryParsePositiveInteger(sellerBondAmountInput),
    [sellerBondAmountInput]
  );
  const sellerFeeAmountValue = useMemo(
    () => tryParsePositiveInteger(sellerFeeAmountInput),
    [sellerFeeAmountInput]
  );
  const transporterBondAmountValue = useMemo(
    () => tryParsePositiveInteger(transporterBondAmountInput),
    [transporterBondAmountInput]
  );
  const confidentialBalanceValue = useMemo(() => {
    if (confidentialBalance == null || String(confidentialBalance).trim() === "") {
      return null;
    }
    try {
      return BigInt(confidentialBalance);
    } catch {
      return null;
    }
  }, [confidentialBalance]);
  const hasSufficientConfidentialBalance = (requiredAmount) =>
    confidentialBalanceValue == null || requiredAmount == null || confidentialBalanceValue >= requiredAmount;
  const publicTokenLabel = latestPrepConfig?.publicTokenSymbol || "ERC20";
  const publicTokenIsWrappedNative = Boolean(latestPrepConfig?.publicTokenIsWrappedNative);
  const canCreateProduct =
    Boolean(provider) &&
    String(createProductNameInput || "").trim() !== "" &&
    ethers.isAddress(String(factoryAddressInput || "").trim()) &&
    ethers.isAddress(String(createPaymentTokenInput || "").trim()) &&
    Boolean(derivedCreateUnitPriceHash);
  const canInspectConfidentialBalance =
    Boolean(provider) && Boolean(connectedUserAddress) && ethers.isAddress(resolvedTokenToolsAddress);
  const canFundConfidentialBalance =
    Boolean(provider) &&
    Boolean(connectedUserAddress) &&
    ethers.isAddress(resolvedPublicTokenAddress) &&
    ethers.isAddress(resolvedFundingWrapperAddress) &&
    String(fundAmountInput || "").trim() !== "";
  const canWrapPublicToken =
    Boolean(provider) &&
    Boolean(connectedUserAddress) &&
    publicTokenIsWrappedNative &&
    ethers.isAddress(resolvedPublicTokenAddress) &&
    String(fundAmountInput || "").trim() !== "";

  useEffect(() => {
    let cancelled = false;

    async function loadLatestPrepConfig() {
      try {
        const response = await fetch("/erc7984-sepolia-latest.json", { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        if (cancelled || Number(payload?.chainId) !== 11155111) {
          return;
        }

        setLatestPrepConfig(payload);
        setFundingWrapperAddressInput((previous) => previous || payload.fundingWrapper || "");
        setPublicTokenAddressInput((previous) => previous || payload.publicToken || "");
        setTokenToolsAddressInput((previous) => previous || payload.confidentialToken || "");
        setFactoryAddressInput((previous) => previous || payload.factory || "");
        setCreatePaymentTokenInput((previous) => previous || payload.confidentialToken || "");
        setProductAddressInput((previous) => previous || payload.productEscrow || "");
        setOrderIdInput((previous) => previous || payload.suggestedOrderId || "");
      } catch {
        // Latest prep config is a convenience path only.
      }
    }

    loadLatestPrepConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search || "");
    const nextProductAddress = params.get("product");
    const nextOrderId = params.get("orderId");

    if (nextProductAddress) {
      setProductAddressInput(nextProductAddress);
    }
    if (nextOrderId) {
      setOrderIdInput(nextOrderId);
    }
  }, []);

  useEffect(() => {
    setPublicBalance(null);
    setConfidentialBalance(null);
    setPublicAllowance(null);
  }, [currentUser]);

  useEffect(() => {
    setTrustWarnings(currentOrderTrustWarnings);
  }, [currentOrderTrustWarnings]);

  async function persistSnapshotForState(state, overrides = {}) {
    if (!provider || !state) {
      return null;
    }

    const snapshotOrderId =
      overrides.orderId ||
      (state.activeOrderId && state.activeOrderId !== ethers.ZeroHash ? state.activeOrderId : "");
    if (!ethers.isHexString(snapshotOrderId, 32)) {
      return null;
    }

    const network = await provider.getNetwork();
    const draft = readErc7984FlowDraft() || {};
    const resolvedProductId =
      overrides.productId ??
      currentOrderRow?.productId ??
      "";
    const shouldPersistOrderVcCid = Boolean(state.vcHash && state.vcHash !== ethers.ZeroHash);
    const nextOrderVcCid = shouldPersistOrderVcCid
      ? normalizeOptionalNonEmptyString(
          overrides.vcCid ??
            draft.vcCid ??
            currentOrderRow?.orderVcCid ??
            productMetaRow?.vcCid ??
            lastTx?.cid ??
            null
        )
      : null;
    const nextBuyerDepositTxHash = normalizeOptionalBytes32(
      overrides.buyerDepositTxHash ?? draft.buyerDepositTxHash ?? currentOrderRow?.buyerDepositTxHash ?? null
    );
    const nextBuyerDepositReference = normalizeOptionalBytes32(
      overrides.buyerDepositReference ??
        draft.buyerDepositReference ??
        currentOrderRow?.buyerDepositReference ??
        null
    );
    const contextHash =
      overrides.contextHash ||
      computeCanonicalBridgeHash(
        buildErc7984ContextHashSeed({
          orderId: snapshotOrderId,
          productId: resolvedProductId,
          chainId: String(network.chainId),
          escrowAddress: resolvedProductAddress,
          paymentToken: state.paymentToken || "",
          buyerAddress: state.buyerAddress || "",
          sellerAddress: state.sellerAddress || "",
          unitPriceHash: state.unitPriceHash || "",
          transporterAddress: state.transporterAddress || "",
        })
      );

    return saveErc7984OrderSnapshot({
      orderId: snapshotOrderId,
      productAddress: resolvedProductAddress,
      escrowAddress: resolvedProductAddress,
      productId: resolvedProductId,
      chainId: String(network.chainId),
      sellerAddress: state.sellerAddress || "",
      buyerAddress: state.buyerAddress || null,
      transporterAddress: state.transporterAddress || null,
      status: mapPhaseToOrderStatus(state.phase),
      phase: Number(state.phase),
      delivered: Boolean(state.delivered),
      unitPriceWei:
        overrides.unitPriceWei ??
        currentOrderRow?.unitPriceWei ??
        productMetaRow?.unitPriceWei ??
        productMetaRow?.productMeta?.unitPriceWei ??
        "",
      unitPriceHash: state.unitPriceHash || "",
      paymentToken: state.paymentToken || null,
      contextHash,
      buyerDepositTxHash: nextBuyerDepositTxHash,
      buyerDepositReference: nextBuyerDepositReference,
      sellerBondAttestation: state.sellerBondAttestation || null,
      transporterBondAttestation: state.transporterBondAttestation || null,
      quantityCommitment: overrides.quantityCommitment ?? currentOrderRow?.quantityCommitment ?? null,
      quantityProof: overrides.quantityProof ?? currentOrderRow?.quantityProof ?? null,
      totalCommitment: overrides.totalCommitment ?? currentOrderRow?.totalCommitment ?? null,
      totalProof: overrides.totalProof ?? currentOrderRow?.totalProof ?? null,
      paymentCommitment: overrides.paymentCommitment ?? currentOrderRow?.paymentCommitment ?? null,
      paymentProof: overrides.paymentProof ?? currentOrderRow?.paymentProof ?? null,
      ...(nextOrderVcCid != null ? { orderVcCid: nextOrderVcCid } : {}),
      orderVcHash:
        state.vcHash && state.vcHash !== ethers.ZeroHash
          ? state.vcHash
          : currentOrderRow?.orderVcHash ?? null,
      deliveryTxHash: normalizeOptionalBytes32(
        overrides.deliveryTxHash ?? currentOrderRow?.deliveryTxHash ?? null
      ),
      deliveryConfirmedVcHash: normalizeOptionalBytes32(
        overrides.deliveryConfirmedVcHash ?? currentOrderRow?.deliveryConfirmedVcHash ?? null
      ),
      deliveryConfirmedTransporter: normalizeOptionalAddress(
        overrides.deliveryConfirmedTransporter ?? currentOrderRow?.deliveryConfirmedTransporter ?? null
      ),
    })
      .then((result) => result?.order ?? null)
      .catch((snapshotError) => {
      console.warn("Failed to persist ERC-7984 order snapshot", snapshotError);
      return null;
      });
  }

  async function refreshFundingToolsState({
    wrapperAddress = resolvedFundingWrapperAddress,
    publicTokenAddress = resolvedPublicTokenAddress,
    confidentialTokenAddress = resolvedTokenToolsAddress,
  } = {}) {
    if (!provider || !currentUser) {
      setPublicBalance(null);
      setConfidentialBalance(null);
      setPublicAllowance(null);
      return null;
    }

    let nextWrapperAddress = wrapperAddress;
    let nextPublicTokenAddress = publicTokenAddress;
    let nextConfidentialTokenAddress = confidentialTokenAddress;
    let nextPublicBalance = null;
    let nextPublicAllowance = null;
    let nextConfidentialBalance = null;

    if (ethers.isAddress(nextWrapperAddress)) {
      const wrapper = new Contract(nextWrapperAddress, FUNDING_WRAPPER_ABI, provider);
      const [wrapperPublicToken, wrapperConfidentialToken] = await Promise.all([
        wrapper.publicToken(),
        wrapper.confidentialToken(),
      ]);
      nextPublicTokenAddress = normalizeAddress(wrapperPublicToken);
      nextConfidentialTokenAddress = normalizeAddress(wrapperConfidentialToken);
      setPublicTokenAddressInput(nextPublicTokenAddress);
      setTokenToolsAddressInput(nextConfidentialTokenAddress);
    }

    if (ethers.isAddress(nextPublicTokenAddress)) {
      const publicToken = new Contract(nextPublicTokenAddress, PUBLIC_ERC20_ABI, provider);
      const [balance, allowance] = await Promise.all([
        publicToken.balanceOf(currentUser),
        ethers.isAddress(nextWrapperAddress)
          ? publicToken.allowance(currentUser, nextWrapperAddress)
          : Promise.resolve(0n),
      ]);
      nextPublicBalance = balance.toString();
      nextPublicAllowance = allowance.toString();
      setPublicBalance(nextPublicBalance);
      setPublicAllowance(nextPublicAllowance);
    } else {
      setPublicBalance(null);
      setPublicAllowance(null);
    }

    if (ethers.isAddress(nextConfidentialTokenAddress)) {
      const signer = await provider.getSigner();
      const token = new Contract(nextConfidentialTokenAddress, CONFIDENTIAL_TOKEN_ABI, provider);
      const balanceHandle = await token.confidentialBalanceOf(currentUser);

      if (!balanceHandle || !ethers.isHexString(balanceHandle, 32) || balanceHandle === ethers.ZeroHash) {
        nextConfidentialBalance = "0";
        setConfidentialBalance("0");
      } else {
        const decryptedBalance = await userDecryptUint64Handle({
          provider,
          signer,
          contractAddress: nextConfidentialTokenAddress,
          handle: balanceHandle,
        });
        nextConfidentialBalance = decryptedBalance.toString();
        setConfidentialBalance(nextConfidentialBalance);
      }
    } else {
      setConfidentialBalance(null);
    }

    return {
      wrapperAddress: nextWrapperAddress || null,
      publicTokenAddress: nextPublicTokenAddress || null,
      confidentialTokenAddress: nextConfidentialTokenAddress || null,
      publicBalance: nextPublicBalance,
      confidentialBalance: nextConfidentialBalance,
      publicAllowance: nextPublicAllowance,
    };
  }

  async function readConnectedConfidentialBalance(confidentialTokenAddress, signer) {
    if (!provider || !currentUser || !ethers.isAddress(confidentialTokenAddress)) {
      return null;
    }

    const resolvedSigner = signer || (await provider.getSigner());
    const token = new Contract(confidentialTokenAddress, CONFIDENTIAL_TOKEN_ABI, provider);
    const balanceHandle = await token.confidentialBalanceOf(currentUser);

    if (!balanceHandle || !ethers.isHexString(balanceHandle, 32) || balanceHandle === ethers.ZeroHash) {
      return 0n;
    }

    const decryptedBalance = await userDecryptUint64Handle({
      provider,
      signer: resolvedSigner,
      contractAddress: confidentialTokenAddress,
      handle: balanceHandle,
    });
    return BigInt(decryptedBalance.toString());
  }

  async function loadEscrowBundle(options = {}) {
    setIsLoading(true);
    setError("");

    try {
      if (!provider) {
        throw new Error("Wallet provider is required.");
      }
      const targetProductAddress = normalizeAddress(options.productAddress || resolvedProductAddress);
      if (!targetProductAddress) {
        throw new Error("Product escrow address is required.");
      }

      const state = await readProductEscrowState(provider, targetProductAddress);
      const readContract = buildActionContract(targetProductAddress, provider);
      const [[addrs, fees], nextProductMetaRow] = await Promise.all([
        readContract.getAllTransporters(),
        getProductMeta(targetProductAddress),
      ]);
      const bids = addrs.map((address, index) => ({
        address: normalizeAddress(address),
        fee: fees[index]?.toString?.() || String(fees[index]),
      }));

      let orderRow = null;
      if (state.activeOrderId && state.activeOrderId !== ethers.ZeroHash) {
        let recoveredDeliveryLinkage = null;
        if (Number(state.phase) === 4 && state.delivered) {
          recoveredDeliveryLinkage = await recoverDeliveryLinkageFromChain(
            readContract,
            state.activeOrderId
          );
        }
        orderRow =
          (await persistSnapshotForState(state, {
            ...(options.snapshotOverrides || {}),
            ...(recoveredDeliveryLinkage || {}),
          })) ||
          (await getOrder(state.activeOrderId));
      }

      if (orderRow && !orderRow.orderVcCid && nextProductMetaRow?.vcCid) {
        orderRow = {
          ...orderRow,
          orderVcCid: nextProductMetaRow.vcCid,
        };
      }
      if (
        orderRow &&
        !orderRow.unitPriceWei &&
        (nextProductMetaRow?.unitPriceWei || nextProductMetaRow?.productMeta?.unitPriceWei)
      ) {
        orderRow = {
          ...orderRow,
          unitPriceWei:
            nextProductMetaRow?.unitPriceWei ||
            nextProductMetaRow?.productMeta?.unitPriceWei ||
            "",
        };
      }
      if (
        orderRow &&
        !orderRow.orderVcCid &&
        state.vcHash &&
        state.vcHash !== ethers.ZeroHash
      ) {
        const fallbackByHash = await getOrderByVcHash(state.vcHash);
        if (fallbackByHash?.orderVcCid) {
          orderRow = {
            ...orderRow,
            orderVcCid: fallbackByHash.orderVcCid,
          };
        }
      }
      const sanitizedOrderResult = sanitizeOrderForTrustBoundaries(orderRow, state);

      setEscrowState(state);
      setBidRows(bids);
      setProductMetaRow(nextProductMetaRow);
      setActiveOrderRow(sanitizedOrderResult.order);
      setTrustWarnings(sanitizedOrderResult.warnings);
      setSelectedTransporterInput((previous) => previous || normalizeAddress(state.transporterAddress) || "");
      setOrderIdInput((previous) => previous || (state.activeOrderId !== ethers.ZeroHash ? state.activeOrderId : ""));
      setProductAddressInput(targetProductAddress);
      setTokenToolsAddressInput((previous) => previous || normalizeAddress(state.paymentToken) || "");
    } catch (loadError) {
      setError(loadError.message || "Failed to load ERC-7984 escrow state.");
    } finally {
      setIsLoading(false);
    }
  }

  async function runAction(label, callback) {
    setPendingAction(label);
    setError("");

    try {
      const actionResult = await callback();
      const tx = actionResult?.tx || actionResult;
      let snapshotOverrides = actionResult?.snapshotOverrides || {};
      const receipt = await tx.wait();
      let lastTxData =
        actionResult?.lastTxData && typeof actionResult.lastTxData === "object"
          ? actionResult.lastTxData
          : {};
      if (typeof actionResult?.postReceipt === "function") {
        const postReceiptResult = await actionResult.postReceipt(receipt);
        if (postReceiptResult?.snapshotOverrides && typeof postReceiptResult.snapshotOverrides === "object") {
          snapshotOverrides = {
            ...snapshotOverrides,
            ...postReceiptResult.snapshotOverrides,
          };
        }
        if (postReceiptResult?.lastTxData && typeof postReceiptResult.lastTxData === "object") {
          lastTxData = {
            ...lastTxData,
            ...postReceiptResult.lastTxData,
          };
        }
      }
      setLastTx({
        ...txSummary(label, receipt.hash),
        ...lastTxData,
      });
      await loadEscrowBundle({ snapshotOverrides });
    } catch (actionError) {
      setError(actionError.message || `${label} failed.`);
    } finally {
      setPendingAction("");
    }
  }

  async function withSignerAction(label, callback) {
    if (!provider) {
      throw new Error("Wallet provider is required.");
    }
    if (!resolvedProductAddress) {
      throw new Error("Product escrow address is required.");
    }
    const signer = await provider.getSigner();
    const contract = buildActionContract(resolvedProductAddress, signer);
    return runAction(label, () => callback(contract, signer));
  }

  async function withConfidentialDeposit(label, kind, amountValue) {
    return withSignerAction(label, async (_escrowContract, signer) => {
      if (!escrowState?.paymentToken) {
        throw new Error("Payment token is missing from escrow state.");
      }
      if (!ethers.isHexString(workingOrderId, 32)) {
        throw new Error("A valid bytes32 order id is required for confidential funding.");
      }

      const senderAddress = normalizeAddress(await signer.getAddress());
      const depositAmount = parseOptionalPositiveInteger(amountValue, label);
      const availableBalance = await readConnectedConfidentialBalance(escrowState.paymentToken, signer);
      if (availableBalance != null) {
        setConfidentialBalance(availableBalance.toString());
        if (availableBalance < depositAmount) {
          throw new Error(
            `Insufficient confidential balance. Required ${depositAmount.toString()}, available ${availableBalance.toString()}. Fund private balance first.`
          );
        }
      }
      setFhevmStatus("initializing");
      await getBrowserFhevmInstance(provider);
      setFhevmStatus("ready");

      const { handle, inputProof } = await encryptUint64ForContract({
        provider,
        contractAddress: escrowState.paymentToken,
        userAddress: senderAddress,
        value: depositAmount,
      });

      const payload = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "uint8"],
        [workingOrderId, kind]
      );
      const token = new Contract(escrowState.paymentToken, CONFIDENTIAL_TOKEN_ABI, signer);
      const tx = await token["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
        resolvedProductAddress,
        handle,
        inputProof,
        payload
      );
      const draftPatch = buildErc7984FlowDraftPatch({
        orderId: workingOrderId,
        productAddress: resolvedProductAddress,
        paymentToken: escrowState.paymentToken,
        buyerQuantity:
          kind === DEPOSIT_KIND.BuyerPurchase && hasResolvedUnitPriceWei ? buyerQuantityInput : undefined,
        buyerDepositTxHash:
          kind === DEPOSIT_KIND.BuyerPurchase ? tx.hash : undefined,
        buyerDepositReference:
          kind === DEPOSIT_KIND.BuyerPurchase
            ? buildDepositReference({
                depositTxHash: tx.hash,
                orderId: workingOrderId,
                depositKind: "BuyerPurchase",
                paymentToken: escrowState.paymentToken,
                escrowAddress: resolvedProductAddress,
                buyerAddress: escrowState.buyerAddress || senderAddress,
              })
            : undefined,
      });
      writeErc7984FlowDraft(draftPatch);
      let snapshotOverrides =
        kind === DEPOSIT_KIND.BuyerPurchase
          ? {
              buyerDepositTxHash: tx.hash,
              buyerDepositReference: buildDepositReference({
                depositTxHash: tx.hash,
                orderId: workingOrderId,
                depositKind: "BuyerPurchase",
                paymentToken: escrowState.paymentToken,
                escrowAddress: resolvedProductAddress,
                buyerAddress: escrowState.buyerAddress || senderAddress,
              }),
            }
          : {};

      if (kind === DEPOSIT_KIND.BuyerPurchase) {
        try {
          const [productMetaRow, network] = await Promise.all([
            getProductMeta(resolvedProductAddress),
            provider.getNetwork(),
          ]);
          const bridgeSidecar = await generateBuyerPaymentBridgeSidecar({
            chainId: String(network.chainId),
            orderId: workingOrderId,
            productId: productMetaRow?.productMeta?.productId || currentOrderRow?.productId || "",
            productAddress: resolvedProductAddress,
            paymentToken: escrowState.paymentToken,
            buyerAddress: escrowState.buyerAddress || senderAddress,
            sellerAddress: escrowState.sellerAddress || "",
            transporterAddress: escrowState.transporterAddress || "",
            unitPriceWei: productMetaRow?.unitPriceWei || productMetaRow?.productMeta?.unitPriceWei || "",
            unitPriceHash:
              productMetaRow?.unitPriceHash ||
              productMetaRow?.productMeta?.unitPriceHash ||
              escrowState.unitPriceHash ||
              "",
            buyerAmount: depositAmount,
            buyerQuantity: hasResolvedUnitPriceWei ? buyerQuantityInput : "",
            depositTxHash: tx.hash,
          });

          snapshotOverrides = {
            ...snapshotOverrides,
            ...bridgeSidecar,
          };
        } catch (bridgeError) {
          console.warn("Failed to generate ERC-7984 payment-bridge sidecar", bridgeError);
        }
      }

      return {
        tx,
        snapshotOverrides,
      };
    });
  }

  async function withEqualityFinalize(label, target, handle) {
    return withSignerAction(label, async (escrowContract) => {
      if (!ethers.isHexString(workingOrderId, 32)) {
        throw new Error("A valid bytes32 order id is required for equality attestation finalization.");
      }
      if (!handle || !ethers.isHexString(handle, 32)) {
        throw new Error("Equality handle is missing.");
      }

      setFhevmStatus("initializing");
      const decrypted = await publicDecryptHandle({ provider, handle });
      setFhevmStatus("ready");

      return escrowContract.finalizeEqualityAttestation(
        workingOrderId,
        target,
        decrypted.abiEncodedClearValues,
        decrypted.decryptionProof
      );
    });
  }

  async function handleConfirmOrderWithCommitmentVrc() {
    return withSignerAction("confirm-order", async (contract, signer) => {
      if (!currentOrderRow) {
        throw new Error("A recovered order row is required before confirming the order.");
      }
      if (!productMetaRow) {
        throw new Error("Product metadata is required before building the commitment VRC.");
      }
      if (!escrowState?.buyerAddress || !escrowState?.sellerAddress) {
        throw new Error("Buyer and seller addresses must be present in escrow state.");
      }
      if (escrowState?.sellerBondAttestation?.status !== "verified_true") {
        throw new Error("Seller equality must be verified before creating the commitment VRC.");
      }

      const signerAddress = normalizeAddress(await signer.getAddress());
      if (!signerAddress || signerAddress !== normalizeAddress(escrowState.sellerAddress)) {
        throw new Error("Switch MetaMask to the seller wallet before confirming the order.");
      }

      const productMeta = buildProductMetaForCommitmentVrc(
        productMetaRow,
        currentOrderRow,
        escrowState.paymentToken || createPaymentTokenInput || ""
      );
      const commitmentVrc = buildErc7984OrderVrcFromRecovery({
        sellerAddress: normalizeAddress(escrowState.sellerAddress),
        buyerAddress: normalizeAddress(escrowState.buyerAddress),
        transporterAddress: null,
        productAddress: resolvedProductAddress,
        productMeta,
        order: currentOrderRow,
        attestation: null,
        paymentToken: escrowState.paymentToken || createPaymentTokenInput || "",
        buyerDepositTxHash: currentOrderRow.buyerDepositTxHash || null,
        buyerDepositReference: currentOrderRow.buyerDepositReference || null,
        sellerBondAttestation: escrowState.sellerBondAttestation || null,
        transporterBondAttestation: null,
        paymentBridgeStatus:
          currentOrderRow.paymentProof || currentOrderRow.totalProof || currentOrderRow.quantityProof
            ? PaymentBridgeVerificationStatus.Bound
            : PaymentBridgeVerificationStatus.Pending,
      });

      const archiveResult = await signUploadArchiveErc7984OrderVrc({
        vrc: commitmentVrc,
        signer,
        contractAddress: currentOrderRow.escrowAddress || resolvedProductAddress,
        archiveSource: "frontend-commitment-upload",
      });
      const cid = archiveResult.cid;
      if (!cid) {
        throw new Error("Commitment VRC upload did not return a CID.");
      }

      const tx = await contract.confirmOrderById(workingOrderId, cid);
      const vcHash = ethers.keccak256(ethers.toUtf8Bytes(cid));

      writeErc7984FlowDraft(
        buildErc7984FlowDraftPatch({
          orderId: workingOrderId,
          productAddress: resolvedProductAddress,
          paymentToken: escrowState?.paymentToken,
          vcCid: cid,
        })
      );

      return {
        tx,
        snapshotOverrides: {
          vcCid: cid,
          orderVcHash: vcHash,
        },
        lastTxData: {
          cid,
          vcHash,
          archiveSource: "frontend-commitment-upload",
        },
        postReceipt: async () => {
          await Promise.allSettled([
            updateOrderVc(workingOrderId, cid, vcHash),
            resolvedProductAddress ? updateVcCid(resolvedProductAddress, cid) : Promise.resolve(),
          ]);
        },
      };
    });
  }

  async function handleConfirmDeliveryWithLinkage() {
    return withSignerAction("confirm-delivery", async (contract, signer) => {
      if (!hasValidWorkingOrderId) {
        throw new Error("A valid bytes32 order id is required before confirming delivery.");
      }
      if (vcHash === ethers.ZeroHash) {
        throw new Error("The order must have a bound vcHash before delivery confirmation.");
      }

      const signerAddress = normalizeAddress(await signer.getAddress());
      if (!signerAddress || signerAddress !== normalizeAddress(escrowState?.transporterAddress)) {
        throw new Error("Switch MetaMask to the selected transporter wallet before confirming delivery.");
      }

      const tx = await contract.confirmDelivery(workingOrderId, vcHash);
      return {
        tx,
        lastTxData: {
          orderId: workingOrderId,
          orderVcCid: boundCommitmentCid || null,
          orderVcHash: vcHash,
        },
        postReceipt: async (receipt) => {
          let emittedTransporter = normalizeOptionalAddress(escrowState?.transporterAddress);
          let emittedVcHash = vcHash;

          for (const log of receipt.logs || []) {
            try {
              const parsedLog = contract.interface.parseLog(log);
              if (parsedLog?.name !== "DeliveryConfirmed") {
                continue;
              }
              emittedTransporter = normalizeOptionalAddress(parsedLog.args?.transporter) || emittedTransporter;
              emittedVcHash = normalizeOptionalBytes32(parsedLog.args?.vcHash) || emittedVcHash;
              break;
            } catch {
              // Ignore unrelated logs.
            }
          }

          return {
            snapshotOverrides: {
              deliveryTxHash: receipt.hash,
              deliveryConfirmedVcHash: emittedVcHash,
              deliveryConfirmedTransporter: emittedTransporter,
            },
            lastTxData: {
              deliveryTxHash: receipt.hash,
              deliveryConfirmedVcHash: emittedVcHash,
              deliveryConfirmedTransporter: emittedTransporter,
            },
          };
        },
      };
    });
  }

  async function handleCreateProduct() {
    setPendingAction("create-product");
    setError("");

    try {
      if (!provider) {
        throw new Error("Wallet provider is required.");
      }

      const signer = await provider.getSigner();
      const sellerAddress = normalizeAddress(await signer.getAddress());
      const factoryAddress = ethers.getAddress(String(factoryAddressInput || "").trim());
      const paymentToken = ethers.getAddress(String(createPaymentTokenInput || "").trim());
      const productName = String(createProductNameInput || "").trim();
      const unitPriceWei = parsePositiveInteger(createUnitPriceWeiInput).toString();
      const unitPriceValue = BigInt(unitPriceWei);
      const unitPriceHash = computeUnitPriceHash(unitPriceWei);
      if (unitPriceValue > MAX_UINT64) {
        throw new Error("Unit price must fit in uint64.");
      }

      const factory = new Contract(factoryAddress, FACTORY_ABI, signer);
      const tx = await factory.createProductConfidentialV1(
        productName,
        unitPriceValue,
        unitPriceHash,
        paymentToken
      );
      const receipt = await tx.wait();

      const createdEvent = receipt.logs
        .map((log) => {
          try {
            return factory.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((log) => log && log.name === "ProductCreatedConfidential");

      if (!createdEvent) {
        throw new Error("ProductCreatedConfidential event not found in factory receipt.");
      }

      const escrowAddress = normalizeAddress(createdEvent.args.product);
      const productId = createdEvent.args.productId?.toString?.() || "";
      const nextOrderId = generateOrderId();
      const network = await provider.getNetwork();

      const listingMeta = {
        schemaVersion: "6.0",
        productName,
        name: productName,
        batch: "",
        productContract: escrowAddress,
        productId,
        chainId: String(network.chainId),
        sellerAddr: sellerAddress,
        orderModel: "erc7984-confidential-v1",
        unitPriceWei,
        unitPriceHash,
        paymentToken,
        listingSnapshotCid: "",
        certificateCredential: {
          name: "",
          cid: "",
        },
        componentCredentials: [],
        createdAt: new Date().toISOString(),
      };

      try {
        await saveProductMeta({
          productAddress: escrowAddress,
          productMeta: listingMeta,
          priceWei: unitPriceWei,
          priceCommitment: unitPriceHash,
          sellerRailgunAddress: null,
          unitPriceWei,
          unitPriceHash,
          schemaVersion: "6.0",
        });
      } catch (metadataError) {
        console.warn("Failed to persist ERC-7984 product metadata", metadataError);
      }

      setLastTx({
        label: "create-product",
        hash: receipt.hash,
        productAddress: escrowAddress,
        productId,
        unitPriceHash,
        paymentToken,
        recordedAt: new Date().toISOString(),
      });
      setProductAddressInput(escrowAddress);
      setOrderIdInput(nextOrderId);
      setCreatePaymentTokenInput(paymentToken);

      const draftPatch = buildErc7984FlowDraftPatch({
        productAddress: escrowAddress,
        paymentToken,
        orderId: nextOrderId,
      });
      writeErc7984FlowDraft(draftPatch);
      setTokenToolsAddressInput(paymentToken);

      await loadEscrowBundle({ productAddress: escrowAddress });
    } catch (createError) {
      setError(createError.message || "Failed to create ERC-7984 product.");
    } finally {
      setPendingAction("");
    }
  }

  const canConfirmOrder =
    role === "seller" &&
    Number(escrowState?.phase) === 1 &&
    hasValidWorkingOrderId &&
    Boolean(currentOrderRow) &&
    Boolean(productMetaRow) &&
    escrowState?.sellerBondAttestation?.status === "verified_true";

  const canCreateTransporter =
    Number(escrowState?.phase) === 2 &&
    role !== "seller" &&
    role !== "buyer" &&
    Number(quotedFeeInput) > 0;

  const canSetTransporter =
    role === "seller" &&
    Number(escrowState?.phase) === 2 &&
    normalizeAddress(selectedTransporterInput) !== "";

  const canConfirmDelivery =
    role === "transporter" &&
    Number(escrowState?.phase) === 3 &&
    hasValidWorkingOrderId &&
    vcHash !== ethers.ZeroHash;

  const canBuyerDeposit =
    Number(escrowState?.phase) === 0 &&
    role !== "seller" &&
    hasValidWorkingOrderId &&
    Boolean(buyerDepositAmountValue) &&
    hasSufficientConfidentialBalance(buyerDepositAmountValue);

  const canSellerBondDeposit =
    role === "seller" &&
    Number(escrowState?.phase) === 1 &&
    hasValidWorkingOrderId &&
    Boolean(sellerBondAmountValue) &&
    hasSufficientConfidentialBalance(sellerBondAmountValue);

  const canSellerBondFinalize =
    Number(escrowState?.phase) === 1 &&
    escrowState?.sellerBondAttestation?.status === "pending" &&
    Boolean(escrowState?.sellerBondAttestation?.handle);

  const canSellerFeeDeposit =
    role === "seller" &&
    Number(escrowState?.phase) === 3 &&
    hasValidWorkingOrderId &&
    Boolean(sellerFeeAmountValue) &&
    hasSufficientConfidentialBalance(sellerFeeAmountValue);

  const canTransporterBondDeposit =
    role === "transporter" &&
    Number(escrowState?.phase) === 3 &&
    hasValidWorkingOrderId &&
    Boolean(transporterBondAmountValue) &&
    hasSufficientConfidentialBalance(transporterBondAmountValue);

  const canTransporterBondFinalize =
    Number(escrowState?.phase) === 3 &&
    escrowState?.transporterBondAttestation?.status === "pending" &&
    Boolean(escrowState?.transporterBondAttestation?.handle);
  const boundCommitmentCid = currentOrderRow?.orderVcCid || productMetaRow?.vcCid || "";
  const deliveryPreconditions = useMemo(
    () => [
      {
        label: "Order is bound to a transporter",
        satisfied: Number(escrowState?.phase) === 3,
      },
      {
        label: "Commitment VRC CID is present",
        satisfied: Boolean(boundCommitmentCid),
      },
      {
        label: "Bound VRC hash is set on-chain",
        satisfied: vcHash !== ethers.ZeroHash,
      },
      {
        label: "Seller delivery fee is funded",
        satisfied: Boolean(escrowState?.hasSellerDeliveryFeeDeposit),
      },
      {
        label: "Transporter bond is funded",
        satisfied: Boolean(escrowState?.hasTransporterSecurityDeposit),
      },
      {
        label: "Transporter equality is verified",
        satisfied: escrowState?.transporterBondAttestation?.status === "verified_true",
      },
    ],
    [boundCommitmentCid, escrowState, vcHash]
  );

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-cyan-900 to-slate-800 p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.28em] text-cyan-200">ERC-7984 Spike</p>
              <h1 className="text-3xl font-semibold">Confidential Actions Workbench</h1>
              <p className="max-w-3xl text-sm text-slate-200">
                Test the browser-executable ERC-7984 flow steps against a live escrow. The page now
                covers public-to-confidential funding, confidential deposits, and equality
                attestation finalization directly from the browser.
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                to="/erc7984/vrc"
                className="rounded-md border border-white/20 bg-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/20"
              >
                Open VRC Workbench
              </Link>
              <Link
                to="/"
                className="rounded-md border border-white/20 bg-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/20"
              >
                Back To Marketplace
              </Link>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {trustWarnings.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {trustWarnings.join(" ")}
          </div>
        )}

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">0. Create Product</h2>
          <p className="mt-1 text-sm text-slate-600">
            Seller deploys a fresh ERC-7984 escrow clone from the confidential factory, stores
            minimal listing metadata, and gets a fresh working order id for the browser flow.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Factory Address</span>
              <input
                value={factoryAddressInput}
                onChange={(event) => setFactoryAddressInput(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                placeholder="0x..."
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Payment Token</span>
              <input
                value={createPaymentTokenInput}
                onChange={(event) => setCreatePaymentTokenInput(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                placeholder="0x..."
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Product Name</span>
              <input
                value={createProductNameInput}
                onChange={(event) => setCreateProductNameInput(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                placeholder="Browser ERC-7984 Product"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Unit Price Wei</span>
              <input
                value={createUnitPriceWeiInput}
                onChange={(event) => setCreateUnitPriceWeiInput(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                placeholder="100"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              onClick={handleCreateProduct}
              disabled={!canCreateProduct}
              isLoading={pendingAction === "create-product"}
            >
              Create ERC-7984 Product
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!latestPrepConfig}
              onClick={() => {
                if (!latestPrepConfig) {
                  return;
                }
                setFundingWrapperAddressInput(latestPrepConfig.fundingWrapper || "");
                setPublicTokenAddressInput(latestPrepConfig.publicToken || "");
                setTokenToolsAddressInput(latestPrepConfig.confidentialToken || "");
                setFactoryAddressInput(latestPrepConfig.factory || "");
                setCreatePaymentTokenInput(latestPrepConfig.confidentialToken || "");
                setProductAddressInput(latestPrepConfig.productEscrow || "");
                setOrderIdInput(latestPrepConfig.suggestedOrderId || "");
              }}
            >
              Use Latest Sepolia Prep
            </Button>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Unit price hash: {derivedCreateUnitPriceHash || "not-set"}
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">0.5 Confidential Token Tools</h2>
          <p className="mt-1 text-sm text-slate-600">
            Fund private balance through the public ERC-20 wrapper, then inspect both public and confidential balances
            for the connected wallet.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Funding Wrapper</span>
              <input
                value={fundingWrapperAddressInput}
                onChange={(event) => setFundingWrapperAddressInput(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                placeholder="0x..."
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Public ERC-20</span>
              <input
                value={publicTokenAddressInput}
                onChange={(event) => setPublicTokenAddressInput(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                placeholder="0x..."
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Confidential Token</span>
              <input
                value={tokenToolsAddressInput}
                onChange={(event) => setTokenToolsAddressInput(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                placeholder={escrowState?.paymentToken || createPaymentTokenInput || "0x..."}
              />
            </label>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Connected Wallet</div>
              <div className="mt-2 break-all font-mono text-xs text-slate-900">
                {connectedUserAddress || "not-connected"}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Public Balance</div>
              <div className="mt-2 font-mono text-lg text-slate-900">
                {publicBalance ?? "not-loaded"}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Confidential Balance</div>
              <div className="mt-2 font-mono text-lg text-slate-900">
                {confidentialBalance ?? "not-loaded"}
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-sm font-medium text-slate-900">Refresh Funding State</div>
              <div className="mt-2 text-xs text-slate-500">
                Reads wrapper configuration, public token allowance, and the connected wallet&apos;s public and
                confidential balances.
              </div>
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <div className="text-xs uppercase tracking-wide text-slate-500">Allowance To Wrapper</div>
                <div className="mt-2 font-mono text-sm text-slate-900">
                  {publicAllowance ?? "not-loaded"}
                </div>
              </div>
              <div className="mt-4">
                <Button
                  variant="secondary"
                  disabled={!canInspectConfidentialBalance && !ethers.isAddress(resolvedFundingWrapperAddress)}
                  isLoading={pendingAction === "refresh-confidential-balance"}
                  onClick={async () => {
                    setPendingAction("refresh-confidential-balance");
                    setError("");
                    try {
                      const result = await refreshFundingToolsState();
                      setLastTx({
                        label: "refresh-funding-tools",
                        wrapperAddress: result?.wrapperAddress || null,
                        publicTokenAddress: result?.publicTokenAddress || null,
                        confidentialTokenAddress: result?.confidentialTokenAddress || null,
                        publicBalance: result?.publicBalance ?? null,
                        confidentialBalance: result?.confidentialBalance ?? null,
                        publicAllowance: result?.publicAllowance ?? null,
                        recordedAt: new Date().toISOString(),
                      });
                    } catch (balanceError) {
                      setError(balanceError.message || "Failed to read funding balances.");
                    } finally {
                      setPendingAction("");
                    }
                  }}
                >
                  Refresh Funding State
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-sm font-medium text-slate-900">Fund Confidential Balance</div>
              <div className="mt-2 text-xs text-slate-500">
                Choose an amount and continue. If approval is needed, the app will request it first, then send the
                wrapper deposit to mint the same amount as confidential ERC-7984 balance to the connected wallet.
                {publicTokenIsWrappedNative
                  ? ` For the Sepolia evaluation path, the public funding asset is ${publicTokenLabel}, so you can wrap native ETH first and then deposit ${publicTokenLabel} into the wrapper.`
                  : ""}
              </div>
              <div className="mt-4 grid gap-3">
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Amount</span>
                  <input
                    value={fundAmountInput}
                    onChange={(event) => setFundAmountInput(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                    placeholder="100"
                  />
                </label>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    disabled={!canWrapPublicToken}
                    isLoading={pendingAction === "wrap-public-token"}
                    onClick={async () => {
                      setPendingAction("wrap-public-token");
                      setError("");
                      try {
                        const signer = await provider.getSigner();
                        const publicToken = new Contract(
                          ethers.getAddress(resolvedPublicTokenAddress),
                          PUBLIC_ERC20_ABI,
                          signer
                        );
                        const amount = parseOptionalPositiveInteger(
                          fundAmountInput,
                          `${publicTokenLabel} wrap amount`
                        );
                        const tx = await publicToken.deposit({ value: amount });
                        const receipt = await tx.wait();
                        const refreshed = await refreshFundingToolsState();
                        setLastTx({
                          label: "wrap-public-token",
                          hash: receipt.hash,
                          amount: amount.toString(),
                          publicBalance: refreshed?.publicBalance ?? null,
                          recordedAt: new Date().toISOString(),
                        });
                      } catch (wrapError) {
                        setError(
                          wrapError.message || `Failed to wrap native balance into ${publicTokenLabel}.`
                        );
                      } finally {
                        setPendingAction("");
                      }
                    }}
                  >
                    {publicTokenIsWrappedNative
                      ? `Wrap Native To ${publicTokenLabel}`
                      : "Prepare Public Token Balance"}
                  </Button>
                  <Button
                    disabled={!canFundConfidentialBalance}
                    isLoading={pendingAction === "fund-confidential-balance"}
                    onClick={async () => {
                      setPendingAction("fund-confidential-balance");
                      setError("");
                      try {
                        const signer = await provider.getSigner();
                        const userAddress = await signer.getAddress();
                        const publicTokenAddress = ethers.getAddress(resolvedPublicTokenAddress);
                        const fundingWrapperAddress = ethers.getAddress(resolvedFundingWrapperAddress);
                        const wrapper = new Contract(
                          fundingWrapperAddress,
                          FUNDING_WRAPPER_ABI,
                          signer
                        );
                        const amount = parseOptionalPositiveInteger(
                          fundAmountInput,
                          `${publicTokenLabel} funding amount`
                        );
                        const publicToken = new Contract(
                          publicTokenAddress,
                          PUBLIC_ERC20_ABI,
                          signer
                        );
                        const currentAllowance = await publicToken.allowance(
                          userAddress,
                          fundingWrapperAddress
                        );
                        let approveReceipt = null;

                        if (currentAllowance < amount) {
                          const approveTx = await publicToken.approve(fundingWrapperAddress, amount);
                          approveReceipt = await approveTx.wait();
                        }

                        const tx = await wrapper.deposit(amount);
                        const receipt = await tx.wait();
                        const refreshed = await refreshFundingToolsState();
                        setLastTx({
                          label: "fund-confidential-balance",
                          approveTxHash: approveReceipt?.hash || null,
                          depositTxHash: receipt.hash,
                          amount: amount.toString(),
                          publicBalance: refreshed?.publicBalance ?? null,
                          confidentialBalance: refreshed?.confidentialBalance ?? null,
                          publicAllowance: refreshed?.publicAllowance ?? null,
                          recordedAt: new Date().toISOString(),
                        });
                      } catch (fundError) {
                        setError(fundError.message || "Failed to fund confidential balance.");
                      } finally {
                        setPendingAction("");
                      }
                    }}
                  >
                    Deposit {publicTokenLabel} To Private
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">1. Load Escrow</h2>
          <p className="mt-1 text-sm text-slate-600">
            Read the live ERC-7984 escrow state and available transporter bids from chain.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Product Escrow Address</span>
              <input
                value={productAddressInput}
                onChange={(event) => setProductAddressInput(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                placeholder="0x..."
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Working Order ID</span>
              <div className="flex gap-2">
                <input
                  value={workingOrderId === ethers.ZeroHash ? "" : workingOrderId}
                  onChange={(event) => setOrderIdInput(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                  placeholder="0x... bytes32"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setOrderIdInput(generateOrderId())}
                >
                  Generate
                </Button>
              </div>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={loadEscrowBundle} isLoading={isLoading}>
              Load Escrow
            </Button>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Browser fhevm: {fhevmStatus}
            </div>
          </div>
        </section>

        {escrowState && (
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">2. Live State</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Role</div>
                  <div className="mt-2 text-sm font-medium text-slate-900">{role}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Phase</div>
                  <div className="mt-2 text-sm font-medium text-slate-900">
                    {PHASE_LABELS[escrowState.phase] || String(escrowState.phase)}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Active Order</div>
                  <div className="mt-2 break-all font-mono text-xs text-slate-900">
                    {activeOrderId !== ethers.ZeroHash ? activeOrderId : "none"}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">VC Hash</div>
                  <div className="mt-2 break-all font-mono text-xs text-slate-900">
                    {vcHash !== ethers.ZeroHash ? vcHash : "not-set"}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Commitment VRC CID</div>
                  <div className="mt-2 break-all font-mono text-xs text-slate-900">
                    {boundCommitmentCid || "not-set"}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Delivered</div>
                  <div className="mt-2 text-sm font-medium text-slate-900">
                    {escrowState.delivered ? "yes" : "no"}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Payment Token</div>
                  <div className="mt-2 break-all font-mono text-xs text-slate-900">
                    {escrowState.paymentToken}
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Confidential Funding And Attestation
                </div>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    <div className="font-medium text-slate-900">Buyer Purchase Deposit</div>
                    <div className="mt-2 text-sm text-slate-700">
                      Current status: {escrowState.hasBuyerDeposit ? "done" : "not-done"}
                    </div>
                    {hasResolvedUnitPriceWei ? (
                      <div className="mt-3 grid gap-3">
                        <div>
                          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Private Quantity
                          </div>
                          <input
                            value={buyerQuantityInput}
                            onChange={(event) => setBuyerQuantityInput(event.target.value)}
                            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                            placeholder="1"
                          />
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                          <div>Public unit price: {resolvedUnitPriceWei}</div>
                          <div className="mt-1">Derived confidential payment: {buyerDepositAmountDisplay || "not-set"}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3">
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Confidential Payment Amount
                        </div>
                        <input
                          value={buyerAmountInput}
                          onChange={(event) => setBuyerAmountInput(event.target.value)}
                          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                          placeholder="100"
                        />
                      </div>
                    )}
                    <div className="mt-3 flex gap-2">
                      <Button
                        disabled={!canBuyerDeposit}
                        isLoading={pendingAction === "buyer-deposit"}
                        onClick={() =>
                          withConfidentialDeposit(
                            "buyer-deposit",
                            DEPOSIT_KIND.BuyerPurchase,
                            buyerDepositAmountDisplay
                          )
                        }
                      >
                        Deposit
                      </Button>
                    </div>
                    {confidentialBalanceValue != null &&
                    buyerDepositAmountValue != null &&
                    confidentialBalanceValue < buyerDepositAmountValue ? (
                      <div className="mt-2 text-xs text-amber-700">
                        Insufficient confidential balance. Available: {confidentialBalance}; required:{" "}
                        {buyerDepositAmountValue.toString()}.
                      </div>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    <div className="font-medium text-slate-900">Seller Bond Deposit</div>
                    <div className="mt-2 text-sm text-slate-700">
                      Current status: {escrowState.hasSellerBondDeposit ? "done" : "not-done"}
                    </div>
                    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      Required seller bond: {requiredBondAmountDisplay || "not-derived-yet"}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input
                        value={sellerBondAmountInput}
                        onChange={(event) => setSellerBondAmountInput(event.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                        placeholder="100"
                      />
                      <Button
                        disabled={!canSellerBondDeposit}
                        isLoading={pendingAction === "seller-bond-deposit"}
                        onClick={() =>
                          withConfidentialDeposit(
                            "seller-bond-deposit",
                            DEPOSIT_KIND.SellerBond,
                            sellerBondAmountInput
                          )
                        }
                      >
                        Deposit
                      </Button>
                    </div>
                    {confidentialBalanceValue != null &&
                    sellerBondAmountValue != null &&
                    confidentialBalanceValue < sellerBondAmountValue ? (
                      <div className="mt-2 text-xs text-amber-700">
                        Insufficient confidential balance. Available: {confidentialBalance}; required:{" "}
                        {sellerBondAmountValue.toString()}.
                      </div>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    <div className="font-medium text-slate-900">Seller Equality Attestation</div>
                    <div className="mt-2 text-sm text-slate-700">
                      Current status: {escrowState.sellerBondAttestation.status}
                    </div>
                    <div className="mt-1 break-all font-mono text-[11px] text-slate-500">
                      {escrowState.sellerBondAttestation.handle || "handle not available"}
                    </div>
                    <div className="mt-3">
                      <Button
                        disabled={!canSellerBondFinalize}
                        isLoading={pendingAction === "seller-bond-finalize"}
                        onClick={() =>
                          withEqualityFinalize(
                            "seller-bond-finalize",
                            EQUALITY_TARGET.SellerBondMatchesBuyerDeposit,
                            escrowState?.sellerBondAttestation?.handle
                          )
                        }
                      >
                        Finalize
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    <div className="font-medium text-slate-900">Seller Delivery Fee Deposit</div>
                    <div className="mt-2 text-sm text-slate-700">
                      Current status: {escrowState.hasSellerDeliveryFeeDeposit ? "done" : "not-done"}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input
                        value={sellerFeeAmountInput}
                        onChange={(event) => setSellerFeeAmountInput(event.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                        placeholder="15"
                      />
                      <Button
                        disabled={!canSellerFeeDeposit}
                        isLoading={pendingAction === "seller-fee-deposit"}
                        onClick={() =>
                          withConfidentialDeposit(
                            "seller-fee-deposit",
                            DEPOSIT_KIND.SellerDeliveryFee,
                            sellerFeeAmountInput
                          )
                        }
                      >
                        Deposit
                      </Button>
                    </div>
                    {confidentialBalanceValue != null &&
                    sellerFeeAmountValue != null &&
                    confidentialBalanceValue < sellerFeeAmountValue ? (
                      <div className="mt-2 text-xs text-amber-700">
                        Insufficient confidential balance. Available: {confidentialBalance}; required:{" "}
                        {sellerFeeAmountValue.toString()}.
                      </div>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    <div className="font-medium text-slate-900">Transporter Bond Deposit</div>
                    <div className="mt-2 text-sm text-slate-700">
                      Current status: {escrowState.hasTransporterSecurityDeposit ? "done" : "not-done"}
                    </div>
                    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      Required transporter bond: {requiredBondAmountDisplay || "not-derived-yet"}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input
                        value={transporterBondAmountInput}
                        onChange={(event) => setTransporterBondAmountInput(event.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                        placeholder="100"
                      />
                      <Button
                        disabled={!canTransporterBondDeposit}
                        isLoading={pendingAction === "transporter-bond-deposit"}
                        onClick={() =>
                          withConfidentialDeposit(
                            "transporter-bond-deposit",
                            DEPOSIT_KIND.TransporterSecurityDeposit,
                            transporterBondAmountInput
                          )
                        }
                      >
                        Deposit
                      </Button>
                    </div>
                    {confidentialBalanceValue != null &&
                    transporterBondAmountValue != null &&
                    confidentialBalanceValue < transporterBondAmountValue ? (
                      <div className="mt-2 text-xs text-amber-700">
                        Insufficient confidential balance. Available: {confidentialBalance}; required:{" "}
                        {transporterBondAmountValue.toString()}.
                      </div>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    <div className="font-medium text-slate-900">Transporter Equality Attestation</div>
                    <div className="mt-2 text-sm text-slate-700">
                      Current status: {escrowState.transporterBondAttestation.status}
                    </div>
                    <div className="mt-1 break-all font-mono text-[11px] text-slate-500">
                      {escrowState.transporterBondAttestation.handle || "handle not available"}
                    </div>
                    <div className="mt-3">
                      <Button
                        disabled={!canTransporterBondFinalize}
                        isLoading={pendingAction === "transporter-bond-finalize"}
                        onClick={() =>
                          withEqualityFinalize(
                            "transporter-bond-finalize",
                            EQUALITY_TARGET.TransporterBondMatchesBuyerDeposit,
                            escrowState?.transporterBondAttestation?.handle
                          )
                        }
                      >
                        Finalize
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">3. Browser Actions</h2>
              <p className="mt-1 text-sm text-slate-600">
                These actions use plain `ethers` contract calls and are already executable from the browser.
              </p>

                <div className="mt-5 space-y-4">
                  <div className="rounded-xl border border-slate-200 p-4">
                    <div className="text-sm font-medium text-slate-900">Seller Confirm Order</div>
                    <div className="mt-2 text-xs text-slate-500">
                      Builds the commitment VRC, asks the seller to sign it, uploads it to IPFS, and
                      then binds the real CID on-chain in `confirmOrderById(...)`.
                    </div>
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Commitment VRC CID
                      </div>
                      <div className="mt-2 break-all font-mono text-xs text-slate-700">
                        {currentOrderRow?.orderVcCid ||
                          "Created and uploaded during confirm-order once seller equality is verified."}
                      </div>
                    </div>
                    <div className="mt-3">
                      <Button
                        disabled={!canConfirmOrder}
                        isLoading={pendingAction === "confirm-order"}
                        onClick={handleConfirmOrderWithCommitmentVrc}
                    >
                      Confirm Order
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-medium text-slate-900">Transporter Bid / Selection</div>
                  <div className="mt-3 grid gap-3">
                    <label className="space-y-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Quoted Fee Units
                      </span>
                      <input
                        value={quotedFeeInput}
                        onChange={(event) => setQuotedFeeInput(event.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                        placeholder="15"
                      />
                    </label>
                    <Button
                      disabled={!canCreateTransporter}
                      isLoading={pendingAction === "create-transporter"}
                      onClick={() =>
                        withSignerAction("create-transporter", (contract) =>
                          contract.createTransporter(parsePositiveInteger(quotedFeeInput))
                        )
                      }
                    >
                      Create Transporter Bid
                    </Button>

                    <label className="space-y-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Selected Transporter
                      </span>
                      <input
                        value={selectedTransporterInput}
                        onChange={(event) => setSelectedTransporterInput(event.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                        placeholder="0x..."
                      />
                    </label>
                    <Button
                      disabled={!canSetTransporter}
                      isLoading={pendingAction === "set-transporter"}
                      onClick={() =>
                        withSignerAction("set-transporter", (contract) =>
                          contract.setTransporter(normalizeAddress(selectedTransporterInput))
                        )
                      }
                    >
                      Select Transporter
                    </Button>
                  </div>

                  {bidRows.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Current Bids
                      </div>
                      {bidRows.map((bid) => (
                        <button
                          key={bid.address}
                          type="button"
                          onClick={() => setSelectedTransporterInput(bid.address)}
                          className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                        >
                          <span className="font-mono text-xs">{bid.address}</span>
                          <span>{bid.fee}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-medium text-slate-900">Transporter Confirm Delivery</div>
                  <div className="mt-2 text-xs text-slate-500">
                    Transporter confirms the same commitment artifact the seller bound on-chain during
                    `confirmOrderById(...)`. The UI uses the bound `activeOrderId` and `vcHash`
                    automatically, so no manual hash copy is needed here.
                  </div>
                  <div className="mt-3 grid gap-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Bound Commitment CID
                      </div>
                      <div className="mt-2 break-all font-mono text-xs text-slate-700">
                        {boundCommitmentCid || "Not bound yet."}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Bound Hash Checked At Delivery
                      </div>
                      <div className="mt-2 break-all font-mono text-xs text-slate-700">
                        {vcHash !== ethers.ZeroHash ? vcHash : "Not bound yet."}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Delivery Preconditions
                      </div>
                      <div className="mt-2 space-y-2 text-xs text-slate-700">
                        {deliveryPreconditions.map((item) => (
                          <div
                            key={item.label}
                            className={`rounded-md border px-2 py-1 ${
                              item.satisfied
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-white text-slate-600"
                            }`}
                          >
                            {item.satisfied ? "Ready" : "Waiting"}: {item.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Button
                      disabled={!canConfirmDelivery}
                      isLoading={pendingAction === "confirm-delivery"}
                      onClick={handleConfirmDeliveryWithLinkage}
                    >
                      Confirm Delivery
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-medium text-slate-900">Recovery / Timeout Actions</div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Button
                      variant="ghost"
                      isLoading={pendingAction === "seller-timeout"}
                      onClick={() => withSignerAction("seller-timeout", (contract) => contract.sellerTimeout())}
                    >
                      Seller Timeout
                    </Button>
                    <Button
                      variant="ghost"
                      isLoading={pendingAction === "bid-timeout"}
                      onClick={() => withSignerAction("bid-timeout", (contract) => contract.bidTimeout())}
                    >
                      Bid Timeout
                    </Button>
                    <Button
                      variant="ghost"
                      isLoading={pendingAction === "delivery-timeout"}
                      onClick={() =>
                        withSignerAction("delivery-timeout", (contract) => contract.deliveryTimeout())
                      }
                    >
                      Delivery Timeout
                    </Button>
                    <Button
                      variant="ghost"
                      isLoading={pendingAction === "withdraw-bid"}
                      onClick={() => withSignerAction("withdraw-bid", (contract) => contract.withdrawBid())}
                    >
                      Withdraw Bid
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Order Snapshot</h2>
            <pre className="mt-4 max-h-[520px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
              {prettyJson(
                currentOrderRow || {
                  note: activeOrderId !== ethers.ZeroHash
                    ? "No backend order row found for the active on-chain order."
                    : "Load an escrow with an active order to inspect the recovered order row.",
                }
              )}
            </pre>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Last Transaction</h2>
            <pre className="mt-4 max-h-[520px] overflow-auto rounded-xl bg-slate-100 p-4 text-xs text-slate-800">
              {prettyJson(lastTx || { note: "No action sent yet." })}
            </pre>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                variant="secondary"
                disabled={!workingOrderId || !resolvedProductAddress}
                onClick={() => {
                  const draftPatch = buildErc7984FlowDraftPatch({
                    orderId: workingOrderId,
                    productAddress: resolvedProductAddress,
                    paymentToken: escrowState?.paymentToken,
                  });
                  writeErc7984FlowDraft(
                    draftPatch
                  );
                  navigate("/erc7984/vrc", { state: draftPatch });
                }}
              >
                Continue In VRC Flow
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
