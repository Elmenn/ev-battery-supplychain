const { expect } = require("chai");
const { FhevmType } = require("@fhevm/hardhat-plugin");
const hre = require("hardhat");

async function deployFixture() {
  const [owner, buyer, seller] = await hre.ethers.getSigners();

  const tokenFactory = await hre.ethers.getContractFactory("MockConfidentialOrderToken");
  const token = await tokenFactory
    .connect(owner)
    .deploy(owner.address, "Mock Confidential Order Token", "MCOT", "ipfs://mock-token");
  await token.waitForDeployment();

  const escrowFactory = await hre.ethers.getContractFactory("ConfidentialOrderEscrow");
  const escrow = await escrowFactory.connect(owner).deploy(owner.address, await token.getAddress());
  await escrow.waitForDeployment();

  await hre.fhevm.assertCoprocessorInitialized(token, "MockConfidentialOrderToken");
  await hre.fhevm.assertCoprocessorInitialized(escrow, "ConfidentialOrderEscrow");

  return { owner, buyer, seller, token, escrow };
}

describe("ConfidentialOrderEscrow", function () {
  it("accepts a confidential payment into escrow and records the order", async function () {
    const { owner, buyer, seller, token, escrow } = await deployFixture();
    const tokenAddress = await token.getAddress();
    const escrowAddress = await escrow.getAddress();

    const mintInput = hre.fhevm.createEncryptedInput(tokenAddress, owner.address);
    mintInput.add64(25);
    const encryptedMint = await mintInput.encrypt();

    let tx = await token
      .connect(owner)
      .confidentialMint(buyer.address, encryptedMint.handles[0], encryptedMint.inputProof);
    await tx.wait();

    const orderId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("erc7984-order-1"));
    const callbackData = hre.ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "address"],
      [orderId, seller.address],
    );

    const paymentInput = hre.fhevm.createEncryptedInput(tokenAddress, buyer.address);
    paymentInput.add64(25);
    const encryptedPayment = await paymentInput.encrypt();

    tx = await token
      .connect(buyer)
      ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
        escrowAddress,
        encryptedPayment.handles[0],
        encryptedPayment.inputProof,
        callbackData,
      );
    await tx.wait();

    const order = await escrow.getOrder(orderId);
    expect(order.buyer).to.equal(buyer.address);
    expect(order.seller).to.equal(seller.address);
    expect(order.token).to.equal(tokenAddress);
    expect(Number(order.phase)).to.equal(1);
    expect(Number(order.paidAt)).to.be.greaterThan(0);
    expect(Number(order.releasedAt)).to.equal(0);
  });

  it("releases the confidential escrowed amount to the seller", async function () {
    const { owner, buyer, seller, token, escrow } = await deployFixture();
    const tokenAddress = await token.getAddress();
    const escrowAddress = await escrow.getAddress();

    const mintInput = hre.fhevm.createEncryptedInput(tokenAddress, owner.address);
    mintInput.add64(40);
    const encryptedMint = await mintInput.encrypt();

    let tx = await token
      .connect(owner)
      .confidentialMint(buyer.address, encryptedMint.handles[0], encryptedMint.inputProof);
    await tx.wait();

    const orderId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("erc7984-order-release-1"));
    const callbackData = hre.ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "address"],
      [orderId, seller.address],
    );

    const paymentInput = hre.fhevm.createEncryptedInput(tokenAddress, buyer.address);
    paymentInput.add64(40);
    const encryptedPayment = await paymentInput.encrypt();

    tx = await token
      .connect(buyer)
      ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
        escrowAddress,
        encryptedPayment.handles[0],
        encryptedPayment.inputProof,
        callbackData,
      );
    await tx.wait();

    tx = await escrow.connect(seller).releaseToSeller(orderId);
    await tx.wait();

    const order = await escrow.getOrder(orderId);
    expect(Number(order.phase)).to.equal(2);
    expect(Number(order.releasedAt)).to.be.greaterThan(0);

    const encryptedSellerBalance = await token.confidentialBalanceOf(seller.address);
    const clearSellerBalance = await hre.fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedSellerBalance,
      tokenAddress,
      seller,
    );

    expect(clearSellerBalance).to.equal(40n);
  });
});
