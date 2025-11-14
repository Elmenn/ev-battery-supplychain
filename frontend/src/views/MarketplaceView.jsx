import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import ProductCard from "../components/marketplace/ProductCard";
import ProductFormWizard from "../components/marketplace/ProductFormWizard";
import PrivateFundsDrawer from "../components/railgun/PrivateFundsDrawer";
import RailgunConnectionButton from "../components/railgun/RailgunConnectionButton";
import { Button } from "../../src/components/ui/button";



import ProductFactoryABI from "../abis/ProductFactory.json";
import ProductEscrowABI from "../abis/ProductEscrow_Initializer.json";




const MarketplaceView = ({ myAddress, provider, backendUrl }) => {
  const factoryAddress = process.env.REACT_APP_FACTORY_ADDRESS || '0x0000000000000000000000000000000000000000';

  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [showPrivateFunds, setShowPrivateFunds] = useState(false);
  const [loading, setLoading] = useState(true);






  /* ─── fetch products ───────────────────────────────────────── */
  useEffect(() => {
    const load = async () => {
      if (!myAddress || !provider) return;
      try {
        setLoading(true);
        const signer = await provider.getSigner();
        const factory = new ethers.Contract(
          factoryAddress,
          ProductFactoryABI.abi,
          signer
        );

        // Fetching products from factory
        let addresses = [];
        
        // First try the getProducts() method
        try {
          addresses = await factory.getProducts();
          // Product addresses loaded
          
          // Check if addresses array is empty or contains only zero addresses
          if (!addresses || addresses.length === 0 || addresses.every(addr => addr === "0x0000000000000000000000000000000000000000")) {
            // No valid products found, trying counter approach
            addresses = []; // Set empty array instead of throwing error
          }
        } catch (err) {
          // getProducts() returned empty data, trying counter approach
          
          // Try alternative approach - get product counter and iterate
          try {
            const counter = await factory.productCount();
            // Product counter loaded
            
            if (counter > 0) {
              addresses = [];
              for (let i = 0; i < counter; i++) {
                try {
                  const addr = await factory.products(i);
                  // Product address loaded
                  
                  // Only add non-zero addresses
                  if (addr && addr !== "0x0000000000000000000000000000000000000000") {
                    addresses.push(addr);
                  }
                } catch (e) {
                  // Skipping invalid product
                }
              }
              // Product addresses loaded from counter
            } else {
              // No products found
              addresses = []; // Ensure addresses is an empty array
            }
          } catch (counterErr) {
            // Counter approach failed, assuming no products
            addresses = []; // Set empty array instead of throwing error
          }
        }
        const items = await Promise.all(
          addresses.map(async (addr) => {
            try {
              // Loading product details
              const pc = new ethers.Contract(addr, ProductEscrowABI.abi, provider);
              
              // ✅ Read public price from contract (new dual-mode approach)
              let price;
              let publicPriceWei;
              try {
                publicPriceWei = await pc.publicPriceWei();
                // Public price loaded
                
                if (publicPriceWei && publicPriceWei !== 0n) {
                  price = ethers.formatEther(publicPriceWei); // shown in card
                  // Public price displayed
                } else {
                  price = "Price hidden 🔒";
                  // No public price set
                }
              } catch (err) {
                                  // Public price read failed
                price = "Price hidden 🔒";
                publicPriceWei = 0n;
              }
              
              // Get all other product details with better error handling
              const [name, owner, purchased, buyer, vcCid, transporter] =
                await Promise.all([
                  pc.name().catch(() => "Unknown Product"),
                  pc.owner().catch(() => "0x0000000000000000000000000000000000000000"),
                  pc.purchased().catch(() => false),
                  pc.buyer().catch(() => "0x0000000000000000000000000000000000000000"),
                  pc.vcCid().catch(() => ""),
                  pc.transporter().catch(() => "0x0000000000000000000000000000000000000000"),
                ]);
              
              // Get stored price data from localStorage
              const priceWei = localStorage.getItem(`priceWei_${addr}`);
              const priceBlinding = localStorage.getItem(`priceBlinding_${addr}`);
              
              // ✅ Get stored Railgun data from localStorage
              const sellerRailgunAddress = localStorage.getItem(`sellerRailgunAddress_${addr}`);
              const sellerWalletID = localStorage.getItem(`sellerWalletID_${addr}`);
              
              const product = {
                name,
                price,
                priceWei,
                priceBlinding,
                publicPriceWei, // ✅ Store public price for accurate purchase values
                owner: owner.toLowerCase(),
                buyer: buyer.toLowerCase(),
                purchased,
                transporter,
                vcCid,
                address: addr,
                // ✅ Include Railgun data for private payments
                sellerRailgunAddress,
                sellerWalletID,
                privatePaymentsEnabled: !!sellerRailgunAddress, // Boolean flag for easy checking
              };
              
                             // Product loaded successfully
              return product;
            } catch (err) {
              console.error("❌ Skipping invalid contract at", addr, err);
              return null;
            }
          })
        );
        setProducts(items.filter(Boolean));
      } catch (err) {
        // Error loading products, continuing with empty list
        setProducts([]); // Set empty products array on error
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [myAddress, provider, factoryAddress]);






  /* ─── filter helpers ──────────────────────────────────────── */
  const filtered = products.filter((p) => {
    if (filter === "my") return p.owner === myAddress?.toLowerCase();
    if (filter === "purchased") return p.buyer === myAddress?.toLowerCase();
    return true;
  });

  /* ─── render ──────────────────────────────────────────────── */
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* header bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">
          🔍 EV Battery Marketplace
        </h2>

        <div className="flex items-center gap-3">
          <RailgunConnectionButton currentUser={myAddress} />
          <Button 
            onClick={() => setShowPrivateFunds(true)}
            variant="outline"
            className="bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
          >
            🛡️ Private Funds
          </Button>
          <Button onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Close Form" : "➕ Add Product"}
          </Button>
        </div>
      </div>



      {/* new-product wizard */}
      {showForm && (
        <div className="border rounded-xl p-6 bg-gray-50">
          <ProductFormWizard provider={provider} backendUrl={backendUrl} currentUser={myAddress} />
        </div>
      )}

      {/* filter pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: "all", label: "All" },
          { id: "my", label: "My Listings" },
          { id: "purchased", label: "Purchased" },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`rounded-md px-3 py-1 text-sm font-medium transition ${
              filter === id
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-900 hover:bg-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* product grid */}
      {loading ? (
        <p>Loading products…</p>
      ) : filtered.length === 0 ? (
        <p>No products to show.</p>
      ) : (
        <div className="grid gap-6 justify-items-center sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <ProductCard key={p.address} product={p} myAddress={myAddress} provider={provider} onPurchased={() => window.location.reload()} />
          ))}
        </div>
      )}

      {/* Private Funds Drawer */}
      <PrivateFundsDrawer 
        open={showPrivateFunds} 
        onClose={() => setShowPrivateFunds(false)} 
      />
    </div>
  );
};

export default MarketplaceView;
