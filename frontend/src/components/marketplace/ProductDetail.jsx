import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { ethers } from "ethers";
import { getCurrentCid, confirmOrder } from "../../utils/web3Utils";
import { uploadJson } from "../../utils/ipfs";
import { buildStage2VC, buildStage3VC, freezeVcJson } from "../../utils/vcBuilder.mjs";
import { signVcAsSeller } from "../../utils/signVcWithMetamask";
import { signVcWithMetamask } from "../../utils/signVcWithMetamask";
import debugReveal from "../../debugCommitment";
import { saveAs } from 'file-saver'; // For optional file download (npm install file-saver)
import toast from 'react-hot-toast';
import ProductEscrowABI from "../../abis/ProductEscrow_Initializer.json";
import VCViewer from "../../components/vc/VCViewer";
import VerifyVCInline from "../../components/vc/VerifyVCInline";
import PrivatePaymentModal from "../railgun/PrivatePaymentModal";
import StageCard from "../ui/StageCard";
import { Button } from "../ui/button";
import { Eye, EyeOff } from "lucide-react";

// Extract the actual ABI array from the imported JSON
const ESCROW_ABI = ProductEscrowABI.abi;
const VC_CHAIN =
  process.env.REACT_APP_CHAIN_ID ||
  process.env.REACT_APP_CHAIN_ALIAS ||
  process.env.REACT_APP_NETWORK_ID ||
  "1337";

// API base constant (mirror railgunUtils.js)
const RAILGUN_API_BASE = process.env.REACT_APP_RAILGUN_API_URL || 'http://localhost:3001';

// Utility function for safe JSON serialization (handles BigInt)
const safeJSON = (x) => JSON.parse(JSON.stringify(x, (_, v) =>
  typeof v === 'bigint' ? v.toString() : v
));

const ZERO = "0x0000000000000000000000000000000000000000";

const ProductDetail = ({ provider, currentUser, onConfirmDelivery }) => {
  // quick helper to gate private UI
  const checkRailgunReady = useCallback(async () => {
    try {
      const res = await fetch(`${RAILGUN_API_BASE}/api/railgun/status`);
      const json = await res.json();
      return json?.success && json?.data && json.data.engineReady && !json.data.fallbackMode;
    } catch {
      return false;
    }
  }, []);

  const openPrivatePaymentModal = useCallback(async () => {
    const ok = await checkRailgunReady();
    if (!ok) {
      toast.error('Private flow temporarily unavailable (engine in fallback). Try again later.');
      return;
    }
    setShowPrivatePaymentModal(true);
  }, [checkRailgunReady]);

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
  const [showEnableButton, setShowEnableButton] = useState(false);
  const [showPrivatePaymentModal, setShowPrivatePaymentModal] = useState(false);
  
  // Seller confirmation state
  const [pendingPrivatePayments, setPendingPrivatePayments] = useState([]);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [deletingReceipt, setDeletingReceipt] = useState(false);
  
  // Separate state for buyer and seller addresses (fixes wallet display bug)
  const [buyerEOA, setBuyerEOA] = useState(null);
  const [sellerEOA, setSellerEOA] = useState(null);
  const [buyerRailgun, setBuyerRailgun] = useState(null);
  const [sellerRailgun, setSellerRailgun] = useState(null);
  
  // Preserve buyer information after pending receipt is deleted
  const [lastKnownBuyer, setLastKnownBuyer] = useState(null);
  const [lastKnownBuyerEOA, setLastKnownBuyerEOA] = useState(null);
  const [identityLocked, setIdentityLocked] = useState(false); // optional guard
  const isCheckingPending = useRef(false);      // for pending receipt checks only
  const isLoadingProduct = useRef(false);       // new: for product loads only
  const isPopulatingAddresses = useRef(false);  // new: for address population only

  // Unified verbose flag - set to true only when debugging critical issues
  const VERBOSE = false; // Set to true only when debugging critical issues

  // Robust delete function that prevents multiple calls
  const deletePendingReceipt = useCallback(async (productId) => {
    if (deletingReceipt) {
      return;
    }

    try {
      setDeletingReceipt(true);
      const productIdStr = typeof productId === 'bigint' ? productId.toString() : String(productId);
      
      const deleteResponse = await fetch(`${RAILGUN_API_BASE}/api/railgun/pending-receipt/${encodeURIComponent(productIdStr)}`, {
        method: 'DELETE'
      });
      
      if (!deleteResponse.ok) {
        console.warn('⚠️ Failed to remove pending receipt from backend:', deleteResponse.status);
      }
    } catch (error) {
      console.warn('⚠️ Failed to remove pending receipt from backend:', error);
    } finally {
      setDeletingReceipt(false);
    }
  }, [deletingReceipt]);

  // Check for pending private payments that need seller confirmation
  const checkPendingPrivatePayments = useCallback(async () => {
    if (!address || !currentUser) return;
    
    // Guard against multiple simultaneous executions
    if (isCheckingPending.current) {
      return;
    }

    try {
      isCheckingPending.current = true;
      
      // Get escrow contract instance
      const contract = new ethers.Contract(address, ESCROW_ABI, provider);
      
      // Check if current user is the seller and private is enabled
      const [contractOwner, isPrivateEnabled] = await Promise.all([
        contract.owner(),
        contract.privateEnabled()
      ]);
      
      // Only proceed if user is the seller and private is enabled
      if (currentUser.toLowerCase() !== contractOwner.toLowerCase()) {
        setPendingPrivatePayments([]);
        return;
      }
      
      if (!isPrivateEnabled) {
        setPendingPrivatePayments([]);
        return;
      }
      
      // Get product ID from contract
      const productId = await contract.id();
      
      // Fetch pending receipt from backend
      const productIdStr = typeof productId === 'bigint' ? productId.toString() : String(productId);
      const response = await fetch(`${RAILGUN_API_BASE}/api/railgun/pending-receipt/${encodeURIComponent(productIdStr)}`);
      
      let pendingReceipt = null;
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          pendingReceipt = result.data;
        }
      }

      if (pendingReceipt) {
        setPendingPrivatePayments([pendingReceipt]);
      } else {
        setPendingPrivatePayments([]);
      }
    } catch (error) {
      console.error('❌ Error checking pending private payments:', error);
      setPendingPrivatePayments([]);
    } finally {
      isCheckingPending.current = false;
    }
  }, [address, currentUser, provider]); // Remove deletingReceipt from dependencies

  // Confirm private payment on-chain
  const confirmPrivatePayment = async (pendingPayment) => {
    if (!provider || !address || !currentUser) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    try {
      setConfirmingPayment(true);
      
      // Create contract instance with signer for transactions
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(address, ESCROW_ABI, signer);
      
      // Verify we're still the owner and private payments are enabled
      const [owner, privateEnabled] = await Promise.all([
        contract.owner(),
        contract.privateEnabled()
      ]);
      
      if (owner.toLowerCase() !== currentUser.toLowerCase()) {
        throw new Error('You are no longer the owner of this product');
      }
      
      if (!privateEnabled) {
        throw new Error('Private payments are no longer enabled for this product');
      }
      
      // Get product ID from contract
      const productId = await contract.id();
      
      // Preflight check with ethers v6
      try {
        await contract.recordPrivatePayment.staticCall(
          productId,
          pendingPayment.memoHash,
          pendingPayment.txRefBytes32
        );
        
        // Use the contract method directly (preferred approach)
        try {
          // 1) Estimate gas (no hard-coded 200_000)
          const estimatedGas = await contract.recordPrivatePayment.estimateGas(
            productId,
            pendingPayment.memoHash,
            pendingPayment.txRefBytes32
          );
          
          // 2) Add 20% headroom for safety
          const gasLimit = (estimatedGas * 120n) / 100n;
          
          // 3) Send the transaction using the contract method
          const tx = await contract.recordPrivatePayment(
            productId,
            pendingPayment.memoHash,
            pendingPayment.txRefBytes32,
            { gasLimit }
          );
          
          toast.success('Confirming private payment on-chain...');
          
          // Wait for confirmation
          const receipt = await tx.wait();
          
          toast.success(`Private payment confirmed on-chain (tx: ${receipt.hash.slice(0, 10)}...)`);
          console.log('✅ Private payment confirmed:', receipt.hash);
          
          // Dev seller-credit removed; escrow confirmation is complete.
          
          // Remove pending receipt from backend
          try {
            await deletePendingReceipt(productId);
          } catch (error) {
            console.warn('⚠️ Failed to remove pending receipt from backend:', error);
          }
          
          // Clear pending payments state
          setPendingPrivatePayments([]);
          
          // Refresh product data
          await loadProductData();
          
        } catch (error) {
          console.error('❌ Contract transaction failed:', error);
          throw error;
        }
        
      } catch (error) {
        console.error('❌ Preflight check failed:', error);
        
        // Handle specific revert reasons
        if (String(error).includes("NotParticipant")) {
          throw new Error('Preflight failed: NotParticipant — switch to the seller account to confirm the payment.');
        }
        
        if (String(error).includes("AlreadyRecorded") || String(error).includes("already recorded") || String(error).includes("AlreadyPurchased")) {
                if (VERBOSE) {
          console.log('ℹ️ Payment already recorded on-chain, cleaning up stale receipt...');
      }
          
          // ✅ normalized comparison + cache lower-cased + lock identity
          const pendingOnChain = pendingPrivatePayments.find(
            (p) => String(p.productId) === productId.toString()
          );
          
          // Remove pending receipt from backend
          try {
            await deletePendingReceipt(productId);
          } catch (cleanupError) {
            console.warn('⚠️ Failed to remove pending receipt from backend:', cleanupError);
          }
          
          // Clear pending payments state
          setPendingPrivatePayments([]);
          
          // Show success message
          toast.success('✅ Private payment was already confirmed on-chain! Receipt cleaned up.');
          
          // Refresh product data
          await loadProductData();
          
          return; // Exit early, no need to proceed
        }
        
        throw new Error(`Preflight check failed: ${error.reason || error.message}`);
      }
      
    } catch (error) {
      console.error('Failed to confirm private payment:', error);
      toast.error(`Failed to confirm payment: ${error.message}`);
    } finally {
      setConfirmingPayment(false);
    }
  };


  /* ─────────────── Load product + VC chain ──────────────────── */
  const loadProductData = useCallback(async () => {
    if (!provider || !address) return;
    
    // Guard against multiple simultaneous executions
    if (isLoadingProduct.current) {
      return;
    }

    try {
      isLoadingProduct.current = true;
      setLoading(true);
      const contract = new ethers.Contract(address, ESCROW_ABI, provider);

    const [
      name,
      owner,
      buyer,
      purchased,
      vcCid,
      transporterAddr,
      phaseRaw,
      publicPriceWei,
      publicEnabled,
      privateEnabled,  // ⬅️ add this
    ] = await Promise.all([
      contract.name(),
      contract.owner(),
      contract.buyer(),
      contract.purchased(),
      contract.vcCid(),
      contract.transporter(),
      contract.phase(), // fetch phase from contract
      contract.publicPriceWei().catch(() => 0n), // ✅ Read public price from contract
      contract.publicEnabled().catch(() => false), // ✅ Check if public purchases are enabled
      contract.privateEnabled().catch(() => false),  // ⬅️ add this
    ]);
    const phase = typeof phaseRaw === 'bigint' ? Number(phaseRaw) : Number(phaseRaw || 0);
    
    // ✅ Set price based on publicPriceWei from contract
    let price;
    if (publicPriceWei && publicPriceWei !== 0n) {
      price = ethers.formatEther(publicPriceWei) + " ETH";
    } else {
      price = "Price hidden 🔒";
    }
    
    const priceWei = localStorage.getItem(`priceWei_${address}`);
    const priceBlinding = localStorage.getItem(`priceBlinding_${address}`);
    
    // ✅ Get stored Railgun data from localStorage
    const sellerRailgunAddress = localStorage.getItem(`sellerRailgunAddress_${address}`);
    const sellerWalletID = localStorage.getItem(`sellerWalletID_${address}`);
    
    setProduct({
      name,
      price,
      priceWei,
      priceBlinding,
      publicPriceWei,
      publicEnabled,   // <— persist
      privateEnabled,   // ⬅️ add this
      owner,
      buyer,
      purchased,
      vcCid,
      address,
      phase,
      // ✅ Include Railgun data for private payments
      sellerRailgunAddress,
      sellerWalletID,
      privatePaymentsEnabled: !!sellerRailgunAddress,
    });
    setTransporter(transporterAddr);
    
    // ✅ Update enable button state based on publicEnabled
    setShowEnableButton(!publicEnabled);
    
    // Check for pending private payments after loading product data
    // Removed duplicate call - already handled in useEffect
    
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
    isLoadingProduct.current = false;
    setLoading(false);           // ✅ add this
  }
}, [provider, address, currentUser, checkPendingPrivatePayments, VERBOSE]);   // <-- dependency list

  /* ─────────────── Derived flags (compute first!) ───────────── */
  const transporterSet = transporter && transporter !== ZERO;

  // Override product owner/buyer with correct address states (fixes wallet display bug)
  // Helpers
  const toChecksum = (a) => (a ? ethers.getAddress(a) : null);
  const checksumOrNull = (a) => (a ? ethers.getAddress(a) : null);
  const isZero = (a) => !a || /^0x0{40}$/i.test(a);

  // Sources
  const ownerAddr = toChecksum(sellerEOA || product?.owner);
  
  // ✅ new: stable buyer resolution (no unsafe fallbacks)
  const toLowerOrNull = (a) => (a ? a.toLowerCase() : null);
  
  // values you already fetch
  const ownerEOA = toLowerOrNull(ownerAddr);
  const buyerOnChain = toLowerOrNull(product?.buyer);
  // Note: buyerFromPending no longer has buyerEOA for privacy reasons
  // The backend now returns opaque handles instead
  const buyerOnChainLooksWrong = !!buyerOnChain && !!ownerEOA && buyerOnChain === ownerEOA;
  
  // ✅ stable buyer resolution (never accept owner as buyer)
  // First priority: on-chain buyer (most authoritative)
  // Second priority: last known buyer from localStorage (if available)
  // Third priority: fallback to null
  
  const confirmedBuyerFromStorage = localStorage.getItem(`confirmedBuyer_${address}`);
  const lastKnownBuyerFromStorage = confirmedBuyerFromStorage || lastKnownBuyerEOA;
  
  const displayBuyer = (buyerOnChain && !isZero(buyerOnChain) && !buyerOnChainLooksWrong)
    ? buyerOnChain
    : lastKnownBuyerFromStorage;
  
  // seller is always the contract owner
  const displayOwner = ownerAddr;
  
  // ✅ Normalize addresses for display & checks
  const displayBuyerChecksum = checksumOrNull(displayBuyer);
  const displayOwnerChecksum = checksumOrNull(displayOwner);
  
  // current connected wallet
  const me = toLowerOrNull(currentUser);

  // Derived flags (no guessing)
  let _isSeller = !!me && !!displayOwner && me === toLowerOrNull(displayOwner);
  let _isBuyer = !!me && !!displayBuyer && me === toLowerOrNull(displayBuyer);
  
  // ✅ Defensive guard: never let both roles be true
  if (_isBuyer && _isSeller) {
    // Prefer seller on the seller's own listing; buyer only if distinct.
    _isBuyer = false;
  }
  
  const isSeller = _isSeller;
  const isBuyer = _isBuyer;
  const isUnrelated = !!me && !isSeller && !isBuyer;
  
  // If your contract uses phases (e.g., 3 = shipped, 4 = delivered), prefer that:
  const isDelivered = typeof product?.phase === 'number' ? product.phase >= 4 : false;
  
  // Check if VC stages are confirmed (stage 2+ means confirmed)
  const isConfirmed = vcStages.length >= 2;
  


  // ✅ Decoupled purchase flags (fixes missing private buy button)
  const canBuyPublic =
    product?.phase === 0 &&
    !product?.purchased &&
    isUnrelated &&
    product?.publicEnabled;

  const canBuyPrivate =
    product?.phase === 0 &&
    !product?.purchased &&
    isUnrelated &&
    product?.privateEnabled; // ⬅️ new

/* you’ll also need statusLabel for the header */
const statusLabel = isDelivered
  ? "Delivered"
  : transporterSet
  ? "In Delivery"
  : product?.purchased
  ? "Purchased"
  : isConfirmed
  ? "Awaiting Bids"
  : "Created";


  /* ─────────────── Mutations ────────────────────────────────── */
  
  // 🔧 Enable public purchases if disabled
  const enablePublicPurchases = async () => {
    try {
      const signer = await provider.getSigner();
      const esc = new ethers.Contract(address, ESCROW_ABI, signer);
      
      // Safety check: only the seller can enable public purchases
      const who = await signer.getAddress();
      const owner = await esc.owner();
      if (who.toLowerCase() !== owner.toLowerCase()) {
        throw new Error('Only the seller can enable public purchases.');
      }
      
      if (typeof esc.setPublicEnabled !== 'function') {
        throw new Error('setPublicEnabled function not available on this contract. Contract may need to be redeployed.');
      }
      
      const tx = await esc.setPublicEnabled(true);
      await tx.wait();
      
      // Reload product data
      await loadProductData();
      setShowEnableButton(false); // Hide the button after enabling
    } catch (error) {
      console.error('❌ Failed to enable public purchases:', error);
      setError(`Failed to enable public purchases: ${error.message}`);
    }
  };

  // 🔒 Handle private purchase success
  const handlePrivatePurchaseSuccess = () => {
    setStatusMessage("🔒 Private transfer initiated! Waiting for seller confirmation...");
    // Refresh product data to show updated status
    loadProductData();
  };

  // ✅ Public purchase - bullet-proof handler for old/new clones
  const handleBuyPublic = async () => {
    try {
      setError(null);
      setStatusMessage("⏳ Processing public purchase...");
      
      const signer = await provider.getSigner();
      
      const esc = new ethers.Contract(address, ESCROW_ABI, signer);
      
      // ✅ 1) Fetch posted price from chain (BigInt) + basic checks
      const [phase, onchainPrice] = await Promise.all([
        esc.phase().catch(() => 999),
        esc.publicPriceWei().catch(() => 0n),
      ]);


      
      if (onchainPrice === 0n) {
        setError("Seller has not set a public price yet.");
        return;
      }
      if (Number(phase) !== 0) { // Phase.Listed === 0 in your enum
        setError("This product is no longer listed for public purchase.");
        return;
      }
      
      // ✅ 2) Feature-detect the correct function name on this clone
      const hasPurchasePublic = typeof esc.purchasePublic === "function";
      const hasPublicPurchase = typeof esc.publicPurchase === "function"; // old name fallback
      
      if (!hasPurchasePublic && !hasPublicPurchase) {
        setError("This product contract does not support public purchase (old clone?).");
        return;
      }
        
        // ✅ CRITICAL: Block purchase if public is disabled
      try {
        const publicEnabled = await esc.publicEnabled().catch(() => false);
        if (!publicEnabled) {
          setError("Public purchases are disabled for this product. Click 'Enable Public Purchases' to fix this.");
          setShowEnableButton(true);
          return;
        }
      } catch (e) {
        console.warn("Could not check if public purchases are enabled:", e);
      }

      // ✅ CRITICAL: Manually construct and send transaction for v6 compatibility
      let tx;
      if (typeof esc.purchasePublic === 'function') {
        // Manually construct the transaction
        const transactionRequest = {
          to: esc.target,
          value: onchainPrice,
          gasLimit: 500000n,
          data: esc.interface.encodeFunctionData("purchasePublic", [])
        };
        
        tx = await signer.sendTransaction(transactionRequest);
        
      } else if (typeof esc.publicPurchase === 'function') { // fallback for older clones
        // Manually construct the transaction
        const transactionRequest = {
          to: esc.target,
          value: onchainPrice,
          gasLimit: 500000n,
          data: esc.interface.encodeFunctionData("publicPurchase", [])
        };
        
        tx = await signer.sendTransaction(transactionRequest);
        
      } else {
        setError("This clone doesn't expose a public purchase function.");
        return;
      }
      setStatusMessage("✅ Public purchase complete!");
      loadProductData();
    } catch (err) {
      const reason = err?.shortMessage || err?.info?.error?.message || err?.message || String(err);
      console.error("Public purchase failed:", err);
      setError(`Buy failed: ${reason}`);
    }
  };

  // ✅ Private purchase - Railgun flow + recordPrivatePayment
  const handleBuyPrivate = async () => {
    try {
      setStatusMessage("⏳ Initiating private purchase...");
      await openPrivatePaymentModal();
    } catch (err) {
      setError("Private purchase failed – see console");
      console.error(err);
    }
  };

  // Legacy function - keep for compatibility but redirect to public
  const handleBuyProduct = async () => {
    await handleBuyPublic();
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
        id: `did:ethr:${VC_CHAIN}:${sellerAddr}`,
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
      if (VERBOSE) {
      console.log("[ProductDetail] VC to sign (with price as string):", vc);
      }

      // Sign the VC as issuer (Stage 2)
      const issuerProof = await signVcAsSeller(vc, signer);
      vc.proofs = { issuerProof };
      if (VERBOSE) {
      console.log("[ProductDetail] Issuer proof:", issuerProof);
      }

      // Upload the intermediate VC (Stage 2) to IPFS and update the contract's vcCid
      const newCid = await uploadJson(vc);
      if (VERBOSE) {
      console.log("[ProductDetail] Uploaded VC CID:", newCid);
      }
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
      const esc = new ethers.Contract(address, ESCROW_ABI, signer);
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
      const esc = new ethers.Contract(address, ESCROW_ABI, signer);
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
      if (VERBOSE) {
      console.log('[DEBUG] VC draft after buyer builds:', draftVC);
      console.log('[DEBUG] VC draft proof array:', draftVC.proof);
      }
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
      if (VERBOSE) {
      console.log('[DEBUG] VC after seller signs:', canonicalVcObj);
      console.log('[DEBUG] VC proof array after seller signs:', canonicalVcObj.proof);
      }
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
      if (VERBOSE) {
      console.log('[DEBUG] VC before buyer signs:', canonicalVcObj);
      console.log('[DEBUG] VC proof array before buyer signs:', canonicalVcObj.proof);
      }
      // Buyer signs
      setStatusMessage('✍️ Buyer signing VC...');
      const signer = await provider.getSigner();
      const buyerProof = await signVcWithMetamask(canonicalVcObj, signer);
      canonicalVcObj.proof.push(buyerProof);
      // Debug log after buyer signs
      if (VERBOSE) {
      console.log('[DEBUG] VC after buyer signs:', canonicalVcObj);
      console.log('[DEBUG] VC proof array after buyer signs:', canonicalVcObj.proof);
      }
      // Canonicalize again and upload to IPFS
      canonicalVcJson = freezeVcJson(canonicalVcObj);
      setStatusMessage('📤 Uploading final VC to IPFS...');
      const vcCID = await uploadJson(JSON.parse(canonicalVcJson));
      if (VERBOSE) {
      console.log('[ProductDetail] Uploaded final VC CID:', vcCID);
      }
      // Continue with on-chain delivery confirmation, etc.
      const revealedValue = ethers.toBigInt(product.priceWei);
      const blinding = product.priceBlinding;
      if (!revealedValue || !blinding) {
        setError('Missing price or blinding factor for delivery confirmation.');
        return;
      }
      setStatusMessage('⏳ Confirming delivery on-chain...');
      const esc = new ethers.Contract(product.address, ESCROW_ABI, signer);
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

  // Load product data and check pending payments
  useEffect(() => {
    if (!address) return;
    
    // 🔒 Phase 0: Clean up legacy buyer identity data for privacy
    const cleanupLegacyBuyerData = () => {
      try {
        // Remove any legacy buyer EOA data from pending receipts
        const legacyKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('memo_') || key.startsWith('pending_private_payment_') || key.startsWith('confirmedBuyer_'))) {
            legacyKeys.push(key);
          }
        }
        
        if (legacyKeys.length > 0) {
          legacyKeys.forEach(key => localStorage.removeItem(key));
        }
      } catch (error) {
        console.warn('⚠️ Failed to cleanup legacy buyer data:', error);
      }
    };
    
    cleanupLegacyBuyerData();
    loadProductData();
    checkPendingPrivatePayments(); // it already has guards
    
    // Release identity lock if we can read a non-zero buyer from chain
    if (identityLocked && product?.buyer && product.buyer !== ethers.ZeroAddress) {
      const b = product.buyer.toLowerCase();
      const o = (sellerEOA ?? product.owner)?.toLowerCase?.();
      if (!o || b !== o) {
        setIdentityLocked(false);
      }
    }
  }, [address, currentUser, loadProductData, checkPendingPrivatePayments, identityLocked, product?.buyer, product?.owner, sellerEOA]);

  // Populate separate buyer and seller address states (correct sources)
  useEffect(() => {
    if (!address || !currentUser || !provider) return;
    
    // Don't blow away displayBuyer while the page settles post-confirm
    if (identityLocked) {
      return;
    }
    
    let cancelled = false;

    (async () => {
      // ✅ Prevent multiple simultaneous executions using ref
      if (isPopulatingAddresses.current) {
        return;
      }
      isPopulatingAddresses.current = true;

      try {
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(address, ESCROW_ABI, signer);

        // Read seller from chain (contract.owner())
        const ownerAddr = await contract.owner();

        // Seller = contract owner (always correct)
        const sellerAddr = ethers.getAddress(ownerAddr);
        
        // Buyer = only from contract if it exists and is non-zero
        let buyerAddrFromChain = ethers.ZeroAddress;
        try {
          const chainBuyer = await contract.buyer();
          if (chainBuyer && chainBuyer !== ethers.ZeroAddress) {
            buyerAddrFromChain = ethers.getAddress(chainBuyer);
          }
        } catch {}
        
        // ✅ Use stable buyer source to prevent Railgun mirroring
        const buyerEOAStable =
          (buyerAddrFromChain !== ethers.ZeroAddress &&
           buyerAddrFromChain.toLowerCase() !== ownerAddr.toLowerCase())
            ? buyerAddrFromChain
            : (lastKnownBuyer ? ethers.getAddress(lastKnownBuyer) : null);
        
        if (!cancelled) {
          setSellerEOA(sellerAddr);
          setBuyerEOA(buyerEOAStable); // null means "no buyer yet"
        }

        // Optional: detect mismatch between signer and currentUser (helps diagnose)
        const signerAddr = await signer.getAddress();
        if (signerAddr.toLowerCase() !== currentUser.toLowerCase()) {
          console.warn("⚠️ Signer/currentUser mismatch", { signerAddr, currentUser });
        }

        // Helper to resolve a Railgun address from backend wallet-info API
        const resolveRailgun = async (eoa) => {
          try {
            // ✅ FIXED: Use correct endpoint /api/railgun/wallet-info?userAddress=<EOA>
            const r = await fetch(`${RAILGUN_API_BASE}/api/railgun/wallet-info?userAddress=${eoa}`);
            const j = await r.json();
            // Expecting { success: true, data: { railgunAddress: "0x..." } }
            return j?.success && j?.data?.railgunAddress ? j.data.railgunAddress : null;
          } catch {
            return null;
          }
        };

        // Resolve Railgun addresses for both parties (best-effort)
        if (!cancelled) {
          const [sellerRGN, buyerRGN] = await Promise.all([
            resolveRailgun(ownerAddr),
            // ✅ Use stable buyer source for Railgun resolution
            buyerEOAStable ? resolveRailgun(buyerEOAStable) : Promise.resolve(null),
          ]);
          setSellerRailgun(sellerRGN);
          setBuyerRailgun(buyerRGN);
        }
              } catch (error) {
          console.error('❌ Failed to populate address states:', error);
        } finally {
          isPopulatingAddresses.current = false;
        }
    })();

    return () => { cancelled = true; };
  }, [address, currentUser, provider, identityLocked, lastKnownBuyer]);

  // Reset address-derived state when product address changes
  const prevAddressRef = useRef(null);
  useEffect(() => {
    const prev = prevAddressRef.current;
    if (prev && prev !== address) {
      localStorage.removeItem(`confirmedBuyer_${prev}`);
    }
    prevAddressRef.current = address;
    
    // reset per-product state
    setBuyerEOA(null);
    setSellerEOA(null);
    setBuyerRailgun(null);
    setSellerRailgun(null);
    setLastKnownBuyer(null);
    setLastKnownBuyerEOA(null);
    setIdentityLocked(false);
  }, [address]);

  // Resolve buyer's Railgun address when we have a pending payment with buyer's ETH address
  useEffect(() => {
    if (pendingPrivatePayments.length > 0 && pendingPrivatePayments[0]?.buyerAddress && !buyerRailgun) {
      const resolveBuyerRailgun = async () => {
        try {
          const response = await fetch(`${RAILGUN_API_BASE}/api/railgun/wallet-info?userAddress=${pendingPrivatePayments[0].buyerAddress}`);
          const result = await response.json();
          if (result?.success && result?.data?.railgunAddress) {
            setBuyerRailgun(result.data.railgunAddress);
          }
        } catch (error) {
          console.warn('⚠️ Failed to resolve buyer Railgun address:', error);
        }
      };
      
      resolveBuyerRailgun();
    }
  }, [pendingPrivatePayments, buyerRailgun]);




/* ─── Poll until Stage-1 VC is fetched or a transporter is set ─── */
useEffect(() => {
  if (!product) return;
  const shouldPoll =
    product.purchased && vcStages.length === 1 && !transporterSet;
  if (!shouldPoll) return;

  const id = setInterval(loadProductData, 5000);
  return () => clearInterval(id);
}, [product, vcStages.length, transporterSet, loadProductData]);



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
          <span className="font-semibold">Owner:</span> {displayOwner}
        </p>
        {displayBuyerChecksum && !isZero(displayBuyerChecksum) ? (
          <p className="text-sm text-gray-600">
            <span className="font-semibold">Buyer:</span> {displayBuyerChecksum}
          </p>
        ) : (
          <p className="text-sm text-gray-600">
            <span className="font-semibold">Buyer:</span>{" "}
            <span className="text-gray-400 italic">No buyer yet</span>
          </p>
        )}
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

    {/* Alerts */}
    {statusMessage && <p className="text-blue-600">{statusMessage}</p>}
    {error && <p className="text-red-600">{error}</p>}
    
    {showEnableButton && isSeller && (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h4 className="font-semibold text-yellow-800 mb-2">⚠️ Public Purchases Disabled</h4>
        <p className="text-yellow-700 mb-3">This product can only be purchased privately. Enable public purchases to allow direct ETH payments.</p>
        <Button onClick={enablePublicPurchases} className="bg-yellow-600 hover:bg-yellow-700">
          🔓 Enable Public Purchases
        </Button>
      </div>
    )}

    {/* ────────── Pending Private Payments (Seller View) ───────── */}
    {pendingPrivatePayments.length > 0 && (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h4 className="font-semibold text-blue-800 mb-3">
          🔒 Pending Private Payment Confirmation
        </h4>
        
        {/* General Wallet Information */}
        <div className="mb-4 p-3 bg-white rounded border">
          <h5 className="font-semibold text-sm text-gray-700 mb-2">🔐 Current Wallet Configuration</h5>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <strong className="text-gray-600">Connected Account:</strong><br/>
              <span className="font-mono text-gray-800">{currentUser ? `${currentUser.slice(0, 6)}...${currentUser.slice(-4)}` : 'Not connected'}</span>
            </div>
            <div>
              <strong className="text-gray-600">Product Owner:</strong><br/>
              <span className="font-mono text-gray-800">{displayOwner ? `${displayOwner.slice(0, 6)}...${displayOwner.slice(-4)}` : 'Loading...'}</span>
            </div>
          </div>
        </div>
        
        <p className="text-blue-700 text-sm mb-3">
          A buyer has completed a private transfer. You need to confirm it on-chain to complete the transaction.
        </p>
        {pendingPrivatePayments.map((payment, index) => {
          // Guard logic: only show if owner, private enabled, and has pending receipt
          const canConfirm = currentUser && 
            currentUser.toLowerCase() === product.owner.toLowerCase() && 
            payment && 
            !confirmingPayment;
          
          return (
            <div key={index} className="bg-white p-3 rounded border mb-3">
              {/* Wallet Information Section */}
              <div className="mb-3 p-2 bg-gray-50 rounded">
                <h5 className="font-semibold text-sm text-gray-700 mb-2">🔐 Wallet Addresses</h5>
                
                {/* Buyer Information */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-gray-600">
                    <strong>Receipt (opaque):</strong><br/>
                    <span className="font-mono">
                      {payment?.opaqueHandle
                        ? `${payment.opaqueHandle.slice(0, 10)}…`
                        : payment?.txRefBytes32
                          ? `${payment.txRefBytes32.slice(0, 10)}…`
                          : 'Pending'}
                    </span>
                  </div>
                  <div className="text-gray-600">
                    <strong>Buyer ETH Wallet:</strong><br/>
                    <span className="font-mono">
                      {payment?.buyerAddress ? 
                        `${payment.buyerAddress.slice(0, 6)}...${payment.buyerAddress.slice(-4)}` : 
                        'Unknown'
                      }
                    </span>
                  </div>
                </div>
                
                {/* Buyer Railgun Information */}
                <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                  <div className="text-gray-600">
                    <strong>Buyer Railgun:</strong><br/>
                    <span className="font-mono">
                      {buyerRailgun ? 
                        `${buyerRailgun.slice(0, 6)}...${buyerRailgun.slice(-4)}` : 
                        'Resolving...'
                      }
                    </span>
                  </div>
                  <div className="text-gray-600">
                    <strong>Status:</strong><br/>
                    <span className="text-blue-600 font-medium">Awaiting Seller Confirmation</span>
                  </div>
                </div>
                
                {/* Seller Information */}
                <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                  <div className="text-gray-600">
                    <strong>Seller EOA:</strong><br/>
                    <span className="font-mono">{sellerEOA ? `${sellerEOA.slice(0, 6)}...${sellerEOA.slice(-4)}` : 'Loading...'}</span>
                  </div>
                  <div className="text-gray-600">
                    <strong>Seller Railgun:</strong><br/>
                    <span className="font-mono">{sellerRailgun ? `${sellerRailgun.slice(0, 6)}...${sellerRailgun.slice(-4)}` : 'Loading...'}</span>
                  </div>
                </div>
              </div>
              
              {/* Payment Details */}
              <div className="text-sm text-gray-600 mb-2">
                <strong>Amount:</strong> {payment.amountWei ? `${ethers.formatEther(payment.amountWei)} ETH` : 'N/A'}
              </div>
              <div className="text-sm text-gray-600 mb-2">
                <strong>Memo Hash:</strong> {payment.memoHash ? `${payment.memoHash.slice(0, 20)}...` : 'N/A'}
              </div>
              <div className="text-sm text-gray-600 mb-3">
                <strong>Transaction Ref:</strong> {payment.txRefBytes32 ? `${payment.txRefBytes32.slice(0, 20)}...` : 'N/A'}
              </div>
              <Button 
                onClick={() => confirmPrivatePayment(payment)}
                disabled={!canConfirm || confirmingPayment}
                className="bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {confirmingPayment ? (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Confirming...</span>
                  </div>
                ) : (
                  '✅ Confirm Private Payment'
                )}
              </Button>
            </div>
          );
        })}
      </div>
    )}

      {/* ────────── Action panel (Buy / Bids / Delivery) ───────── */}
      {(canBuyPublic || canBuyPrivate) && (
        <div className="space-y-2">
          <h4 className="font-semibold">Purchase Options</h4>
          <div className="flex gap-2">
            {canBuyPublic && (
              <Button onClick={handleBuyPublic} className="bg-blue-600 hover:bg-blue-700">
                🔓 Buy Publicly ({product.publicPriceWei ? ethers.formatEther(product.publicPriceWei) + " ETH" : "Price hidden"})
              </Button>
            )}
            {canBuyPrivate && (
              <Button 
                onClick={openPrivatePaymentModal} 
                variant="outline" 
              className="bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
              >
                🔒 Buy Privately
              </Button>
            )}
          </div>
        </div>
      )}
      
      {/* ────────── Seller Actions ───────── */}
      {isSeller && !product.purchased && (
        <div className="space-y-2">
          <h4 className="font-semibold">Seller Actions</h4>
          <div className="flex gap-2">
            {/* Removed duplicate button - already shown in pending payments section */}
          </div>
        </div>
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

      {/* ────────── Private Payment Modal ───────── */}
      <PrivatePaymentModal
        product={product}
        isOpen={showPrivatePaymentModal}
        onClose={() => setShowPrivatePaymentModal(false)}
        onSuccess={handlePrivatePurchaseSuccess}
        currentUser={currentUser}
      />
    </div>
  );
};

export default ProductDetail;
