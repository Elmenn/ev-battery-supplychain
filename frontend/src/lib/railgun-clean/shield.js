// Shield functions for Railgun
// Wraps ETH to WETH and records shield transaction with backend

import { ethers } from 'ethers';
import { NETWORK_CONFIG, NetworkName } from '@railgun-community/shared-models';
import { getRailgunState } from './connection';

/**
 * Wrap ETH to WETH (standalone function)
 * Note: This only wraps ETH to WETH. For full shielding, use shieldWETH.
 *
 * @param {string} amountEth - Amount in ETH (e.g., "1.5")
 * @param {ethers.Signer} signer - Ethers signer (MetaMask)
 * @returns {Promise<{ success: boolean, txHash?: string, error?: string }>}
 */
export async function wrapETHtoWETH(amountEth, signer) {
  if (!signer) {
    throw new Error('Signer required for wrapETHtoWETH');
  }

  if (!amountEth || isNaN(parseFloat(amountEth))) {
    throw new Error('Valid amount required');
  }

  try {
    // Get WETH address from network config
    const networkName = NetworkName.EthereumSepolia;
    const sepoliaConfig = NETWORK_CONFIG[networkName];
    const WETH_ADDRESS = sepoliaConfig?.baseToken?.wrappedAddress || '0xfff9976782d46cc05630d1f6ebab18b2324d6b14';

    // Parse amount to Wei
    const amountWei = ethers.parseEther(amountEth.toString());

    console.log('Wrapping ETH to WETH:', {
      amountEth,
      amountWei: amountWei.toString(),
      wethAddress: WETH_ADDRESS
    });

    // WETH contract ABI for deposit
    const wethABI = [
      'function deposit() public payable',
      'function balanceOf(address) public view returns (uint256)'
    ];

    const wethContract = new ethers.Contract(WETH_ADDRESS, wethABI, signer);

    console.log('Sending wrap transaction...');
    const wrapTx = await wethContract.deposit({ value: amountWei });
    console.log('Wrap transaction sent:', wrapTx.hash);

    // Wait for confirmation
    const receipt = await wrapTx.wait();
    console.log('Wrap transaction confirmed:', receipt.hash);

    return { success: true, txHash: receipt.hash };
  } catch (error) {
    console.error('wrapETHtoWETH failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Shield WETH - Wrap ETH to WETH and record shield with backend
 * @param {string} amountEth - Amount in ETH (e.g., "1.5")
 * @param {ethers.Signer} signer - Ethers signer (MetaMask)
 * @returns {Promise<string>} Transaction hash
 */
export async function shieldWETH(amountEth, signer) {
  if (!signer) {
    throw new Error('Signer required for shieldWETH');
  }

  if (!amountEth || isNaN(parseFloat(amountEth))) {
    throw new Error('Valid amount required');
  }

  try {
    // Get network config
    const networkName = NetworkName.EthereumSepolia;
    const sepoliaConfig = NETWORK_CONFIG[networkName];
    const WETH_ADDRESS = sepoliaConfig?.baseToken?.wrappedAddress || '0xfff9976782d46cc05630d1f6ebab18b2324d6b14';

    // Get user address and provider
    const userAddress = await signer.getAddress();
    const provider = signer.provider;

    if (!provider) {
      throw new Error('Provider not available from signer');
    }

    // Parse amount to Wei
    const amountWei = ethers.parseEther(amountEth.toString());

    console.log('Shielding WETH:', {
      amountEth,
      amountWei: amountWei.toString(),
      wethAddress: WETH_ADDRESS,
      userAddress
    });

    // Get current block to use as part of txHash verification
    const currentBlock = await provider.getBlockNumber();
    console.log('Current block:', currentBlock);

    // STEP 1: Wrap ETH to WETH
    const wethABI = [
      'function deposit() public payable',
      'function balanceOf(address) public view returns (uint256)'
    ];

    const wethContract = new ethers.Contract(WETH_ADDRESS, wethABI, signer);

    console.log('Wrapping ETH to WETH...');
    const wrapTx = await wethContract.deposit({ value: amountWei });
    console.log('Wrap transaction sent:', wrapTx.hash);

    // Wait for wrap transaction to be mined
    const wrapReceipt = await wrapTx.wait();
    console.log('Wrap transaction mined:', {
      hash: wrapReceipt.hash,
      blockNumber: wrapReceipt.blockNumber
    });

    // Verify WETH balance
    const wethBalance = await wethContract.balanceOf(userAddress);
    console.log('WETH balance after wrap:', ethers.formatEther(wethBalance));

    // STEP 2: Record shield with backend
    const railgunState = getRailgunState();
    const railgunAddress = railgunState?.railgunAddress || 'unknown';

    const shieldPayload = {
      amount: amountWei.toString(),
      tokenAddress: WETH_ADDRESS,
      userAddress,
      txHash: wrapReceipt.hash,
      railgunAddress
    };

    console.log('Sending shield record to backend:', shieldPayload);

    const backendUrl = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_ZKP_BACKEND_URL) || 'http://localhost:5010';

    try {
      const shieldResponse = await fetch(`${backendUrl}/api/railgun/shield`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shieldPayload)
      });

      if (!shieldResponse.ok) {
        const errorData = await shieldResponse.json().catch(() => ({}));
        console.warn('Backend shield recording failed:', errorData.error || shieldResponse.statusText);
        // Don't throw - wrap succeeded, shield recording is best-effort
      } else {
        const shieldData = await shieldResponse.json();
        console.log('Shield recorded with backend:', shieldData);
      }
    } catch (backendError) {
      console.warn('Backend shield recording failed (non-critical):', backendError.message);
      // Don't throw - wrap succeeded, shield recording is best-effort
    }

    return wrapReceipt.hash;
  } catch (error) {
    console.error('shieldWETH failed:', error);
    throw error;
  }
}

/**
 * Get WETH balance for an address
 * @param {string} address - Ethereum address
 * @param {ethers.Provider} provider - Ethers provider (optional, uses default RPC if not provided)
 * @returns {Promise<string>} Balance in ETH
 */
export async function getWETHBalance(address, provider) {
  if (!provider) {
    const rpcUrl = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_RPC_URL) || 'https://rpc.sepolia.org';
    provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  const networkName = NetworkName.EthereumSepolia;
  const sepoliaConfig = NETWORK_CONFIG[networkName];
  const WETH_ADDRESS = sepoliaConfig?.baseToken?.wrappedAddress || '0xfff9976782d46cc05630d1f6ebab18b2324d6b14';

  const wethABI = ['function balanceOf(address) public view returns (uint256)'];
  const wethContract = new ethers.Contract(WETH_ADDRESS, wethABI, provider);

  const balance = await wethContract.balanceOf(address);
  return ethers.formatEther(balance);
}

/**
 * Estimate gas for shielding WETH
 * Note: This is a placeholder - actual ZK shield gas estimation requires SDK integration
 *
 * @param {string} amountEth - Amount to shield
 * @returns {Promise<{ success: boolean, gasEstimate?: string, error?: string }>}
 */
export async function estimateShieldWETH(amountEth) {
  // For now, return a rough estimate
  // Full implementation will require SDK integration in Phase 3
  console.warn('estimateShieldWETH: Using rough estimate (Phase 3 will add SDK integration)');

  try {
    // Rough estimate: WETH deposit costs ~45k gas, shield tx varies but ~200k-500k
    const depositGas = 45000n;
    const shieldGas = 350000n; // Conservative estimate
    const totalGas = depositGas + shieldGas;

    return {
      success: true,
      gasEstimate: totalGas.toString(),
      note: 'Rough estimate - actual gas may vary based on network conditions'
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default {
  wrapETHtoWETH,
  shieldWETH,
  getWETHBalance,
  estimateShieldWETH
};
