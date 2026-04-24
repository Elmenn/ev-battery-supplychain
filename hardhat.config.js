require("dotenv").config({ path: ".env.truffle" });
require("@fhevm/hardhat-plugin");
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-verify");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");
const { CompilerDownloader, CompilerPlatform } = require("hardhat/internal/solidity/compiler/downloader");
const { getCompilersDir } = require("hardhat/internal/util/global-dir");

const {
  MNEMONIC,
  PRIVATE_KEY,
  SEPOLIA_RPC_URL,
  ALCHEMY_API_KEY,
  ETHERSCAN_API_KEY,
} = process.env;

const sepoliaUrl =
  SEPOLIA_RPC_URL ||
  (ALCHEMY_API_KEY ? `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}` : undefined);

function resolveAccounts() {
  if (PRIVATE_KEY) {
    return [PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`];
  }
  if (MNEMONIC) {
    return {
      mnemonic: MNEMONIC,
      count: 5,
      path: "m/44'/60'/0'/0",
    };
  }
  return [];
}

// Force Hardhat to use the WASM solc build in this environment.
// This avoids native-solc execution issues (HH505) seen on Windows sandbox setups.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({ solcVersion }) => {
  const compilersCache = await getCompilersDir();
  const wasmDownloader = CompilerDownloader.getConcurrencySafeDownloader(
    CompilerPlatform.WASM,
    compilersCache
  );

  await wasmDownloader.downloadCompiler(solcVersion, async () => {}, async () => {});
  const wasmCompiler = await wasmDownloader.getCompiler(solcVersion);

  if (wasmCompiler === undefined) {
    throw new Error(`WASM build of solc ${solcVersion} is unavailable`);
  }

  return wasmCompiler;
});

module.exports = {
  solidity: {
    preferWasm: true,
    version: "0.8.27",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",
    },
  },
  paths: {
    sources: "./contracts/erc7984",
    tests: "./test/erc7984",
    cache: "./hardhat-cache",
    artifacts: "./hardhat-artifacts",
  },
  networks: {
    ...(sepoliaUrl
      ? {
          sepolia: {
            url: sepoliaUrl,
            chainId: 11155111,
            accounts: resolveAccounts(),
          },
        }
      : {}),
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY || "",
  },
  mocha: {
    timeout: 180000,
  },
};
