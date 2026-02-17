// src/utils/web3Utils.js

import { JsonRpcProvider, BrowserProvider, Wallet, Contract } from "ethers";
import ProductEscrowArtifact from "../abis/ProductEscrow_Initializer.json";

// 1) Ethers provider for read-only calls
export const ethersProvider = new JsonRpcProvider(
  process.env.REACT_APP_RPC_URL
);

// Internal helper to obtain a signer
async function getSigner() {
  if (window.ethereum) {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    const browserProvider = new BrowserProvider(window.ethereum);
    return browserProvider.getSigner();
  }
  if (process.env.REACT_APP_SELLER_PK) {
    return new Wallet(process.env.REACT_APP_SELLER_PK, ethersProvider);
  }
  throw new Error(
    "No signer available: install MetaMask or set REACT_APP_SELLER_PK"
  );
}

// 2) Confirm order on-chain (new contract: confirmOrder(vcCID) with string CID)
export async function confirmOrder(escrowAddress, vcCID) {
  const signer = await getSigner();
  const escrow = new Contract(
    escrowAddress,
    ProductEscrowArtifact.abi,
    signer
  );
  const tx = await escrow.confirmOrder(vcCID);
  return tx;
}

// 3) Read current VC hash (redesigned escrow stores hash on-chain)
export async function getCurrentCid(escrowAddress) {
  const escrow = new Contract(
    escrowAddress,
    ProductEscrowArtifact.abi,
    ethersProvider
  );
  return escrow.getVcHash().catch(() => "0x" + "0".repeat(64));
}

// 4) List all transporter offers (addresses + fees)
export async function getTransporters(productAddress) {
  try {
    const escrow = new Contract(
      productAddress,
      ProductEscrowArtifact.abi,
      ethersProvider
    );
    const [addresses, fees] = await escrow.getAllTransporters();
    return [addresses, fees];
  } catch (err) {
    console.error("getTransporters error:", err);
    return [[], []];
  }
}
