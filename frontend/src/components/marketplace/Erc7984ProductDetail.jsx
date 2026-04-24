import React from "react";
import { ethers } from "ethers";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Button } from "../ui/button";
import Erc7984BuyerPurchaseCard from "./Erc7984BuyerPurchaseCard";
import Erc7984TransporterBidCard from "./Erc7984TransporterBidCard";
import { formatTokenAmount } from "../../utils/tokenDisplay";
import { getLocalPrivatePricePackage, serializePrivatePricePackage } from "../../utils/erc7984/privatePricePackage";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const PHASE_LABELS = {
  0: "Listed",
  1: "Purchased",
  2: "Order Confirmed",
  3: "In Delivery",
  4: "Delivered",
  5: "Expired",
};

function truncateAddress(value) {
  if (!value) return "";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatUnitPrice(unitPriceWei, priceVisibility) {
  if (priceVisibility === "private") {
    return "Private";
  }
  return formatTokenAmount(unitPriceWei, { symbol: "WETH", fallback: "Not set" });
}

function deriveRole(product, currentUser) {
  if (!currentUser) return "visitor";
  const user = String(currentUser).toLowerCase();

  if ((product?.sellerAddress || "").toLowerCase() === user) return "seller";
  if ((product?.buyerAddress || "").toLowerCase() === user) return "buyer";
  if (
    product?.transporterAddress &&
    String(product.transporterAddress).toLowerCase() !== ZERO_ADDRESS &&
    String(product.transporterAddress).toLowerCase() === user
  ) {
    return "transporter";
  }

  return "visitor";
}

export default function Erc7984ProductDetail({
  address,
  product,
  productMeta,
  provider,
  currentUser,
  onRefresh,
}) {
  const navigate = useNavigate();
  const listingMeta = productMeta?.productMeta || {};
  const role = deriveRole(product, currentUser);
  const unitPriceWei = productMeta?.unitPriceWei || listingMeta.unitPriceWei || "";
  const priceVisibility = listingMeta.priceVisibility || "public";
  const privatePricePackage = priceVisibility === "private" ? getLocalPrivatePricePackage(address) : null;
  const phaseLabel = PHASE_LABELS[Number(product?.phase)] || "Unknown";
  const boundHash = product?.vcHash || ethers.ZeroHash;
  const hasBoundCommitment = boundHash !== ethers.ZeroHash;
  const activeOrderId =
    product?.activeOrderId && product.activeOrderId !== ethers.ZeroHash
      ? product.activeOrderId
      : "";
  const sellerActionHref = `/seller/orders/${encodeURIComponent(address)}`;
  const verifierHref = `/product/${encodeURIComponent(address)}/verify`;

  async function handleCopyPrivatePricePackage() {
    const payload = serializePrivatePricePackage(address);
    if (!payload) {
      toast.error("Private-price package is not available in this browser for this listing.");
      return;
    }

    try {
      await navigator.clipboard.writeText(payload);
      toast.success("Private-price package copied.");
    } catch (error) {
      toast.error(error?.message || "Failed to copy the private-price package.");
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-[0.24em] text-cyan-700">
              ERC-7984 Confidential Listing
            </div>
            <h1 className="text-3xl font-semibold text-slate-900">
              {listingMeta.productName || product?.name || "Unnamed Product"}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              This listing uses the ERC-7984 confidential order model.{" "}
              {priceVisibility === "private"
                ? "Price is hidden at listing level and anchored by a confidential commitment."
                : "Public unit price is shown here in WETH, while buyer quantity and confidential payment are handled privately during the order flow."}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <div className="text-xs uppercase tracking-wide text-slate-500">Current Stage</div>
            <div className="mt-1 font-medium text-slate-900">{phaseLabel}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Listing Summary</h2>
            <p className="mt-1 text-sm text-slate-600">
              This is the production marketplace surface for ERC-7984 listings, including the
              first buyer-facing confidential purchase path.
            </p>
          </div>

          <div className="grid gap-3 text-sm text-slate-700">
            <div>
              <strong>Unit Price:</strong> {formatUnitPrice(unitPriceWei, priceVisibility)}
            </div>
            <div>
              <strong>Price Visibility:</strong> {priceVisibility === "private" ? "Private" : "Public"}
            </div>
            <div>
              <strong>Seller:</strong> {truncateAddress(product?.sellerAddress)}
            </div>
            <div>
              <strong>Product Contract:</strong> {truncateAddress(address)}
            </div>
            <div>
              <strong>Product ID:</strong> {listingMeta.productId || ""}
            </div>
            <div>
              <strong>Payment Token:</strong>{" "}
              {truncateAddress(product?.paymentToken || listingMeta.paymentToken || "")}
            </div>
          </div>

          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
            <div className="text-sm font-medium text-cyan-900">Current bridge state</div>
            <p className="mt-2 text-sm text-cyan-800">
              The old mixed product-detail flow has been removed for this listing type. This page
              now reads ERC-7984 state only, which prevents legacy V2 calls from breaking
              confidential escrows.
            </p>
          </div>

          {role === "seller" && priceVisibility === "private" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-medium text-amber-950">Seller Private-Price Package</div>
              <p className="mt-2 text-sm text-amber-900">
                Buyers need the off-chain price opening for this listing before they can generate
                the private-price Bulletproof purchase sidecar.
              </p>
              <div className="mt-3 space-y-2 text-sm text-amber-900">
                <div className="break-all">
                  <strong>On-chain commitment:</strong>{" "}
                  {privatePricePackage?.priceCommitment || listingMeta.priceCommitment || "missing"}
                </div>
                <div>
                  <strong>Local package status:</strong>{" "}
                  {privatePricePackage ? "available in this browser" : "not available in this browser"}
                </div>
              </div>
              <div className="mt-4">
                <Button onClick={handleCopyPrivatePricePackage} disabled={!privatePricePackage}>
                  Copy Private Price Package
                </Button>
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <Erc7984BuyerPurchaseCard
            address={address}
            product={product}
            productMeta={productMeta}
            provider={provider}
            currentUser={currentUser}
            role={role}
            onPurchaseComplete={onRefresh}
          />

          {role === "seller" && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-amber-950">Seller Order Actions</h2>
              <p className="mt-2 text-sm text-amber-900">
                The buyer deposit is now recorded. Continue the seller confirmation flow on the
                ERC-7984 actions page with this product and active order preloaded.
              </p>
              <div className="mt-4 space-y-2 text-sm text-amber-900">
                <div>
                  <strong>Active order:</strong>{" "}
                  {activeOrderId ? activeOrderId : "Will appear after the first buyer deposit"}
                </div>
                <div>
                  <strong>Stage:</strong> {phaseLabel}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button onClick={() => navigate(sellerActionHref)} disabled={!activeOrderId}>
                  Open Seller Order
                </Button>
              </div>
            </div>
          )}

          <Erc7984TransporterBidCard
            address={address}
            product={product}
            provider={provider}
            currentUser={currentUser}
            role={role}
            onBidComplete={onRefresh}
          />

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Commitment Record</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <div>
                <strong>Status:</strong>{" "}
                {hasBoundCommitment ? "Bound on-chain" : "Not bound yet"}
              </div>
              <div className="break-all">
                <strong>VC Hash:</strong>{" "}
                {hasBoundCommitment ? boundHash : "Will appear after seller confirms order"}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={() => navigate(verifierHref)} disabled={!hasBoundCommitment}>
                Open Auditor / Verifier
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Debug / Operator Tools</h2>
            <p className="mt-2 text-sm text-slate-600">
              The buyer marketplace path is now available here. The ERC-7984 workbench remains
              available for deeper inspection, recovery, and protocol debugging.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={() => navigate("/erc7984/actions")}>
                Open ERC-7984 Actions
              </Button>
              <Button variant="ghost" onClick={() => navigate("/erc7984/vrc")}>
                Open ERC-7984 VRC
              </Button>
            </div>

            {role !== "visitor" && (
              <p className="mt-3 text-xs text-slate-500">
                Connected role: <strong>{role}</strong>
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
