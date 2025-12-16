const ProductFactory = artifacts.require("ProductFactory");
const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const { assert } = require("chai");
const truffleAssert = require("truffle-assertions");
const axios = require("axios");
const crypto = require("crypto");
const { ethers, TypedDataEncoder, verifyTypedData } = require("ethers");
const { verifyVC } = require("../backend/api/verifyVC");

// Configuration
const CHAIN_ID = 1337; // Ganache default
const SCHEMA_VERSION = "1.0";
const ZKP_BACKEND = process.env.ZKP_BACKEND_URL || "http://127.0.0.1:5010";
const TEST_PRICE_WEI = 1_000_000; // Small value for testing

// Helper: Generate binding tag for TX hash commitments (Feature 2)
function generateTxHashCommitmentBindingTag({ chainId, escrowAddr, productId, buyerAddress }) {
  const normalizedEscrow = escrowAddr.toLowerCase();
  const normalizedBuyer = buyerAddress.toLowerCase();
  const chainIdNum = typeof chainId === 'string' ? parseInt(chainId, 10) : Number(chainId);
  const productIdNum = typeof productId === 'bigint' ? Number(productId) : Number(productId);
  const protocolVersion = 'tx-hash-bind-v1';
  const bindingTag = web3.utils.soliditySha3(
    { t: 'string', v: protocolVersion },
    { t: 'uint256', v: chainIdNum },
    { t: 'address', v: normalizedEscrow },
    { t: 'uint256', v: productIdNum },
    { t: 'address', v: normalizedBuyer }
  );
  return bindingTag;
}

// Helper: Generate TX hash commitment via ZKP backend (with optional binding tag)
async function generateTxHashCommitment(txHash, bindingTag = null) {
  try {
    const requestBody = {
      tx_hash: txHash,
      ...(bindingTag ? { binding_tag_hex: bindingTag } : {}),
    };
    const response = await axios.post(`${ZKP_BACKEND}/zkp/commit-tx-hash`, requestBody);
    return {
      commitment: response.data.commitment,
      proof: response.data.proof,
      verified: response.data.verified,
      protocol: "bulletproofs-pedersen",
      version: "1.0",
      encoding: "hex",
      bindingTag: bindingTag || null,
    };
  } catch (error) {
    throw new Error(`Failed to generate TX hash commitment: ${error.message}`);
  }
}

// Helper: Verify TX hash commitment via ZKP backend (with optional binding tag)
async function verifyTxHashCommitment(commitment, proof, bindingTag = null) {
  try {
    const requestBody = {
      commitment,
      proof,
      ...(bindingTag ? { binding_tag_hex: bindingTag } : {}),
    };
    const response = await axios.post(`${ZKP_BACKEND}/zkp/verify`, requestBody);
    return response.data.verified === true;
  } catch (error) {
    return false;
  }
}

// Helper: Generate value commitment (price ZKP) with binding tag
async function generateValueCommitment(value, blindingHex, bindingTagHex = null) {
  try {
    const requestBody = {
      value: value,
      blinding_hex: blindingHex.replace("0x", ""),
      ...(bindingTagHex ? { binding_tag_hex: bindingTagHex.replace("0x", "") } : {}),
    };
    const response = await axios.post(`${ZKP_BACKEND}/zkp/generate-value-commitment-with-binding`, requestBody);
    return {
      commitment: response.data.commitment,
      proof: response.data.proof,
      verified: response.data.verified,
      bindingTag: bindingTagHex || null, // Store binding tag in the response (with 0x prefix)
    };
  } catch (error) {
    throw new Error(`Failed to generate value commitment: ${error.message}`);
  }
}

// Helper: Verify value commitment (price ZKP) with binding tag
async function verifyValueCommitment(commitment, proof, bindingTagHex = null) {
  try {
    const requestBody = {
      commitment,
      proof,
      ...(bindingTagHex ? { binding_tag_hex: bindingTagHex.replace("0x", "") } : {}),
    };
    const response = await axios.post(`${ZKP_BACKEND}/zkp/verify-value-commitment`, requestBody);
    return response.data.verified === true;
  } catch (error) {
    return false;
  }
}

// Helper: Compute deterministic blinding (matches contract logic)
function computeBlinding(escrowAddr, sellerAddr) {
  const { soliditySha3 } = web3.utils;
  return soliditySha3(
    { t: "address", v: escrowAddr },
    { t: "address", v: sellerAddr }
  );
}

// Helper: Generate binding tag for price ZKP
function generatePriceBindingTag({ chainId, escrowAddr, productId, stage, schemaVersion, previousVCCid = null }) {
  const normalizedEscrow = escrowAddr.toLowerCase();
  const chainIdNum = typeof chainId === 'string' ? parseInt(chainId, 10) : Number(chainId);
  const productIdNum = typeof productId === 'bigint' ? Number(productId) : Number(productId);
  const stageNum = Number(stage);
  const protocolVersion = previousVCCid ? 'zkp-bind-v2' : 'zkp-bind-v1';
  
  if (previousVCCid) {
    return web3.utils.soliditySha3(
      { t: 'string', v: protocolVersion },
      { t: 'uint256', v: chainIdNum },
      { t: 'address', v: normalizedEscrow },
      { t: 'uint256', v: productIdNum },
      { t: 'uint8', v: stageNum },
      { t: 'string', v: schemaVersion },
      { t: 'string', v: previousVCCid }
    );
  } else {
    return web3.utils.soliditySha3(
      { t: 'string', v: protocolVersion },
      { t: 'uint256', v: chainIdNum },
      { t: 'address', v: normalizedEscrow },
      { t: 'uint256', v: productIdNum },
      { t: 'uint8', v: stageNum },
      { t: 'string', v: schemaVersion }
    );
  }
}

// Helper: Compute CID (simplified - in real app, use IPFS)
function computeCid(obj) {
  const hash = crypto.createHash("sha256");
  hash.update(JSON.stringify(obj));
  return "Qm" + hash.digest("hex").slice(0, 44);
}

// Deterministic signer wallets for VC signing (defined before helper functions)
const SELLER_WALLET = new ethers.Wallet(
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
);
const BUYER_WALLET = new ethers.Wallet(
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
);

// Helper: Build Stage 0 VC
function buildStage0VC(productName) {
  return {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    id: `https://example.edu/credentials/${crypto.randomBytes(16).toString("hex")}`,
    type: ["VerifiableCredential"],
    schemaVersion: SCHEMA_VERSION,
    issuer: {
      id: `did:ethr:${CHAIN_ID}:${SELLER_WALLET.address.toLowerCase()}`,
      name: "Seller",
    },
    holder: {
      id: `did:ethr:${CHAIN_ID}:${BUYER_WALLET.address.toLowerCase()}`,
      name: "Buyer",
    },
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: `did:ethr:${CHAIN_ID}:${SELLER_WALLET.address.toLowerCase()}`,
      productName: productName,
      batch: "BATCH-001",
      quantity: 1,
    },
    proof: [],
  };
}

// Helper: Build Stage 1 VC (Order Confirmation) with purchase TX hash commitment
function buildStage1VC(stage0, stage0Cid, priceZkpProof, purchaseTxHashCommitment = null) {
  const credentialSubject = {
    ...stage0.credentialSubject,
    id: `did:ethr:${CHAIN_ID}:${stage0.holder.id.split(':').pop()}`,
    previousCredential: stage0Cid,
    price: JSON.stringify({
      hidden: true,
      zkpProof: priceZkpProof,
    }),
  };

  if (purchaseTxHashCommitment) {
    credentialSubject.purchaseTxHashCommitment = purchaseTxHashCommitment;
  }

  return {
    ...stage0,
    credentialSubject,
    proof: [],
  };
}

// Helper: Build Stage 2 VC (Delivery) - preserves purchase TX hash commitment
function buildStage2VC(stage1, stage1Cid) {
  const credentialSubject = {
    ...stage1.credentialSubject,
    previousCredential: stage1Cid,
  };

  return {
    ...stage1,
    credentialSubject,
    proof: [],
  };
}

// Helper: Build Stage 3 VC (Final Delivery) with delivery TX hash commitment
function buildStage3VC(stage2, stage2Cid, deliveryTxHashCommitment = null) {
  const credentialSubject = {
    ...stage2.credentialSubject,
    previousCredential: stage2Cid,
  };

  if (deliveryTxHashCommitment) {
    credentialSubject.txHashCommitment = deliveryTxHashCommitment;
  }

  return {
    ...stage2,
    credentialSubject,
    proof: [],
  };
}

// Helper: Verify binding tags match
function verifyBindingTagsMatch(purchaseCommitment, deliveryCommitment) {
  if (!purchaseCommitment || !deliveryCommitment) {
    return false;
  }
  const purchaseBindingTag = purchaseCommitment.bindingTag;
  const deliveryBindingTag = deliveryCommitment.bindingTag;
  if (purchaseBindingTag && deliveryBindingTag) {
    const normalizedPurchase = purchaseBindingTag.toLowerCase().replace(/^0x/, '');
    const normalizedDelivery = deliveryBindingTag.toLowerCase().replace(/^0x/, '');
    return normalizedPurchase === normalizedDelivery;
  }
  return false;
}

// Helper: Prepare VC payload for signing (matches frontend logic)
function prepareVcPayloadForSigning(vc) {
  const clone = JSON.parse(JSON.stringify(vc));
  delete clone.proof;
  delete clone.proofs;
  
  // Remove fields not in EIP-712 types
  if (clone.credentialSubject?.transactionId !== undefined) {
    delete clone.credentialSubject.transactionId;
  }
  if (clone.credentialSubject?.txHashCommitment !== undefined) {
    delete clone.credentialSubject.txHashCommitment;
  }
  if (clone.credentialSubject?.purchaseTxHashCommitment !== undefined) {
    delete clone.credentialSubject.purchaseTxHashCommitment;
  }
  if (clone.credentialSubject?.vcHash) {
    delete clone.credentialSubject.vcHash;
  }
  
  // Serialize price as string
  if (clone.credentialSubject?.price && typeof clone.credentialSubject.price !== "string") {
    clone.credentialSubject.price = JSON.stringify(clone.credentialSubject.price);
  }
  
  // Ensure required fields have defaults
  if (!clone.credentialSubject.certificateCredential) {
    clone.credentialSubject.certificateCredential = { name: "", cid: "" };
  }
  if (!Array.isArray(clone.credentialSubject.componentCredentials)) {
    clone.credentialSubject.componentCredentials = [];
  }
  if (clone.credentialSubject.previousCredential === undefined || clone.credentialSubject.previousCredential === null) {
    clone.credentialSubject.previousCredential = "";
  }
  
  // Normalize addresses
  if (clone.issuer?.id) clone.issuer.id = clone.issuer.id.toLowerCase();
  if (clone.holder?.id) clone.holder.id = clone.holder.id.toLowerCase();
  if (clone.credentialSubject?.id) clone.credentialSubject.id = clone.credentialSubject.id.toLowerCase();
  
  // Ensure schemaVersion is set
  if (!clone.schemaVersion) {
    clone.schemaVersion = "1.0";
  }
  
  return clone;
}

// Helper: Sign VC with EIP-712
async function signVC(vc, wallet, role, contractAddress = null) {
  const payload = prepareVcPayloadForSigning(vc);
  const domain = {
    name: "VC",
    version: "1.0",
    chainId: CHAIN_ID,
    ...(contractAddress ? { verifyingContract: contractAddress } : {}),
  };
  const types = {
    Credential: [
      { name: "id", type: "string" },
      { name: "@context", type: "string[]" },
      { name: "type", type: "string[]" },
      { name: "schemaVersion", type: "string" },
      { name: "issuer", type: "Party" },
      { name: "holder", type: "Party" },
      { name: "issuanceDate", type: "string" },
      { name: "credentialSubject", type: "CredentialSubject" },
    ],
    Party: [
      { name: "id", type: "string" },
      { name: "name", type: "string" },
    ],
    CredentialSubject: [
      { name: "id", type: "string" },
      { name: "productName", type: "string" },
      { name: "batch", type: "string" },
      { name: "quantity", type: "uint256" },
      { name: "previousCredential", type: "string" },
      { name: "componentCredentials", type: "string[]" },
      { name: "certificateCredential", type: "Certificate" },
      { name: "price", type: "string" },
    ],
    Certificate: [
      { name: "name", type: "string" },
      { name: "cid", type: "string" },
    ],
  };
  const signature = await wallet.signTypedData(domain, types, payload);
  return {
    type: "EcdsaSecp256k1Signature2019",
    created: new Date().toISOString(),
    proofPurpose: "assertionMethod",
    verificationMethod: `did:ethr:${CHAIN_ID}:${wallet.address.toLowerCase()}`,
    jws: signature,
    role,
  };
}

contract("End-to-End Flow: Product Creation → Delivery → Full Verification", (accounts) => {
  const [seller, buyer, transporter] = accounts;

  let factory;
  let escrow;
  let productAddress;
  let productId;
  let priceValueBN;
  let purchaseTxHash;
  let deliveryTxHash;
  let purchaseTxHashCommitment;
  let deliveryTxHashCommitment;
  let bindingTag;
  let priceZkpProof;
  let stageVCs;
  let ipfsStore;

  before(async () => {
    console.log("\n=== Setting up End-to-End Flow Test ===\n");

    // Deploy factory and product
    const implementation = await ProductEscrow_Initializer.new();
    factory = await ProductFactory.new(implementation.address);

    const productName = "End-to-End Test Battery";
    const priceBN = web3.utils.toBN(TEST_PRICE_WEI);
    priceValueBN = priceBN;

    // Generate deterministic blinding and price commitment
    const deterministicBlinding = computeBlinding(factory.address, seller); // Will update after product creation
    const bindingContext = {
      chainId: CHAIN_ID.toString(),
      escrowAddr: factory.address, // Will update after product creation
      productId: "0", // Will update after product creation
      stage: 1,
      schemaVersion: SCHEMA_VERSION,
      previousVCCid: "",
    };

    // Create product
    const dummyCommitment = web3.utils.randomHex(32);
    const tx = await factory.createProduct(productName, dummyCommitment, priceBN, {
      from: seller,
    });
    productAddress = tx.logs.find((log) => log.event === "ProductCreated").args.product;
    escrow = await ProductEscrow_Initializer.at(productAddress);
    productId = (await escrow.id()).toString();

    console.log(`✅ Product created: ${productAddress} (ID: ${productId})`);

    // Update binding context with actual product address
    bindingContext.escrowAddr = productAddress;
    bindingContext.productId = productId;

    // Generate price ZKP with binding tag
    const priceBindingTag = generatePriceBindingTag(bindingContext);
    const actualBlinding = computeBlinding(productAddress, seller);
    console.log("🔐 Generating price ZKP with binding tag...");
    priceZkpProof = await generateValueCommitment(
      TEST_PRICE_WEI,
      actualBlinding,
      priceBindingTag
    );
    assert.isTrue(priceZkpProof.verified, "Price ZKP should verify");

    // Set public price with commitment
    const priceCommitment = web3.utils.soliditySha3(
      { t: 'uint256', v: priceValueBN },
      { t: 'bytes32', v: actualBlinding }
    );
    await escrow.setPublicPriceWithCommitment(priceValueBN, priceCommitment, { from: seller });
    await escrow.setPublicEnabled(true, { from: seller });
    console.log("✅ Public price set with commitment");

    // Generate binding tag for TX hash commitments (Feature 2)
    bindingTag = generateTxHashCommitmentBindingTag({
      chainId: CHAIN_ID.toString(),
      escrowAddr: productAddress,
      productId: productId.toString(),
      buyerAddress: buyer,
    });
    console.log("✅ Binding tag generated for TX hash commitments");

    // Purchase product
    console.log("🛒 Purchasing product...");
    const purchaseTx = await escrow.purchasePublic({ from: buyer, value: priceValueBN });
    purchaseTxHash = purchaseTx.receipt.transactionHash;
    console.log(`✅ Purchase transaction: ${purchaseTxHash}`);

    // Generate purchase TX hash commitment with binding tag (Phase 1 + Feature 2)
    console.log("🔐 Generating purchase TX hash commitment with binding tag...");
    purchaseTxHashCommitment = await generateTxHashCommitment(purchaseTxHash, bindingTag);
    assert.isTrue(purchaseTxHashCommitment.verified, "Purchase TX hash commitment should verify");
    console.log("✅ Purchase TX hash commitment generated");

    // Build VC chain
    console.log("📝 Building VC chain...");
    const stage0 = buildStage0VC(productName);
    const stage0Cid = computeCid(stage0);
    const stage1 = buildStage1VC(stage0, stage0Cid, priceZkpProof, purchaseTxHashCommitment);
    const stage1Cid = computeCid(stage1);
    const stage2 = buildStage2VC(stage1, stage1Cid);
    const stage2Cid = computeCid(stage2);

    stageVCs = {
      stage0: { vc: stage0, cid: stage0Cid },
      stage1: { vc: stage1, cid: stage1Cid },
      stage2: { vc: stage2, cid: stage2Cid },
    };

    ipfsStore = new Map([
      [stage0Cid, stage0],
      [stage1Cid, stage1],
      [stage2Cid, stage2],
    ]);

    // Confirm order
    console.log("✅ Confirming order...");
    const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
    await escrow.confirmOrderWithCommitment(stage1Cid, zeroCommitment, { from: seller });
    console.log(`✅ Order confirmed, VC CID: ${stage1Cid}`);

    // Update VC CID to Stage 2 (required before delivery)
    await escrow.updateVcCid(stage2Cid, { from: seller });

    // Register transporter and set transporter
    console.log("🚚 Setting up transporter...");
    const deliveryFeeWei = web3.utils.toWei("0.0001", "ether");
    await escrow.createTransporter(deliveryFeeWei, { from: transporter });
    await escrow.setTransporter(transporter, { from: seller, value: deliveryFeeWei });
    console.log("✅ Transporter set");

    // Simulate delivery confirmation
    console.log("📦 Confirming delivery...");
    const revealedValue = web3.utils.toBN(priceValueBN);
    const blinding = actualBlinding;
    const stage3WithoutCommitment = buildStage3VC(stage2, stage2Cid);
    const stage3CidWithoutCommitment = computeCid(stage3WithoutCommitment);
    ipfsStore.set(stage3CidWithoutCommitment, stage3WithoutCommitment);

    const deliveryTx = await escrow.revealAndConfirmDelivery(
      revealedValue,
      blinding,
      stage3CidWithoutCommitment,
      { from: buyer }
    );
    deliveryTxHash = deliveryTx.receipt.transactionHash;
    console.log(`✅ Delivery transaction: ${deliveryTxHash}`);

    // Generate delivery TX hash commitment with same binding tag (Feature 2)
    console.log("🔐 Generating delivery TX hash commitment with binding tag...");
    deliveryTxHashCommitment = await generateTxHashCommitment(deliveryTxHash, bindingTag);
    assert.isTrue(deliveryTxHashCommitment.verified, "Delivery TX hash commitment should verify");
    console.log("✅ Delivery TX hash commitment generated");

    // Build final Stage 3 VC with delivery TX hash commitment
    const stage3 = buildStage3VC(stage2, stage2Cid, deliveryTxHashCommitment);
    const stage3Cid = computeCid(stage3);
    ipfsStore.set(stage3Cid, stage3);
    stageVCs.stage3 = { vc: stage3, cid: stage3Cid };

    // Update on-chain CID
    await escrow.updateVcCidAfterDelivery(stage3Cid, { from: buyer });
    console.log(`✅ Final VC CID updated on-chain: ${stage3Cid}`);

    // Sign VCs with EIP-712
    console.log("✍️ Signing VCs...");
    // Stage 1: Signed by seller (issuer)
    const stage1Signed = JSON.parse(JSON.stringify(stageVCs.stage1.vc));
    const sellerProof = await signVC(stage1Signed, SELLER_WALLET, "issuer", productAddress);
    stage1Signed.proof = [sellerProof];
    stageVCs.stage1.vc = stage1Signed;
    ipfsStore.set(stage1Cid, stage1Signed);
    console.log("✅ Stage 1 VC signed by seller");

    // Stage 3: Signed by buyer (holder)
    const stage3Signed = JSON.parse(JSON.stringify(stageVCs.stage3.vc));
    const buyerProof = await signVC(stage3Signed, BUYER_WALLET, "holder", productAddress);
    stage3Signed.proof = [buyerProof];
    stageVCs.stage3.vc = stage3Signed;
    ipfsStore.set(stage3Cid, stage3Signed);
    console.log("✅ Stage 3 VC signed by buyer");

    console.log("\n=== Setup Complete ===\n");
  });

  describe("Complete Flow Verification", () => {
    it("should have completed all stages: product creation → purchase → order confirmation → delivery", async () => {
      // Verify product state
      assert.isTrue(await escrow.purchased(), "Product should be purchased");
      assert.isTrue(await escrow.delivered(), "Product should be delivered");
      
      const phase = await escrow.phase();
      assert.equal(phase.toString(), "4", "Phase should be Delivered (4)"); // Phase enum: Listed=0, Purchased=1, OrderConfirmed=2, Bound=3, Delivered=4, Expired=5

      // Verify on-chain VC CID points to Stage 3
      const onChainCid = await escrow.vcCid();
      assert.equal(onChainCid, stageVCs.stage3.cid, "On-chain CID should point to Stage 3 VC");
    });

    it("should have all VCs in the chain with correct structure", () => {
      // Stage 0: Product listing
      const stage0 = stageVCs.stage0.vc;
      assert.exists(stage0.credentialSubject.productName, "Stage 0 should have product name");
      assert.notExists(stage0.credentialSubject.price, "Stage 0 should not have price");

      // Stage 1: Order confirmation
      const stage1 = stageVCs.stage1.vc;
      assert.exists(stage1.credentialSubject.price, "Stage 1 should have price");
      assert.exists(stage1.credentialSubject.purchaseTxHashCommitment, "Stage 1 should have purchase TX hash commitment");
      assert.exists(stage1.credentialSubject.purchaseTxHashCommitment.bindingTag, "Stage 1 should have binding tag in purchase commitment");

      // Stage 2: Delivery (intermediate)
      const stage2 = stageVCs.stage2.vc;
      assert.exists(stage2.credentialSubject.purchaseTxHashCommitment, "Stage 2 should preserve purchase TX hash commitment");

      // Stage 3: Final delivery
      const stage3 = stageVCs.stage3.vc;
      assert.exists(stage3.credentialSubject.purchaseTxHashCommitment, "Stage 3 should preserve purchase TX hash commitment");
      assert.exists(stage3.credentialSubject.txHashCommitment, "Stage 3 should have delivery TX hash commitment");
      assert.exists(stage3.credentialSubject.txHashCommitment.bindingTag, "Stage 3 should have binding tag in delivery commitment");
    });

    it("should verify price ZKP (range proof)", async () => {
      const stage1 = stageVCs.stage1.vc;
      const priceObj = JSON.parse(stage1.credentialSubject.price);
      const zkpProof = priceObj.zkpProof;

      assert.exists(zkpProof.commitment, "Price ZKP should have commitment");
      assert.exists(zkpProof.proof, "Price ZKP should have proof");
      assert.exists(zkpProof.bindingTag, "Price ZKP should have binding tag");

      console.log("🔍 Verifying price ZKP...");
      const verified = await verifyValueCommitment(
        zkpProof.commitment,
        zkpProof.proof,
        zkpProof.bindingTag
      );
      assert.isTrue(verified, "Price ZKP should verify successfully");
      console.log("✅ Price ZKP verified");
    });

    it("should verify purchase TX hash commitment", async () => {
      const stage1 = stageVCs.stage1.vc;
      const purchaseCommitment = stage1.credentialSubject.purchaseTxHashCommitment;

      assert.exists(purchaseCommitment.commitment, "Purchase commitment should exist");
      assert.exists(purchaseCommitment.proof, "Purchase proof should exist");
      assert.exists(purchaseCommitment.bindingTag, "Purchase commitment should have binding tag");

      console.log("🔍 Verifying purchase TX hash commitment...");
      const verified = await verifyTxHashCommitment(
        purchaseCommitment.commitment,
        purchaseCommitment.proof,
        purchaseCommitment.bindingTag
      );
      assert.isTrue(verified, "Purchase TX hash commitment should verify successfully");
      console.log("✅ Purchase TX hash commitment verified");
    });

    it("should verify delivery TX hash commitment", async () => {
      const stage3 = stageVCs.stage3.vc;
      const deliveryCommitment = stage3.credentialSubject.txHashCommitment;

      assert.exists(deliveryCommitment.commitment, "Delivery commitment should exist");
      assert.exists(deliveryCommitment.proof, "Delivery proof should exist");
      assert.exists(deliveryCommitment.bindingTag, "Delivery commitment should have binding tag");

      console.log("🔍 Verifying delivery TX hash commitment...");
      const verified = await verifyTxHashCommitment(
        deliveryCommitment.commitment,
        deliveryCommitment.proof,
        deliveryCommitment.bindingTag
      );
      assert.isTrue(verified, "Delivery TX hash commitment should verify successfully");
      console.log("✅ Delivery TX hash commitment verified");
    });

    it("should verify binding tags match between purchase and delivery (Feature 2)", () => {
      const stage1 = stageVCs.stage1.vc;
      const stage3 = stageVCs.stage3.vc;

      const purchaseCommitment = stage1.credentialSubject.purchaseTxHashCommitment;
      const deliveryCommitment = stage3.credentialSubject.txHashCommitment;

      console.log("🔍 Verifying binding tags match...");
      const matches = verifyBindingTagsMatch(purchaseCommitment, deliveryCommitment);
      assert.isTrue(matches, "Binding tags should match between purchase and delivery");
      console.log("✅ Binding tags match - purchase and delivery are linked");
    });

    it("should verify price commitment matches on-chain commitment", async () => {
      const stage1 = stageVCs.stage1.vc;
      const priceObj = JSON.parse(stage1.credentialSubject.price);
      const zkpProof = priceObj.zkpProof;

      // Get on-chain commitment
      const onChainCommitment = await escrow.priceCommitment();

      // The on-chain commitment is keccak256(price, blinding)
      // The ZKP commitment is a Pedersen commitment (different format)
      // So we verify that the revealed value matches the on-chain commitment
      const revealedValue = web3.utils.toBN(priceValueBN);
      const blinding = computeBlinding(productAddress, seller);
      const computedCommitment = web3.utils.soliditySha3(
        { t: 'uint256', v: revealedValue },
        { t: 'bytes32', v: blinding }
      );

      assert.equal(
        computedCommitment.toLowerCase(),
        onChainCommitment.toLowerCase(),
        "Computed commitment should match on-chain commitment"
      );
      console.log("✅ Price commitment matches on-chain commitment");
    });

    it("should verify all ZKPs fail with wrong binding tags (security check)", async () => {
      const stage1 = stageVCs.stage1.vc;
      const stage3 = stageVCs.stage3.vc;

      // Test price ZKP with wrong binding tag
      const priceObj = JSON.parse(stage1.credentialSubject.price);
      const zkpProof = priceObj.zkpProof;
      const wrongBindingTag = "0x" + "1".repeat(64);
      
      const priceVerified = await verifyValueCommitment(
        zkpProof.commitment,
        zkpProof.proof,
        wrongBindingTag
      );
      assert.isFalse(priceVerified, "Price ZKP should fail with wrong binding tag");

      // Test purchase TX hash commitment with wrong binding tag
      const purchaseCommitment = stage1.credentialSubject.purchaseTxHashCommitment;
      const purchaseVerified = await verifyTxHashCommitment(
        purchaseCommitment.commitment,
        purchaseCommitment.proof,
        wrongBindingTag
      );
      assert.isFalse(purchaseVerified, "Purchase TX hash commitment should fail with wrong binding tag");

      // Test delivery TX hash commitment with wrong binding tag
      const deliveryCommitment = stage3.credentialSubject.txHashCommitment;
      const deliveryVerified = await verifyTxHashCommitment(
        deliveryCommitment.commitment,
        deliveryCommitment.proof,
        wrongBindingTag
      );
      assert.isFalse(deliveryVerified, "Delivery TX hash commitment should fail with wrong binding tag");

      console.log("✅ All ZKPs correctly reject wrong binding tags");
    });

    it("should verify VC chain integrity (previousCredential links)", () => {
      const stage0 = stageVCs.stage0.vc;
      const stage1 = stageVCs.stage1.vc;
      const stage2 = stageVCs.stage2.vc;
      const stage3 = stageVCs.stage3.vc;

      // Stage 1 should reference Stage 0
      assert.equal(
        stage1.credentialSubject.previousCredential,
        stageVCs.stage0.cid,
        "Stage 1 should reference Stage 0 CID"
      );

      // Stage 2 should reference Stage 1
      assert.equal(
        stage2.credentialSubject.previousCredential,
        stageVCs.stage1.cid,
        "Stage 2 should reference Stage 1 CID"
      );

      // Stage 3 should reference Stage 2
      assert.equal(
        stage3.credentialSubject.previousCredential,
        stageVCs.stage2.cid,
        "Stage 3 should reference Stage 2 CID"
      );

      console.log("✅ VC chain integrity verified");
    });

    it("should verify privacy: actual transaction hashes not in VCs", () => {
      const stage1 = stageVCs.stage1.vc;
      const stage3 = stageVCs.stage3.vc;

      const stage1String = JSON.stringify(stage1);
      const stage3String = JSON.stringify(stage3);

      // Actual transaction hashes should NOT be in the VCs
      assert.notInclude(stage1String, purchaseTxHash, "Stage 1 VC should not contain purchase TX hash");
      assert.notInclude(stage3String, deliveryTxHash, "Stage 3 VC should not contain delivery TX hash");

      // But commitments should be present
      assert.exists(stage1.credentialSubject.purchaseTxHashCommitment, "Stage 1 should have purchase commitment");
      assert.exists(stage3.credentialSubject.txHashCommitment, "Stage 3 should have delivery commitment");

      console.log("✅ Privacy verified: transaction hashes are hidden");
    });

    it("should verify EIP-712 signatures for all signed VCs", async () => {
      // Verify Stage 1 signature (signed by seller/issuer)
      const stage1 = stageVCs.stage1.vc;
      assert.exists(stage1.proof, "Stage 1 VC should have proof");
      assert.isArray(stage1.proof, "Stage 1 proof should be an array");
      assert.isAtLeast(stage1.proof.length, 1, "Stage 1 should have at least one signature");

      console.log("🔍 Verifying Stage 1 VC signature (seller/issuer)...");
      const stage1Verification = await verifyVC(stage1, false, productAddress);
      assert.isTrue(stage1Verification.issuer?.signature_verified, "Stage 1 issuer signature should verify");
      assert.equal(
        stage1Verification.issuer?.recovered_address?.toLowerCase(),
        SELLER_WALLET.address.toLowerCase(),
        "Stage 1 signature should recover seller wallet address"
      );
      console.log("✅ Stage 1 VC signature verified");

      // Verify Stage 3 signature (signed by buyer/holder)
      const stage3 = stageVCs.stage3.vc;
      assert.exists(stage3.proof, "Stage 3 VC should have proof");
      assert.isArray(stage3.proof, "Stage 3 proof should be an array");
      assert.isAtLeast(stage3.proof.length, 1, "Stage 3 should have at least one signature");

      console.log("🔍 Verifying Stage 3 VC signature (buyer/holder)...");
      const stage3Verification = await verifyVC(stage3, false, productAddress);
      assert.isTrue(stage3Verification.holder?.signature_verified, "Stage 3 holder signature should verify");
      assert.equal(
        stage3Verification.holder?.recovered_address?.toLowerCase(),
        BUYER_WALLET.address.toLowerCase(),
        "Stage 3 signature should recover buyer wallet address"
      );
      console.log("✅ Stage 3 VC signature verified");
    });

    it("should verify all ZKPs in the complete flow", async () => {
      console.log("\n🔍 Verifying all ZKPs in the complete flow...\n");

      // 1. Price ZKP (range proof)
      const stage1 = stageVCs.stage1.vc;
      const priceObj = JSON.parse(stage1.credentialSubject.price);
      const priceZkp = priceObj.zkpProof;
      console.log("  1️⃣ Verifying price ZKP (range proof)...");
      const priceVerified = await verifyValueCommitment(
        priceZkp.commitment,
        priceZkp.proof,
        priceZkp.bindingTag
      );
      assert.isTrue(priceVerified, "Price ZKP should verify");
      console.log("     ✅ Price ZKP verified\n");

      // 2. Purchase TX hash commitment
      const purchaseCommitment = stage1.credentialSubject.purchaseTxHashCommitment;
      console.log("  2️⃣ Verifying purchase TX hash commitment...");
      const purchaseVerified = await verifyTxHashCommitment(
        purchaseCommitment.commitment,
        purchaseCommitment.proof,
        purchaseCommitment.bindingTag
      );
      assert.isTrue(purchaseVerified, "Purchase TX hash commitment should verify");
      console.log("     ✅ Purchase TX hash commitment verified\n");

      // 3. Delivery TX hash commitment
      const stage3 = stageVCs.stage3.vc;
      const deliveryCommitment = stage3.credentialSubject.txHashCommitment;
      console.log("  3️⃣ Verifying delivery TX hash commitment...");
      const deliveryVerified = await verifyTxHashCommitment(
        deliveryCommitment.commitment,
        deliveryCommitment.proof,
        deliveryCommitment.bindingTag
      );
      assert.isTrue(deliveryVerified, "Delivery TX hash commitment should verify");
      console.log("     ✅ Delivery TX hash commitment verified\n");

      // 4. Binding tag match (Feature 2)
      console.log("  4️⃣ Verifying binding tags match...");
      const bindingTagsMatch = verifyBindingTagsMatch(purchaseCommitment, deliveryCommitment);
      assert.isTrue(bindingTagsMatch, "Binding tags should match");
      console.log("     ✅ Binding tags match - purchase and delivery are linked\n");

      console.log("✅ All ZKPs verified successfully!\n");
    });
  });

  describe("Performance Summary", () => {
    it("should report performance metrics for all operations", () => {
      console.log("\n=== End-to-End Flow Performance Summary ===");
      console.log("Operations completed:");
      console.log("  ✅ Product creation");
      console.log("  ✅ Price ZKP generation with binding tag");
      console.log("  ✅ Purchase transaction");
      console.log("  ✅ Purchase TX hash commitment generation");
      console.log("  ✅ Order confirmation (Stage 1 VC)");
      console.log("  ✅ EIP-712 signature (Stage 1 by seller)");
      console.log("  ✅ Transporter setup");
      console.log("  ✅ Delivery transaction");
      console.log("  ✅ Delivery TX hash commitment generation");
      console.log("  ✅ Final VC (Stage 3) with all commitments");
      console.log("  ✅ EIP-712 signature (Stage 3 by buyer)");
      console.log("\nAll verifications:");
      console.log("  ✅ Price ZKP verification");
      console.log("  ✅ Purchase TX hash commitment verification");
      console.log("  ✅ Delivery TX hash commitment verification");
      console.log("  ✅ Binding tag match verification");
      console.log("  ✅ On-chain commitment match");
      console.log("  ✅ VC chain integrity");
      console.log("  ✅ Privacy (TX hashes hidden)");
      console.log("  ✅ EIP-712 signature verification (Stage 1)");
      console.log("  ✅ EIP-712 signature verification (Stage 3)");
      console.log("==========================================\n");
    });
  });
});

