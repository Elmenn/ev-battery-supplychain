const hre = require("hardhat");

function getEnvString(name) {
  const raw = process.env[name];
  return raw && raw.trim() !== "" ? raw.trim() : undefined;
}

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

function isRateLimitError(error) {
  return (
    error?._status === 429 ||
    error?.status === 429 ||
    error?._relayerApiError?.label === "rate_limited" ||
    String(error?.message || "").includes("429")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRelayerRetry(label, action) {
  const maxAttempts = getEnvNumber("ERC7984_MINT_RETRY_ATTEMPTS", 4);
  const baseDelayMs = getEnvNumber("ERC7984_MINT_RETRY_DELAY_MS", 8000);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      if (!isRateLimitError(error) || attempt === maxAttempts) {
        throw error;
      }

      const delayMs = baseDelayMs * attempt;
      console.log(
        `${label} hit relayer rate limit (429). Waiting ${delayMs}ms before retry ${attempt + 1}/${maxAttempts}...`
      );
      await sleep(delayMs);
    }
  }
}

async function main() {
  const tokenAddress = getEnvString("ERC7984_MINT_TOKEN");
  const recipient = getEnvString("ERC7984_MINT_RECIPIENT");
  const amount = getEnvNumber("ERC7984_MINT_AMOUNT", 100);

  if (!tokenAddress || !hre.ethers.isAddress(tokenAddress)) {
    throw new Error("Set ERC7984_MINT_TOKEN to a valid token address.");
  }
  if (!recipient || !hre.ethers.isAddress(recipient)) {
    throw new Error("Set ERC7984_MINT_RECIPIENT to a valid recipient address.");
  }

  await withRelayerRetry("fhEVM CLI initialization", async () => {
    await hre.fhevm.initializeCLIApi();
  });

  const [owner] = await hre.ethers.getSigners();
  const token = await hre.ethers.getContractAt("ConfidentialOrderToken", tokenAddress, owner);

  console.log(`Network  : ${(await hre.ethers.provider.getNetwork()).name}`);
  console.log(`Owner    : ${owner.address}`);
  console.log(`Token    : ${tokenAddress}`);
  console.log(`Recipient: ${hre.ethers.getAddress(recipient)}`);
  console.log(`Amount   : ${amount}`);

  await withRelayerRetry(`Confidential mint to ${recipient}`, async () => {
    const input = hre.fhevm.createEncryptedInput(tokenAddress, owner.address);
    input.add64(amount);
    const encrypted = await input.encrypt();

    const tx = await token
      .connect(owner)
      .confidentialMint(recipient, encrypted.handles[0], encrypted.inputProof);
    const receipt = await tx.wait();
    console.log(`Mint tx  : ${receipt.hash}`);
  });

  console.log("Confidential mint complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
