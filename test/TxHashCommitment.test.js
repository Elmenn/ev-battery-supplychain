const ProductFactory = artifacts.require("ProductFactory");
const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const { assert } = require("chai");
const truffleAssert = require("truffle-assertions");
const axios = require("axios");
const { performance } = require("perf_hooks");
const crypto = require("crypto");
const { ethers, TypedDataEncoder } = require("ethers");
const { verifyVC } = require("../backend/api/verifyVC");

// Configuration
const RUNS = 5;
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

contract("TX Hash Commitment Feature", (accounts) => {
  const [seller, buyer, transporter] = accounts;

  let implementation;
  let factory;
  let escrow;
  let productAddress;
  let productId;
  let stageVCs;
  let ipfsStore;
  let priceValueBN;
  let bindingContext;
  let zkpProof;
  let deterministicBlinding;
  let deliveryTxHash;
  let txHashCommitment;
  let stage3VCWithCommitment;
  let stage3CidWithCommitment;

  before(async () => {
    implementation = await ProductEscrow_Initializer.new();
    factory = await ProductFactory.new(implementation.address);

    // Deploy product via factory
    const productName = "TX Hash Commitment Test Battery";
    const dummyCommitment = web3.utils.randomHex(32);
    const priceBN = web3.utils.toBN(TEST_PRICE_WEI);
    const tx = await factory.createProduct(productName, dummyCommitment, priceBN, {
      from: seller,
    });
    productAddress = tx.logs.find((log) => log.event === "ProductCreated").args
      .product;
    escrow = await ProductEscrow_Initializer.at(productAddress);
    productId = (await escrow.id()).toString();

    // Prepare deterministic ZKP proof (needs backend running)
    priceValueBN = priceBN;
    deterministicBlinding = computeBlinding(productAddress, seller);
    bindingContext = {
      chainId: CHAIN_ID.toString(),
      escrowAddr: productAddress,
      productId,
      stage: 2,
      schemaVersion: SCHEMA_VERSION,
      previousVCCid: "",
    };
    // Build VC chain (Stage 0 -> Stage 2)
    stageVCs = await buildVerifiableCredentialChain();

    // Set public price with actual Bulletproof commitment
    await escrow.setPublicPriceWithCommitment(priceValueBN, zkpProof.commitment, {
      from: seller,
    });
    await escrow.purchasePublic({ from: buyer, value: priceValueBN });

    ipfsStore = new Map([
      [stageVCs.stage0.cid, stageVCs.stage0.vc],
      [stageVCs.stage1.cid, stageVCs.stage1.vc],
      [stageVCs.stage2.cid, stageVCs.stage2.vc],
    ]);

    // Update on-chain VC references (Stage 1 + final Stage 2)
    const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
    await escrow.confirmOrderWithCommitment(stageVCs.stage1.cid, zeroCommitment, { from: seller });
    await escrow.updateVcCid(stageVCs.stage2.cid, { from: seller });

    // Register transporter and set transporter (required for delivery)
    // Use a small fee that matches between createTransporter and setTransporter
    const deliveryFeeWei = web3.utils.toWei("0.0001", "ether"); // Small fee for testing
    await escrow.createTransporter(deliveryFeeWei, { from: transporter });
    await escrow.setTransporter(transporter, { from: seller, value: deliveryFeeWei });

    // Simulate delivery confirmation (revealAndConfirmDelivery)
    // This generates a transaction hash that we'll commit to
    // Use toBN to ensure correct format for contract
    const revealedValue = web3.utils.toBN(priceValueBN);
    const blinding = deterministicBlinding;
    
    // Build Stage 3 VC without TX hash commitment first
    const stage3VCWithoutCommitment = await buildStage3VC(stageVCs.stage2.vc, false);
    const stage3CidWithoutCommitment = computeCid(stage3VCWithoutCommitment);
    ipfsStore.set(stage3CidWithoutCommitment, stage3VCWithoutCommitment);

    // Call revealAndConfirmDelivery (this stores the CID on-chain)
    const deliveryTx = await escrow.revealAndConfirmDelivery(
      revealedValue,
      blinding,
      stage3CidWithoutCommitment,
      { from: buyer }
    );
    // Extract transaction hash from Truffle transaction object
    deliveryTxHash = deliveryTx.receipt.transactionHash;

    // Generate TX hash commitment
    txHashCommitment = await generateTxHashCommitment(deliveryTxHash);
    assert.isTrue(txHashCommitment.verified, "TX hash commitment should verify");

    // Build Stage 3 VC with TX hash commitment
    stage3VCWithCommitment = await buildStage3VC(stageVCs.stage2.vc, true);
    stage3CidWithCommitment = computeCid(stage3VCWithCommitment);
    ipfsStore.set(stage3CidWithCommitment, stage3VCWithCommitment);

    // Update on-chain CID to point to VC with TX hash commitment
    await escrow.updateVcCidAfterDelivery(stage3CidWithCommitment, { from: buyer });
  });

  it("should store TX hash commitment in Stage 3 VC", async () => {
    const vc = stage3VCWithCommitment;
    
    // Check that TX hash commitment exists
    assert.exists(
      vc.credentialSubject.txHashCommitment,
      "VC should have txHashCommitment field"
    );
    
    const commitment = vc.credentialSubject.txHashCommitment;
    assert.exists(commitment.commitment, "Commitment should exist");
    assert.exists(commitment.proof, "Proof should exist");
    assert.equal(commitment.protocol, "bulletproofs-pedersen", "Protocol should match");
    assert.equal(commitment.version, "1.0", "Version should match");
    
    // Verify the commitment matches what we generated
    assert.equal(
      commitment.commitment,
      txHashCommitment.commitment,
      "Commitment should match generated commitment"
    );
  });

  it("should update on-chain CID to point to VC with TX hash commitment", async () => {
    const onChainCid = await escrow.vcCid();
    
    // On-chain CID should point to the VC with TX hash commitment
    assert.equal(
      onChainCid,
      stage3CidWithCommitment,
      "On-chain CID should point to VC with TX hash commitment"
    );
    
    // Fetch the VC from IPFS using on-chain CID
    const vcFromIpfs = await fetchFromIpfs(onChainCid);
    
    // Verify it has the TX hash commitment
    assert.exists(
      vcFromIpfs.credentialSubject.txHashCommitment,
      "VC from on-chain CID should have TX hash commitment"
    );
  });

  it("should verify TX hash commitment proof", async () => {
    const commitment = stage3VCWithCommitment.credentialSubject.txHashCommitment;
    
    // Verify the proof using the ZKP backend
    const verified = await verifyTxHashCommitment(
      commitment.commitment,
      commitment.proof
    );
    
    assert.isTrue(verified, "TX hash commitment proof should verify");
  });

  it("should allow buyer to update CID after delivery", async () => {
    // Try to update CID as buyer (should succeed)
    const newCid = "QmTestNewCid123456789";
    await escrow.updateVcCidAfterDelivery(newCid, { from: buyer });
    
    const updatedCid = await escrow.vcCid();
    assert.equal(updatedCid, newCid, "CID should be updated");
    
    // Restore original CID for other tests
    await escrow.updateVcCidAfterDelivery(stage3CidWithCommitment, { from: buyer });
  });

  it("should reject CID update from non-buyer", async () => {
    // Should revert because seller is not the buyer
    await truffleAssert.reverts(
      escrow.updateVcCidAfterDelivery("QmInvalid", { from: seller })
    );
  });

  it("should reject CID update before delivery", async () => {
    // Create a new product that hasn't been delivered
    const productName2 = "Pre-Delivery Test";
    const dummyCommitment2 = web3.utils.randomHex(32);
    const priceBN2 = web3.utils.toBN(TEST_PRICE_WEI);
    const tx2 = await factory.createProduct(productName2, dummyCommitment2, priceBN2, {
      from: seller,
    });
    const productAddress2 = tx2.logs.find((log) => log.event === "ProductCreated").args.product;
    const escrow2 = await ProductEscrow_Initializer.at(productAddress2);
    
    await escrow2.setPublicPriceWithCommitment(priceBN2, zkpProof.commitment, {
      from: seller,
    });
    await escrow2.purchasePublic({ from: buyer, value: priceBN2 });
    
    // Try to update CID before delivery (should fail)
    // Should revert because delivery hasn't been confirmed yet
    await truffleAssert.reverts(
      escrow2.updateVcCidAfterDelivery("QmInvalid", { from: buyer })
    );
  });

  it("should measure end-to-end TX hash commitment workflow", async () => {
    const times = {
      generateCommitment: [],
      updateVC: [],
      updateOnChainCid: [],
      verifyCommitment: [],
      fetchFromIpfs: [],
      total: [],
    };

    for (let i = 0; i < RUNS; i++) {
      const totalStart = performance.now();

      // 1. Generate TX hash commitment
      const genStart = performance.now();
      const testTxHash = web3.utils.randomHex(32);
      const commitment = await generateTxHashCommitment(testTxHash);
      times.generateCommitment.push(performance.now() - genStart);
      assert.isTrue(commitment.verified, "Commitment should verify");

      // 2. Update VC with commitment (simulate)
      const updateVCStart = performance.now();
      const testVC = JSON.parse(JSON.stringify(stage3VCWithCommitment));
      testVC.credentialSubject.txHashCommitment = {
        commitment: commitment.commitment,
        proof: commitment.proof,
        protocol: "bulletproofs-pedersen",
        version: "1.0",
        encoding: "hex",
      };
      times.updateVC.push(performance.now() - updateVCStart);

      // 3. Update on-chain CID (simulate - use a test CID)
      const updateCidStart = performance.now();
      const testCid = computeCid(testVC);
      // Note: We don't actually call the contract here to avoid state changes
      // In real scenario, this would be: await escrow.updateVcCidAfterDelivery(testCid, { from: buyer });
      times.updateOnChainCid.push(performance.now() - updateCidStart);

      // 4. Verify commitment
      const verifyStart = performance.now();
      const verified = await verifyTxHashCommitment(
        commitment.commitment,
        commitment.proof
      );
      times.verifyCommitment.push(performance.now() - verifyStart);
      assert.isTrue(verified, "Commitment should verify");

      // 5. Fetch from IPFS (simulate)
      const fetchStart = performance.now();
      // In real scenario: const vc = await fetchFromIpfs(testCid);
      times.fetchFromIpfs.push(performance.now() - fetchStart);

      times.total.push(performance.now() - totalStart);
    }

    const stats = Object.entries(times).reduce((acc, [key, values]) => {
      acc[key] = calculateStats(values);
      return acc;
    }, {});

    logStats(stats);
  });

  async function buildVerifiableCredentialChain() {
    const stage0 = await buildVC({
      stage: 0,
      previousCid: "",
      commitment: "0x0",
      includeProof: false,
    });
    const stage1 = await buildVC({
      stage: 1,
      previousCid: stage0.cid,
      commitment: "0x0",
      includeProof: false,
    });

    bindingContext.previousVCCid = stage1.cid;
    const bindingTag = computeBindingTag(
      bindingContext.chainId,
      bindingContext.escrowAddr,
      Number(bindingContext.productId),
      bindingContext.stage,
      bindingContext.schemaVersion,
      bindingContext.previousVCCid || null
    );
    zkpProof = await generateProof(TEST_PRICE_WEI, deterministicBlinding, bindingTag);
    if (!zkpProof.verified) {
      throw new Error("ZKP backend did not verify generated proof. Cannot proceed.");
    }

    const stage2 = await buildVC({
      stage: 2,
      previousCid: stage1.cid,
      commitment: zkpProof.commitment,
      includeProof: true,
      bindingTag,
    });

    return { stage0, stage1, stage2 };
  }

  async function buildStage3VC(stage2VC, includeTxHashCommitment) {
    const baseVc = {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      id: `urn:uuid:${productId}-3`,
      type: ["VerifiableCredential"],
      schemaVersion: SCHEMA_VERSION,
      issuer: {
        id: `did:ethr:${CHAIN_ID}:${ISSUER_WALLET.address.toLowerCase()}`,
        name: "Seller",
      },
      holder: {
        id: `did:ethr:${CHAIN_ID}:${HOLDER_WALLET.address.toLowerCase()}`,
        name: "Buyer",
      },
      issuanceDate: "2025-11-18T00:00:00.000Z",
      credentialSubject: {
        ...stage2VC.credentialSubject,
        previousCredential: stage2VC.credentialSubject?.previousCredential || stageVCs.stage2.cid,
      },
    };

    // Add TX hash commitment if requested
    if (includeTxHashCommitment && txHashCommitment) {
      baseVc.credentialSubject.txHashCommitment = {
        commitment: txHashCommitment.commitment,
        proof: txHashCommitment.proof,
        protocol: "bulletproofs-pedersen",
        version: "1.0",
        encoding: "hex",
      };
      // Keep transactionId for backward compatibility
      baseVc.credentialSubject.transactionId = deliveryTxHash;
    }

    const issuerProof = await signVc(baseVc, ISSUER_WALLET, "issuer");
    const holderProof = await signVc(baseVc, HOLDER_WALLET, "holder");
    baseVc.proof = [issuerProof, holderProof];

    return baseVc;
  }

  async function buildVC({ stage, previousCid, commitment, includeProof, bindingTag = null }) {
    const baseVc = {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      id: `urn:uuid:${productId}-${stage}`,
      type: ["VerifiableCredential"],
      schemaVersion: SCHEMA_VERSION,
      issuer: {
        id: `did:ethr:${CHAIN_ID}:${ISSUER_WALLET.address.toLowerCase()}`,
        name: "Seller",
      },
      holder: {
        id: `did:ethr:${CHAIN_ID}:${HOLDER_WALLET.address.toLowerCase()}`,
        name: "Buyer",
      },
      issuanceDate: "2025-11-18T00:00:00.000Z",
      credentialSubject: {
        id: `did:ethr:${CHAIN_ID}:${HOLDER_WALLET.address.toLowerCase()}`,
        productName: "TX Hash Commitment Test Battery",
        batch: `BATCH-${stage}`,
        quantity: 1,
        previousCredential: previousCid || "",
        componentCredentials: [],
        certificateCredential: {
          name: "",
          cid: "",
        },
        price:
          includeProof
            ? JSON.stringify({
                hidden: true,
                zkpProof: {
                  commitment,
                  proof: zkpProof.proof,
                  protocol: "bulletproofs-pedersen",
                  proofType: "zkRangeProof-v1",
                  bindingTag,
                  bindingContext: {
                    chainId: bindingContext.chainId,
                    escrowAddr: bindingContext.escrowAddr,
                    productId: bindingContext.productId,
                    stage: bindingContext.stage,
                    schemaVersion: bindingContext.schemaVersion,
                    previousVCCid: previousCid || "",
                  },
                },
              })
            : JSON.stringify({ hidden: true }),
      },
    };

    const issuerProof = await signVc(baseVc, ISSUER_WALLET, "issuer");
    const holderProof = await signVc(baseVc, HOLDER_WALLET, "holder");
    baseVc.proof = [issuerProof, holderProof];

    const cid = computeCid(baseVc);
    return { cid, vc: baseVc };
  }

  async function fetchFromIpfs(cid) {
    if (!ipfsStore.has(cid)) {
      throw new Error(`CID ${cid} not found in mock IPFS store`);
    }
    return JSON.parse(JSON.stringify(ipfsStore.get(cid)));
  }

  function calculateStats(values) {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      values.length;
    const stdDev = Math.sqrt(variance);
    return { mean, min, max, stdDev };
  }

  function logStats(stats) {
    console.log("\n=== TX Hash Commitment Workflow Timing (ms) ===");
    Object.entries(stats).forEach(([step, data]) => {
      console.log(
        `${step}: mean=${data.mean.toFixed(2)} ms | min=${data.min.toFixed(
          2
        )} ms | max=${data.max.toFixed(2)} ms | std=${data.stdDev.toFixed(2)} ms`
      );
    });
    console.log("===============================================\n");
  }

  function stableStringify(value) {
    if (value === null || typeof value !== "object") {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    }
    const keys = Object.keys(value).sort();
    const entries = keys.map(
      (key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`
    );
    return `{${entries.join(",")}}`;
  }

  function computeCid(vc) {
    const serialized = stableStringify(vc);
    const hash = web3.utils.keccak256(serialized);
    return "Qm" + hash.slice(2, 34);
  }

  function prepareVcPayload(vc) {
    const clone = JSON.parse(JSON.stringify(vc));
    delete clone.proof;
    if (clone.credentialSubject?.transactionId !== undefined) {
      delete clone.credentialSubject.transactionId;
    }
    if (clone.credentialSubject?.txHashCommitment !== undefined) {
      delete clone.credentialSubject.txHashCommitment;
    }
    if (clone.credentialSubject?.vcHash) {
      delete clone.credentialSubject.vcHash;
    }
    if (
      clone.credentialSubject?.price &&
      typeof clone.credentialSubject.price !== "string"
    ) {
      clone.credentialSubject.price = JSON.stringify(
        clone.credentialSubject.price
      );
    }
    if (!clone.credentialSubject.certificateCredential) {
      clone.credentialSubject.certificateCredential = { name: "", cid: "" };
    }
    if (!Array.isArray(clone.credentialSubject.componentCredentials)) {
      clone.credentialSubject.componentCredentials = [];
    }
    if (
      clone.credentialSubject.previousCredential === null ||
      clone.credentialSubject.previousCredential === undefined
    ) {
      clone.credentialSubject.previousCredential = "";
    }
    clone.issuer.id = clone.issuer.id.toLowerCase();
    clone.holder.id = clone.holder.id.toLowerCase();
    clone.credentialSubject.id = clone.credentialSubject.id.toLowerCase();
    return clone;
  }

  async function signVc(vc, wallet, role) {
    const payload = prepareVcPayload(vc);
    const domain = {
      name: "VC",
      version: "1.0",
      chainId: CHAIN_ID,
      verifyingContract:
        bindingContext?.escrowAddr ||
        "0x0000000000000000000000000000000000000000",
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
    const payloadHash = TypedDataEncoder.hash(domain, types, payload);
    return {
      type: "EcdsaSecp256k1Signature2019",
      created: "2025-11-18T00:00:00.000Z",
      proofPurpose: "assertionMethod",
      verificationMethod: `did:ethr:${CHAIN_ID}:${wallet.address.toLowerCase()}`,
      jws: signature,
      payloadHash,
      role,
    };
  }
});

function computeBlinding(escrowAddr, ownerAddr) {
  // Match contract's keccak256(abi.encodePacked(address(this), owner))
  // Use soliditySha3 which matches abi.encodePacked behavior
  return web3.utils.soliditySha3(
    { type: "address", value: escrowAddr },
    { type: "address", value: ownerAddr }
  );
}

function computeBindingTag(
  chainId,
  escrowAddr,
  productId,
  stage,
  schemaVersion,
  previousVCCid = null
) {
  const escrowBytes = Buffer.from(escrowAddr.replace("0x", ""), "hex");
  const productIdBuffer = Buffer.allocUnsafe(8);
  productIdBuffer.writeUInt32LE(productId, 0);
  productIdBuffer.writeUInt32LE(0, 4);
  const stageBuffer = Buffer.from([stage]);
  const parts = [
    Buffer.from(String(chainId), "utf8"),
    escrowBytes,
    productIdBuffer,
    stageBuffer,
    Buffer.from(schemaVersion, "utf8"),
  ];
  if (previousVCCid) {
    parts.push(Buffer.from(previousVCCid, "utf8"));
  }
  const concatenated = Buffer.concat(parts);
  const hash = crypto.createHash("sha256").update(concatenated).digest();
  return "0x" + hash.toString("hex");
}

async function generateProof(value, blindingHex, bindingTagHex) {
  try {
    const response = await axios.post(
      `${ZKP_BACKEND}/zkp/generate-value-commitment-with-binding`,
      {
        value,
        blinding_hex: blindingHex.replace("0x", ""),
        binding_tag_hex: bindingTagHex.replace("0x", ""),
      },
      { timeout: 15000 }
    );
    return {
      commitment: "0x" + response.data.commitment,
      proof: "0x" + response.data.proof,
      verified: response.data.verified,
    };
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      throw new Error(
        `ZKP backend not running. Please start it with: cd zkp-backend && cargo run (Error: ${error.message})`
      );
    }
    const extra = error.response ? ` | payload: ${JSON.stringify(error.response.data)}` : "";
    throw new Error(`ZKP backend error: ${error.message}${extra}`);
  }
}

async function generateTxHashCommitment(txHash) {
  try {
    const response = await axios.post(
      `${ZKP_BACKEND}/zkp/commit-tx-hash`,
      {
        tx_hash: txHash,
      },
      { timeout: 15000 }
    );
    return {
      commitment: response.data.commitment,
      proof: response.data.proof,
      verified: response.data.verified,
    };
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      throw new Error(
        `ZKP backend not running. Please start it with: cd zkp-backend && cargo run (Error: ${error.message})`
      );
    }
    const extra = error.response ? ` | payload: ${JSON.stringify(error.response.data)}` : "";
    throw new Error(`ZKP backend error: ${error.message}${extra}`);
  }
}

async function verifyTxHashCommitment(commitmentHex, proofHex) {
  try {
    const response = await axios.post(
      `${ZKP_BACKEND}/zkp/verify`,
      {
        commitment: commitmentHex.replace("0x", ""),
        proof: proofHex.replace("0x", ""),
      },
      { timeout: 10000 }
    );
    return response.data.verified;
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      throw new Error(
        `ZKP backend not running. Please start it with: cd zkp-backend && cargo run (Error: ${error.message})`
      );
    }
    const extra = error.response ? ` | payload: ${JSON.stringify(error.response.data)}` : "";
    throw new Error(`ZKP backend error: ${error.message}${extra}`);
  }
}

