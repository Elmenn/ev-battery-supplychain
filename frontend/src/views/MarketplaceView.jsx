import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import ProductCard from "../components/marketplace/ProductCard";
import ProductFormWizard from "../components/marketplace/ProductFormWizard";
import { Button } from "../../src/components/ui/button";
import RailgunNavButton from "../components/ui/RailgunNavButton";

import ProductFactoryABI from "../abis/ProductFactory.json";
import ProductEscrowABI from "../abis/ProductEscrow.json";

const MarketplaceView = ({ myAddress, provider, backendUrl }) => {
  const factoryAddress = process.env.REACT_APP_FACTORY_ADDRESS;

  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
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

        const addresses = await factory.getProducts();
        const items = await Promise.all(
          addresses.map(async (addr) => {
            try {
              const pc = new ethers.Contract(addr, ProductEscrowABI.abi, provider);
              let price;
              try {
                price = await pc.price();
              } catch (err) {
                price = "Price hidden 🔒";
              }
              const [name, owner, purchased, buyer, vcCid, transporter] =
                await Promise.all([
                  pc.name(),
                  pc.owner(),
                  pc.purchased(),
                  pc.buyer(),
                  pc.vcCid(),
                  pc.transporter(),
                ]);
              const priceWei = localStorage.getItem(`priceWei_${addr}`);
              const product = {
                name,
                price,
                priceWei, // <-- add this
                owner: owner.toLowerCase(),
                buyer: buyer.toLowerCase(),
                purchased,
                transporter,
                vcCid,
                address: addr,
              };
              return product;
            } catch (err) {
              console.error("Skipping invalid contract at", addr, err);
              return null;
            }
          })
        );
        setProducts(items.filter(Boolean));
      } catch (err) {
        console.error("load products error", err);
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
          <RailgunNavButton variant="outlined" size="small" />
          <Button onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Close Form" : "➕ Add Product"}
          </Button>
        </div>
      </div>

      {/* new-product wizard */}
      {showForm && (
        <div className="border rounded-xl p-6 bg-gray-50">
          <ProductFormWizard provider={provider} backendUrl={backendUrl} />
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
    </div>
  );
};

export default MarketplaceView;
