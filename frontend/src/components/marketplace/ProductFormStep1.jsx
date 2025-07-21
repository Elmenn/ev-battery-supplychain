import { useEffect, useState } from "react";
import { ethers } from "ethers";

const ProductFormStep1 = ({ onNext }) => {
  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const [seller, setSeller] = useState("");

  useEffect(() => {
    const fetchAddress = async () => {
      if (window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        setSeller(address);
      }
    };
    fetchAddress();
  }, []);

  const handleNext = () => {
    if (!productName || !price || !seller) return;
    onNext({
      productName,
      price,
      seller,
    });
  };

  return (
    <div className="form-step">
      <h3>Step 1: Product Info</h3>
      <input
        type="text"
        placeholder="Product Name"
        value={productName}
        onChange={(e) => setProductName(e.target.value)}
      />
      <input
        type="number"
        placeholder="Price (ETH)"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />
      <button onClick={handleNext} disabled={!productName || !price}>
        Next
      </button>
    </div>
  );
};

export default ProductFormStep1;
