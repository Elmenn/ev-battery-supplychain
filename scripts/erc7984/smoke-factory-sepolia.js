const { FhevmType } = require("@fhevm/hardhat-plugin");
const hre = require("hardhat");

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mintTo({ token, owner, recipient, value }) {
  const tokenAddress = await token.getAddress();
  const input = hre.fhevm.createEncryptedInput(tokenAddress, owner.address);
  input.add64(value);
  const encrypted = await input.encrypt();

  const tx = await token
    .connect(owner)
    .confidentialMint(recipient.address, encrypted.handles[0], encrypted.inputProof);
  await tx.wait();
}

async function depositWithCallback({ token, sender, recipient, value, orderId, kind }) {
  const tokenAddress = await token.getAddress();
  const input = hre.fhevm.createEncryptedInput(tokenAddress, sender.address);
  input.add64(value);
  const encrypted = await input.encrypt();
  const payload = hre.ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "uint8"], [orderId, kind]);

  const tx = await token
    .connect(sender)
    ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
      recipient,
      encrypted.handles[0],
      encrypted.inputProof,
      payload
    );
  await tx.wait();
}

async function finalizeEqualityAttestation({ escrow, orderId, target, getter, label }) {
  const attestation = await getter();
  const handle = attestation.handle;

  console.log(`${label} equality handle: ${handle}`);
  const decrypted = await hre.fhevm.publicDecrypt([handle]);
  const result = Boolean(decrypted.clearValues[handle]);

  const tx = await escrow.finalizeEqualityAttestation(
    orderId,
    target,
    decrypted.abiEncodedClearValues,
    decrypted.decryptionProof
  );
  await tx.wait();

  console.log(`${label} equality attestation result: ${result}`);
  return result;
}

async function finalizeSellerBondEqualityAttestation({ escrow, orderId }) {
  return finalizeEqualityAttestation({
    escrow,
    orderId,
    target: 0,
    getter: () => escrow.getSellerBondEqualityAttestation(),
    label: "Seller bond",
  });
}

async function finalizeTransporterBondEqualityAttestation({ escrow, orderId }) {
  return finalizeEqualityAttestation({
    escrow,
    orderId,
    target: 1,
    getter: () => escrow.getTransporterBondEqualityAttestation(),
    label: "Transporter bond",
  });
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

async function logNativeBalance(label, account) {
  const balance = await hre.ethers.provider.getBalance(account.address);
  console.log(`${label} native balance: ${hre.ethers.formatEther(balance)} ETH`);
}

async function decryptBalance(token, tokenAddress, signer, label, options) {
  const encryptedBalance = await token.confidentialBalanceOf(signer.address);
  const maxAttempts = options?.maxAttempts ?? 3;
  const retryDelayMs = options?.retryDelayMs ?? 3000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const clearBalance = await hre.fhevm.userDecryptEuint(
        FhevmType.euint64,
        encryptedBalance,
        tokenAddress,
        signer,
        {
          validity: options.validity,
        }
      );

      console.log(`${label} decrypted confidential balance: ${clearBalance.toString()}`);
      return clearBalance;
    } catch (error) {
      const message =
        error?._relayerApiError?.message ||
        error?.message ||
        "unknown relayer decrypt error";

      if (attempt === maxAttempts) {
        console.log(`${label} decrypt failed after settlement: ${message}`);
        return null;
      }

      console.log(
        `${label} decrypt attempt ${attempt} failed: ${message}. Retrying in ${retryDelayMs}ms...`
      );
      await sleep(retryDelayMs);
    }
  }
}

async function main() {
  await hre.fhevm.initializeCLIApi();

  const signers = await hre.ethers.getSigners();
  if (signers.length < 3) {
    throw new Error(
      "Need at least 3 signers for seller, buyer, and transporter. Configure MNEMONIC in .env.truffle so Hardhat derives multiple Sepolia accounts."
    );
  }

  const [seller, buyer, transporter] = signers;
  const network = await hre.ethers.provider.getNetwork();

  const buyerPurchaseAmount = getEnvNumber("ERC7984_FACTORY_SMOKE_BUYER_PURCHASE", 100);
  const sellerBondAmount = buyerPurchaseAmount;
  const sellerDeliveryFeeAmount = getEnvNumber("ERC7984_FACTORY_SMOKE_SELLER_FEE", 15);
  const transporterSecurityAmount = buyerPurchaseAmount;
  const quotedFee = getEnvNumber("ERC7984_FACTORY_SMOKE_QUOTED_FEE", 15);
  const productName = getEnvString("ERC7984_FACTORY_SMOKE_PRODUCT_NAME", "Sepolia Confidential Product");
  const unitPrice = getEnvNumber("ERC7984_FACTORY_SMOKE_UNIT_PRICE", buyerPurchaseAmount);
  const vcCID = getEnvString("ERC7984_FACTORY_SMOKE_VC_CID", "ipfs://factory-order-sepolia");
  const decryptRetryDelayMs = getEnvNumber("ERC7984_FACTORY_SMOKE_DECRYPT_RETRY_MS", 3000);
  const decryptValiditySeconds = getEnvNumber("ERC7984_FACTORY_SMOKE_DECRYPT_VALIDITY_SECONDS", 900);

  const unitPriceHash = hre.ethers.keccak256(
    hre.ethers.toUtf8Bytes(String(unitPrice))
  );
  const orderId = hre.ethers.keccak256(
    hre.ethers.toUtf8Bytes(`factory-sepolia-order-${Date.now()}`)
  );
  const vcHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(vcCID));
  const decryptStartTimestamp = Math.floor(Date.now() / 1000);
  const decryptDurationDays = Math.max(1, Math.ceil(decryptValiditySeconds / 86400));
  const decryptOptionsBySigner = new Map(
    [seller, transporter, buyer].map((signer) => [
      signer.address.toLowerCase(),
      {
        validity: {
          startTimestamp: decryptStartTimestamp,
          durationDays: decryptDurationDays,
        },
        maxAttempts: 3,
        retryDelayMs: decryptRetryDelayMs,
      },
    ])
  );

  console.log(`Network     : ${network.name}`);
  console.log(`Seller      : ${seller.address}`);
  console.log(`Buyer       : ${buyer.address}`);
  console.log(`Transporter : ${transporter.address}`);
  console.log(`Buyer amount: ${buyerPurchaseAmount}`);
  console.log(`Unit price  : ${unitPrice}`);
  console.log(`Seller bond : ${sellerBondAmount}`);
  console.log(`Conf bond   : ${transporterSecurityAmount}`);
  console.log(`Order ID    : ${orderId}`);

  await logNativeBalance("Seller", seller);
  await logNativeBalance("Buyer", buyer);
  await logNativeBalance("Transporter", transporter);

  const tokenFactory = await hre.ethers.getContractFactory("ConfidentialOrderToken");
  const token = await tokenFactory
    .connect(seller)
    .deploy(seller.address, "Confidential Order Token", "COT", "ipfs://factory-confidential");
  await token.waitForDeployment();

  const implementationFactory = await hre.ethers.getContractFactory("ProductEscrowConfidential_Initializer");
  const implementation = await implementationFactory.connect(seller).deploy();
  await implementation.waitForDeployment();

  const factoryFactory = await hre.ethers.getContractFactory("ProductFactoryConfidential");
  const factory = await factoryFactory.connect(seller).deploy(await implementation.getAddress());
  await factory.waitForDeployment();

  console.log("");
  console.log("Deployed contracts");
  console.log(`Token          : ${await token.getAddress()}`);
  console.log(`Implementation : ${await implementation.getAddress()}`);
  console.log(`Factory        : ${await factory.getAddress()}`);
  console.log("Factory uses no public bond layer in this slice.");

  let tx = await factory
    .connect(seller)
    .createProductConfidentialV1(productName, unitPrice, unitPriceHash, await token.getAddress());
  const createReceipt = await tx.wait();
  const escrowAddress = getCreatedProductAddress(factory, createReceipt);
  const escrow = await hre.ethers.getContractAt(
    "ProductEscrowConfidential_Initializer",
    escrowAddress,
    seller
  );

  console.log(`Product escrow : ${escrowAddress}`);

  await mintTo({ token, owner: seller, recipient: buyer, value: buyerPurchaseAmount });
  await mintTo({ token, owner: seller, recipient: seller, value: sellerBondAmount });
  await mintTo({ token, owner: seller, recipient: seller, value: sellerDeliveryFeeAmount });
  await mintTo({ token, owner: seller, recipient: transporter, value: transporterSecurityAmount });
  console.log("Minted confidential balances to buyer, seller, and transporter.");

  await depositWithCallback({
    token,
    sender: buyer,
    recipient: escrowAddress,
    value: buyerPurchaseAmount,
    orderId,
    kind: 0,
  });
  console.log(`Buyer deposited confidential purchase amount. Phase=${Number(await escrow.phase())}`);

  await depositWithCallback({
    token,
    sender: seller,
    recipient: escrowAddress,
    value: sellerBondAmount,
    orderId,
    kind: 1,
  });
  console.log(`Seller funded confidential bond: ${await escrow.hasSellerBondDeposit()}`);
  const sellerBondEqualityResult = await finalizeSellerBondEqualityAttestation({ escrow, orderId });
  if (!sellerBondEqualityResult) {
    throw new Error("Seller bond equality attestation resolved false.");
  }

  tx = await escrow.connect(seller).confirmOrderById(orderId, vcCID);
  await tx.wait();
  console.log(`Seller confirmed order. Phase=${Number(await escrow.phase())}`);

  tx = await escrow.connect(transporter).createTransporter(quotedFee);
  await tx.wait();
  tx = await escrow.connect(seller).setTransporter(transporter.address);
  await tx.wait();
  console.log(`Transporter selected. Phase=${Number(await escrow.phase())}`);

  await depositWithCallback({
    token,
    sender: seller,
    recipient: escrowAddress,
    value: sellerDeliveryFeeAmount,
    orderId,
    kind: 2,
  });
  console.log(`Seller funded confidential delivery fee: ${await escrow.hasSellerDeliveryFeeDeposit()}`);

  await depositWithCallback({
    token,
    sender: transporter,
    recipient: escrowAddress,
    value: transporterSecurityAmount,
    orderId,
    kind: 3,
  });
  console.log(
    `Transporter funded confidential security: ${await escrow.hasTransporterSecurityDeposit()}`
  );
  const transporterBondEqualityResult = await finalizeTransporterBondEqualityAttestation({ escrow, orderId });
  if (!transporterBondEqualityResult) {
    throw new Error("Transporter bond equality attestation resolved false.");
  }

  tx = await escrow.connect(transporter).confirmDelivery(orderId, vcHash);
  await tx.wait();
  console.log(`Delivery confirmed. Phase=${Number(await escrow.phase())}`);

  console.log("");
  console.log("Final public state");
  console.log({
    buyer: await escrow.buyer(),
    transporter: await escrow.transporter(),
    delivered: await escrow.delivered(),
    phase: Number(await escrow.phase()),
  });

  console.log("");
  console.log("Final confidential balances");
  const tokenAddress = await token.getAddress();
  await decryptBalance(
    token,
    tokenAddress,
    seller,
    "Seller",
    decryptOptionsBySigner.get(seller.address.toLowerCase())
  );
  await sleep(1000);
  await decryptBalance(
    token,
    tokenAddress,
    transporter,
    "Transporter",
    decryptOptionsBySigner.get(transporter.address.toLowerCase())
  );
  await sleep(1000);
  await decryptBalance(
    token,
    tokenAddress,
    buyer,
    "Buyer",
    decryptOptionsBySigner.get(buyer.address.toLowerCase())
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
