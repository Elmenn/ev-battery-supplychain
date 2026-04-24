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

async function assertProfileState({
  productAddress,
  expectedVisibility,
  expectedUnitPrice,
  expectedCommitment,
}) {
  const contractName =
    expectedVisibility === "private"
      ? "ProductEscrowConfidential_PrivatePrice"
      : "ProductEscrowConfidential_Initializer";
  const escrow = await hre.ethers.getContractAt(contractName, productAddress);

  const priceVisibility = Number(await escrow.priceVisibility());
  const priceCommitment = await escrow.priceCommitment();
  const unitPrice = BigInt(await escrow.unitPrice());

  if (expectedVisibility === "public" && priceVisibility !== 0) {
    throw new Error(`Public-profile smoke check failed for ${productAddress}: expected priceVisibility=0, got ${priceVisibility}`);
  }
  if (expectedVisibility === "private" && priceVisibility !== 1) {
    throw new Error(`Private-profile smoke check failed for ${productAddress}: expected priceVisibility=1, got ${priceVisibility}`);
  }
  if (unitPrice !== BigInt(expectedUnitPrice)) {
    throw new Error(
      `Smoke check failed for ${productAddress}: expected unitPrice=${expectedUnitPrice}, got ${unitPrice.toString()}`
    );
  }
  if (hre.ethers.getBytes(priceCommitment).length !== 32) {
    throw new Error(`Smoke check failed for ${productAddress}: invalid bytes32 priceCommitment returned`);
  }
  if (priceCommitment.toLowerCase() !== expectedCommitment.toLowerCase()) {
    throw new Error(
      `Smoke check failed for ${productAddress}: expected priceCommitment=${expectedCommitment}, got ${priceCommitment}`
    );
  }
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
  const privateProductName = getEnvString(
    "ERC7984_BROWSER_PREP_PRIVATE_PRODUCT_NAME",
    `${productName} (Private Price)`
  );
  const privateUnitPrice = getEnvNumber("ERC7984_BROWSER_PREP_PRIVATE_UNIT_PRICE", unitPrice);
  const privatePriceBlinding = hre.ethers.hexlify(hre.ethers.randomBytes(32));
  const publicTokenAddress = getEnvAddress("ERC7984_BROWSER_PREP_PUBLIC_TOKEN", SEPOLIA_WETH_ADDRESS);
  const publicTokenSymbol = getEnvString("ERC7984_BROWSER_PREP_PUBLIC_TOKEN_SYMBOL", "WETH");

  const unitPriceHash = hre.ethers.keccak256(
    hre.ethers.toUtf8Bytes(String(unitPrice))
  );
  const privatePriceCommitment = hre.ethers.keccak256(
    hre.ethers.solidityPacked(["uint64", "bytes32"], [privateUnitPrice, privatePriceBlinding])
  );
  const suggestedOrderId = hre.ethers.keccak256(
    hre.ethers.toUtf8Bytes(`browser-order-${Date.now()}`)
  );

  const confidentialTokenFactory = await hre.ethers.getContractFactory("ConfidentialOrderToken");
  const token = await confidentialTokenFactory
    .connect(deployer)
    .deploy(deployer.address, "Confidential Order Token", "COT", "ipfs://browser-confidential");
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

  const privateImplementationFactory = await hre.ethers.getContractFactory(
    "ProductEscrowConfidential_PrivatePrice"
  );
  const privateImplementation = await privateImplementationFactory.connect(deployer).deploy();
  await privateImplementation.waitForDeployment();

  const factoryFactory = await hre.ethers.getContractFactory("ProductFactoryConfidential");
  const factory = await factoryFactory.connect(deployer).deploy(await implementation.getAddress());
  await factory.waitForDeployment();
  await (
    await factory.connect(deployer).setPrivateImplementation(await privateImplementation.getAddress())
  ).wait();

  const publicCreateTx = await factory
    .connect(deployer)
    .createProductConfidentialV1ForSeller(
      productName,
      unitPrice,
      unitPriceHash,
      await token.getAddress(),
      sellerAddress
    );
  const publicCreateReceipt = await publicCreateTx.wait();
  const publicEscrowAddress = getCreatedProductAddress(factory, publicCreateReceipt);

  const privateCreateTx = await factory
    .connect(deployer)
    .createProductConfidentialPrivatePriceForSeller(
      privateProductName,
      privatePriceCommitment,
      await token.getAddress(),
      sellerAddress
    );
  const privateCreateReceipt = await privateCreateTx.wait();
  const privateEscrowAddress = getCreatedProductAddress(factory, privateCreateReceipt);

  await assertProfileState({
    productAddress: publicEscrowAddress,
    expectedVisibility: "public",
    expectedUnitPrice: unitPrice,
    expectedCommitment: unitPriceHash,
  });
  await assertProfileState({
    productAddress: privateEscrowAddress,
    expectedVisibility: "private",
    expectedUnitPrice: 0,
    expectedCommitment: privatePriceCommitment,
  });

  const latestPrepConfig = {
    generatedAt: new Date().toISOString(),
    deploymentVersion: "dual-profile-v1",
    network: network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    publicToken: publicTokenAddress,
    publicTokenSymbol,
    publicTokenIsWrappedNative: true,
    fundingWrapper: await fundingWrapper.getAddress(),
    confidentialToken: await token.getAddress(),
    implementation: await implementation.getAddress(),
    privateImplementation: await privateImplementation.getAddress(),
    factory: await factory.getAddress(),
    supportedPriceProfiles: ["public", "private"],
    supportsPrivatePrice: true,
    productEscrow: publicEscrowAddress,
    publicProductEscrow: publicEscrowAddress,
    privateProductEscrow: privateEscrowAddress,
    seller: sellerAddress,
    buyer: buyerAddress,
    transporter: transporterAddress,
    suggestedOrderId,
    unitPrice,
    buyerAmount: buyerPurchaseAmount,
    sellerBond: sellerBondAmount,
    sellerFee: sellerDeliveryFeeAmount,
    transporterBond: transporterSecurityAmount,
    publicUnitPriceHash: unitPriceHash,
    privateUnitPrice: privateUnitPrice,
    privatePriceCommitment,
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
  console.log(`Private impl       : ${await privateImplementation.getAddress()}`);
  console.log(`Factory            : ${await factory.getAddress()}`);
  console.log(`Public escrow      : ${publicEscrowAddress}`);
  console.log(`Private escrow     : ${privateEscrowAddress}`);
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
  console.log(`- Public product escrow address: ${publicEscrowAddress}`);
  console.log(`- Private product escrow address: ${privateEscrowAddress}`);
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
