import React, { useState } from "react";
import toast from "react-hot-toast";
import { ethers, getAddress, isAddress, ZeroAddress } from "ethers";
import { uploadJson } from "../../utils/ipfs";
import ProductFactoryABI from "../../abis/ProductFactory.json";
import ProductEscrowABI from "../../abis/ProductEscrow_Initializer.json";
import { signVcAsSeller } from "../../utils/signVcWithMetamask";


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
      componentCredentials: [],
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
      setLoading(true);
      toast("🔐 Connecting to MetaMask...");

      // Ensure MetaMask pops up for account access
      await window.ethereum.request({ method: "eth_requestAccounts" });

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const sellerAddr = await signer.getAddress();
      
      // Validate seller address
      if (!isAddress(sellerAddr)) {
        throw new Error(`Invalid seller address: ${sellerAddr}`);
      }
      
      // MetaMask connected

      // Generate price commitment (bytes32)
      const price = ethers.parseEther(productData.price); // price in wei
      const blinding = ethers.randomBytes(32); // random blinding factor
      const priceCommitment = ethers.keccak256(
        ethers.solidityPacked(["uint256", "bytes32"], [price, blinding])
      );
      // Price commitment generated

      toast("🚀 Deploying ProductEscrow via Factory...");
      
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
          // Contract is responsive
        } catch (funcError) {
          // Contract functions failed
          
          throw new Error("Contract exists but doesn't have ProductFactory functions: " + funcError.message);
        }
      } catch (error) {
        console.error("❌ Contract test failed:", error);
        throw new Error("Contract at " + factoryAddress + " is not responsive: " + error.message);
      }
      
      // Call with correct argument order: (string name, bytes32 priceCommitment)
      const tx = await factory.createProduct(productData.productName, priceCommitment, price);
      const receipt = await tx.wait();

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

      // Product deployed successfully

      // Ensure product address is valid hex for all contract interactions
      const validatedProductAddress = getAddress(productAddress);

      // ✅ Set public price on-chain for public purchases
      toast("💰 Setting public price on-chain...");
      try {
        const escrow = new ethers.Contract(validatedProductAddress, ProductEscrowABI.abi, signer);
        const setPriceTx = await escrow.setPublicPrice(price);
        await setPriceTx.wait(); // Wait for transaction confirmation
        // Public price set successfully
      } catch (error) {
        console.error("❌ Failed to set public price:", error);
        toast.error("Failed to set public price: " + error.message);
        throw error;
      }

      // Build the price object for stage 0/1
      const priceObj = { hidden: true };

      // Inject contract address and price into VC
      const vcToUpload = {
        ...vcPreview,
        issuer: {
          id: `did:ethr:1337:${mustAddress(sellerAddr, 'sellerAddr')}`,
          name: "Seller",
        },
        credentialSubject: {
          ...vcPreview.credentialSubject,
          subjectDetails: {
            ...vcPreview.credentialSubject.subjectDetails,
            productContract: productAddress,
          },
          price: priceObj,
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
      if (cs.certificateCredential) {
        if (cs.certificateCredential.name == null) cs.certificateCredential.name = "";
        if (cs.certificateCredential.cid == null) cs.certificateCredential.cid = "";
      }

      // Serialize price as string for EIP-712 and IPFS
      if (vcToUpload.credentialSubject.price == null) {
        vcToUpload.credentialSubject.price = JSON.stringify({});
      } else if (typeof vcToUpload.credentialSubject.price !== "string") {
        vcToUpload.credentialSubject.price = JSON.stringify(vcToUpload.credentialSubject.price);
      }
      // VC prepared for signing

      // Sign the VC as issuer
      const issuerProof = await signVcAsSeller(vcToUpload, signer);
      vcToUpload.proofs = { issuerProof };
      // Issuer proof created

      toast("📤 Uploading VC to IPFS...");
      const cid = await uploadJson(vcToUpload);
      // VC uploaded to IPFS

      toast("📡 Storing CID on-chain...");
      try {
        // Use the already validated product address
        const pc = new ethers.Contract(validatedProductAddress, ProductEscrowABI.abi, signer);
        const updateCidTx = await pc.updateVcCid(cid);
        await updateCidTx.wait(); // Wait for transaction confirmation
        // CID stored successfully
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
          priceBlinding: ethers.hexlify(blinding), // store blinding for later reveal
          priceWei: price.toString(), // store price in wei for later use
          // ✅ Include Railgun data for private payments
          sellerRailgunAddress: productData.sellerRailgunAddress,
          sellerWalletID: productData.sellerWalletID,
          sellerEOA: productData.sellerEOA,
          privatePaymentsDisabled: productData.privatePaymentsDisabled || false,
        }
      });

      // After deploying ProductEscrow via Factory and getting productAddress and blinding
      localStorage.setItem(`priceBlinding_${productAddress}`, ethers.hexlify(blinding));
      localStorage.setItem(`priceWei_${productAddress}`, price.toString());
      
      // ✅ Store Railgun data for private payments
      if (productData.sellerRailgunAddress) {
        localStorage.setItem(`sellerRailgunAddress_${productAddress}`, productData.sellerRailgunAddress);
        localStorage.setItem(`sellerWalletID_${productAddress}`, productData.sellerWalletID || '');
        console.log('✅ Stored Railgun data for product:', {
          productAddress,
          sellerRailgunAddress: productData.sellerRailgunAddress,
          sellerWalletID: productData.sellerWalletID
        });
      } else {
        console.log('⚠️ No Railgun data to store for product:', productAddress);
      }

    } catch (err) {
      console.error("❌ handleConfirm:", err);
      toast.error(err.message || "Failed to issue VC");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="form-step">
      <h3>Step 3: Confirm VC Preview</h3>
      <pre className="vc-preview">{JSON.stringify(vcPreview, null, 2)}</pre>

      <div style={{ marginTop: "1em" }}>
        <button className="button" disabled={loading} onClick={handleConfirm}>
          {loading ? "Processing…" : "Confirm & Deploy"}
        </button>
      </div>
    </div>
  );
};

export default ProductFormStep3;
