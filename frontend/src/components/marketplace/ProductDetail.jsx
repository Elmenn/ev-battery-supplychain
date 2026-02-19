import React, { useEffect, useState, useCallback } from "react";
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
import { createFinalOrderVC } from "../../utils/vcBuilder.mjs";
import { signVcAsSeller } from "../../utils/signVcWithMetamask";
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
import { Button } from "../ui/button";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CopyButton = ({ value }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="text-xs text-blue-600 hover:text-blue-800 shrink-0"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
};

const phaseColors = {
  [Phase.Listed]: "bg-gray-100 text-gray-700",
  [Phase.Purchased]: "bg-purple-100 text-purple-700",
  [Phase.OrderConfirmed]: "bg-orange-100 text-orange-800",
  [Phase.Bound]: "bg-blue-100 text-blue-700",
  [Phase.Delivered]: "bg-green-100 text-green-700",
  [Phase.Expired]: "bg-red-100 text-red-700",
};

// ─── Component ────────────────────────────────────────────────────────────────

const ProductDetail = ({ provider, currentUser }) => {
  const { address } = useParams();

  // ── State ─────────────────────────────────────────────────────────────────
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [role, setRole] = useState({ role: "visitor" });
  const [bids, setBids] = useState([]); // [{address, fee}]
  const [showPrivatePaymentModal, setShowPrivatePaymentModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showTransporterConfirm, setShowTransporterConfirm] = useState(null); // {address, fee} or null
  const [showBidModal, setShowBidModal] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [payoutTxHash, setPayoutTxHash] = useState(null);
  const [auditCid, setAuditCid] = useState("");
  const [auditVC, setAuditVC] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [chainId, setChainId] = useState(null);

  // ── Data Loading ──────────────────────────────────────────────────────────

  const loadProductData = useCallback(async () => {
    if (!provider || !address) return;
    try {
      setLoading(true);
      const state = await getProductState(address, provider);
      try {
        const network = await provider.getNetwork();
        setChainId(Number(network.chainId));
      } catch {
        // keep null if network is unavailable
      }
      setProduct(state);
      setRole(detectRole(state, currentUser));

      // Load bids if phase is OrderConfirmed
      if (state.phase === Phase.OrderConfirmed) {
        try {
          const contract = getEscrowContract(address, provider);
          const [addrs, fees] = await contract.getAllTransporters();
          setBids(addrs.map((a, i) => ({ address: a, fee: fees[i] })));
        } catch (err) {
          console.warn("Failed to load transporter bids:", err.message);
          setBids([]);
        }
      } else {
        setBids([]);
      }

      if (
        state.transporter &&
        state.transporter !== ethers.ZeroAddress &&
        state.transporter !== "0x0000000000000000000000000000000000000000"
      ) {
        try {
          const contract = getEscrowContract(address, provider);
          const quotedFee = await contract.transporters(state.transporter);
          setProduct((prev) => ({
            ...(prev || state),
            transporterQuotedFee: quotedFee,
          }));
        } catch {
          // no-op
        }
      }
    } catch (err) {
      setError("Failed to load product: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [address, provider, currentUser]);

  useEffect(() => {
    loadProductData();
  }, [loadProductData]);

  useEffect(() => {
    if (!address) return;
    const cached = localStorage.getItem(`vcCid_${address}`) || "";
    setAuditCid(cached);
  }, [address]);

  // ── Seller Handlers ───────────────────────────────────────────────────────

  const findLocalStorageValueByAddress = (prefix, addr) => {
    if (!addr || typeof window === "undefined") return null;
    const lower = addr.toLowerCase();
    const direct = localStorage.getItem(`${prefix}${addr}`);
    if (direct) return direct;
    const directLower = localStorage.getItem(`${prefix}${lower}`);
    if (directLower) return directLower;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const suffix = key.slice(prefix.length);
      if (suffix.toLowerCase() === lower) {
        return localStorage.getItem(key);
      }
    }
    return null;
  };

  /**
   * Seller confirms order: build a single final VC (listing + payment),
   * sign, upload to IPFS, and call confirmOrder on-chain.
   */
  const handleConfirmOrder = async () => {
    setActionLoading(true);
    try {
      const signer = await provider.getSigner();
      const sellerAddr = await signer.getAddress();

      if (!product?.buyer || product.buyer === ethers.ZeroAddress) {
        throw new Error("Missing buyer address on-chain.");
      }
      if (!product?.memoHash || product.memoHash === ethers.ZeroHash) {
        throw new Error("Missing memo hash on-chain.");
      }
      if (!product?.railgunTxRef || product.railgunTxRef === ethers.ZeroHash) {
        throw new Error("Missing Railgun tx reference on-chain.");
      }

      const rawMeta = findLocalStorageValueByAddress("productMeta_", address);
      if (!rawMeta) {
        throw new Error(
          "Missing product metadata for final VC generation. Recreate product from this browser."
        );
      }

      let listingMeta;
      try {
        listingMeta = JSON.parse(rawMeta);
      } catch {
        throw new Error("Stored product metadata is invalid JSON.");
      }

      const finalVc = createFinalOrderVC({
        sellerAddr,
        buyerAddr: product.buyer,
        sellerRailgunAddress:
          listingMeta?.sellerRailgunAddress ||
          findLocalStorageValueByAddress("sellerRailgunAddress_", address) ||
          "",
        productName: listingMeta?.productName || product.name || "",
        batch: listingMeta?.batch || "",
        quantity: listingMeta?.quantity || 1,
        productContract: address,
        productId: String(product.id ?? listingMeta?.productId ?? ""),
        chainId: String(
          listingMeta?.chainId ||
            process.env.REACT_APP_CHAIN_ID ||
            process.env.REACT_APP_CHAIN_ALIAS ||
            process.env.REACT_APP_NETWORK_ID ||
            "1337"
        ),
        priceCommitment: listingMeta?.priceCommitment || {},
        certificateCredential: listingMeta?.certificateCredential || {
          name: "",
          cid: "",
        },
        componentCredentials: listingMeta?.componentCredentials || [],
        memoHash: product.memoHash,
        railgunTxRef: product.railgunTxRef,
      });

      // 1) Sign as seller
      toast("Signing VC...");
      const proof = await signVcAsSeller(finalVc, signer, address);
      finalVc.proof.push(proof);

      // 2) Upload to IPFS
      toast("Uploading VC to IPFS...");
      const newCid = await uploadJson(finalVc);
      localStorage.setItem(`vcCid_${address}`, newCid);

      // 3) Confirm on-chain
      toast("Confirming order on-chain...");
      const contract = getEscrowContract(address, signer);
      const tx = await contract.confirmOrder(newCid);
      const receipt = await tx.wait();

      const explorerUrl = getExplorerUrl(receipt.hash);
      toast.success(
        explorerUrl
          ? `Order confirmed! View on explorer: ${explorerUrl}`
          : "Order confirmed on-chain!"
      );
      await loadProductData();
    } catch (err) {
      const msg = decodeContractError(err) || err.message;
      toast.error("Confirm failed: " + msg);
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Opens the transporter confirmation modal for a given bid.
   */
  const openTransporterConfirm = (bid) => {
    setShowTransporterConfirm(bid);
  };

  /**
   * Seller selects a transporter after confirming via styled modal.
   * Sends the delivery fee as value (held in escrow).
   */
  const handleSelectTransporter = async () => {
    const bid = showTransporterConfirm;
    if (!bid) return;
    setShowTransporterConfirm(null);
    setActionLoading(true);
    try {
      const signer = await provider.getSigner();
      const contract = getEscrowContract(address, signer);
      const tx = await contract.setTransporter(bid.address, {
        value: bid.fee,
      });
      await tx.wait();
      toast.success("Transporter selected!");
      await loadProductData();
    } catch (err) {
      toast.error(
        "Failed: " + (decodeContractError(err) || err.message)
      );
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
      toast.success("Bid withdrawn, bond returned.");
      await loadProductData();
    } catch (err) {
      toast.error(
        "Withdraw failed: " + (decodeContractError(err) || err.message)
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleLoadAuditVC = async () => {
    const cid = String(auditCid || "").trim();
    if (!cid) {
      setAuditError("Please enter a VC CID.");
      setAuditVC(null);
      return;
    }
    setAuditLoading(true);
    setAuditError("");
    try {
      const vc = await fetchVCFromServer(cid);
      setAuditVC(vc);
      localStorage.setItem(`vcCid_${address}`, cid);
      toast.success("VC loaded for audit.");
    } catch (err) {
      setAuditVC(null);
      setAuditError(err.message || "Failed to load VC from backend.");
    } finally {
      setAuditLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-gray-500">Loading product...</p>
      </div>
    );
  }

  if (error && !product) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-gray-500">Product not found.</p>
      </div>
    );
  }

  const phaseColor =
    phaseColors[product.phase] || "bg-gray-100 text-gray-700";

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Phase Timeline */}
      <PhaseTimeline currentPhase={product.phase} />

      {/* Header: name, owner, buyer, phase badge */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">{product.name}</h2>
          <p className="text-sm text-gray-600">
            Owner: {product.owner.slice(0, 6)}...{product.owner.slice(-4)}
          </p>
          {product.buyer &&
            product.buyer !== ethers.ZeroAddress && (
              <p className="text-sm text-gray-600">
                Buyer: {product.buyer.slice(0, 6)}...
                {product.buyer.slice(-4)}
              </p>
            )}
        </div>
        <span
          className={`rounded-md px-3 py-1 text-sm font-medium ${phaseColor}`}
        >
          {PHASE_LABELS[product.phase]}
        </span>
      </div>

      {/* Bond info */}
      {product.sellerBond > 0n && (
        <BondCard bondAmountWei={product.sellerBond} />
      )}

      {/* Countdown timers (phase-aware) */}
      {product.phase === Phase.Purchased && product.purchaseTimestamp > 0 && (
        <CountdownTimer
          deadline={product.purchaseTimestamp + SELLER_WINDOW}
          windowSeconds={SELLER_WINDOW}
          label="Seller must confirm by"
        />
      )}
      {product.phase === Phase.OrderConfirmed &&
        product.orderConfirmedTimestamp > 0 && (
          <CountdownTimer
            deadline={product.orderConfirmedTimestamp + BID_WINDOW}
            windowSeconds={BID_WINDOW}
            label="Transporter selection deadline"
          />
        )}
      {product.phase === Phase.Bound && product.boundTimestamp > 0 && (
        <CountdownTimer
          deadline={product.boundTimestamp + DELIVERY_WINDOW}
          windowSeconds={DELIVERY_WINDOW}
          label="Delivery deadline"
        />
      )}

      {/* === PRIMARY ACTION PANELS (role-aware) === */}

      {/* SELLER: Confirm Order (phase=Purchased) */}
      {role.role === "seller" && product.phase === Phase.Purchased && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="font-semibold text-amber-800 mb-2">
            Payment Received
          </h3>
          <p className="text-sm text-amber-700 mb-3">
            A buyer has purchased this product. Confirm the order to proceed.
          </p>
          <Button onClick={handleConfirmOrder} disabled={actionLoading}>
            {actionLoading ? "Processing..." : "Confirm Order"}
          </Button>
        </div>
      )}

      {/* SELLER: Transporter Selection (phase=OrderConfirmed) */}
      {role.role === "seller" && product.phase === Phase.OrderConfirmed && (
        <div className="bg-white border rounded-lg p-4">
          <h3 className="font-semibold mb-3">Select Transporter</h3>
          {bids.length === 0 ? (
            <p className="text-sm text-gray-500">
              No bids yet. Waiting for transporters to submit bids.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Address</th>
                  <th className="text-left py-2">Fee (ETH)</th>
                  <th className="text-right py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {[...bids]
                  .sort((a, b) => Number(a.fee - b.fee))
                  .map((bid, i) => (
                    <tr key={bid.address} className="border-b">
                      <td className="py-2 font-mono text-xs">
                        {bid.address.slice(0, 6)}...{bid.address.slice(-4)}
                        {i === 0 && (
                          <span className="ml-2 text-xs bg-green-100 text-green-700 px-1 rounded">
                            Lowest
                          </span>
                        )}
                      </td>
                      <td className="py-2">
                        {ethers.formatEther(bid.fee)}
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          className="px-2 py-1 text-xs"
                          onClick={() => openTransporterConfirm(bid)}
                          disabled={actionLoading}
                        >
                          Select
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* BUYER: Buy with Railgun (phase=Listed, visitor or any non-seller/non-transporter) */}
      {(role.role === "visitor" || role.role === "buyer") &&
        product.phase === Phase.Listed && (
        <Button
          onClick={() => setShowPrivatePaymentModal(true)}
          className="bg-purple-600 hover:bg-purple-700"
        >
          {role.role === "buyer" ? "Continue Private Payment" : "Buy with Railgun"}
        </Button>
      )}

      {/* BUYER: Post-purchase payment details card (phase >= Purchased, role=buyer) */}
      {role.role === "buyer" && product.phase >= Phase.Purchased && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-green-800">Payment Recorded</h3>
          <p className="text-sm text-green-700">
            Your private payment has been recorded on-chain.
          </p>

          {/* Memo Hash display with truncation + copy */}
          {product.memoHash &&
            product.memoHash !== ethers.ZeroHash && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-20 shrink-0">
                  Memo Hash:
                </span>
                <code className="text-xs font-mono text-gray-700 bg-gray-100 px-2 py-1 rounded truncate">
                  {product.memoHash.slice(0, 10)}...
                  {product.memoHash.slice(-8)}
                </code>
                <CopyButton value={product.memoHash} />
              </div>
            )}

          {/* Railgun TxRef display with truncation + copy */}
          {product.railgunTxRef &&
            product.railgunTxRef !== ethers.ZeroHash && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-20 shrink-0">
                  Tx Ref:
                </span>
                <code className="text-xs font-mono text-gray-700 bg-gray-100 px-2 py-1 rounded truncate">
                  {product.railgunTxRef.slice(0, 10)}...
                  {product.railgunTxRef.slice(-8)}
                </code>
                <CopyButton value={product.railgunTxRef} />
              </div>
            )}
        </div>
      )}

      {/* TRANSPORTER: submit bid (phase=OrderConfirmed, unassigned visitor) */}
      {role.role === "visitor" &&
        product.phase === Phase.OrderConfirmed &&
        currentUser &&
        currentUser.toLowerCase() !== product.owner?.toLowerCase() &&
        currentUser.toLowerCase() !== product.buyer?.toLowerCase() && (
          <Button
            onClick={() => setShowBidModal(true)}
            className="bg-cyan-600 hover:bg-cyan-700"
          >
            Submit Delivery Bid
          </Button>
        )}

      {/* TRANSPORTER: confirm delivery (phase=Bound) */}
      {role.role === "transporter" && product.phase === Phase.Bound && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <h3 className="mb-2 font-semibold text-emerald-800">
            Ready to Confirm Delivery
          </h3>
          <p className="mb-3 text-sm text-emerald-700">
            Verify the delivery hash and confirm on-chain to release funds.
          </p>
          <Button
            onClick={() => setShowDeliveryModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            Confirm Delivery
          </Button>
        </div>
      )}

      {/* TRANSPORTER: withdraw bid if not selected */}
      {role.role === "visitor" &&
        currentUser &&
        (product.phase === Phase.OrderConfirmed ||
          product.phase === Phase.Expired) &&
        bids.some((b) => b.address.toLowerCase() === currentUser.toLowerCase()) && (
          <Button
            variant="ghost"
            onClick={handleWithdrawBid}
            disabled={actionLoading}
          >
            Withdraw Bid
          </Button>
        )}

      {/* TRANSPORTER: payout summary after delivery */}
      {role.role === "transporter" && product.phase === Phase.Delivered && (
        <PayoutSummaryCard
          bondReturned={product.bondAmount}
          feePaid={product.transporterQuotedFee ?? 0n}
          txHash={payoutTxHash}
        />
      )}

      {/* HASH DISPLAY (seller: phase >= OrderConfirmed, buyer/transporter: phase >= Bound) */}
      {product.vcHash &&
        product.vcHash !== ethers.ZeroHash &&
        ((role.role === "seller" && product.phase >= Phase.OrderConfirmed) ||
          (role.role === "buyer" && product.phase >= Phase.Bound) ||
          (role.role === "transporter" && product.phase >= Phase.Bound)) && (
          <HashDisplay
            hash={product.vcHash}
            label="Delivery Verification Hash"
            productAddress={address}
            chainId={chainId}
            vcCid={String(auditCid || "").trim()}
            guidance={
              role.role === "seller"
                ? "Share this hash with the selected transporter. The transporter must use this exact value in confirmDelivery."
                : role.role === "transporter"
                ? "Use this hash to confirm delivery on-chain."
                : "This hash will be used by the transporter to confirm delivery."
            }
          />
        )}

      {/* AUDITOR VERIFICATION */}
      {product.phase >= Phase.OrderConfirmed && (
        <div className="bg-white border rounded-lg p-4 space-y-4">
          <h3 className="font-semibold">Audit</h3>
          <p className="text-sm text-gray-600">
            Load a VC CID and run auditor verification checks.
          </p>
          <div className="flex gap-2">
            <input
              value={auditCid}
              onChange={(e) => setAuditCid(e.target.value)}
              placeholder="Qm... (VC CID)"
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm font-mono outline-none focus:border-blue-500"
            />
            <Button onClick={handleLoadAuditVC} disabled={auditLoading}>
              {auditLoading ? "Loading..." : "Load VC"}
            </Button>
          </div>
          {auditError && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {auditError}
            </div>
          )}
          {auditVC && (
            <VerifyVCInline
              vc={auditVC}
              cid={auditCid}
              provider={provider}
              contractAddress={address}
            />
          )}
        </div>
      )}

      {/* Transporter Confirmation Modal (styled, replaces window.confirm) */}
      {showTransporterConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-3">
              Confirm Transporter Selection
            </h3>
            <p className="text-sm text-gray-600 mb-2">
              You are selecting transporter:
            </p>
            <p className="font-mono text-xs bg-gray-100 px-2 py-1 rounded mb-3">
              {showTransporterConfirm.address}
            </p>
            <p className="text-sm text-gray-600 mb-1">
              Delivery fee deposit:
            </p>
            <p className="text-lg font-semibold text-blue-700 mb-4">
              {ethers.formatEther(showTransporterConfirm.fee)} ETH
            </p>
            <p className="text-xs text-gray-500 mb-4">
              This fee will be held in escrow and paid to the transporter upon
              successful delivery.
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="ghost"
                onClick={() => setShowTransporterConfirm(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSelectTransporter}
                disabled={actionLoading}
              >
                {actionLoading ? "Processing..." : "Confirm & Deposit Fee"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* PrivatePaymentModal */}
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

      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
};

export default ProductDetail;
