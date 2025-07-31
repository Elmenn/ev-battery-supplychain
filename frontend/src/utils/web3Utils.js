// src/utils/web3Utils.js

import { JsonRpcProvider, BrowserProvider, Wallet, Contract } from "ethers";
import Web3 from "web3";
import ProductEscrowArtifact from "../abis/ProductEscrow.json";

// 1) Ethers provider for read-only calls
export const ethersProvider = new JsonRpcProvider(
  process.env.REACT_APP_RPC_URL
);

// 2) Confirm order on-chain
export async function confirmOrder(escrowAddress, newCid, vcHash) {
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
    console.log("[confirmOrder] Arguments:", newCid, vcHash);
  } catch (err) {
    console.warn("[confirmOrder] Could not fetch contract state:", err);
  }
  // Try calling with or without vcHash depending on contract signature
  try {
    let tx;
    if (typeof vcHash !== 'undefined') {
      tx = await escrow.confirmOrder(newCid, vcHash);
    } else {
      tx = await escrow.confirmOrder(newCid);
    }
    return tx.wait();
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
