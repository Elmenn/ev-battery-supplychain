// Private Transfer functions for Railgun (Sepolia)
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
import {
  gasEstimateForUnprovenTransfer,
  generateTransferProof,
  populateProvedTransfer,
  refreshBalances,
} from '@railgun-community/wallet';
import { initializeSDK } from '../railgun-client-browser';

// -------------------------
// Helper functions
// -------------------------

/**
 * Derive encryption key from MetaMask signature
 * Same pattern as shield.js getShieldPrivateKey
 */
async function deriveEncryptionKey(signer, fromWalletAddress) {
  const baseMsg = 'Railgun Wallet Encryption Key';
  const contextualMsg = `${baseMsg}\nChain: ${NetworkName.EthereumSepolia}\nEOA: ${fromWalletAddress}`;

  const sig = await signer.signMessage(contextualMsg);
  return ethers.keccak256(ethers.toUtf8Bytes(sig));
}

// -------------------------
// Public API
// -------------------------

/**
 * Execute a private transfer from buyer to seller
 *
 * @param {Object} params - Transfer parameters
 * @param {string} params.toRailgunAddress - Recipient 0zk address
 * @param {BigInt|string} params.amountWei - Amount in wei (BigInt)
 * @param {string} [params.tokenAddress] - ERC-20 address (default: WETH)
 * @param {string} [params.productId] - Product ID for memo generation
 * @param {Function} [params.onProgress] - Progress callback: (state) => void
 * @returns {Promise<Object>} { success, txHash, memoHash, railgunTxRef, nullifiers }
 */
export async function privateTransfer({
  toRailgunAddress,
  amountWei,
  tokenAddress,
  productId,
  onProgress
}) {
  console.log('[Transfer] ===== START privateTransfer =====');

  try {
    // 1. Validate inputs
    if (!toRailgunAddress || !toRailgunAddress.startsWith('0zk')) {
      throw new Error('Invalid recipient Railgun address - must start with 0zk');
    }

    const amountBigInt = BigInt(amountWei);
    if (amountBigInt <= 0n) {
      throw new Error('Invalid transfer amount - must be greater than 0');
    }

    // 2. Ensure SDK is initialized
    onProgress?.({ step: 'init', message: 'Initializing SDK...' });
    console.log('[Transfer] Ensuring SDK is initialized...');

    const initResult = await initializeSDK();
    if (!initResult.success) {
      throw new Error(`SDK initialization failed: ${initResult.error}`);
    }
    console.log('[Transfer] SDK initialized successfully');

    // 3. Get wallet info from localStorage
    const stored = JSON.parse(localStorage.getItem('railgun.wallet') || 'null');
    if (!stored?.walletID) {
      throw new Error('No Railgun wallet connected - walletID missing');
    }
    const { walletID } = stored;
    console.log('[Transfer] Using walletID:', walletID);

    // 4. Get signer and derive encryptionKey from signature
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('MetaMask not available');
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const fromWalletAddress = await signer.getAddress();
    console.log('[Transfer] Sender EOA:', fromWalletAddress);

    // CRITICAL: Derive encryptionKey from signature (NOT stored in localStorage)
    onProgress?.({ step: 'sign', message: 'Please sign to authorize transfer...' });
    console.log('[Transfer] Deriving encryptionKey from signature...');
    const encryptionKey = await deriveEncryptionKey(signer, fromWalletAddress);
    console.log('[Transfer] encryptionKey derived');

    // 5. Setup network
    const networkName = NetworkName.EthereumSepolia;
    const sepoliaConfig = NETWORK_CONFIG[networkName];
    const chain = sepoliaConfig.chain;

    // Use WETH if tokenAddress not provided
    const actualTokenAddress = tokenAddress || sepoliaConfig.baseToken.wrappedAddress;
    console.log('[Transfer] Using token:', actualTokenAddress);

    // 6. Build recipients array - CRITICAL: Use BigInt for amount (not string)
    const erc20AmountRecipients = [{
      tokenAddress: actualTokenAddress,
      amount: amountBigInt,
      recipientAddress: toRailgunAddress
    }];
    console.log('[Transfer] Recipients:', erc20AmountRecipients);

    // 7. Generate memo and hash for on-chain recording
    const memoText = `EV-Battery-Payment:${productId || 'direct'}:${Date.now()}`;
    const memoHash = ethers.keccak256(ethers.toUtf8Bytes(memoText));
    console.log('[Transfer] memoText:', memoText);
    console.log('[Transfer] memoHash:', memoHash);

    // 8. Get fee data for gas details
    const fee = await provider.getFeeData();
    const evmGasType = getEVMGasTypeForTransaction(networkName, true);

    const originalGasDetails = {
      evmGasType,
      gasEstimate: 0n, // Will be filled by gas estimation
      maxFeePerGas: BigInt(fee.maxFeePerGas ?? 0),
      maxPriorityFeePerGas: BigInt(fee.maxPriorityFeePerGas ?? 0),
    };

    // 9. Step 1 of 3: Gas Estimation
    onProgress?.({ step: 'estimate', message: 'Estimating gas...' });
    console.log('[Transfer] Step 1/3: Estimating gas...');

    const gasEstimateResult = await gasEstimateForUnprovenTransfer(
      TXIDVersion.V2_PoseidonMerkle,
      networkName,
      walletID,
      encryptionKey,
      memoText,
      erc20AmountRecipients,
      [], // nftAmountRecipients
      originalGasDetails,
      undefined, // feeTokenDetails (no broadcaster)
      true // sendWithPublicWallet
    );

    console.log('[Transfer] Gas estimate result:', gasEstimateResult);

    const gasDetails = {
      evmGasType,
      gasEstimate: BigInt(gasEstimateResult.gasEstimate),
      maxFeePerGas: BigInt(fee.maxFeePerGas ?? 0),
      maxPriorityFeePerGas: BigInt(fee.maxPriorityFeePerGas ?? 0),
    };

    // Calculate batch min gas price for proof generation
    const overallBatchMinGasPrice = calculateGasPrice(gasDetails);
    console.log('[Transfer] overallBatchMinGasPrice:', overallBatchMinGasPrice);

    // 10. Step 2 of 3: Generate ZK Proof (20-30 seconds)
    onProgress?.({ step: 'proving', message: 'Generating ZK proof... (this takes 20-30 seconds)', progress: 0 });
    console.log('[Transfer] Step 2/3: Generating ZK proof...');

    await generateTransferProof(
      TXIDVersion.V2_PoseidonMerkle,
      networkName,
      walletID,
      encryptionKey,
      false, // showSenderAddressToRecipient
      memoText,
      erc20AmountRecipients,
      [], // nftAmountRecipients
      undefined, // broadcasterFeeERC20AmountRecipient
      true, // sendWithPublicWallet
      overallBatchMinGasPrice,
      (progress, status) => {
        const progressPercent = Math.round(progress * 100);
        onProgress?.({
          step: 'proving',
          message: `Generating ZK proof... ${progressPercent}%`,
          progress: progressPercent
        });
        console.log(`[Transfer] Proof progress: ${progressPercent}%`, status);
      }
    );

    console.log('[Transfer] Proof generated successfully');

    // 11. Step 3 of 3: Populate Transaction
    onProgress?.({ step: 'populate', message: 'Building transaction...' });
    console.log('[Transfer] Step 3/3: Populating transaction...');

    const { transaction, nullifiers, preTransactionPOIsPerTxidLeafPerList } =
      await populateProvedTransfer(
        TXIDVersion.V2_PoseidonMerkle,
        networkName,
        walletID,
        false, // showSenderAddressToRecipient
        memoText,
        erc20AmountRecipients,
        [], // nftAmountRecipients
        undefined, // broadcasterFeeERC20AmountRecipient
        true, // sendWithPublicWallet
        overallBatchMinGasPrice,
        gasDetails
      );

    console.log('[Transfer] Transaction populated, nullifiers:', nullifiers);

    // 12. Extract railgunTxRef from nullifiers
    const railgunTxRef = nullifiers[0] || ethers.ZeroHash;
    console.log('[Transfer] railgunTxRef:', railgunTxRef);

    // 13. Send transaction
    onProgress?.({ step: 'sending', message: 'Sending transaction...' });
    console.log('[Transfer] Sending transaction...');

    const tx = await signer.sendTransaction(transaction);
    console.log('[Transfer] Transaction sent, hash:', tx.hash);

    // 14. Wait for confirmation
    onProgress?.({ step: 'confirming', message: 'Waiting for confirmation...' });
    const receipt = await tx.wait();
    console.log('[Transfer] Transaction confirmed:', receipt.hash);

    // 15. Refresh balances (non-blocking - transaction already succeeded)
    onProgress?.({ step: 'refresh', message: 'Refreshing balances...' });
    try {
      await refreshBalances(chain, [walletID]);
      console.log('[Transfer] Balances refreshed');
    } catch (refreshError) {
      // Balance refresh failure is non-critical - transaction already confirmed
      console.warn('[Transfer] Balance refresh failed (non-critical):', refreshError.message);
    }

    console.log('[Transfer] ===== END privateTransfer (SUCCESS) =====');

    onProgress?.({ step: 'complete', message: 'Transfer complete!' });

    return {
      success: true,
      txHash: receipt.hash,
      memoHash,
      railgunTxRef,
      nullifiers
    };

  } catch (error) {
    console.error('[Transfer] ===== END privateTransfer (FAILED) =====');
    console.error('[Transfer] Error:', error);

    onProgress?.({ step: 'error', message: error.message || String(error) });

    return {
      success: false,
      error: error.message || String(error)
    };
  }
}

export default {
  privateTransfer,
};
