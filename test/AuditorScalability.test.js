const ProductFactory = artifacts.require("ProductFactory");
const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const { assert } = require("chai");
const axios = require("axios");
const crypto = require("crypto");
const { performance } = require("perf_hooks");
const { ethers, TypedDataEncoder } = require("ethers");
const { verifyVC } = require("../backend/api/verifyVC");

const CHAIN_ID = 11155111;
const SCHEMA_VERSION = "1.0";
const ZKP_BACKEND = process.env.ZKP_BACKEND || "http://127.0.0.1:5010";
const AUDITOR_PRICE_WEI = 1_000_000;
const RUNS = 3;
const CHAIN_LENGTHS = [1, 5, 10];

const ISSUER_WALLET = new ethers.Wallet(
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
);
const HOLDER_WALLET = new ethers.Wallet(
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
);

contract("Auditor Scalability Analysis", (accounts) => {
  const [seller, buyer] = accounts;
  let implementation;
  let factory;

  before(async () => {
    implementation = await ProductEscrow_Initializer.new();
    factory = await ProductFactory.new(implementation.address);
  });

  it("should measure verification time vs chain length", async () => {
    const results = [];

    for (const length of CHAIN_LENGTHS) {
      const scenario = await setupScenario(length);
      const totalTimes = [];

      for (let i = 0; i < RUNS; i++) {
        const start = performance.now();
        await performVerification(scenario);
        totalTimes.push(performance.now() - start);
      }

      const stats = calculateStats(totalTimes);
      results.push({
        length,
        stats,
        perVc: stats.mean / length,
      });
    }

    logResults(results);
  });

  async function setupScenario(chainLength) {
    const priceBN = web3.utils.toBN(AUDITOR_PRICE_WEI);
    const productName = `Auditor Scalability Chain ${chainLength}`;
    const dummyCommitment = web3.utils.randomHex(32);
    const tx = await factory.createProduct(productName, dummyCommitment, priceBN, {
      from: seller,
    });
    const productAddress = tx.logs.find((log) => log.event === "ProductCreated").args.product;
    const escrow = await ProductEscrow_Initializer.at(productAddress);
    const productId = (await escrow.id()).toString();
    const deterministicBlinding = computeBlinding(productAddress, seller);

    const chain = await buildVerifiableCredentialChain({
      chainLength,
      productAddress,
      productId,
      deterministicBlinding,
    });

    await escrow.setPublicPriceWithCommitment(priceBN, chain.zkpProof.commitment, {
      from: seller,
    });
    await escrow.purchasePublic({ from: buyer, value: priceBN });

    if (chainLength > 1) {
      const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
      await escrow.confirmOrderWithCommitment(chain.stageEntries[chainLength - 2].cid, zeroCommitment, { from: seller });
    }
    await escrow.updateVcCid(chain.latestCid, { from: seller });

    return {
      escrow,
      productAddress,
      latestCid: chain.latestCid,
      ipfsStore: chain.ipfsStore,
      bindingContext: chain.bindingContext,
      deterministicBlinding,
      chainLength,
    };
  }

  async function performVerification({
    escrow,
    productAddress,
    latestCid,
    ipfsStore,
    bindingContext,
    deterministicBlinding,
    chainLength,
  }) {
    const onChainCommitment = await escrow.publicPriceCommitment();
    const onChainCid = await escrow.vcCid();
    assert.equal(onChainCid, latestCid, "On-chain CID must match latest VC");

    const finalVC = await fetchFromIpfs(ipfsStore, latestCid);
    const sigResult = await verifyVC(finalVC, false, productAddress);
    assert.isTrue(sigResult.issuer?.signature_verified, "Issuer signature must verify");
    assert.isTrue(sigResult.holder?.signature_verified, "Holder signature must verify");

    const priceData = JSON.parse(finalVC.credentialSubject.price);
    const proofPayload = priceData.zkpProof;

    const recomputedBindingTag = computeBindingTag(
      proofPayload.bindingContext.chainId,
      proofPayload.bindingContext.escrowAddr,
      Number(proofPayload.bindingContext.productId),
      proofPayload.bindingContext.stage,
      proofPayload.bindingContext.schemaVersion,
      proofPayload.bindingContext.previousVCCid || null
    );

    const zkpVerified = await verifyProof(
      proofPayload.commitment,
      proofPayload.proof,
      recomputedBindingTag
    );
    assert.isTrue(zkpVerified, "ZKP verification must succeed");
    assert.equal(
      proofPayload.commitment.toLowerCase(),
      onChainCommitment.toLowerCase(),
      "Commitment must match on-chain value"
    );

    const chain = await traverseChain(ipfsStore, finalVC);
    assert.equal(chain.length, chainLength, "Chain traversal must match expected length");
  }
});

async function buildVerifiableCredentialChain({
  chainLength,
  productAddress,
  productId,
  deterministicBlinding,
}) {
  const stageEntries = [];
  let previousCid = "";

  for (let stage = 0; stage < chainLength - 1; stage++) {
    const entry = await buildVC({
      stage,
      previousCid,
      includeProof: false,
      productAddress,
      productId,
    });
    stageEntries.push(entry);
    previousCid = entry.cid;
  }

  const bindingContext = {
    chainId: CHAIN_ID.toString(),
    escrowAddr: productAddress,
    productId,
    stage: chainLength - 1,
    schemaVersion: SCHEMA_VERSION,
    previousVCCid: previousCid || "",
  };

  const bindingTag = computeBindingTag(
    bindingContext.chainId,
    bindingContext.escrowAddr,
    Number(bindingContext.productId),
    bindingContext.stage,
    bindingContext.schemaVersion,
    bindingContext.previousVCCid || null
  );
  const zkpProof = await generateProof(AUDITOR_PRICE_WEI, deterministicBlinding, bindingTag);
  if (!zkpProof.verified) {
    throw new Error("ZKP backend did not verify generated proof");
  }

  const finalEntry = await buildVC({
    stage: chainLength - 1,
    previousCid,
    includeProof: true,
    bindingTag,
    commitment: zkpProof.commitment,
    proof: zkpProof.proof,
    productAddress,
    productId,
  });
  stageEntries.push(finalEntry);

  const ipfsStore = new Map(stageEntries.map((entry) => [entry.cid, entry.vc]));
  return { stageEntries, ipfsStore, latestCid: finalEntry.cid, zkpProof, bindingContext };
}

async function buildVC({
  stage,
  previousCid,
  includeProof,
  bindingTag = null,
  commitment = null,
  proof = null,
  productAddress,
  productId,
}) {
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
      productName: "Auditor Scalability Product",
      batch: `CHAIN-${stage}`,
      quantity: 1,
      previousCredential: previousCid || "",
      componentCredentials: [],
      certificateCredential: { name: "", cid: "" },
      price: includeProof
        ? JSON.stringify({
            hidden: true,
            zkpProof: {
              commitment,
              proof,
              protocol: "bulletproofs-pedersen",
              proofType: "zkRangeProof-v1",
              bindingTag,
              bindingContext: {
                chainId: CHAIN_ID.toString(),
                escrowAddr: productAddress,
                productId,
                stage,
                schemaVersion: SCHEMA_VERSION,
                previousVCCid: previousCid || "",
              },
            },
          })
        : JSON.stringify({ hidden: true }),
    },
  };

  const issuerProof = await signVc(baseVc, ISSUER_WALLET, productAddress, "issuer");
  const holderProof = await signVc(baseVc, HOLDER_WALLET, productAddress, "holder");
  baseVc.proof = [issuerProof, holderProof];

  const cid = computeCid(baseVc);
  return { vc: baseVc, cid, stage };
}

async function fetchFromIpfs(store, cid) {
  if (!store.has(cid)) {
    throw new Error(`CID ${cid} not found in store`);
  }
  return JSON.parse(JSON.stringify(store.get(cid)));
}

async function traverseChain(store, lastVC) {
  const chain = [];
  let current = lastVC;
  while (current) {
    chain.push(current);
    const prev = current.credentialSubject.previousCredential;
    if (!prev) break;
    current = await fetchFromIpfs(store, prev);
  }
  return chain;
}

function calculateStats(values) {
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  return { mean, min, max, stdDev };
}

function logResults(results) {
  console.log("\n=== Auditor Scalability Results ===");
  results.forEach(({ length, stats, perVc }) => {
    console.log(
      `${length} VCs: mean=${stats.mean.toFixed(2)} ms | min=${stats.min.toFixed(
        2
      )} ms | max=${stats.max.toFixed(2)} ms | std=${stats.stdDev.toFixed(2)} ms | per VC=${perVc.toFixed(2)} ms`
    );
  });
  console.log("===================================\n");
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
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
  if (clone.credentialSubject?.price && typeof clone.credentialSubject.price !== "string") {
    clone.credentialSubject.price = JSON.stringify(clone.credentialSubject.price);
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

async function signVc(vc, wallet, productAddress, role) {
  const payload = prepareVcPayload(vc);
  const domain = {
    name: "VC",
    version: "1.0",
    chainId: CHAIN_ID,
    verifyingContract: productAddress,
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

function computeBlinding(escrowAddr, ownerAddr) {
  const encoded = web3.eth.abi.encodeParameters(["address", "address"], [escrowAddr, ownerAddr]);
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

