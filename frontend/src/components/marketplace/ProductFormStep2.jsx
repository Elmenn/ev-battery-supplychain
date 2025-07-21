import React, { useState } from "react";

const ProductFormStep2 = ({ onNext }) => {
  const [formData, setFormData] = useState({
    batch: "",
    quantity: 1,
    productContract: "",
    certificateName: "",
    certificateCid: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleNext = () => {
    onNext(formData);
  };

  return (
    <div className="form-step">
      <h3>Step 2: Product Details</h3>

      <div className="form-group">
        <label>Batch ID (optional)</label>
        <input
          type="text"
          name="batch"
          value={formData.batch}
          onChange={handleChange}
          placeholder="e.g. BX-001"
        />
      </div>

      <div className="form-group">
        <label>Quantity</label>
        <input
          type="number"
          name="quantity"
          value={formData.quantity}
          onChange={handleChange}
          min="1"
        />
      </div>

      <div className="form-group">
        <label>Product Smart Contract Address</label>
        <input
          type="text"
          name="productContract"
          value={formData.productContract}
          onChange={handleChange}
          placeholder="0x..."
        />
      </div>

      <div className="form-group">
        <label>Certification Name (optional)</label>
        <input
          type="text"
          name="certificateName"
          value={formData.certificateName}
          onChange={handleChange}
          placeholder="e.g. Recycled Material Verified"
        />
      </div>

      <div className="form-group">
        <label>Certification IPFS CID (optional)</label>
        <input
          type="text"
          name="certificateCid"
          value={formData.certificateCid}
          onChange={handleChange}
          placeholder="Qm..."
        />
      </div>

      <button className="button" onClick={handleNext}>
        Next
      </button>
    </div>
  );
};

export default ProductFormStep2;
