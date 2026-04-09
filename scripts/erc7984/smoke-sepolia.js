const { FhevmType } = require("@fhevm/hardhat-plugin");
const hre = require("hardhat");

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

async function main() {
  const tokenAddress = getArg("--token") || process.env.ERC7984_SPIKE_TOKEN;
  const escrowAddress = getArg("--escrow") || process.env.ERC7984_SPIKE_ESCROW;
  const release = hasFlag("--release") || process.env.ERC7984_SPIKE_RELEASE === "true";

  if (!tokenAddress || !escrowAddress) {
    throw new Error(
      "Missing token/escrow address. Pass --token 0x... --escrow 0x... or set ERC7984_SPIKE_TOKEN / ERC7984_SPIKE_ESCROW."
    );
  }

  await hre.fhevm.initializeCLIApi();

  const [owner, buyer, seller] = await hre.ethers.getSigners();
  const token = await hre.ethers.getContractAt("MockConfidentialOrderToken", tokenAddress, owner);
  const escrow = await hre.ethers.getContractAt("ConfidentialOrderEscrow", escrowAddress, owner);

  console.log(`Owner : ${owner.address}`);
  console.log(`Buyer : ${buyer.address}`);
  console.log(`Seller: ${seller.address}`);
  console.log(`Token : ${tokenAddress}`);
  console.log(`Escrow: ${escrowAddress}`);

  const mintInput = hre.fhevm.createEncryptedInput(tokenAddress, owner.address);
  mintInput.add64(25);
  const encryptedMint = await mintInput.encrypt();

  let tx = await token
    .connect(owner)
    .confidentialMint(buyer.address, encryptedMint.handles[0], encryptedMint.inputProof);
  await tx.wait();
  console.log("Minted confidential amount to buyer.");

  const orderId = hre.ethers.keccak256(
    hre.ethers.toUtf8Bytes(`erc7984-sepolia-order-${Date.now()}`)
  );
  const callbackData = hre.ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "address"],
    [orderId, seller.address]
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
      callbackData
    );
  await tx.wait();
  console.log(`Recorded confidential escrow payment for order ${orderId}.`);

  let order = await escrow.getOrder(orderId);
  console.log("Order after payment:");
  console.log({
    buyer: order.buyer,
    seller: order.seller,
    token: order.token,
    phase: Number(order.phase),
    paidAt: Number(order.paidAt),
    releasedAt: Number(order.releasedAt),
  });

  if (!release) {
    console.log("Smoke complete without seller release. Re-run with --release to test payout.");
    return;
  }

  tx = await escrow.connect(seller).releaseToSeller(orderId);
  await tx.wait();
  console.log("Seller release executed.");

  order = await escrow.getOrder(orderId);
  console.log("Order after seller release:");
  console.log({
    buyer: order.buyer,
    seller: order.seller,
    token: order.token,
    phase: Number(order.phase),
    paidAt: Number(order.paidAt),
    releasedAt: Number(order.releasedAt),
  });

  const encryptedSellerBalance = await token.confidentialBalanceOf(seller.address);
  const clearSellerBalance = await hre.fhevm.userDecryptEuint(
    FhevmType.euint64,
    encryptedSellerBalance,
    tokenAddress,
    seller
  );

  console.log(`Seller decrypted balance: ${clearSellerBalance.toString()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
