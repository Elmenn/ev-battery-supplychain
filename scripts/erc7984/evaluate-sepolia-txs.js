require("dotenv").config({ path: ".env.truffle" });
const { ethers } = require("ethers");

const { SEPOLIA_RPC_URL, ALCHEMY_API_KEY } = process.env;

const rpcUrl =
  SEPOLIA_RPC_URL ||
  (ALCHEMY_API_KEY ? `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}` : undefined);

function usage() {
  console.log("");
  console.log("Usage:");
  console.log(
    "  node scripts/erc7984/evaluate-sepolia-txs.js label=0xHASH [label=0xHASH ...]"
  );
  console.log("");
  console.log("Example:");
  console.log(
    "  node scripts/erc7984/evaluate-sepolia-txs.js buyer_deposit=0x... seller_bond=0x..."
  );
  console.log("");
}

function parseArgs(argv) {
  return argv.map((entry) => {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
      throw new Error(`Invalid argument "${entry}". Expected label=0xHASH.`);
    }

    const label = entry.slice(0, separatorIndex).trim();
    const hash = entry.slice(separatorIndex + 1).trim();

    if (!label) {
      throw new Error(`Missing label in "${entry}".`);
    }
    if (!ethers.isHexString(hash, 32)) {
      throw new Error(`Invalid transaction hash for "${label}".`);
    }

    return { label, hash };
  });
}

function formatEth(value) {
  return ethers.formatEther(value);
}

async function resolveRow(provider, item) {
  const [tx, receipt] = await Promise.all([
    provider.getTransaction(item.hash),
    provider.getTransactionReceipt(item.hash),
  ]);

  if (!tx || !receipt) {
    throw new Error(`Transaction not found or not yet mined for ${item.label}.`);
  }

  const block = await provider.getBlock(receipt.blockNumber);
  const effectiveGasPrice = receipt.gasPrice ?? tx.gasPrice ?? 0n;
  const feeWei = receipt.gasUsed * effectiveGasPrice;

  return {
    step: item.label,
    hash: item.hash,
    status: receipt.status === 1 ? "success" : "reverted",
    blockNumber: receipt.blockNumber,
    timestamp: block ? new Date(Number(block.timestamp) * 1000).toISOString() : "",
    gasUsed: receipt.gasUsed.toString(),
    effectiveGasPriceWei: effectiveGasPrice.toString(),
    feeWei: feeWei.toString(),
    feeEth: formatEth(feeWei),
    from: tx.from,
    to: tx.to,
  };
}

async function main() {
  if (!rpcUrl) {
    throw new Error("Missing SEPOLIA_RPC_URL or ALCHEMY_API_KEY in .env.truffle.");
  }

  const args = process.argv.slice(2);
  if (args.length === 0) {
    usage();
    process.exit(1);
  }

  const items = parseArgs(args);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const rows = [];

  for (const item of items) {
    rows.push(await resolveRow(provider, item));
  }

  const totalFeeWei = rows.reduce((sum, row) => sum + BigInt(row.feeWei), 0n);

  console.log("");
  console.table(
    rows.map((row) => ({
      step: row.step,
      status: row.status,
      gasUsed: row.gasUsed,
      gasPriceGwei: ethers.formatUnits(row.effectiveGasPriceWei, "gwei"),
      feeETH: row.feeEth,
      block: row.blockNumber,
      timestamp: row.timestamp,
    }))
  );

  console.log("Detailed rows:");
  console.log(JSON.stringify(rows, null, 2));
  console.log("");
  console.log(`Total fee (ETH): ${formatEth(totalFeeWei)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
