const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const uploadJson = require("./utils/ipfs");
const vcBuilder = require("./utils/vcBuilder");
const ProductFactoryABI = require("../abis/ProductFactory.json");
const ProductEscrowABI = require("../abis/ProductEscrow_Initializer.json");

// Replace with your actual values
const provider = new ethers.JsonRpcProvider("https://sepolia.infura.io/v3/YOUR_INFURA_KEY");
const wallet = new ethers.Wallet("YOUR_PRIVATE_KEY", provider);
const factoryAddress = "0xYourFactoryContract";

router.post("/create-product", async (req, res) => {
  try {
    const { productName, price, quantity, certificateName, certificateCid, issuerAddress, vcPreview } = req.body;

    console.log("📦 Request to create product:", productName);

    // 1. Generate price commitment (bytes32)
    const priceWei = ethers.parseEther(price.toString());
    const blinding = ethers.hexlify(ethers.randomBytes(32)); // random blinding factor
    const priceCommitment = ethers.keccak256(
      ethers.solidityPacked(["uint256", "bytes32"], [priceWei, blinding])
    );
    console.log("🔒 Price commitment:", priceCommitment);
    console.log("Price (wei):", priceWei.toString());
    console.log("Blinding (hex):", blinding);

    // 2. Deploy ProductEscrow via factory with commitment
    const factory = new ethers.Contract(factoryAddress, ProductFactoryABI.abi, wallet);
    const tx = await factory.createProduct(productName, priceCommitment);
    const receipt = await tx.wait();

    const event = receipt.logs.map(log => {
      try {
        return factory.interface.parseLog(log);
      } catch { return null; }
    }).find(e => e && e.name === "ProductCreated");

         const productAddress = event?.args?.product;
    const txHash = tx.hash;

    if (!productAddress) throw new Error("Missing product address from event");

    console.log("✅ Deployed ProductEscrow:", productAddress);

    // Optionally: store blinding and price for debug/delivery
    // e.g., in a database, file, or log
    // For now, just log:
    console.log("[DEBUG] Store for delivery:", { productAddress, priceWei: priceWei.toString(), blinding });

    // 2. Inject contract address into VC
    const finalVC = {
      ...vcPreview,
      credentialSubject: {
        ...vcPreview.credentialSubject,
        subjectDetails: {
          ...vcPreview.credentialSubject.subjectDetails,
          productContract: productAddress,
        },
      },
    };

    // 3. Upload VC to IPFS
    const cid = await uploadJson(finalVC);
    console.log("📤 VC uploaded to IPFS:", cid);

    // 4. Store CID on-chain
    const escrow = new ethers.Contract(productAddress, ProductEscrowABI.abi, wallet);
    const cidTx = await escrow.updateVcCid(cid);
    await cidTx.wait();
    console.log("🔐 CID stored on contract");

    // 5. Respond
    res.json({
      cid,
      txHash,
      productContract: productAddress,
      vcPreview: finalVC,
    });

  } catch (err) {
    console.error("❌ Failed to create product:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
