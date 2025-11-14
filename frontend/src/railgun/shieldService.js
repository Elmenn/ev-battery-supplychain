// src/railgun/shieldService.js
import { ethers } from "ethers";
import { shield as rgShield } from "./railgunWalletClient"; // real SDK shield (used when STRATEGY==='sdk')

const API = process.env.REACT_APP_RAILGUN_API_URL || "http://localhost:3001";
const STRATEGY = (process.env.REACT_APP_SHIELD_STRATEGY || "dev").toLowerCase();

// Phase 1B: Real Railgun SDK Integration
const isSDKShieldStrategy = () => STRATEGY === "sdk";

export async function shield({ amountWei, tokenAddress, userAddress, railgunAddress, chainId }) {
  // ---- Option A: DEV CREDIT (default / local chain) ----
  if (STRATEGY === "dev" || chainId === 1337n) {
    const token = tokenAddress ?? ethers.ZeroAddress;

    // 1) Credit a dev balance on backend (keeps UI flow unblocked on local)
    await fetch(`${API}/api/railgun/add-test-balance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        railgunAddress,
        tokenAddress: token,
        amountWei: amountWei.toString(),
      }),
    });

    // 2) Audit shield (dev hash placeholder)
    // 32-byte fake txhash for dev/audit compatibility
    const hex = [...window.crypto.getRandomValues(new Uint8Array(32))]
      .map((b) => b.toString(16).padStart(2, '0')).join('');
    const devHash = `0x${hex}`;
    await fetch(`${API}/api/railgun/shield`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amountWei.toString(),
        tokenAddress: token,
        userAddress,
        railgunAddress,
        txHash: devHash,
      }),
    });

    return { txHash: devHash, mocked: true };
  }

  // ---- Option B: REAL SHIELD VIA WALLET SDK ----
  if (isSDKShieldStrategy()) {
    try {
      // Use real SDK shield
      const { txHash } = await rgShield(tokenAddress, amountWei);
      
      console.log('🔧 SDK strategy: real shield completed:', txHash);
      
      // Audit to backend (same shape)
      await fetch(`${API}/api/railgun/shield`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountWei.toString(),
          tokenAddress,
          userAddress,
          railgunAddress,
          txHash: txHash,
        }),
      });

      return { txHash: txHash, mocked: false, sdk: true };
    } catch (error) {
      console.error('❌ SDK shield failed:', error);
      // Fall back to dev mode on SDK failure
      console.log('🔄 Falling back to dev mode due to SDK failure');
      return await shield({ amountWei, tokenAddress, userAddress, railgunAddress, chainId: 1337n });
    }
  }

  // ---- Option C: FALLBACK TO DEV MODE ----
  // NOTE: tokenAddress should be a real ERC-20 (WETH/USDC) on a supported network.
  const { txHash } = await rgShield(tokenAddress, amountWei);

  // Audit to backend (same shape)
  await fetch(`${API}/api/railgun/shield`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: amountWei.toString(),
      tokenAddress,
      userAddress,
      railgunAddress,
      txHash,
    }),
  });

  return { txHash };
}
