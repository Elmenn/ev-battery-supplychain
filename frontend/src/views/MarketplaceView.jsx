import React, { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import ProductCard from "../components/marketplace/ProductCard";
import ProductFormWizard from "../components/marketplace/ProductFormWizard";
import PrivateFundsDrawer from "../components/railgun/PrivateFundsDrawer";
import RailgunConnectionButton from "../components/railgun/RailgunConnectionButton";
import { Button } from "../components/ui/button";
import { getProductState, getEscrowContract, Phase } from "../utils/escrowHelpers";
import { getProductMeta } from "../utils/productMetaApi";
import { loadErc7984DeploymentConfig } from "../utils/erc7984Deployment";
import { readProductEscrowState } from "../utils/erc7984/escrowState";

const ZERO = "0x0000000000000000000000000000000000000000";
const FACTORY_ABI = [
  "function getProducts() view returns (address[] memory)",
  "function productCount() view returns (uint256)",
  "function products(uint256) view returns (address)",
];

const filters = [
  { id: "all", label: "All" },
  { id: "my", label: "My Listings" },
  { id: "purchased", label: "My Purchases" },
  { id: "needs-transporter", label: "Needs Transporter" },
  { id: "my-bids", label: "My Bids" },
  { id: "assigned", label: "Assigned to Me" },
];

const MarketplaceView = ({ myAddress, provider, backendUrl }) => {
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [showPrivateFunds, setShowPrivateFunds] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deploymentConfig, setDeploymentConfig] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      const nextConfig = await loadErc7984DeploymentConfig();
      if (!cancelled) {
        setDeploymentConfig(nextConfig);
      }
    }

    loadConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadProducts = useCallback(async () => {
    const factoryAddress = String(deploymentConfig?.factory || "").trim();
    if (!provider || !ethers.isAddress(factoryAddress)) {
      setProducts([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider);

      let addresses = [];
      try {
        addresses = await factory.getProducts();
        if (!addresses || addresses.length === 0 || addresses.every((addr) => addr === ZERO)) {
          addresses = [];
        }
      } catch {
        try {
          const counter = await factory.productCount();
          if (counter > 0) {
            addresses = [];
            for (let i = 0; i < counter; i += 1) {
              try {
                const addr = await factory.products(i);
                if (addr && addr !== ZERO) {
                  addresses.push(addr);
                }
              } catch {
                // Skip invalid product index.
              }
            }
          }
        } catch {
          addresses = [];
        }
      }

      const items = await Promise.all(
        addresses.map(async (addr) => {
          try {
            const meta = await getProductMeta(addr);
            const listingMeta = meta?.productMeta || {};
            const orderModel = String(
              listingMeta.orderModel || "erc7984-confidential-v1"
            ).trim();
            const unitPriceWei = meta?.unitPriceWei || listingMeta.unitPriceWei || "";

            const state =
              orderModel === "erc7984-confidential-v1"
                ? await readProductEscrowState(provider, addr)
                : await getProductState(addr, provider);

            let transporterAddresses = [];
            let transporterFees = [];
            try {
              const escrow = getEscrowContract(addr, provider);
              const [addrs, fees] = await escrow.getAllTransporters();
              transporterAddresses = Array.from(addrs);
              transporterFees = Array.from(fees);
            } catch {
              // getAllTransporters may not exist on older contracts.
            }

            return {
              ...state,
              address: state.address || state.escrowAddress || addr,
              name: listingMeta.productName || listingMeta.name || state.name,
              unitPriceWei,
              owner: (state.owner || state.sellerAddress || "").toLowerCase(),
              seller: (state.owner || state.sellerAddress || "").toLowerCase(),
              buyer: (state.buyer || state.buyerAddress || "").toLowerCase(),
              transporter: state.transporter || state.transporterAddress || ZERO,
              orderModel,
              transporterAddresses,
              transporterFees,
            };
          } catch (err) {
            console.error("Skipping invalid contract at", addr, err);
            return null;
          }
        })
      );

      setProducts(items.filter(Boolean));
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [deploymentConfig?.factory, provider]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleProductCreated = useCallback(async () => {
    setShowForm(false);
    setFilter("my");
    await loadProducts();
  }, [loadProducts]);

  const filtered = products.filter((p) => {
    const me = myAddress?.toLowerCase();
    if (filter === "my") return p.owner === me;
    if (filter === "purchased") return p.buyer && p.buyer !== ZERO.toLowerCase() && p.buyer === me;
    if (filter === "needs-transporter") return p.phase === Phase.OrderConfirmed;
    if (filter === "my-bids") return p.transporterAddresses?.some((addr) => addr.toLowerCase() === me);
    if (filter === "assigned") {
      return (
        p.transporter &&
        p.transporter.toLowerCase() !== ZERO.toLowerCase() &&
        p.transporter.toLowerCase() === me
      );
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">EV Battery Marketplace</h2>

        <div className="flex items-center gap-3">
          <RailgunConnectionButton currentUser={myAddress} />
          <Button
            onClick={() => setShowPrivateFunds(true)}
            variant="outline"
            className="bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
          >
            Private Funds
          </Button>
          <Button onClick={() => setShowForm((previous) => !previous)}>
            {showForm ? "Close Form" : "Add Product"}
          </Button>
        </div>
      </div>

      {showForm && (
        <div className="border rounded-xl p-6 bg-gray-50">
          <ProductFormWizard
            provider={provider}
            backendUrl={backendUrl}
            currentUser={myAddress}
            onCompleted={handleProductCreated}
          />
        </div>
      )}

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

      {loading ? (
        <p>Loading products...</p>
      ) : filtered.length === 0 ? (
        <p>No products to show.</p>
      ) : (
        <div className="grid gap-6 justify-items-center sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((product) => (
            <ProductCard key={product.address} product={product} myAddress={myAddress} />
          ))}
        </div>
      )}

      <PrivateFundsDrawer
        open={showPrivateFunds}
        onClose={() => setShowPrivateFunds(false)}
      />
    </div>
  );
};

export default MarketplaceView;
