// Balance helpers for Railgun
// Exports: getAllBalances, refreshBalances

import { ethers } from 'ethers';
import { NetworkName, NETWORK_CONFIG } from '@railgun-community/shared-models';

/**
 * Get all balances (EOA public + Railgun private)
 * Returns combined balance information
 *
 * @returns {Promise<{ success: boolean, data: { eoa: Object, railgun: Object }, error?: string }>}
 */
export async function getAllBalances() {
  try {
    // Get EOA balances from MetaMask
    let eoaBalances = { eth: '0.0', weth: '0.0' };

    if (typeof window !== 'undefined' && window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();

        // Get ETH balance
        const ethBalance = await provider.getBalance(address);
        eoaBalances.eth = ethers.formatEther(ethBalance);

        // Get WETH balance (Sepolia WETH)
        const sepoliaConfig = NETWORK_CONFIG[NetworkName.EthereumSepolia];
        const WETH_ADDRESS = sepoliaConfig?.baseToken?.wrappedAddress || '0xfff9976782d46cc05630d1f6ebab18b2324d6b14';
        const wethABI = ['function balanceOf(address) view returns (uint256)'];
        const wethContract = new ethers.Contract(WETH_ADDRESS, wethABI, provider);
        const wethBalance = await wethContract.balanceOf(address);
        eoaBalances.weth = ethers.formatEther(wethBalance);
      } catch (eoaError) {
        console.warn('Failed to get EOA balances:', eoaError);
      }
    }

    // Get Railgun private balances
    let railgunBalances = { weth: 0n, pendingWeth: 0n, eth: 0n };

    try {
      // Check if we have a connected wallet
      const stored = localStorage.getItem('railgun.wallet');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.walletID) {
          // Try to get balances from SDK
          try {
            const client = await import('../railgun-client-browser.js');
            // SDK getPrivateBalances returns { spendable, pending } or similar
            const sdkBalances = await client.getPrivateBalances(parsed.walletID, []);
            if (sdkBalances) {
              railgunBalances.weth = BigInt(sdkBalances.spendable || sdkBalances.weth || 0);
              railgunBalances.pendingWeth = BigInt(sdkBalances.pending || sdkBalances.pendingWeth || 0);
            }
          } catch (sdkErr) {
            console.warn('SDK balance fetch failed, using zeros:', sdkErr.message);
            // Return zeros - SDK might not be initialized yet
          }
        }
      }
    } catch (railgunError) {
      console.warn('Failed to get Railgun balances:', railgunError);
    }

    return {
      success: true,
      data: {
        eoa: eoaBalances,
        railgun: railgunBalances
      }
    };
  } catch (error) {
    console.error('getAllBalances failed:', error);
    return {
      success: false,
      error: error.message,
      data: {
        eoa: { eth: '0.0', weth: '0.0' },
        railgun: { weth: 0n, pendingWeth: 0n, eth: 0n }
      }
    };
  }
}

export default { getAllBalances };
