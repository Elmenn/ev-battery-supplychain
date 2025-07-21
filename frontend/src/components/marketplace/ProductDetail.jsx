import React, { useEffect, useState } from "react";
import { useCallback } from "react";
import { useParams } from "react-router-dom";
import { ethers } from "ethers";
import { getCurrentCid, confirmOrder } from "../../utils/web3Utils";
import { uploadJson } from "../../utils/ipfs";
import { buildStage2VC } from "../../utils/vcBuilder";
import { signVcAsSeller } from "../../utils/signVcWithMetamask";

import ProductEscrowABI from "../../abis/ProductEscrow.json";

import VCViewer from "../../components/vc/VCViewer";
import VerifyVCInline from "../../components/vc/VerifyVCInline";

import StageCard from "../ui/StageCard";
import { Button } from "../ui/button";
import { Eye, EyeOff } from "lucide-react";

const ZERO = "0x0000000000000000000000000000000000000000";

const ProductDetail = ({ provider, currentUser, onConfirmDelivery }) => {

  const { address } = useParams();
  /* ─────────────── State ────────────────────────────────────── */
  const [product, setProduct] = useState(null);
  const [vcStages, setVcStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const [transporter, setTransporter] = useState(null);
  const [bids, setBids] = useState([]);
  const [feeInput, setFeeInput] = useState("");

  const [expandedVCIndex, setExpandedVCIndex] = useState(null);

  /* ─────────────── Load product + VC chain ──────────────────── */
  const loadProductData = useCallback(async () => {
  if (!provider || !address) return;

  try {
    setLoading(true);
    const contract = new ethers.Contract(address, ProductEscrowABI.abi, provider);

    const [
      name,
      price,
      owner,
      buyer,
      purchased,
      vcCid,
      transporterAddr,
    ] = await Promise.all([
      contract.name(),
      contract.price(),
      contract.owner(),
      contract.buyer(),
      contract.purchased(),
      contract.vcCid(),
      contract.transporter(),
    ]);

    setProduct({ name, price, owner, buyer, purchased, vcCid, address });
    setTransporter(transporterAddr);

    /* walk the VC chain (stage-0 → stage-n) */
    const chain = [];
    let cid = vcCid;
    while (cid) {
      const res = await fetch(`https://ipfs.io/ipfs/${cid}`);
      if (!res.ok) break;
      const vc = await res.json();
      chain.unshift({ cid, vc });
      cid = vc.credentialSubject?.previousCredential || null;
    }
    setVcStages(chain);

    /* existing bids */
    const [addrList, feeList] = await contract.getAllTransporters();
    setBids(addrList.map((a, i) => ({ address: a, fee: feeList[i] })));
  } catch (err) {
    console.error("❌ loadProductData:", err);
    setError("Error loading data");
  } finally {
    setLoading(false);
  }
}, [provider, address]);   // <-- dependency list

  /* ─────────────── Derived flags (compute first!) ───────────── */
const transporterSet = transporter && transporter !== ZERO;

const isBuyer =
  currentUser?.toLowerCase() === product?.buyer?.toLowerCase();
const isSeller =
  currentUser?.toLowerCase() === product?.owner?.toLowerCase();
const isDelivered =
  product?.owner?.toLowerCase() === product?.buyer?.toLowerCase();
const isConfirmed = vcStages.length >= 2;
const isUnrelated = !isBuyer && !isSeller;

/* you’ll also need statusLabel for the header */
const statusLabel = isDelivered
  ? "Delivered"
  : transporterSet
  ? "In Delivery"
  : isConfirmed
  ? "Awaiting Bids"
  : "Created";


  /* ─────────────── Mutations ────────────────────────────────── */
  const handleBuyProduct = async () => {
    try {
      const signer = await provider.getSigner();
      const esc = new ethers.Contract(address, ProductEscrowABI.abi, signer);
      const tx = await esc.depositPurchase({ value: product.price });
      await tx.wait();
      loadProductData();
    } catch (err) {
      setError("Buy failed – see console");
      console.error(err);
    }
  };

  const handleConfirmOrder = async () => {
    if (vcStages.length >= 2) {
      setStatusMessage("⚠️ Order already confirmed.");
      return;
    }
    try {
      setStatusMessage("⏳ Confirming order…");
      const signer = await provider.getSigner();
      const sellerAddr = await signer.getAddress();

      const currentCid = await getCurrentCid(address);
      const stage0 = await fetch(`https://ipfs.io/ipfs/${currentCid}`).then((r) =>
        r.json()
      );

      const vc = buildStage2VC({
        stage0,
        stage0Cid: currentCid,
        buyerAddr: product.buyer,
        sellerAddr,
      });

      vc.proofs.issuerProof = await signVcAsSeller(vc, signer);

      const newCid = await uploadJson(vc);
      const tx = await confirmOrder(address, newCid);

      loadProductData();
      setStatusMessage("✅ Order confirmed");
    } catch (err) {
      console.error(err);
      setError("Confirm order failed");
    }
  };

  const handleOfferToDeliver = async () => {
    try {
      const signer = await provider.getSigner();
      const esc = new ethers.Contract(address, ProductEscrowABI.abi, signer);
      const fee = ethers.parseEther(feeInput || "0");
      const tx = await esc.createTransporter(fee);
      await tx.wait();
      loadProductData();
      setFeeInput("");
    } catch (err) {
      console.error(err);
      setError("Bid failed");
    }
  };

  const handleSelectTransporter = async (bid) => {
    try {
      const signer = await provider.getSigner();
      const esc = new ethers.Contract(address, ProductEscrowABI.abi, signer);
      const tx = await esc.setTransporter(bid.address, { value: bid.fee });
      await tx.wait();
      loadProductData();
    } catch (err) {
      console.error(err);
      setError("Selection failed");
    }
  };

  const handleConfirmDeliveryClick = () => {
    if (onConfirmDelivery) onConfirmDelivery(product);
    else setError("Delivery logic not implemented");
  };

  
 useEffect(() => {
  loadProductData();
}, [loadProductData]);
useEffect(() => {
  loadProductData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [provider, address]);

/* ─── Poll until Stage-1 VC is fetched or a transporter is set ─── */
useEffect(() => {
  if (!product) return;
  const shouldPoll =
    product.purchased && vcStages.length === 1 && !transporterSet;
  if (!shouldPoll) return;

  const id = setInterval(loadProductData, 5000);
  return () => clearInterval(id);
}, [product?.purchased, vcStages.length, transporterSet, loadProductData]);



/* ─────────────── Early exits ──────────────────────────────── */
if (loading)  return <p>Loading…</p>;
if (!product) return <p>No product found.</p>;


/* ─────────────── Render ───────────────────────────────────── */
return (
  <div className="product-detail">
    {/* Header */}
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold">{product.name}</h2>
        <p className="text-sm text-gray-600">
          <span className="font-semibold">Owner:</span> {product.owner}
        </p>
        <p className="text-sm text-gray-600">
          <span className="font-semibold">Buyer:</span> {product.buyer}
        </p>
      </div>

      <span
        className={`inline-block rounded-md px-3 py-1 text-sm font-medium ${
          isDelivered
            ? "bg-green-100 text-green-800"
            : transporterSet
            ? "bg-blue-100 text-blue-800"
            : "bg-yellow-100 text-yellow-800"
        }`}
      >
        {statusLabel}
      </span>
    </div>

    {/* Alerts */}
    {statusMessage && <p className="text-blue-600">{statusMessage}</p>}
    {error && <p className="text-red-600">{error}</p>}

      {/* ────────── Action panel (Buy / Bids / Delivery) ───────── */}
      {!product.purchased && isUnrelated && (
        <Button onClick={handleBuyProduct}>Buy Now</Button>
      )}

      {product.purchased && !isDelivered && (
        <>
          {/* Seller actions */}
          {isSeller && (
            <>
              {!isConfirmed && (
                <Button onClick={handleConfirmOrder}>
                  Confirm Order
                </Button>
              )}

              {isConfirmed && !transporterSet && (
                <div className="mt-4 space-y-2">
                  <h4 className="font-semibold">Transporter Bids</h4>
                  {bids.length === 0 ? (
                    <p className="text-sm text-gray-500">No bids yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {bids.map((bid, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between rounded border px-3 py-1 text-sm"
                        >
                          <span>
                            {bid.address.slice(0, 6)}…
                            {bid.address.slice(-4)} –{" "}
                            {ethers.formatEther(bid.fee)} ETH
                          </span>
                          <Button
                            size="sm"
                            onClick={() => handleSelectTransporter(bid)}
                          >
                            Select
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}

          {/* Buyer action */}
          {isBuyer && isConfirmed && transporterSet && (
            <Button onClick={handleConfirmDeliveryClick}>
              Confirm Delivery
            </Button>
          )}

          {/* Unrelated user – offer to deliver */}
          {isUnrelated && isConfirmed && !transporterSet && (
            <div className="mt-4 space-y-2">
              <h4 className="font-semibold">Offer to Deliver</h4>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={feeInput}
                  onChange={(e) => setFeeInput(e.target.value)}
                  placeholder="Fee in ETH"
                  className="flex-1 rounded border px-2 py-1 text-sm"
                />
                <Button onClick={handleOfferToDeliver}>Submit Bid</Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ────────── VC Timeline ───────── */}
      <h3 className="mt-8 text-lg font-semibold">VC Timeline</h3>

      <ul className="space-y-10">
        {vcStages.map(({ cid, vc }, idx) => {
          const isLatest = idx === vcStages.length - 1;

          return (
            <StageCard key={cid} title={`Stage ${idx}`}>
              <div className="flex items-center justify-between">
                {!isLatest && (
                  <Button
                    variant={expandedVCIndex === idx ? "ghost" : "secondary"}
                    onClick={() =>
                      setExpandedVCIndex(
                        expandedVCIndex === idx ? null : idx
                      )
                    }
                    icon={expandedVCIndex === idx ? EyeOff : Eye}
                  >
                    {expandedVCIndex === idx ? "Hide VC" : "View VC"}
                  </Button>
                )}
              </div>

              {isLatest && <VerifyVCInline vc={vc} cid={cid} />}

              {!isLatest && expandedVCIndex === idx && (
                <div className="rounded-lg border bg-gray-50 p-4">
                  <VCViewer vc={vc} />
                </div>
              )}
            </StageCard>
          );
        })}
      </ul>
    </div>
  );
};

export default ProductDetail;
