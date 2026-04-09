import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { Link, useLocation } from "react-router-dom";
import { Button } from "../ui/button";
import { getOrder, updateOrderVc } from "../../utils/orderApi";
import { getOrderAttestation } from "../../utils/buyerSecretApi";
import { getProductMeta, updateVcCid } from "../../utils/productMetaApi";
import {
  buildErc7984OrderVrcFromRecovery,
  signUploadArchiveErc7984OrderVrc,
} from "../../utils/erc7984/vrcFlow";
import { fetchVCStatusFromServer, verifyVCWithServer } from "../../utils/verifyVc";
import { EqualityStatus } from "../../utils/erc7984/equalityAttestationModel";
import {
  buildDepositReference,
  buildErc7984ContextHashSeed,
  computeCanonicalBridgeHash,
  PaymentBridgeVerificationStatus,
} from "../../utils/erc7984/paymentBridgeModel";
import { readProductEscrowState } from "../../utils/erc7984/escrowState";
import { readErc7984FlowDraft } from "../../utils/erc7984/flowDraft";

function normalizeAddress(value) {
  return value ? String(value).trim().toLowerCase() : "";
}

function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

function formatTimestamp(value) {
  if (!value) {
    return "not-set";
  }
  return new Date(Number(value) * 1000).toISOString();
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
    warnings.push("Backend bridge row is inconsistent: quantity * unit price does not equal total proof value.");
  }

  if (totalValue != null && paymentValue != null && totalValue !== paymentValue) {
    warnings.push("Backend bridge row is inconsistent: total proof value does not equal payment proof value.");
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

  if (getBridgeCoherenceWarnings(sanitizedOrder).length > 0) {
    warnings.push("Ignoring backend bridge proof fields because they are internally inconsistent.");
    sanitizedOrder.quantityCommitment = "";
    sanitizedOrder.quantityProof = null;
    sanitizedOrder.totalCommitment = "";
    sanitizedOrder.totalProof = null;
    sanitizedOrder.paymentCommitment = "";
    sanitizedOrder.paymentProof = null;
  }

  return { order: sanitizedOrder, warnings };
}

function buildProductMetaForVrc(metadata, order, paymentToken) {
  const listing = metadata?.productMeta || {};
  return {
    ...listing,
    productId: listing.productId || order?.productId || "",
    chainId: listing.chainId || order?.chainId || "",
    unitPriceWei: metadata?.unitPriceWei || order?.unitPriceWei || "",
    unitPriceHash: metadata?.unitPriceHash || order?.unitPriceHash || "",
    listingSnapshotCid: metadata?.listingSnapshotCid || "",
    paymentToken: paymentToken || listing.paymentToken || "",
  };
}

function mapEscrowPhaseToOrderStatus(phase) {
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
      return "unknown";
  }
}

function mergePersistedBridgeAttestation(order, attestation) {
  if (!order) {
    return attestation || null;
  }

  const hasPersistedBridgeData = Boolean(
    order.quantityProof ||
    order.paymentProof ||
    order.totalCommitment ||
    order.paymentCommitment ||
    order.buyerDepositTxHash ||
    order.buyerDepositReference
  );

  if (!hasPersistedBridgeData) {
    return attestation || null;
  }

  return {
    ...(attestation || {}),
    quantityTotalProof: attestation?.quantityTotalProof || order.quantityProof || null,
    paymentEqualityProof: attestation?.paymentEqualityProof || order.paymentProof || null,
    proofBundle: {
      ...(attestation?.proofBundle || {}),
      contextHash: order.contextHash || attestation?.proofBundle?.contextHash || "",
      quantityCommitment: order.quantityCommitment || attestation?.proofBundle?.quantityCommitment || "",
      quantityValue: order.quantityProof?.quantity || attestation?.proofBundle?.quantityValue || "",
      unitPriceWei: order.unitPriceWei || attestation?.proofBundle?.unitPriceWei || "",
      totalCommitment: order.totalCommitment || attestation?.proofBundle?.totalCommitment || "",
      paymentCommitment: order.paymentCommitment || attestation?.proofBundle?.paymentCommitment || "",
      depositTxHash: order.buyerDepositTxHash || attestation?.proofBundle?.depositTxHash || "",
      depositReference: order.buyerDepositReference || attestation?.proofBundle?.depositReference || "",
    },
  };
}

async function buildFallbackRecoveryBundle({
  provider,
  orderId,
  productAddress,
  escrowState,
  productMetaRow,
  attestation,
  paymentToken,
  buyerDepositTxHash,
  currentUser,
}) {
  if (!provider || !escrowState) {
    return null;
  }

  const network = await provider.getNetwork();
  const chainId = String(network.chainId);
  const fallbackProductMeta = productMetaRow || {
    productAddress,
    productMeta: {
      productName: escrowState.name || "",
      name: escrowState.name || "",
      productId: "",
      chainId,
      unitPriceWei: "",
      unitPriceHash: escrowState.unitPriceHash || "",
      listingSnapshotCid: "",
      paymentToken: paymentToken || escrowState.paymentToken || "",
      certificateCredential: { name: "", cid: "" },
      componentCredentials: [],
    },
    unitPriceWei: "",
    unitPriceHash: escrowState.unitPriceHash || "",
    listingSnapshotCid: "",
  };

  const derivedContextHash = computeCanonicalBridgeHash(
    buildErc7984ContextHashSeed({
      orderId,
      productId: fallbackProductMeta?.productMeta?.productId || "",
      chainId,
      escrowAddress: productAddress,
      paymentToken: paymentToken || escrowState.paymentToken || "",
      buyerAddress: escrowState.buyerAddress || "",
      sellerAddress: escrowState.sellerAddress || normalizeAddress(currentUser),
      unitPriceHash: escrowState.unitPriceHash || fallbackProductMeta.unitPriceHash || "",
      transporterAddress: escrowState.transporterAddress || "",
    })
  );

  return {
    order: {
      orderId,
      productAddress,
      escrowAddress: productAddress,
      productId: "",
      chainId,
      sellerAddress: escrowState.sellerAddress || normalizeAddress(currentUser),
      buyerAddress: escrowState.buyerAddress || "",
      transporterAddress: escrowState.transporterAddress || "",
      status: mapEscrowPhaseToOrderStatus(escrowState.phase),
      memoHash: "",
      railgunTxRef: "",
      unitPriceWei: fallbackProductMeta.unitPriceWei || "",
      unitPriceHash: escrowState.unitPriceHash || fallbackProductMeta.unitPriceHash || "",
      quantityCommitment: "",
      quantityProof: null,
      totalCommitment: "",
      totalProof: null,
      paymentCommitment: "",
      paymentProof: null,
      contextHash: derivedContextHash,
      depositTxHash: buyerDepositTxHash || "",
      orderVcCid: "",
      orderVcHash: escrowState.vcHash || "",
    },
    attestation: attestation || null,
    productMeta: fallbackProductMeta,
    fallback: true,
  };
}

export default function Erc7984VrcWorkbench({ provider, currentUser }) {
  const location = useLocation();
  const [orderIdInput, setOrderIdInput] = useState("");
  const [productAddressInput, setProductAddressInput] = useState("");
  const [paymentTokenInput, setPaymentTokenInput] = useState("");
  const [buyerDepositTxHashInput, setBuyerDepositTxHashInput] = useState("");
  const [escrowState, setEscrowState] = useState(null);
  const [bundle, setBundle] = useState(null);
  const [draftVrc, setDraftVrc] = useState(null);
  const [signedVrc, setSignedVrc] = useState(null);
  const [archiveResult, setArchiveResult] = useState(null);
  const [statusResult, setStatusResult] = useState(null);
  const [verificationResult, setVerificationResult] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoadingBundle, setIsLoadingBundle] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const resolvedProductAddress = useMemo(() => {
    return normalizeAddress(productAddressInput || bundle?.order?.productAddress || bundle?.order?.escrowAddress);
  }, [bundle, productAddressInput]);

  const derivedPaymentToken = useMemo(() => {
    return normalizeAddress(
      paymentTokenInput
      || escrowState?.paymentToken
      || bundle?.order?.paymentToken
      || bundle?.productMeta?.productMeta?.paymentToken
    );
  }, [bundle, escrowState, paymentTokenInput]);

  const derivedTransporterAddress = useMemo(() => {
    return normalizeAddress(
      escrowState?.transporterAddress || bundle?.order?.transporterAddress || bundle?.order?.transporter
    );
  }, [bundle, escrowState]);

  const derivedBuyerAddress = useMemo(() => {
    return normalizeAddress(
      escrowState?.buyerAddress || bundle?.order?.buyerAddress || bundle?.attestation?.buyerAddress
    );
  }, [bundle, escrowState]);

  const derivedSellerAddress = useMemo(() => {
    return normalizeAddress(
      escrowState?.sellerAddress || bundle?.order?.sellerAddress || currentUser
    );
  }, [bundle, currentUser, escrowState]);

  const derivedBuyerDepositTxHash = useMemo(() => {
    return normalizeAddress(
      buyerDepositTxHashInput || bundle?.attestation?.proofBundle?.depositTxHash || bundle?.order?.depositTxHash
      || bundle?.order?.buyerDepositTxHash
    );
  }, [bundle, buyerDepositTxHashInput]);

  const derivedBuyerDepositReference = useMemo(() => {
    const persistedReference =
      bundle?.attestation?.proofBundle?.depositReference ||
      bundle?.order?.buyerDepositReference ||
      bundle?.order?.depositReference ||
      "";
    if (persistedReference) {
      return normalizeAddress(persistedReference);
    }
    if (!derivedBuyerDepositTxHash || !bundle?.order?.orderId || !derivedPaymentToken || !resolvedProductAddress) {
      return "";
    }

    return buildDepositReference({
      depositTxHash: derivedBuyerDepositTxHash,
      orderId: bundle.order.orderId,
      depositKind: "BuyerPurchase",
      paymentToken: derivedPaymentToken,
      escrowAddress: resolvedProductAddress,
      buyerAddress: derivedBuyerAddress,
    });
  }, [bundle, derivedBuyerAddress, derivedBuyerDepositTxHash, derivedPaymentToken, resolvedProductAddress]);

  const sellerBondAttestation = useMemo(() => {
    return (
      bundle?.order?.sellerBondAttestation ||
      escrowState?.sellerBondAttestation || {
        target: "sellerBondMatchesBuyerDeposit",
        status: EqualityStatus.None,
      }
    );
  }, [bundle, escrowState]);

  const transporterBondAttestation = useMemo(() => {
    return (
      bundle?.order?.transporterBondAttestation ||
      escrowState?.transporterBondAttestation || {
        target: "transporterBondMatchesBuyerDeposit",
        status: EqualityStatus.None,
      }
    );
  }, [bundle, escrowState]);

  const derivedPaymentBridgeStatus = useMemo(() => {
    if (bundle?.attestation?.paymentEqualityProof && derivedBuyerDepositReference) {
      return PaymentBridgeVerificationStatus.Bound;
    }
    return PaymentBridgeVerificationStatus.Pending;
  }, [bundle, derivedBuyerDepositReference]);

  const currentUserMatchesSeller = useMemo(() => {
    return Boolean(currentUser && derivedSellerAddress && normalizeAddress(currentUser) === derivedSellerAddress);
  }, [currentUser, derivedSellerAddress]);

  const canBuild = Boolean(bundle?.order && bundle?.productMeta && currentUser);
  const canSign = Boolean(draftVrc && provider && currentUserMatchesSeller);
  const cid = archiveResult?.cid || "";

  useEffect(() => {
    const routeState = location.state && typeof location.state === "object" ? location.state : {};
    const draft = readErc7984FlowDraft() || {};

    if (!orderIdInput) {
      const nextOrderId = String(routeState.orderId || draft.orderId || "").trim();
      if (nextOrderId) {
        setOrderIdInput(nextOrderId);
      }
    }

    if (!productAddressInput) {
      const nextProductAddress = normalizeAddress(routeState.productAddress || draft.productAddress || "");
      if (nextProductAddress) {
        setProductAddressInput(nextProductAddress);
      }
    }

    if (!paymentTokenInput) {
      const nextPaymentToken = normalizeAddress(routeState.paymentToken || draft.paymentToken || "");
      if (nextPaymentToken) {
        setPaymentTokenInput(nextPaymentToken);
      }
    }

    if (!buyerDepositTxHashInput) {
      const nextDepositTxHash = normalizeAddress(
        routeState.buyerDepositTxHash || draft.buyerDepositTxHash || ""
      );
      if (nextDepositTxHash) {
        setBuyerDepositTxHashInput(nextDepositTxHash);
      }
    }
  }, [buyerDepositTxHashInput, location.state, orderIdInput, paymentTokenInput, productAddressInput]);

  async function handleLoadBundle() {
    setIsLoadingBundle(true);
    setError("");
    setNotice("");
    setBundle(null);
    setDraftVrc(null);
    setSignedVrc(null);
    setArchiveResult(null);
    setStatusResult(null);
    setVerificationResult(null);
    setEscrowState(null);

    try {
      const normalizedOrderId = String(orderIdInput || "").trim().toLowerCase();
      if (!normalizedOrderId) {
        throw new Error("Order ID is required.");
      }

      const productAddress = normalizeAddress(productAddressInput);
      if (!productAddress) {
        throw new Error("Product address is required.");
      }

      let resolvedEscrowState = null;
      if (provider) {
        try {
          resolvedEscrowState = await readProductEscrowState(provider, productAddress);
        } catch (escrowError) {
          console.warn("Failed to read ERC-7984 escrow state", escrowError);
        }
      }

      const [order, productMetaRow, rawAttestation] = await Promise.all([
        getOrder(normalizedOrderId),
        getProductMeta(productAddress),
        getOrderAttestation(normalizedOrderId),
      ]);
      const sanitizedOrderResult = sanitizeOrderForTrustBoundaries(order, resolvedEscrowState);
      const sanitizedOrder = sanitizedOrderResult.order;
      const trustWarnings = sanitizedOrderResult.warnings;
      const attestation = mergePersistedBridgeAttestation(sanitizedOrder, rawAttestation);

      const fallbackBundle =
        !order && resolvedEscrowState
          ? await buildFallbackRecoveryBundle({
              provider,
              orderId: normalizedOrderId,
              productAddress,
              escrowState: resolvedEscrowState,
              productMetaRow,
              attestation,
              paymentToken: resolvedEscrowState?.paymentToken || paymentTokenInput || "",
              buyerDepositTxHash:
                buyerDepositTxHashInput ||
                readErc7984FlowDraft()?.buyerDepositTxHash ||
                "",
              currentUser,
            })
          : null;

      if (!order && !fallbackBundle) {
        throw new Error("Order not found in backend recovery state.");
      }

      setProductAddressInput(productAddress);
      setPaymentTokenInput(
        (previous) =>
          previous ||
          resolvedEscrowState?.paymentToken ||
          productMetaRow?.productMeta?.paymentToken ||
          fallbackBundle?.productMeta?.productMeta?.paymentToken ||
          ""
      );
      setBuyerDepositTxHashInput(
        (previous) =>
          previous ||
          attestation?.proofBundle?.depositTxHash ||
          order?.depositTxHash ||
          fallbackBundle?.order?.depositTxHash ||
          ""
      );
      setEscrowState(resolvedEscrowState);
      setBundle(
        sanitizedOrder
          ? {
              order: sanitizedOrder,
              attestation,
              productMeta:
                productMetaRow ||
                fallbackBundle?.productMeta || {
                  productAddress,
                  productMeta: {},
                },
            }
          : fallbackBundle
      );
      const notices = [];
      if (!sanitizedOrder && fallbackBundle) {
        notices.push(
          "Backend order row is missing. Using live escrow state and saved ERC-7984 flow context to build a fallback recovery bundle."
        );
      }
      if (trustWarnings.length > 0) {
        notices.push(...trustWarnings);
      }
      if (notices.length > 0) {
        setNotice(notices.join(" "));
      }
    } catch (loadError) {
      setError(loadError.message || "Failed to load ERC-7984 recovery bundle.");
    } finally {
      setIsLoadingBundle(false);
    }
  }

  async function handleBuildVrc() {
    setIsBuilding(true);
    setError("");
    setDraftVrc(null);
    setSignedVrc(null);
    setArchiveResult(null);
    setStatusResult(null);
    setVerificationResult(null);

    try {
      if (!bundle?.order || !bundle?.productMeta) {
        throw new Error("Load a recovery bundle before building the VRC.");
      }

      const productMeta = buildProductMetaForVrc(bundle.productMeta, bundle.order, derivedPaymentToken);
      const draft = buildErc7984OrderVrcFromRecovery({
        sellerAddress: derivedSellerAddress,
        buyerAddress: derivedBuyerAddress,
        productAddress: resolvedProductAddress,
        productMeta,
        order: bundle.order,
        attestation: bundle.attestation,
        paymentToken: derivedPaymentToken,
        buyerDepositTxHash: derivedBuyerDepositTxHash,
        buyerDepositReference: derivedBuyerDepositReference,
        sellerBondAttestation,
        paymentBridgeStatus: derivedPaymentBridgeStatus,
      });

      setDraftVrc(draft);
    } catch (buildError) {
      setError(buildError.message || "Failed to build ERC-7984 VRC.");
    } finally {
      setIsBuilding(false);
    }
  }

  async function handleSignUploadArchive() {
    setIsSigning(true);
    setError("");

    try {
      if (!draftVrc) {
        throw new Error("Build the ERC-7984 VRC before signing.");
      }

      const signer = await provider.getSigner();
      const signerAddress = normalizeAddress(await signer.getAddress());
      if (!signerAddress || signerAddress !== derivedSellerAddress) {
        throw new Error(
          `Switch MetaMask to the seller wallet ${derivedSellerAddress || "(unknown seller)"} before signing this VRC.`
        );
      }
      const result = await signUploadArchiveErc7984OrderVrc({
        vrc: draftVrc,
        signer,
        contractAddress: bundle?.order?.escrowAddress || resolvedProductAddress,
      });

      const vcHash = ethers.keccak256(ethers.toUtf8Bytes(result.cid));
      await Promise.allSettled([
        updateOrderVc(bundle.order.orderId, result.cid, vcHash),
        resolvedProductAddress ? updateVcCid(resolvedProductAddress, result.cid) : Promise.resolve(),
      ]);

      setSignedVrc(result.vrc);
      setArchiveResult(result);
      setStatusResult(await fetchVCStatusFromServer(result.cid));
    } catch (signError) {
      setError(signError.message || "Failed to sign/upload/archive ERC-7984 VRC.");
    } finally {
      setIsSigning(false);
    }
  }

  async function handleVerify() {
    setIsVerifying(true);
    setError("");

    try {
      const vcToVerify = signedVrc || draftVrc;
      if (!vcToVerify) {
        throw new Error("Build or sign a VRC before verifying.");
      }

      const result = await verifyVCWithServer(
        vcToVerify,
        bundle?.order?.escrowAddress || resolvedProductAddress || null
      );
      setVerificationResult(result);

      if (cid) {
        setStatusResult(await fetchVCStatusFromServer(cid));
      }
    } catch (verifyError) {
      setError(verifyError.message || "Failed to verify ERC-7984 VRC.");
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-800 p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.28em] text-cyan-200">ERC-7984 Spike</p>
              <h1 className="text-3xl font-semibold">Confidential VRC Workbench</h1>
              <p className="max-w-3xl text-sm text-slate-200">
                Build, sign, upload, archive, and verify the ERC-7984 `schemaVersion: "6.1"`
                commitment VRC from recovered order state. Proof generation stays local; this
                screen wires the current confirm-order payment-bridge and attestation payload shape into the real app.
              </p>
              {derivedSellerAddress && (
                <p className="text-xs text-cyan-100">
                  Seller signer required: <span className="font-mono">{derivedSellerAddress}</span>
                </p>
              )}
            </div>
            <Link
              to="/erc7984/actions"
              className="rounded-md border border-white/20 bg-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/20"
            >
              Back To Actions
            </Link>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {notice && !error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {notice}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">1. Load Commitment Bundle</h2>
            <p className="mt-1 text-sm text-slate-600">
              Pull the current order, bridge state, and listing metadata needed to build the commitment VRC.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Order ID</span>
                <input
                  value={orderIdInput}
                  onChange={(event) => setOrderIdInput(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                  placeholder="0x..."
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Product Address</span>
                <input
                  value={productAddressInput}
                  onChange={(event) => setProductAddressInput(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                  placeholder="0x... optional if recoverable from order"
                />
              </label>
            </div>

            <div className="mt-4">
              <Button onClick={handleLoadBundle} isLoading={isLoadingBundle}>
                Load Recovery Bundle
              </Button>
            </div>

            {bundle && (
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Order</div>
                  <div className="mt-2 text-sm text-slate-900">{bundle.order.orderId}</div>
                  <div className="mt-2 text-xs text-slate-600">Status: {bundle.order.status}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Metadata</div>
                  <div className="mt-2 text-sm text-slate-900">
                    {bundle.productMeta.productMeta?.productName || bundle.productMeta.productMeta?.name || "Unnamed product"}
                  </div>
                  <div className="mt-2 text-xs text-slate-600">
                    Unit price hash: {bundle.productMeta.unitPriceHash || "missing"}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Attestation</div>
                  <div className="mt-2 text-sm text-slate-900">
                    {bundle.attestation ? "Present" : "Missing"}
                  </div>
                  <div className="mt-2 text-xs text-slate-600">
                    Proof bundle: {bundle.attestation?.proofBundle ? "present" : "missing"}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">2. Commitment Controls</h2>
            <p className="mt-1 text-sm text-slate-600">
              Set the current confidential-settlement state to embed into the single pre-shipment commitment VRC.
            </p>

            <div className="mt-5 grid gap-4">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Payment Token</span>
                <input
                  value={derivedPaymentToken}
                  onChange={(event) => setPaymentTokenInput(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                  placeholder="0x... derived from escrow or metadata"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Buyer Deposit Tx Hash</span>
                <input
                  value={buyerDepositTxHashInput}
                  onChange={(event) => setBuyerDepositTxHashInput(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                  placeholder="0x... optional manual override if recovery data is missing"
                />
              </label>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Derived Escrow State
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Transporter</div>
                  <div className="mt-2 break-all font-mono text-xs text-slate-900">
                    {derivedTransporterAddress || "not-set"}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Seller Bond Equality</div>
                  <div className="mt-2 text-sm text-slate-900">{sellerBondAttestation.status}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Requested: {formatTimestamp(sellerBondAttestation.requestedAt)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Transporter Bond Equality
                  </div>
                  <div className="mt-2 text-sm text-slate-900">{transporterBondAttestation.status}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Requested: {formatTimestamp(transporterBondAttestation.requestedAt)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Payment Bridge</div>
                  <div className="mt-2 text-sm text-slate-900">{derivedPaymentBridgeStatus}</div>
                  <div className="mt-1 break-all font-mono text-[11px] text-slate-500">
                    {derivedBuyerDepositReference || "deposit reference unavailable"}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Funding Flags</div>
                  <div className="mt-2 text-xs text-slate-700">
                    Buyer: {escrowState?.hasBuyerDeposit ? "yes" : "no"}
                  </div>
                  <div className="mt-1 text-xs text-slate-700">
                    Seller bond: {escrowState?.hasSellerBondDeposit ? "yes" : "no"}
                  </div>
                  <div className="mt-1 text-xs text-slate-700">
                    Seller fee: {escrowState?.hasSellerDeliveryFeeDeposit ? "yes" : "no"}
                  </div>
                  <div className="mt-1 text-xs text-slate-700">
                    Transporter bond: {escrowState?.hasTransporterSecurityDeposit ? "yes" : "no"}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Escrow Phase</div>
                  <div className="mt-2 text-sm text-slate-900">
                    {escrowState ? String(escrowState.phase) : "unknown"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {provider ? "Read directly from the ERC-7984 escrow." : "Connect a wallet to read on-chain state."}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={handleBuildVrc} isLoading={isBuilding} disabled={!canBuild}>
                Build Commitment VRC
              </Button>
              <Button
                variant="secondary"
                onClick={handleSignUploadArchive}
                isLoading={isSigning}
                disabled={!canSign}
              >
                Sign, Upload, Archive Commitment VRC
              </Button>
              <Button
                variant="ghost"
                onClick={handleVerify}
                isLoading={isVerifying}
                disabled={!signedVrc}
              >
                Verify With Backend
              </Button>
            </div>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">VRC Preview</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Current draft or signed ERC-7984 commitment VRC JSON payload.
                </p>
              </div>
              {signedVrc && (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                  Signed
                </span>
              )}
            </div>
            <pre className="mt-4 max-h-[720px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
              {prettyJson(signedVrc || draftVrc || { note: "Build a VRC to preview it here." })}
            </pre>
          </section>

          <section className="space-y-6">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Archive Result</h2>
              <p className="mt-1 text-sm text-slate-600">
                Response returned by the archive path after IPFS upload.
              </p>
              <pre className="mt-4 max-h-80 overflow-auto rounded-xl bg-slate-100 p-4 text-xs text-slate-800">
                {prettyJson(
                  archiveResult || {
                    note: "No archive result yet.",
                  }
                )}
              </pre>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Verification / Status</h2>
              <p className="mt-1 text-sm text-slate-600">
                Backend verification output and current VC status row.
              </p>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Verify Result
                  </div>
                  <pre className="max-h-56 overflow-auto rounded-xl bg-slate-100 p-4 text-xs text-slate-800">
                    {prettyJson(verificationResult || { note: "Not verified yet." })}
                  </pre>
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    VC Status
                  </div>
                  <pre className="max-h-56 overflow-auto rounded-xl bg-slate-100 p-4 text-xs text-slate-800">
                    {prettyJson(
                      statusResult || {
                        note: cid
                          ? "Status not fetched yet."
                          : "Sign and archive a VRC to fetch status.",
                      }
                    )}
                  </pre>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
