const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const DEFAULT_TOKEN_NAME = "Mock Confidential Order Token";
const DEFAULT_TOKEN_SYMBOL = "MCOT";
const DEFAULT_TOKEN_CONTRACT_URI = "ipfs://browser-confidential";

function loadLatestDeployment() {
  const deploymentPath = path.resolve(
    __dirname,
    "..",
    "..",
    "frontend",
    "public",
    "erc7984-sepolia-latest.json"
  );

  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Missing deployment file: ${deploymentPath}`);
  }

  return {
    deploymentPath,
    deployment: JSON.parse(fs.readFileSync(deploymentPath, "utf8")),
  };
}

async function verifyContract({ label, address, contract, constructorArguments }) {
  try {
    await hre.run("verify:verify", {
      address,
      contract,
      constructorArguments,
    });
    console.log(`Verified ${label}: ${address}`);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    if (
      /Already Verified/i.test(message) ||
      /Contract source code already verified/i.test(message) ||
      /Reason: Already Verified/i.test(message)
    ) {
      console.log(`Already verified ${label}: ${address}`);
      return;
    }
    throw error;
  }
}

async function main() {
  const apiKeyPresent = Boolean(process.env.ETHERSCAN_API_KEY && process.env.ETHERSCAN_API_KEY.trim());
  if (!apiKeyPresent) {
    throw new Error(
      "ETHERSCAN_API_KEY is not set. Add it to .env.truffle or the shell environment before running verification."
    );
  }

  const network = await hre.ethers.provider.getNetwork();
  if (Number(network.chainId) !== 11155111) {
    throw new Error(`This script is intended for Sepolia. Connected chainId: ${network.chainId}`);
  }

  const { deployment, deploymentPath } = loadLatestDeployment();
  console.log(`Using deployment file: ${deploymentPath}`);

  await verifyContract({
    label: "confidential token",
    address: deployment.confidentialToken,
    contract: "contracts/erc7984/MockConfidentialOrderToken.sol:MockConfidentialOrderToken",
    constructorArguments: [
      deployment.deployer,
      DEFAULT_TOKEN_NAME,
      DEFAULT_TOKEN_SYMBOL,
      DEFAULT_TOKEN_CONTRACT_URI,
    ],
  });

  await verifyContract({
    label: "funding wrapper",
    address: deployment.fundingWrapper,
    contract: "contracts/erc7984/ConfidentialPaymentFundingWrapper.sol:ConfidentialPaymentFundingWrapper",
    constructorArguments: [
      deployment.deployer,
      deployment.publicToken,
      deployment.confidentialToken,
    ],
  });

  await verifyContract({
    label: "escrow implementation",
    address: deployment.implementation,
    contract: "contracts/erc7984/ProductEscrowConfidential_Initializer.sol:ProductEscrowConfidential_Initializer",
    constructorArguments: [],
  });

  await verifyContract({
    label: "factory",
    address: deployment.factory,
    contract: "contracts/erc7984/ProductFactoryConfidential.sol:ProductFactoryConfidential",
    constructorArguments: [deployment.implementation],
  });

  console.log("");
  console.log("Verification completed for directly deployed contracts.");
  console.log(
    `Clone note: product escrow ${deployment.productEscrow} is a minimal proxy clone. Its implementation is verified at ${deployment.implementation}.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
