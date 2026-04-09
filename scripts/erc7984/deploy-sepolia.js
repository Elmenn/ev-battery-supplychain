const hre = require("hardhat");

async function main() {
  const [owner] = await hre.ethers.getSigners();

  console.log(`Deploying with owner: ${owner.address}`);
  console.log(`Network: ${(await hre.ethers.provider.getNetwork()).name}`);

  const tokenFactory = await hre.ethers.getContractFactory("MockConfidentialOrderToken");
  const token = await tokenFactory
    .connect(owner)
    .deploy(owner.address, "Mock Confidential Order Token", "MCOT", "ipfs://erc7984-spike-token");
  await token.waitForDeployment();

  const escrowFactory = await hre.ethers.getContractFactory("ConfidentialOrderEscrow");
  const escrow = await escrowFactory.connect(owner).deploy(owner.address, await token.getAddress());
  await escrow.waitForDeployment();

  console.log("");
  console.log("ERC-7984 spike deployed");
  console.log(`Token:  ${await token.getAddress()}`);
  console.log(`Escrow: ${await escrow.getAddress()}`);
  console.log(`Owner:  ${owner.address}`);
  console.log("");
  console.log("Suggested next step:");
  console.log(
    `npx hardhat run --config hardhat.config.js --network sepolia scripts/erc7984/smoke-sepolia.js --token ${await token.getAddress()} --escrow ${await escrow.getAddress()}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
