import React, { useState } from "react";
import toast from "react-hot-toast";
import { ethers } from "ethers";
import { uploadJson } from "../../utils/ipfs";
import ProductFactoryABI from "../../abis/ProductFactory.json";
import ProductEscrowABI from "../../abis/ProductEscrow.json";
import { signVcAsSeller } from "../../utils/signVcWithMetamask";


const factoryAddress = process.env.REACT_APP_FACTORY_ADDRESS; 

const ProductFormStep3 = ({ onNext, productData, backendUrl }) => {
  const [loading, setLoading] = useState(false);

  const vcPreview = {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    id: "https://example.edu/credentials/uuid-placeholder",
    type: ["VerifiableCredential"],
    issuer: {
      id: `did:ethr:1337:${productData.issuerAddress}`,
      name: "Seller",
    },
    holder: {
      id: "did:ethr:1337:0x0000000000000000000000000000000000000000",
      name: "T.B.D.",
    },
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: "did:ethr:1337:0x0000000000000000000000000000000000000000",
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
      console.log("✅ MetaMask address:", sellerAddr);

      // Generate price commitment (bytes32)
      const price = ethers.parseEther(productData.price); // price in wei
      const blinding = ethers.randomBytes(32); // random blinding factor
      const priceCommitment = ethers.keccak256(
        ethers.solidityPacked(["uint256", "bytes32"], [price, blinding])
      );
      console.log("🔒 Price commitment:", priceCommitment);
      console.log("About to call createProduct with commitment:", priceCommitment);
      console.log("Commitment type:", typeof priceCommitment);
      console.log("Product name:", productData.productName);
      console.log("Price (wei):", price.toString());
      console.log("Blinding (hex):", ethers.hexlify(blinding));

      toast("🚀 Deploying ProductEscrow via Factory...");
      const factory = new ethers.Contract(factoryAddress, ProductFactoryABI.abi, signer);
      // Call with correct argument order: (string name, bytes32 priceCommitment)
      const tx = await factory.createProduct(productData.productName, priceCommitment);
      const receipt = await tx.wait();

      const event = receipt.logs.map(log => {
        try {
          return factory.interface.parseLog(log);
        } catch {
          return null;
        }
      }).find(e => e && e.name === "ProductCreated");

      const productAddress = event?.args?.productAddress;
      if (!productAddress) throw new Error("❌ Missing product address from event");

      console.log("✅ Product deployed at:", productAddress);

      // Build the price object for stage 0/1
      const priceObj = { hidden: true };

      // Inject contract address and price into VC
      const vcToUpload = {
        ...vcPreview,
        issuer: {
          id: `did:ethr:1337:${sellerAddr}`,
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
      console.log("[ProductFormStep3] VC to sign and upload (with price as string):", vcToUpload);

      // Sign the VC as issuer
      const issuerProof = await signVcAsSeller(vcToUpload, signer);
      vcToUpload.proofs = { issuerProof };
      console.log("[ProductFormStep3] Issuer proof:", issuerProof);

      toast("📤 Uploading VC to IPFS...");
      const cid = await uploadJson(vcToUpload);
      console.log("[ProductFormStep3] Uploaded VC CID:", cid);

      toast("📡 Storing CID on-chain...");
      const pc = new ethers.Contract(productAddress, ProductEscrowABI.abi, signer);
      const tx2 = await pc.updateVcCid(cid);
      await tx2.wait();
      console.log("✅ CID stored successfully!");

      toast.success("🎉 Product created & VC issued!");
      onNext({
        productData: {
          ...productData,
          cid,
          productContract: productAddress,
          vcPreview: vcToUpload,
          priceBlinding: ethers.hexlify(blinding), // store blinding for later reveal
          priceWei: price.toString(), // store price in wei for later use
        }
      });

      // After deploying ProductEscrow via Factory and getting productAddress and blinding
      localStorage.setItem(`priceBlinding_${productAddress}`, ethers.hexlify(blinding));
      localStorage.setItem(`priceWei_${productAddress}`, price.toString());

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
