import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Contract, ethers } from "ethers";
import {
  computeUnitPriceHash,
  generateRandomBlinding,
  normalizeBytes32Hex,
} from "../../utils/commitmentUtils";
import { saveProductMeta } from "../../utils/productMetaApi";
import { loadErc7984DeploymentConfig } from "../../utils/erc7984Deployment";
import { generateScalarCommitmentWithBlindingPreferWasm } from "../../utils/zkp/zkpClient";

const FACTORY_ABI = [
  "function createProductConfidentialV1(string name, uint64 unitPrice, bytes32 unitPriceHash, address paymentToken) returns (address product)",
  "function createProductConfidentialPublicPrice(string name, uint64 unitPrice, bytes32 unitPriceHash, address paymentToken) returns (address product)",
  "function createProductConfidentialPrivatePrice(string name, bytes32 priceCommitment, address paymentToken) returns (address product)",
  "event ProductCreatedConfidential(address indexed product, address indexed seller, uint256 indexed productId, address paymentToken, uint64 unitPrice, bytes32 unitPriceHash)",
  "event ProductCreatedConfidentialPrivatePrice(address indexed product, address indexed seller, uint256 indexed productId, address paymentToken, bytes32 priceCommitment)",
];

const MAX_UINT64 = (1n << 64n) - 1n;

function truncate(text, length = 12) {
  if (!text || text.length <= length) return text;
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function Copyable({ value }) {
  return (
    <span
      className="cursor-pointer font-mono text-sm text-blue-600 hover:text-blue-800 underline"
      title={value}
      onClick={() => navigator.clipboard.writeText(value)}
    >
      {truncate(value)}
    </span>
  );
}

const ProductFormStep3 = ({ onNext, productData }) => {
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [deploymentConfig, setDeploymentConfig] = useState(null);
  const [showMetadataPreview, setShowMetadataPreview] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        const nextConfig = await loadErc7984DeploymentConfig();
        if (!cancelled) {
          setDeploymentConfig(nextConfig);
        }
      } finally {
        if (!cancelled) {
          setConfigLoading(false);
        }
      }
    }

    loadConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  const componentCredentials = useMemo(
    () => productData.componentCredentials || [],
    [productData.componentCredentials]
  );
  const hasComponents = componentCredentials.length > 0;
  const hasCertification =
    productData.certificateCid && productData.certificateCid.trim() !== "";

  const listingPreviewData = useMemo(() => {
    const unitPriceWei = String(productData.unitPriceWei || "").trim();
    const unitPriceHash = unitPriceWei ? computeUnitPriceHash(unitPriceWei) : "";
    const priceVisibility = productData.priceVisibility || "public";
    const proofFamily = productData.proofFamily || (priceVisibility === "private" ? "bulletproof" : "fiat-shamir");

    return {
      schemaVersion: "6.1",
      productName: productData.productName,
      batch: productData.batch || "",
      orderModel: "erc7984-confidential-v1",
      priceVisibility,
      proofFamily,
      displayUnitPrice: priceVisibility === "public" ? productData.displayUnitPrice || "" : "Private",
      unitPriceWei: priceVisibility === "public" ? unitPriceWei : "",
      unitPriceHash: priceVisibility === "public" ? unitPriceHash : "",
      priceCommitment:
        priceVisibility === "private"
          ? "Generated locally during listing creation"
          : unitPriceHash,
      paymentToken: deploymentConfig?.confidentialToken || "",
      certificateCredential: {
        name: productData.certificateName || "",
        cid: productData.certificateCid || "",
      },
      componentCredentials,
    };
  }, [componentCredentials, deploymentConfig?.confidentialToken, productData]);

  const handleConfirm = async () => {
    try {
      setLoading(true);

      if (!window.ethereum) {
        throw new Error("MetaMask is required to create a product listing.");
      }

      const resolvedFactory = String(deploymentConfig?.factory || "").trim();
      const resolvedPaymentToken = String(
        deploymentConfig?.confidentialToken || ""
      ).trim();

      if (!ethers.isAddress(resolvedFactory)) {
        throw new Error("ERC-7984 factory address is not configured.");
      }

      if (!ethers.isAddress(resolvedPaymentToken)) {
        throw new Error("ERC-7984 confidential payment token is not configured.");
      }

      const priceVisibility = productData.priceVisibility || "public";

      if (priceVisibility === "private" && !deploymentConfig?.supportsPrivatePrice) {
        throw new Error(
          "The loaded ERC-7984 deployment does not support private-price listings yet. Redeploy the upgraded dual-profile factory and private implementation, then refresh the frontend config."
        );
      }

      toast("Connecting wallet...");
      await window.ethereum.request({ method: "eth_requestAccounts" });

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const sellerAddr = await signer.getAddress();
      const network = await provider.getNetwork();

      const productName = String(productData.productName || "").trim();
      const unitPriceWei = String(productData.unitPriceWei || "").trim();
      const proofFamily =
        productData.proofFamily || (priceVisibility === "private" ? "bulletproof" : "fiat-shamir");
      const unitPriceHash = priceVisibility === "public" ? computeUnitPriceHash(unitPriceWei) : "";
      let unitPriceValue;
      let priceCommitment = "";
      let privatePriceBlinding = "";

      if (!productName) {
        throw new Error("Product name is required.");
      }
      if (!unitPriceWei) {
        throw new Error(
          priceVisibility === "private"
            ? "A valid confidential unit price is required."
            : "A valid public unit price is required."
        );
      }
      unitPriceValue = BigInt(unitPriceWei);
      if (unitPriceValue <= 0n || unitPriceValue > MAX_UINT64) {
        throw new Error("Unit price must fit in uint64 and be greater than zero.");
      }

      toast("Creating ERC-7984 listing...");
      const factory = new Contract(resolvedFactory, FACTORY_ABI, signer);
      let tx;

      if (priceVisibility === "private") {
        privatePriceBlinding = generateRandomBlinding();
        const commitmentResult = await generateScalarCommitmentWithBlindingPreferWasm({
          value: unitPriceWei,
          blindingHex: `0x${privatePriceBlinding}`,
        });
        priceCommitment = normalizeBytes32Hex(
          String(commitmentResult.commitment || "").trim(),
          "priceCommitment"
        );
        if (!priceCommitment) {
          throw new Error("Failed to generate the confidential price commitment.");
        }
        tx = await factory.createProductConfidentialPrivatePrice(
          productName,
          priceCommitment,
          resolvedPaymentToken
        );
      } else {
        priceCommitment = unitPriceHash;
        tx = await factory.createProductConfidentialPublicPrice(
          productName,
          unitPriceValue,
          unitPriceHash,
          resolvedPaymentToken
        );
      }
      const receipt = await tx.wait();

      const createdEvent = receipt.logs
        .map((log) => {
          try {
            return factory.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((log) =>
          log &&
          (log.name === "ProductCreatedConfidential" ||
            log.name === "ProductCreatedConfidentialPrivatePrice")
        );

      if (!createdEvent) {
        throw new Error("Product creation event not found in receipt.");
      }

      const productAddress = ethers.getAddress(createdEvent.args.product);
      const productId = createdEvent.args.productId?.toString?.() || "";
      const paymentToken = ethers.getAddress(createdEvent.args.paymentToken);

      const listingMeta = {
        schemaVersion: "6.1",
        productName,
        name: productName,
        batch: productData.batch || "",
        productContract: productAddress,
        productId,
        chainId: String(network.chainId),
        sellerAddr,
        orderModel: "erc7984-confidential-v1",
        priceVisibility,
        proofFamily,
        displayUnitPrice: priceVisibility === "public" ? productData.displayUnitPrice || "" : "Private",
        unitPriceWei: priceVisibility === "public" ? unitPriceWei : "",
        unitPriceHash: priceVisibility === "public" ? unitPriceHash : "",
        priceCommitment,
        paymentToken,
        listingSnapshotCid: "",
        certificateCredential: {
          name: productData.certificateName || "",
          cid: productData.certificateCid || "",
        },
        componentCredentials,
        createdAt: new Date().toISOString(),
      };

      const normalizedProductAddress = productAddress.toLowerCase();
      if (priceVisibility === "public") {
        localStorage.setItem(`unitPriceWei_${normalizedProductAddress}`, unitPriceWei);
        localStorage.setItem(`unitPriceHash_${normalizedProductAddress}`, unitPriceHash);
      } else {
        localStorage.setItem(`privatePriceWei_${normalizedProductAddress}`, unitPriceWei);
        localStorage.setItem(`priceCommitment_${normalizedProductAddress}`, priceCommitment);
        localStorage.setItem(`priceCommitmentBlinding_${normalizedProductAddress}`, privatePriceBlinding);
      }
      localStorage.setItem(`productMeta_${normalizedProductAddress}`, JSON.stringify(listingMeta));

      try {
        await saveProductMeta({
          productAddress,
          productMeta: listingMeta,
          priceWei: priceVisibility === "public" ? unitPriceWei : null,
          priceCommitment,
          sellerRailgunAddress: "",
          unitPriceWei: priceVisibility === "public" ? unitPriceWei : null,
          unitPriceHash: priceVisibility === "public" ? unitPriceHash : null,
          schemaVersion: "6.1",
        });
      } catch (metadataError) {
        console.warn("Failed to persist ERC-7984 product metadata", metadataError);
      }

      toast.success("Product listing created.");
      onNext({
        productData: {
          ...productData,
          productContract: productAddress,
          productId,
          priceVisibility,
          proofFamily,
          unitPriceWei: priceVisibility === "public" ? unitPriceWei : "",
          unitPriceHash: priceVisibility === "public" ? unitPriceHash : "",
          priceCommitment,
          paymentToken,
          vcPreview: listingMeta,
        },
      });
    } catch (err) {
      console.error("handleConfirm:", err);
      toast.error(err.message || "Failed to create product listing");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-step">
      <h3 className="text-xl font-semibold mb-4">Step 3: Review & Create Listing</h3>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
        <h4 className="mt-0 mb-4 text-gray-800 font-semibold">Listing Summary</h4>

        <div className="grid gap-3">
          <div>
            <strong>Product Name:</strong> {productData.productName || "-"}
          </div>

          <div>
            <strong>Price Visibility:</strong>{" "}
            {productData.priceVisibility === "private" ? "Private Price" : "Public Price"}
          </div>

          <div>
            <strong>
              {productData.priceVisibility === "private" ? "Confidential Unit Price" : "Public Unit Price"}:
            </strong>{" "}
            {productData.displayUnitPrice} WETH
            {productData.priceVisibility === "public" ? (
              <div className="text-xs text-gray-500 mt-1">
                Stored canonically as raw WETH wei:{" "}
                <span className="font-mono">{listingPreviewData.unitPriceWei}</span>
              </div>
            ) : (
              <div className="text-xs text-gray-500 mt-1">
                The exact price stays local and will be committed on-chain during creation.
              </div>
            )}
          </div>

          {productData.batch && productData.batch.trim() !== "" && (
            <div>
              <strong>Batch ID:</strong> {productData.batch}
            </div>
          )}

          {hasComponents && (
            <div>
              <strong>Component Products:</strong> {componentCredentials.length}
              <div className="ml-4 mt-1 text-sm">
                {componentCredentials.map((cid, idx) => (
                  <div key={idx} className="mb-1">
                    &bull; <Copyable value={cid} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasCertification && (
            <div>
              <strong>Certification:</strong> {productData.certificateName || "Unnamed"}
              <div className="ml-4 mt-1 text-sm">
                CID: <Copyable value={productData.certificateCid} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-6">
        <h4 className="font-semibold text-blue-900 mt-0 mb-2">ERC-7984 Deployment</h4>
        {configLoading ? (
          <p className="text-sm text-blue-700 m-0">Loading Sepolia deployment config...</p>
        ) : deploymentConfig?.factory && deploymentConfig?.confidentialToken ? (
          <div className="space-y-2 text-sm text-blue-800">
            <div>
              <strong>Factory:</strong> <Copyable value={deploymentConfig.factory} />
            </div>
            <div>
              <strong>Confidential payment token:</strong>{" "}
              <Copyable value={deploymentConfig.confidentialToken} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-red-700 m-0">
            Deployment config is missing. Check the local Sepolia config before creating a listing.
          </p>
        )}
      </div>

      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-5 mb-6">
        <h4 className="font-semibold text-emerald-900 mt-0 mb-2">What happens now</h4>
        <p className="text-sm text-emerald-800 m-0">
          This step creates the ERC-7984 product listing only. The commitment VRC is not created
          yet. It will be built and signed later when the seller confirms a buyer order.
        </p>
      </div>

      <div className="mb-6">
        <button
          onClick={() => setShowMetadataPreview((previous) => !previous)}
          className="bg-transparent border border-gray-200 rounded px-4 py-2 cursor-pointer text-gray-500 text-sm hover:bg-gray-50"
        >
          {showMetadataPreview ? "Hide" : "Show"} Stored Listing Metadata
        </button>

        {showMetadataPreview && (
          <pre className="vc-preview mt-2 max-h-96 overflow-auto text-sm bg-gray-100 p-4 rounded border border-gray-200">
            {JSON.stringify(listingPreviewData, null, 2)}
          </pre>
        )}
      </div>

      <div className="mt-4">
        <button
          className="button bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={
            loading ||
            configLoading ||
            !deploymentConfig?.factory ||
            !deploymentConfig?.confidentialToken
          }
          onClick={handleConfirm}
        >
          {loading ? "Creating Listing..." : "Create Listing"}
        </button>
      </div>
    </div>
  );
};

export default ProductFormStep3;
