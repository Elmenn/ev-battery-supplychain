import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { ethers } from "ethers";
import { getCurrentCid, confirmOrder } from "../../utils/web3Utils";
import { uploadJson } from "../../utils/ipfs";
import { buildStage2VC, buildStage3VC, freezeVcJson } from "../../utils/vcBuilder.mjs";
import { signVcAsSeller } from "../../utils/signVcWithMetamask";
import { signVcWithMetamask } from "../../utils/signVcWithMetamask";
import debugReveal from "../../debugCommitment";
import { generateCommitmentWithBindingTag, verifyCommitmentMatch, generateDeterministicBlinding, generateTxHashCommitmentBindingTag } from "../../utils/commitmentUtils";
import { saveAs } from 'file-saver'; // For optional file download (npm install file-saver)
import toast from 'react-hot-toast';
import ProductEscrowABI from "../../abis/ProductEscrow_Initializer.json";
import VCViewer from "../../components/vc/VCViewer";
import VerifyVCInline from "../../components/vc/VerifyVCInline";
import ProvenanceChainViewer from "../../components/vc/ProvenanceChainViewer";
import PrivatePaymentModal from "../railgun/PrivatePaymentModal";
import { Button } from "../ui/button";
import { Tabs, Tab } from "../ui/Tabs";
import { Eye, EyeOff } from "lucide-react";

// Copyable component (same as in VCViewer)
function truncate(text, length = 12) {
  if (!text || text.length <= length) return text;
  const start = text.slice(0, 6);
  const end = text.slice(-4);
  return `${start}…${end}`;
}

function Copyable({ value }) {
  return (
    <span
      className="copyable"
      title={value}
      onClick={() => navigator.clipboard.writeText(value)}
    >
      {truncate(value)}
    </span>
  );
}

// Extract the actual ABI array from the imported JSON
const ESCROW_ABI = ProductEscrowABI.abi;
const VC_CHAIN =
  process.env.REACT_APP_CHAIN_ID ||
  process.env.REACT_APP_CHAIN_ALIAS ||
  process.env.REACT_APP_NETWORK_ID ||
  "1337";

const rawRailgunApiBase = (process.env.REACT_APP_RAILGUN_API_URL || '').trim();
const RAILGUN_API_BASE = rawRailgunApiBase.length > 0 ? rawRailgunApiBase : null;
const IS_RAILGUN_API_CONFIGURED = !!RAILGUN_API_BASE;

// Utility function for safe JSON serialization (handles BigInt)
const safeJSON = (x) => JSON.parse(JSON.stringify(x, (_, v) =>
  typeof v === 'bigint' ? v.toString() : v
));

const ZERO = "0x0000000000000000000000000000000000000000";

const ProductDetail = ({ provider, currentUser, onConfirmDelivery }) => {
  // quick helper to gate private UI
  const checkRailgunReady = useCallback(async () => {
    if (!IS_RAILGUN_API_CONFIGURED) {
      return false;
    }
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
      toast.error('Private flow temporarily unavailable (Railgun engine offline).');
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
  const [provenanceVC, setProvenanceVC] = useState(null);
  const [provenanceLoading, setProvenanceLoading] = useState(false);
  
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
    if (!IS_RAILGUN_API_CONFIGURED || deletingReceipt) {
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
    if (!address || !currentUser || !IS_RAILGUN_API_CONFIGURED) {
      setPendingPrivatePayments([]);
      return;
    }
    
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
    if (!IS_RAILGUN_API_CONFIGURED) {
      toast.error('Private payments are disabled (Railgun API offline).');
      return;
    }
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
      publicPriceCommitment,
      commitmentFrozen,
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
      contract.publicPriceCommitment().catch(() => "0x" + "0".repeat(64)), // ✅ Read on-chain commitment
      contract.commitmentFrozen().catch(() => false), // ✅ Read commitment frozen status
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
      seller: owner.toLowerCase(), // ✅ Add seller field (same as owner for consistency)
      publicPriceCommitment, // ✅ Store on-chain commitment
      commitmentFrozen, // ✅ Store commitment frozen status
      publicEnabled,   // <— persist
      privateEnabled: privateEnabled && IS_RAILGUN_API_CONFIGURED,   // ⬅️ add this
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
    
    // ✅ Log commitment status for debugging
    if (publicPriceCommitment && publicPriceCommitment !== "0x" + "0".repeat(64)) {
      console.log('✅ Commitment loaded:', {
        commitment: publicPriceCommitment,
        frozen: commitmentFrozen,
        price: ethers.formatEther(publicPriceWei || 0n) + ' ETH'
      });
    }
    setTransporter(transporterAddr);
    
    // ✅ Update enable button state based on publicEnabled
    setShowEnableButton(!publicEnabled);
    
    // Check for pending private payments after loading product data
    // Removed duplicate call - already handled in useEffect
    
    /* walk the VC chain (stage-0 → stage-n) */
    const chain = [];
    let cid = vcCid;
    
    // Note: No need to check localStorage anymore - the on-chain CID is now updated
    // The contract's updateVcCidAfterDelivery ensures the on-chain CID points to the VC with TX hash commitment
    
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

    // ✅ Load VC draft and seller signed state from localStorage (product-specific)
    const vcDraftKey = `vcDraft_${address}`;
    const vcSellerSignedKey = `vcSellerSigned_${address}`;
    const vcDraftJson = localStorage.getItem(vcDraftKey);
    const vcSellerSignedJson = localStorage.getItem(vcSellerSignedKey);
    setVcDraftSaved(!!vcDraftJson);
    setVcSellerSigned(!!vcSellerSignedJson);
    if (vcDraftJson) {
      try {
        setVcDraft(JSON.parse(vcDraftJson));
      } catch (e) {
        console.warn('Failed to parse VC draft from localStorage:', e);
      }
    }
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
    product?.privateEnabled &&
    IS_RAILGUN_API_CONFIGURED; // ⬅️ require API availability

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
      console.log('[Flow][Buyer] Step 2: Buyer initiating public purchase at listed price.');
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
      console.log('[Flow][Buyer] Step 2 → Contract reports price in wei:', onchainPrice.toString());
      
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
          console.log('[Flow][Buyer] Step 2 → Purchase blocked: publicEnabled flag is false.');
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
      console.log('[Flow][Buyer] Step 2 → Transaction sent, hash:', tx.hash);
      
      // Show transaction hash and link to block explorer
      const chainId = await provider.getNetwork().then(n => n.chainId);
      const explorerUrl = chainId === 11155111n 
        ? `https://sepolia.etherscan.io/tx/${tx.hash}`
        : chainId === 1337n || chainId === 5777n
        ? `#` // Local network, no explorer
        : `https://etherscan.io/tx/${tx.hash}`;
      
      // Show transaction hash with link
      const txHashShort = `${tx.hash.slice(0, 10)}...${tx.hash.slice(-8)}`;
      if (explorerUrl !== '#') {
        setStatusMessage(`⏳ Transaction submitted! Hash: ${txHashShort} - View on explorer: ${explorerUrl}`);
      } else {
        setStatusMessage(`⏳ Transaction submitted! Hash: ${txHashShort}`);
      }
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      console.log('[Flow][Buyer] Step 2 → Purchase transaction confirmed, hash:', tx.hash);
      
      // Generate purchase TX hash commitment for privacy (Phase 1 + Feature 2: Linkable Commitment)
      setStatusMessage('🔐 Generating purchase TX hash commitment with binding tag...');
      try {
        // Feature 2: Generate binding tag for linking purchase and delivery TX commitments
        const buyerAddr = await signer.getAddress();
        const chainId = await provider.getNetwork().then(n => n.chainId);
        let productId;
        try {
          productId = await esc.id();
        } catch (error) {
          console.warn("⚠️ Could not fetch product ID for binding tag:", error);
          productId = null;
        }
        
        let bindingTag = null;
        if (productId !== null) {
          try {
            bindingTag = generateTxHashCommitmentBindingTag({
              chainId: chainId.toString(),
              escrowAddr: address,
              productId: productId.toString(),
              buyerAddress: buyerAddr,
            });
            console.log('[Flow][Buyer] Step 2 → Generated binding tag for purchase TX hash commitment');
          } catch (err) {
            console.warn("⚠️ Failed to generate binding tag:", err);
            // Continue without binding tag (backward compatible)
          }
        }
        
        const zkpBackendUrl = process.env.REACT_APP_ZKP_BACKEND_URL || 'http://localhost:5010';
        const requestBody = {
          tx_hash: tx.hash,
          ...(bindingTag ? { binding_tag_hex: `0x${bindingTag}` } : {}),
        };
        
        const zkpRes = await fetch(`${zkpBackendUrl}/zkp/commit-tx-hash`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        const { commitment, proof, verified } = await zkpRes.json();
        if (!verified) {
          console.warn("⚠️ Purchase TX hash commitment verification failed, but continuing...");
        } else {
          // Store purchase TX hash commitment temporarily for seller to include in Stage 1 VC
          const purchaseTxCommitmentKey = `purchase_tx_commitment_${address}`;
          localStorage.setItem(purchaseTxCommitmentKey, JSON.stringify({
            commitment,
            proof,
            protocol: "bulletproofs-pedersen",
            version: "1.0",
            encoding: "hex",
            bindingTag: bindingTag ? `0x${bindingTag}` : null, // Feature 2: Store binding tag
            txHash: tx.hash, // Store for reference (will be removed from VC)
            timestamp: Date.now(),
          }));
          console.log('[Flow][Buyer] Step 2 → Purchase TX hash commitment stored for Stage 1 VC', bindingTag ? '(with binding tag)' : '(without binding tag)');
        }
      } catch (err) {
        console.warn("⚠️ Failed to generate purchase TX hash commitment:", err);
        // Continue anyway - commitment is optional for now
      }
      
      setStatusMessage("✅ Public purchase complete!");
      loadProductData();
    } catch (err) {
      // Better error messages
      let errorMsg = "Purchase failed";
      const reason = err?.shortMessage || err?.info?.error?.message || err?.message || String(err);
      
      if (reason.includes("user rejected") || reason.includes("User denied")) {
        errorMsg = "Transaction was cancelled. Please try again.";
      } else if (reason.includes("insufficient funds") || reason.includes("insufficient balance")) {
        errorMsg = "Insufficient funds. Please add more ETH to your wallet.";
      } else if (reason.includes("gas") || reason.includes("intrinsic gas")) {
        errorMsg = "Transaction failed due to gas estimation. Please try again.";
      } else if (reason.includes("network") || reason.includes("connection")) {
        errorMsg = "Network error. Please check your connection and try again.";
      } else if (reason.includes("nonce")) {
        errorMsg = "Transaction nonce error. Please wait a moment and try again.";
      } else {
        errorMsg = `Purchase failed: ${reason}`;
      }
      
      console.error("Public purchase failed:", err);
      setError(errorMsg);
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
      console.log('[Flow][Seller] Step 3: Seller confirming order and issuing Stage 2 VC.');
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

      // Build the price object for stage 2 - preserve ZKP proof from Stage 0
      let priceObj = { hidden: true };
      
      // Extract ZKP proof from Stage 0 VC if present
      try {
        let stage0Price = stage0?.credentialSubject?.price;
        if (typeof stage0Price === "string") {
          try {
            stage0Price = JSON.parse(stage0Price);
          } catch {
            stage0Price = {};
          }
        }
        
        if (stage0Price?.zkpProof) {
          // Preserve the ZKP proof from Stage 0
          priceObj = {
            hidden: true,
            zkpProof: stage0Price.zkpProof
          };
          console.log('[Flow][Seller] Step 3 → Preserved ZKP proof from Stage 0 VC');
        } else {
          console.warn('[Flow][Seller] Step 3 → No ZKP proof found in Stage 0 VC, price will be hidden without proof');
        }
      } catch (err) {
        console.warn("⚠️ Failed to extract ZKP proof from Stage 0:", err);
        // Continue with hidden price without ZKP proof
      }

      // Retrieve purchase TX hash commitment if available (Phase 1 + Feature 2)
      let purchaseTxHashCommitment = null;
      let purchaseBindingTag = null; // Feature 2: Store binding tag for later use in delivery
      try {
        const purchaseTxCommitmentKey = `purchase_tx_commitment_${address}`;
        const storedCommitment = localStorage.getItem(purchaseTxCommitmentKey);
        if (storedCommitment) {
          const commitmentData = JSON.parse(storedCommitment);
          // Extract only the commitment fields (exclude txHash and timestamp)
          purchaseTxHashCommitment = {
            commitment: commitmentData.commitment,
            proof: commitmentData.proof,
            protocol: commitmentData.protocol,
            version: commitmentData.version,
            encoding: commitmentData.encoding,
            ...(commitmentData.bindingTag ? { bindingTag: commitmentData.bindingTag } : {}), // Feature 2: Include binding tag
          };
          // Feature 2: Store binding tag for later use in delivery
          if (commitmentData.bindingTag) {
            purchaseBindingTag = commitmentData.bindingTag;
            // Store binding tag for delivery flow
            const bindingTagKey = `tx_hash_binding_tag_${address}`;
            localStorage.setItem(bindingTagKey, purchaseBindingTag);
            console.log('[Flow][Seller] Step 3 → Stored binding tag for delivery TX hash commitment');
          }
          console.log('[Flow][Seller] Step 3 → Found purchase TX hash commitment, will include in Stage 1 VC', purchaseBindingTag ? '(with binding tag)' : '(without binding tag)');
          // Clean up localStorage after retrieving
          localStorage.removeItem(purchaseTxCommitmentKey);
        }
      } catch (err) {
        console.warn("⚠️ Failed to retrieve purchase TX hash commitment:", err);
        // Continue anyway - commitment is optional
      }

      // Build the VC for stage 1
      const vc = buildStage2VC({
        stage0,
        stage0Cid: currentCid,
        buyerAddr: product.buyer,
        sellerAddr,
        purchaseTxHashCommitment, // Phase 1: Include purchase TX hash commitment
      });
      vc.issuer = {
        id: `did:ethr:${VC_CHAIN}:${sellerAddr}`,
        name: "Seller",
      };
      vc.credentialSubject.price = priceObj;

      // Normalize all string fields to non-null strings
      const cs = vc.credentialSubject;
      const stringFields = [
        "id", "productName", "batch", "previousCredential"
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
      // Sign with contract address for verifyingContract binding
      const issuerProof = await signVcAsSeller(vc, signer, address);
      
      // Set proofs in both formats for compatibility (backend supports both)
      vc.proofs = { issuerProof };
      vc.proof = [issuerProof]; // Also set proof array format for W3C compatibility
      
      if (VERBOSE) {
      console.log("[ProductDetail] Issuer proof:", issuerProof);
      console.log("[ProductDetail] VC with proofs:", JSON.stringify(vc, null, 2));
      }

      console.log('[Flow][Seller] Step 3 → Stage 2 VC signed, uploading to IPFS.');
      // Upload the intermediate VC (Stage 2) to IPFS and update the contract's vcCid
      const newCid = await uploadJson(vc);
      if (VERBOSE) {
      console.log("[ProductDetail] Uploaded VC CID:", newCid);
      }
      
      // Extract purchase TX hash commitment for on-chain event emission (Feature 1: Purchase Transaction Verification)
      let purchaseTxHashCommitmentBytes32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
      if (purchaseTxHashCommitment?.commitment) {
        // Ensure commitment is properly formatted as bytes32 (64 hex chars with 0x prefix)
        let commitmentHex = purchaseTxHashCommitment.commitment.replace(/^0x/, '');
        if (commitmentHex.length === 64) {
          purchaseTxHashCommitmentBytes32 = "0x" + commitmentHex;
          console.log('[Flow][Seller] Step 3 → Extracted purchase TX hash commitment for event emission:', purchaseTxHashCommitmentBytes32);
        } else {
          console.warn('[Flow][Seller] Step 3 → Invalid purchase TX hash commitment length, using zero commitment');
        }
      }
      
      const tx = await confirmOrder(address, newCid, purchaseTxHashCommitmentBytes32);
      console.log('[Flow][Seller] Step 3 → Order confirmed on-chain, tx hash:', tx.hash);
      if (purchaseTxHashCommitmentBytes32 !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
        console.log('[Flow][Seller] ✅ Purchase TX hash commitment is now stored on-chain and event emitted for verification');
      }
      
      // Show transaction hash
      const chainId = await provider.getNetwork().then(n => n.chainId);
      setStatusMessage(`⏳ Confirming order... Transaction: ${tx.hash.slice(0, 10)}...${tx.hash.slice(-8)}`);
      await tx.wait();

      loadProductData();
      setStatusMessage("✅ Order confirmed");
    } catch (err) {
      // Better error messages
      let errorMsg = "Failed to confirm order";
      const reason = err?.shortMessage || err?.info?.error?.message || err?.message || String(err);
      
      if (reason.includes("user rejected") || reason.includes("User denied")) {
        errorMsg = "Transaction was cancelled. Please try again.";
      } else if (reason.includes("insufficient funds")) {
        errorMsg = "Insufficient funds. Please add more ETH to your wallet.";
      } else if (reason.includes("gas")) {
        errorMsg = "Transaction failed due to gas estimation. Please try again.";
      } else if (reason.includes("network") || reason.includes("connection")) {
        errorMsg = "Network error. Please check your connection and try again.";
      } else {
        errorMsg = `Failed to confirm order: ${reason}`;
      }
      
      console.error(err);
      setError(errorMsg);
      setStatusMessage("");
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
      console.log('[Flow][Buyer] Step 4: Buyer building Stage 3 VC draft with fresh ZKP.');
      setStatusMessage('🔏 Building VC draft with ZKP...');
      const signer = await provider.getSigner();
      const buyerAddr = await signer.getAddress();
      
      // Get seller address from contract
      const contract = new ethers.Contract(address, ESCROW_ABI, provider);
      const sellerAddr = await contract.owner();
      const normalizedSellerAddr = ethers.getAddress(sellerAddr);
      const normalizedProductAddr = ethers.getAddress(address);
      
      // Fetch the latest Stage 2 VC from IPFS
      const stage2Cid = product.vcCid;
      const stage2 = await fetch(`https://ipfs.io/ipfs/${stage2Cid}`).then(r => r.json());
      
      // ✅ Fetch product ID from contract
      setStatusMessage('📋 Fetching product ID...');
      let productId;
      try {
        productId = await contract.id();
        console.log("✅ Product ID:", productId.toString());
      } catch (error) {
        console.error("❌ Failed to fetch product ID:", error);
        throw new Error("Failed to fetch product ID: " + error.message);
      }
      
      // ✅ Extract binding context from Stage 2 VC (if available) or generate new one
      // For Stage 3 (Delivery Credential), we use Stage 2 as the previous stage
      let bindingContext;
      let bindingTag;
      
      // Try to extract binding context from Stage 2 VC's price object
      try {
        const stage2Price = typeof stage2.credentialSubject?.price === 'string' 
          ? JSON.parse(stage2.credentialSubject.price) 
          : stage2.credentialSubject?.price;
        
        if (stage2Price?.zkpProof?.bindingContext) {
          // Use binding context from Stage 2 VC
          bindingContext = stage2Price.zkpProof.bindingContext;
          console.log("✅ Extracted binding context from Stage 2 VC:", bindingContext);
        }
      } catch (error) {
        console.warn("⚠️ Could not extract binding context from Stage 2 VC:", error);
      }
      
      // If no binding context found, create one for Stage 3
      if (!bindingContext) {
        bindingContext = {
          chainId: VC_CHAIN,
          escrowAddr: normalizedProductAddr,
          productId: productId.toString(),
          stage: 2, // Stage 3 uses Stage 2 as previous stage
          schemaVersion: "1.0",
        };
        console.log("✅ Created new binding context for Stage 3:", bindingContext);
      }
      
      // ✅ Generate ZKP with binding tag (Stage 3: Delivery Credential)
      setStatusMessage('🔐 Generating ZKP proof with binding tag...');
      const priceWei = product.publicPriceWei || product.priceWei;
      if (!priceWei) {
        throw new Error('Price not available. Cannot generate ZKP.');
      }
      
      const zkpBackendUrl = process.env.REACT_APP_ZKP_BACKEND_URL || 'http://localhost:5010';
      const commitmentData = await generateCommitmentWithBindingTag(
        priceWei.toString(),
        normalizedProductAddr,
        normalizedSellerAddr,
        bindingContext.chainId || VC_CHAIN,
        bindingContext.productId || productId.toString(),
        2, // Stage 2 (for Stage 3 delivery credential)
        bindingContext.schemaVersion || "1.0",
        stage2Cid, // Previous VC CID (Stage 2)
        zkpBackendUrl
      );
      
      const { commitment, proof, verified, bindingTag: generatedBindingTag } = commitmentData;
      bindingTag = generatedBindingTag;
      
      console.log('[Flow][Buyer] Step 4 → ZKP generated. Binding tag:', bindingTag);
      
      // ✅ Verify commitment matches on-chain commitment
      if (product.publicPriceCommitment && product.publicPriceCommitment !== "0x" + "0".repeat(64)) {
        const commitmentMatch = verifyCommitmentMatch(commitment, product.publicPriceCommitment);
        if (!commitmentMatch) {
          console.warn('⚠️ Warning: Generated commitment does not match on-chain commitment');
          console.log('Generated commitment:', commitment);
          console.log('On-chain commitment:', product.publicPriceCommitment);
          // Don't throw error - still allow the flow to continue, but log warning
        } else {
          console.log('[Flow][Buyer] Step 4 → Commitment matches on-chain commitment.');
        }
      }
      
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
          proofType: 'zkRangeProof-v1',
          bindingTag: bindingTag, // ✅ Store binding tag in VC
          bindingContext: {
            chainId: bindingContext.chainId || VC_CHAIN,
            escrowAddr: normalizedProductAddr,
            productId: productId.toString(),
            stage: 2, // Stage 2 (for Stage 3 delivery credential)
            schemaVersion: bindingContext.schemaVersion || "1.0",
            previousVCCid: stage2Cid, // Previous VC CID (Stage 2)
          },
        }
      };
      // ✅ Get transporter and on-chain commitment for VC (available before delivery)
      // Transporter is already set when buyer requests seller signature
      const transporterAddr = transporter && transporter !== ZERO ? transporter : null;
      const onChainCommitment = product.publicPriceCommitment && product.publicPriceCommitment !== "0x" + "0".repeat(64) 
        ? product.publicPriceCommitment 
        : null;
      
      // Build the VC draft (no proofs yet) with delivery-related fields
      let draftVC = buildStage3VC({
        stage2,
        stage2Cid, // ✅ Stage 2 VC CID for linear chain S0→S1→S2
        price: priceObj,
        buyerProof: {},
        proofType: 'zkRangeProof-v1',
        transporter: transporterAddr,           // ✅ Add transporter address (if set)
        onChainCommitment: onChainCommitment,   // ✅ Add on-chain commitment reference for verification
        // Note: deliveryStatus is not set here - it's implicit that if Stage 3 VC exists, delivery is being confirmed
      });
      // Normalize all string fields
      const cs = draftVC.credentialSubject;
      const stringFields = [
        'id', 'productName', 'batch', 'previousCredential'
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
      const vcDraftKey = `vcDraft_${address}`;
      localStorage.setItem(vcDraftKey, canonicalVcJson);
      setVcDraft(draftVC);
      setVcDraftSaved(true);
      setStatusMessage('✅ VC draft with ZKP saved! Share with seller for signature.');
      console.log('[Flow][Buyer] Step 4 → Stage 3 VC draft ready and stored locally.');
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
      console.log('[Flow][Seller] Step 5: Seller reviewing and signing Stage 3 VC draft.');
      setStatusMessage('✍️ Loading VC draft for seller signature...');
      const vcDraftKey = `vcDraft_${address}`;
      const canonicalVcJson = localStorage.getItem(vcDraftKey);
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
      // Sign with contract address for verifyingContract binding
      const sellerProof = await signVcAsSeller(canonicalVcObj, signer, address);
      canonicalVcObj.proof = [sellerProof];
      console.log('[Flow][Seller] Step 5 → Seller signature appended to VC draft.');
      // Debug log
      if (VERBOSE) {
      console.log('[DEBUG] VC after seller signs:', canonicalVcObj);
      console.log('[DEBUG] VC proof array after seller signs:', canonicalVcObj.proof);
      }
      // Save updated VC (with seller's proof) to localStorage
      const sellerSignedJson = freezeVcJson(canonicalVcObj);
      const vcSellerSignedKey = `vcSellerSigned_${address}`;
      localStorage.setItem(vcSellerSignedKey, sellerSignedJson);
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
      console.log('[Flow][Buyer] Step 6: Buyer counter-signing VC and confirming delivery on-chain.');
      setStatusMessage('🔏 Loading seller-signed VC...');
      const vcSellerSignedKey = `vcSellerSigned_${address}`;
      const sellerSignedJson = localStorage.getItem(vcSellerSignedKey);
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
      // Sign with contract address for verifyingContract binding
      const buyerProof = await signVcWithMetamask(canonicalVcObj, signer, address);
      canonicalVcObj.proof.push(buyerProof);
      console.log('[Flow][Buyer] Step 6 → Buyer signature appended. VC hash:', buyerProof.payloadHash);
      // Debug log after buyer signs
      if (VERBOSE) {
      console.log('[DEBUG] VC after buyer signs:', canonicalVcObj);
      console.log('[DEBUG] VC proof array after buyer signs:', canonicalVcObj.proof);
      }
      // ✅ Add VC hash to credential subject (using buyer's payload hash, same as private flow)
      // The payloadHash is the hash of the EIP-712 typed data that was signed
      // This is used to link the VC to other systems (e.g., Railgun private payments)
      canonicalVcObj.credentialSubject.vcHash = buyerProof.payloadHash;
      
      // Continue with on-chain delivery confirmation, etc.
      // ✅ Use publicPriceWei from contract (not localStorage)
      const revealedValue = product.publicPriceWei || ethers.toBigInt(product.priceWei || 0);
      if (!revealedValue || revealedValue === 0n) {
        setError('Missing price for delivery confirmation.');
        return;
      }
      
      // ✅ Generate deterministic blinding factor (same as seller used)
      const sellerAddr = product.owner;
      const productAddr = product.address;
      if (!sellerAddr || !productAddr) {
        setError('Missing seller address or product address for blinding factor generation.');
        return;
      }
      
      setStatusMessage('🔐 Generating deterministic blinding factor...');
      const blindingHex = generateDeterministicBlinding(productAddr, sellerAddr);
      // Convert hex string to bytes32 (32 bytes)
      const blinding = "0x" + blindingHex.padStart(64, '0');
      
      setStatusMessage('⏳ Confirming delivery on-chain...');
      const esc = new ethers.Contract(product.address, ESCROW_ABI, signer);
      
      // First, upload VC without TX hash commitment (we'll add it after we get the tx hash)
      canonicalVcJson = freezeVcJson(canonicalVcObj);
      setStatusMessage('📤 Uploading final VC to IPFS...');
      const vcCID = await uploadJson(JSON.parse(canonicalVcJson));
      console.log('[Flow][Buyer] Step 6 → Final Stage 3 VC uploaded. CID:', vcCID);
      
      // Now call revealAndConfirmDelivery to get the transaction
      const tx = await esc.revealAndConfirmDelivery(
        revealedValue,
        blinding,
        vcCID
      );
      
      // Show transaction hash
      const chainId = await provider.getNetwork().then(n => n.chainId);
      const explorerUrl = chainId === 11155111n 
        ? `https://sepolia.etherscan.io/tx/${tx.hash}`
        : chainId === 1337n || chainId === 5777n
        ? `#`
        : `https://etherscan.io/tx/${tx.hash}`;
      
      setStatusMessage(`⏳ Confirming delivery... Transaction: ${tx.hash.slice(0, 10)}...${tx.hash.slice(-8)}`);
      await tx.wait();
      console.log('[Flow][Buyer] Step 6 → Delivery confirmed on-chain, tx hash:', tx.hash);
      
      // Generate TX hash commitment for privacy (Step 4) - NOW we have the real tx hash
      // Feature 2: Use same binding tag as purchase TX hash commitment
      console.log('[Flow][Buyer] Step 6 → Starting TX hash commitment generation for delivery tx:', tx.hash);
      setStatusMessage('🔐 Generating delivery TX hash commitment with binding tag...');
      try {
        // Feature 2: Retrieve binding tag from purchase (if available)
        let bindingTag = null;
        try {
          const bindingTagKey = `tx_hash_binding_tag_${address}`;
          const storedBindingTag = localStorage.getItem(bindingTagKey);
          if (storedBindingTag) {
            bindingTag = storedBindingTag;
            console.log('[Flow][Buyer] Step 6 → Using binding tag from purchase for delivery TX hash commitment');
          } else {
            // Generate binding tag if not found (shouldn't happen, but backward compatible)
            const buyerAddr = await signer.getAddress();
            const chainId = await provider.getNetwork().then(n => n.chainId);
            let productId;
            try {
              productId = await esc.id();
              bindingTag = `0x${generateTxHashCommitmentBindingTag({
                chainId: chainId.toString(),
                escrowAddr: address,
                productId: productId.toString(),
                buyerAddress: buyerAddr,
              })}`;
              console.log('[Flow][Buyer] Step 6 → Generated new binding tag for delivery TX hash commitment');
            } catch (err) {
              console.warn("⚠️ Could not generate binding tag:", err);
              // Continue without binding tag (backward compatible)
            }
          }
        } catch (err) {
          console.warn("⚠️ Failed to retrieve/generate binding tag:", err);
          // Continue without binding tag (backward compatible)
        }
        
        const zkpBackendUrl = process.env.REACT_APP_ZKP_BACKEND_URL || 'http://localhost:5010';
        const requestBody = {
          tx_hash: tx.hash,
          ...(bindingTag ? { binding_tag_hex: bindingTag } : {}),
        };
        
        console.log('[Flow][Buyer] Step 6 → Calling ZKP backend:', `${zkpBackendUrl}/zkp/commit-tx-hash`);
        console.log('[Flow][Buyer] Step 6 → Request body:', JSON.stringify(requestBody, null, 2));
        
        let zkpRes;
        try {
          zkpRes = await fetch(`${zkpBackendUrl}/zkp/commit-tx-hash`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          });
          
          if (!zkpRes.ok) {
            const errorText = await zkpRes.text();
            console.error('[Flow][Buyer] Step 6 → ZKP backend HTTP error:', zkpRes.status, errorText);
            throw new Error(`ZKP backend returned ${zkpRes.status}: ${errorText}`);
          }
        } catch (fetchError) {
          console.error('[Flow][Buyer] Step 6 → Failed to call ZKP backend:', fetchError);
          throw new Error(`ZKP backend unavailable: ${fetchError.message}. Please ensure the ZKP backend is running at ${zkpBackendUrl}`);
        }

        const zkpData = await zkpRes.json();
        console.log('[Flow][Buyer] Step 6 → ZKP backend response:', JSON.stringify(zkpData, null, 2));
        const { commitment, proof, verified } = zkpData;
        if (!verified) {
          console.warn("⚠️ TX hash commitment verification failed, but adding commitment to VC anyway...");
        } else {
          console.log("✅ TX hash commitment verification passed");
        }
        
        // Always add TX hash commitment to the VC, regardless of verification status
        // The verification is just a check - the commitment itself should be stored
        if (commitment && proof) {
          canonicalVcObj.credentialSubject.txHashCommitment = {
            commitment,
            proof,
            protocol: "bulletproofs-pedersen",
            version: "1.0",
            encoding: "hex",
            ...(bindingTag ? { bindingTag } : {}), // Feature 2: Include binding tag
          };
          console.log('[Flow][Buyer] Step 6 → TX hash commitment added to VC', bindingTag ? '(with binding tag)' : '(without binding tag)');
          
          // Feature 2: Clean up binding tag from localStorage after use
          if (bindingTag) {
            const bindingTagKey = `tx_hash_binding_tag_${address}`;
            localStorage.removeItem(bindingTagKey);
            console.log('[Flow][Buyer] Step 6 → Cleaned up binding tag from localStorage');
          }
          
          // Re-upload updated VC to IPFS with TX hash commitment
          const updatedVcJson = freezeVcJson(canonicalVcObj);
          const updatedVcCID = await uploadJson(JSON.parse(updatedVcJson));
          console.log('[Flow][Buyer] Step 6 → Updated VC with TX hash commitment. CID:', updatedVcCID);
          
          // Update on-chain CID to point to the VC with TX hash commitment
          // This is done automatically - no extra user step required
          setStatusMessage('📡 Updating on-chain VC CID with TX hash commitment...');
          try {
            // Extract TX hash commitment from the updated VC for event emission (Feature 1: Transaction Verification)
            let txHashCommitmentBytes32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
            if (canonicalVcObj.credentialSubject?.txHashCommitment?.commitment) {
              // Ensure commitment is properly formatted as bytes32 (64 hex chars with 0x prefix)
              let commitmentHex = canonicalVcObj.credentialSubject.txHashCommitment.commitment.replace(/^0x/, '');
              if (commitmentHex.length === 64) {
                txHashCommitmentBytes32 = "0x" + commitmentHex;
                console.log('[Flow][Buyer] Step 6 → Extracted TX hash commitment for event emission:', txHashCommitmentBytes32);
              } else {
                console.warn('[Flow][Buyer] Step 6 → Invalid commitment length, using zero commitment');
              }
            }
            
            const updateCidTx = await esc.updateVcCidAfterDelivery(updatedVcCID, txHashCommitmentBytes32);
            await updateCidTx.wait();
            console.log('[Flow][Buyer] Step 6 → On-chain CID updated to:', updatedVcCID);
            console.log('[Flow][Buyer] ✅ TX hash commitment is now stored on-chain and event emitted for verification');
          } catch (updateErr) {
            console.error("❌ Failed to update on-chain CID:", updateErr);
            // Fallback: Store in localStorage as backup (but this shouldn't happen)
            const updatedCidKey = `vcCid_updated_${product.address}`;
            localStorage.setItem(updatedCidKey, updatedVcCID);
            console.warn('[Flow][Buyer] ⚠️ Stored updated CID in localStorage as fallback');
            setError('Failed to update on-chain CID. TX hash commitment is in IPFS but not linked on-chain.');
          }
        } else {
          console.error("❌ Missing commitment or proof from ZKP backend response");
          setError('Failed to generate TX hash commitment - missing commitment or proof');
        }
      } catch (err) {
        console.error("❌ Failed to generate TX hash commitment:", err);
        console.error("❌ Error details:", {
          message: err.message,
          stack: err.stack,
          name: err.name
        });
        setError(`Failed to generate TX hash commitment: ${err.message}`);
        // Continue anyway - commitment is optional for now, but log the error
        // Don't return here - let the flow continue even if TX hash commitment fails
      }
      
      console.log('[Flow][Buyer] Step 6 → Delivery flow completed');
      setStatusMessage('✅ Delivery confirmed!');
      loadProductData();
    } catch (err) {
      // Better error messages
      let errorMsg = "Failed to confirm delivery";
      const reason = err?.shortMessage || err?.info?.error?.message || err?.message || String(err);
      
      if (reason.includes("user rejected") || reason.includes("User denied")) {
        errorMsg = "Transaction was cancelled. Please try again.";
      } else if (reason.includes("insufficient funds")) {
        errorMsg = "Insufficient funds. Please add more ETH to your wallet.";
      } else if (reason.includes("gas")) {
        errorMsg = "Transaction failed due to gas estimation. Please try again.";
      } else if (reason.includes("network") || reason.includes("connection")) {
        errorMsg = "Network error. Please check your connection and try again.";
      } else if (reason.includes("No seller-signed VC")) {
        errorMsg = "Seller must sign the VC first. Please wait for the seller to sign.";
      } else {
        errorMsg = `Delivery confirmation failed: ${reason}`;
      }
      
      setError(errorMsg);
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

  // Fetch VC for provenance display (if not already in vcStages)
  useEffect(() => {
    if (!product?.vcCid) return;
    if (vcStages.length > 0) return; // Already have VC from vcStages
    if (provenanceVC) return; // Already fetched
    if (provenanceLoading) return; // Already loading
    
    setProvenanceLoading(true);
    fetch(`https://ipfs.io/ipfs/${product.vcCid}`)
      .then(res => res.ok ? res.json() : null)
      .then(vc => {
        if (vc) setProvenanceVC(vc);
        setProvenanceLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch VC for provenance:", err);
        setProvenanceLoading(false);
      });
  }, [product?.vcCid, vcStages.length, provenanceVC, provenanceLoading]);

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
          if (!IS_RAILGUN_API_CONFIGURED) {
            return null;
          }
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
      // Clear VC draft and seller signed state for previous product
      localStorage.removeItem(`vcDraft_${prev}`);
      localStorage.removeItem(`vcSellerSigned_${prev}`);
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
    // Reset VC states when product changes
    setVcDraftSaved(false);
    setVcSellerSigned(false);
    setVcDraft(null);
  }, [address]);

  // Resolve buyer's Railgun address when we have a pending payment with buyer's ETH address
  useEffect(() => {
    if (pendingPrivatePayments.length > 0 && pendingPrivatePayments[0]?.buyerAddress && !buyerRailgun && IS_RAILGUN_API_CONFIGURED) {
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
    {statusMessage && (
      <div className="text-blue-600">
        {statusMessage.includes("View on explorer:") ? (
          <p>
            {statusMessage.split("View on explorer:")[0]}
            <a 
              href={statusMessage.split("View on explorer:")[1]?.trim()} 
              target="_blank" 
              rel="noopener noreferrer"
              className="ml-2 underline hover:text-blue-800"
            >
              View on explorer
            </a>
          </p>
        ) : (
          <p>{statusMessage}</p>
        )}
      </div>
    )}
    {error && <p className="text-red-600">{error}</p>}

    {/* ────────── Action Buttons (Top) ───────── */}
    {product.purchased && !isDelivered && (
      <div className="mt-4 mb-6 flex gap-3 flex-wrap">
        {/* Seller: Confirm Order (disabled if buyer requested signature) */}
        {isSeller && !isConfirmed && (
          <Button 
            onClick={handleConfirmOrder}
            disabled={vcDraftSaved}
            className={vcDraftSaved ? "opacity-50 cursor-not-allowed" : ""}
          >
            Confirm Order
          </Button>
        )}

        {/* Seller: Sign as Seller (after buyer requests signature) */}
        {isSeller && product.phase === 3 && vcDraftSaved && !vcSellerSigned && (
          <Button onClick={handleSignAsSeller}>
            Sign as Seller
          </Button>
        )}

        {/* Buyer: Request Seller Signature OR Confirm Delivery */}
        {isBuyer && product.phase === 3 && (
          <>
            {!vcDraftSaved && (
              <Button onClick={handleRequestSellerSignature}>
                Request Seller Signature
              </Button>
            )}
            {vcDraftSaved && vcSellerSigned && (
              <Button onClick={handleConfirmDeliveryClick} className="bg-blue-600 hover:bg-blue-700">
                Confirm Delivery
              </Button>
            )}
          </>
        )}
      </div>
    )}
    
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

      {/* ────────── Tabs: Credentials & Audit ───────── */}
      {vcStages.length > 0 && (
        <div className="mt-8">
          <Tabs defaultTab={0}>
            <Tab label="📄 Credentials">
              <div className="space-y-6">
                {/* Certification (only in tabs, provenance tree is shown below) */}
                {vcStages.length > 0 && (() => {
                  const latestVC = vcStages[vcStages.length - 1];
                  const { vc } = latestVC;
                  const cs = vc.credentialSubject || {};
                  const certificateCredential = cs.certificateCredential || {};
                  const hasCertification = certificateCredential.cid && certificateCredential.cid.trim() !== "";
                  const certificationName = certificateCredential.name || "Unnamed Certification";

                  if (!hasCertification) return null;

                  return (
                    <div>
                      <h3 className="text-lg font-semibold mb-4">📜 Certification</h3>
                      <div className="bg-white rounded-xl shadow-md p-6">
                        <div className="bg-green-50 border border-green-200 rounded p-3">
                          <p className="text-sm text-gray-700 mb-1">
                            <strong>Certification Name:</strong> {certificationName}
                          </p>
                          <p className="text-sm text-gray-700 mb-1">
                            <strong>Certification CID:</strong> <Copyable value={certificateCredential.cid} />
                          </p>
                          <p className="text-xs text-gray-600 mt-2">
                            This product has an associated certification uploaded during product creation.
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Current Credential - Just the VC */}
                {vcStages.length > 0 && (() => {
                  const latestVC = vcStages[vcStages.length - 1];
                  const { cid, vc } = latestVC;
                  const hasIssuerProof = vc.proofs?.issuerProof || vc.proof?.some(p => p.role === "issuer" || p.role === "seller");
                  const hasHolderProof = vc.proofs?.holderProof || vc.proof?.some(p => p.role === "holder" || p.role === "buyer");
                  const isDeliveredVC = hasIssuerProof && hasHolderProof;

                  return (
                    <div>
                      <h3 className="text-lg font-semibold mb-4">📋 Current Credential</h3>
                      <div className="bg-white rounded-xl shadow-md p-6">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
                          <div>
                            <h4 className="text-lg font-semibold mb-1">
                              {isDeliveredVC ? "✅ Final Delivered Credential" : "⏳ Credential in Progress"}
                            </h4>
                            <p className="text-sm text-gray-600">
                              {isDeliveredVC 
                                ? "Final credential signed by both seller and buyer"
                                : "This credential will be finalized once both seller and buyer have signed"
                              }
                            </p>
                          </div>
                          <div className="flex items-center gap-2 mt-2 sm:mt-0">
                            <Button
                              variant={expandedVCIndex === vcStages.length - 1 ? "ghost" : "secondary"}
                              onClick={() =>
                                setExpandedVCIndex(
                                  expandedVCIndex === vcStages.length - 1 ? null : vcStages.length - 1
                                )
                              }
                              icon={expandedVCIndex === vcStages.length - 1 ? EyeOff : Eye}
                            >
                              {expandedVCIndex === vcStages.length - 1 ? "Hide Full VC" : "View Full VC JSON"}
                            </Button>
                          </div>
                        </div>

                        {expandedVCIndex === vcStages.length - 1 && (
                          <div className="rounded-lg border bg-gray-50 p-4 mt-4">
                            <VCViewer vc={vc} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </Tab>

            <Tab label="🔍 Audit">
              <div className="space-y-6">
                {vcStages.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Verification Tools</h3>
                    <div className="bg-white rounded-xl shadow-md p-6">
                      <VerifyVCInline 
                        vc={vcStages[vcStages.length - 1].vc} 
                        cid={vcStages[vcStages.length - 1].cid} 
                        provider={provider}
                        contractAddress={address}
                      />
                    </div>
                  </div>
                )}
              </div>
            </Tab>
          </Tabs>
        </div>
      )}

      {/* ────────── Supply Chain Provenance (Visible to all, before purchase) ───────── */}
      {product?.vcCid && (() => {
        // Use VC from vcStages if available, otherwise use fetched provenanceVC
        const currentVC = vcStages.length > 0 ? vcStages[0].vc : provenanceVC;
        const currentCid = vcStages.length > 0 ? vcStages[0].cid : product.vcCid;
        
        // Show loading state if we're fetching
        if (provenanceLoading && !currentVC) {
          return (
            <div className="mt-6 mb-6">
              <h3 className="text-lg font-semibold mb-4">🔗 Supply Chain Provenance</h3>
              <div className="bg-white rounded-xl shadow-md p-6">
                <p className="text-gray-600">Loading provenance information...</p>
              </div>
            </div>
          );
        }
        
        if (!currentVC) return null;
        
        const hasComponents = Array.isArray(currentVC?.credentialSubject?.componentCredentials) 
          && currentVC.credentialSubject.componentCredentials.length > 0;
        const hasCertification = currentVC?.credentialSubject?.certificateCredential?.cid 
          && currentVC.credentialSubject.certificateCredential.cid.trim() !== "";
        
        // Only show if there are components or certification
        if (!hasComponents && !hasCertification) return null;
        
        return (
          <div className="mt-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">🔗 Supply Chain Provenance</h3>
            <div className="bg-white rounded-xl shadow-md p-6 space-y-4">
              {/* Component Chain Tree */}
              {hasComponents && (
                <div>
                  <ProvenanceChainViewer 
                    vc={currentVC} 
                    cid={currentCid}
                    currentProductState={product ? {
                      buyer: product.buyer,
                      transporter: transporter,
                      purchased: product.purchased,
                      phase: product.phase,
                      owner: product.owner
                    } : null}
                  />
                </div>
              )}
              
              {/* Certification */}
              {hasCertification && (() => {
                const cert = currentVC.credentialSubject.certificateCredential;
                return (
                  <div className="border-t pt-4">
                    <h5 className="font-semibold mb-2">📜 Certification</h5>
                    <div className="bg-green-50 border border-green-200 rounded p-3">
                      <p className="text-sm text-gray-700 mb-1">
                        <strong>Certification Name:</strong> {cert.name || "Unnamed Certification"}
                      </p>
                      <p className="text-sm text-gray-700 mb-1">
                        <strong>Certification CID:</strong> <Copyable value={cert.cid} />
                      </p>
                      <p className="text-xs text-gray-600 mt-2">
                        This product has an associated certification uploaded during product creation.
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })()}

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

      {/* ────────── Private Payment Modal ───────── */}
      {IS_RAILGUN_API_CONFIGURED && (
        <PrivatePaymentModal
          product={product}
          isOpen={showPrivatePaymentModal}
          onClose={() => setShowPrivatePaymentModal(false)}
          onSuccess={handlePrivatePurchaseSuccess}
          currentUser={currentUser}
        />
      )}
    </div>
  );
};

export default ProductDetail;
