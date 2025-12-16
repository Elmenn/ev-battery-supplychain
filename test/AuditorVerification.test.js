const ProductFactory = artifacts.require("ProductFactory");
const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const { assert } = require("chai");
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
const AUDITOR_PRICE_WEI = 1_000_000; // keep small for ZKP backend (u64) & manageable deposits

// Deterministic signer wallets for VC issuance/holding
const ISSUER_WALLET = new ethers.Wallet(
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
);
const HOLDER_WALLET = new ethers.Wallet(
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
);

contract("Auditor Verification Workflow", (accounts) => {
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

  before(async () => {
    implementation = await ProductEscrow_Initializer.new();
    factory = await ProductFactory.new(implementation.address);

    // Deploy product via factory
    const productName = "Auditor Test Battery";
    const dummyCommitment = web3.utils.randomHex(32);
    const priceBN = web3.utils.toBN(AUDITOR_PRICE_WEI);
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

    // Set public price with actual Bulletproof commitment (now available)
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
    // Use confirmOrderWithCommitment with zero commitment (no purchase commitment in this test)
    const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
    await escrow.confirmOrderWithCommitment(stageVCs.stage1.cid, zeroCommitment, { from: seller });
    await escrow.updateVcCid(stageVCs.stage2.cid, { from: seller });
  });

  it("should measure end-to-end verification time", async () => {
    const times = {
      onChainRead: [],
      eventQueries: [], // Purchase and delivery transaction verification events
      ipfsFetch: [],
      signatureVerify: [],
      extractData: [],
      computeBindingTag: [],
      verifyZKP: [],
      traverseChain: [],
      total: [],
    };

    for (let i = 0; i < RUNS; i++) {
      const totalStart = performance.now();

      // 1. Read on-chain state
      const onChainStart = performance.now();
      const onChainCommitment = await escrow.publicPriceCommitment();
      const onChainVcCid = await escrow.vcCid();
      const onChainOwner = await escrow.owner();
      times.onChainRead.push(performance.now() - onChainStart);
      assert.equal(onChainVcCid, stageVCs.stage2.cid, "On-chain CID should match Stage 2 VC");
      assert.equal(onChainCommitment, zkpProof.commitment, "On-chain commitment should match proof commitment");
      assert.equal(onChainOwner.toLowerCase(), seller.toLowerCase(), "Seller remains owner until delivery is finalized");

      // 1b. Query transaction verification events (PurchaseConfirmedWithCommitment and DeliveryConfirmedWithCommitment)
      const eventStart = performance.now();
      // Note: In this test, we don't have purchase/delivery commitments, so events may not exist
      // But we still measure the query time
      try {
        const purchaseEvents = await escrow.getPastEvents("PurchaseConfirmedWithCommitment", {
          filter: { productId: productId },
          fromBlock: 0,
          toBlock: "latest",
        });
        const deliveryEvents = await escrow.getPastEvents("DeliveryConfirmedWithCommitment", {
          filter: { productId: productId },
          fromBlock: 0,
          toBlock: "latest",
        });
        // Events may be empty if no commitments were provided, but we still measure query time
      } catch (error) {
        // Event queries may fail if events don't exist, but timing is still measured
      }
      times.eventQueries.push(performance.now() - eventStart);

      // 2. Fetch Stage 2 VC from "IPFS"
      const ipfsStart = performance.now();
      const latestVC = await fetchFromIpfs(onChainVcCid);
      times.ipfsFetch.push(performance.now() - ipfsStart);

      // 3. Verify EIP-712 signatures (issuer + holder)
      const signatureStart = performance.now();
      const sigResult = await verifyVC(latestVC, false, productAddress);
      assert.isTrue(sigResult.issuer?.signature_verified, "Issuer signature should verify");
      assert.isTrue(sigResult.holder?.signature_verified, "Holder signature should verify");
      times.signatureVerify.push(performance.now() - signatureStart);

      // 4. Extract commitment and proof data
      const extractStart = performance.now();
      const priceData = JSON.parse(latestVC.credentialSubject.price);
      const proofPayload = priceData.zkpProof;
      times.extractData.push(performance.now() - extractStart);

      // 5. Recompute binding tag
      const bindingStart = performance.now();
      const recomputedBindingTag = computeBindingTag(
        proofPayload.bindingContext.chainId,
        proofPayload.bindingContext.escrowAddr,
        Number(proofPayload.bindingContext.productId),
        proofPayload.bindingContext.stage,
        proofPayload.bindingContext.schemaVersion,
        proofPayload.bindingContext.previousVCCid || null
      );
      times.computeBindingTag.push(performance.now() - bindingStart);

      // 6. Verify ZKP proof via backend
      const zkpStart = performance.now();
      const zkpVerified = await verifyProof(
        proofPayload.commitment,
        proofPayload.proof,
        recomputedBindingTag
      );
      assert.isTrue(zkpVerified, "ZKP verification should succeed");
      times.verifyZKP.push(performance.now() - zkpStart);

      // 7. Traverse previousCredential chain (S2 -> S1 -> S0)
      const traverseStart = performance.now();
      const chain = await traverseChain(latestVC);
      assert.equal(chain.length, 3, "Chain traversal should cover 3 VCs");
      times.traverseChain.push(performance.now() - traverseStart);

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
    zkpProof = await generateProof(AUDITOR_PRICE_WEI, deterministicBlinding, bindingTag);
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
        productName: "Auditor Test Battery",
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

  async function traverseChain(latestVC) {
    const chain = [];
    let current = latestVC;
    while (current) {
      chain.push(current);
      const prevCid = current.credentialSubject.previousCredential;
      if (!prevCid) break;
      current = await fetchFromIpfs(prevCid);
    }
    return chain;
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
    console.log("\n=== Auditor Verification Timing (ms) ===");
    Object.entries(stats).forEach(([step, data]) => {
      console.log(
        `${step}: mean=${data.mean.toFixed(2)} ms | min=${data.min.toFixed(
          2
        )} ms | max=${data.max.toFixed(2)} ms | std=${data.stdDev.toFixed(2)} ms`
      );
    });
    console.log("========================================\n");
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
  const encoded = web3.eth.abi.encodeParameters(
    ["address", "address"],
    [escrowAddr, ownerAddr]
  );
  return web3.utils.keccak256(encoded);
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

async function verifyProof(commitmentHex, proofHex, bindingTagHex) {
  try {
    const response = await axios.post(
      `${ZKP_BACKEND}/zkp/verify-value-commitment`,
      {
        commitment: commitmentHex.replace("0x", ""),
        proof: proofHex.replace("0x", ""),
        binding_tag_hex: bindingTagHex.replace("0x", ""),
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

