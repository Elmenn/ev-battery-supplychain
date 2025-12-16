const ProductFactory = artifacts.require("ProductFactory");
const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const { assert } = require("chai");
const truffleAssert = require("truffle-assertions");
const axios = require("axios");
const { performance } = require("perf_hooks");
const crypto = require("crypto");
// Note: Using web3 for Truffle tests instead of ethers

// Configuration
const CHAIN_ID = 1337; // Ganache default
const SCHEMA_VERSION = "1.0";
const ZKP_BACKEND = process.env.ZKP_BACKEND_URL || "http://127.0.0.1:5010";
const TEST_PRICE_WEI = 1_000_000; // Small value for testing

// Helper: Generate binding tag for TX hash commitments (Feature 2)
function generateTxHashCommitmentBindingTag({ chainId, escrowAddr, productId, buyerAddress }) {
  // Normalize addresses (lowercase for consistency)
  const normalizedEscrow = escrowAddr.toLowerCase();
  const normalizedBuyer = buyerAddress.toLowerCase();
  
  // Convert to numbers
  const chainIdNum = typeof chainId === 'string' ? parseInt(chainId, 10) : Number(chainId);
  const productIdNum = typeof productId === 'bigint' ? Number(productId) : Number(productId);
  
  // Generate binding tag using keccak256 (web3.utils.soliditySha3 for packed encoding)
  const protocolVersion = 'tx-hash-bind-v1';
  const bindingTag = web3.utils.soliditySha3(
    { t: 'string', v: protocolVersion },
    { t: 'uint256', v: chainIdNum },
    { t: 'address', v: normalizedEscrow },
    { t: 'uint256', v: productIdNum },
    { t: 'address', v: normalizedBuyer }
  );
  
  // Return with 0x prefix
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

// Helper: Compute CID (simplified - in real app, use IPFS)
function computeCid(obj) {
  const hash = crypto.createHash("sha256");
  hash.update(JSON.stringify(obj));
  return "Qm" + hash.digest("hex").slice(0, 44);
}

// Helper: Compute deterministic blinding (matches contract logic)
function computeBlinding(escrowAddr, sellerAddr) {
  const { soliditySha3 } = web3.utils;
  return soliditySha3(
    { t: "address", v: escrowAddr },
    { t: "address", v: sellerAddr }
  );
}

// Helper: Build Stage 0 VC
function buildStage0VC(seller, buyer) {
  return {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    id: `https://example.edu/credentials/${crypto.randomBytes(16).toString("hex")}`,
    type: ["VerifiableCredential"],
    schemaVersion: SCHEMA_VERSION,
    issuer: {
      id: `did:ethr:${CHAIN_ID}:${seller}`,
      name: "Seller",
    },
    holder: {
      id: `did:ethr:${CHAIN_ID}:${buyer}`,
      name: "Buyer",
    },
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: `did:ethr:${CHAIN_ID}:${seller}`,
      productName: "Linkable Commitment Test Battery",
      batch: "BATCH-001",
      quantity: 1,
    },
  };
}

// Helper: Build Stage 1 VC (Order Confirmation) with purchase TX hash commitment
function buildStage1VC(stage0, stage0Cid, purchaseTxHashCommitment = null) {
  const credentialSubject = {
    ...stage0.credentialSubject,
    id: `did:ethr:${CHAIN_ID}:${stage0.holder.id.split(':').pop()}`,
    previousCredential: stage0Cid,
    price: JSON.stringify({ hidden: true }),
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

contract("Linkable Commitment Feature (Feature 2)", (accounts) => {
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
  let stageVCs;
  let ipfsStore;

  before(async () => {
    // Deploy factory and product
    const implementation = await ProductEscrow_Initializer.new();
    factory = await ProductFactory.new(implementation.address);

    const productName = "Linkable Commitment Test Product";
    const dummyCommitment = web3.utils.randomHex(32);
    const priceBN = web3.utils.toBN(TEST_PRICE_WEI);
    const tx = await factory.createProduct(productName, dummyCommitment, priceBN, {
      from: seller,
    });
    productAddress = tx.logs.find((log) => log.event === "ProductCreated").args.product;
    escrow = await ProductEscrow_Initializer.at(productAddress);
    productId = (await escrow.id()).toString();
    priceValueBN = priceBN;

    // Set public price with commitment (required for revealAndConfirmDelivery)
    const deterministicBlinding = computeBlinding(productAddress, seller);
    const priceCommitment = web3.utils.soliditySha3(
      { t: 'uint256', v: priceValueBN },
      { t: 'bytes32', v: deterministicBlinding }
    );
    await escrow.setPublicPriceWithCommitment(priceValueBN, priceCommitment, { from: seller });

    // Generate binding tag (Feature 2)
    bindingTag = generateTxHashCommitmentBindingTag({
      chainId: CHAIN_ID.toString(),
      escrowAddr: productAddress,
      productId: productId.toString(),
      buyerAddress: buyer,
    });

    // Purchase product
    const purchaseTx = await escrow.purchasePublic({ from: buyer, value: priceValueBN });
    purchaseTxHash = purchaseTx.receipt.transactionHash;

    // Generate purchase TX hash commitment with binding tag (Feature 2)
    purchaseTxHashCommitment = await generateTxHashCommitment(purchaseTxHash, bindingTag);
    assert.isTrue(purchaseTxHashCommitment.verified, "Purchase TX hash commitment should verify");

    // Build VC chain
    const stage0 = buildStage0VC(seller, buyer);
    const stage0Cid = computeCid(stage0);
    const stage1 = buildStage1VC(stage0, stage0Cid, purchaseTxHashCommitment);
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
    const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
    await escrow.confirmOrderWithCommitment(stage1Cid, zeroCommitment, { from: seller });

    // Update VC CID to Stage 2 (required before delivery)
    await escrow.updateVcCid(stage2Cid, { from: seller });

    // Register transporter and set transporter
    const deliveryFeeWei = web3.utils.toWei("0.0001", "ether");
    await escrow.createTransporter(deliveryFeeWei, { from: transporter });
    await escrow.setTransporter(transporter, { from: seller, value: deliveryFeeWei });

    // Simulate delivery confirmation
    const revealedValue = web3.utils.toBN(priceValueBN);
    const blinding = deterministicBlinding; // Use same blinding as used in setPublicPriceWithCommitment
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

    // Generate delivery TX hash commitment with same binding tag (Feature 2)
    deliveryTxHashCommitment = await generateTxHashCommitment(deliveryTxHash, bindingTag);
    assert.isTrue(deliveryTxHashCommitment.verified, "Delivery TX hash commitment should verify");

    // Build final Stage 3 VC with delivery TX hash commitment
    const stage3 = buildStage3VC(stage2, stage2Cid, deliveryTxHashCommitment);
    const stage3Cid = computeCid(stage3);
    ipfsStore.set(stage3Cid, stage3);
    stageVCs.stage3 = { vc: stage3, cid: stage3Cid };

    // Update on-chain CID
    await escrow.updateVcCidAfterDelivery(stage3Cid, { from: buyer });
  });

  describe("Binding Tag Generation", () => {
    it("should generate binding tag for purchase TX hash commitment", () => {
      assert.exists(bindingTag, "Binding tag should be generated");
      assert.isTrue(bindingTag.startsWith("0x"), "Binding tag should start with 0x");
      assert.equal(bindingTag.length, 66, "Binding tag should be 32 bytes (64 hex chars + 0x)");
    });

    it("should generate same binding tag for purchase and delivery", () => {
      const purchaseBindingTag = generateTxHashCommitmentBindingTag({
        chainId: CHAIN_ID.toString(),
        escrowAddr: productAddress,
        productId: productId.toString(),
        buyerAddress: buyer,
      });

      const deliveryBindingTag = generateTxHashCommitmentBindingTag({
        chainId: CHAIN_ID.toString(),
        escrowAddr: productAddress,
        productId: productId.toString(),
        buyerAddress: buyer,
      });

      assert.equal(
        purchaseBindingTag.toLowerCase(),
        deliveryBindingTag.toLowerCase(),
        "Binding tags should be identical for purchase and delivery"
      );
    });
  });

  describe("Purchase TX Hash Commitment with Binding Tag", () => {
    it("should generate purchase TX hash commitment with binding tag", async () => {
      assert.exists(purchaseTxHashCommitment, "Purchase TX hash commitment should exist");
      assert.isTrue(purchaseTxHashCommitment.verified, "Commitment should verify");
      assert.equal(
        purchaseTxHashCommitment.bindingTag,
        bindingTag,
        "Binding tag should match generated binding tag"
      );
    });

    it("should verify purchase TX hash commitment with binding tag", async () => {
      const verified = await verifyTxHashCommitment(
        purchaseTxHashCommitment.commitment,
        purchaseTxHashCommitment.proof,
        purchaseTxHashCommitment.bindingTag
      );
      assert.isTrue(verified, "Purchase TX hash commitment should verify with binding tag");
    });

    it("should fail verification with wrong binding tag", async () => {
      const wrongBindingTag = "0x" + "1".repeat(64);
      const verified = await verifyTxHashCommitment(
        purchaseTxHashCommitment.commitment,
        purchaseTxHashCommitment.proof,
        wrongBindingTag
      );
      assert.isFalse(verified, "Verification should fail with wrong binding tag");
    });
  });

  describe("Delivery TX Hash Commitment with Binding Tag", () => {
    it("should generate delivery TX hash commitment with same binding tag", async () => {
      assert.exists(deliveryTxHashCommitment, "Delivery TX hash commitment should exist");
      assert.isTrue(deliveryTxHashCommitment.verified, "Commitment should verify");
      assert.equal(
        deliveryTxHashCommitment.bindingTag,
        bindingTag,
        "Binding tag should match purchase binding tag"
      );
    });

    it("should verify delivery TX hash commitment with binding tag", async () => {
      const verified = await verifyTxHashCommitment(
        deliveryTxHashCommitment.commitment,
        deliveryTxHashCommitment.proof,
        deliveryTxHashCommitment.bindingTag
      );
      assert.isTrue(verified, "Delivery TX hash commitment should verify with binding tag");
    });
  });

  describe("Linkable Commitment Verification", () => {
    it("should verify that binding tags match between purchase and delivery", () => {
      const matches = verifyBindingTagsMatch(purchaseTxHashCommitment, deliveryTxHashCommitment);
      assert.isTrue(matches, "Binding tags should match between purchase and delivery");
    });

    it("should store binding tags in VCs", () => {
      const stage1VC = stageVCs.stage1.vc;
      const stage3VC = stageVCs.stage3.vc;

      assert.exists(
        stage1VC.credentialSubject.purchaseTxHashCommitment.bindingTag,
        "Stage 1 VC should have binding tag in purchase TX hash commitment"
      );

      assert.exists(
        stage3VC.credentialSubject.txHashCommitment.bindingTag,
        "Stage 3 VC should have binding tag in delivery TX hash commitment"
      );
    });

    it("should verify binding tags match from VCs", () => {
      const stage1VC = stageVCs.stage1.vc;
      const stage3VC = stageVCs.stage3.vc;

      const purchaseCommitment = stage1VC.credentialSubject.purchaseTxHashCommitment;
      const deliveryCommitment = stage3VC.credentialSubject.txHashCommitment;

      const matches = verifyBindingTagsMatch(purchaseCommitment, deliveryCommitment);
      assert.isTrue(matches, "Binding tags from VCs should match");
    });
  });

  describe("End-to-End Flow", () => {
    it("should complete full flow with linkable commitments", async () => {
      // 1. Purchase (already done in before hook)
      assert.isTrue(await escrow.purchased(), "Product should be purchased");

      // 2. Verify Stage 1 VC has purchase TX hash commitment with binding tag
      const stage1VC = ipfsStore.get(stageVCs.stage1.cid);
      assert.exists(
        stage1VC.credentialSubject.purchaseTxHashCommitment,
        "Stage 1 VC should have purchase TX hash commitment"
      );
      assert.exists(
        stage1VC.credentialSubject.purchaseTxHashCommitment.bindingTag,
        "Stage 1 VC should have binding tag in purchase TX hash commitment"
      );

      // 3. Verify Stage 3 VC has delivery TX hash commitment with binding tag
      const stage3VC = ipfsStore.get(stageVCs.stage3.cid);
      assert.exists(
        stage3VC.credentialSubject.txHashCommitment,
        "Stage 3 VC should have delivery TX hash commitment"
      );
      assert.exists(
        stage3VC.credentialSubject.txHashCommitment.bindingTag,
        "Stage 3 VC should have binding tag in delivery TX hash commitment"
      );

      // 4. Verify binding tags match
      const purchaseCommitment = stage1VC.credentialSubject.purchaseTxHashCommitment;
      const deliveryCommitment = stage3VC.credentialSubject.txHashCommitment;
      const matches = verifyBindingTagsMatch(purchaseCommitment, deliveryCommitment);
      assert.isTrue(matches, "Binding tags should match in end-to-end flow");
    });
  });

  describe("Backward Compatibility", () => {
    it("should work without binding tags (backward compatible)", async () => {
      const testTxHash = "0x" + crypto.randomBytes(32).toString("hex");
      
      // Generate commitment without binding tag
      const commitmentWithoutTag = await generateTxHashCommitment(testTxHash, null);
      assert.isTrue(commitmentWithoutTag.verified, "Commitment without binding tag should verify");
      assert.isNull(commitmentWithoutTag.bindingTag, "Binding tag should be null");

      // Verify without binding tag
      const verified = await verifyTxHashCommitment(
        commitmentWithoutTag.commitment,
        commitmentWithoutTag.proof,
        null
      );
      assert.isTrue(verified, "Verification should work without binding tag");
    });
  });

  describe("Performance", () => {
    it("should measure binding tag generation and commitment time", async () => {
      const times = {
        bindingTagGeneration: [],
        purchaseCommitment: [],
        deliveryCommitment: [],
        verification: [],
      };

      const testTxHash1 = "0x" + crypto.randomBytes(32).toString("hex");
      const testTxHash2 = "0x" + crypto.randomBytes(32).toString("hex");

      for (let i = 0; i < 5; i++) {
        // Measure binding tag generation
        const startBinding = performance.now();
        const testBindingTag = generateTxHashCommitmentBindingTag({
          chainId: CHAIN_ID.toString(),
          escrowAddr: productAddress,
          productId: productId.toString(),
          buyerAddress: buyer,
        });
        const endBinding = performance.now();
        times.bindingTagGeneration.push(endBinding - startBinding);

        // Measure purchase commitment generation
        const startPurchase = performance.now();
        const purchaseCommitment = await generateTxHashCommitment(testTxHash1, testBindingTag);
        const endPurchase = performance.now();
        times.purchaseCommitment.push(endPurchase - startPurchase);
        assert.isTrue(purchaseCommitment.verified, "Purchase commitment should verify");

        // Measure delivery commitment generation
        const startDelivery = performance.now();
        const deliveryCommitment = await generateTxHashCommitment(testTxHash2, testBindingTag);
        const endDelivery = performance.now();
        times.deliveryCommitment.push(endDelivery - startDelivery);
        assert.isTrue(deliveryCommitment.verified, "Delivery commitment should verify");

        // Measure verification
        const startVerify = performance.now();
        const verified = await verifyTxHashCommitment(
          purchaseCommitment.commitment,
          purchaseCommitment.proof,
          purchaseCommitment.bindingTag
        );
        const endVerify = performance.now();
        times.verification.push(endVerify - startVerify);
        assert.isTrue(verified, "Verification should succeed");
      }

      // Calculate statistics
      const calculateStats = (arr) => {
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        const min = Math.min(...arr);
        const max = Math.max(...arr);
        const std = Math.sqrt(
          arr.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / arr.length
        );
        return { mean, min, max, std };
      };

      console.log("\n=== Linkable Commitment Performance (ms) ===");
      for (const key in times) {
        const stats = calculateStats(times[key]);
        console.log(
          `${key}: mean=${stats.mean.toFixed(2)} ms | min=${stats.min.toFixed(2)} ms | max=${stats.max.toFixed(2)} ms | std=${stats.std.toFixed(2)} ms`
        );
      }
      console.log("============================================\n");

      // Should complete in reasonable time
      assert.isBelow(
        calculateStats(times.bindingTagGeneration).mean,
        10,
        "Binding tag generation should be fast (< 10ms)"
      );
      assert.isBelow(
        calculateStats(times.purchaseCommitment).mean,
        1000,
        "Purchase commitment generation should be under 1 second"
      );
      assert.isBelow(
        calculateStats(times.deliveryCommitment).mean,
        1000,
        "Delivery commitment generation should be under 1 second"
      );
    });
  });
});

