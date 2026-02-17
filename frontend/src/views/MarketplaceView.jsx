import React, { useEffect, useState } from "react";
import ProductCard from "../components/marketplace/ProductCard";
import ProductFormWizard from "../components/marketplace/ProductFormWizard";
import PrivateFundsDrawer from "../components/railgun/PrivateFundsDrawer";
import RailgunConnectionButton from "../components/railgun/RailgunConnectionButton";
import { Button } from "../../src/components/ui/button";
import { getProductState, getEscrowContract, Phase } from "../utils/escrowHelpers";
import { ethers } from "ethers";

import ProductFactoryABI from "../abis/ProductFactory.json";

const ZERO = "0x0000000000000000000000000000000000000000";

const filters = [
  { id: "all", label: "All" },
  { id: "my", label: "My Listings" },
  { id: "purchased", label: "My Purchases" },
  { id: "needs-transporter", label: "Needs Transporter" },
  { id: "my-bids", label: "My Bids" },
  { id: "assigned", label: "Assigned to Me" },
];

const MarketplaceView = ({ myAddress, provider, backendUrl }) => {
  const factoryAddress = process.env.REACT_APP_FACTORY_ADDRESS || '0x0000000000000000000000000000000000000000';

  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [showPrivateFunds, setShowPrivateFunds] = useState(false);
  const [loading, setLoading] = useState(true);

  /* --- fetch products ---------------------------------------------------- */
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

        // Fetch product addresses from factory
        let addresses = [];
        try {
          addresses = await factory.getProducts();
          if (!addresses || addresses.length === 0 || addresses.every(addr => addr === ZERO)) {
            addresses = [];
          }
        } catch (err) {
          // getProducts() failed, try counter approach
          try {
            const counter = await factory.productCount();
            if (counter > 0) {
              addresses = [];
              for (let i = 0; i < counter; i++) {
                try {
                  const addr = await factory.products(i);
                  if (addr && addr !== ZERO) {
                    addresses.push(addr);
                  }
                } catch (e) {
                  // Skip invalid product index
                }
              }
            }
          } catch (counterErr) {
            addresses = [];
          }
        }

        const items = await Promise.all(
          addresses.map(async (addr) => {
            try {
              // Use getProductState from escrowHelpers for all scalar reads
              const state = await getProductState(addr, provider);

              // Read transporter list for filter support
              let transporterAddresses = [];
              let transporterFees = [];
              try {
                const escrow = getEscrowContract(addr, provider);
                const [addrs, fees] = await escrow.getAllTransporters();
                transporterAddresses = Array.from(addrs);
                transporterFees = Array.from(fees);
              } catch (e) {
                // getAllTransporters may not exist on older contracts
              }

              // Get stored Railgun data from localStorage
              const sellerRailgunAddress = localStorage.getItem(`sellerRailgunAddress_${addr}`);
              const sellerWalletID = localStorage.getItem(`sellerWalletID_${addr}`);

              return {
                ...state,
                price: "Private",
                owner: state.owner?.toLowerCase(),
                seller: state.owner?.toLowerCase(),
                buyer: state.buyer?.toLowerCase(),
                transporter: state.transporter,
                transporterAddresses,
                transporterFees,
                sellerRailgunAddress,
                sellerWalletID,
              };
            } catch (err) {
              console.error("Skipping invalid contract at", addr, err);
              return null;
            }
          })
        );
        setProducts(items.filter(Boolean));
      } catch (err) {
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [myAddress, provider, factoryAddress]);

  /* --- filter helpers ---------------------------------------------------- */
  const filtered = products.filter((p) => {
    const me = myAddress?.toLowerCase();
    if (filter === "my") return p.owner === me;
    if (filter === "purchased") return p.buyer && p.buyer !== ZERO.toLowerCase() && p.buyer === me;
    if (filter === "needs-transporter") return p.phase === Phase.OrderConfirmed;
    if (filter === "my-bids") return p.transporterAddresses?.some(addr => addr.toLowerCase() === me);
    if (filter === "assigned") return p.transporter && p.transporter.toLowerCase() !== ZERO.toLowerCase() && p.transporter.toLowerCase() === me;
    return true;
  });

  /* --- render ------------------------------------------------------------ */
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* header bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">
          EV Battery Marketplace
        </h2>

        <div className="flex items-center gap-3">
          <RailgunConnectionButton currentUser={myAddress} />
          <Button
            onClick={() => setShowPrivateFunds(true)}
            variant="outline"
            className="bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
          >
            Private Funds
          </Button>
          <Button onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Close Form" : "Add Product"}
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
        {filters.map(({ id, label }) => (
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
        <p>Loading products...</p>
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
