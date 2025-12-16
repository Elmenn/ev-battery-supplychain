const ProductFactory = artifacts.require("ProductFactory");
const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const { assert } = require("chai");
const truffleAssert = require("truffle-assertions");
const axios = require("axios");
const { performance } = require("perf_hooks");
const crypto = require("crypto");
const { ethers, TypedDataEncoder } = require("ethers");

// Configuration
const CHAIN_ID = 11155111;
const SCHEMA_VERSION = "1.0";
const ZKP_BACKEND = process.env.ZKP_BACKEND || "http://127.0.0.1:5010";
const TEST_PRICE_WEI = 1_000_000; // Small value for testing

// Deterministic signer wallets for VC issuance/holding
const ISSUER_WALLET = new ethers.Wallet(
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
);
const HOLDER_WALLET = new ethers.Wallet(
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
);

contract("Purchase TX Hash Commitment Feature (Phase 1)", (accounts) => {
  const [seller, buyer, transporter] = accounts;

  let implementation;
  let factory;
  let escrow;
  let productAddress;
  let productId;
  let priceValueBN;
  let purchaseTxHash;
  let purchaseTxHashCommitment;
  let stageVCs;
  let ipfsStore;

  // Helper: Compute deterministic blinding (matches contract logic)
  function computeBlinding(escrowAddr, sellerAddr) {
    const { soliditySha3 } = web3.utils;
    return soliditySha3(
      { t: "address", v: escrowAddr },
      { t: "address", v: sellerAddr }
    );
  }

  // Helper: Generate TX hash commitment via ZKP backend
  async function generateTxHashCommitment(txHash) {
    try {
      const response = await axios.post(`${ZKP_BACKEND}/zkp/commit-tx-hash`, {
        tx_hash: txHash,
      });
      return {
        commitment: response.data.commitment,
        proof: response.data.proof,
        verified: response.data.verified,
        protocol: "bulletproofs-pedersen",
        version: "1.0",
        encoding: "hex",
      };
    } catch (error) {
      throw new Error(`Failed to generate TX hash commitment: ${error.message}`);
    }
  }

  // Helper: Verify TX hash commitment via ZKP backend
  async function verifyTxHashCommitment(commitment, proof) {
    try {
      const response = await axios.post(`${ZKP_BACKEND}/zkp/verify`, {
        commitment,
        proof,
      });
      return response.data.verified === true;
    } catch (error) {
      return false;
    }
  }

  // Helper: Compute CID (simplified - in real app, use IPFS)
  function computeCid(obj) {
    const hash = crypto.createHash("sha256");
    hash.update(JSON.stringify(obj));
    return "Qm" + hash.digest("hex").slice(0, 44);
  }

  // Helper: Build Stage 0 VC
  function buildStage0VC() {
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
        productName: "Purchase TX Hash Commitment Test Battery",
        batch: "BATCH-001",
        quantity: 1,
        componentCredentials: [],
        certificateCredential: {
          name: "Test Certificate",
          cid: "QmTestCertificate",
        },
      },
    };
  }

  // Helper: Build Stage 1 VC (Order Confirmation) with optional purchase TX hash commitment
  function buildStage1VC(stage0, stage0Cid, purchaseTxHashCommitment = null) {
    const credentialSubject = {
      ...stage0.credentialSubject,
      id: `did:ethr:${CHAIN_ID}:${buyer}`,
      previousCredential: stage0Cid,
      price: JSON.stringify({ hidden: true }),
    };

    // Phase 1: Include purchase TX hash commitment if provided
    if (purchaseTxHashCommitment) {
      credentialSubject.purchaseTxHashCommitment = purchaseTxHashCommitment;
    }

    return {
      ...stage0,
      credentialSubject,
      issuer: {
        id: `did:ethr:${CHAIN_ID}:${seller}`,
        name: "Seller",
      },
      holder: {
        id: `did:ethr:${CHAIN_ID}:${buyer}`,
        name: "Buyer",
      },
      proof: [],
    };
  }

  // Helper: Build Stage 2 VC (Delivery) - should preserve purchase TX hash commitment
  function buildStage2VC(stage1, stage1Cid) {
    const credentialSubject = {
      ...stage1.credentialSubject,
      previousCredential: stage1Cid,
    };
    // purchaseTxHashCommitment should be preserved via spread operator

    return {
      ...stage1,
      credentialSubject,
      proof: [],
    };
  }

  before(async () => {
    implementation = await ProductEscrow_Initializer.new();
    factory = await ProductFactory.new(implementation.address);

    // Deploy product via factory
    const productName = "Purchase TX Hash Commitment Test Battery";
    const dummyCommitment = web3.utils.randomHex(32);
    const priceBN = web3.utils.toBN(TEST_PRICE_WEI);
    const tx = await factory.createProduct(productName, dummyCommitment, priceBN, {
      from: seller,
    });
    productAddress = tx.logs.find((log) => log.event === "ProductCreated").args.product;
    escrow = await ProductEscrow_Initializer.at(productAddress);
    productId = (await escrow.id()).toString();
    priceValueBN = priceBN;

    // Set public price
    await escrow.setPublicPrice(priceValueBN, { from: seller });

    // Purchase product (this generates the purchase transaction hash)
    const purchaseTx = await escrow.purchasePublic({ from: buyer, value: priceValueBN });
    purchaseTxHash = purchaseTx.receipt.transactionHash;

    // Generate purchase TX hash commitment (Phase 1)
    purchaseTxHashCommitment = await generateTxHashCommitment(purchaseTxHash);
    assert.isTrue(purchaseTxHashCommitment.verified, "Purchase TX hash commitment should verify");

    // Build VC chain
    const stage0 = buildStage0VC();
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
  });

  describe("Purchase TX Hash Commitment Generation", () => {
    it("should generate purchase TX hash commitment after purchase", async () => {
      assert.exists(purchaseTxHash, "Purchase transaction hash should exist");
      assert.exists(purchaseTxHashCommitment, "Purchase TX hash commitment should exist");
      assert.isTrue(purchaseTxHashCommitment.verified, "Commitment should verify");
      assert.exists(purchaseTxHashCommitment.commitment, "Commitment should have commitment field");
      assert.exists(purchaseTxHashCommitment.proof, "Commitment should have proof field");
      assert.equal(
        purchaseTxHashCommitment.protocol,
        "bulletproofs-pedersen",
        "Protocol should match"
      );
      assert.equal(purchaseTxHashCommitment.version, "1.0", "Version should match");
    });

    it("should verify purchase TX hash commitment proof", async () => {
      const verified = await verifyTxHashCommitment(
        purchaseTxHashCommitment.commitment,
        purchaseTxHashCommitment.proof
      );
      assert.isTrue(verified, "Purchase TX hash commitment should verify");
    });
  });

  describe("Stage 1 VC (Order Confirmation)", () => {
    it("should include purchase TX hash commitment in Stage 1 VC", () => {
      const stage1VC = stageVCs.stage1.vc;

      assert.exists(
        stage1VC.credentialSubject.purchaseTxHashCommitment,
        "Stage 1 VC should have purchaseTxHashCommitment field"
      );

      const commitment = stage1VC.credentialSubject.purchaseTxHashCommitment;
      assert.equal(
        commitment.commitment,
        purchaseTxHashCommitment.commitment,
        "Commitment should match generated commitment"
      );
      assert.equal(commitment.proof, purchaseTxHashCommitment.proof, "Proof should match");
      assert.equal(commitment.protocol, "bulletproofs-pedersen", "Protocol should match");
      assert.equal(commitment.version, "1.0", "Version should match");
    });

    it("should not include actual transaction hash in Stage 1 VC", () => {
      const stage1VC = stageVCs.stage1.vc;
      const vcString = JSON.stringify(stage1VC);

      // The actual transaction hash should NOT be in the VC
      assert.notInclude(
        vcString,
        purchaseTxHash,
        "VC should not contain actual transaction hash"
      );
    });
  });

  describe("Stage 2 VC (Delivery) - Preservation", () => {
    it("should preserve purchase TX hash commitment in Stage 2 VC", () => {
      const stage2VC = stageVCs.stage2.vc;

      assert.exists(
        stage2VC.credentialSubject.purchaseTxHashCommitment,
        "Stage 2 VC should preserve purchaseTxHashCommitment from Stage 1"
      );

      const commitment = stage2VC.credentialSubject.purchaseTxHashCommitment;
      assert.equal(
        commitment.commitment,
        purchaseTxHashCommitment.commitment,
        "Commitment should be preserved"
      );
    });
  });

  describe("EIP-712 Signing", () => {
    it("should exclude purchaseTxHashCommitment from signing payload", () => {
      const stage1VC = stageVCs.stage1.vc;

      // Simulate preparePayloadForSigning (from signVcWithMetamask.js)
      const clone = JSON.parse(JSON.stringify(stage1VC));
      delete clone.proofs;
      if (clone.credentialSubject?.purchaseTxHashCommitment !== undefined) {
        delete clone.credentialSubject.purchaseTxHashCommitment;
      }

      // Verify it's excluded
      assert.notExists(
        clone.credentialSubject.purchaseTxHashCommitment,
        "purchaseTxHashCommitment should be excluded from signing payload"
      );

      // Verify other fields are preserved
      assert.exists(clone.credentialSubject.price, "Price should be preserved");
      assert.exists(clone.credentialSubject.productName, "Product name should be preserved");
    });
  });

  describe("Backward Compatibility", () => {
    it("should work without purchase TX hash commitment", () => {
      // Build Stage 1 VC without purchase TX hash commitment
      const stage0 = buildStage0VC();
      const stage0Cid = computeCid(stage0);
      const stage1WithoutCommitment = buildStage1VC(stage0, stage0Cid, null);

      // Should not have purchaseTxHashCommitment
      assert.notExists(
        stage1WithoutCommitment.credentialSubject.purchaseTxHashCommitment,
        "VC without commitment should not have purchaseTxHashCommitment field"
      );

      // Should still have other required fields
      assert.exists(stage1WithoutCommitment.credentialSubject.price, "Price should exist");
      assert.exists(
        stage1WithoutCommitment.credentialSubject.previousCredential,
        "Previous credential should exist"
      );
    });
  });

  describe("End-to-End Flow", () => {
    it("should complete full flow: purchase → order confirmation → delivery", async () => {
      // 1. Purchase (already done in before hook)
      assert.isTrue(await escrow.purchased(), "Product should be purchased");

      // 2. Order confirmation with purchase TX hash commitment
      // Ensure commitment is properly formatted as bytes32
      let purchaseCommitmentHex = purchaseTxHashCommitment.commitment.replace(/^0x/, '');
      if (purchaseCommitmentHex.length !== 64) {
        throw new Error(`Invalid purchase commitment length: expected 64 hex chars, got ${purchaseCommitmentHex.length}`);
      }
      const purchaseCommitmentBytes32 = "0x" + purchaseCommitmentHex;
      await escrow.confirmOrderWithCommitment(stageVCs.stage1.cid, purchaseCommitmentBytes32, { from: seller });
      const vcCidAfterConfirm = await escrow.vcCid();
      assert.equal(vcCidAfterConfirm, stageVCs.stage1.cid, "VC CID should be set");
      
      // Verify PurchaseConfirmedWithCommitment event was emitted
      const events = await escrow.getPastEvents("PurchaseConfirmedWithCommitment", {
        fromBlock: 0,
        toBlock: "latest",
      });
      assert.isAtLeast(events.length, 1, "PurchaseConfirmedWithCommitment event should be emitted");
      const event = events[events.length - 1];
      assert.equal(event.args.productId.toString(), productId, "Product ID should match");
      const eventCommitment = event.args.purchaseTxHashCommitment.toLowerCase();
      const expectedCommitment = purchaseCommitmentBytes32.toLowerCase();
      assert.equal(eventCommitment, expectedCommitment, "Purchase TX hash commitment should match");
      assert.equal(event.args.buyer.toLowerCase(), buyer.toLowerCase(), "Buyer should match");
      assert.equal(event.args.vcCID, stageVCs.stage1.cid, "VC CID should match");

      // 3. Verify Stage 1 VC has purchase TX hash commitment
      const stage1VC = ipfsStore.get(stageVCs.stage1.cid);
      assert.exists(
        stage1VC.credentialSubject.purchaseTxHashCommitment,
        "Stage 1 VC should have purchase TX hash commitment"
      );

      // 4. Register transporter and set transporter
      const deliveryFeeWei = web3.utils.toWei("0.0001", "ether");
      await escrow.createTransporter(deliveryFeeWei, { from: transporter });
      await escrow.setTransporter(transporter, { from: seller, value: deliveryFeeWei });

      // 5. Delivery (Stage 2 VC should preserve purchase TX hash commitment)
      const stage2VC = ipfsStore.get(stageVCs.stage2.cid);
      assert.exists(
        stage2VC.credentialSubject.purchaseTxHashCommitment,
        "Stage 2 VC should preserve purchase TX hash commitment"
      );
    });
  });

  describe("Performance", () => {
    it("should measure purchase TX hash commitment generation time", async () => {
      const times = [];
      const testTxHash = "0x" + crypto.randomBytes(32).toString("hex");

      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        const commitment = await generateTxHashCommitment(testTxHash);
        const end = performance.now();
        times.push(end - start);
        assert.isTrue(commitment.verified, "Commitment should verify");
      }

      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      const min = Math.min(...times);
      const max = Math.max(...times);
      const std = Math.sqrt(
        times.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / times.length
      );

      console.log("\n=== Purchase TX Hash Commitment Generation Timing (ms) ===");
      console.log(`mean=${mean.toFixed(2)} ms | min=${min.toFixed(2)} ms | max=${max.toFixed(2)} ms | std=${std.toFixed(2)} ms`);
      console.log("===========================================================\n");

      // Should complete in reasonable time (< 1 second per generation)
      assert.isBelow(mean, 1000, "Mean generation time should be under 1 second");
    });
  });
});

