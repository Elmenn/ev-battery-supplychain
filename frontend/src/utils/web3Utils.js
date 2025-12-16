// src/utils/web3Utils.js

import { JsonRpcProvider, BrowserProvider, Wallet, Contract, getBytes, hexlify } from "ethers";
import Web3 from "web3";
import ProductEscrowArtifact from "../abis/ProductEscrow_Initializer.json";

// 1) Ethers provider for read-only calls
export const ethersProvider = new JsonRpcProvider(
  process.env.REACT_APP_RPC_URL
);

// 2) Confirm order on-chain
// @param escrowAddress - The escrow contract address
// @param newCid - The VC CID to store
// @param purchaseTxHashCommitment - Optional purchase TX hash commitment (bytes32 hex string with 0x prefix)
export async function confirmOrder(escrowAddress, newCid, purchaseTxHashCommitment) {
  let signer;
  if (window.ethereum) {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    const browserProvider = new BrowserProvider(window.ethereum);
    signer = await browserProvider.getSigner();
  } else if (process.env.REACT_APP_SELLER_PK) {
    signer = new Wallet(process.env.REACT_APP_SELLER_PK, ethersProvider);
  } else {
    throw new Error(
      "No signer available: install MetaMask or set REACT_APP_SELLER_PK"
    );
  }
  const escrow = new Contract(
    escrowAddress,
    ProductEscrowArtifact.abi,
    signer
  );
  // Debug: log contract state before call
  try {
    const phase = await escrow.phase();
    const owner = await escrow.owner();
    console.log("[confirmOrder] Current phase:", phase.toString());
    console.log("[confirmOrder] Contract owner:", owner);
    console.log("[confirmOrder] Current user:", await signer.getAddress());
    console.log("[confirmOrder] Arguments:", newCid, purchaseTxHashCommitment);
  } catch (err) {
    console.warn("[confirmOrder] Could not fetch contract state:", err);
  }
  
  try {
    let tx;
    // Always use confirmOrderWithCommitment if available (preferred function)
    const hasCommitmentFunction = typeof escrow.confirmOrderWithCommitment === 'function';
    
    if (hasCommitmentFunction) {
      // Ensure commitment is properly formatted as bytes32
      // Default to zero bytes32 if not provided or is zero
      let commitmentHex = purchaseTxHashCommitment || "0x0000000000000000000000000000000000000000000000000000000000000000";
      
      if (!commitmentHex.startsWith('0x')) {
        commitmentHex = `0x${commitmentHex}`;
      }
      
      // Ensure it's exactly 32 bytes (64 hex chars + 0x = 66 chars)
      const commitmentBytes = getBytes(commitmentHex);
      if (commitmentBytes.length !== 32) {
        // Pad or truncate to 32 bytes
        const padded = new Uint8Array(32);
        padded.set(commitmentBytes.slice(0, 32), 0);
        commitmentHex = hexlify(padded);
      }
      
      console.log("[confirmOrder] Calling confirmOrderWithCommitment with commitment:", commitmentHex);
      tx = await escrow.confirmOrderWithCommitment(newCid, commitmentHex);
    } else {
      // Fallback to regular confirmOrder only if confirmOrderWithCommitment doesn't exist
      console.log("[confirmOrder] confirmOrderWithCommitment not available, falling back to confirmOrder");
      tx = await escrow.confirmOrder(newCid);
    }
    return tx;
  } catch (err) {
    console.error("[confirmOrder] Error calling confirmOrder:", err);
    throw err;
  }
}

// 3) Read current VC CID
export async function getCurrentCid(escrowAddress) {
  const escrow = new Contract(
    escrowAddress,
    ProductEscrowArtifact.abi,
    ethersProvider
  );
  return escrow.vcCid();
}

// 4) List all transporter offers (addresses + fees)
export const web3 = new Web3(process.env.REACT_APP_RPC_URL);

export async function getTransporters(productAddress) {
  try {
    const productContract = new web3.eth.Contract(
      ProductEscrowArtifact.abi,
      productAddress
    );
    const result = await productContract.methods.getAllTransporters().call();

    // web3 may return object { '0': [...], '1': [...] } or an array
    const addresses = Array.isArray(result) ? result[0] : result["0"] || [];
    const fees      = Array.isArray(result) ? result[1] : result["1"] || [];
    return [addresses, fees];
  } catch (err) {
    console.error("getTransporters error:", err);
    return [[], []];
  }
}
