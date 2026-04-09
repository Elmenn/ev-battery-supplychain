const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const SEPOLIA_WETH_ADDRESS = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";

function getEnvNumber(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return defaultValue;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer. Received: ${raw}`);
  }

  return value;
}

function getEnvString(name, defaultValue) {
  return process.env[name] && process.env[name].trim() !== ""
    ? process.env[name]
    : defaultValue;
}

function getEnvAddress(name, fallbackValue) {
  const raw = process.env[name] && process.env[name].trim() !== ""
    ? process.env[name].trim()
    : fallbackValue;

  if (!raw) {
    return raw;
  }

  if (!hre.ethers.isAddress(raw)) {
    throw new Error(`${name} must be a valid address. Received: ${raw}`);
  }

  return hre.ethers.getAddress(raw);
}

function assertDistinctAddresses(addresses) {
  const normalized = addresses.map((address) => hre.ethers.getAddress(address).toLowerCase());
  const unique = new Set(normalized);
  if (unique.size !== normalized.length) {
    throw new Error("Seller, buyer, and transporter must be three different addresses.");
  }
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
    throw new Error("ProductCreatedConfidential event not found in factory receipt.");
  }

  return createdEvent.args.product;
}

function writeLatestPrepConfig(payload) {
  const outputPath = path.resolve(
    __dirname,
    "..",
    "..",
    "frontend",
    "public",
    "erc7984-sepolia-latest.json"
  );
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return outputPath;
}

async function main() {
  const signers = await hre.ethers.getSigners();
  if (signers.length < 1) {
    throw new Error("Need at least 1 funded signer to deploy and prepare the Sepolia browser slice.");
  }

  const [deployer, sellerFallback, buyerFallback, transporterFallback] = signers;
  const network = await hre.ethers.provider.getNetwork();

  const sellerAddress = getEnvAddress(
    "ERC7984_BROWSER_PREP_SELLER",
    sellerFallback?.address || deployer.address
  );
  const buyerAddress = getEnvAddress(
    "ERC7984_BROWSER_PREP_BUYER",
    buyerFallback?.address || sellerFallback?.address
  );
  const transporterAddress = getEnvAddress(
    "ERC7984_BROWSER_PREP_TRANSPORTER",
    transporterFallback?.address || buyerFallback?.address
  );

  if (!sellerAddress || !buyerAddress || !transporterAddress) {
    throw new Error(
      "Provide three role addresses via ERC7984_BROWSER_PREP_SELLER, ERC7984_BROWSER_PREP_BUYER, and ERC7984_BROWSER_PREP_TRANSPORTER, or configure enough local signers to fall back automatically."
    );
  }
  assertDistinctAddresses([sellerAddress, buyerAddress, transporterAddress]);

  const buyerPurchaseAmount = getEnvNumber("ERC7984_BROWSER_PREP_BUYER_PURCHASE", 100);
  const sellerBondAmount = getEnvNumber("ERC7984_BROWSER_PREP_SELLER_BOND", buyerPurchaseAmount);
  const sellerDeliveryFeeAmount = getEnvNumber("ERC7984_BROWSER_PREP_SELLER_FEE", 15);
  const transporterSecurityAmount = getEnvNumber(
    "ERC7984_BROWSER_PREP_TRANSPORTER_BOND",
    buyerPurchaseAmount
  );
  const productName = getEnvString("ERC7984_BROWSER_PREP_PRODUCT_NAME", "Browser ERC-7984 Product");
  const unitPrice = getEnvNumber("ERC7984_BROWSER_PREP_UNIT_PRICE", buyerPurchaseAmount);
  const publicTokenAddress = getEnvAddress("ERC7984_BROWSER_PREP_PUBLIC_TOKEN", SEPOLIA_WETH_ADDRESS);
  const publicTokenSymbol = getEnvString("ERC7984_BROWSER_PREP_PUBLIC_TOKEN_SYMBOL", "WETH");

  const unitPriceHash = hre.ethers.keccak256(
    hre.ethers.toUtf8Bytes(String(unitPrice))
  );
  const suggestedOrderId = hre.ethers.keccak256(
    hre.ethers.toUtf8Bytes(`browser-order-${Date.now()}`)
  );

  const confidentialTokenFactory = await hre.ethers.getContractFactory("MockConfidentialOrderToken");
  const token = await confidentialTokenFactory
    .connect(deployer)
    .deploy(deployer.address, "Mock Confidential Order Token", "MCOT", "ipfs://browser-confidential");
  await token.waitForDeployment();

  const wrapperFactory = await hre.ethers.getContractFactory("ConfidentialPaymentFundingWrapper");
  const fundingWrapper = await wrapperFactory
    .connect(deployer)
    .deploy(deployer.address, publicTokenAddress, await token.getAddress());
  await fundingWrapper.waitForDeployment();

  await (await token.connect(deployer).transferOwnership(await fundingWrapper.getAddress())).wait();

  const implementationFactory = await hre.ethers.getContractFactory("ProductEscrowConfidential_Initializer");
  const implementation = await implementationFactory.connect(deployer).deploy();
  await implementation.waitForDeployment();

  const factoryFactory = await hre.ethers.getContractFactory("ProductFactoryConfidential");
  const factory = await factoryFactory.connect(deployer).deploy(await implementation.getAddress());
  await factory.waitForDeployment();

  const createTx = await factory
    .connect(deployer)
    .createProductConfidentialV1ForSeller(
      productName,
      unitPrice,
      unitPriceHash,
      await token.getAddress(),
      sellerAddress
    );
  const createReceipt = await createTx.wait();
  const escrowAddress = getCreatedProductAddress(factory, createReceipt);

  const latestPrepConfig = {
    generatedAt: new Date().toISOString(),
    network: network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    publicToken: publicTokenAddress,
    publicTokenSymbol,
    publicTokenIsWrappedNative: true,
    fundingWrapper: await fundingWrapper.getAddress(),
    confidentialToken: await token.getAddress(),
    implementation: await implementation.getAddress(),
    factory: await factory.getAddress(),
    productEscrow: escrowAddress,
    seller: sellerAddress,
    buyer: buyerAddress,
    transporter: transporterAddress,
    suggestedOrderId,
    unitPrice,
    buyerAmount: buyerPurchaseAmount,
    sellerBond: sellerBondAmount,
    sellerFee: sellerDeliveryFeeAmount,
    transporterBond: transporterSecurityAmount,
  };
  const latestPrepConfigPath = writeLatestPrepConfig(latestPrepConfig);

  console.log("");
  console.log("ERC-7984 browser prep complete");
  console.log(`Network            : ${network.name}`);
  console.log(`Deployer           : ${deployer.address}`);
  console.log(`Public token       : ${publicTokenAddress} (${publicTokenSymbol})`);
  console.log(`Funding wrapper    : ${await fundingWrapper.getAddress()}`);
  console.log(`Confidential token : ${await token.getAddress()}`);
  console.log(`Implementation     : ${await implementation.getAddress()}`);
  console.log(`Factory            : ${await factory.getAddress()}`);
  console.log(`Product escrow     : ${escrowAddress}`);
  console.log(`Seller             : ${sellerAddress}`);
  console.log(`Buyer              : ${buyerAddress}`);
  console.log(`Transporter        : ${transporterAddress}`);
  console.log(`Suggested order ID : ${suggestedOrderId}`);
  console.log(`Buyer amount       : ${buyerPurchaseAmount}`);
  console.log(`Seller bond        : ${sellerBondAmount}`);
  console.log(`Seller fee         : ${sellerDeliveryFeeAmount}`);
  console.log(`Transporter bond   : ${transporterSecurityAmount}`);
  console.log("");
  console.log("Funding assumptions");
  console.log(`- Public funding asset is real ${publicTokenSymbol}`);
  console.log(`- No mock token is deployed or minted in this prep path`);
  console.log(`- Seller, buyer, and transporter should wrap native ETH into ${publicTokenSymbol} before depositing into the confidential wrapper`);
  console.log("");
  console.log("Use the frontend with:");
  console.log(`- /erc7984/actions`);
  console.log(`- Public token address: ${publicTokenAddress}`);
  console.log(`- Funding wrapper address: ${await fundingWrapper.getAddress()}`);
  console.log(`- Confidential payment token: ${await token.getAddress()}`);
  console.log(`- Product escrow address: ${escrowAddress}`);
  console.log(`- Suggested working order ID: ${suggestedOrderId}`);
  console.log(`- Latest prep config file: ${latestPrepConfigPath}`);
  console.log("");
  console.log("Before running the flow:");
  console.log(`- Wrap enough ETH into ${publicTokenSymbol} for buyer, seller, and transporter`);
  console.log(`- Approve the wrapper from each actor wallet when prompted`);
  console.log("");
  console.log("Optional role env vars:");
  console.log(`- ERC7984_BROWSER_PREP_SELLER`);
  console.log(`- ERC7984_BROWSER_PREP_BUYER`);
  console.log(`- ERC7984_BROWSER_PREP_TRANSPORTER`);
  console.log(`- ERC7984_BROWSER_PREP_PUBLIC_TOKEN`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
