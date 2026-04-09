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
  const unitPriceWei = String(productMeta?.unitPriceWei || listingMeta.unitPriceWei || "").trim();
  const paymentToken = product?.paymentToken || listingMeta.paymentToken || "";
  const productId = listingMeta.productId || "";

  const [quantityInput, setQuantityInput] = useState("1");
  const [fundAmountInput, setFundAmountInput] = useState("");
  const [privateBalance, setPrivateBalance] = useState(null);
  const [latestOrder, setLatestOrder] = useState(null);
  const [buyLoading, setBuyLoading] = useState(false);
  const [fundingRefreshTrigger, setFundingRefreshTrigger] = useState(0);

  const quantityValue = quantityInput.trim();
  const derivedPayment = useMemo(() => {
    if (!/^\d+$/.test(quantityValue) || !/^\d+$/.test(unitPriceWei)) {
      return "";
    }
    try {
      return (BigInt(quantityValue) * BigInt(unitPriceWei)).toString();
    } catch {
      return "";
    }
  }, [quantityValue, unitPriceWei]);
  const unitPriceDisplay = useMemo(
    () => formatTokenAmount(unitPriceWei, { symbol: "WETH", fallback: "not-set" }),
    [unitPriceWei]
  );
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

  async function handleConfidentialPurchase() {
    if (!provider || !currentUser || !paymentToken || !unitPriceWei || !derivedPayment) return;
    if (!/^\d+$/.test(quantityValue) || BigInt(quantityValue) <= 0n) {
      toast.error("Enter a valid whole-number private quantity.");
      return;
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

      await getBrowserFhevmInstance(provider);
      const { handle, inputProof } = await encryptUint64ForContract({
        provider,
        contractAddress: paymentToken,
        userAddress: buyerAddress,
        value: depositAmount,
      });

      const token = new Contract(paymentToken, CONFIDENTIAL_TOKEN_ABI, signer);
      const payload = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "uint8"],
        [orderId, DEPOSIT_KIND_BUYER_PURCHASE]
      );
      const tx = await token["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
        address,
        handle,
        inputProof,
        payload
      );
      const receipt = await tx.wait();

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
        unitPriceWei,
        unitPriceHash: product?.unitPriceHash || listingMeta.unitPriceHash || "",
        buyerAmount: depositAmount.toString(),
        buyerQuantity: quantityValue,
        depositTxHash: receipt.hash,
      });

      const refreshedState = await readProductEscrowState(provider, address);
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
        unitPriceWei,
        unitPriceHash: refreshedState.unitPriceHash || product?.unitPriceHash || "",
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

      setLatestOrder(
        await getLatestOrderForProductBuyer(address, buyerAddress)
      );
      setFundingRefreshTrigger((value) => value + 1);
      toast.success("Confidential order deposit recorded.");
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

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <div>Public unit price: {unitPriceDisplay}</div>
          <div className="mt-1">
            Derived confidential payment: {derivedPaymentDisplay}
          </div>
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
