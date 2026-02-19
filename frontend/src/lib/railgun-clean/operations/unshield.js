// Private unshield operation for Railgun (Sepolia)
// Implements 3-step SDK flow: gas estimate -> proof generation -> populate transaction

import { ethers } from 'ethers';
import {
  NetworkName,
  NETWORK_CONFIG,
  TXIDVersion,
  EVMGasType,
  getEVMGasTypeForTransaction,
  calculateGasPrice,
} from '@railgun-community/shared-models';
import { initializeSDK } from '../../railgun-client-browser';
import { decryptMnemonic } from '../crypto.js';
import { RAILGUN_WALLET_SIGNATURE_MESSAGE } from '../constants.js';
import { getEngine as getLocalEngine, hasEngine as hasLocalEngine } from '../../railgun/core/engine.js';

let SDK = null;
let sdkEngineInjected = false;

async function ensureSDKEngine() {
  if (sdkEngineInjected && SDK) {
    return SDK;
  }

  console.log('[Unshield] Loading SDK module...');
  SDK = await import('@railgun-community/wallet');

  if (!hasLocalEngine()) {
    throw new Error('Local Railgun engine not initialized. Call initializeSDK() first.');
  }

  const localEngine = getLocalEngine();
  if (!localEngine) {
    throw new Error('Failed to get local Railgun engine instance.');
  }

  let sdkHasEngine = false;
  try {
    const sdkEngine = SDK.getEngine?.();
    sdkHasEngine = !!sdkEngine;
  } catch (_e) {
    // Expected when SDK engine is not yet initialized.
  }

  if (!sdkHasEngine) {
    if (typeof SDK.setEngine === 'function') {
      SDK.setEngine(localEngine);
      console.log('[Unshield] Injected local engine into SDK singleton');
    } else {
      throw new Error('SDK.setEngine not available. Cannot initialize unshield engine context.');
    }
  }

  try {
    const envRpcUrl = process.env.REACT_APP_RAILGUN_SCAN_RPC_URL || process.env.REACT_APP_RPC_URL;
    const safeScanRpcUrl =
      envRpcUrl && !String(envRpcUrl).toLowerCase().includes('alchemy.com')
        ? envRpcUrl
        : null;
    if (envRpcUrl && !safeScanRpcUrl) {
      console.warn('[Unshield] Skipping Alchemy RPC for scan provider due to free-tier eth_getLogs limits.');
    }

    const fallbackProviderConfig = {
      chainId: 11155111,
      providers: [
        ...(safeScanRpcUrl ? [{
          provider: safeScanRpcUrl,
          priority: 1,
          weight: 3,
          maxLogsPerBatch: 10,
          stallTimeout: 2500,
        }] : []),
        {
          provider: 'https://ethereum-sepolia.publicnode.com',
          priority: 2,
          weight: 2,
          maxLogsPerBatch: 5,
          stallTimeout: 2500,
        },
      ],
    };

    if (typeof SDK.loadProvider === 'function') {
      if (typeof SDK.unloadProvider === 'function') {
        try {
          await SDK.unloadProvider(NetworkName.EthereumSepolia);
        } catch {
          // Provider may not be loaded yet.
        }
      }
      await SDK.loadProvider(fallbackProviderConfig, NetworkName.EthereumSepolia, 2000);
      console.log('[Unshield] SDK provider configured');
    }
  } catch (providerErr) {
    console.log('[Unshield] Provider setup note:', providerErr?.message || providerErr);
  }

  sdkEngineInjected = true;
  return SDK;
}

async function resolveGasDetails(provider, networkName) {
  let feeData = null;
  let gasPrice = null;

  try {
    feeData = await provider.getFeeData();
  } catch (feeErr) {
    console.warn('[Unshield] getFeeData failed, falling back to gasPrice:', feeErr?.message || feeErr);
  }

  const hasType2Fees = feeData?.maxFeePerGas != null && feeData?.maxPriorityFeePerGas != null;
  if (hasType2Fees) {
    const evmGasType = getEVMGasTypeForTransaction(networkName, true);
    return {
      evmGasType,
      maxFeePerGas: BigInt(feeData.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(feeData.maxPriorityFeePerGas),
    };
  }

  gasPrice = feeData?.gasPrice ?? null;
  if (!gasPrice && typeof provider.getGasPrice === 'function') {
    gasPrice = await provider.getGasPrice();
  }

  if (!gasPrice) {
    throw new Error('Unable to determine gas price for unshield.');
  }

  return {
    evmGasType: EVMGasType.Type0,
    gasPrice: BigInt(gasPrice),
  };
}

/**
 * Unshield private WETH to a public EOA address.
 *
 * @param {Object} params
 * @param {bigint|string|number} params.amountWei - Amount to unshield, in wei.
 * @param {string} [params.toWalletAddress] - Destination EOA (defaults to active MetaMask account).
 * @param {string} [params.tokenAddress] - ERC-20 token address (defaults to Sepolia WETH).
 * @param {(state: {step: string, message: string, progress?: number}) => void} [params.onProgress]
 * @returns {Promise<{success: boolean, txHash?: string, railgunTxRef?: string, nullifiers?: string[], error?: string}>}
 */
export async function unshieldWETH({
  amountWei,
  toWalletAddress,
  tokenAddress,
  onProgress,
}) {
  console.log('[Unshield] ===== START unshieldWETH =====');
  console.log('[Unshield] amountWei:', amountWei);
  console.log('[Unshield] toWalletAddress:', toWalletAddress);

  try {
    const amountBigInt = BigInt(amountWei);
    if (amountBigInt <= 0n) {
      throw new Error('Invalid unshield amount - must be greater than 0');
    }

    onProgress?.({ step: 'init', message: 'Initializing SDK...' });
    const initResult = await initializeSDK();
    if (!initResult.success) {
      throw new Error(`SDK initialization failed: ${initResult.error}`);
    }

    const stored = JSON.parse(localStorage.getItem('railgun.wallet') || 'null');
    if (!stored?.walletID) {
      throw new Error('No Railgun wallet connected - walletID missing');
    }

    const walletID = stored.walletID;

    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('MetaMask not available');
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const fromWalletAddress = await signer.getAddress();
    const destinationAddress = toWalletAddress || fromWalletAddress;

    if (!ethers.isAddress(destinationAddress)) {
      throw new Error('Invalid destination EOA address for unshield');
    }

    onProgress?.({ step: 'sign', message: 'Please sign to authorize unshield...' });
    const signature = await signer.signMessage(RAILGUN_WALLET_SIGNATURE_MESSAGE);
    const encryptionKey = ethers.keccak256(ethers.toUtf8Bytes(signature));
    const encryptionKeyBytes = ethers.getBytes(encryptionKey);

    onProgress?.({ step: 'sdk', message: 'Preparing unshield engine...' });
    const sdk = await ensureSDKEngine();

    let decryptedMnemonic = null;
    if (stored?.encryptedMnemonic) {
      try {
        decryptedMnemonic = await decryptMnemonic(stored.encryptedMnemonic, signature);
      } catch (decryptErr) {
        console.warn('[Unshield] Failed to decrypt mnemonic:', decryptErr?.message || decryptErr);
      }
    }

    let sdkWalletID = walletID;
    try {
      if (typeof sdk.walletForID === 'function') {
        const wallet = sdk.walletForID(walletID);
        if (!wallet) throw new Error('Wallet lookup returned empty');
      }
    } catch (_walletErr) {
      if (!decryptedMnemonic) {
        throw new Error('Unable to decrypt wallet mnemonic - cannot proceed with unshield');
      }

      try {
        const created = await sdk.createRailgunWallet(
          encryptionKeyBytes,
          decryptedMnemonic,
          undefined,
          0
        );
        sdkWalletID = created?.id || created?.walletID || walletID;
        console.log('[Unshield] Wallet created in engine, ID:', sdkWalletID);
      } catch (createErr) {
        if (
          !createErr?.message?.includes('already exists') &&
          !createErr?.message?.includes('already loaded')
        ) {
          throw createErr;
        }
      }
    }

    if (typeof sdk.getWalletMnemonic === 'function') {
      try {
        await sdk.getWalletMnemonic(encryptionKeyBytes, sdkWalletID);
      } catch (_keyErr) {
        throw new Error('Wallet encryption key mismatch. Please reconnect your Railgun wallet.');
      }
    }

    const networkName = NetworkName.EthereumSepolia;
    const chain = NETWORK_CONFIG[networkName].chain;
    const actualTokenAddress =
      tokenAddress || NETWORK_CONFIG[networkName]?.baseToken?.wrappedAddress;

    if (!actualTokenAddress) {
      throw new Error('Could not resolve token address for unshield');
    }

    onProgress?.({ step: 'scan', message: 'Checking spendable funds...' });
    try {
      await sdk.refreshBalances(chain, [sdkWalletID]);
    } catch (refreshErr) {
      console.warn('[Unshield] Preflight refresh warning:', refreshErr?.message || refreshErr);
    }

    const erc20AmountRecipients = [{
      tokenAddress: actualTokenAddress,
      amount: amountBigInt,
      recipientAddress: destinationAddress,
    }];

    const baseGasDetails = await resolveGasDetails(provider, networkName);
    const originalGasDetails = {
      ...baseGasDetails,
      gasEstimate: 0n,
    };

    onProgress?.({ step: 'estimate', message: 'Estimating gas...' });
    const gasEstimateResult = await sdk.gasEstimateForUnprovenUnshield(
      TXIDVersion.V2_PoseidonMerkle,
      networkName,
      sdkWalletID,
      encryptionKeyBytes,
      erc20AmountRecipients,
      [],
      originalGasDetails,
      undefined,
      true
    );

    const gasDetails = {
      ...baseGasDetails,
      gasEstimate: BigInt(gasEstimateResult.gasEstimate),
    };
    const overallBatchMinGasPrice = calculateGasPrice(gasDetails);

    onProgress?.({
      step: 'proving',
      message: 'Generating ZK proof... (this takes 20-30 seconds)',
      progress: 0,
    });
    await sdk.generateUnshieldProof(
      TXIDVersion.V2_PoseidonMerkle,
      networkName,
      sdkWalletID,
      encryptionKeyBytes,
      erc20AmountRecipients,
      [],
      undefined,
      true,
      overallBatchMinGasPrice,
      (progress, status) => {
        const progressPercent = Math.round(progress * 100);
        onProgress?.({
          step: 'proving',
          message: `Generating ZK proof... ${progressPercent}%`,
          progress: progressPercent,
        });
        console.log(`[Unshield] Proof progress: ${progressPercent}%`, status);
      }
    );

    onProgress?.({ step: 'populate', message: 'Building transaction...' });
    const { transaction, nullifiers } = await sdk.populateProvedUnshield(
      TXIDVersion.V2_PoseidonMerkle,
      networkName,
      sdkWalletID,
      erc20AmountRecipients,
      [],
      undefined,
      true,
      overallBatchMinGasPrice,
      gasDetails
    );

    onProgress?.({ step: 'sending', message: 'Sending transaction...' });
    const tx = await signer.sendTransaction(transaction);

    onProgress?.({ step: 'confirming', message: 'Waiting for confirmation...' });
    const receipt = await tx.wait();

    onProgress?.({ step: 'refresh', message: 'Refreshing balances...' });
    try {
      await sdk.refreshBalances(chain, [sdkWalletID]);
    } catch (refreshErr) {
      console.warn('[Unshield] Post-send balance refresh failed (non-critical):', refreshErr?.message || refreshErr);
    }

    const railgunTxRef = nullifiers?.[0] || ethers.ZeroHash;
    onProgress?.({ step: 'complete', message: 'Unshield complete!' });
    console.log('[Unshield] ===== END unshieldWETH (SUCCESS) =====');

    return {
      success: true,
      txHash: receipt.hash,
      railgunTxRef,
      nullifiers: nullifiers || [],
    };
  } catch (error) {
    console.error('[Unshield] ===== END unshieldWETH (FAILED) =====');
    console.error('[Unshield] Error:', error);
    onProgress?.({ step: 'error', message: error?.message || String(error) });
    return {
      success: false,
      error: error?.message || String(error),
    };
  }
}

const railgunUnshieldApi = { unshieldWETH };

export default railgunUnshieldApi;

