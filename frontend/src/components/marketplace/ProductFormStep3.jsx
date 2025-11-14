import React, { useState } from "react";
import toast from "react-hot-toast";
import { ethers, getAddress, isAddress, ZeroAddress } from "ethers";
import { uploadJson } from "../../utils/ipfs";
import ProductFactoryABI from "../../abis/ProductFactory.json";
import ProductEscrowABI from "../../abis/ProductEscrow_Initializer.json";
import { signVcAsSeller } from "../../utils/signVcWithMetamask";
import { generateCommitmentWithBindingTag } from "../../utils/commitmentUtils";

// Copyable component for CIDs
function truncate(text, length = 12) {
  if (!text || text.length <= length) return text;
  const start = text.slice(0, 6);
  const end = text.slice(-4);
  return `${start}…${end}`;
}

function Copyable({ value }) {
  return (
    <span
      className="copyable"
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

  const vcPreview = {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    id: "https://example.edu/credentials/uuid-placeholder",
    type: ["VerifiableCredential"],
            issuer: {
          id: `did:ethr:${VC_CHAIN}:${productData.issuerAddress ? mustAddress(productData.issuerAddress, 'productData.issuerAddress') : ZeroAddress}`,
          name: "Seller",
        },
    holder: {
      id: `did:ethr:${VC_CHAIN}:${ZeroAddress}`,
      name: "T.B.D.",
    },
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: `did:ethr:${VC_CHAIN}:${ZeroAddress}`,
      productName: productData.productName,
      batch: productData.batch || "",
      quantity: productData.quantity,
      subjectDetails: {
        productContract: "", // backend will fill
      },
      previousCredential: null,
      componentCredentials: productData.componentCredentials || [],
      transactionId: "",
      certificateCredential: {
        name: productData.certificateName || "",
        cid: productData.certificateCid || "",
      },
    },
    proofs: {
      issuerProof: {},
      holderProof: {},
    },
  };

  const handleConfirm = async () => {
    try {
      console.log('[Flow][Seller] Step 1: Seller confirming product listing and preparing VC.');
      setLoading(true);
      toast("🔐 Connecting to MetaMask...");

      // Ensure MetaMask pops up for account access
      await window.ethereum.request({ method: "eth_requestAccounts" });

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const sellerAddr = await signer.getAddress();
      console.log('[Flow][Seller] Step 1 → MetaMask connected, seller address:', sellerAddr);
      
      // Validate seller address
      if (!isAddress(sellerAddr)) {
        throw new Error(`Invalid seller address: ${sellerAddr}`);
      }
      
      // MetaMask connected
      const price = ethers.parseEther(productData.price); // price in wei

      toast("🚀 Deploying ProductEscrow via Factory...");
      console.log('[Flow][Seller] Step 2: Deploying ProductEscrow through factory.');
      
      // Ensure factory address is valid hex
      const validatedFactoryAddress = getAddress(factoryAddress);
      const factory = new ethers.Contract(validatedFactoryAddress, ProductFactoryABI.abi, signer);
      
      // Test if contract is responsive
      try {
        // Test contract responsiveness
        const code = await provider.getCode(factoryAddress);
        
        if (code === "0x") {
          throw new Error("No contract deployed at this address");
        }
        
        // Try to get contract info
        try {
          await factory.productCount(); // Test contract responsiveness
          console.log('[Flow][Seller] Step 2 → Factory contract responsive.');
          // Contract is responsive
        } catch (funcError) {
          // Contract functions failed
          
          throw new Error("Contract exists but doesn't have ProductFactory functions: " + funcError.message);
        }
      } catch (error) {
        console.error("❌ Contract test failed:", error);
        throw new Error("Contract at " + factoryAddress + " is not responsive: " + error.message);
      }
      
      // Use a placeholder commitment for initialization (will be replaced with real Pedersen commitment)
      // The contract requires a non-zero commitment, so we use a deterministic placeholder
      const placeholderCommitment = ethers.keccak256(
        ethers.solidityPacked(["string", "address"], [productData.productName, sellerAddr])
      );
      
      // Call with correct argument order: (string name, bytes32 priceCommitment, uint256 price)
      const tx = await factory.createProduct(productData.productName, placeholderCommitment, price);
      const receipt = await tx.wait();
      console.log('[Flow][Seller] Step 2 → ProductEscrow deployed, tx hash:', receipt.hash);

      // Transaction receipt received
      
      const event = receipt.logs.map(log => {
        try {
          const parsed = factory.interface.parseLog(log);
          return parsed;
        } catch (error) {
          return null;
        }
      }).find(e => e && e.name === "ProductCreated");

      const productAddress = event?.args?.product ?? event?.args?.productAddress;
      
      if (!productAddress) throw new Error("❌ Missing product address from event");
      
      // Validate product address is a proper hex address
      if (!isAddress(productAddress)) {
        throw new Error(`❌ Invalid product address from event: ${productAddress}`);
      }

      console.log('[Flow][Seller] Step 2 → ProductEscrow deployed at:', productAddress);

      // Ensure product address is valid hex for all contract interactions
      const validatedProductAddress = getAddress(productAddress);

      // ✅ Fetch product ID from contract
      toast("📋 Fetching product ID...");
      let productId;
      try {
        const escrow = new ethers.Contract(validatedProductAddress, ProductEscrowABI.abi, provider);
        productId = await escrow.id();
        console.log("✅ Product ID:", productId.toString());
      } catch (error) {
        console.error("❌ Failed to fetch product ID:", error);
        toast.error("Failed to fetch product ID: " + error.message);
        throw error;
      }

      console.log('[Flow][Seller] Step 3: Generating binding commitment via ZKP backend.');
      // ✅ Generate Pedersen commitment with binding tag (Stage 0: Product Listing)
      toast("🔐 Generating Pedersen commitment with binding tag...");
      let pedersenCommitment;
      let pedersenProof;
      let bindingTag;
      try {
        const zkpBackendUrl = process.env.REACT_APP_ZKP_BACKEND_URL || 'http://localhost:5010';
        const commitmentData = await generateCommitmentWithBindingTag(
          price.toString(), // Convert BigInt to string for the API
          validatedProductAddress,
          sellerAddr,
          VC_CHAIN, // Chain ID
          productId, // Product ID from contract
          0, // Stage 0: Product Listing
          "1.0", // Schema version
          null, // No previous VC CID for Stage 0
          zkpBackendUrl
        );
        pedersenCommitment = commitmentData.commitment;
        pedersenProof = commitmentData.proof;
        bindingTag = commitmentData.bindingTag;
        
        if (!commitmentData.verified) {
          console.warn("⚠️ Commitment proof did not verify locally, but continuing...");
        }
        console.log('[Flow][Seller] Step 3 → Commitment + proof ready. Binding tag:', bindingTag);
      } catch (error) {
        console.error("❌ Failed to generate Pedersen commitment with binding tag:", error);
        toast.error("Failed to generate commitment: " + error.message);
        throw error;
      }

      console.log('[Flow][Seller] Step 4: Writing public price + commitment to escrow.');
      // ✅ Set public price and commitment on-chain
      toast("💰 Setting public price and commitment on-chain...");
      try {
        const escrow = new ethers.Contract(validatedProductAddress, ProductEscrowABI.abi, signer);
        // Pedersen commitment is 32 bytes (64 hex chars). Ensure it's properly formatted.
        // The ZKP backend returns hex without 0x prefix, so we add it and ensure it's exactly 64 chars
        const commitmentHex = pedersenCommitment.replace(/^0x/, '');
        if (commitmentHex.length !== 64) {
          throw new Error(`Invalid commitment length: expected 64 hex chars, got ${commitmentHex.length}`);
        }
        const commitmentBytes32 = "0x" + commitmentHex;
        const setPriceTx = await escrow.setPublicPriceWithCommitment(price, commitmentBytes32);
        await setPriceTx.wait(); // Wait for transaction confirmation
        console.log('[Flow][Seller] Step 4 → Public price + commitment stored on-chain.');
      } catch (error) {
        console.error("❌ Failed to set public price with commitment:", error);
        toast.error("Failed to set public price: " + error.message);
        throw error;
      }

      console.log('[Flow][Seller] Step 5: Preparing Stage 0 VC payload.');
      // Build the price object for stage 0/1 with ZKP commitment and binding tag
      const priceObj = {
        hidden: true,
        zkpProof: {
          commitment: pedersenCommitment,
          proof: pedersenProof,
          protocol: "bulletproofs-pedersen",
          proofType: "zkRangeProof-v1",
          bindingTag: bindingTag, // ✅ Store binding tag in VC
          bindingContext: {
            chainId: VC_CHAIN,
            escrowAddr: validatedProductAddress,
            productId: productId.toString(),
            stage: 0,
            schemaVersion: "1.0",
          },
        },
      };

      // Inject contract address and price into VC
      const vcToUpload = {
        ...vcPreview,
        schemaVersion: "1.0", // ✅ Add schemaVersion to Stage 0 VC
        issuer: {
          id: `did:ethr:${VC_CHAIN}:${mustAddress(sellerAddr, 'sellerAddr')}`,
          name: "Seller",
        },
        credentialSubject: {
          ...vcPreview.credentialSubject,
          subjectDetails: {
            ...vcPreview.credentialSubject.subjectDetails,
            productContract: productAddress,
          },
          price: priceObj,
          // ✅ Preserve componentCredentials from Step 2
          componentCredentials: productData.componentCredentials || [],
        },
      };

      // Normalize all string fields to non-null strings
      const cs = vcToUpload.credentialSubject;
      const stringFields = [
        "id", "productName", "batch", "previousCredential", "transactionId"
      ];
      stringFields.forEach(field => {
        if (cs[field] == null) cs[field] = "";
      });
      // ✅ Ensure componentCredentials is an array
      if (!Array.isArray(cs.componentCredentials)) {
        cs.componentCredentials = [];
      }
      if (cs.certificateCredential) {
        if (cs.certificateCredential.name == null) cs.certificateCredential.name = "";
        if (cs.certificateCredential.cid == null) cs.certificateCredential.cid = "";
      }
      
      // ✅ Log component credentials for debugging
      if (cs.componentCredentials.length > 0) {
        console.log('[Flow][Seller] Step 3 → VC includes component credentials:', cs.componentCredentials);
      }

      // Serialize price as string for EIP-712 and IPFS
      if (vcToUpload.credentialSubject.price == null) {
        vcToUpload.credentialSubject.price = JSON.stringify({});
      } else if (typeof vcToUpload.credentialSubject.price !== "string") {
        vcToUpload.credentialSubject.price = JSON.stringify(vcToUpload.credentialSubject.price);
      }
      // VC prepared for signing

      console.log('[Flow][Seller] Step 6: Signing Stage 0 VC as seller.');
      // Sign the VC as issuer (with contract address for verifyingContract binding)
      const issuerProof = await signVcAsSeller(vcToUpload, signer, validatedProductAddress);
      vcToUpload.proofs = { issuerProof };
      // Issuer proof created
      console.log('[Flow][Seller] Step 6 → VC signed. Uploading to IPFS next.');

      toast("📤 Uploading VC to IPFS...");
      const cid = await uploadJson(vcToUpload);
      console.log('[Flow][Seller] Step 7: Stage 0 VC uploaded to IPFS, CID:', cid);

      toast("📡 Storing CID on-chain...");
      try {
        // Use the already validated product address
        const pc = new ethers.Contract(validatedProductAddress, ProductEscrowABI.abi, signer);
        const updateCidTx = await pc.updateVcCid(cid);
        await updateCidTx.wait(); // Wait for transaction confirmation
        console.log('[Flow][Seller] Step 7 → VC CID stored on-chain. Listing complete.');
      } catch (error) {
        console.error("❌ Failed to store CID on-chain:", error);
        toast.error("Failed to store CID: " + error.message);
        throw error;
      }

      toast.success("🎉 Product created & VC issued!");
      onNext({
        productData: {
          ...productData,
          cid,
          productContract: productAddress,
          vcPreview: vcToUpload,
          priceWei: price.toString(), // store price in wei for later use
          priceCommitment: pedersenCommitment, // store commitment for verification
          // ✅ Include Railgun data for private payments
          sellerRailgunAddress: productData.sellerRailgunAddress,
          sellerWalletID: productData.sellerWalletID,
          sellerEOA: productData.sellerEOA,
          privatePaymentsDisabled: productData.privatePaymentsDisabled || false,
        }
      });

      console.log('[Flow][Seller] Step 8: Caching price and Railgun metadata locally for reuse.');
      // Store price and commitment for later use (blinding is deterministic, no need to store)
      localStorage.setItem(`priceWei_${productAddress}`, price.toString());
      localStorage.setItem(`priceCommitment_${productAddress}`, pedersenCommitment);
      
      // ✅ Store Railgun data for private payments
      if (productData.sellerRailgunAddress) {
        localStorage.setItem(`sellerRailgunAddress_${productAddress}`, productData.sellerRailgunAddress);
        localStorage.setItem(`sellerWalletID_${productAddress}`, productData.sellerWalletID || '');
        console.log('[Flow][Seller] Step 8 → Railgun metadata saved for product:', {
          productAddress,
          sellerRailgunAddress: productData.sellerRailgunAddress,
          sellerWalletID: productData.sellerWalletID
        });
      } else {
        console.log('[Flow][Seller] Step 8 → No Railgun metadata provided for product:', productAddress);
      }

    } catch (err) {
      console.error("❌ handleConfirm:", err);
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
      <h3>Step 3: Review & Confirm</h3>
      
      {/* Clean Summary */}
      <div style={{ 
        backgroundColor: "#f8f9fa", 
        border: "1px solid #dee2e6", 
        borderRadius: "8px", 
        padding: "1.5rem",
        marginBottom: "1.5rem"
      }}>
        <h4 style={{ marginTop: 0, marginBottom: "1rem", color: "#333" }}>📋 Product Summary</h4>
        
        <div style={{ display: "grid", gap: "0.75rem" }}>
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
              <div style={{ marginLeft: "1rem", marginTop: "0.25rem", fontSize: "0.9em" }}>
                {componentCredentials.map((cid, idx) => (
                  <div key={idx} style={{ marginBottom: "0.25rem" }}>
                    • <Copyable value={cid} />
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {hasCertification && (
            <div>
              <strong>Certification:</strong> {productData.certificateName || "Unnamed"}
              <div style={{ marginLeft: "1rem", marginTop: "0.25rem", fontSize: "0.9em" }}>
                CID: <Copyable value={productData.certificateCid} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Optional: Full VC Structure (collapsible) */}
      <div style={{ marginBottom: "1.5rem" }}>
        <button
          onClick={() => setShowFullVC(!showFullVC)}
          style={{
            background: "none",
            border: "1px solid #dee2e6",
            borderRadius: "4px",
            padding: "0.5rem 1rem",
            cursor: "pointer",
            color: "#666",
            fontSize: "0.9em"
          }}
        >
          {showFullVC ? "▼ Hide" : "▶ Show"} Full VC Structure (for developers)
        </button>
        
        {showFullVC && (
          <pre 
            className="vc-preview" 
            style={{ 
              marginTop: "0.5rem",
              maxHeight: "400px",
              overflow: "auto",
              fontSize: "0.85em"
            }}
          >
            {JSON.stringify(vcPreview, null, 2)}
          </pre>
        )}
      </div>

      <div style={{ marginTop: "1em" }}>
        <button className="button" disabled={loading} onClick={handleConfirm}>
          {loading ? "Processing…" : "Confirm & Deploy"}
        </button>
      </div>
    </div>
  );
};

export default ProductFormStep3;
