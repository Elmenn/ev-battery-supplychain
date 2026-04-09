require("dotenv").config({ path: ".env.truffle" });
const hre = require("hardhat");

const SEPOLIA_WETH_ADDRESS = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
const WETH_ABI = [
  "function approve(address spender, uint256 value) returns (bool)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

function getArg(flag, fallback = undefined) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function getPositiveInt(flag, fallback) {
  const raw = getArg(flag, fallback == null ? undefined : String(fallback));
  if (raw == null) {
    throw new Error(`Missing required ${flag} value.`);
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flag} must be a positive integer. Received: ${raw}`);
  }
  return value;
}

function getAddress(flag, fallback) {
  const raw = getArg(flag, fallback);
  if (!raw || !hre.ethers.isAddress(raw)) {
    throw new Error(`${flag} must be a valid address.`);
  }
  return hre.ethers.getAddress(raw);
}

function formatMs(value) {
  return `${value.toFixed(0)} ms`;
}

function avg(numbers) {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

async function measureTx(label, sendTx) {
  const submittedAt = Date.now();
  const tx = await sendTx();
  const receipt = await tx.wait();
  const confirmedAt = Date.now();

  const latencyMs = confirmedAt - submittedAt;
  const effectiveGasPrice = receipt.gasPrice ?? tx.gasPrice ?? 0n;
  const feeWei = receipt.gasUsed * effectiveGasPrice;

  return {
    step: label,
    hash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    gasPriceGwei: hre.ethers.formatUnits(effectiveGasPrice, "gwei"),
    feeEth: hre.ethers.formatEther(feeWei),
    latencyMs,
  };
}

async function main() {
  const [buyer, seller, transporter] = await hre.ethers.getSigners();
  const wethAddress = getAddress("--weth", process.env.REACT_APP_ERC7984_PUBLIC_TOKEN || SEPOLIA_WETH_ADDRESS);
  const spender = getAddress("--spender", process.env.REACT_APP_ERC7984_FUNDING_WRAPPER);
  const amountWei = BigInt(
    getArg("--amount-wei", process.env.ERC7984_BASELINE_AMOUNT_WEI || "400000000000000")
  );
  const runs = getPositiveInt("--runs", process.env.ERC7984_BASELINE_RUNS || 3);

  if (amountWei <= 0n) {
    throw new Error("--amount-wei must be positive.");
  }

  const wethBuyer = new hre.ethers.Contract(wethAddress, WETH_ABI, buyer);
  const wethSeller = new hre.ethers.Contract(wethAddress, WETH_ABI, seller);
  const wethTransporter = new hre.ethers.Contract(wethAddress, WETH_ABI, transporter);

  const balances = await Promise.all([
    wethBuyer.balanceOf(buyer.address),
    wethSeller.balanceOf(seller.address),
    wethTransporter.balanceOf(transporter.address),
  ]);

  if (balances[0] < amountWei * BigInt(runs)) {
    throw new Error("Buyer does not have enough WETH for the requested transfer baseline runs.");
  }
  const rows = [];

  for (let index = 1; index <= runs; index += 1) {
    rows.push(
      await measureTx(`baseline_approve_run_${index}`, () =>
        wethBuyer.approve(spender, amountWei)
      )
    );
    rows.push(
      await measureTx(`baseline_transfer_buyer_to_seller_run_${index}`, () =>
        wethBuyer.transfer(seller.address, amountWei)
      )
    );
    rows.push(
      await measureTx(`baseline_transfer_seller_to_transporter_run_${index}`, () =>
        wethSeller.transfer(transporter.address, amountWei)
      )
    );
  }

  const grouped = {
    approve: rows.filter((row) => row.step.startsWith("baseline_approve_")),
    transfer_buyer_to_seller: rows.filter((row) =>
      row.step.startsWith("baseline_transfer_buyer_to_seller_")
    ),
    transfer_seller_to_transporter: rows.filter((row) =>
      row.step.startsWith("baseline_transfer_seller_to_transporter_")
    ),
  };

  const summary = Object.entries(grouped).map(([label, group]) => ({
    step: label,
    runs: group.length,
    avgGasUsed: avg(group.map((row) => Number(row.gasUsed))).toFixed(0),
    avgFeeEth: avg(group.map((row) => Number(row.feeEth))).toFixed(9),
    avgLatencyMs: avg(group.map((row) => row.latencyMs)).toFixed(0),
  }));

  console.log("");
  console.log(`WETH baseline amount per run: ${hre.ethers.formatEther(amountWei)} WETH`);
  console.log(`Runs per action           : ${runs}`);
  console.log("");
  console.table(
    rows.map((row) => ({
      step: row.step,
      gasUsed: row.gasUsed,
      feeETH: row.feeEth,
      latency: formatMs(row.latencyMs),
      block: row.blockNumber,
    }))
  );
  console.log("Averages:");
  console.table(summary);
  console.log("Detailed rows:");
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
