const { expect } = require("chai");
const { FhevmType } = require("@fhevm/hardhat-plugin");
const hre = require("hardhat");

describe("ConfidentialPaymentFundingWrapper", function () {
  it("wraps public ERC-20 deposits into confidential ERC-7984 balance", async function () {
    const [deployer, buyer] = await hre.ethers.getSigners();

    const publicTokenFactory = await hre.ethers.getContractFactory("MockPublicPaymentToken");
    const publicToken = await publicTokenFactory.connect(deployer).deploy(deployer.address);
    await publicToken.waitForDeployment();

    const confidentialTokenFactory = await hre.ethers.getContractFactory("MockConfidentialOrderToken");
    const confidentialToken = await confidentialTokenFactory
      .connect(deployer)
      .deploy(deployer.address, "Mock Confidential Order Token", "MCOT", "ipfs://funding-wrapper");
    await confidentialToken.waitForDeployment();

    const wrapperFactory = await hre.ethers.getContractFactory("ConfidentialPaymentFundingWrapper");
    const wrapper = await wrapperFactory
      .connect(deployer)
      .deploy(deployer.address, await publicToken.getAddress(), await confidentialToken.getAddress());
    await wrapper.waitForDeployment();

    await hre.fhevm.assertCoprocessorInitialized(confidentialToken, "MockConfidentialOrderToken");

    await (await confidentialToken.connect(deployer).transferOwnership(await wrapper.getAddress())).wait();
    await (await publicToken.connect(deployer).mint(buyer.address, 150)).wait();
    await (await publicToken.connect(buyer).approve(await wrapper.getAddress(), 100)).wait();

    await (await wrapper.connect(buyer).deposit(100)).wait();

    expect(await publicToken.balanceOf(buyer.address)).to.equal(50n);
    expect(await publicToken.balanceOf(await wrapper.getAddress())).to.equal(100n);

    const encryptedBuyerBalance = await confidentialToken.confidentialBalanceOf(buyer.address);
    const clearBuyerBalance = await hre.fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBuyerBalance,
      await confidentialToken.getAddress(),
      buyer,
    );
    expect(clearBuyerBalance).to.equal(100n);
  });

  it("lets any wallet self-fund public test balance through the faucet", async function () {
    const [deployer, randomUser] = await hre.ethers.getSigners();

    const publicTokenFactory = await hre.ethers.getContractFactory("MockPublicPaymentToken");
    const publicToken = await publicTokenFactory.connect(deployer).deploy(deployer.address);
    await publicToken.waitForDeployment();

    await (await publicToken.connect(randomUser).faucet(250)).wait();

    expect(await publicToken.balanceOf(randomUser.address)).to.equal(250n);
  });
});
