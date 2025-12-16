const ProductFactory = artifacts.require("ProductFactory");
const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const { assert } = require("chai");
const truffleAssert = require("truffle-assertions");
const axios = require("axios");
const crypto = require("crypto");
const { ethers } = require("ethers");

// Configuration
const CHAIN_ID = 1337; // Ganache default
const SCHEMA_VERSION = "1.0";
const ZKP_BACKEND = process.env.ZKP_BACKEND_URL || "http://127.0.0.1:5010";
const TEST_PRICE_WEI = 1_000_000; // Small value for testing

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

// Helper: Compute deterministic blinding (matches contract logic)
function computeBlinding(escrowAddr, sellerAddr) {
  const { soliditySha3 } = web3.utils;
  return soliditySha3(
    { t: "address", v: escrowAddr },
    { t: "address", v: sellerAddr }
  );
}

// Helper: Compute CID (simplified - in real app, use IPFS)
function computeCid(obj) {
  const hash = crypto.createHash("sha256");
  hash.update(JSON.stringify(obj));
  return "Qm" + hash.digest("hex").slice(0, 44);
}

// Helper: Verify purchase transaction on-chain by checking PurchaseConfirmedWithCommitment event
// Uses Truffle contract instance directly (no ethers needed)
async function verifyPurchaseTransactionOnChain(commitment, productAddress, vcCID, escrowContract) {
  try {
    if (!commitment || !productAddress || !vcCID || !escrowContract) {
      return {
        verified: false,
        error: "Missing required parameters for purchase transaction verification",
      };
    }

    // Normalize commitment to ensure it has 0x prefix
    const normalizedCommitment = commitment.startsWith('0x') ? commitment : '0x' + commitment;
    
    // Query events using Truffle's getPastEvents
    // Note: vcCID is not indexed, so we filter by indexed purchaseTxHashCommitment and check vcCID manually
    const events = await escrowContract.getPastEvents('PurchaseConfirmedWithCommitment', {
      filter: {
        purchaseTxHashCommitment: normalizedCommitment,
      },
      fromBlock: 0,
      toBlock: 'latest'
    });
    
    // Filter by vcCID manually (since it's not indexed)
    const matchingEvents = events.filter(event => event.args.vcCID === vcCID);
    
    // Verify event exists and parameters match
    if (matchingEvents.length > 0) {
      const event = matchingEvents[0];
      return {
        verified: true,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        message: "✅ Purchase transaction verified: exists on-chain and succeeded",
      };
    }
    
    return {
      verified: false,
      error: "No matching event found for this commitment and VC CID",
      message: "❌ No matching PurchaseConfirmedWithCommitment event found on-chain.",
    };
  } catch (error) {
    return {
      verified: false,
      error: `Purchase transaction verification failed: ${error.message}`,
    };
  }
}

// Helper: Verify delivery transaction on-chain by checking DeliveryConfirmedWithCommitment event
// Uses Truffle contract instance directly (no ethers needed)
async function verifyTransactionOnChain(commitment, productAddress, vcCID, escrowContract) {
  try {
    if (!commitment || !productAddress || !vcCID || !escrowContract) {
      return {
        verified: false,
        error: "Missing required parameters for transaction verification",
      };
    }

    // Normalize commitment to ensure it has 0x prefix
    const normalizedCommitment = commitment.startsWith('0x') ? commitment : '0x' + commitment;
    
    // Query events using Truffle's getPastEvents
    // Note: vcCID is not indexed, so we filter by indexed txHashCommitment and check vcCID manually
    const events = await escrowContract.getPastEvents('DeliveryConfirmedWithCommitment', {
      filter: {
        txHashCommitment: normalizedCommitment,
      },
      fromBlock: 0,
      toBlock: 'latest'
    });
    
    // Filter by vcCID manually (since it's not indexed)
    const matchingEvents = events.filter(event => event.args.vcCID === vcCID);
    
    // Verify event exists and parameters match
    if (matchingEvents.length > 0) {
      const event = matchingEvents[0];
      return {
        verified: true,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        message: "✅ Transaction verified: exists on-chain and succeeded",
      };
    }
    
    return {
      verified: false,
      error: "No matching event found for this commitment and VC CID",
      message: "❌ No matching DeliveryConfirmedWithCommitment event found on-chain.",
    };
  } catch (error) {
    return {
      verified: false,
      error: `Transaction verification failed: ${error.message}`,
    };
  }
}

contract("Transaction Verification Feature (Feature 1)", (accounts) => {
  const [seller, buyer, transporter] = accounts;

  let factory;
  let escrow;
  let productAddress;
  let productId;
  let priceValueBN;
  let purchaseTxHash;
  let purchaseTxHashCommitment;
  let deliveryTxHash;
  let deliveryTxHashCommitment;
  let stageVCs;
  let ipfsStore;

  before(async () => {
    console.log("\n=== Setting up Transaction Verification Test ===\n");

    // Deploy factory and product
    const implementation = await ProductEscrow_Initializer.new();
    factory = await ProductFactory.new(implementation.address);

    const productName = "Transaction Verification Test Battery";
    const priceBN = web3.utils.toBN(TEST_PRICE_WEI);
    priceValueBN = priceBN;

    // Create product
    const dummyCommitment = web3.utils.randomHex(32);
    const tx = await factory.createProduct(productName, dummyCommitment, priceBN, {
      from: seller,
    });
    productAddress = tx.logs.find((log) => log.event === "ProductCreated").args.product;
    escrow = await ProductEscrow_Initializer.at(productAddress);
    productId = (await escrow.id()).toString();

    console.log(`✅ Product created: ${productAddress} (ID: ${productId})`);

    // Set public price
    const actualBlinding = computeBlinding(productAddress, seller);
    const priceCommitment = web3.utils.soliditySha3(
      { t: 'uint256', v: priceValueBN },
      { t: 'bytes32', v: actualBlinding }
    );
    await escrow.setPublicPriceWithCommitment(priceValueBN, priceCommitment, { from: seller });
    await escrow.setPublicEnabled(true, { from: seller });
    console.log("✅ Public price set with commitment");

    // Purchase product
    console.log("🛒 Purchasing product...");
    const purchaseTx = await escrow.purchasePublic({ from: buyer, value: priceValueBN });
    purchaseTxHash = purchaseTx.receipt.transactionHash;
    console.log(`✅ Product purchased, transaction: ${purchaseTxHash}`);
    
    // Generate purchase TX hash commitment
    console.log("🔐 Generating purchase TX hash commitment...");
    purchaseTxHashCommitment = await generateTxHashCommitment(purchaseTxHash);
    assert.isTrue(purchaseTxHashCommitment.verified, "Purchase TX hash commitment should verify");
    console.log("✅ Purchase TX hash commitment generated");

    // Build VC chain
    console.log("📝 Building VC chain...");
    const stage0 = {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      id: `https://example.edu/credentials/${crypto.randomBytes(16).toString("hex")}`,
      type: ["VerifiableCredential"],
      schemaVersion: SCHEMA_VERSION,
      issuer: { id: `did:ethr:${CHAIN_ID}:${seller}`, name: "Seller" },
      holder: { id: `did:ethr:${CHAIN_ID}:${buyer}`, name: "Buyer" },
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: `did:ethr:${CHAIN_ID}:${seller}`,
        productName: productName,
        batch: "BATCH-001",
        quantity: 1,
      },
      proof: [],
    };
    const stage0Cid = computeCid(stage0);
    const stage1 = {
      ...stage0,
      credentialSubject: {
        ...stage0.credentialSubject,
        id: `did:ethr:${CHAIN_ID}:${buyer}`,
        previousCredential: stage0Cid,
        price: JSON.stringify({ hidden: true }),
        purchaseTxHashCommitment: purchaseTxHashCommitment,
      },
      proof: [],
    };
    const stage1Cid = computeCid(stage1);
    const stage2 = {
      ...stage1,
      credentialSubject: {
        ...stage1.credentialSubject,
        previousCredential: stage1Cid,
        purchaseTxHashCommitment: purchaseTxHashCommitment, // Preserve purchase commitment
      },
      proof: [],
    };
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

    // Confirm order with purchase TX hash commitment
    console.log("✅ Confirming order with purchase TX hash commitment...");
    // Ensure commitment is properly formatted as bytes32 (64 hex chars with 0x prefix)
    let purchaseCommitmentHex = purchaseTxHashCommitment.commitment.replace(/^0x/, '');
    if (purchaseCommitmentHex.length !== 64) {
      throw new Error(`Invalid purchase commitment length: expected 64 hex chars, got ${purchaseCommitmentHex.length}`);
    }
    const purchaseCommitmentBytes32 = "0x" + purchaseCommitmentHex;
    await escrow.confirmOrderWithCommitment(stage1Cid, purchaseCommitmentBytes32, { from: seller });
    console.log(`✅ Order confirmed with purchase commitment, VC CID: ${stage1Cid}`);

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
    const stage3WithoutCommitment = {
      ...stage2,
      credentialSubject: {
        ...stage2.credentialSubject,
        previousCredential: stage2Cid,
      },
      proof: [],
    };
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

    // Generate delivery TX hash commitment
    console.log("🔐 Generating delivery TX hash commitment...");
    deliveryTxHashCommitment = await generateTxHashCommitment(deliveryTxHash);
    assert.isTrue(deliveryTxHashCommitment.verified, "Delivery TX hash commitment should verify");
    console.log("✅ Delivery TX hash commitment generated");

    // Build final Stage 3 VC with delivery TX hash commitment
    const stage3 = {
      ...stage2,
      credentialSubject: {
        ...stage2.credentialSubject,
        previousCredential: stage2Cid,
        txHashCommitment: deliveryTxHashCommitment,
      },
      proof: [],
    };
    const stage3Cid = computeCid(stage3);
    ipfsStore.set(stage3Cid, stage3);
    stageVCs.stage3 = { vc: stage3, cid: stage3Cid };

    // Update on-chain CID with commitment (Feature 1: Transaction Verification)
    console.log("📡 Updating on-chain CID with TX hash commitment...");
    // Ensure commitment is properly formatted as bytes32 (64 hex chars with 0x prefix)
    let commitmentHex = deliveryTxHashCommitment.commitment.replace(/^0x/, '');
    if (commitmentHex.length !== 64) {
      throw new Error(`Invalid commitment length: expected 64 hex chars, got ${commitmentHex.length}`);
    }
    const commitmentBytes32 = "0x" + commitmentHex;
    await escrow.updateVcCidAfterDelivery(stage3Cid, commitmentBytes32, { from: buyer });
    console.log(`✅ Final VC CID updated on-chain: ${stage3Cid}`);

    console.log("\n=== Setup Complete ===\n");
  });

  describe("Purchase Transaction Verification (Feature 1)", () => {
    it("should emit PurchaseConfirmedWithCommitment event when confirming order with purchase commitment", async () => {
      // Check that the event was emitted in the before hook
      const events = await escrow.getPastEvents("PurchaseConfirmedWithCommitment", {
        fromBlock: 0,
        toBlock: "latest",
      });

      assert.isAtLeast(events.length, 1, "PurchaseConfirmedWithCommitment event should be emitted");
      
      const event = events[events.length - 1]; // Get the most recent event
      assert.equal(event.args.productId.toString(), productId, "Product ID should match");
      
      // Normalize commitment comparison (event stores with 0x prefix, backend returns without)
      const eventCommitment = event.args.purchaseTxHashCommitment.toLowerCase();
      const expectedCommitment = (purchaseTxHashCommitment.commitment.startsWith('0x') 
        ? purchaseTxHashCommitment.commitment 
        : '0x' + purchaseTxHashCommitment.commitment).toLowerCase();
      assert.equal(eventCommitment, expectedCommitment, "Purchase TX hash commitment should match");
      
      assert.equal(event.args.buyer.toLowerCase(), buyer.toLowerCase(), "Buyer should match");
      assert.equal(event.args.vcCID, stageVCs.stage1.cid, "VC CID should match");
      
      console.log("✅ PurchaseConfirmedWithCommitment event verified");
    });

    it("should verify purchase transaction exists on-chain and succeeded", async () => {
      // Normalize commitment (ensure it has 0x prefix for comparison)
      const commitment = purchaseTxHashCommitment.commitment.startsWith('0x') 
        ? purchaseTxHashCommitment.commitment 
        : '0x' + purchaseTxHashCommitment.commitment;
      
      // Use Truffle contract instance directly (no ethers needed)
      const result = await verifyPurchaseTransactionOnChain(
        commitment,
        productAddress,
        stageVCs.stage1.cid,
        escrow
      );

      assert.isTrue(result.verified, "Purchase transaction should be verified");
      assert.exists(result.blockNumber, "Block number should be present");
      assert.exists(result.transactionHash, "Transaction hash should be present");
      assert.equal(result.message, "✅ Purchase transaction verified: exists on-chain and succeeded");
      
      console.log(`✅ Purchase transaction verified at block ${result.blockNumber}`);
    });

    it("should fail purchase verification with wrong commitment", async () => {
      const wrongCommitment = "0x" + "1".repeat(64);
      // Use Truffle contract instance directly (no ethers needed)
      const result = await verifyPurchaseTransactionOnChain(
        wrongCommitment,
        productAddress,
        stageVCs.stage1.cid,
        escrow
      );

      assert.isFalse(result.verified, "Verification should fail with wrong commitment");
      assert.exists(result.error, "Error message should be present");
      
      console.log("✅ Purchase verification correctly fails with wrong commitment");
    });

    it("should fail purchase verification with wrong VC CID", async () => {
      // Normalize commitment (ensure it has 0x prefix for comparison)
      const commitment = purchaseTxHashCommitment.commitment.startsWith('0x') 
        ? purchaseTxHashCommitment.commitment 
        : '0x' + purchaseTxHashCommitment.commitment;
      
      const wrongCid = "Qm" + "1".repeat(44);
      const result = await verifyPurchaseTransactionOnChain(
        commitment,
        productAddress,
        wrongCid,
        escrow
      );

      assert.isFalse(result.verified, "Verification should fail with wrong VC CID");
      assert.exists(result.error, "Error message should be present");
      
      console.log("✅ Purchase verification correctly fails with wrong VC CID");
    });
  });

  describe("Delivery Transaction Verification (Feature 1)", () => {
    it("should emit DeliveryConfirmedWithCommitment event when updating CID with commitment", async () => {
      // Check that the event was emitted in the before hook
      const events = await escrow.getPastEvents("DeliveryConfirmedWithCommitment", {
        fromBlock: 0,
        toBlock: "latest",
      });

      assert.isAtLeast(events.length, 1, "DeliveryConfirmedWithCommitment event should be emitted");
      
      const event = events[events.length - 1]; // Get the most recent event
      assert.equal(event.args.productId.toString(), productId, "Product ID should match");
      
      // Normalize commitment comparison (event stores with 0x prefix, backend returns without)
      const eventCommitment = event.args.txHashCommitment.toLowerCase();
      const expectedCommitment = (deliveryTxHashCommitment.commitment.startsWith('0x') 
        ? deliveryTxHashCommitment.commitment 
        : '0x' + deliveryTxHashCommitment.commitment).toLowerCase();
      assert.equal(eventCommitment, expectedCommitment, "TX hash commitment should match");
      
      assert.equal(event.args.buyer.toLowerCase(), buyer.toLowerCase(), "Buyer should match");
      assert.equal(event.args.vcCID, stageVCs.stage3.cid, "VC CID should match");
      
      console.log("✅ DeliveryConfirmedWithCommitment event verified");
    });

    it("should verify transaction exists on-chain and succeeded", async () => {
      // Normalize commitment (ensure it has 0x prefix for comparison)
      const commitment = deliveryTxHashCommitment.commitment.startsWith('0x') 
        ? deliveryTxHashCommitment.commitment 
        : '0x' + deliveryTxHashCommitment.commitment;
      
      // Use Truffle contract instance directly (no ethers needed)
      const result = await verifyTransactionOnChain(
        commitment,
        productAddress,
        stageVCs.stage3.cid,
        escrow
      );

      assert.isTrue(result.verified, "Transaction should be verified");
      assert.exists(result.blockNumber, "Block number should be present");
      assert.exists(result.transactionHash, "Transaction hash should be present");
      assert.equal(result.message, "✅ Transaction verified: exists on-chain and succeeded");
      
      console.log(`✅ Transaction verified at block ${result.blockNumber}`);
    });

    it("should fail verification with wrong commitment", async () => {
      const wrongCommitment = "0x" + "1".repeat(64);
      // Use Truffle contract instance directly (no ethers needed)
      const result = await verifyTransactionOnChain(
        wrongCommitment,
        productAddress,
        stageVCs.stage3.cid,
        escrow
      );

      assert.isFalse(result.verified, "Verification should fail with wrong commitment");
      assert.exists(result.error, "Error message should be present");
      
      console.log("✅ Verification correctly fails with wrong commitment");
    });

    it("should fail verification with wrong VC CID", async () => {
      // Normalize commitment (ensure it has 0x prefix for comparison)
      const commitment = deliveryTxHashCommitment.commitment.startsWith('0x') 
        ? deliveryTxHashCommitment.commitment 
        : '0x' + deliveryTxHashCommitment.commitment;
      
      const wrongCid = "Qm" + "1".repeat(44);
      // Use Truffle contract instance directly (no ethers needed)
      const result = await verifyTransactionOnChain(
        commitment,
        productAddress,
        wrongCid,
        escrow
      );

      assert.isFalse(result.verified, "Verification should fail with wrong VC CID");
      assert.exists(result.error, "Error message should be present");
      
      console.log("✅ Verification correctly fails with wrong VC CID");
    });

    it("should work without commitment (backward compatibility)", async () => {
      // Create a new product and complete delivery without commitment
      const productName2 = "No Commitment Test";
      const priceBN2 = web3.utils.toBN(TEST_PRICE_WEI);
      const tx2 = await factory.createProduct(productName2, web3.utils.randomHex(32), priceBN2, {
        from: seller,
      });
      const productAddress2 = tx2.logs.find((log) => log.event === "ProductCreated").args.product;
      const escrow2 = await ProductEscrow_Initializer.at(productAddress2);

      // Set public price
      const blinding2 = computeBlinding(productAddress2, seller);
      const priceCommitment2 = web3.utils.soliditySha3(
        { t: 'uint256', v: priceBN2 },
        { t: 'bytes32', v: blinding2 }
      );
      await escrow2.setPublicPriceWithCommitment(priceBN2, priceCommitment2, { from: seller });
      await escrow2.setPublicEnabled(true, { from: seller });

      // Purchase
      await escrow2.purchasePublic({ from: buyer, value: priceBN2 });

      // Build and confirm order
      const stage0_2 = {
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        id: `https://example.edu/credentials/${crypto.randomBytes(16).toString("hex")}`,
        type: ["VerifiableCredential"],
        schemaVersion: SCHEMA_VERSION,
        issuer: { id: `did:ethr:${CHAIN_ID}:${seller}`, name: "Seller" },
        holder: { id: `did:ethr:${CHAIN_ID}:${buyer}`, name: "Buyer" },
        issuanceDate: new Date().toISOString(),
        credentialSubject: {
          id: `did:ethr:${CHAIN_ID}:${seller}`,
          productName: productName2,
          batch: "BATCH-002",
          quantity: 1,
        },
        proof: [],
      };
      const stage0Cid_2 = computeCid(stage0_2);
      const stage1_2 = {
        ...stage0_2,
        credentialSubject: {
          ...stage0_2.credentialSubject,
          id: `did:ethr:${CHAIN_ID}:${buyer}`,
          previousCredential: stage0Cid_2,
          price: JSON.stringify({ hidden: true }),
        },
        proof: [],
      };
      const stage1Cid_2 = computeCid(stage1_2);
      const stage2_2 = {
        ...stage1_2,
        credentialSubject: {
          ...stage1_2.credentialSubject,
          previousCredential: stage1Cid_2,
        },
        proof: [],
      };
      const stage2Cid_2 = computeCid(stage2_2);

      // Use confirmOrderWithCommitment with zero commitment for backward compatibility test
      const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
      await escrow2.confirmOrderWithCommitment(stage1Cid_2, zeroCommitment, { from: seller });
      await escrow2.updateVcCid(stage2Cid_2, { from: seller });

      // Set transporter
      const deliveryFeeWei2 = web3.utils.toWei("0.0001", "ether");
      await escrow2.createTransporter(deliveryFeeWei2, { from: transporter });
      await escrow2.setTransporter(transporter, { from: seller, value: deliveryFeeWei2 });

      // Deliver
      const deliveryTx2 = await escrow2.revealAndConfirmDelivery(
        web3.utils.toBN(priceBN2),
        blinding2,
        stage2Cid_2,
        { from: buyer }
      );

      // Update CID without commitment (backward compatible)
      const stage3_2 = {
        ...stage2_2,
        credentialSubject: {
          ...stage2_2.credentialSubject,
          previousCredential: stage2Cid_2,
        },
        proof: [],
      };
      const stage3Cid_2 = computeCid(stage3_2);
      
      // Call with zero commitment (backward compatible)
      await escrow2.updateVcCidAfterDelivery(stage3Cid_2, "0x0000000000000000000000000000000000000000000000000000000000000000", { from: buyer });

      // Verify no event was emitted (commitment was zero)
      const events2 = await escrow2.getPastEvents("DeliveryConfirmedWithCommitment", {
        fromBlock: 0,
        toBlock: "latest",
      });

      assert.equal(events2.length, 0, "No DeliveryConfirmedWithCommitment event should be emitted when commitment is zero");
      
      console.log("✅ Backward compatibility verified - works without commitment");
    });
  });

  describe("End-to-End Flow", () => {
    it("should complete full flow with transaction verification", async () => {
      // Verify product state
      assert.isTrue(await escrow.purchased(), "Product should be purchased");
      assert.isTrue(await escrow.delivered(), "Product should be delivered");
      
      const phase = await escrow.phase();
      assert.equal(phase.toString(), "4", "Phase should be Delivered (4)");

      // Verify on-chain VC CID points to Stage 3
      const onChainCid = await escrow.vcCid();
      assert.equal(onChainCid, stageVCs.stage3.cid, "On-chain CID should point to Stage 3 VC");

      // Verify transaction on-chain
      // Normalize commitment (ensure it has 0x prefix for comparison)
      const commitment = deliveryTxHashCommitment.commitment.startsWith('0x') 
        ? deliveryTxHashCommitment.commitment 
        : '0x' + deliveryTxHashCommitment.commitment;
      
      // Use Truffle contract instance directly (no ethers needed)
      const verificationResult = await verifyTransactionOnChain(
        commitment,
        productAddress,
        stageVCs.stage3.cid,
        escrow
      );

      assert.isTrue(verificationResult.verified, "Transaction should be verified on-chain");
      assert.exists(verificationResult.blockNumber, "Block number should be present");
      assert.exists(verificationResult.transactionHash, "Transaction hash should be present");
      
      console.log("✅ Full flow with transaction verification completed successfully");
    });
  });
});

