import { ethers } from "ethers";
import ProductEscrowABI from "./abis/ProductEscrow_Initializer.json";

// Update these values for your test
const contractAddress = process.env.REACT_APP_FACTORY_ADDRESS; // Get from environment
const revealedValue = "4000000000000000000"; // as string, or use your actual value
const blinding = "0xb3c36fafcde4a8fdf88062747a71d69f7168ac7e8642d9a9c9aee4fa2c0cd41c"; // use your actual blinding

async function debugReveal() {
  // Connect to MetaMask or fallback to default provider
  let provider;
  if (window.ethereum) {
    provider = new ethers.BrowserProvider(window.ethereum);
    await window.ethereum.request({ method: "eth_requestAccounts" });
  } else {
    provider = ethers.getDefaultProvider();
  }

  const contract = new ethers.Contract(contractAddress, ProductEscrowABI.abi, provider);

  // 1. Get on-chain values
  const priceCommitment = await contract.priceCommitment();
  const buyer = await contract.buyer();
  const transporter = await contract.transporter();
  let sender;
  if (window.ethereum) {
    sender = (await provider.send("eth_requestAccounts", []))[0];
  } else {
    sender = null;
  }

  // 2. Compute local commitment
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "bytes32"], [revealedValue, blinding]);
  const computedCommitment = ethers.keccak256(encoded);

  // 3. Print everything
  console.log("On-chain priceCommitment:", priceCommitment);
  console.log("Computed commitment:", computedCommitment);
  console.log("Match?", priceCommitment === computedCommitment);
  console.log("Buyer (on-chain):", buyer);
  console.log("Your address:", sender);
  console.log("Transporter (on-chain):", transporter);

  // 4. Check modifiers
  if (sender && sender.toLowerCase() !== buyer.toLowerCase()) {
    console.warn("You are NOT the buyer!");
  } else if (sender) {
    console.log("You ARE the buyer.");
  }
  if (transporter === "0x0000000000000000000000000000000000000000") {
    console.warn("Transporter is NOT set!");
  } else {
    console.log("Transporter is set.");
  }
}

// Run the debug function if this file is executed directly (Node.js)
if (require.main === module) {
  debugReveal();
}

// Export for browser or other imports
export default debugReveal; 