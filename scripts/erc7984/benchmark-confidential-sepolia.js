require("dotenv").config({ path: ".env.truffle" });
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const CONFIG_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "frontend",
  "public",
  "erc7984-sepolia-latest.json"
);

const WETH_ABI = [
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
];

const WRAPPER_ABI = [
  "function deposit(uint256 amount) returns (uint64 mintedAmount)",
];

const CONFIDENTIAL_TOKEN_ABI = [
  "function confidentialTransferAndCall(address to, bytes32 handle, bytes inputProof, bytes data)",
];

const FACTORY_ABI = [
  "function createProductConfidentialV1(string name, uint64 unitPrice, bytes32 unitPriceHash, address paymentToken) returns (address product)",
  "event ProductCreatedConfidential(address indexed product, address indexed seller, uint256 indexed productId, address paymentToken, uint64 unitPrice, bytes32 unitPriceHash)",
];

const DEPOSIT_KIND_BUYER_PURCHASE = 0;
const DEPOSIT_KIND_SELLER_BOND = 1;
const EQUALITY_TARGET_SELLER_BOND = 0;

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function getEnvInt(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer. Received: ${raw}`);
  }
  return value;
}

function getEnvBigInt(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") {
    return BigInt(fallback);
  }
  if (!/^\d+$/.test(raw.trim())) {
    throw new Error(`${name} must be a positive integer string. Received: ${raw}`);
  }
  const value = BigInt(raw);
  if (value <= 0n) {
    throw new Error(`${name} must be greater than zero.`);
  }
  return value;
}

function getOptionalAddress(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") {
    return fallback;
  }
  if (!hre.ethers.isAddress(raw)) {
    throw new Error(`${name} must be a valid address. Received: ${raw}`);
  }
  return hre.ethers.getAddress(raw);
}

function avg(numbers) {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function getCreatedProductAddress(factory, receipt) {
  const createdEvent = receipt.logs
    .map((log) => {
      try {
        return factory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((log) => log && log.name === "ProductCreatedConfidential");

  if (!createdEvent) {
    throw new Error("ProductCreatedConfidential event not found.");
  }

  return createdEvent.args.product;
}

async function getSignerByAddress(targetAddress) {
  const signers = await hre.ethers.getSigners();
  const normalized = hre.ethers.getAddress(targetAddress).toLowerCase();
  const signer = signers.find((entry) => entry.address.toLowerCase() === normalized);
  if (!signer) {
    throw new Error(`Signer ${targetAddress} not found in local Hardhat accounts.`);
  }
  return signer;
}

async function ensureAllowance(token, ownerSigner, spender, minimum) {
  const allowance = await token.allowance(ownerSigner.address, spender);
  if (allowance >= minimum) {
    return null;
  }

  const tx = await token.connect(ownerSigner).approve(spender, hre.ethers.MaxUint256);
  return tx.wait();
}

async function measureTx(step, sendTx) {
  const submittedAt = Date.now();
  const tx = await sendTx();
  const receipt = await tx.wait();
  const confirmedAt = Date.now();
  const effectiveGasPrice = receipt.gasPrice ?? tx.gasPrice ?? 0n;
  const feeWei = receipt.gasUsed * effectiveGasPrice;

  return {
    step,
    hash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    feeEth: hre.ethers.formatEther(feeWei),
    gasPriceGwei: hre.ethers.formatUnits(effectiveGasPrice, "gwei"),
    latencyMs: confirmedAt - submittedAt,
  };
}

async function depositWithCallback({ token, sender, recipient, value, orderId, kind }) {
  const tokenAddress = await token.getAddress();
  const input = hre.fhevm.createEncryptedInput(tokenAddress, sender.address);
  input.add64(value);
  const encrypted = await input.encrypt();
  const payload = hre.ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "uint8"], [orderId, kind]);

  return token
    .connect(sender)
    ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
      recipient,
      encrypted.handles[0],
      encrypted.inputProof,
      payload
    );
}

async function main() {
  await hre.fhevm.initializeCLIApi();

  const config = loadConfig();
  const runs = getEnvInt("ERC7984_CONF_BENCH_RUNS", 2);
  const amountWei = getEnvBigInt("ERC7984_CONF_BENCH_AMOUNT_WEI", "400000000000000");
  const sellerAddress = getOptionalAddress("ERC7984_CONF_BENCH_SELLER", config.seller);
  const buyerAddress = getOptionalAddress("ERC7984_CONF_BENCH_BUYER", config.buyer);

  const seller = await getSignerByAddress(sellerAddress);
  const buyer = await getSignerByAddress(buyerAddress);

  const weth = new hre.ethers.Contract(config.publicToken, WETH_ABI, hre.ethers.provider);
  const wrapper = new hre.ethers.Contract(config.fundingWrapper, WRAPPER_ABI, hre.ethers.provider);
  const token = new hre.ethers.Contract(config.confidentialToken, CONFIDENTIAL_TOKEN_ABI, hre.ethers.provider);
  const factory = new hre.ethers.Contract(config.factory, FACTORY_ABI, hre.ethers.provider);

  const totalBuyerNeeded = amountWei * BigInt(runs);
  const totalSellerNeeded = amountWei * BigInt(runs);
  const buyerWeth = await weth.balanceOf(buyer.address);
  const sellerWeth = await weth.balanceOf(seller.address);

  if (buyerWeth < totalBuyerNeeded) {
    throw new Error(`Buyer lacks WETH for benchmark. Need ${totalBuyerNeeded}, have ${buyerWeth}.`);
  }
  if (sellerWeth < totalSellerNeeded) {
    throw new Error(`Seller lacks WETH for benchmark. Need ${totalSellerNeeded}, have ${sellerWeth}.`);
  }

  await ensureAllowance(weth, buyer, config.fundingWrapper, totalBuyerNeeded);
  await ensureAllowance(weth, seller, config.fundingWrapper, totalSellerNeeded);

  const rows = [];

  for (let index = 1; index <= runs; index += 1) {
    const productName = `Latency Bench ${Date.now()} #${index}`;
    const orderId = hre.ethers.keccak256(
      hre.ethers.toUtf8Bytes(`latency-bench-order-${Date.now()}-${index}`)
    );
    const unitPriceHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(amountWei.toString()));

    const createRow = await measureTx(`confidential_create_product_run_${index}`, () =>
      factory.connect(seller).createProductConfidentialV1(
        productName,
        amountWei,
        unitPriceHash,
        config.confidentialToken
      )
    );
    rows.push(createRow);

    const createReceipt = await hre.ethers.provider.getTransactionReceipt(createRow.hash);
    const productAddress = getCreatedProductAddress(factory, createReceipt);
    const escrow = await hre.ethers.getContractAt(
      "ProductEscrowConfidential_Initializer",
      productAddress,
      seller
    );

    rows.push(
      await measureTx(`confidential_buyer_private_deposit_run_${index}`, () =>
        wrapper.connect(buyer).deposit(amountWei)
      )
    );

    rows.push(
      await measureTx(`confidential_buyer_purchase_run_${index}`, () =>
        depositWithCallback({
          token,
          sender: buyer,
          recipient: productAddress,
          value: amountWei,
          orderId,
          kind: DEPOSIT_KIND_BUYER_PURCHASE,
        })
      )
    );

    rows.push(
      await measureTx(`confidential_seller_private_deposit_run_${index}`, () =>
        wrapper.connect(seller).deposit(amountWei)
      )
    );

    rows.push(
      await measureTx(`confidential_seller_bond_run_${index}`, () =>
        depositWithCallback({
          token,
          sender: seller,
          recipient: productAddress,
          value: amountWei,
          orderId,
          kind: DEPOSIT_KIND_SELLER_BOND,
        })
      )
    );

    const attestation = await escrow.getSellerBondEqualityAttestation();
    const decrypted = await hre.fhevm.publicDecrypt([attestation.handle]);

    rows.push(
      await measureTx(`confidential_seller_finalize_equality_run_${index}`, () =>
        escrow.finalizeEqualityAttestation(
          orderId,
          EQUALITY_TARGET_SELLER_BOND,
          decrypted.abiEncodedClearValues,
          decrypted.decryptionProof
        )
      )
    );
  }

  const groups = [
    ["create_product", "confidential_create_product_run_"],
    ["buyer_private_deposit", "confidential_buyer_private_deposit_run_"],
    ["buyer_purchase", "confidential_buyer_purchase_run_"],
    ["seller_private_deposit", "confidential_seller_private_deposit_run_"],
    ["seller_bond", "confidential_seller_bond_run_"],
    ["seller_finalize_equality", "confidential_seller_finalize_equality_run_"],
  ];

  const summary = groups.map(([label, prefix]) => {
    const group = rows.filter((row) => row.step.startsWith(prefix));
    return {
      step: label,
      runs: group.length,
      avgGasUsed: avg(group.map((row) => Number(row.gasUsed))).toFixed(0),
      avgFeeEth: avg(group.map((row) => Number(row.feeEth))).toFixed(9),
      avgLatencyMs: avg(group.map((row) => row.latencyMs)).toFixed(0),
    };
  });

  console.log("");
  console.log(`Confidential benchmark amount per run: ${hre.ethers.formatEther(amountWei)} WETH`);
  console.log(`Runs per action                : ${runs}`);
  console.log("");
  console.table(
    rows.map((row) => ({
      step: row.step,
      gasUsed: row.gasUsed,
      feeETH: row.feeEth,
      latencyMs: row.latencyMs,
      block: row.blockNumber,
    }))
  );
  console.log("Averages:");
  console.table(summary);
  console.log("Detailed rows:");
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
