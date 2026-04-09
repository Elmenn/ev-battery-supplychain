const { expect } = require("chai");
const { FhevmType } = require("@fhevm/hardhat-plugin");
const hre = require("hardhat");

async function depositWithCallback({ token, sender, recipient, value, payload }) {
  const tokenAddress = await token.getAddress();
  const input = hre.fhevm.createEncryptedInput(tokenAddress, sender.address);
  input.add64(value);
  const encrypted = await input.encrypt();

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

async function deployFixture() {
  const [owner, buyer, transporter, outsider] = await hre.ethers.getSigners();

  const tokenFactory = await hre.ethers.getContractFactory("MockConfidentialOrderToken");
  const token = await tokenFactory
    .connect(owner)
    .deploy(owner.address, "Mock Confidential Order Token", "MCOT", "ipfs://product-escrow-confidential");
  await token.waitForDeployment();

  const escrowFactory = await hre.ethers.getContractFactory("ProductEscrowConfidentialV1");
  const escrow = await escrowFactory
    .connect(owner)
    .deploy(1, "Confidential Product", owner.address, await token.getAddress(), 2 * 24 * 60 * 60);
  await escrow.waitForDeployment();

  await hre.fhevm.assertCoprocessorInitialized(token, "MockConfidentialOrderToken");
  await hre.fhevm.assertCoprocessorInitialized(escrow, "ProductEscrowConfidentialV1");

  return { owner, buyer, transporter, outsider, token, escrow };
}

describe("ProductEscrowConfidentialV1", function () {
  it("supports buyer deposit, seller confirmation, transporter funding, and delivery payout", async function () {
    const { owner, buyer, transporter, token, escrow } = await deployFixture();
    const escrowAddress = await escrow.getAddress();
    const tokenAddress = await token.getAddress();

    await mintTo({ token, owner, recipient: buyer, value: 100 });
    await mintTo({ token, owner, recipient: owner, value: 15 });
    await mintTo({ token, owner, recipient: transporter, value: 25 });

    const buyerPayload = hre.ethers.AbiCoder.defaultAbiCoder().encode(["uint8"], [0]);
    await depositWithCallback({
      token,
      sender: buyer,
      recipient: escrowAddress,
      value: 100,
      payload: buyerPayload,
    });

    expect(await escrow.buyer()).to.equal(buyer.address);
    expect(await escrow.purchased()).to.equal(true);
    expect(Number(await escrow.phase())).to.equal(1);

    await escrow.connect(owner).confirmOrder("ipfs://order-confirmed");
    expect(Number(await escrow.phase())).to.equal(2);

    await escrow.connect(transporter).createTransporter(15);
    await escrow.connect(owner).setTransporter(transporter.address);
    expect(await escrow.transporter()).to.equal(transporter.address);

    const sellerFeePayload = hre.ethers.AbiCoder.defaultAbiCoder().encode(["uint8"], [1]);
    await depositWithCallback({
      token,
      sender: owner,
      recipient: escrowAddress,
      value: 15,
      payload: sellerFeePayload,
    });
    expect(await escrow.hasSellerDeliveryFeeDeposit()).to.equal(true);
    expect(Number(await escrow.phase())).to.equal(2);

    const transporterDepositPayload = hre.ethers.AbiCoder.defaultAbiCoder().encode(["uint8"], [2]);
    await depositWithCallback({
      token,
      sender: transporter,
      recipient: escrowAddress,
      value: 25,
      payload: transporterDepositPayload,
    });
    expect(await escrow.hasTransporterSecurityDeposit()).to.equal(true);
    expect(Number(await escrow.phase())).to.equal(3);

    await escrow.connect(buyer).confirmDelivery("ipfs://delivered");
    expect(Number(await escrow.phase())).to.equal(4);

    const encryptedSellerBalance = await token.confidentialBalanceOf(owner.address);
    const clearSellerBalance = await hre.fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedSellerBalance,
      tokenAddress,
      owner,
    );
    expect(clearSellerBalance).to.equal(100n);

    const encryptedTransporterBalance = await token.confidentialBalanceOf(transporter.address);
    const clearTransporterBalance = await hre.fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedTransporterBalance,
      tokenAddress,
      transporter,
    );
    expect(clearTransporterBalance).to.equal(40n);
  });
});
