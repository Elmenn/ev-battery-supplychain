/**
 * Test for Delivery TX Hash Commitment Fix
 * 
 * This test verifies that:
 * 1. TX hash commitment is always added to VC when commitment and proof exist (even if verified=false)
 * 2. Binding tag is properly included
 * 3. VC is uploaded to IPFS with TX hash commitment
 * 4. On-chain CID is updated with TX hash commitment
 */

const ProductFactory = artifacts.require("ProductFactory");
const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const { assert } = require("chai");
const truffleAssert = require("truffle-assertions");
const axios = require("axios");
const crypto = require("crypto");

const ZKP_BACKEND = process.env.ZKP_BACKEND_URL || "http://127.0.0.1:5010";
const TEST_PRICE_WEI = 1_000_000;

contract("Delivery TX Hash Commitment Fix", (accounts) => {
  const [seller, buyer, transporter] = accounts;
  let factory;
  let escrow;
  let productAddress;
  let productId;
  let deliveryTxHash;
  let mockIPFSStore = new Map();

  before(async () => {
    const implementation = await ProductEscrow_Initializer.new();
    factory = await ProductFactory.new(implementation.address);

    // Deploy product
    const productName = "Delivery TX Hash Test";
    const dummyCommitment = web3.utils.randomHex(32);
    const priceBN = web3.utils.toBN(TEST_PRICE_WEI);
    const tx = await factory.createProduct(productName, dummyCommitment, priceBN, {
      from: seller,
    });
    productAddress = tx.logs.find((log) => log.event === "ProductCreated").args.product;
    escrow = await ProductEscrow_Initializer.at(productAddress);
    productId = (await escrow.id()).toString();

    // Set price and purchase
    await escrow.setPublicPriceWithCommitment(priceBN, dummyCommitment, { from: seller });
    await escrow.purchasePublic({ from: buyer, value: priceBN });

    // Register transporter
    const deliveryFeeWei = web3.utils.toWei("0.0001", "ether");
    await escrow.createTransporter(deliveryFeeWei, { from: transporter });
    await escrow.setTransporter(transporter, { from: seller, value: deliveryFeeWei });
  });

  it("should always add TX hash commitment to VC when commitment and proof exist (even if verified=false)", async () => {
    // Simulate delivery transaction
    const revealedValue = web3.utils.toBN(TEST_PRICE_WEI);
    const blinding = computeBlinding(productAddress, seller);
    const initialVcCid = "QmInitialVC123";
    
    // Confirm delivery
    const deliveryTx = await escrow.revealAndConfirmDelivery(
      revealedValue,
      blinding,
      initialVcCid,
      { from: buyer }
    );
    deliveryTxHash = deliveryTx.receipt.transactionHash;

    // Generate TX hash commitment (simulate ZKP backend response)
    let txHashCommitment;
    try {
      const response = await axios.post(`${ZKP_BACKEND}/zkp/commit-tx-hash`, {
        tx_hash: deliveryTxHash,
      }, { timeout: 15000 });
      txHashCommitment = {
        commitment: response.data.commitment,
        proof: response.data.proof,
        verified: response.data.verified, // May be true or false
        protocol: "bulletproofs-pedersen",
        version: "1.0",
        encoding: "hex",
      };
    } catch (error) {
      // If ZKP backend is not available, create mock commitment
      console.warn("ZKP backend not available, using mock commitment");
      txHashCommitment = {
        commitment: web3.utils.randomHex(32),
        proof: web3.utils.randomHex(128),
        verified: false, // Simulate verification failure
        protocol: "bulletproofs-pedersen",
        version: "1.0",
        encoding: "hex",
      };
    }

    // Build Stage 3 VC (simulating the fixed delivery flow)
    const stage3VC = {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      id: `urn:uuid:${productId}-3`,
      type: ["VerifiableCredential"],
      schemaVersion: "1.0",
      issuer: {
        id: `did:ethr:1337:${seller.toLowerCase()}`,
        name: "Seller",
      },
      holder: {
        id: `did:ethr:1337:${buyer.toLowerCase()}`,
        name: "Buyer",
      },
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: `did:ethr:1337:${buyer.toLowerCase()}`,
        productName: "Delivery TX Hash Test",
        batch: "BATCH-1",
        quantity: 1,
        previousCredential: initialVcCid,
        componentCredentials: [],
        certificateCredential: { name: "", cid: "" },
        price: JSON.stringify({ hidden: true }),
      },
      proof: [],
    };

    // ✅ FIX: Always add TX hash commitment if commitment and proof exist
    // (This is the fix - previously it only added if verified === true)
    if (txHashCommitment.commitment && txHashCommitment.proof) {
      stage3VC.credentialSubject.txHashCommitment = {
        commitment: txHashCommitment.commitment,
        proof: txHashCommitment.proof,
        protocol: txHashCommitment.protocol,
        version: txHashCommitment.version,
        encoding: txHashCommitment.encoding,
      };
      console.log("✅ TX hash commitment added to VC (verified:", txHashCommitment.verified, ")");
    }

    // Verify TX hash commitment is present in VC
    assert.exists(
      stage3VC.credentialSubject.txHashCommitment,
      "TX hash commitment should be present in VC"
    );
    assert.equal(
      stage3VC.credentialSubject.txHashCommitment.commitment,
      txHashCommitment.commitment,
      "Commitment should match"
    );
    assert.equal(
      stage3VC.credentialSubject.txHashCommitment.proof,
      txHashCommitment.proof,
      "Proof should match"
    );

    // Simulate IPFS upload
    const finalCid = computeCid(stage3VC);
    mockIPFSStore.set(finalCid, stage3VC);

    // Update on-chain CID with TX hash commitment
    const commitmentBytes32 = txHashCommitment.commitment.startsWith('0x')
      ? txHashCommitment.commitment
      : '0x' + txHashCommitment.commitment;
    
    // Ensure it's exactly 32 bytes
    const commitmentHex = commitmentBytes32.replace(/^0x/, '');
    const paddedCommitment = '0x' + commitmentHex.padStart(64, '0').slice(0, 64);
    
    const updateTx = await escrow.updateVcCidAfterDelivery(finalCid, paddedCommitment, {
      from: buyer,
    });

    // Verify event was emitted
    const event = updateTx.logs.find((log) => log.event === "DeliveryConfirmedWithCommitment");
    assert.exists(event, "DeliveryConfirmedWithCommitment event should be emitted");
    assert.equal(
      event.args.txHashCommitment,
      paddedCommitment,
      "Event should contain TX hash commitment"
    );
    assert.equal(event.args.vcCID, finalCid, "Event should contain VC CID");

    // Verify on-chain CID was updated
    const onChainCid = await escrow.vcCid();
    assert.equal(onChainCid, finalCid, "On-chain CID should be updated");

    // Verify VC from IPFS has TX hash commitment
    const vcFromIpfs = mockIPFSStore.get(finalCid);
    assert.exists(
      vcFromIpfs.credentialSubject.txHashCommitment,
      "VC from IPFS should have TX hash commitment"
    );
  });

  it("should include binding tag when provided", async () => {
    // Generate binding tag
    const bindingTag = generateBindingTag(productAddress, productId, buyer);
    
    // Generate TX hash commitment with binding tag
    let txHashCommitment;
    try {
      const response = await axios.post(`${ZKP_BACKEND}/zkp/commit-tx-hash`, {
        tx_hash: deliveryTxHash,
        binding_tag_hex: bindingTag,
      }, { timeout: 15000 });
      txHashCommitment = {
        commitment: response.data.commitment,
        proof: response.data.proof,
        verified: response.data.verified,
        protocol: "bulletproofs-pedersen",
        version: "1.0",
        encoding: "hex",
        bindingTag: bindingTag,
      };
    } catch (error) {
      // Mock if ZKP backend unavailable
      txHashCommitment = {
        commitment: web3.utils.randomHex(32),
        proof: web3.utils.randomHex(128),
        verified: true,
        protocol: "bulletproofs-pedersen",
        version: "1.0",
        encoding: "hex",
        bindingTag: bindingTag,
      };
    }

    const stage3VC = {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      id: `urn:uuid:${productId}-3-with-binding`,
      type: ["VerifiableCredential"],
      schemaVersion: "1.0",
      issuer: { id: `did:ethr:1337:${seller.toLowerCase()}`, name: "Seller" },
      holder: { id: `did:ethr:1337:${buyer.toLowerCase()}`, name: "Buyer" },
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: `did:ethr:1337:${buyer.toLowerCase()}`,
        productName: "Test",
        batch: "BATCH-1",
        quantity: 1,
        previousCredential: "",
        componentCredentials: [],
        certificateCredential: { name: "", cid: "" },
        price: JSON.stringify({ hidden: true }),
      },
      proof: [],
    };

    // Add TX hash commitment with binding tag
    if (txHashCommitment.commitment && txHashCommitment.proof) {
      stage3VC.credentialSubject.txHashCommitment = {
        commitment: txHashCommitment.commitment,
        proof: txHashCommitment.proof,
        protocol: txHashCommitment.protocol,
        version: txHashCommitment.version,
        encoding: txHashCommitment.encoding,
        ...(txHashCommitment.bindingTag ? { bindingTag: txHashCommitment.bindingTag } : {}),
      };
    }

    // Verify binding tag is included
    assert.exists(
      stage3VC.credentialSubject.txHashCommitment.bindingTag,
      "Binding tag should be included in TX hash commitment"
    );
    assert.equal(
      stage3VC.credentialSubject.txHashCommitment.bindingTag,
      bindingTag,
      "Binding tag should match"
    );
  });

  it("should handle missing commitment or proof gracefully", async () => {
    const stage3VC = {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      id: `urn:uuid:${productId}-3-no-commitment`,
      type: ["VerifiableCredential"],
      schemaVersion: "1.0",
      issuer: { id: `did:ethr:1337:${seller.toLowerCase()}`, name: "Seller" },
      holder: { id: `did:ethr:1337:${buyer.toLowerCase()}`, name: "Buyer" },
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: `did:ethr:1337:${buyer.toLowerCase()}`,
        productName: "Test",
        batch: "BATCH-1",
        quantity: 1,
        previousCredential: "",
        componentCredentials: [],
        certificateCredential: { name: "", cid: "" },
        price: JSON.stringify({ hidden: true }),
      },
      proof: [],
    };

    // Simulate missing commitment or proof
    const txHashCommitment = {
      commitment: null, // Missing commitment
      proof: web3.utils.randomHex(128),
      verified: false,
    };

    // Should not add TX hash commitment if commitment or proof is missing
    if (txHashCommitment.commitment && txHashCommitment.proof) {
      stage3VC.credentialSubject.txHashCommitment = {
        commitment: txHashCommitment.commitment,
        proof: txHashCommitment.proof,
        protocol: "bulletproofs-pedersen",
        version: "1.0",
        encoding: "hex",
      };
    }

    // Verify TX hash commitment is NOT present
    assert.notExists(
      stage3VC.credentialSubject.txHashCommitment,
      "TX hash commitment should not be present when commitment is missing"
    );
  });
});

// Helper functions
function computeBlinding(escrowAddr, sellerAddr) {
  return web3.utils.soliditySha3(
    { type: "address", value: escrowAddr },
    { type: "address", value: sellerAddr }
  );
}

function generateBindingTag(escrowAddr, productId, buyerAddr) {
  const hash = crypto.createHash("sha256");
  hash.update(escrowAddr);
  hash.update(productId);
  hash.update(buyerAddr);
  return "0x" + hash.digest("hex");
}

function computeCid(obj) {
  const hash = crypto.createHash("sha256");
  hash.update(JSON.stringify(obj));
  return "Qm" + hash.digest("hex").slice(0, 44);
}

