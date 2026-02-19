import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../ui/button";

const ZERO = "0x0000000000000000000000000000000000000000";
const truncate = (addr) => addr?.slice(0, 6) + "..." + addr?.slice(-4);

// Phase-to-badge mapping (matches escrowHelpers.Phase enum)
const PHASE_BADGES = {
  0: { text: "Listed", cls: "bg-gray-100 text-gray-700" },
  1: { text: "Purchased", cls: "bg-purple-100 text-purple-700" },
  2: { text: "Order Confirmed", cls: "bg-orange-100 text-orange-800" },
  3: { text: "In Delivery", cls: "bg-blue-100 text-blue-700" },
  4: { text: "Delivered", cls: "bg-green-100 text-green-700" },
  5: { text: "Expired", cls: "bg-red-100 text-red-700" },
};

/**
 * Compute a role-aware secondary action chip based on the user's relationship
 * to the product and the current contract phase.
 */
function getSecondaryBadge(product, myAddress) {
  if (!myAddress) return null;
  const me = myAddress.toLowerCase();

  // Seller chips
  if (product.owner === me) {
    if (product.phase === 1) return { text: "Confirm Order", cls: "bg-amber-100 text-amber-800" };
    if (product.phase === 2) return { text: "Select Transporter", cls: "bg-amber-100 text-amber-800" };
    return null;
  }

  // Buyer chips
  if (product.buyer && product.buyer !== ZERO.toLowerCase() && product.buyer === me) {
    if (product.phase === 3) return { text: "In Transit", cls: "bg-blue-100 text-blue-700" };
    return null;
  }

  // Assigned transporter chips
  if (product.transporter && product.transporter.toLowerCase() !== ZERO.toLowerCase() && product.transporter.toLowerCase() === me) {
    if (product.phase === 3) return { text: "Deliver", cls: "bg-emerald-100 text-emerald-700" };
    return null;
  }

  // Bidding transporter chips
  if (product.transporterAddresses?.some(addr => addr.toLowerCase() === me)) {
    if (product.phase === 2) return { text: "Bid Placed", cls: "bg-cyan-100 text-cyan-700" };
    return null;
  }

  return null;
}

const ProductCard = ({ product, myAddress }) => {
  const navigate = useNavigate();

  const primaryBadge = PHASE_BADGES[product.phase] || PHASE_BADGES[0];
  const secondaryBadge = getSecondaryBadge(product, myAddress);
  const hasBuyer = product.buyer && product.buyer !== ZERO.toLowerCase();

  return (
    <div className="w-72 rounded-xl border border-gray-200 bg-white p-6 shadow transition hover:shadow-lg animate-fade-in space-y-4">
      {/* header */}
      <div className="flex items-start justify-between">
        <h4 className="font-semibold">{product.name || "Unnamed"}</h4>
        <div className="flex flex-col items-end gap-1">
          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${primaryBadge.cls}`}>
            {primaryBadge.text}
          </span>
          {secondaryBadge && (
            <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${secondaryBadge.cls}`}>
              {secondaryBadge.text}
            </span>
          )}
        </div>
      </div>

      {/* body */}
      <div className="space-y-1 text-sm">
        <div>
          <span className="font-medium">Price:</span>{" "}
          <span>Private</span>
        </div>
        <div>
          <span className="font-medium">Owner:</span> {truncate(product.owner)}
        </div>
        {hasBuyer && (
          <div>
            <span className="font-medium">Buyer:</span> {truncate(product.buyer)}
          </div>
        )}
      </div>

      {/* footer */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => navigate(`/product/${product.address}`)}
          className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
        >
          View Details
        </Button>
      </div>
    </div>
  );
};

export default ProductCard;

