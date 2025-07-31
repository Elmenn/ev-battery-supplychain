import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { ethers } from "ethers";
import { getCurrentCid, confirmOrder } from "../../utils/web3Utils";
import { uploadJson } from "../../utils/ipfs";
import { buildStage2VC, buildStage3VC, freezeVcJson } from "../../utils/vcBuilder.mjs";
import { signVcAsSeller } from "../../utils/signVcWithMetamask";
import { signVcWithMetamask } from "../../utils/signVcWithMetamask";
import debugReveal from "../../debugCommitment";
import { saveAs } from 'file-saver'; // For optional file download (npm install file-saver)

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
  const [vcDraft, setVcDraft] = useState(null);
  const [vcDraftSaved, setVcDraftSaved] = useState(false);
  const [vcSellerSigned, setVcSellerSigned] = useState(false);


  /* ─────────────── Load product + VC chain ──────────────────── */
  const loadProductData = useCallback(async () => {
  if (!provider || !address) return;

  try {
    setLoading(true);
    const contract = new ethers.Contract(address, ProductEscrowABI.abi, provider);

    const [
      name,
      owner,
      buyer,
      purchased,
      vcCid,
      transporterAddr,
      phaseRaw,
    ] = await Promise.all([
      contract.name(),
      contract.owner(),
      contract.buyer(),
      contract.purchased(),
      contract.vcCid(),
      contract.transporter(),
      contract.phase(), // fetch phase from contract
    ]);
    const phase = typeof phaseRaw === 'bigint' ? Number(phaseRaw) : Number(phaseRaw || 0);
    // Hide price for privacy; set to 'Price hidden 🔒' or null for ZKP logic
    const price = "Price hidden 🔒";
    const priceWei = localStorage.getItem(`priceWei_${address}`);
    const priceBlinding = localStorage.getItem(`priceBlinding_${address}`);
    setProduct({ name, price, priceWei, priceBlinding, owner, buyer, purchased, vcCid, address, phase });
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
    let bids = [];
    try {
      if (contract.getAllTransporters) {
        const [addrList, feeList] = await contract.getAllTransporters();
        bids = addrList.map((a, i) => ({ address: a, fee: feeList[i] }));
      }
    } catch (err) {
      console.error("Error loading transporter bids:", err);
      // Optionally set a user-friendly error message here
    }
    setBids(bids);
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
      // Use the off-chain stored price (product.priceWei)
      if (!product.priceWei) {
        setError("No price available for purchase. Please contact the seller.");
        return;
      }
      setStatusMessage("⏳ Generating ZKP...");
      // 1. Call backend to get value commitment and proof
      const zkpRes = await fetch("http://localhost:5010/zkp/generate-value-commitment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: Number(product.priceWei) }) // price in wei as number
      });
      const { commitment, proof, verified } = await zkpRes.json();
      if (!verified) {
        setError("ZKP verification failed");
        return;
      }

      // 2. Prepare arguments for contract call
      const signer = await provider.getSigner();
      const esc = new ethers.Contract(address, ProductEscrowABI.abi, signer);

      const price = ethers.toBigInt(product.priceWei);
      const blinding = product.priceBlinding;
      const priceCommitment = ethers.keccak256(
        ethers.solidityPacked(["uint256", "bytes32"], [price, blinding])
      );

      const valueCommitment = commitment.startsWith("0x") ? commitment : "0x" + commitment;
      const valueRangeProof = proof.startsWith("0x") ? proof : "0x" + proof;

      setStatusMessage("⏳ Submitting purchase...");
      const tx = await esc.depositPurchase(
        priceCommitment,
        valueCommitment,
        valueRangeProof,
        { value: ethers.toBigInt(product.priceWei) }
      );
      await tx.wait();
      loadProductData();
      setStatusMessage("✅ Purchase complete!");
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
      if (!currentCid) {
        throw new Error("No current CID available for this product.");
      }
      const res = await fetch(`https://ipfs.io/ipfs/${currentCid}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch VC from IPFS: ${res.status} ${res.statusText}`);
      }
      const stage0 = await res.json();

      // Build the price object for stage 1
      const priceObj = { hidden: true };

      // Build the VC for stage 1
      const vc = buildStage2VC({
        stage0,
        stage0Cid: currentCid,
        buyerAddr: product.buyer,
        sellerAddr,
      });
      vc.issuer = {
        id: `did:ethr:1337:${sellerAddr}`,
        name: "Seller",
      };
      vc.credentialSubject.price = priceObj;

      // Normalize all string fields to non-null strings
      const cs = vc.credentialSubject;
      const stringFields = [
        "id", "productName", "batch", "previousCredential", "transactionId"
      ];
      stringFields.forEach(field => {
        if (cs[field] == null) cs[field] = "";
      });
      if (cs.certificateCredential) {
        if (cs.certificateCredential.name == null) cs.certificateCredential.name = "";
        if (cs.certificateCredential.cid == null) cs.certificateCredential.cid = "";
      }

      // Serialize price as string for EIP-712 and IPFS (keep for Stage 1)
      if (vc.credentialSubject.price == null) {
        vc.credentialSubject.price = JSON.stringify({});
      } else if (typeof vc.credentialSubject.price !== "string") {
        vc.credentialSubject.price = JSON.stringify(vc.credentialSubject.price);
      }
      console.log("[ProductDetail] VC to sign (with price as string):", vc);

      // Sign the VC as issuer (Stage 2)
      const issuerProof = await signVcAsSeller(vc, signer);
      vc.proofs = { issuerProof };
      console.log("[ProductDetail] Issuer proof:", issuerProof);

      // Upload the intermediate VC (Stage 2) to IPFS and update the contract's vcCid
      const newCid = await uploadJson(vc);
      console.log("[ProductDetail] Uploaded VC CID:", newCid);
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
      const tx = await esc.createTransporter(fee.toString());
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

  // Step 1: Buyer builds VC with ZKP, canonicalizes, and saves draft
  const handleRequestSellerSignature = async () => {
    try {
      setStatusMessage('🔏 Building VC draft with ZKP...');
      const signer = await provider.getSigner();
      const buyerAddr = await signer.getAddress();
      // Fetch the latest Stage 2 VC from IPFS
      const stage2Cid = product.vcCid;
      const stage2 = await fetch(`https://ipfs.io/ipfs/${stage2Cid}`).then(r => r.json());
      // Fetch/generate ZKP from backend
      setStatusMessage('🔐 Generating ZKP proof...');
      const zkpRes = await fetch('http://localhost:5010/zkp/generate-value-commitment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: Number(product.priceWei) })
      });
      let zkpData;
      if (zkpRes.ok) {
        zkpData = await zkpRes.json();
      } else {
        const text = await zkpRes.text();
        throw new Error('ZKP backend error: ' + text);
      }
      const { commitment, proof, verified } = zkpData;
      const priceObj = {
        hidden: true,
        zkpProof: {
          protocol: 'bulletproofs-pedersen',
          version: '1.0',
          commitment,
          proof,
          encoding: 'hex',
          verified,
          description: 'This ZKP proves the price is in the allowed range without revealing it.',
          proofType: 'zkRangeProof-v1'
        }
      };
      // Build the VC draft (no proofs yet)
      let draftVC = buildStage3VC({
        stage2,
        price: priceObj,
        buyerProof: {},
        proofType: 'zkRangeProof-v1'
      });
      // Normalize all string fields
      const cs = draftVC.credentialSubject;
      const stringFields = [
        'id', 'productName', 'batch', 'previousCredential', 'transactionId'
      ];
      stringFields.forEach(field => {
        if (cs[field] == null) cs[field] = '';
      });
      if (cs.certificateCredential) {
        if (cs.certificateCredential.name == null) cs.certificateCredential.name = '';
        if (cs.certificateCredential.cid == null) cs.certificateCredential.cid = '';
      }
      // Canonicalize and save draft (to localStorage for now)
      const canonicalVcJson = freezeVcJson(draftVC);
      localStorage.setItem('vcDraft', canonicalVcJson);
      setVcDraft(draftVC);
      setVcDraftSaved(true);
      setStatusMessage('✅ VC draft with ZKP saved! Share with seller for signature.');
      // Debug log
      console.log('[DEBUG] VC draft after buyer builds:', draftVC);
      console.log('[DEBUG] VC draft proof array:', draftVC.proof);
    } catch (err) {
      setError('Failed to build VC draft: ' + err.message);
      setStatusMessage('');
    }
  };

  // Step 2: Seller loads, canonicalizes, and signs the VC draft
  const handleSignAsSeller = async () => {
    try {
      setStatusMessage('✍️ Loading VC draft for seller signature...');
      const canonicalVcJson = localStorage.getItem('vcDraft');
      if (!canonicalVcJson) {
        setError('No VC draft found. Buyer must prepare and share the draft first.');
        setStatusMessage('');
        return;
      }
      let canonicalVcObj = JSON.parse(canonicalVcJson);
      // Canonicalize again to ensure stable order
      const stableJson = freezeVcJson(canonicalVcObj);
      canonicalVcObj = JSON.parse(stableJson);
      // Seller signs
      const signer = await provider.getSigner();
      const sellerProof = await signVcAsSeller(canonicalVcObj, signer);
      canonicalVcObj.proof = [sellerProof];
      // Debug log
      console.log('[DEBUG] VC after seller signs:', canonicalVcObj);
      console.log('[DEBUG] VC proof array after seller signs:', canonicalVcObj.proof);
      // Save updated VC (with seller's proof) to localStorage
      const sellerSignedJson = freezeVcJson(canonicalVcObj);
      localStorage.setItem('vcSellerSigned', sellerSignedJson);
      setVcSellerSigned(true);
      setStatusMessage('✅ VC signed by seller! Share with buyer for final signature.');
    } catch (err) {
      setError('Failed to sign VC as seller: ' + err.message);
      setStatusMessage('');
    }
  };

  // Step 3: Buyer loads seller-signed VC, signs, and uploads
  const handleConfirmDeliveryClick = async () => {
    try {
      setStatusMessage('🔏 Loading seller-signed VC...');
      const sellerSignedJson = localStorage.getItem('vcSellerSigned');
      if (!sellerSignedJson) {
        setError('No seller-signed VC found. Seller must sign first.');
        setStatusMessage('');
        return;
      }
      let canonicalVcObj = JSON.parse(sellerSignedJson);
      // Canonicalize again to ensure stable order
      let canonicalVcJson = freezeVcJson(canonicalVcObj);
      canonicalVcObj = JSON.parse(canonicalVcJson);
      // Debug log before buyer signs
      console.log('[DEBUG] VC before buyer signs:', canonicalVcObj);
      console.log('[DEBUG] VC proof array before buyer signs:', canonicalVcObj.proof);
      // Buyer signs
      setStatusMessage('✍️ Buyer signing VC...');
      const signer = await provider.getSigner();
      const buyerProof = await signVcWithMetamask(canonicalVcObj, signer);
      canonicalVcObj.proof.push(buyerProof);
      // Debug log after buyer signs
      console.log('[DEBUG] VC after buyer signs:', canonicalVcObj);
      console.log('[DEBUG] VC proof array after buyer signs:', canonicalVcObj.proof);
      // Canonicalize again and upload to IPFS
      canonicalVcJson = freezeVcJson(canonicalVcObj);
      setStatusMessage('📤 Uploading final VC to IPFS...');
      const vcCID = await uploadJson(JSON.parse(canonicalVcJson));
      console.log('[ProductDetail] Uploaded final VC CID:', vcCID);
      // Continue with on-chain delivery confirmation, etc.
      const revealedValue = ethers.toBigInt(product.priceWei);
      const blinding = product.priceBlinding;
      if (!revealedValue || !blinding) {
        setError('Missing price or blinding factor for delivery confirmation.');
        return;
      }
      setStatusMessage('⏳ Confirming delivery on-chain...');
      const esc = new ethers.Contract(product.address, ProductEscrowABI.abi, signer);
      const tx = await esc.revealAndConfirmDelivery(
        revealedValue,
        blinding,
        vcCID
      );
      await tx.wait();
      setStatusMessage('✅ Delivery confirmed!');
      loadProductData();
    } catch (err) {
      setError('Delivery confirmation failed: ' + err.message);
      setStatusMessage('');
      console.error(err);
    }
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
        <p className="text-sm text-gray-600">
          <span className="font-semibold">Price:</span>{" "}
          {product.price ? product.price : "Price hidden 🔒"}
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

    {/* Debug Button */}
    <button onClick={debugReveal} style={{marginBottom: '1em', background: '#eee', padding: '0.5em 1em', borderRadius: '5px'}}>Run Commitment Debug</button>

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
          {isBuyer && product.phase === 3 && (
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

          {/* Add the Request Seller Signature button for the buyer */}
          {isBuyer && product.phase === 3 && !vcDraftSaved && (
            <Button onClick={handleRequestSellerSignature}>
              Request Seller Signature
            </Button>
          )}
          {/* Add the Sign as Seller button for the seller */}
          {isSeller && product.phase === 3 && vcDraftSaved && !vcSellerSigned && (
            <Button onClick={handleSignAsSeller}>
              Sign as Seller
            </Button>
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
