import React from "react";

const ProductFormStep4 = ({ productData }) => {
  if (!productData) return <div className="form-step">No product data provided.</div>;

  const {
    productName,
    displayUnitPrice,
    unitPriceWei,
    productId,
    paymentToken,
    vcPreview,
    productContract,
    priceVisibility,
    proofFamily,
    priceCommitment,
  } = productData;

  return (
    <div className="form-step">
      <h3>Product Created Successfully</h3>

      <p><strong>Name:</strong> {productName}</p>
      <p><strong>Price Visibility:</strong> {priceVisibility === "private" ? "Private Price" : "Public Price"}</p>
      <p><strong>Proof Family:</strong> {proofFamily || (priceVisibility === "private" ? "bulletproof" : "fiat-shamir")}</p>
      <p>
        <strong>{priceVisibility === "private" ? "Confidential" : "Public"} Unit Price:</strong>{" "}
        {priceVisibility === "private" ? "Private" : `${displayUnitPrice} WETH`}
      </p>
      {priceVisibility === "private" ? (
        <p className="break-all"><strong>Stored Price Commitment:</strong> {priceCommitment || vcPreview?.priceCommitment}</p>
      ) : (
        <p className="break-all"><strong>Stored Unit Price Wei:</strong> {unitPriceWei}</p>
      )}
      {(productId || vcPreview?.productId) && (
        <p><strong>Product ID:</strong> {productId || vcPreview?.productId}</p>
      )}
      {(paymentToken || vcPreview?.paymentToken) && (
        <p className="break-all">
          <strong>Confidential Payment Token:</strong> {paymentToken || vcPreview?.paymentToken}
        </p>
      )}

      {(productContract || vcPreview?.productContract) && (
        <p>
          <strong>Product Contract:</strong>{" "}
          <a
            href={`https://sepolia.etherscan.io/address/${productContract || vcPreview?.productContract}`}
            target="_blank"
            rel="noreferrer"
          >
            {(productContract || vcPreview?.productContract).slice(0, 10)}...
          </a>
        </p>
      )}

      <p className="text-sm text-gray-600">
        Buyer orders happen next from the product page. The single commitment VRC is created later
        when the seller confirms a real order.
      </p>
    </div>
  );
};

export default ProductFormStep4;
