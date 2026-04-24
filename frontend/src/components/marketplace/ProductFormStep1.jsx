import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { loadErc7984DeploymentConfig } from "../../utils/erc7984Deployment";

const ProductFormStep1 = ({ onNext }) => {
  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const [priceVisibility, setPriceVisibility] = useState("public");
  const [seller, setSeller] = useState("");
  const [deploymentConfig, setDeploymentConfig] = useState(null);

  let parsedUnitPriceWei = "";
  let priceError = "";

  if (price.trim()) {
    try {
      parsedUnitPriceWei = ethers.parseUnits(price.trim(), 18).toString();
      if (BigInt(parsedUnitPriceWei) <= 0n) {
        priceError = "Enter a public unit price greater than zero.";
      }
    } catch {
      priceError = "Enter a valid WETH amount, for example 0.0002 or 0.002.";
    }
  }

  useEffect(() => {
    let cancelled = false;

    const fetchAddress = async () => {
      if (window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        if (!cancelled) {
          setSeller(address);
        }
      }
    };

    const loadConfig = async () => {
      const nextConfig = await loadErc7984DeploymentConfig();
      if (!cancelled) {
        setDeploymentConfig(nextConfig);
      }
    };

    fetchAddress();
    loadConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  const publicTokenLabel = deploymentConfig?.publicTokenSymbol || "WETH";
  const supportsPrivatePrice = Boolean(deploymentConfig?.supportsPrivatePrice);

  const handleNext = () => {
    if (!productName || !price || !seller || !parsedUnitPriceWei) return;
    const effectivePriceVisibility =
      priceVisibility === "private" && !supportsPrivatePrice ? "public" : priceVisibility;
    onNext({
      productName: productName.trim(),
      priceVisibility: effectivePriceVisibility,
      proofFamily: effectivePriceVisibility === "private" ? "bulletproof" : "fiat-shamir",
      displayUnitPrice: price.trim(),
      unitPriceWei: parsedUnitPriceWei,
      seller,
    });
  };

  return (
    <div className="form-step">
      <h3>Step 1: Product Basics</h3>
      <input
        type="text"
        placeholder="Product Name"
        value={productName}
        onChange={(e) => setProductName(e.target.value)}
      />
      <label className="block text-sm font-medium mb-1">Price Visibility</label>
      <select
        value={priceVisibility}
        onChange={(e) => setPriceVisibility(e.target.value)}
        className="mb-3 w-full rounded border border-gray-300 px-3 py-2"
      >
        <option value="public">Public Price</option>
        <option value="private" disabled={!supportsPrivatePrice}>
          Private Price{!supportsPrivatePrice ? " (redeploy required)" : ""}
        </option>
      </select>
      {!supportsPrivatePrice ? (
        <div className="text-xs text-amber-700 mb-2">
          The currently loaded ERC-7984 Sepolia deployment only supports the public-price factory path.
          Private-price listings will be available after we redeploy the upgraded dual-profile factory and
          private escrow implementation.
        </div>
      ) : null}
      <input
        type="text"
        inputMode="decimal"
        placeholder={`${
          priceVisibility === "private" ? "Confidential" : "Public"
        } Unit Price (${publicTokenLabel})`}
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />
      <div className="text-xs text-gray-500 mb-2">
        {priceVisibility === "private"
          ? `This price stays off the public listing. Enter a decimal ${publicTokenLabel} amount and the app will use it locally to generate the on-chain confidential price commitment for the private-price profile.`
          : `This unit price is public. Enter a decimal ${publicTokenLabel} amount and the app will store the canonical on-chain value in raw wei units. Buyer order quantity and confidential payment are handled later in the private ERC-7984 order flow.`}
      </div>
      {priceError ? (
        <div className="text-xs text-red-600 mb-2">{priceError}</div>
      ) : parsedUnitPriceWei ? (
        <div className="text-xs text-gray-500 mb-2 break-all">
          Canonical local price value in raw {publicTokenLabel} wei:{" "}
          <span className="font-mono">{parsedUnitPriceWei}</span>
        </div>
      ) : null}
      <button onClick={handleNext} disabled={!productName || !price || !parsedUnitPriceWei}>
        Next
      </button>
    </div>
  );
};

export default ProductFormStep1;
