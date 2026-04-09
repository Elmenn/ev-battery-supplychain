import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Contract, ethers } from "ethers";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Button } from "../ui/button";
import { readProductEscrowState } from "../../utils/erc7984/escrowState";
import { getProductMeta } from "../../utils/productMetaApi";
import { getOrder } from "../../utils/orderApi";
import { saveErc7984OrderSnapshot } from "../../utils/erc7984/orderSnapshotApi";
import { encryptUint64ForContract, getBrowserFhevmInstance, publicDecryptHandle } from "../../utils/erc7984/fhevmClient";
import { formatTokenAmount, formatTokenInputValue, parseTokenAmountInput } from "../../utils/tokenDisplay";
import Erc7984FundingCard from "./Erc7984FundingCard";

const ACTION_ESCROW_ABI = [
  "function getAllTransporters() view returns (address[] addrs, uint256[] fees)",
  "function createTransporter(uint256 quotedFee)",
  "function confirmDelivery(bytes32 orderId, bytes32 hash)",
  "function finalizeEqualityAttestation(bytes32 orderId, uint8 target, bytes abiEncodedCleartexts, bytes decryptionProof)",
];

const CONFIDENTIAL_TOKEN_ABI = [
  "function confidentialTransferAndCall(address to, bytes32 handle, bytes inputProof, bytes data)",
];

const DEPOSIT_KIND_TRANSPORTER_BOND = 3;
const EQUALITY_TARGET_TRANSPORTER_BOND = 1;

function normalizeAddress(value) {
  const normalized = value ? String(value).trim().toLowerCase() : "";
  return normalized === ethers.ZeroAddress.toLowerCase() ? "" : normalized;
}

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

function deriveRequiredBondAmount(orderRow) {
  const explicitPaymentValue = orderRow?.paymentProof?.value;
  const explicitTotalValue = orderRow?.totalProof?.value;
  if (explicitPaymentValue && /^\d+$/.test(String(explicitPaymentValue))) {
    return String(explicitPaymentValue);
  }
  if (explicitTotalValue && /^\d+$/.test(String(explicitTotalValue))) {
    return String(explicitTotalValue);
  }
  return "";
}

export default function Erc7984TransporterJobDetail({ provider, currentUser }) {
  const { address } = useParams();
  const navigate = useNavigate();
  const [escrowState, setEscrowState] = useState(null);
  const [productMetaRow, setProductMetaRow] = useState(null);
  const [orderRow, setOrderRow] = useState(null);
  const [bidRows, setBidRows] = useState([]);
  const [quotedFeeInput, setQuotedFeeInput] = useState("0.001");
  const [privateBalance, setPrivateBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [fundingRefreshTrigger, setFundingRefreshTrigger] = useState(0);

  const activeOrderId =
    escrowState?.activeOrderId && escrowState.activeOrderId !== ethers.ZeroHash
      ? escrowState.activeOrderId
      : "";
  const requiredBondAmount = useMemo(() => deriveRequiredBondAmount(orderRow), [orderRow]);
  const transporterAddress = normalizeAddress(currentUser);
  const isAssignedTransporter = transporterAddress === normalizeAddress(escrowState?.transporterAddress);
  const myBid = bidRows.find((bid) => bid.address === transporterAddress);
  const transporterEqualityStatus = escrowState?.transporterBondAttestation?.status || "none";
  const isTransporterBondReady = transporterEqualityStatus === "verified_true";

  const loadDetail = useCallback(async () => {
    if (!provider || !address) return;
    try {
      setLoading(true);
      setError("");
      const actionContract = new Contract(address, ACTION_ESCROW_ABI, provider);
      const [nextState, nextMetaRow, bidData] = await Promise.all([
        readProductEscrowState(provider, address),
        getProductMeta(address),
        actionContract.getAllTransporters().catch(() => [[], []]),
      ]);
      const nextOrder =
        nextState.activeOrderId && nextState.activeOrderId !== ethers.ZeroHash
          ? await getOrder(nextState.activeOrderId)
          : null;

      const [transporterAddresses, transporterFees] = bidData;
      const nextBidRows = Array.from(transporterAddresses || []).map((bidder, index) => ({
        address: normalizeAddress(bidder),
        fee: transporterFees?.[index]?.toString?.() || "0",
      }));

      setEscrowState(nextState);
      setProductMetaRow(nextMetaRow);
      setOrderRow(nextOrder);
      setBidRows(nextBidRows.filter((row) => row.address));
      const existingBid = nextBidRows.find((row) => row.address === transporterAddress);
      if (existingBid?.fee) {
        setQuotedFeeInput(formatTokenInputValue(existingBid.fee));
      }
    } catch (detailError) {
      setError(detailError.message || "Failed to load transporter job.");
    } finally {
      setLoading(false);
    }
  }, [address, provider, transporterAddress]);

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
      contextHash: orderRow.contextHash || null,
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
      deliveryTxHash: overrides.deliveryTxHash ?? orderRow.deliveryTxHash ?? null,
      deliveryConfirmedVcHash: overrides.deliveryConfirmedVcHash ?? orderRow.deliveryConfirmedVcHash ?? null,
      deliveryConfirmedTransporter: overrides.deliveryConfirmedTransporter ?? orderRow.deliveryConfirmedTransporter ?? null,
    });
  }

  async function finalizeTransporterEqualityStep(attestationHandle) {
    if (!provider || !activeOrderId || !attestationHandle) {
      throw new Error("Transporter equality handle is not available yet.");
    }

    const signer = await provider.getSigner();
    const contract = new Contract(address, ACTION_ESCROW_ABI, signer);
    const decrypted = await publicDecryptHandle({
      provider,
      handle: attestationHandle,
    });
    const tx = await contract.finalizeEqualityAttestation(
      activeOrderId,
      EQUALITY_TARGET_TRANSPORTER_BOND,
      decrypted.abiEncodedClearValues,
      decrypted.decryptionProof
    );
    await tx.wait();

    const refreshedState = await readProductEscrowState(provider, address);
    await persistSnapshot(refreshedState);
    return refreshedState;
  }

  async function handleCreateBid() {
    if (!provider) return;
    setPendingAction("create-bid");
    try {
      const fee = parseTokenAmountInput(quotedFeeInput || "", { label: "Quoted fee" });

      const signer = await provider.getSigner();
      const contract = new Contract(address, ACTION_ESCROW_ABI, signer);
      const tx = await contract.createTransporter(fee);
      await tx.wait();
      toast.success("Transporter bid created.");
      await loadDetail();
    } catch (actionError) {
      toast.error(actionError.message || "Failed to create transporter bid.");
    } finally {
      setPendingAction("");
    }
  }

  async function handlePrepareTransporterBond() {
    if (!provider || !escrowState?.paymentToken || !activeOrderId) return;
    setPendingAction("prepare-transporter-bond");
    try {
      const signer = await provider.getSigner();
      const signerAddress = normalizeAddress(await signer.getAddress());
      const depositAmount = parseTokenAmountInput(formatTokenInputValue(requiredBondAmount) || "", {
        label: "Required transporter bond",
      });

      if (signerAddress !== transporterAddress) {
        throw new Error("Switch MetaMask to the transporter wallet.");
      }
      if (!isAssignedTransporter) {
        throw new Error("You must be the selected transporter before depositing the bond.");
      }
      if (depositAmount <= 0n) {
        throw new Error("Required transporter bond is not available yet.");
      }
      if (privateBalance != null && BigInt(privateBalance) < depositAmount) {
        throw new Error("Insufficient private balance for transporter bond.");
      }

      if (!escrowState?.hasTransporterSecurityDeposit) {
        await getBrowserFhevmInstance(provider);
        const { handle, inputProof } = await encryptUint64ForContract({
          provider,
          contractAddress: escrowState.paymentToken,
          userAddress: signerAddress,
          value: depositAmount,
        });

        const payload = ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "uint8"],
          [activeOrderId, DEPOSIT_KIND_TRANSPORTER_BOND]
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
        refreshedState?.transporterBondAttestation?.status === "pending" &&
        refreshedState?.transporterBondAttestation?.handle
      ) {
        refreshedState = await finalizeTransporterEqualityStep(
          refreshedState.transporterBondAttestation.handle
        );
      }

      await loadDetail();
      toast.success("Transporter bond deposited and equality verified.");
    } catch (actionError) {
      toast.error(actionError.message || "Failed to prepare transporter bond.");
    } finally {
      setPendingAction("");
    }
  }

  async function handleConfirmDelivery() {
    if (!provider || !activeOrderId || !orderRow) return;
    setPendingAction("confirm-delivery");
    try {
      const signer = await provider.getSigner();
      const signerAddress = normalizeAddress(await signer.getAddress());

      if (signerAddress !== normalizeAddress(escrowState?.transporterAddress)) {
        throw new Error("Switch MetaMask to the selected transporter wallet.");
      }
      if (!orderRow.orderVcHash || orderRow.orderVcHash === ethers.ZeroHash) {
        throw new Error("The bound commitment hash is not available yet.");
      }

      const contract = new Contract(address, ACTION_ESCROW_ABI, signer);
      const tx = await contract.confirmDelivery(activeOrderId, orderRow.orderVcHash);
      const receipt = await tx.wait();

      const refreshedState = await readProductEscrowState(provider, address);
      await persistSnapshot(refreshedState, {
        deliveryTxHash: receipt.hash,
        deliveryConfirmedVcHash: orderRow.orderVcHash,
        deliveryConfirmedTransporter: signerAddress,
      });
      await loadDetail();
      toast.success("Delivery confirmed.");
    } catch (actionError) {
      toast.error(actionError.message || "Failed to confirm delivery.");
    } finally {
      setPendingAction("");
    }
  }

  if (loading) {
    return <div className="max-w-5xl mx-auto px-4 py-8 text-slate-500">Loading transporter job...</div>;
  }

  if (error) {
    return <div className="max-w-5xl mx-auto px-4 py-8 text-red-600">{error}</div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-cyan-700">Transporter Dashboard</div>
          <h1 className="text-3xl font-semibold text-slate-900">
            {productMetaRow?.productMeta?.productName || escrowState?.name || "Transport Job"}
          </h1>
          <p className="mt-2 text-sm text-slate-600 break-all">Product: {address}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => navigate("/transporter/jobs")} variant="ghost">
            Back To Transport Jobs
          </Button>
          <Button onClick={() => navigate(`/product/${address}`)} variant="ghost">
            View Product Page
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Job Summary</h2>
            <div className="mt-4 grid gap-3 text-sm text-slate-700">
              <div><strong>Active order:</strong> {activeOrderId || "Not created yet"}</div>
              <div><strong>Seller:</strong> {escrowState?.sellerAddress || "unknown"}</div>
              <div><strong>Buyer:</strong> {escrowState?.buyerAddress || "unknown"}</div>
              <div><strong>Stage:</strong> {Number(escrowState?.phase) === 2 ? "Open For Transport" : Number(escrowState?.phase) === 3 ? "In Delivery" : Number(escrowState?.phase) === 4 ? "Delivered" : "Not Ready"}</div>
              <div>
                <strong>Your bid:</strong>{" "}
                {myBid?.fee ? formatTokenAmount(myBid.fee, { symbol: "WETH" }) : "not submitted"}
              </div>
              <div><strong>Selected transporter:</strong> {escrowState?.transporterAddress || "not selected"}</div>
              <div>
                <strong>Required transporter bond:</strong>{" "}
                {requiredBondAmount
                  ? formatTokenAmount(requiredBondAmount, { symbol: "WETH" })
                  : "not-derived-yet"}
              </div>
            </div>
          </div>

          <Erc7984FundingCard
            provider={provider}
            currentUser={currentUser}
            title="Transporter Wallet Funding"
            description="Manage your shared public and private balances here before bidding or posting the transporter bond."
            amountInput={formatTokenInputValue(requiredBondAmount)}
            onAmountInputChange={() => {}}
            amountPlaceholder="0.002"
            refreshTrigger={fundingRefreshTrigger}
            onBalancesChange={({ privateBalance: nextPrivate }) => {
              setPrivateBalance(nextPrivate);
            }}
          />

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Bid Or Accept Job</h2>
            <p className="mt-2 text-sm text-slate-600">
              Submit a delivery fee bid while the order is open, then complete the transporter bond once you are selected.
            </p>

            <div className="mt-4 grid gap-4">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Quoted Fee
                </div>
                <input
                  value={quotedFeeInput}
                  onChange={(event) => setQuotedFeeInput(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                  placeholder="0.001"
                />
              </div>

              <Button
                onClick={handleCreateBid}
                disabled={pendingAction !== "" || Number(escrowState?.phase) !== 2 || isAssignedTransporter}
                isLoading={pendingAction === "create-bid"}
              >
                {myBid ? "Update Bid" : "Submit Bid"}
              </Button>

              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Current Bids
                </div>
                <div className="mt-2 space-y-2">
                  {bidRows.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                      No bids yet.
                    </div>
                  ) : (
                    bidRows.map((bid) => (
                      <div key={bid.address} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        <span className="font-mono text-xs">{bid.address}</span>
                        <span>{formatTokenAmount(bid.fee, { symbol: "WETH" })}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Bond Status</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-700">
              <div><strong>Assigned to you:</strong> {isAssignedTransporter ? "yes" : "no"}</div>
              <div><strong>Seller delivery fee funded:</strong> {escrowState?.hasSellerDeliveryFeeDeposit ? "yes" : "no"}</div>
              <div><strong>Transporter bond deposited:</strong> {escrowState?.hasTransporterSecurityDeposit ? "yes" : "no"}</div>
              <div><strong>Equality status:</strong> {transporterEqualityStatus}</div>
            </div>

            <div className="mt-4">
              <Button
                onClick={handlePrepareTransporterBond}
                disabled={
                  pendingAction !== "" ||
                  Number(escrowState?.phase) !== 3 ||
                  !isAssignedTransporter ||
                  isTransporterBondReady
                }
                isLoading={pendingAction === "prepare-transporter-bond"}
              >
                {isTransporterBondReady ? "Transporter Bond Ready" : "Deposit And Verify Transporter Bond"}
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Confirm Delivery</h2>
            <p className="mt-2 text-sm text-slate-600">
              Confirm delivery against the same commitment hash the seller bound on-chain.
            </p>
            <div className="mt-4 space-y-2 text-sm text-slate-700">
              <div className="break-all"><strong>Bound hash:</strong> {orderRow?.orderVcHash || "not bound yet"}</div>
              <div className="break-all"><strong>Bound CID:</strong> {orderRow?.orderVcCid || "not bound yet"}</div>
            </div>
            <div className="mt-4">
              <Button
                onClick={handleConfirmDelivery}
                disabled={
                  pendingAction !== "" ||
                  Number(escrowState?.phase) !== 3 ||
                  !isAssignedTransporter ||
                  !escrowState?.hasSellerDeliveryFeeDeposit ||
                  !isTransporterBondReady ||
                  !orderRow?.orderVcHash
                }
                isLoading={pendingAction === "confirm-delivery"}
              >
                Confirm Delivery
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
