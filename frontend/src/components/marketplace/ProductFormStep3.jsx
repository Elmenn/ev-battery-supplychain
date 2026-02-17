import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { ethers, getAddress, isAddress, ZeroAddress } from "ethers";
import { uploadJson } from "../../utils/ipfs";
import ProductFactoryABI from "../../abis/ProductFactory.json";
import ProductEscrowABI from "../../abis/ProductEscrow_Initializer.json";
import { signVcAsSeller } from "../../utils/signVcWithMetamask";
import { generateCommitmentWithBindingTag } from "../../utils/commitmentUtils";
import { createListingVC } from "../../utils/vcBuilder.mjs";

// Copyable component for CIDs
function truncate(text, length = 12) {
  if (!text || text.length <= length) return text;
  const start = text.slice(0, 6);
  const end = text.slice(-4);
  return `${start}...${end}`;
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


// Validate factory address from environment
const factoryAddress = process.env.REACT_APP_FACTORY_ADDRESS;
if (!factoryAddress || !isAddress(factoryAddress)) {
  throw new Error(`Invalid factory address: ${factoryAddress}. Set REACT_APP_FACTORY_ADDRESS in .env`);
}

const VC_CHAIN =
  process.env.REACT_APP_CHAIN_ID ||
  process.env.REACT_APP_CHAIN_ALIAS ||
  process.env.REACT_APP_NETWORK_ID ||
  "1337";

const ProductFormStep3 = ({ onNext, productData, backendUrl }) => {
  const [loading, setLoading] = useState(false);
  const [showFullVC, setShowFullVC] = useState(false);
  const [showBondConfirm, setShowBondConfirm] = useState(false);
  const [bondAmount, setBondAmount] = useState(null);
  const [bondLoading, setBondLoading] = useState(true);

  // Fetch bond amount from factory on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchBondAmount() {
      try {
        const provider = new ethers.JsonRpcProvider(process.env.REACT_APP_RPC_URL);
        const validatedFactoryAddress = getAddress(factoryAddress);
        const factory = new ethers.Contract(validatedFactoryAddress, ProductFactoryABI.abi, provider);
        const amount = await factory.bondAmount();
        if (!cancelled) {
          setBondAmount(amount);
          setBondLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch bond amount:", err);
        if (!cancelled) {
          setBondLoading(false);
        }
      }
    }
    fetchBondAmount();
    return () => { cancelled = true; };
  }, []);

  // Helper function to validate addresses
  const mustAddress = (input, label) => {
    if (!input || typeof input !== 'string') {
      throw new Error(`${label} missing or invalid`);
    }
    if (!isAddress(input)) {
      throw new Error(`${label} is not a valid address: ${input}`);
    }
    return getAddress(input); // normalize to checksum address
  };

  // Build a preview VC for the collapsible developer view (pre-deployment)
  const vcPreviewData = {
    schemaVersion: "2.0",
    productName: productData.productName,
    batch: productData.batch || "",
    quantity: productData.quantity || 1,
    issuer: productData.issuerAddress || "(connected wallet)",
    chainId: VC_CHAIN,
    certificateCredential: {
      name: productData.certificateName || "",
      cid: productData.certificateCid || "",
    },
    componentCredentials: productData.componentCredentials || [],
  };

  const handleConfirm = async () => {
    try {
      console.log('[Flow][Seller] Step 1: Seller confirming product listing and preparing VC.');
      setLoading(true);
      toast("Connecting to MetaMask...");

      // Ensure MetaMask pops up for account access
      await window.ethereum.request({ method: "eth_requestAccounts" });

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const sellerAddr = await signer.getAddress();
      console.log('[Flow][Seller] Step 1 -> MetaMask connected, seller address:', sellerAddr);

      // Validate seller address
      if (!isAddress(sellerAddr)) {
        throw new Error(`Invalid seller address: ${sellerAddr}`);
      }

      // MetaMask connected
      const price = ethers.parseEther(productData.price); // stored for VC/local display only

      toast("Deploying ProductEscrow via Factory...");
      console.log('[Flow][Seller] Step 2: Deploying ProductEscrow through factory.');

      // Ensure factory address is valid hex
      const validatedFactoryAddress = getAddress(factoryAddress);
      const factory = new ethers.Contract(validatedFactoryAddress, ProductFactoryABI.abi, signer);

      // Test if contract is responsive
      const code = await provider.getCode(factoryAddress);
      if (code === "0x") {
        throw new Error("No contract deployed at this address");
      }

      try {
        await factory.productCount(); // Test contract responsiveness
        console.log('[Flow][Seller] Step 2 -> Factory contract responsive.');
      } catch (funcError) {
        throw new Error("Contract exists but doesn't have ProductFactory functions: " + funcError.message);
      }

      // Use a placeholder commitment for initialization (will be replaced with real Pedersen commitment)
      const placeholderCommitment = ethers.keccak256(
        ethers.solidityPacked(["string", "address"], [productData.productName, sellerAddr])
      );

      // New factory flow: createProduct(name, commitment) payable with seller bond.
      const currentBondAmount = bondAmount || await factory.bondAmount();
      if (currentBondAmount <= 0n) {
        throw new Error("Factory bond amount is not configured.");
      }
      const tx = await factory.createProduct(productData.productName, placeholderCommitment, {
        value: currentBondAmount,
      });
      const receipt = await tx.wait();
      console.log('[Flow][Seller] Step 2 -> ProductEscrow deployed, tx hash:', receipt.hash);

      const event = receipt.logs.map(log => {
        try {
          return factory.interface.parseLog(log);
        } catch {
          return null;
        }
      }).find(e => e && e.name === "ProductCreated");

      const productAddress = event?.args?.product ?? event?.args?.productAddress;

      if (!productAddress) throw new Error("Missing product address from event");

      if (!isAddress(productAddress)) {
        throw new Error(`Invalid product address from event: ${productAddress}`);
      }

      console.log('[Flow][Seller] Step 2 -> ProductEscrow deployed at:', productAddress);
      const validatedProductAddress = getAddress(productAddress);

      // Fetch product ID from contract
      toast("Fetching product ID...");
      let productId;
      try {
        const escrow = new ethers.Contract(validatedProductAddress, ProductEscrowABI.abi, provider);
        productId = await escrow.id();
        console.log("Product ID:", productId.toString());
      } catch (error) {
        console.error("Failed to fetch product ID:", error);
        toast.error("Failed to fetch product ID: " + error.message);
        throw error;
      }

      console.log('[Flow][Seller] Step 3: Generating binding commitment via ZKP backend.');
      toast("Generating Pedersen commitment with binding tag...");
      let pedersenCommitment;
      let pedersenProof;
      let bindingTag;
      try {
        const zkpBackendUrl = process.env.REACT_APP_ZKP_BACKEND_URL || 'http://localhost:5010';
        const commitmentData = await generateCommitmentWithBindingTag(
          price.toString(),
          validatedProductAddress,
          sellerAddr,
          VC_CHAIN,
          productId,
          0, // Stage 0: Product Listing
          "1.0",
          null, // No previous VC CID for Stage 0
          zkpBackendUrl
        );
        pedersenCommitment = commitmentData.commitment;
        pedersenProof = commitmentData.proof;
        bindingTag = commitmentData.bindingTag;

        if (!commitmentData.verified) {
          console.warn("Commitment proof did not verify locally, but continuing...");
        }
        console.log('[Flow][Seller] Step 3 -> Commitment + proof ready. Binding tag:', bindingTag);
      } catch (error) {
        console.error("Failed to generate Pedersen commitment with binding tag:", error);
        toast.error("Failed to generate commitment: " + error.message);
        throw error;
      }

      console.log('[Flow][Seller] Step 4: Skipping public price write (private-only contract).');

      console.log('[Flow][Seller] Step 5: Building v2.0 listing VC.');
      // Build VC using v2.0 createListingVC
      const vcToUpload = createListingVC({
        sellerAddr,
        productContract: validatedProductAddress,
        productName: productData.productName,
        chainId: VC_CHAIN,
        productId: productId.toString(),
        priceCommitment: {
          commitment: pedersenCommitment,
          proof: pedersenProof,
          proofType: "zkRangeProof-v1",
          bindingTag: bindingTag,
          bindingContext: {
            chainId: VC_CHAIN,
            escrowAddr: validatedProductAddress,
            productId: productId.toString(),
            stage: 0,
            schemaVersion: "1.0",
          },
        },
        batch: productData.batch || "",
        quantity: productData.quantity || 1,
        certificateCredential: {
          name: productData.certificateName || "",
          cid: productData.certificateCid || "",
        },
        componentCredentials: productData.componentCredentials || [],
      });

      console.log('[Flow][Seller] Step 6: Signing v2.0 VC as seller.');
      // Sign the VC as issuer (with contract address for verifyingContract binding)
      const issuerProof = await signVcAsSeller(vcToUpload, signer, validatedProductAddress);
      vcToUpload.proof = [issuerProof];
      console.log('[Flow][Seller] Step 6 -> VC signed. Uploading to IPFS next.');

      toast("Uploading VC to IPFS...");
      const cid = await uploadJson(vcToUpload);
      console.log('[Flow][Seller] Step 7: v2.0 VC uploaded to IPFS, CID:', cid);

      toast.success("Product created & VC issued!");
      onNext({
        productData: {
          ...productData,
          cid,
          productContract: productAddress,
          vcPreview: vcToUpload,
          priceWei: price.toString(),
          priceCommitment: pedersenCommitment,
          sellerRailgunAddress: productData.sellerRailgunAddress,
          sellerWalletID: productData.sellerWalletID,
          sellerEOA: productData.sellerEOA,
          privatePaymentsDisabled: productData.privatePaymentsDisabled || false,
        }
      });

      console.log('[Flow][Seller] Step 8: Caching price and Railgun metadata locally for reuse.');
      localStorage.setItem(`priceWei_${productAddress}`, price.toString());
      localStorage.setItem(`priceCommitment_${productAddress}`, pedersenCommitment);
      localStorage.setItem(`vcCid_${productAddress}`, cid);

      if (productData.sellerRailgunAddress) {
        localStorage.setItem(`sellerRailgunAddress_${productAddress}`, productData.sellerRailgunAddress);
        localStorage.setItem(`sellerWalletID_${productAddress}`, productData.sellerWalletID || '');
        console.log('[Flow][Seller] Step 8 -> Railgun metadata saved for product:', {
          productAddress,
          sellerRailgunAddress: productData.sellerRailgunAddress,
          sellerWalletID: productData.sellerWalletID
        });
      } else {
        console.log('[Flow][Seller] Step 8 -> No Railgun metadata provided for product:', productAddress);
      }

    } catch (err) {
      console.error("handleConfirm:", err);
      toast.error(err.message || "Failed to issue VC");
    } finally {
      setLoading(false);
    }
  };


  // Extract data for summary
  const componentCredentials = productData.componentCredentials || [];
  const hasComponents = componentCredentials.length > 0;
  const hasCertification = productData.certificateCid && productData.certificateCid.trim() !== "";

  return (
    <div className="form-step">
      <h3 className="text-xl font-semibold mb-4">Step 3: Review & Confirm</h3>

      {/* Clean Summary */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
        <h4 className="mt-0 mb-4 text-gray-800 font-semibold">Product Summary</h4>

        <div className="grid gap-3">
          <div>
            <strong>Product Name:</strong> {productData.productName || "-"}
          </div>

          <div>
            <strong>Price:</strong> {productData.price} ETH
          </div>

          <div>
            <strong>Quantity:</strong> {productData.quantity || 1}
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

      {/* Bond Disclosure Card */}
      <div className="bg-amber-50 border border-amber-300 rounded-lg p-5 mb-6">
        <div className="flex items-start gap-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-amber-600 mt-0.5 flex-shrink-0"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <div>
            <h4 className="font-semibold text-amber-800 mt-0 mb-2">Protocol Collateral</h4>
            {bondLoading ? (
              <div className="h-6 w-32 bg-amber-200 rounded animate-pulse" />
            ) : bondAmount !== null ? (
              <>
                <p className="text-2xl font-bold text-amber-900 mb-2">
                  {ethers.formatEther(bondAmount)} ETH
                </p>
                <p className="text-sm text-amber-700 m-0">
                  You will lock {ethers.formatEther(bondAmount)} ETH as seller bond. This is
                  refundable upon successful delivery completion. Bond will be forfeited if you
                  fail to confirm the order within the timeout window.
                </p>
              </>
            ) : (
              <p className="text-sm text-amber-700 m-0">
                Unable to fetch bond amount. Deployment may still proceed.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Optional: Full VC Structure (collapsible) */}
      <div className="mb-6">
        <button
          onClick={() => setShowFullVC(!showFullVC)}
          className="bg-transparent border border-gray-200 rounded px-4 py-2 cursor-pointer text-gray-500 text-sm hover:bg-gray-50"
        >
          {showFullVC ? "Hide" : "Show"} Full VC Structure (for developers)
        </button>

        {showFullVC && (
          <pre
            className="vc-preview mt-2 max-h-96 overflow-auto text-sm bg-gray-100 p-4 rounded border border-gray-200"
          >
            {JSON.stringify(vcPreviewData, null, 2)}
          </pre>
        )}
      </div>

      <div className="mt-4">
        <button
          className="button bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
          onClick={() => setShowBondConfirm(true)}
        >
          {loading ? "Processing..." : "Confirm & Deploy"}
        </button>
      </div>

      {/* Bond Confirmation Modal */}
      {showBondConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-bold mb-4">Confirm Bond Deposit</h3>
            <p className="text-gray-600 mb-4">
              You are about to lock{" "}
              <strong>
                {bondAmount ? ethers.formatEther(bondAmount) : "..."} ETH
              </strong>{" "}
              as seller bond and deploy a new product escrow. This bond is
              refundable after successful delivery.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                onClick={() => setShowBondConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700"
                onClick={() => {
                  setShowBondConfirm(false);
                  handleConfirm();
                }}
              >
                Confirm & Lock Bond
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductFormStep3;
