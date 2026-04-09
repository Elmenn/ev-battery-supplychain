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

const ACTION_ESCROW_ABI = [
  "function getAllTransporters() view returns (address[] addrs, uint256[] fees)",
];

function phaseLabel(phase) {
  switch (Number(phase)) {
    case 2:
      return "Open For Transport";
    case 3:
      return "In Delivery";
    case 4:
      return "Delivered";
    case 5:
      return "Expired";
    default:
      return "Not Ready";
  }
}

function normalizeAddress(value) {
  const normalized = value ? String(value).trim().toLowerCase() : "";
  return normalized === ethers.ZeroAddress.toLowerCase() ? "" : normalized;
}

export default function TransporterJobsView({ provider, currentUser }) {
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

  const loadJobs = useCallback(async () => {
    const transporter = normalizeAddress(currentUser);
    const factoryAddress = String(deploymentConfig?.factory || "").trim();
    if (!provider || !transporter || !ethers.isAddress(factoryAddress)) {
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
          const actionContract = new ethers.Contract(address, ACTION_ESCROW_ABI, provider);
          const [metaRow, state, bidData] = await Promise.all([
            getProductMeta(address),
            readProductEscrowState(provider, address),
            actionContract.getAllTransporters().catch(() => [[], []]),
          ]);

          const [transporterAddresses, transporterFees] = bidData;
          const bids = Array.from(transporterAddresses || []).map((bidder, index) => ({
            address: normalizeAddress(bidder),
            fee: transporterFees?.[index]?.toString?.() || "0",
          }));
          const myBid = bids.find((bid) => bid.address === transporter);
          const isAssigned = normalizeAddress(state.transporterAddress) === transporter;
          const isOpenForBids = Number(state.phase) === 2 && !state.transporterAddress;

          if (!isOpenForBids && !isAssigned && !myBid) {
            return null;
          }

          return {
            address: normalizeAddress(address),
            name: metaRow?.productMeta?.productName || state.name || "Unnamed Product",
            productId: metaRow?.productMeta?.productId || "",
            sellerAddress: state.sellerAddress || "",
            phase: Number(state.phase),
            activeOrderId: state.activeOrderId || ethers.ZeroHash,
            transporterAddress: state.transporterAddress || "",
            myBidFee: myBid?.fee || "",
            isAssigned,
            isOpenForBids,
          };
        })
      );

      setRows(items.filter(Boolean).sort((left, right) => Number(right.phase) - Number(left.phase)));
    } catch (loadError) {
      setError(loadError.message || "Failed to load transporter jobs.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser, deploymentConfig?.factory, provider]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-cyan-700">Transporter Dashboard</div>
          <h1 className="text-3xl font-semibold text-slate-900">Transport Jobs</h1>
          <p className="mt-2 text-sm text-slate-600">
            Bid on confirmed ERC-7984 orders and complete delivery from the marketplace flow.
          </p>
        </div>
        <Button onClick={() => navigate("/")}>Back To Marketplace</Button>
      </div>

      {loading ? <p className="text-slate-500">Loading transporter jobs...</p> : null}
      {error ? <p className="text-red-600">{error}</p> : null}

      {!loading && !error && rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-600">
          No transporter jobs yet. Confirmed seller orders will appear here once they are open for bids or assigned to you.
        </div>
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <div className="grid gap-4">
          {rows.map((row) => (
            <div key={row.address} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-slate-900">{row.name}</h2>
                  <div className="text-sm text-slate-600">Product ID: {row.productId || "-"}</div>
                  <div className="text-sm text-slate-600">Stage: {phaseLabel(row.phase)}</div>
                  <div className="text-sm text-slate-600 break-all">Seller: {row.sellerAddress || "unknown"}</div>
                  <div className="text-sm text-slate-600 break-all">
                    Active Order: {row.activeOrderId && row.activeOrderId !== ethers.ZeroHash ? row.activeOrderId : "Not created yet"}
                  </div>
                  <div className="text-sm text-slate-600">
                    {row.isAssigned
                      ? "Assigned to you"
                      : row.myBidFee
                        ? `Your bid: ${row.myBidFee} units`
                        : "Open for bids"}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => navigate(`/transporter/jobs/${row.address}`)}>
                    Open Job
                  </Button>
                  <Button variant="ghost" onClick={() => navigate(`/product/${row.address}`)}>
                    View Product Page
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
