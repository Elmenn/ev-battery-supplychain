import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import toast from "react-hot-toast";

import { Button } from "../ui/button";
import ProductEscrowABI from "../../abis/ProductEscrow.json";
import { RailgunPaymentFlow as RailgunPaymentFlowClass, RAILGUN_CONFIG, getGlobalWalletManager, detectUSDCAddress } from "../../utils/railgunUtils";

// Debug ABI import
console.log("🔧 ABI imported:", !!ProductEscrowABI);
console.log("🔧 ABI structure:", Object.keys(ProductEscrowABI || {}));

const RailgunPaymentFlow = ({ provider, myAddress }) => {
  const { productAddress } = useParams();
  const navigate = useNavigate();
  
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [railgunConnected, setRailgunConnected] = useState(false);
  const [railgunAddress, setRailgunAddress] = useState(null);
  const [walletManager, setWalletManager] = useState(null);
  const [insufficientBalance, setInsufficientBalance] = useState(false);

  // Load product details
  useEffect(() => {
    const loadProduct = async () => {
      if (!provider || !productAddress) return;
      
      try {
        setLoading(true);
        console.log("🔍 Loading product details for:", productAddress);
        console.log("📋 ABI length:", ProductEscrowABI.abi.length);
        
        const escrow = new ethers.Contract(productAddress, ProductEscrowABI.abi, provider);
        console.log("✅ Contract created successfully");
        
        // Skip interface check and try direct function calls
        console.log("🔍 Attempting direct function calls...");
        
        // Try to call functions individually to see which ones work
        console.log("🔍 Testing contract functions...");
        
        let name, owner, productPrice, purchased, buyer, vcCid, transporter;
        
        try {
          name = await escrow.name();
          console.log("✅ name():", name);
        } catch (err) {
          console.error("❌ name() failed:", err.message);
          name = "Unknown Product";
        }
        
        try {
          owner = await escrow.owner();
          console.log("✅ owner():", owner);
        } catch (err) {
          console.error("❌ owner() failed:", err.message);
          owner = "0x0000000000000000000000000000000000000000";
        }
        
        try {
          productPrice = await escrow.price();
          console.log("✅ price():", productPrice.toString());
        } catch (err) {
          console.error("❌ price() failed:", err.message);
          // Try productPrice as fallback
          try {
            productPrice = await escrow.productPrice();
            console.log("✅ productPrice() (fallback):", productPrice.toString());
          } catch (err2) {
            console.error("❌ productPrice() also failed:", err2.message);
            productPrice = ethers.parseEther("0");
          }
        }
        
        try {
          purchased = await escrow.purchased();
          console.log("✅ purchased():", purchased);
        } catch (err) {
          console.error("❌ purchased() failed:", err.message);
          purchased = false;
        }
        
        try {
          buyer = await escrow.buyer();
          console.log("✅ buyer():", buyer);
        } catch (err) {
          console.error("❌ buyer() failed:", err.message);
          buyer = "0x0000000000000000000000000000000000000000";
        }
        
        try {
          vcCid = await escrow.vcCid();
          console.log("✅ vcCid():", vcCid);
        } catch (err) {
          console.error("❌ vcCid() failed:", err.message);
          vcCid = "";
        }
        
        try {
          transporter = await escrow.transporter();
          console.log("✅ transporter():", transporter);
        } catch (err) {
          console.error("❌ transporter() failed:", err.message);
          transporter = "0x0000000000000000000000000000000000000000";
        }

                 // Get the actual price from localStorage (stored during product creation)
         const actualPriceWei = localStorage.getItem(`priceWei_${productAddress}`);
         console.log("💰 Actual price from localStorage:", actualPriceWei);
         
         // Format the price properly
         const displayPrice = actualPriceWei ? 
           ethers.formatEther(actualPriceWei) + " ETH" : 
           "Price hidden 🔒";
         
         setProduct({
           name,
           owner,
           price: displayPrice, // Use formatted price for display
           priceWei: actualPriceWei || "0", // Keep wei version for calculations
           purchased,
           buyer,
           vcCid,
           transporter,
           address: productAddress,
         });
      } catch (err) {
        console.error("Failed to load product:", err);
        toast.error("Failed to load product details");
      } finally {
        setLoading(false);
      }
    };

    loadProduct();
  }, [provider, productAddress]);

  /* ─── check shielded balance ───────────────────────────────── */
  useEffect(() => {
    const checkBalance = async () => {
      if (!walletManager || !product) return;
      
      try {
        const usdcAddress = await detectUSDCAddress(provider);
        const balance = await walletManager.railgunWallet.getBalance(usdcAddress);
        const priceWei = localStorage.getItem(`product_${productAddress}_price`);
        
        if (priceWei) {
          const requiredAmount = ethers.toBigInt(priceWei);
          const hasEnoughBalance = balance >= requiredAmount;
          
          console.log("🔍 Balance check:", {
            balance: ethers.formatUnits(balance, 6),
            required: ethers.formatUnits(requiredAmount, 6),
            hasEnough: hasEnoughBalance
          });
          
          setInsufficientBalance(!hasEnoughBalance);
        }
      } catch (error) {
        console.error("Failed to check balance:", error);
      }
    };
    
    checkBalance();
  }, [walletManager, product, productAddress, provider]);

  /* ─── filter helpers ──────────────────────────────────────── */

  // Check if Railgun is connected (mock version)
  useEffect(() => {
    // For demo purposes, we'll start with Railgun not connected
    setRailgunConnected(false);
    setRailgunAddress(null);
  }, []);

  const handleConnectRailgun = async () => {
    try {
      // Check if global wallet manager exists
      const existingManager = getGlobalWalletManager();
      if (existingManager) {
        setRailgunConnected(true);
        setRailgunAddress(existingManager.railgunWallet.getAddress());
        setWalletManager(existingManager);
        
        // Get current shielded balance
        const balance = await existingManager.railgunWallet.getBalance(
          RAILGUN_CONFIG.TOKENS.USDC.GOERLI
        );
        
        toast.success("🔐 Advanced mock Railgun wallet connected!");
        console.log("✅ Using existing global wallet manager");
        console.log("✅ Advanced mock Railgun address:", existingManager.railgunWallet.getAddress());
        console.log("💰 Shielded balance:", ethers.formatUnits(balance, 18), "ETH");
        return;
      }
      
      // If no global manager exists, create one (this shouldn't happen in normal flow)
      console.log("⚠️ No global wallet manager found, creating new one...");
      
      // Advanced mock Railgun connection
      console.log("🔐 Connecting to advanced mock Railgun...");
      
      // Import the advanced mock Railgun wallet manager
      const { RailgunWalletManager } = await import('../../utils/railgunUtils');
      
      // Create wallet manager
      const walletManager = new RailgunWalletManager();
      
      // Initialize with provider
      const walletInfo = await walletManager.initialize(provider);
      
      setRailgunConnected(true);
      setRailgunAddress(walletInfo.railgunAddress);
      
      // Get initial shielded balance
      const balance = await walletManager.railgunWallet.getBalance(
        RAILGUN_CONFIG.TOKENS.USDC.GOERLI
      );
      
      toast.success("🔐 Advanced mock Railgun wallet connected!");
      console.log("✅ New wallet manager created");
      console.log("✅ Advanced mock Railgun address:", walletInfo.railgunAddress);
      console.log("💰 Initial shielded balance:", ethers.formatUnits(balance, 18), "ETH");
      
      // Store wallet manager for later use
      setWalletManager(walletManager);
    } catch (err) {
      console.error("Failed to connect Railgun:", err);
      toast.error("Failed to connect Railgun wallet: " + err.message);
    }
  };

  const handlePrivatePayment = async () => {
    if (!walletManager || !product || !myAddress) {
      toast.error('Please connect your wallet first');
      return;
    }

    try {
      setPaymentLoading(true);
      
      // Get price from localStorage
      const priceWei = localStorage.getItem(`product_${productAddress}_price`);
      if (!priceWei) {
        throw new Error('Product price not found');
      }
      
      const price = ethers.toBigInt(priceWei); // Fix for double conversion
      const deliveryFee = ethers.parseUnits('0', 6); // No delivery fee for now
      
      console.log("🔒 Starting private payment...");
      console.log("💰 Price:", ethers.formatUnits(price, 6), "USDC");
      console.log("🚚 Delivery fee:", ethers.formatUnits(deliveryFee, 6), "USDC");
      
      // Get USDC address dynamically
      const usdcAddress = await detectUSDCAddress(provider);
      
      // Create payment flow instance
      const paymentFlow = new RailgunPaymentFlowClass(walletManager, null);
      
      // Execute private payment with identity linkage
      const result = await paymentFlow.executePrivatePaymentWithIdentityLinkage({
        product: {
          ...product,
          price: price,
          tokenAddress: usdcAddress
        },
        vcHash: product.vcCid ? ethers.keccak256(ethers.toUtf8Bytes(product.vcCid)) : ethers.keccak256(ethers.toUtf8Bytes("default")),
        vcSigningKey: "0x1234567890abcdef", // Mock signing key
        railgunSigningKey: "0xabcdef1234567890", // Mock Railgun signing key
        railgunAddress: walletManager.railgunWallet.getAddress(),
        sellerRailgunAddress: "0x0000000000000000000000000000000000000000", // No seller Railgun address yet
        transporterRailgunAddress: "0x0000000000000000000000000000000000000000", // No transporter yet
        price: price,
        deliveryFee: deliveryFee
      });
      
      console.log("✅ Private payment completed:", result);
      toast.success("🎉 Private payment completed! Your shielded USDC was transferred privately.");
      
      // Navigate back to marketplace
      setTimeout(() => {
        navigate('/marketplace');
      }, 2000);
      
    } catch (error) {
      console.error("Private payment failed:", error);
      toast.error("Private payment failed: " + error.message);
    } finally {
      setPaymentLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2">Loading product details...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="text-center">
          <p className="text-red-600">Product not found</p>
          <Button onClick={() => navigate("/")} className="mt-4">
            Back to Marketplace
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
             {/* Header */}
       <div className="text-center">
         <h1 className="text-2xl font-bold text-gray-900">🔒 Private Payment</h1>
         <p className="text-gray-600 mt-2">Complete your purchase using Railgun privacy</p>
       </div>

      {/* Product Details */}
      <div className="bg-white rounded-lg border p-6 space-y-4">
        <h2 className="text-xl font-semibold">{product.name}</h2>
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium text-gray-600">Product Address:</span>
            <p className="font-mono text-xs">{product.address}</p>
          </div>
          <div>
            <span className="font-medium text-gray-600">Seller:</span>
            <p className="font-mono text-xs">{product.owner}</p>
          </div>
                     <div>
             <span className="font-medium text-gray-600">Price:</span>
             <p className="text-green-600 font-semibold">
               {product.price}
             </p>
           </div>
          <div>
            <span className="font-medium text-gray-600">Status:</span>
            <p className={product.purchased ? "text-orange-600" : "text-green-600"}>
              {product.purchased ? "Purchased" : "Available"}
            </p>
          </div>
        </div>
      </div>

      {/* Railgun Connection */}
      <div className="bg-white rounded-lg border p-6 space-y-4">
        <h3 className="text-lg font-semibold">🔐 Railgun Wallet</h3>
        
        {!railgunConnected ? (
          <div className="text-center space-y-4">
                         <p className="text-gray-600">Connect your Railgun wallet to make private payments</p>
             <p className="text-xs text-purple-600">(Advanced mock - simulates real Railgun behavior)</p>
             <Button onClick={handleConnectRailgun} className="bg-purple-600 hover:bg-purple-700">
               🔐 Connect Advanced Mock Railgun
             </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-green-800 font-medium">Connected</span>
              </div>
                             <span className="text-green-600 text-sm">Railgun Wallet</span>
            </div>
            
            {railgunAddress && (
              <div className="text-sm">
                <span className="font-medium text-gray-600">Railgun Address:</span>
                <p className="font-mono text-xs mt-1">{railgunAddress}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Payment Action */}
       <div className="bg-white rounded-lg border p-6 space-y-4">
         <h3 className="text-lg font-semibold">💳 Payment Details</h3>
         
         <div className="space-y-2 text-sm">
           <div className="flex justify-between">
             <span>Payment Method:</span>
             <span className="font-medium text-purple-600">Railgun Private Payment</span>
           </div>
           <div className="flex justify-between">
             <span>Privacy Level:</span>
             <span className="font-medium text-green-600">Maximum (ZK-Proof)</span>
           </div>
           <div className="flex justify-between">
             <span>Transaction Type:</span>
             <span className="font-medium">Shielded Transfer</span>
           </div>
         </div>

         <div className="pt-4 border-t">
           {!railgunConnected ? (
             <Button
               onClick={handleConnectRailgun}
               className="w-full bg-purple-600 hover:bg-purple-700"
             >
               🔐 Connect Railgun Wallet First
             </Button>
           ) : (
             <div className="space-y-2">
               <Button
                 onClick={handlePrivatePayment}
                 disabled={paymentLoading || product.purchased}
                 className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400"
               >
                 {paymentLoading ? (
                   <div className="flex items-center space-x-2">
                     <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                     <span>Processing Payment...</span>
                   </div>
                 ) : (
                   `🔒 Pay Privately ${product.price !== "Price hidden 🔒" ? `(${product.price})` : ""}`
                 )}
               </Button>
               
               {product.purchased && (
                 <p className="text-sm text-green-600 text-center">
                   This product has already been purchased.
                 </p>
               )}
               
               {insufficientBalance && (
                 <div className="text-sm text-orange-600 text-center space-y-2">
                   <p>⚠️ Insufficient shielded balance for this purchase.</p>
                   <Button 
                     variant="outline" 
                     size="small"
                     onClick={() => navigate("/")}
                     className="text-orange-600 border-orange-300 hover:bg-orange-50"
                   >
                     ← Back to Marketplace to Shield ETH
                   </Button>
                 </div>
               )}
             </div>
           )}
         </div>
       </div>

      {/* Back Button */}
      <div className="text-center">
        <Button variant="outline" onClick={() => navigate("/")}>
          ← Back to Marketplace
        </Button>
      </div>
    </div>
  );
};

export default RailgunPaymentFlow; 