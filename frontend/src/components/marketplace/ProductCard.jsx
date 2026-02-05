import React from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../ui/button";

const ZERO = "0x0000000000000000000000000000000000000000";
const truncate = (addr) => addr?.slice(0, 6) + "..." + addr?.slice(-4);

const ProductCard = ({ product, myAddress, provider, onPurchased }) => {
  const navigate = useNavigate();

  /* status helpers -------------------------------------------------------- */
  const isMine = myAddress?.toLowerCase() === product.owner?.toLowerCase();
  const ownerIsBuyer =
    product.owner?.toLowerCase() === product.buyer?.toLowerCase();
  const hasBuyer = product.buyer && product.buyer !== ZERO;
  const hasTransporter = product.transporter && product.transporter !== ZERO;

  /* badge ----------------------------------------------------------------- */
  let badge = { text: "Available", cls: "bg-gray-100 text-gray-700" };
  if (ownerIsBuyer)
    badge = { text: "Delivered", cls: "bg-green-100 text-green-700" };
  else if (hasTransporter)
    badge = { text: "In Delivery", cls: "bg-blue-100 text-blue-700" };
  else if (product.purchased)
    badge = {
      text: "Purchased",
      cls: "bg-purple-100 text-purple-700",
    };
  else if (hasBuyer)
    badge = { text: "Awaiting Confirm", cls: "bg-orange-100 text-orange-800" };

  // Removed buy handlers - now handled in ProductDetail.jsx

  /* render ---------------------------------------------------------------- */
  return (
    <div className="w-72 rounded-xl border border-gray-200 bg-white p-6 shadow transition hover:shadow-lg animate-fade-in space-y-4">
      {/* header */}
      <div className="flex items-start justify-between">
        <h4 className="font-semibold">{product.name || "Unnamed"}</h4>
        <span
          className={`rounded-md px-2 py-0.5 text-xs font-medium ${badge.cls}`}
        >
          {badge.text}
        </span>
      </div>

      {/* body */}
      <div className="space-y-1 text-sm">
        <div>
          <span className="font-medium">Price:</span>{" "}
          {product.price === "Price hidden 🔒" ? (
            <span>{product.price}</span>
          ) : (
            <span>{product.price?.toString() || "0"} ETH</span>
          )}
        </div>
        <div>
          <span className="font-medium">Owner:</span> {truncate(product.owner)}
        </div>
        {hasBuyer && (
          <div>
            <span className="font-medium">Buyer:</span> {truncate(product.buyer)}
          </div>
        )}
        {/* 
          NOTE: This component uses product.owner and product.buyer directly from the product data.
          If you want to fix the marketplace list view to show correct wallet addresses,
          you'll need to pass the resolved address states from the parent component.
        */}
      </div>

      {/* footer */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => navigate(`/product/${product.address}`)}
          className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
        >
          🔍 View Details & Buy
        </Button>
      </div>
    </div>
  );
};

export default ProductCard;
