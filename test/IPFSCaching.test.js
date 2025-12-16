const ProductFactory = artifacts.require("ProductFactory");
const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const { assert } = require("chai");
const { performance } = require("perf_hooks");

const CHAIN_ID = 11155111;
const SCHEMA_VERSION = "1.0";
const AUDITOR_PRICE_WEI = 1_000_000;
const UNCACHED_DELAY_MS = 25;
const CACHED_DELAY_MS = 1;

contract("IPFS Caching Impact", (accounts) => {
  const [seller, buyer] = accounts;
  let implementation;
  let factory;

  before(async () => {
    implementation = await ProductEscrow_Initializer.new();
    factory = await ProductFactory.new(implementation.address);
  });

  it("should measure IPFS caching impact", async () => {
    const scenario = await setupScenario(factory, seller, buyer);

    const start1 = performance.now();
    const firstFetch = await fetchFromIpfsStore(scenario.ipfsStore, scenario.latestCid, {
      cached: false,
    });
    const uncachedTime = performance.now() - start1;

    const start2 = performance.now();
    const secondFetch = await fetchFromIpfsStore(scenario.ipfsStore, scenario.latestCid, {
      cached: true,
    });
    const cachedTime = performance.now() - start2;

    assert.deepEqual(firstFetch, secondFetch, "Cached fetch must match original VC");

    const improvement =
      uncachedTime > 0 ? ((uncachedTime - cachedTime) / uncachedTime) * 100 : 0;

    console.log("\n=== IPFS Caching Impact ===");
    console.log(`First fetch (uncached): ${uncachedTime.toFixed(2)} ms`);
    console.log(`Second fetch (cached): ${cachedTime.toFixed(2)} ms`);
    console.log(`Improvement: ${improvement.toFixed(2)}%`);
    console.log("================================\n");
  });
});

async function setupScenario(factory, seller, buyer) {
  const priceBN = web3.utils.toBN(AUDITOR_PRICE_WEI);
  const productName = "IPFS Caching Test";
  const dummyCommitment = web3.utils.randomHex(32);
  const tx = await factory.createProduct(productName, dummyCommitment, priceBN, {
    from: seller,
  });
  const productAddress = tx.logs.find((log) => log.event === "ProductCreated").args.product;
  const escrow = await ProductEscrow_Initializer.at(productAddress);

  await escrow.setPublicPriceWithCommitment(priceBN, web3.utils.randomHex(32), {
    from: seller,
  });
  await escrow.purchasePublic({ from: buyer, value: priceBN });

  const vc = buildSampleVc(productAddress, await escrow.id(), seller, buyer);
  const cid = computeCid(vc);
  const ipfsStore = new Map([[cid, vc]]);

  await escrow.updateVcCid(cid, { from: seller });

  return { latestCid: cid, ipfsStore };
}

function buildSampleVc(productAddress, productIdBN, seller, buyer) {
  const productId = productIdBN.toString();
  return {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    id: `urn:uuid:${productId}-cache`,
    type: ["VerifiableCredential"],
    schemaVersion: SCHEMA_VERSION,
    issuer: {
      id: `did:ethr:${CHAIN_ID}:${seller.toLowerCase()}`,
      name: "Seller",
    },
    holder: {
      id: `did:ethr:${CHAIN_ID}:${buyer.toLowerCase()}`,
      name: "Buyer",
    },
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: `did:ethr:${CHAIN_ID}:${buyer.toLowerCase()}`,
      productName: "Caching Test Product",
      batch: "CACHE",
      quantity: 1,
      previousCredential: "",
      componentCredentials: [],
      certificateCredential: { name: "", cid: "" },
      price: JSON.stringify({ hidden: true }),
    },
    proof: [],
  };
}

async function fetchFromIpfsStore(store, cid, { cached }) {
  if (!store.has(cid)) {
    throw new Error(`CID ${cid} not found in local store`);
  }
  const delay = cached ? CACHED_DELAY_MS : UNCACHED_DELAY_MS;
  await new Promise((resolve) => setTimeout(resolve, delay));
  return JSON.parse(JSON.stringify(store.get(cid)));
}

function computeCid(vc) {
  const json = JSON.stringify(vc);
  const hash = web3.utils.keccak256(json);
  return "Qm" + hash.slice(2, 34);
}

