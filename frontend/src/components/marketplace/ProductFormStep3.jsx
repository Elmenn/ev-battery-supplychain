import React, { useState } from "react";
import toast from "react-hot-toast";
import { ethers } from "ethers";
import { uploadJson } from "../../utils/ipfs";
import ProductFactoryABI from "../../abis/ProductFactory.json";
import ProductEscrowABI from "../../abis/ProductEscrow.json";


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

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const sellerAddr = await signer.getAddress();
    console.log("✅ MetaMask address:", sellerAddr);

    toast("🚀 Deploying ProductEscrow via Factory...");
    const factory = new ethers.Contract(factoryAddress, ProductFactoryABI.abi, signer);
    const tx = await factory.createProduct(productData.productName, ethers.parseEther(productData.price));
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

    // Inject contract address into VC
    const vcToUpload = {
      ...vcPreview,
      credentialSubject: {
        ...vcPreview.credentialSubject,
        subjectDetails: {
          ...vcPreview.credentialSubject.subjectDetails,
          productContract: productAddress,
        },
      },
    };

    toast("📤 Uploading VC to IPFS...");
    const cid = await uploadJson(vcToUpload);
    console.log("✅ VC CID:", cid);

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
      }
    });


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
