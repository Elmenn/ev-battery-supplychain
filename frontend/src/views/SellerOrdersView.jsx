import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import { Button } from "../components/ui/button";
import { loadErc7984DeploymentConfig } from "../utils/erc7984Deployment";
import { getProductMeta } from "../utils/productMetaApi";
import { readProductEscrowState } from "../utils/erc7984/escrowState";

const FACTORY_ABI = [
  "function getProducts() view returns (address[] memory)",
  "function productCount() view returns (uint256)",
  "function products(uint256) view returns (address)",
];

const ZERO = ethers.ZeroAddress.toLowerCase();

function phaseLabel(phase) {
  switch (Number(phase)) {
    case 1:
      return "Purchased";
    case 2:
      return "Order Confirmed";
    case 3:
      return "In Delivery";
    case 4:
      return "Delivered";
    case 5:
      return "Expired";
    default:
      return "Listed";
  }
}

export default function SellerOrdersView({ provider, currentUser }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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

  const loadOrders = useCallback(async () => {
    const seller = String(currentUser || "").toLowerCase();
    const factoryAddress = String(deploymentConfig?.factory || "").trim();
    if (!provider || !seller || !ethers.isAddress(factoryAddress)) {
      setRows([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider);
      let addresses = [];

      try {
        addresses = await factory.getProducts();
      } catch {
        const count = await factory.productCount().catch(() => 0n);
        for (let i = 0n; i < count; i += 1n) {
          const addr = await factory.products(i).catch(() => null);
          if (addr && addr !== ethers.ZeroAddress) {
            addresses.push(addr);
          }
        }
      }

      const items = await Promise.all(
        addresses.map(async (address) => {
          const [metaRow, state] = await Promise.all([
            getProductMeta(address),
            readProductEscrowState(provider, address),
          ]);
          const listingMeta = metaRow?.productMeta || {};
          const sellerAddress = String(state?.sellerAddress || "").toLowerCase();
          if (sellerAddress !== seller) {
            return null;
          }

          return {
            address: String(address).toLowerCase(),
            name: listingMeta.productName || state.name || "Unnamed Product",
            productId: listingMeta.productId || "",
            buyerAddress: state.buyerAddress || "",
            phase: Number(state.phase),
            activeOrderId: state.activeOrderId || ethers.ZeroHash,
          };
        })
      );

      setRows(
        items
          .filter(Boolean)
          .sort((left, right) => Number(right.phase) - Number(left.phase))
      );
    } catch (loadError) {
      setError(loadError.message || "Failed to load seller orders.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser, deploymentConfig?.factory, provider]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-amber-700">Seller Dashboard</div>
          <h1 className="text-3xl font-semibold text-slate-900">Seller Orders</h1>
          <p className="mt-2 text-sm text-slate-600">
            Manage incoming ERC-7984 orders without dropping back to the generic workbench.
          </p>
        </div>
        <Button onClick={() => navigate("/")}>Back To Marketplace</Button>
      </div>

      {loading ? <p className="text-slate-500">Loading seller orders...</p> : null}
      {error ? <p className="text-red-600">{error}</p> : null}

      {!loading && !error && rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-600">
          No seller orders yet. Listings will appear here once they receive a buyer deposit.
        </div>
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <div className="grid gap-4">
          {rows.map((row) => {
            const hasBuyer = row.buyerAddress && row.buyerAddress !== ZERO;
            const hasActiveOrder = row.activeOrderId && row.activeOrderId !== ethers.ZeroHash;

            return (
              <div
                key={row.address}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-slate-900">{row.name}</h2>
                    <div className="text-sm text-slate-600">Product ID: {row.productId || "-"}</div>
                    <div className="text-sm text-slate-600">Stage: {phaseLabel(row.phase)}</div>
                    <div className="text-sm text-slate-600 break-all">
                      Buyer: {hasBuyer ? row.buyerAddress : "No buyer yet"}
                    </div>
                    <div className="text-sm text-slate-600 break-all">
                      Active Order: {hasActiveOrder ? row.activeOrderId : "Not created yet"}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button onClick={() => navigate(`/seller/orders/${row.address}`)}>
                      Manage Order
                    </Button>
                    <Button variant="ghost" onClick={() => navigate(`/product/${row.address}`)}>
                      View Product Page
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
