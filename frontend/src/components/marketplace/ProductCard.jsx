import React from "react";
import { useNavigate } from "react-router-dom";
import { ethers } from "ethers";

import { Button } from "../ui/button";
import ProductEscrowABI from "../../abis/ProductEscrow.json";

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
      text: "Awaiting Transporter",
      cls: "bg-yellow-100 text-yellow-800",
    };
  else if (hasBuyer)
    badge = { text: "Awaiting Confirm", cls: "bg-orange-100 text-orange-800" };

  /* buy-now handler ------------------------------------------------------- */
  const handleBuy = async () => {
    if (!provider) return navigate(`/product/${product.address}`);

    try {
      if (!product.priceWei) {
        alert("No price available for purchase. Please contact the seller.");
        return;
      }
      const signer = await provider.getSigner();
      const escrow = new ethers.Contract(
        product.address,
        ProductEscrowABI.abi,
        signer
      );

      const tx = await escrow.depositPurchase({ value: product.priceWei });
      await tx.wait();

      if (onPurchased) onPurchased(); // optional refresh callback
    } catch (err) {
      console.error("Buy failed:", err);
      alert("Buy failed – check the console for details.");
    }
  };

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
      </div>

      {/* footer */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => navigate(`/product/${product.address}`)}
        >
          Details
        </Button>

        {!hasBuyer && !isMine && (
          <Button onClick={() => navigate(`/product/${product.address}`)}>Buy Now</Button>
        )}
      </div>
    </div>
  );
};

export default ProductCard;
