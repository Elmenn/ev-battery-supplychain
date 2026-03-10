import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import {
  getProductState,
  detectRole,
  Phase,
  PHASE_LABELS,
  getEscrowContract,
  SELLER_WINDOW,
  BID_WINDOW,
  DELIVERY_WINDOW,
} from "../../utils/escrowHelpers";
import { uploadJson } from "../../utils/ipfs";
import { createFinalOrderVCV2 } from "../../utils/vcBuilder.mjs";
import { signVcAsSeller } from "../../utils/signVcWithMetamask";
import { getOrderAttestation } from "../../utils/buyerSecretApi";
import { decodeContractError, getExplorerUrl } from "../../utils/errorHandler";
import PrivatePaymentModal from "../railgun/PrivatePaymentModal";
import PhaseTimeline from "../shared/PhaseTimeline";
import HashDisplay from "../shared/HashDisplay";
import CountdownTimer from "../shared/CountdownTimer";
import BondCard from "../shared/BondCard";
import TransporterBidModal from "../shared/TransporterBidModal";
import DeliveryConfirmModal from "../shared/DeliveryConfirmModal";
import PayoutSummaryCard from "../shared/PayoutSummaryCard";
import VerifyVCInline from "../vc/VerifyVCInline";
import { fetchVCFromServer } from "../../utils/verifyVc";
import { getProductMeta, updateVcCid } from "../../utils/productMetaApi";
import { getOrder, reconcileOrder, updateOrderStatus, updateOrderVc } from "../../utils/orderApi";
import { Button } from "../ui/button";

const phaseColors = {
  [Phase.Listed]: "bg-gray-100 text-gray-700",
  [Phase.Purchased]: "bg-purple-100 text-purple-700",
  [Phase.OrderConfirmed]: "bg-orange-100 text-orange-800",
  [Phase.Bound]: "bg-blue-100 text-blue-700",
  [Phase.Delivered]: "bg-green-100 text-green-700",
  [Phase.Expired]: "bg-red-100 text-red-700",
};

const CopyButton = ({ value }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-xs text-blue-600 hover:text-blue-800 shrink-0"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
};

const ProductDetail = ({ provider, currentUser }) => {
  const { address } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [role, setRole] = useState({ role: "visitor" });
  const [bids, setBids] = useState([]);
  const [showPrivatePaymentModal, setShowPrivatePaymentModal] = useState(false);
  const [showTransporterConfirm, setShowTransporterConfirm] = useState(null);
  const [showBidModal, setShowBidModal] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [payoutTxHash, setPayoutTxHash] = useState(null);
  const [auditCid, setAuditCid] = useState("");
  const [auditVC, setAuditVC] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [chainId, setChainId] = useState(null);

  const loadProductData = useCallback(async () => {
    if (!provider || !address) return;
    try {
      setLoading(true);
      const state = await getProductState(address, provider);
      setProduct(state);
      setRole(detectRole(state, currentUser));
      try {
        const network = await provider.getNetwork();
        setChainId(Number(network.chainId));
      } catch {
        setChainId(null);
      }

      if (state.phase === Phase.OrderConfirmed) {
        try {
          const contract = getEscrowContract(address, provider);
          const [addrs, fees] = await contract.getAllTransporters();
          setBids(addrs.map((entry, index) => ({ address: entry, fee: fees[index] })));
        } catch {
          setBids([]);
        }
      } else {
        setBids([]);
      }

      if (state.transporter && state.transporter !== ethers.ZeroAddress) {
        try {
          const contract = getEscrowContract(address, provider);
          const quotedFee = await contract.transporters(state.transporter);
          setProduct((prev) => ({ ...(prev || state), transporterQuotedFee: quotedFee }));
        } catch {
          // ignore fee lookup failure
        }
      }
    } catch (err) {
      setError(`Failed to load product: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [address, currentUser, provider]);

  useEffect(() => {
    loadProductData();
  }, [loadProductData]);

  useEffect(() => {
    if (!address) return;
    (async () => {
      const data = await getProductMeta(address);
      setAuditCid(data?.vcCid || "");
    })();
  }, [address]);

  const handleConfirmOrder = async () => {
    setActionLoading(true);
    try {
      const signer = await provider.getSigner();
      const sellerAddr = await signer.getAddress();
      const activeOrderId = product?.activeOrderId;
      const activeOrder = product?.activeOrder;
      if (!activeOrderId || activeOrderId === ethers.ZeroHash || !activeOrder) {
        throw new Error("Active order data is missing.");
      }

      const [metaData, orderRow, attestationRow] = await Promise.all([
        getProductMeta(address),
        getOrder(activeOrderId),
        getOrderAttestation(activeOrderId),
      ]);
      const listingMeta = metaData?.productMeta || null;
      if (!listingMeta) {
        throw new Error("Listing metadata is missing for final VC generation.");
      }

      let order = orderRow;
      if (!order) {
        const reconciled = await reconcileOrder(activeOrderId, {
          productAddress: address,
          productId: String(product.id ?? listingMeta.productId ?? ""),
          chainId: String(listingMeta.chainId || chainId || "1337"),
          sellerAddress: product.owner,
          unitPriceWei: String(metaData?.unitPriceWei || listingMeta.unitPriceWei || ""),
          unitPriceHash: String(metaData?.unitPriceHash || listingMeta.unitPriceHash || product.unitPriceHash || ""),
          onChainOrder: {
            buyerAddress: product.buyer,
            memoHash: activeOrder.memoHash,
            railgunTxRef: activeOrder.railgunTxRef,
            quantityCommitment: activeOrder.quantityCommitment,
            totalCommitment: activeOrder.totalCommitment,
            paymentCommitment: activeOrder.paymentCommitment,
            contextHash: activeOrder.contextHash,
            vcHash: activeOrder.vcHash,
            purchaseTimestamp: activeOrder.purchaseTimestamp,
            orderConfirmedTimestamp: activeOrder.orderConfirmedTimestamp,
            phase: activeOrder.phase,
            exists: true,
          },
        });
        order = reconciled?.order || null;
      }

      if (!order) {
        throw new Error("Order sidecar is missing and reconciliation did not recover it.");
      }
      if (!attestationRow) {
        throw new Error("Order attestation sidecar is missing. The buyer must recover the order bundle before seller confirmation.");
      }

      const vc = createFinalOrderVCV2({
        sellerAddr,
        buyerAddr: order.buyerAddress || product.buyer,
        sellerRailgunAddress: metaData?.sellerRailgunAddress || listingMeta?.sellerRailgunAddress || "",
        productName: listingMeta.productName || product.name || "",
        batch: listingMeta.batch || "",
        productContract: address,
        productId: String(product.id ?? listingMeta.productId ?? ""),
        chainId: String(order.chainId || listingMeta.chainId || chainId || "1337"),
        unitPriceWei: String(order.unitPriceWei || ""),
        unitPriceHash: String(order.unitPriceHash || ""),
        listingSnapshotCid: String(metaData?.listingSnapshotCid || listingMeta.listingSnapshotCid || ""),
        certificateCredential: listingMeta.certificateCredential || { name: "", cid: "" },
        componentCredentials: listingMeta.componentCredentials || [],
        orderId: order.orderId,
        memoHash: order.memoHash,
        railgunTxRef: order.railgunTxRef,
        quantityCommitment: order.quantityCommitment,
        totalCommitment: order.totalCommitment,
        paymentCommitment: order.paymentCommitment,
        contextHash: order.contextHash,
        disclosurePubKey: attestationRow?.disclosurePubkey || null,
      });

      toast("Signing VC...");
      vc.proof.push(await signVcAsSeller(vc, signer, address));
      toast("Uploading VC to IPFS...");
      const cid = await uploadJson(vc);
      const vcHash = ethers.keccak256(ethers.toUtf8Bytes(cid));
      toast("Confirming order on-chain...");
      const contract = getEscrowContract(address, signer);
      const tx = await contract.confirmOrderById(order.orderId, cid);
      const receipt = await tx.wait();

      await Promise.allSettled([
        updateVcCid(address, cid),
        updateOrderVc(order.orderId, cid, vcHash),
        updateOrderStatus(order.orderId, "order_confirmed"),
      ]);

      const explorerUrl = getExplorerUrl(receipt.hash);
      toast.success(explorerUrl ? `Order confirmed: ${explorerUrl}` : "Order confirmed on-chain.");
      setAuditCid(cid);
      await loadProductData();
    } catch (err) {
      toast.error(`Confirm failed: ${decodeContractError(err) || err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectTransporter = async () => {
    if (!showTransporterConfirm) return;
    setActionLoading(true);
    try {
      const signer = await provider.getSigner();
      const contract = getEscrowContract(address, signer);
      const tx = await contract.setTransporter(showTransporterConfirm.address, {
        value: showTransporterConfirm.fee,
      });
      await tx.wait();
      setShowTransporterConfirm(null);
      toast.success("Transporter selected.");
      await loadProductData();
    } catch (err) {
      toast.error(`Failed: ${decodeContractError(err) || err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleWithdrawBid = async () => {
    setActionLoading(true);
    try {
      const signer = await provider.getSigner();
      const contract = getEscrowContract(address, signer);
      const tx = await contract.withdrawBid();
      await tx.wait();
      toast.success("Bid withdrawn.");
      await loadProductData();
    } catch (err) {
      toast.error(`Withdraw failed: ${decodeContractError(err) || err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleLoadAuditVC = async () => {
    const cid = String(auditCid || "").trim();
    if (!cid) {
      setAuditError("Please enter a VC CID.");
      return;
    }
    setAuditLoading(true);
    setAuditError("");
    try {
      const vc = await fetchVCFromServer(cid);
      setAuditVC(vc);
      await Promise.allSettled([updateVcCid(address, cid)]);
      toast.success("VC loaded for audit.");
    } catch (err) {
      setAuditVC(null);
      setAuditError(err.message || "Failed to load VC.");
    } finally {
      setAuditLoading(false);
    }
  };

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-8"><p className="text-gray-500">Loading product...</p></div>;
  }
  if (error && !product) {
    return <div className="max-w-4xl mx-auto px-4 py-8"><p className="text-red-600">{error}</p></div>;
  }
  if (!product) {
    return <div className="max-w-4xl mx-auto px-4 py-8"><p className="text-gray-500">Product not found.</p></div>;
  }

  const phaseColor = phaseColors[product.phase] || "bg-gray-100 text-gray-700";
  const activeOrder = product.activeOrder;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <PhaseTimeline currentPhase={product.phase} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">{product.name}</h2>
          <p className="text-sm text-gray-600">Owner: {product.owner.slice(0, 6)}...{product.owner.slice(-4)}</p>
          {product.buyer && product.buyer !== ethers.ZeroAddress && (
            <p className="text-sm text-gray-600">Buyer: {product.buyer.slice(0, 6)}...{product.buyer.slice(-4)}</p>
          )}
        </div>
        <span className={`rounded-md px-3 py-1 text-sm font-medium ${phaseColor}`}>{PHASE_LABELS[product.phase]}</span>
      </div>

      {product.sellerBond > 0n && <BondCard bondAmountWei={product.sellerBond} />}

      {product.phase === Phase.Purchased && product.purchaseTimestamp > 0 && (
        <CountdownTimer deadline={product.purchaseTimestamp + SELLER_WINDOW} windowSeconds={SELLER_WINDOW} label="Seller must confirm by" />
      )}
      {product.phase === Phase.OrderConfirmed && product.orderConfirmedTimestamp > 0 && (
        <CountdownTimer deadline={product.orderConfirmedTimestamp + BID_WINDOW} windowSeconds={BID_WINDOW} label="Transporter selection deadline" />
      )}
      {product.phase === Phase.Bound && product.boundTimestamp > 0 && (
        <CountdownTimer deadline={product.boundTimestamp + DELIVERY_WINDOW} windowSeconds={DELIVERY_WINDOW} label="Delivery deadline" />
      )}

      {role.role === "seller" && product.phase === Phase.Purchased && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="font-semibold text-amber-800 mb-2">Order Ready For Seller Confirmation</h3>
          <p className="text-sm text-amber-700 mb-3">The buyer has anchored a private order with quantity and payment commitments. Confirm the order VC to continue.</p>
          <Button onClick={handleConfirmOrder} disabled={actionLoading}>{actionLoading ? "Processing..." : "Confirm Order"}</Button>
        </div>
      )}

      {role.role === "seller" && product.phase === Phase.OrderConfirmed && (
        <div className="bg-white border rounded-lg p-4">
          <h3 className="font-semibold mb-3">Select Transporter</h3>
          {bids.length === 0 ? (
            <p className="text-sm text-gray-500">No bids yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left py-2">Address</th><th className="text-left py-2">Fee (ETH)</th><th className="text-right py-2">Action</th></tr></thead>
              <tbody>
                {[...bids].sort((a, b) => Number(a.fee - b.fee)).map((bid, index) => (
                  <tr key={bid.address} className="border-b">
                    <td className="py-2 font-mono text-xs">{bid.address.slice(0, 6)}...{bid.address.slice(-4)}{index === 0 && <span className="ml-2 text-xs bg-green-100 text-green-700 px-1 rounded">Lowest</span>}</td>
                    <td className="py-2">{ethers.formatEther(bid.fee)}</td>
                    <td className="py-2 text-right"><Button className="px-2 py-1 text-xs" onClick={() => setShowTransporterConfirm(bid)} disabled={actionLoading}>Select</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {(role.role === "visitor" || role.role === "buyer") && product.phase === Phase.Listed && (
        <Button onClick={() => setShowPrivatePaymentModal(true)} className="bg-purple-600 hover:bg-purple-700">
          {role.role === "buyer" ? "Continue Private Order" : "Buy With Railgun"}
        </Button>
      )}

      {role.role === "buyer" && activeOrder && product.phase >= Phase.Purchased && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-green-800">Private Order Recorded</h3>
          <p className="text-sm text-green-700">Your order commitments and payment anchor are stored on-chain and in the sidecar.</p>
          <div className="flex items-center gap-2"><span className="text-xs text-gray-500 w-20 shrink-0">Order ID:</span><code className="text-xs font-mono text-gray-700 bg-gray-100 px-2 py-1 rounded truncate">{product.activeOrderId.slice(0, 10)}...{product.activeOrderId.slice(-8)}</code><CopyButton value={product.activeOrderId} /></div>
          <div className="flex items-center gap-2"><span className="text-xs text-gray-500 w-20 shrink-0">Memo Hash:</span><code className="text-xs font-mono text-gray-700 bg-gray-100 px-2 py-1 rounded truncate">{activeOrder.memoHash.slice(0, 10)}...{activeOrder.memoHash.slice(-8)}</code><CopyButton value={activeOrder.memoHash} /></div>
          <div className="flex items-center gap-2"><span className="text-xs text-gray-500 w-20 shrink-0">Tx Ref:</span><code className="text-xs font-mono text-gray-700 bg-gray-100 px-2 py-1 rounded truncate">{activeOrder.railgunTxRef.slice(0, 10)}...{activeOrder.railgunTxRef.slice(-8)}</code><CopyButton value={activeOrder.railgunTxRef} /></div>
        </div>
      )}

      {role.role === "visitor" && product.phase === Phase.OrderConfirmed && currentUser && currentUser.toLowerCase() !== product.owner?.toLowerCase() && currentUser.toLowerCase() !== product.buyer?.toLowerCase() && (
        <Button onClick={() => setShowBidModal(true)} className="bg-cyan-600 hover:bg-cyan-700">Submit Delivery Bid</Button>
      )}

      {role.role === "transporter" && product.phase === Phase.Bound && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <h3 className="mb-2 font-semibold text-emerald-800">Ready To Confirm Delivery</h3>
          <p className="mb-3 text-sm text-emerald-700">Use the anchored VC hash below to confirm delivery on-chain.</p>
          <Button onClick={() => setShowDeliveryModal(true)} className="bg-emerald-600 hover:bg-emerald-700">Confirm Delivery</Button>
        </div>
      )}

      {role.role === "visitor" && currentUser && (product.phase === Phase.OrderConfirmed || product.phase === Phase.Expired) && bids.some((bid) => bid.address.toLowerCase() === currentUser.toLowerCase()) && (
        <Button variant="ghost" onClick={handleWithdrawBid} disabled={actionLoading}>Withdraw Bid</Button>
      )}

      {role.role === "transporter" && product.phase === Phase.Delivered && (
        <PayoutSummaryCard bondReturned={product.bondAmount} feePaid={product.transporterQuotedFee ?? 0n} txHash={payoutTxHash} />
      )}

      {product.vcHash && product.vcHash !== ethers.ZeroHash && ((role.role === "seller" && product.phase >= Phase.OrderConfirmed) || (role.role === "buyer" && product.phase >= Phase.Bound) || (role.role === "transporter" && product.phase >= Phase.Bound)) && (
        <HashDisplay
          hash={product.vcHash}
          label="Delivery Verification Hash"
          productAddress={address}
          chainId={chainId}
          vcCid={String(auditCid || "").trim()}
        />
      )}

      {product.phase >= Phase.OrderConfirmed && (
        <div className="bg-white border rounded-lg p-4 space-y-4">
          <h3 className="font-semibold">Audit</h3>
          <p className="text-sm text-gray-600">Load the seller-signed order VC and verify order-bound proofs by `orderId`.</p>
          <div className="flex gap-2">
            <input value={auditCid} onChange={(event) => setAuditCid(event.target.value)} placeholder="Qm... (VC CID)" className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm font-mono outline-none focus:border-blue-500" />
            <Button onClick={handleLoadAuditVC} disabled={auditLoading}>{auditLoading ? "Loading..." : "Load VC"}</Button>
          </div>
          {auditError && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{auditError}</div>}
          {auditVC && <VerifyVCInline vc={auditVC} cid={auditCid} provider={provider} contractAddress={address} />}
        </div>
      )}

      {showTransporterConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-3">Confirm Transporter Selection</h3>
            <p className="text-sm text-gray-600 mb-4">Select {showTransporterConfirm.address} for {ethers.formatEther(showTransporterConfirm.fee)} ETH delivery fee deposit.</p>
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setShowTransporterConfirm(null)}>Cancel</Button>
              <Button onClick={handleSelectTransporter} disabled={actionLoading}>{actionLoading ? "Processing..." : "Confirm"}</Button>
            </div>
          </div>
        </div>
      )}

      {showPrivatePaymentModal && (
        <PrivatePaymentModal
          product={product}
          isOpen={showPrivatePaymentModal}
          onClose={() => setShowPrivatePaymentModal(false)}
          onSuccess={() => {
            setShowPrivatePaymentModal(false);
            loadProductData();
          }}
          currentUser={currentUser}
        />
      )}

      {showBidModal && (
        <TransporterBidModal
          isOpen={showBidModal}
          onClose={() => setShowBidModal(false)}
          onSuccess={() => {
            setShowBidModal(false);
            loadProductData();
          }}
          productAddress={address}
          provider={provider}
          bondAmountWei={product.bondAmount}
        />
      )}

      {showDeliveryModal && (
        <DeliveryConfirmModal
          isOpen={showDeliveryModal}
          onClose={() => setShowDeliveryModal(false)}
          onSuccess={(txHash) => {
            setShowDeliveryModal(false);
            setPayoutTxHash(txHash || null);
            loadProductData();
          }}
          productAddress={address}
          provider={provider}
          vcHash={product.vcHash}
        />
      )}
    </div>
  );
};

export default ProductDetail;
