const { expect } = require("chai");
const { FhevmType } = require("@fhevm/hardhat-plugin");
const hre = require("hardhat");

async function expectRevert(action) {
  let reverted = false;
  try {
    await action();
  } catch (error) {
    reverted = true;
  }
  expect(reverted).to.equal(true);
}

async function increaseTime(seconds) {
  await hre.network.provider.send("evm_increaseTime", [seconds]);
  await hre.network.provider.send("evm_mine");
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
      payload,
    );
  await tx.wait();
}

async function finalizeEqualityAttestation({ escrow, orderId, target, getter }) {
  const attestation = await getter();
  const handle = attestation.handle;
  const decrypted = await hre.fhevm.publicDecrypt([handle]);

  const tx = await escrow.finalizeEqualityAttestation(
    orderId,
    target,
    decrypted.abiEncodedClearValues,
    decrypted.decryptionProof,
  );
  await tx.wait();

  return Boolean(decrypted.clearValues[handle]);
}

async function finalizeSellerBondEqualityAttestation({ escrow, orderId }) {
  return finalizeEqualityAttestation({
    escrow,
    orderId,
    target: 0,
    getter: () => escrow.getSellerBondEqualityAttestation(),
  });
}

async function finalizeTransporterBondEqualityAttestation({ escrow, orderId }) {
  return finalizeEqualityAttestation({
    escrow,
    orderId,
    target: 1,
    getter: () => escrow.getTransporterBondEqualityAttestation(),
  });
}

describe("ProductFactoryConfidential", function () {
  it("can create a confidential product for an explicit seller address", async function () {
    const [deployer, seller] = await hre.ethers.getSigners();

    const tokenFactory = await hre.ethers.getContractFactory("ConfidentialOrderToken");
    const token = await tokenFactory
      .connect(deployer)
      .deploy(deployer.address, "Confidential Order Token", "COT", "ipfs://factory-confidential");
    await token.waitForDeployment();

    const implFactory = await hre.ethers.getContractFactory("ProductEscrowConfidential_Initializer");
    const implementation = await implFactory.connect(deployer).deploy();
    await implementation.waitForDeployment();

    const factoryFactory = await hre.ethers.getContractFactory("ProductFactoryConfidential");
    const factory = await factoryFactory.connect(deployer).deploy(await implementation.getAddress());
    await factory.waitForDeployment();

    const unitPrice = 42;
    const unitPriceHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(String(unitPrice)));
    const tx = await factory
      .connect(deployer)
      .createProductConfidentialV1ForSeller(
        "Explicit Seller Product",
        unitPrice,
        unitPriceHash,
        await token.getAddress(),
        seller.address,
      );
    const receipt = await tx.wait();

    const createdEvent = receipt.logs
      .map((log) => {
        try {
          return factory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log && log.name === "ProductCreatedConfidential");

    const escrowAddress = createdEvent.args.product;
    const escrow = await hre.ethers.getContractAt("ProductEscrowConfidential_Initializer", escrowAddress, deployer);

    expect(await escrow.owner()).to.equal(seller.address);
    expect(await escrow.unitPrice()).to.equal(BigInt(unitPrice));
    expect(createdEvent.args.seller).to.equal(seller.address);
    expect(createdEvent.args.unitPrice).to.equal(BigInt(unitPrice));
  });

  it("deploys a confidential product clone and completes the essential lifecycle", async function () {
    const [seller, buyer, transporter] = await hre.ethers.getSigners();

    const tokenFactory = await hre.ethers.getContractFactory("ConfidentialOrderToken");
    const token = await tokenFactory
      .connect(seller)
      .deploy(seller.address, "Confidential Order Token", "COT", "ipfs://factory-confidential");
    await token.waitForDeployment();

    const implFactory = await hre.ethers.getContractFactory("ProductEscrowConfidential_Initializer");
    const implementation = await implFactory.connect(seller).deploy();
    await implementation.waitForDeployment();

    const factoryFactory = await hre.ethers.getContractFactory("ProductFactoryConfidential");
    const factory = await factoryFactory.connect(seller).deploy(await implementation.getAddress());
    await factory.waitForDeployment();

    await hre.fhevm.assertCoprocessorInitialized(token, "ConfidentialOrderToken");
    await hre.fhevm.assertCoprocessorInitialized(implementation, "ProductEscrowConfidential_Initializer");

    const unitPrice = 100;
    const unitPriceHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(String(unitPrice)));
    let tx = await factory
      .connect(seller)
      .createProductConfidentialV1("Confidential Product", unitPrice, unitPriceHash, await token.getAddress());
    const receipt = await tx.wait();

    const createdEvent = receipt.logs
      .map((log) => {
        try {
          return factory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log && log.name === "ProductCreatedConfidential");

    const escrowAddress = createdEvent.args.product;
    const escrow = await hre.ethers.getContractAt("ProductEscrowConfidential_Initializer", escrowAddress, seller);

    expect(await escrow.owner()).to.equal(seller.address);
    expect(await escrow.factory()).to.equal(await factory.getAddress());
    expect(await escrow.unitPrice()).to.equal(BigInt(unitPrice));
    expect(await escrow.unitPriceHash()).to.equal(unitPriceHash);

    await mintTo({ token, owner: seller, recipient: buyer, value: 100 });
    await mintTo({ token, owner: seller, recipient: seller, value: 100 });
    await mintTo({ token, owner: seller, recipient: seller, value: 15 });
    await mintTo({ token, owner: seller, recipient: transporter, value: 100 });

    const orderId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("confidential-order-factory-1"));
    await depositWithCallback({
      token,
      sender: buyer,
      recipient: escrowAddress,
      value: 100,
      orderId,
      kind: 0,
    });

    expect(await escrow.buyer()).to.equal(buyer.address);
    expect(Number(await escrow.phase())).to.equal(1);

    await depositWithCallback({
      token,
      sender: seller,
      recipient: escrowAddress,
      value: 100,
      orderId,
      kind: 1,
    });
    expect(await escrow.hasSellerBondDeposit()).to.equal(true);
    expect(await finalizeSellerBondEqualityAttestation({ escrow, orderId })).to.equal(true);

    tx = await escrow.connect(seller).confirmOrderById(orderId, "ipfs://factory-order");
    await tx.wait();
    expect(Number(await escrow.phase())).to.equal(2);

    tx = await escrow.connect(transporter).createTransporter(15);
    await tx.wait();
    tx = await escrow.connect(seller).setTransporter(transporter.address);
    await tx.wait();
    expect(await escrow.transporter()).to.equal(transporter.address);
    expect(Number(await escrow.phase())).to.equal(3);

    await depositWithCallback({
      token,
      sender: seller,
      recipient: escrowAddress,
      value: 15,
      orderId,
      kind: 2,
    });
    expect(await escrow.hasSellerDeliveryFeeDeposit()).to.equal(true);

    await depositWithCallback({
      token,
      sender: transporter,
      recipient: escrowAddress,
      value: 100,
      orderId,
      kind: 3,
    });
    expect(await escrow.hasTransporterSecurityDeposit()).to.equal(true);
    expect(await finalizeTransporterBondEqualityAttestation({ escrow, orderId })).to.equal(true);

    const vcHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("ipfs://factory-order"));
    tx = await escrow.connect(transporter).confirmDelivery(orderId, vcHash);
    await tx.wait();

    expect(Number(await escrow.phase())).to.equal(4);
    expect(await escrow.delivered()).to.equal(true);

    const encryptedSellerBalance = await token.confidentialBalanceOf(seller.address);
    const clearSellerBalance = await hre.fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedSellerBalance,
      await token.getAddress(),
      seller,
    );
    expect(clearSellerBalance).to.equal(200n);

    const encryptedTransporterBalance = await token.confidentialBalanceOf(transporter.address);
    const clearTransporterBalance = await hre.fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedTransporterBalance,
      await token.getAddress(),
      transporter,
    );
    expect(clearTransporterBalance).to.equal(115n);
  });

  it("rejects duplicate buyer funding and seller confirmation before buyer funding", async function () {
    const [seller, buyer, secondBuyer] = await hre.ethers.getSigners();

    const tokenFactory = await hre.ethers.getContractFactory("ConfidentialOrderToken");
    const token = await tokenFactory
      .connect(seller)
      .deploy(seller.address, "Confidential Order Token", "COT", "ipfs://factory-confidential");
    await token.waitForDeployment();

    const implFactory = await hre.ethers.getContractFactory("ProductEscrowConfidential_Initializer");
    const implementation = await implFactory.connect(seller).deploy();
    await implementation.waitForDeployment();

    const factoryFactory = await hre.ethers.getContractFactory("ProductFactoryConfidential");
    const factory = await factoryFactory.connect(seller).deploy(await implementation.getAddress());
    await factory.waitForDeployment();

    const unitPrice = 100;
    const unitPriceHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(String(unitPrice)));
    const createTx = await factory
      .connect(seller)
      .createProductConfidentialV1("Confidential Product", unitPrice, unitPriceHash, await token.getAddress());
    const createReceipt = await createTx.wait();
    const createdEvent = createReceipt.logs
      .map((log) => {
        try {
          return factory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log && log.name === "ProductCreatedConfidential");

    const escrowAddress = createdEvent.args.product;
    const escrow = await hre.ethers.getContractAt("ProductEscrowConfidential_Initializer", escrowAddress, seller);

    const orderId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("confidential-order-duplicate"));

    await expectRevert(() => escrow.connect(seller).confirmOrderById(orderId, "ipfs://too-early"));

    await mintTo({ token, owner: seller, recipient: buyer, value: 100 });
    await mintTo({ token, owner: seller, recipient: secondBuyer, value: 100 });

    await depositWithCallback({
      token,
      sender: buyer,
      recipient: escrowAddress,
      value: 100,
      orderId,
      kind: 0,
    });

    await expectRevert(() => escrow.connect(seller).confirmOrderById(orderId, "ipfs://still-too-early"));

    await mintTo({ token, owner: seller, recipient: seller, value: 100 });
    await depositWithCallback({
      token,
      sender: seller,
      recipient: escrowAddress,
      value: 100,
      orderId,
      kind: 1,
    });

    await expectRevert(() => escrow.connect(seller).confirmOrderById(orderId, "ipfs://pending-attestation"));
    expect(await finalizeSellerBondEqualityAttestation({ escrow, orderId })).to.equal(true);

    const attestation = await escrow.getSellerBondEqualityAttestation();
    expect(Number(attestation.status)).to.equal(2);

    await expectRevert(() =>
      depositWithCallback({
        token,
        sender: secondBuyer,
        recipient: escrowAddress,
        value: 100,
        orderId: hre.ethers.keccak256(hre.ethers.toUtf8Bytes("confidential-order-second-buyer")),
        kind: 0,
      }),
    );
  });

  it("rejects unknown transporter selection and delivery before all confidential funding is present", async function () {
    const [seller, buyer, transporter, unknownTransporter] = await hre.ethers.getSigners();

    const tokenFactory = await hre.ethers.getContractFactory("ConfidentialOrderToken");
    const token = await tokenFactory
      .connect(seller)
      .deploy(seller.address, "Confidential Order Token", "COT", "ipfs://factory-confidential");
    await token.waitForDeployment();

    const implFactory = await hre.ethers.getContractFactory("ProductEscrowConfidential_Initializer");
    const implementation = await implFactory.connect(seller).deploy();
    await implementation.waitForDeployment();

    const factoryFactory = await hre.ethers.getContractFactory("ProductFactoryConfidential");
    const factory = await factoryFactory.connect(seller).deploy(await implementation.getAddress());
    await factory.waitForDeployment();

    const unitPrice = 100;
    const unitPriceHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(String(unitPrice)));
    const createTx = await factory
      .connect(seller)
      .createProductConfidentialV1("Confidential Product", unitPrice, unitPriceHash, await token.getAddress());
    const createReceipt = await createTx.wait();
    const createdEvent = createReceipt.logs
      .map((log) => {
        try {
          return factory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log && log.name === "ProductCreatedConfidential");

    const escrowAddress = createdEvent.args.product;
    const escrow = await hre.ethers.getContractAt("ProductEscrowConfidential_Initializer", escrowAddress, seller);

    await mintTo({ token, owner: seller, recipient: buyer, value: 100 });
    await mintTo({ token, owner: seller, recipient: seller, value: 100 });

    const orderId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("confidential-order-transporter"));
    await depositWithCallback({
      token,
      sender: buyer,
      recipient: escrowAddress,
      value: 100,
      orderId,
      kind: 0,
    });
    await depositWithCallback({
      token,
      sender: seller,
      recipient: escrowAddress,
      value: 100,
      orderId,
      kind: 1,
    });
    expect(await finalizeSellerBondEqualityAttestation({ escrow, orderId })).to.equal(true);
    await (await escrow.connect(seller).confirmOrderById(orderId, "ipfs://confirmed")).wait();

    await expectRevert(() => escrow.connect(seller).setTransporter(unknownTransporter.address));

    await (await escrow.connect(transporter).createTransporter(15)).wait();
    await (await escrow.connect(seller).setTransporter(transporter.address)).wait();

    const vcHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("ipfs://confirmed"));
    await expectRevert(() => escrow.connect(transporter).confirmDelivery(orderId, vcHash));

    await mintTo({ token, owner: seller, recipient: seller, value: 15 });
    await mintTo({ token, owner: seller, recipient: transporter, value: 100 });
    await depositWithCallback({
      token,
      sender: seller,
      recipient: escrowAddress,
      value: 15,
      orderId,
      kind: 2,
    });

    await expectRevert(() => escrow.connect(transporter).confirmDelivery(orderId, vcHash));

    await depositWithCallback({
      token,
      sender: transporter,
      recipient: escrowAddress,
      value: 100,
      orderId,
      kind: 3,
    });

    await expectRevert(() => escrow.connect(transporter).confirmDelivery(orderId, vcHash));
    expect(await finalizeTransporterBondEqualityAttestation({ escrow, orderId })).to.equal(true);
  });

  it("blocks seller confirmation when seller bond equality attestation resolves false", async function () {
    const [seller, buyer] = await hre.ethers.getSigners();

    const tokenFactory = await hre.ethers.getContractFactory("ConfidentialOrderToken");
    const token = await tokenFactory
      .connect(seller)
      .deploy(seller.address, "Confidential Order Token", "COT", "ipfs://factory-confidential");
    await token.waitForDeployment();

    const implFactory = await hre.ethers.getContractFactory("ProductEscrowConfidential_Initializer");
    const implementation = await implFactory.connect(seller).deploy();
    await implementation.waitForDeployment();

    const factoryFactory = await hre.ethers.getContractFactory("ProductFactoryConfidential");
    const factory = await factoryFactory.connect(seller).deploy(await implementation.getAddress());
    await factory.waitForDeployment();

    const unitPrice = 100;
    const unitPriceHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(String(unitPrice)));
    const createTx = await factory
      .connect(seller)
      .createProductConfidentialV1("Attestation False Product", unitPrice, unitPriceHash, await token.getAddress());
    const createReceipt = await createTx.wait();
    const createdEvent = createReceipt.logs
      .map((log) => {
        try {
          return factory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log && log.name === "ProductCreatedConfidential");

    const escrowAddress = createdEvent.args.product;
    const escrow = await hre.ethers.getContractAt("ProductEscrowConfidential_Initializer", escrowAddress, seller);

    await mintTo({ token, owner: seller, recipient: buyer, value: 100 });
    await mintTo({ token, owner: seller, recipient: seller, value: 99 });

    const orderId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("confidential-order-attestation-false"));
    await depositWithCallback({
      token,
      sender: buyer,
      recipient: escrowAddress,
      value: 100,
      orderId,
      kind: 0,
    });
    await depositWithCallback({
      token,
      sender: seller,
      recipient: escrowAddress,
      value: 99,
      orderId,
      kind: 1,
    });

    expect(await finalizeSellerBondEqualityAttestation({ escrow, orderId })).to.equal(false);

    const attestation = await escrow.getSellerBondEqualityAttestation();
    expect(Number(attestation.status)).to.equal(3);

    await expectRevert(() => escrow.connect(seller).confirmOrderById(orderId, "ipfs://should-fail"));
  });

  it("blocks delivery confirmation when transporter bond equality attestation resolves false", async function () {
    const [seller, buyer, transporter] = await hre.ethers.getSigners();

    const tokenFactory = await hre.ethers.getContractFactory("ConfidentialOrderToken");
    const token = await tokenFactory
      .connect(seller)
      .deploy(seller.address, "Confidential Order Token", "COT", "ipfs://factory-confidential");
    await token.waitForDeployment();

    const implFactory = await hre.ethers.getContractFactory("ProductEscrowConfidential_Initializer");
    const implementation = await implFactory.connect(seller).deploy();
    await implementation.waitForDeployment();

    const factoryFactory = await hre.ethers.getContractFactory("ProductFactoryConfidential");
    const factory = await factoryFactory.connect(seller).deploy(await implementation.getAddress());
    await factory.waitForDeployment();

    const unitPrice = 100;
    const unitPriceHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(String(unitPrice)));
    const createTx = await factory
      .connect(seller)
      .createProductConfidentialV1("Transporter Attestation False Product", unitPrice, unitPriceHash, await token.getAddress());
    const createReceipt = await createTx.wait();
    const createdEvent = createReceipt.logs
      .map((log) => {
        try {
          return factory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log && log.name === "ProductCreatedConfidential");

    const escrowAddress = createdEvent.args.product;
    const escrow = await hre.ethers.getContractAt("ProductEscrowConfidential_Initializer", escrowAddress, seller);

    await mintTo({ token, owner: seller, recipient: buyer, value: 100 });
    await mintTo({ token, owner: seller, recipient: seller, value: 100 });
    await mintTo({ token, owner: seller, recipient: seller, value: 15 });
    await mintTo({ token, owner: seller, recipient: transporter, value: 99 });

    const orderId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("confidential-order-transporter-attestation-false"));
    await depositWithCallback({
      token,
      sender: buyer,
      recipient: escrowAddress,
      value: 100,
      orderId,
      kind: 0,
    });
    await depositWithCallback({
      token,
      sender: seller,
      recipient: escrowAddress,
      value: 100,
      orderId,
      kind: 1,
    });
    expect(await finalizeSellerBondEqualityAttestation({ escrow, orderId })).to.equal(true);
    await (await escrow.connect(seller).confirmOrderById(orderId, "ipfs://transporter-attestation-false")).wait();
    await (await escrow.connect(transporter).createTransporter(15)).wait();
    await (await escrow.connect(seller).setTransporter(transporter.address)).wait();

    await depositWithCallback({
      token,
      sender: seller,
      recipient: escrowAddress,
      value: 15,
      orderId,
      kind: 2,
    });
    await depositWithCallback({
      token,
      sender: transporter,
      recipient: escrowAddress,
      value: 99,
      orderId,
      kind: 3,
    });

    expect(await finalizeTransporterBondEqualityAttestation({ escrow, orderId })).to.equal(false);

    const attestation = await escrow.getTransporterBondEqualityAttestation();
    expect(Number(attestation.status)).to.equal(3);

    const vcHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("ipfs://transporter-attestation-false"));
    await expectRevert(() => escrow.connect(transporter).confirmDelivery(orderId, vcHash));
  });

  it("refunds buyer on seller timeout without any public bond side effects", async function () {
    const [seller, buyer] = await hre.ethers.getSigners();

    const tokenFactory = await hre.ethers.getContractFactory("ConfidentialOrderToken");
    const token = await tokenFactory
      .connect(seller)
      .deploy(seller.address, "Confidential Order Token", "COT", "ipfs://factory-confidential");
    await token.waitForDeployment();

    const implFactory = await hre.ethers.getContractFactory("ProductEscrowConfidential_Initializer");
    const implementation = await implFactory.connect(seller).deploy();
    await implementation.waitForDeployment();

    const factoryFactory = await hre.ethers.getContractFactory("ProductFactoryConfidential");
    const factory = await factoryFactory.connect(seller).deploy(await implementation.getAddress());
    await factory.waitForDeployment();

    const unitPrice = 55;
    const unitPriceHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(String(unitPrice)));
    const createTx = await factory
      .connect(seller)
      .createProductConfidentialV1("Timeout Product", unitPrice, unitPriceHash, await token.getAddress());
    const createReceipt = await createTx.wait();
    const createdEvent = createReceipt.logs
      .map((log) => {
        try {
          return factory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log && log.name === "ProductCreatedConfidential");

    const escrowAddress = createdEvent.args.product;
    const escrow = await hre.ethers.getContractAt("ProductEscrowConfidential_Initializer", escrowAddress, seller);

    await mintTo({ token, owner: seller, recipient: buyer, value: 55 });
    const orderId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("confidential-order-seller-timeout"));
    await depositWithCallback({
      token,
      sender: buyer,
      recipient: escrowAddress,
      value: 55,
      orderId,
      kind: 0,
    });
    await mintTo({ token, owner: seller, recipient: seller, value: 55 });
    await depositWithCallback({
      token,
      sender: seller,
      recipient: escrowAddress,
      value: 55,
      orderId,
      kind: 1,
    });

    await increaseTime(2 * 24 * 60 * 60 + 1);
    await (await escrow.connect(buyer).sellerTimeout()).wait();

    expect(Number(await escrow.phase())).to.equal(5);
    expect(await escrow.hasBuyerDeposit()).to.equal(false);

    const encryptedBuyerBalance = await token.confidentialBalanceOf(buyer.address);
    const clearBuyerBalance = await hre.fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBuyerBalance,
      await token.getAddress(),
      buyer,
    );
    expect(clearBuyerBalance).to.equal(110n);

    const attestation = await escrow.getSellerBondEqualityAttestation();
    expect(Number(attestation.status)).to.equal(0);
  });

  it("refunds buyer and lets non-selected transporters withdraw after bid timeout without public bonds", async function () {
    const [seller, buyer, transporterA, transporterB] = await hre.ethers.getSigners();

    const tokenFactory = await hre.ethers.getContractFactory("ConfidentialOrderToken");
    const token = await tokenFactory
      .connect(seller)
      .deploy(seller.address, "Confidential Order Token", "COT", "ipfs://factory-confidential");
    await token.waitForDeployment();

    const implFactory = await hre.ethers.getContractFactory("ProductEscrowConfidential_Initializer");
    const implementation = await implFactory.connect(seller).deploy();
    await implementation.waitForDeployment();

    const factoryFactory = await hre.ethers.getContractFactory("ProductFactoryConfidential");
    const factory = await factoryFactory.connect(seller).deploy(await implementation.getAddress());
    await factory.waitForDeployment();

    const unitPrice = 60;
    const unitPriceHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(String(unitPrice)));
    const createTx = await factory
      .connect(seller)
      .createProductConfidentialV1("Bid Timeout Product", unitPrice, unitPriceHash, await token.getAddress());
    const createReceipt = await createTx.wait();
    const createdEvent = createReceipt.logs
      .map((log) => {
        try {
          return factory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log && log.name === "ProductCreatedConfidential");

    const escrowAddress = createdEvent.args.product;
    const escrow = await hre.ethers.getContractAt("ProductEscrowConfidential_Initializer", escrowAddress, seller);

    await mintTo({ token, owner: seller, recipient: buyer, value: 60 });
    const orderId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("confidential-order-bid-timeout"));
    await depositWithCallback({
      token,
      sender: buyer,
      recipient: escrowAddress,
      value: 60,
      orderId,
      kind: 0,
    });
    await mintTo({ token, owner: seller, recipient: seller, value: 60 });
    await depositWithCallback({
      token,
      sender: seller,
      recipient: escrowAddress,
      value: 60,
      orderId,
      kind: 1,
    });
    expect(await finalizeSellerBondEqualityAttestation({ escrow, orderId })).to.equal(true);
    await (await escrow.connect(seller).confirmOrderById(orderId, "ipfs://bid-timeout")).wait();

    await (await escrow.connect(transporterA).createTransporter(10)).wait();
    await (await escrow.connect(transporterB).createTransporter(11)).wait();

    await increaseTime(2 * 24 * 60 * 60 + 1);
    await (await escrow.connect(buyer).bidTimeout()).wait();

    expect(Number(await escrow.phase())).to.equal(5);
    await (await escrow.connect(transporterA).withdrawBid()).wait();
    expect(await escrow.transporters(transporterA.address)).to.equal(0n);
    expect(await escrow.isTransporter(transporterA.address)).to.equal(false);
  });

  it("refunds buyer, returns seller fee, and slashes confidential transporter security on delivery timeout", async function () {
    const [seller, buyer, transporter] = await hre.ethers.getSigners();

    const tokenFactory = await hre.ethers.getContractFactory("ConfidentialOrderToken");
    const token = await tokenFactory
      .connect(seller)
      .deploy(seller.address, "Confidential Order Token", "COT", "ipfs://factory-confidential");
    await token.waitForDeployment();

    const implFactory = await hre.ethers.getContractFactory("ProductEscrowConfidential_Initializer");
    const implementation = await implFactory.connect(seller).deploy();
    await implementation.waitForDeployment();

    const factoryFactory = await hre.ethers.getContractFactory("ProductFactoryConfidential");
    const factory = await factoryFactory.connect(seller).deploy(await implementation.getAddress());
    await factory.waitForDeployment();

    const unitPrice = 80;
    const unitPriceHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(String(unitPrice)));
    const createTx = await factory
      .connect(seller)
      .createProductConfidentialV1("Delivery Timeout Product", unitPrice, unitPriceHash, await token.getAddress());
    const createReceipt = await createTx.wait();
    const createdEvent = createReceipt.logs
      .map((log) => {
        try {
          return factory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log && log.name === "ProductCreatedConfidential");

    const escrowAddress = createdEvent.args.product;
    const escrow = await hre.ethers.getContractAt("ProductEscrowConfidential_Initializer", escrowAddress, seller);

    await mintTo({ token, owner: seller, recipient: buyer, value: 80 });
    await mintTo({ token, owner: seller, recipient: seller, value: 80 });
    await mintTo({ token, owner: seller, recipient: seller, value: 20 });
    await mintTo({ token, owner: seller, recipient: transporter, value: 80 });

    const orderId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("confidential-order-delivery-timeout"));
    await depositWithCallback({
      token,
      sender: buyer,
      recipient: escrowAddress,
      value: 80,
      orderId,
      kind: 0,
    });
    await depositWithCallback({
      token,
      sender: seller,
      recipient: escrowAddress,
      value: 80,
      orderId,
      kind: 1,
    });
    expect(await finalizeSellerBondEqualityAttestation({ escrow, orderId })).to.equal(true);
    await (await escrow.connect(seller).confirmOrderById(orderId, "ipfs://delivery-timeout")).wait();
    await (await escrow.connect(transporter).createTransporter(20)).wait();
    await (await escrow.connect(seller).setTransporter(transporter.address)).wait();

    await depositWithCallback({
      token,
      sender: seller,
      recipient: escrowAddress,
      value: 20,
      orderId,
      kind: 2,
    });

    await depositWithCallback({
      token,
      sender: transporter,
      recipient: escrowAddress,
      value: 80,
      orderId,
      kind: 3,
    });
    expect(await finalizeTransporterBondEqualityAttestation({ escrow, orderId })).to.equal(true);

    await increaseTime(2 * 24 * 60 * 60 + 1);
    await (await escrow.connect(buyer).deliveryTimeout()).wait();

    expect(Number(await escrow.phase())).to.equal(5);
    expect(await escrow.hasBuyerDeposit()).to.equal(false);
    expect(await escrow.hasSellerBondDeposit()).to.equal(false);
    expect(await escrow.hasSellerDeliveryFeeDeposit()).to.equal(false);
    expect(await escrow.hasTransporterSecurityDeposit()).to.equal(false);

    const encryptedBuyerBalance = await token.confidentialBalanceOf(buyer.address);
    const clearBuyerBalance = await hre.fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBuyerBalance,
      await token.getAddress(),
      buyer,
    );
    expect(clearBuyerBalance).to.equal(80n);

    const encryptedSellerBalance = await token.confidentialBalanceOf(seller.address);
    const clearSellerBalance = await hre.fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedSellerBalance,
      await token.getAddress(),
      seller,
    );
    expect(clearSellerBalance).to.equal(180n);

    const encryptedTransporterBalance = await token.confidentialBalanceOf(transporter.address);
    const clearTransporterBalance = await hre.fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedTransporterBalance,
      await token.getAddress(),
      transporter,
    );
    expect(clearTransporterBalance).to.equal(0n);

    const attestation = await escrow.getTransporterBondEqualityAttestation();
    expect(Number(attestation.status)).to.equal(0);
  });
});

