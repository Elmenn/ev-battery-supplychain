import React from "react";

const ProductFormStep4 = ({ productData }) => {
  // Fallback in case productData is missing
  if (!productData) return <div className="form-step">❌ No product data provided</div>;

  const { productName, price, quantity, cid, vcPreview } = productData;

  return (
    <div className="form-step">
      <h3>✅ Product Created Successfully</h3>

      <p><strong>Name:</strong> {productName}</p>
      <p><strong>Price:</strong> {price} ETH</p>
      <p><strong>Quantity:</strong> {quantity}</p>

      {cid && (
        <p>
          <strong>VC CID:</strong>{" "}
          <a
            href={`https://ipfs.io/ipfs/${cid}`}
            target="_blank"
            rel="noreferrer"
          >
            {cid.slice(0, 10)}…
          </a>
        </p>
      )}

      {vcPreview?.credentialSubject?.subjectDetails?.productContract && (
        <p>
          <strong>Product Contract:</strong>{" "}
          <a
            href={`https://sepolia.etherscan.io/address/${vcPreview.credentialSubject.subjectDetails.productContract}`}
            target="_blank"
            rel="noreferrer"
          >
            {vcPreview.credentialSubject.subjectDetails.productContract.slice(0, 10)}…
          </a>
        </p>
      )}
    </div>
  );
};

export default ProductFormStep4;
