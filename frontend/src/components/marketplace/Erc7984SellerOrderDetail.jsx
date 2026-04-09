import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Contract, ethers } from "ethers";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Button } from "../ui/button";
import { readProductEscrowState } from "../../utils/erc7984/escrowState";
import { getProductMeta, updateVcCid } from "../../utils/productMetaApi";
import { getOrder, updateOrderVc } from "../../utils/orderApi";
import { encryptUint64ForContract, getBrowserFhevmInstance, publicDecryptHandle } from "../../utils/erc7984/fhevmClient";
import { saveErc7984OrderSnapshot } from "../../utils/erc7984/orderSnapshotApi";
import { buildErc7984OrderVrcFromRecovery, signUploadArchiveErc7984OrderVrc } from "../../utils/erc7984/vrcFlow";
import { formatTokenAmount, formatTokenInputValue, parseTokenAmountInput } from "../../utils/tokenDisplay";
import Erc7984FundingCard from "./Erc7984FundingCard";

const ACTION_ESCROW_ABI = [
  "function confirmOrderById(bytes32 orderId, string vcCID)",
  "function getAllTransporters() view returns (address[] addrs, uint256[] fees)",
  "function setTransporter(address transporter)",
  "function finalizeEqualityAttestation(bytes32 orderId, uint8 target, bytes abiEncodedCleartexts, bytes decryptionProof)",
];

const CONFIDENTIAL_TOKEN_ABI = [
  "function confidentialBalanceOf(address account) view returns (bytes32)",
  "function confidentialTransferAndCall(address to, bytes32 handle, bytes inputProof, bytes data)",
];

const DEPOSIT_KIND_SELLER_BOND = 1;
const DEPOSIT_KIND_SELLER_DELIVERY_FEE = 2;
const EQUALITY_TARGET_SELLER_BOND = 0;

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
  return value ? String(value).trim().toLowerCase() : "";
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

function deriveRequiredBondAmount(orderRow) {
  const explicitPaymentValue = orderRow?.paymentProof?.value;
  const explicitTotalValue = orderRow?.totalProof?.value;
  const explicitUnitPrice = orderRow?.unitPriceWei;
  const explicitQuantity = orderRow?.quantityProof?.quantity;

  if (explicitPaymentValue && /^\d+$/.test(String(explicitPaymentValue))) {
    return String(explicitPaymentValue);
  }
  if (explicitTotalValue && /^\d+$/.test(String(explicitTotalValue))) {
    return String(explicitTotalValue);
  }
  if (
    explicitUnitPrice &&
    explicitQuantity &&
    /^\d+$/.test(String(explicitUnitPrice)) &&
    /^\d+$/.test(String(explicitQuantity))
  ) {
    return (BigInt(explicitUnitPrice) * BigInt(explicitQuantity)).toString();
  }
  return "";
}

export default function Erc7984SellerOrderDetail({ provider, currentUser }) {
  const { address } = useParams();
  const navigate = useNavigate();
  const [escrowState, setEscrowState] = useState(null);
  const [productMetaRow, setProductMetaRow] = useState(null);
  const [orderRow, setOrderRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [publicBalance, setPublicBalance] = useState(null);
  const [privateBalance, setPrivateBalance] = useState(null);
  const [sellerBondAmountInput, setSellerBondAmountInput] = useState("");
  const [deliveryFeeAmountInput, setDeliveryFeeAmountInput] = useState("");
  const [bidRows, setBidRows] = useState([]);
  const [selectedTransporterInput, setSelectedTransporterInput] = useState("");
  const [fundingRefreshTrigger, setFundingRefreshTrigger] = useState(0);

  const requiredBondAmount = useMemo(() => deriveRequiredBondAmount(orderRow), [orderRow]);
  const isSeller = normalizeAddress(currentUser) === normalizeAddress(escrowState?.sellerAddress);
  const activeOrderId =
    escrowState?.activeOrderId && escrowState.activeOrderId !== ethers.ZeroHash
      ? escrowState.activeOrderId
      : "";
  const sellerEqualityStatus = escrowState?.sellerBondAttestation?.status || "none";
  const isSellerBondReady = sellerEqualityStatus === "verified_true";

  const loadDetail = useCallback(async () => {
    if (!provider || !address) return;
    try {
      setLoading(true);
      setError("");
      const [nextState, nextMetaRow] = await Promise.all([
        readProductEscrowState(provider, address),
        getProductMeta(address),
      ]);
      const actionContract = new Contract(address, ACTION_ESCROW_ABI, provider);
      const nextOrder =
        nextState.activeOrderId && nextState.activeOrderId !== ethers.ZeroHash
          ? await getOrder(nextState.activeOrderId)
          : null;
      const [transporterAddresses, transporterFees] =
        await actionContract.getAllTransporters().catch(() => [[], []]);
      const nextBidRows = Array.from(transporterAddresses || []).map((transporterAddress, index) => ({
        address: normalizeAddress(transporterAddress),
        fee: transporterFees?.[index]?.toString?.() || "0",
      }));

      setEscrowState(nextState);
      setProductMetaRow(nextMetaRow);
      setOrderRow(nextOrder);
      setBidRows(nextBidRows.filter((row) => row.address));
      if (nextOrder) {
        setSellerBondAmountInput((previous) => previous || formatTokenInputValue(deriveRequiredBondAmount(nextOrder)));
      }
      setSelectedTransporterInput((previous) => {
        if (previous) return previous;
        if (nextState.transporterAddress) return nextState.transporterAddress;
        return nextBidRows.find((row) => row.address)?.address || "";
      });
      setDeliveryFeeAmountInput((previous) => {
        if (previous) return previous;
        const selectedTransporter =
          nextState.transporterAddress || nextBidRows.find((row) => row.address)?.address || "";
        const selectedBid = nextBidRows.find((row) => row.address === selectedTransporter);
        return selectedBid?.fee ? formatTokenInputValue(selectedBid.fee) : "";
      });
    } catch (detailError) {
      setError(detailError.message || "Failed to load seller order.");
    } finally {
      setLoading(false);
    }
  }, [address, provider]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  async function persistSnapshot(state, overrides = {}) {
    if (!state || !orderRow) return;
    const network = await provider.getNetwork();
    await saveErc7984OrderSnapshot({
      orderId: orderRow.orderId,
      productAddress: address,
      escrowAddress: address,
      productId: String(orderRow.productId || productMetaRow?.productMeta?.productId || ""),
      chainId: String(network.chainId),
      sellerAddress: state.sellerAddress || "",
      buyerAddress: state.buyerAddress || null,
      transporterAddress: state.transporterAddress || null,
      status: mapPhaseToOrderStatus(state.phase),
      phase: Number(state.phase),
      delivered: Boolean(state.delivered),
      unitPriceWei: orderRow.unitPriceWei || productMetaRow?.unitPriceWei || "",
      unitPriceHash: state.unitPriceHash || orderRow.unitPriceHash || "",
      paymentToken: state.paymentToken || null,
      contextHash: overrides.contextHash ?? orderRow.contextHash ?? null,
      buyerDepositTxHash: orderRow.buyerDepositTxHash || null,
      buyerDepositReference: orderRow.buyerDepositReference || null,
      sellerBondAttestation: state.sellerBondAttestation || null,
      transporterBondAttestation: state.transporterBondAttestation || null,
      quantityCommitment: orderRow.quantityCommitment || null,
      quantityProof: orderRow.quantityProof || null,
      totalCommitment: orderRow.totalCommitment || null,
      totalProof: orderRow.totalProof || null,
      paymentCommitment: orderRow.paymentCommitment || null,
      paymentProof: orderRow.paymentProof || null,
      orderVcCid: overrides.orderVcCid ?? orderRow.orderVcCid ?? null,
      orderVcHash: overrides.orderVcHash ?? orderRow.orderVcHash ?? null,
    });
  }

  async function finalizeSellerEqualityStep(attestationHandle) {
    if (!provider || !activeOrderId || !attestationHandle) {
      throw new Error("Seller equality handle is not available yet.");
    }

    const signer = await provider.getSigner();
    const contract = new Contract(address, ACTION_ESCROW_ABI, signer);
    const decrypted = await publicDecryptHandle({
      provider,
      handle: attestationHandle,
    });
    const tx = await contract.finalizeEqualityAttestation(
      activeOrderId,
      EQUALITY_TARGET_SELLER_BOND,
      decrypted.abiEncodedClearValues,
      decrypted.decryptionProof
    );
    await tx.wait();

    const refreshedState = await readProductEscrowState(provider, address);
    await persistSnapshot(refreshedState);
    return refreshedState;
  }

  async function handlePrepareSellerBond() {
    if (!provider || !escrowState?.paymentToken || !activeOrderId) {
      return;
    }

    setPendingAction("prepare-seller-bond");
    try {
      const signer = await provider.getSigner();
      const sellerAddress = normalizeAddress(await signer.getAddress());
      const depositAmount = parseTokenAmountInput(
        sellerBondAmountInput || formatTokenInputValue(requiredBondAmount) || "",
        { label: "Seller bond amount" }
      );

      if (normalizeAddress(escrowState.sellerAddress) !== sellerAddress) {
        throw new Error("Switch MetaMask to the seller wallet.");
      }
      if (depositAmount <= 0n) {
        throw new Error("Seller bond amount must be positive.");
      }
      if (privateBalance != null && BigInt(privateBalance) < depositAmount) {
        throw new Error("Insufficient private balance for seller bond.");
      }

      if (!escrowState?.hasSellerBondDeposit) {
        await getBrowserFhevmInstance(provider);
        const { handle, inputProof } = await encryptUint64ForContract({
          provider,
          contractAddress: escrowState.paymentToken,
          userAddress: sellerAddress,
          value: depositAmount,
        });

        const payload = ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "uint8"],
          [activeOrderId, DEPOSIT_KIND_SELLER_BOND]
        );
        const token = new Contract(escrowState.paymentToken, CONFIDENTIAL_TOKEN_ABI, signer);
        const tx = await token["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
          address,
          handle,
          inputProof,
          payload
        );
        await tx.wait();
      }

      let refreshedState = await readProductEscrowState(provider, address);
      await persistSnapshot(refreshedState);
      setFundingRefreshTrigger((value) => value + 1);

      if (
        refreshedState?.sellerBondAttestation?.status === "pending" &&
        refreshedState?.sellerBondAttestation?.handle
      ) {
        refreshedState = await finalizeSellerEqualityStep(
          refreshedState.sellerBondAttestation.handle
        );
      }

      await loadDetail();
      toast.success("Seller bond deposited and equality verified.");
    } catch (actionError) {
      toast.error(actionError.message || "Failed to prepare seller bond.");
    } finally {
      setPendingAction("");
    }
  }

  async function handleConfirmOrder() {
    if (!provider || !activeOrderId || !orderRow || !productMetaRow || !escrowState) return;
    setPendingAction("confirm-order");
    try {
      const signer = await provider.getSigner();
      const signerAddress = normalizeAddress(await signer.getAddress());
      if (signerAddress !== normalizeAddress(escrowState.sellerAddress)) {
        throw new Error("Switch MetaMask to the seller wallet.");
      }
      if (escrowState?.sellerBondAttestation?.status !== "verified_true") {
        throw new Error("Seller equality must be verified before confirming the order.");
      }

      const productMeta = buildProductMetaForCommitmentVrc(
        productMetaRow,
        orderRow,
        escrowState.paymentToken || ""
      );
      const commitmentVrc = buildErc7984OrderVrcFromRecovery({
        sellerAddress: normalizeAddress(escrowState.sellerAddress),
        buyerAddress: normalizeAddress(escrowState.buyerAddress),
        productAddress: address,
        productMeta,
        order: orderRow,
        attestation: null,
        paymentToken: escrowState.paymentToken || "",
        buyerDepositTxHash: orderRow.buyerDepositTxHash || null,
        buyerDepositReference: orderRow.buyerDepositReference || null,
        sellerBondAttestation: escrowState.sellerBondAttestation || null,
      });

      const archiveResult = await signUploadArchiveErc7984OrderVrc({
        vrc: commitmentVrc,
        signer,
        contractAddress: orderRow.escrowAddress || address,
        archiveSource: "frontend-commitment-upload",
      });
      const cid = archiveResult.cid;
      const vcHash = ethers.keccak256(ethers.toUtf8Bytes(cid));
      const contract = new Contract(address, ACTION_ESCROW_ABI, signer);
      const tx = await contract.confirmOrderById(activeOrderId, cid);
      await tx.wait();

      await Promise.allSettled([
        updateOrderVc(activeOrderId, cid, vcHash),
        updateVcCid(address, cid),
      ]);

      const refreshedState = await readProductEscrowState(provider, address);
      await persistSnapshot(refreshedState, {
        orderVcCid: cid,
        orderVcHash: vcHash,
      });
      await loadDetail();
      toast.success("Order confirmed and commitment VRC bound on-chain.");
    } catch (actionError) {
      toast.error(actionError.message || "Failed to confirm order.");
    } finally {
      setPendingAction("");
    }
  }

  async function handleDepositSellerDeliveryFee() {
    if (!provider || !escrowState?.paymentToken || !activeOrderId) return;
    setPendingAction("seller-delivery-fee");
    try {
      const signer = await provider.getSigner();
      const sellerAddress = normalizeAddress(await signer.getAddress());
      const depositAmount = parseTokenAmountInput(deliveryFeeAmountInput || "", {
        label: "Delivery fee amount",
      });

      if (normalizeAddress(escrowState.sellerAddress) !== sellerAddress) {
        throw new Error("Switch MetaMask to the seller wallet.");
      }
      if (Number(escrowState.phase) !== 3) {
        throw new Error("Select a transporter first. Delivery-fee funding opens after the job is bound.");
      }
      if (!normalizeAddress(escrowState.transporterAddress)) {
        throw new Error("Select a transporter first.");
      }
      if (depositAmount <= 0n) {
        throw new Error("Delivery fee amount must be positive.");
      }
      if (privateBalance != null && BigInt(privateBalance) < depositAmount) {
        throw new Error("Insufficient private balance for seller delivery fee.");
      }

      await getBrowserFhevmInstance(provider);
      const { handle, inputProof } = await encryptUint64ForContract({
        provider,
        contractAddress: escrowState.paymentToken,
        userAddress: sellerAddress,
        value: depositAmount,
      });

      const payload = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "uint8"],
        [activeOrderId, DEPOSIT_KIND_SELLER_DELIVERY_FEE]
      );
      const token = new Contract(escrowState.paymentToken, CONFIDENTIAL_TOKEN_ABI, signer);
      const tx = await token["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
        address,
        handle,
        inputProof,
        payload
      );
      await tx.wait();

      const refreshedState = await readProductEscrowState(provider, address);
      await persistSnapshot(refreshedState);
      setFundingRefreshTrigger((value) => value + 1);
      await loadDetail();
      toast.success("Seller delivery fee deposited.");
    } catch (actionError) {
      toast.error(actionError.message || "Failed to deposit seller delivery fee.");
    } finally {
      setPendingAction("");
    }
  }

  async function handleSelectTransporter() {
    if (!provider) return;
    setPendingAction("select-transporter");
    try {
      const signer = await provider.getSigner();
      const sellerAddress = normalizeAddress(await signer.getAddress());
      const transporterAddress = normalizeAddress(selectedTransporterInput);

      if (normalizeAddress(escrowState?.sellerAddress) !== sellerAddress) {
        throw new Error("Switch MetaMask to the seller wallet.");
      }
      if (!ethers.isAddress(transporterAddress)) {
        throw new Error("Enter a valid transporter address.");
      }
      if (!bidRows.some((bid) => bid.address === transporterAddress)) {
        throw new Error("Choose a transporter from the current bids list.");
      }

      const contract = new Contract(address, ACTION_ESCROW_ABI, signer);
      const tx = await contract.setTransporter(transporterAddress);
      await tx.wait();

      const refreshedState = await readProductEscrowState(provider, address);
      await persistSnapshot(refreshedState);
      await loadDetail();
      toast.success("Transporter selected.");
    } catch (actionError) {
      toast.error(actionError.message || "Failed to select transporter.");
    } finally {
      setPendingAction("");
    }
  }

  if (loading) {
    return <div className="max-w-5xl mx-auto px-4 py-8 text-slate-500">Loading seller order...</div>;
  }

  if (error) {
    return <div className="max-w-5xl mx-auto px-4 py-8 text-red-600">{error}</div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-amber-700">Seller Dashboard</div>
          <h1 className="text-3xl font-semibold text-slate-900">
            {productMetaRow?.productMeta?.productName || escrowState?.name || "Seller Order"}
          </h1>
          <p className="mt-2 text-sm text-slate-600 break-all">
            Product: {address}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => navigate("/seller/orders")} variant="ghost">
            Back To Seller Orders
          </Button>
          <Button onClick={() => navigate(`/product/${address}`)} variant="ghost">
            View Product Page
          </Button>
        </div>
      </div>

      {!isSeller ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          This page is seller-facing. Switch MetaMask to the seller wallet for this listing.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Order Summary</h2>
            <div className="mt-4 grid gap-3 text-sm text-slate-700">
              <div><strong>Active order:</strong> {activeOrderId || "Not created yet"}</div>
              <div><strong>Buyer:</strong> {escrowState?.buyerAddress || "Not set"}</div>
              <div><strong>Stage:</strong> {Number(escrowState?.phase) === 1 ? "Purchased" : Number(escrowState?.phase) === 2 ? "Order Confirmed" : Number(escrowState?.phase) === 3 ? "In Delivery" : Number(escrowState?.phase) === 4 ? "Delivered" : "Listed"}</div>
              <div>
                <strong>Required seller bond:</strong>{" "}
                {requiredBondAmount
                  ? formatTokenAmount(requiredBondAmount, { symbol: "WETH" })
                  : "not-derived-yet"}
              </div>
              <div>
                <strong>Private balance:</strong>{" "}
                {privateBalance == null
                  ? "loading..."
                  : formatTokenAmount(privateBalance, { symbol: "WETH", fallback: "0 WETH" })}
              </div>
              <div>
                <strong>Public balance:</strong>{" "}
                {publicBalance == null
                  ? "loading..."
                  : formatTokenAmount(publicBalance, { symbol: "WETH", fallback: "0 WETH" })}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Seller Bond</h2>
            <p className="mt-2 text-sm text-slate-600">
              Keep private balance separate from the seller-bond action. Move funds into private
              balance when you want, then deposit the bond and let the page finalize equality
              automatically.
            </p>

            <div className="mt-4 grid gap-4">
              <Erc7984FundingCard
                provider={provider}
                currentUser={currentUser}
                title="Seller Wallet Funding"
                description="Private balance is reusable across seller actions. Fund it here first, then use it for seller bond and later delivery fee deposits."
                amountInput={formatTokenInputValue(requiredBondAmount)}
                onAmountInputChange={() => {}}
                amountPlaceholder="0.002"
                refreshTrigger={fundingRefreshTrigger}
                onBalancesChange={({ publicBalance: nextPublic, privateBalance: nextPrivate }) => {
                  setPublicBalance(nextPublic);
                  setPrivateBalance(nextPrivate);
                }}
              />

              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Seller Bond Amount
                </div>
                <input
                  value={sellerBondAmountInput}
                  onChange={(event) => setSellerBondAmountInput(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                  placeholder={requiredBondAmount ? formatTokenInputValue(requiredBondAmount) : "0.002"}
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={handlePrepareSellerBond}
                  disabled={
                    !isSeller ||
                    Number(escrowState?.phase) !== 1 ||
                    pendingAction !== "" ||
                    isSellerBondReady
                  }
                  isLoading={pendingAction === "prepare-seller-bond"}
                >
                  {isSellerBondReady ? "Seller Bond Ready" : "Deposit And Verify Seller Bond"}
                </Button>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Equality Status</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-700">
              <div><strong>Seller bond deposited:</strong> {escrowState?.hasSellerBondDeposit ? "yes" : "no"}</div>
              <div><strong>Equality status:</strong> {sellerEqualityStatus}</div>
              <div className="break-all">
                <strong>Handle:</strong> {escrowState?.sellerBondAttestation?.handle || "not available"}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Confirm Order</h2>
            <p className="mt-2 text-sm text-slate-600">
              Once seller equality is verified, sign and upload the single commitment VRC and bind
              it on-chain.
            </p>
            <div className="mt-4 space-y-2 text-sm text-slate-700">
              <div><strong>Bound CID:</strong> {orderRow?.orderVcCid || "not bound yet"}</div>
              <div className="break-all"><strong>Bound hash:</strong> {orderRow?.orderVcHash || "not bound yet"}</div>
            </div>
            <div className="mt-4">
              <Button
                onClick={handleConfirmOrder}
                disabled={
                  !isSeller ||
                  Number(escrowState?.phase) !== 1 ||
                  !isSellerBondReady ||
                  pendingAction !== ""
                }
                isLoading={pendingAction === "confirm-order"}
              >
                Sign And Confirm Order
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Transport Prep</h2>
            <p className="mt-2 text-sm text-slate-600">
              After the order is confirmed, choose the winning transporter. Once the job is bound,
              fund the delivery fee for delivery settlement.
            </p>

            <div className="mt-4 space-y-4 text-sm text-slate-700">
              <div><strong>Delivery fee funded:</strong> {escrowState?.hasSellerDeliveryFeeDeposit ? "yes" : "no"}</div>
              <div><strong>Selected transporter:</strong> {escrowState?.transporterAddress || "not selected"}</div>

              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Delivery Fee Amount
                </div>
                <input
                  value={deliveryFeeAmountInput}
                  onChange={(event) => setDeliveryFeeAmountInput(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                  placeholder="0.001"
                />
              </div>

              <Button
                onClick={handleDepositSellerDeliveryFee}
                disabled={
                  !isSeller ||
                  Number(escrowState?.phase) !== 3 ||
                  pendingAction !== "" ||
                  escrowState?.hasSellerDeliveryFeeDeposit ||
                  !normalizeAddress(escrowState?.transporterAddress)
                }
                isLoading={pendingAction === "seller-delivery-fee"}
              >
                {escrowState?.hasSellerDeliveryFeeDeposit ? "Delivery Fee Funded" : "Fund Delivery Fee"}
              </Button>

              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Current Bids
                </div>
                <div className="mt-2 space-y-2">
                  {bidRows.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                      No transporter bids yet.
                    </div>
                  ) : (
                    bidRows.map((bid) => (
                      <button
                        key={bid.address}
                        type="button"
                        onClick={() => {
                          setSelectedTransporterInput(bid.address);
                          setDeliveryFeeAmountInput((previous) => previous || formatTokenInputValue(bid.fee));
                        }}
                        className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                      >
                        <span className="font-mono text-xs">{bid.address}</span>
                        <span>{formatTokenAmount(bid.fee, { symbol: "WETH" })}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Selected Transporter
                </div>
                <input
                  value={selectedTransporterInput}
                  onChange={(event) => setSelectedTransporterInput(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                  placeholder="0x..."
                />
              </div>

              <Button
                onClick={handleSelectTransporter}
                disabled={
                  !isSeller ||
                  Number(escrowState?.phase) !== 2 ||
                  pendingAction !== ""
                }
                isLoading={pendingAction === "select-transporter"}
              >
                Select Transporter
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
