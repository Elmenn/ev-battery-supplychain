// Private Transfer functions for Railgun (Sepolia)
// Implements 3-step SDK flow: gas estimate -> proof generation -> populate transaction
//
// ARCHITECTURE NOTE:
// Instead of starting a separate SDK engine (which would lack our custom quick-sync),
// we inject the LOCAL engine into the SDK's singleton. This way:
// - SDK transfer functions use our local engine (which has merkletree data from subgraph)
// - No duplicate engines or database conflicts
// - Wallet created in local engine is accessible to SDK transfer functions

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

// Load SDK dynamically to ensure engine is started first
let SDK = null;
let sdkEngineInjected = false;

async function ensureSDKEngine() {
  if (sdkEngineInjected && SDK) {
    return SDK;
  }

  console.log('[Transfer] Loading SDK module...');
  SDK = await import('@railgun-community/wallet');

  // CRITICAL: Instead of starting a new SDK engine, we inject our LOCAL engine
  // into the SDK's singleton. Our local engine has:
  // 1. Custom quick-sync that fetches from subgraph
  // 2. Already-synced merkletree data
  // 3. The wallet already created

  // Check if local engine is available
  if (!hasLocalEngine()) {
    throw new Error('Local Railgun engine not initialized. Call initializeSDK() first.');
  }

  const localEngine = getLocalEngine();
  if (!localEngine) {
    throw new Error('Failed to get local Railgun engine instance.');
  }

  console.log('[Transfer] Local engine found, checking SDK engine state...');

  // Check if SDK already has an engine
  let sdkHasEngine = false;
  try {
    const sdkEngine = SDK.getEngine?.();
    sdkHasEngine = !!sdkEngine;
    if (sdkHasEngine) {
      console.log('[Transfer] SDK already has an engine');
    }
  } catch (e) {
    // SDK getEngine() throws if no engine - that's expected
  }

  // Inject our local engine into SDK's singleton if needed
  if (!sdkHasEngine) {
    console.log('[Transfer] Injecting local engine into SDK singleton...');

    // The SDK module should export setEngine - let's try to use it
    if (typeof SDK.setEngine === 'function') {
      SDK.setEngine(localEngine);
      console.log('[Transfer] Successfully injected local engine via SDK.setEngine()');
    } else {
      // SDK.setEngine not available - try alternative approaches
      console.warn('[Transfer] SDK.setEngine not available, trying alternatives...');

      // Alternative 1: Check if SDK has an internal way to set the engine
      // Some versions of the SDK may have different export names
      const setEngineFn = SDK.setEngine || SDK._setEngine || SDK.setRailgunEngine;
      if (typeof setEngineFn === 'function') {
        setEngineFn(localEngine);
        console.log('[Transfer] Injected local engine via alternative method');
      } else {
        // Alternative 2: Start SDK engine with same database
        // This is less ideal because SDK's quick-sync won't fetch from subgraph,
        // but the database already has the merkletree data
        console.log('[Transfer] Starting SDK engine with shared database (fallback)...');

        const Level = (await import('level-js')).default;
        const localforage = (await import('localforage')).default;
        const { ArtifactStore } = await import('../../artifacts/artifact-store.js');

        // Use SAME database as local engine
        const db = new Level('railgun-wallet-db');

        localforage.config({
          name: 'railgun-artifacts',
          storeName: 'zkp-circuits',
        });

        const artifactStore = new ArtifactStore(
          async (path) => {
            try {
              const data = await localforage.getItem(path);
              return data ?? null;
            } catch { return null; }
          },
          async (_dir, path, data) => { await localforage.setItem(path, data); },
          async (path) => { return (await localforage.getItem(path)) !== null; }
        );

        await SDK.startRailgunEngine(
          'evbatterytransfer',
          db,
          true,
          artifactStore,
          false,
          false, // Don't skip merkletree scans
          ['https://poi-node.railgun.ch/']
        );

        console.log('[Transfer] SDK engine started (fallback mode)');

        // Wait for SDK to load merkletree from shared database
        console.log('[Transfer] Waiting for SDK to load merkletree data...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }

  // Ensure provider is loaded for SDK transfer functions
  // Even with injected engine, SDK might need provider setup
  try {
    const envRpcUrl = process.env.REACT_APP_RAILGUN_SCAN_RPC_URL || process.env.REACT_APP_RPC_URL;
    const safeScanRpcUrl =
      envRpcUrl && !String(envRpcUrl).toLowerCase().includes('alchemy.com')
        ? envRpcUrl
        : null;
    if (envRpcUrl && !safeScanRpcUrl) {
      console.warn('[Transfer] Skipping Alchemy RPC for scan provider due to free-tier eth_getLogs limits.');
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

    // Try to load provider (may already be loaded - that's fine)
    if (typeof SDK.loadProvider === 'function') {
      if (typeof SDK.unloadProvider === 'function') {
        try {
          await SDK.unloadProvider(NetworkName.EthereumSepolia);
        } catch {
          // Provider may not be loaded yet.
        }
      }
      await SDK.loadProvider(fallbackProviderConfig, NetworkName.EthereumSepolia, 2000);
      console.log('[Transfer] SDK provider configured');
    }
  } catch (providerErr) {
    // Provider might already be loaded - that's OK
    console.log('[Transfer] Provider setup note:', providerErr.message);
  }

  sdkEngineInjected = true;
  console.log('[Transfer] SDK engine ready');

  return SDK;
}

async function resolveGasDetails(provider, networkName) {
  let feeData = null;
  let gasPrice = null;

  try {
    feeData = await provider.getFeeData();
  } catch (feeErr) {
    console.warn('[Transfer] getFeeData failed, falling back to gasPrice:', feeErr?.message || feeErr);
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
    throw new Error('Unable to determine gas price for transfer.');
  }

  return {
    evmGasType: EVMGasType.Type0,
    gasPrice: BigInt(gasPrice),
  };
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
  console.log('[Transfer] toRailgunAddress:', toRailgunAddress);
  console.log('[Transfer] toRailgunAddress type:', typeof toRailgunAddress);
  console.log('[Transfer] amountWei:', amountWei);

  try {
    // 1. Validate inputs
    if (!toRailgunAddress || !toRailgunAddress.startsWith('0zk')) {
      console.log('[Transfer] Address validation failed:', { toRailgunAddress, startsWith0zk: toRailgunAddress?.startsWith?.('0zk') });
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

    // CRITICAL: Use FIXED signing message (same as connection.js) to derive encryptionKey
    // The wallet was created with this key, so we must use the same key for transfers
    onProgress?.({ step: 'sign', message: 'Please sign to authorize transfer...' });
    console.log('[Transfer] Requesting signature with fixed message...');
    const signature = await signer.signMessage(RAILGUN_WALLET_SIGNATURE_MESSAGE);
    console.log('[Transfer] Signature obtained');

    // Derive encryptionKey from signature (same method as createWalletFromSignature)
    const encryptionKey = ethers.keccak256(ethers.toUtf8Bytes(signature));
    const encryptionKeyBytes = ethers.getBytes(encryptionKey);
    console.log('[Transfer] encryptionKey derived');

    // 4b. Ensure SDK engine is started and wallet exists
    onProgress?.({ step: 'sdk', message: 'Preparing transfer engine...' });
    const SDK = await ensureSDKEngine();

    // 4c. Decrypt mnemonic from localStorage (it's stored encrypted for security)
    // Use the same signature we just got (same fixed message)
    let decryptedMnemonic = null;
    if (stored?.encryptedMnemonic) {
      try {
        console.log('[Transfer] Decrypting mnemonic from localStorage...');
        decryptedMnemonic = await decryptMnemonic(stored.encryptedMnemonic, signature);
        console.log('[Transfer] Mnemonic decrypted successfully');
      } catch (decryptErr) {
        console.error('[Transfer] Failed to decrypt mnemonic:', decryptErr.message);
      }
    } else {
      console.warn('[Transfer] No encryptedMnemonic found in localStorage');
    }

    // 4d. Verify wallet exists in engine (it should - we're using local engine)
    // The local engine was initialized by initializeSDK() and the wallet was created there.
    // Since we injected the local engine into SDK singleton, the wallet should be accessible.
    let sdkWalletID = walletID;

    // Quick check: verify the wallet is accessible
    const networkName = NetworkName.EthereumSepolia;
    const chain = NETWORK_CONFIG[networkName].chain;
    try {
      console.log('[Transfer] Verifying wallet exists in engine...');

      // Try to get wallet info - if this works, wallet exists
      if (typeof SDK.walletForID === 'function') {
        const wallet = SDK.walletForID(walletID);
        if (wallet) {
          console.log('[Transfer] Wallet verified in engine');
        }
      }
    } catch (walletErr) {
      // Wallet might not exist in the injected engine - try to create it
      console.log('[Transfer] Wallet not found, attempting to create...');

      if (!decryptedMnemonic) {
        throw new Error('Unable to decrypt wallet mnemonic - cannot proceed with transfer');
      }

      try {
        const encBytes = encryptionKeyBytes;
        const created = await SDK.createRailgunWallet(
          encBytes,
          decryptedMnemonic,
          undefined,
          0
        );
        sdkWalletID = created?.id || created?.walletID || walletID;
        console.log('[Transfer] Wallet created in engine, ID:', sdkWalletID);
      } catch (createErr) {
        if (createErr.message?.includes('already exists') || createErr.message?.includes('already loaded')) {
          console.log('[Transfer] Wallet already exists (good)');
        } else {
          throw createErr;
        }
      }
    }

    // 4e. Verify encryption key can decrypt wallet data (prevents confusing SDK errors)
    if (typeof SDK.getWalletMnemonic === 'function') {
      try {
        await SDK.getWalletMnemonic(encryptionKeyBytes, sdkWalletID);
      } catch (keyErr) {
        throw new Error('Wallet encryption key mismatch. Please reconnect your Railgun wallet.');
      }
    }

    // 4f. Quick balance refresh (not full rescan - local engine already has merkletree data)
    onProgress?.({ step: 'scan', message: 'Checking spendable funds...' });
    try {
      console.log('[Transfer] Refreshing wallet balances...');

      // Just refresh balances - no need for full UTXO rescan since local engine has the data
      await SDK.refreshBalances(chain, [sdkWalletID]);
      console.log('[Transfer] Balance refresh complete');

      // Small wait for balance callbacks
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check balance to verify UTXOs are available
      const wethAddress = NETWORK_CONFIG[NetworkName.EthereumSepolia]?.baseToken?.wrappedAddress;
      if (typeof SDK.balanceForERC20Token === 'function' && typeof SDK.walletForID === 'function') {
        try {
          const wallet = SDK.walletForID(sdkWalletID);
          const balance = await SDK.balanceForERC20Token(
            TXIDVersion.V2_PoseidonMerkle,
            wallet,
            networkName,
            wethAddress,
            true
          );
          const balanceStr = balance?.toString() || '0';
          console.log('[Transfer] Wallet WETH balance:', balanceStr);

          if (balanceStr === '0' || BigInt(balanceStr) === 0n) {
            console.warn('[Transfer] WARNING: Balance shows 0. Funds may be in ShieldPending bucket.');
          }
        } catch (balErr) {
          console.log('[Transfer] Could not check balance:', balErr.message);
        }
      }
    } catch (refreshErr) {
      console.warn('[Transfer] Balance refresh warning:', refreshErr.message);
      // Continue anyway - transfer function will validate balance
    }

    // 5. Setup network (chain was already declared above)
    const sepoliaConfig = NETWORK_CONFIG[networkName];
    if (!sepoliaConfig) {
      throw new Error(`Unsupported network: ${networkName}`);
    }
    // Note: 'chain' is already defined from NETWORK_CONFIG above

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
    const baseGasDetails = await resolveGasDetails(provider, networkName);
    const originalGasDetails = {
      ...baseGasDetails,
      gasEstimate: 0n, // Will be filled by gas estimation
    };

    // 9. Step 1 of 3: Gas Estimation
    onProgress?.({ step: 'estimate', message: 'Estimating gas...' });
    console.log('[Transfer] Step 1/3: Estimating gas...');

    const gasEstimateResult = await SDK.gasEstimateForUnprovenTransfer(
      TXIDVersion.V2_PoseidonMerkle,
      networkName,
      sdkWalletID,
      encryptionKeyBytes,
      memoText,
      erc20AmountRecipients,
      [], // nftAmountRecipients
      originalGasDetails,
      undefined, // feeTokenDetails (no broadcaster)
      true // sendWithPublicWallet
    );

    console.log('[Transfer] Gas estimate result:', gasEstimateResult);

    const gasDetails = {
      ...baseGasDetails,
      gasEstimate: BigInt(gasEstimateResult.gasEstimate),
    };

    // Calculate batch min gas price for proof generation
    const overallBatchMinGasPrice = calculateGasPrice(gasDetails);
    console.log('[Transfer] overallBatchMinGasPrice:', overallBatchMinGasPrice);

    // 10. Step 2 of 3: Generate ZK Proof (20-30 seconds)
    onProgress?.({ step: 'proving', message: 'Generating ZK proof... (this takes 20-30 seconds)', progress: 0 });
    console.log('[Transfer] Step 2/3: Generating ZK proof...');

    await SDK.generateTransferProof(
      TXIDVersion.V2_PoseidonMerkle,
      networkName,
      sdkWalletID,
      encryptionKeyBytes,
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

    const { transaction, nullifiers } =
      await SDK.populateProvedTransfer(
        TXIDVersion.V2_PoseidonMerkle,
        networkName,
        sdkWalletID,
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
      await SDK.refreshBalances(chain, [sdkWalletID]);
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

const railgunTransferApi = { privateTransfer };

export default railgunTransferApi;

