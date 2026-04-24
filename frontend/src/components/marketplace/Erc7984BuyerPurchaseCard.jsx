import React, { useEffect, useMemo, useState } from "react";
import { Contract, ethers } from "ethers";
import toast from "react-hot-toast";
import { Button } from "../ui/button";
import { encryptUint64ForContract, getBrowserFhevmInstance } from "../../utils/erc7984/fhevmClient";
import { generateOrderId } from "../../utils/commitmentUtils";
import { buildDepositReference } from "../../utils/erc7984/paymentBridgeModel";
import { generateBuyerPaymentBridgeSidecar } from "../../utils/erc7984/paymentBridgeSidecar";
import { saveErc7984OrderSnapshot } from "../../utils/erc7984/orderSnapshotApi";
import { getLatestOrderForProductBuyer } from "../../utils/orderApi";
import { readProductEscrowState } from "../../utils/erc7984/escrowState";
import { formatTokenAmount, formatTokenInputValue } from "../../utils/tokenDisplay";
import Erc7984FundingCard from "./Erc7984FundingCard";
import { loadErc7984DeploymentConfig } from "../../utils/erc7984Deployment";

const CONFIDENTIAL_TOKEN_ABI = [
  "function confidentialBalanceOf(address account) view returns (bytes32)",
  "function confidentialTransferAndCall(address to, bytes32 handle, bytes inputProof, bytes data)",
];

const DEPOSIT_KIND_BUYER_PURCHASE = 0;

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

function normalizeStoredValue(value) {
  return value == null ? "" : String(value).trim();
}

function normalizeStoredHex(value) {
  const normalized = normalizeStoredValue(value);
  if (!normalized) return "";
  return normalized.startsWith("0x") ? normalized : `0x${normalized}`;
}

async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${ms / 1000}s.`));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default function Erc7984BuyerPurchaseCard({
  address,
  product,
  productMeta,
  provider,
  currentUser,
  role,
  onPurchaseComplete,
}) {
  const listingMeta = productMeta?.productMeta || {};
  const priceVisibility = listingMeta.priceVisibility || "public";
  const paymentToken = product?.paymentToken || listingMeta.paymentToken || "";
  const productId = listingMeta.productId || "";
  const publicUnitPriceWei = String(productMeta?.unitPriceWei || listingMeta.unitPriceWei || "").trim();
  const productPriceCommitment =
    String(product?.priceCommitment || listingMeta.priceCommitment || listingMeta.unitPriceHash || "").trim();

  const [quantityInput, setQuantityInput] = useState("1");
  const [fundAmountInput, setFundAmountInput] = useState("");
  const [privateBalance, setPrivateBalance] = useState(null);
  const [latestOrder, setLatestOrder] = useState(null);
  const [buyLoading, setBuyLoading] = useState(false);
  const [fundingRefreshTrigger, setFundingRefreshTrigger] = useState(0);
  const [privatePriceInput, setPrivatePriceInput] = useState("");
  const [privatePriceBlindingInput, setPrivatePriceBlindingInput] = useState("");
  const [deploymentConfig, setDeploymentConfig] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadConfig() {
      const nextConfig = await loadErc7984DeploymentConfig();
      if (!cancelled) {
        setDeploymentConfig(nextConfig);
      }
    }
    loadConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  const quantityValue = quantityInput.trim();
  const effectiveUnitPriceWei =
    priceVisibility === "private" ? privatePriceInput.trim() : publicUnitPriceWei;

  const derivedPayment = useMemo(() => {
    if (!/^\d+$/.test(quantityValue) || !/^\d+$/.test(effectiveUnitPriceWei)) {
      return "";
    }
    try {
      return (BigInt(quantityValue) * BigInt(effectiveUnitPriceWei)).toString();
    } catch {
      return "";
    }
  }, [quantityValue, effectiveUnitPriceWei]);

  const unitPriceDisplay = useMemo(() => {
    if (priceVisibility === "private") {
      return effectiveUnitPriceWei
        ? formatTokenAmount(effectiveUnitPriceWei, { symbol: "WETH", fallback: "private" })
        : "Private";
    }
    return formatTokenAmount(publicUnitPriceWei, { symbol: "WETH", fallback: "not-set" });
  }, [effectiveUnitPriceWei, priceVisibility, publicUnitPriceWei]);

  const selectedPaymentToken = String(paymentToken || "").trim().toLowerCase();
  const activeDeploymentToken = String(deploymentConfig?.confidentialToken || "").trim().toLowerCase();
  const hasTokenMismatch =
    Boolean(selectedPaymentToken) &&
    Boolean(activeDeploymentToken) &&
    selectedPaymentToken !== activeDeploymentToken;

  const derivedPaymentDisplay = useMemo(
    () => formatTokenAmount(derivedPayment, { symbol: "WETH", fallback: "not-set" }),
    [derivedPayment]
  );

  useEffect(() => {
    setFundAmountInput(derivedPayment ? formatTokenInputValue(derivedPayment) : "");
  }, [derivedPayment]);

  useEffect(() => {
    let cancelled = false;

    async function loadLatestOrder() {
      if (!currentUser || !address) {
        setLatestOrder(null);
        return;
      }
      const row = await getLatestOrderForProductBuyer(address, currentUser);
      if (!cancelled) {
        setLatestOrder(row);
      }
    }

    loadLatestOrder();
    return () => {
      cancelled = true;
    };
  }, [address, currentUser]);

  useEffect(() => {
    if (priceVisibility !== "private" || !address) {
      setPrivatePriceInput("");
      setPrivatePriceBlindingInput("");
      return;
    }

    const normalizedAddress = String(address).trim().toLowerCase();
    const localPrice = localStorage.getItem(`privatePriceWei_${normalizedAddress}`) || "";
    const localBlinding = localStorage.getItem(`priceCommitmentBlinding_${normalizedAddress}`) || "";

    setPrivatePriceInput(localPrice);
    setPrivatePriceBlindingInput(localBlinding ? normalizeStoredHex(localBlinding) : "");
  }, [address, priceVisibility]);

  async function handleConfidentialPurchase() {
    if (!provider || !currentUser || !paymentToken || !derivedPayment) return;
    if (hasTokenMismatch) {
      toast.error(
        "Selected product uses a different confidential token than the active deployment config. Use a product from the latest deployment or switch config."
      );
      return;
    }
    if (!/^\d+$/.test(quantityValue) || BigInt(quantityValue) <= 0n) {
      toast.error("Enter a valid whole-number private quantity.");
      return;
    }
    if (priceVisibility === "public" && !publicUnitPriceWei) {
      toast.error("Public unit price is missing on this listing.");
      return;
    }
    if (priceVisibility === "private") {
      if (!/^\d+$/.test(privatePriceInput.trim())) {
        toast.error("Enter the seller-shared private unit price.");
        return;
      }
      if (!/^0x[0-9a-fA-F]{64}$/.test(normalizeStoredHex(privatePriceBlindingInput))) {
        toast.error("Enter the seller-shared 32-byte price blinding hex.");
        return;
      }
      if (!productPriceCommitment) {
        toast.error("This private-price listing is missing its on-chain price commitment.");
        return;
      }
    }

    setBuyLoading(true);
    try {
      const signer = await provider.getSigner();
      const buyerAddress = (await signer.getAddress()).toLowerCase();
      const orderId =
        product?.activeOrderId && product.activeOrderId !== ethers.ZeroHash
          ? product.activeOrderId
          : generateOrderId();
      const depositAmount = BigInt(derivedPayment);
      const availablePrivateBalance = BigInt(privateBalance || "0");

      if (availablePrivateBalance < depositAmount) {
        throw new Error(
          `Insufficient private balance. Required ${depositAmount.toString()}, available ${availablePrivateBalance.toString()}.`
        );
      }

      await withTimeout(
        getBrowserFhevmInstance(provider),
        45000,
        "FHEVM initialization"
      );
      const { handle, inputProof } = await withTimeout(
        encryptUint64ForContract({
          provider,
          contractAddress: paymentToken,
          userAddress: buyerAddress,
          value: depositAmount,
        }),
        60000,
        "FHE encryption"
      );

      const token = new Contract(paymentToken, CONFIDENTIAL_TOKEN_ABI, signer);
      const payload = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "uint8"],
        [orderId, DEPOSIT_KIND_BUYER_PURCHASE]
      );
      const tx = await withTimeout(
        token["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
          address,
          handle,
          inputProof,
          payload
        ),
        120000,
        "Wallet transaction submission"
      );
      const receipt = await withTimeout(
        tx.wait(),
        180000,
        "Transaction confirmation"
      );

      const depositReference = buildDepositReference({
        depositTxHash: receipt.hash,
        orderId,
        depositKind: "BuyerPurchase",
        paymentToken,
        escrowAddress: address,
        buyerAddress,
      });

      const network = await provider.getNetwork();
      const bridgeSidecar = await generateBuyerPaymentBridgeSidecar({
        chainId: String(network.chainId),
        orderId,
        productId,
        productAddress: address,
        paymentToken,
        buyerAddress,
        sellerAddress: product?.sellerAddress || "",
        transporterAddress: product?.transporterAddress || "",
        unitPriceWei: publicUnitPriceWei,
        unitPriceHash: product?.unitPriceHash || listingMeta.unitPriceHash || "",
        buyerAmount: depositAmount.toString(),
        buyerQuantity: quantityValue,
        depositTxHash: receipt.hash,
        priceVisibility,
        priceCommitment: productPriceCommitment,
        priceWitnessWei: privatePriceInput.trim(),
        priceBlindingHex: normalizeStoredHex(privatePriceBlindingInput),
      });

      const refreshedState = await readProductEscrowState(provider, address);
      const storedUnitPriceHash =
        priceVisibility === "private"
          ? refreshedState.priceCommitment || productPriceCommitment || ""
          : refreshedState.unitPriceHash || product?.unitPriceHash || listingMeta.unitPriceHash || "";

      await saveErc7984OrderSnapshot({
        orderId,
        productAddress: address,
        escrowAddress: address,
        productId: String(productId || ""),
        chainId: String(network.chainId),
        sellerAddress: refreshedState.sellerAddress || product?.sellerAddress || "",
        buyerAddress: refreshedState.buyerAddress || buyerAddress,
        transporterAddress: refreshedState.transporterAddress || null,
        status: mapPhaseToOrderStatus(refreshedState.phase),
        phase: Number(refreshedState.phase),
        delivered: Boolean(refreshedState.delivered),
        unitPriceWei: priceVisibility === "public" ? publicUnitPriceWei : "",
        unitPriceHash: storedUnitPriceHash,
        paymentToken,
        contextHash: bridgeSidecar.contextHash,
        buyerDepositTxHash: receipt.hash,
        buyerDepositReference: depositReference,
        sellerBondAttestation: refreshedState.sellerBondAttestation || null,
        transporterBondAttestation: refreshedState.transporterBondAttestation || null,
        quantityCommitment: bridgeSidecar.quantityCommitment,
        quantityProof: bridgeSidecar.quantityProof,
        totalCommitment: bridgeSidecar.totalCommitment,
        totalProof: bridgeSidecar.totalProof,
        paymentCommitment: bridgeSidecar.paymentCommitment,
        paymentProof: bridgeSidecar.paymentProof,
      });

      setLatestOrder(await getLatestOrderForProductBuyer(address, buyerAddress));
      setFundingRefreshTrigger((value) => value + 1);
      toast.success(
        priceVisibility === "private"
          ? "Private-price confidential order deposit recorded."
          : "Confidential order deposit recorded."
      );
      await onPurchaseComplete?.();
    } catch (error) {
      toast.error(error.message || "Failed to place confidential order.");
    } finally {
      setBuyLoading(false);
    }
  }

  const isBuyerSurface =
    role === "buyer" || (role === "visitor" && Number(product?.phase) === 0);

  if (!isBuyerSurface) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Confidential Purchase</h2>
      <p className="mt-2 text-sm text-slate-600">
        Buy from the marketplace using private balance. Public WETH can be moved into a
        confidential balance 1:1 before the order deposit.
      </p>

      <div className="mt-5 grid gap-4">
        {hasTokenMismatch ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            <div className="font-medium">Deployment mismatch detected</div>
            <p className="mt-2">
              This product was deployed with a different confidential token than the currently active deployment config.
              Funding and purchase calls are targeting different token contracts.
            </p>
            <div className="mt-2 break-all">
              <strong>Product token:</strong> {paymentToken || "missing"}
            </div>
            <div className="mt-1 break-all">
              <strong>Active deployment token:</strong> {deploymentConfig?.confidentialToken || "missing"}
            </div>
          </div>
        ) : null}

        <Erc7984FundingCard
          provider={provider}
          currentUser={currentUser}
          amountInput={fundAmountInput}
          onAmountInputChange={setFundAmountInput}
          amountPlaceholder="0.002"
          refreshTrigger={fundingRefreshTrigger}
          onBalancesChange={({ privateBalance: nextPrivate }) => {
            setPrivateBalance(nextPrivate);
          }}
        />

        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Private Quantity
          </div>
          <input
            value={quantityInput}
            onChange={(event) => setQuantityInput(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
            placeholder="1"
          />
        </div>

        {priceVisibility === "private" ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-medium">Private Price Package</div>
            <p className="mt-2 text-sm">
              For private-price listings, the seller must share the agreed price and its commitment
              opening off-chain with the buyer. The app rechecks that package against the on-chain
              price commitment before generating the Bulletproof buyer sidecar.
            </p>
            <div className="mt-3 break-all">
              <strong>On-chain price commitment:</strong> {productPriceCommitment || "missing"}
            </div>

            <div className="mt-4">
              <div className="text-xs font-medium uppercase tracking-wide text-amber-800">
                Seller-shared unit price
              </div>
              <input
                value={privatePriceInput}
                onChange={(event) => setPrivatePriceInput(event.target.value)}
                className="mt-2 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                placeholder="600000000000000"
              />
            </div>

            <div className="mt-4">
              <div className="text-xs font-medium uppercase tracking-wide text-amber-800">
                Seller-shared price blinding
              </div>
              <input
                value={privatePriceBlindingInput}
                onChange={(event) => setPrivatePriceBlindingInput(event.target.value)}
                className="mt-2 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                placeholder="0x..."
              />
            </div>
          </div>
        ) : null}

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <div>
            {priceVisibility === "private" ? "Agreed private unit price" : "Public unit price"}:{" "}
            {unitPriceDisplay}
          </div>
          <div className="mt-1">
            Derived confidential payment: {derivedPaymentDisplay}
          </div>
          {priceVisibility === "private" ? (
            <div className="mt-1">
              Proof family: <strong>{listingMeta.proofFamily || "bulletproof"}</strong>
            </div>
          ) : null}
        </div>

        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Purchase Summary
          </div>
          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            Move at least <strong>{derivedPaymentDisplay}</strong> into private balance, then
            submit the confidential order.
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleConfidentialPurchase}
            disabled={!derivedPayment || buyLoading}
            isLoading={buyLoading}
          >
            Submit Confidential Order
          </Button>
        </div>
      </div>

      {latestOrder && (
        <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <div className="font-medium">Latest Buyer Order</div>
          <div className="mt-2 break-all">
            <strong>Order ID:</strong> {latestOrder.orderId}
          </div>
          <div className="mt-1">
            <strong>Status:</strong> {latestOrder.status}
          </div>
          <div className="mt-1">
            <strong>Phase:</strong> {latestOrder.phase}
          </div>
        </div>
      )}
    </div>
  );
}
