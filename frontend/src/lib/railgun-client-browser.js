// Railgun SDK Browser Wrapper
// Provides proper initialization with artifact store, network configuration, and wallet creation

import { keccak256, toUtf8Bytes, getBytes, Wallet } from 'ethers';
import { NetworkName, TXIDVersion } from '@railgun-community/shared-models';
import { NETWORK_CONFIG } from '@railgun-community/shared-models';

// Use LOCAL functions that pass our custom quick-sync to the engine
import { startRailgunEngine as localStartRailgunEngine } from './railgun/core/init.js';
import { loadProvider as localLoadProvider } from './railgun/core/load-provider.js';
import { createRailgunWallet as localCreateRailgunWallet, walletForID as localWalletForID } from './railgun/wallets/wallets.js';
import { setOnBalanceUpdateCallback as localSetOnBalanceUpdateCallback } from './railgun/wallets/balance-update.js';
import { refreshBalances as localRefreshBalances, rescanFullUTXOMerkletreesAndWallets as localRescanFullUTXO } from './railgun/wallets/balances.js';
import { setArtifactStore, setUseNativeArtifacts } from './railgun/core/artifacts.js';
import { ArtifactStore } from './artifacts/artifact-store.js';
import { getEngine, hasEngine } from './railgun/core/engine.js';

let isInitialized = false;
let initializationPromise = null;
let sdk = null;

// --- Balance cache (updated via SDK callback) ---
const balanceCache = new Map(); // key: `${walletID}:${bucket}` => RailgunBalancesEvent
let balanceCallbackRegistered = false;

function cacheKey(walletID, bucket) {
  return `${walletID}:${bucket}`;
}

async function ensureBalanceCallback() {
  if (balanceCallbackRegistered) return;

  // Use LOCAL setOnBalanceUpdateCallback for consistency with local engine
  localSetOnBalanceUpdateCallback((evt) => {
    // evt.balanceBucket: Spendable, ShieldPending, etc.
    balanceCache.set(cacheKey(evt.railgunWalletID, evt.balanceBucket), evt);
  });

  balanceCallbackRegistered = true;
  console.log('✅ Balance callback registered with LOCAL module');
}


async function loadSdk() {
  if (sdk) return sdk;
  try {
    const mod = await import('@railgun-community/wallet');
    sdk = mod;

    // CRITICAL: Inject local engine into SDK singleton so SDK functions work
    // This allows SDK.generatePOIsForWallet, SDK.balanceForERC20Token, etc. to use our local engine
    if (hasEngine() && typeof sdk.setEngine === 'function') {
      const localEngine = getEngine();
      try {
        sdk.setEngine(localEngine);
        console.log('[loadSdk] Injected local engine into SDK singleton');
      } catch (e) {
        console.warn('[loadSdk] Could not inject local engine:', e.message);
      }
    }

    return sdk;
  } catch (err) {
    throw new Error('Railgun SDK not found. Install @railgun-community/wallet and restart.');
  }
}

/**
 * Initialize Railgun SDK with proper artifact store and network configuration
 * @returns {Promise<boolean>}
 */
export async function initializeSDK(options = {}) {
  // Prevent multiple initializations
  if (isInitialized) {
    console.log('✅ SDK already initialized');
    return { success: true };
  }
  
  if (initializationPromise) {
    console.log('⏳ Waiting for existing initialization...');
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      console.log('🔧 Initializing Railgun SDK...');
      
      await loadSdk();
      console.log('✅ SDK module loaded');
      
      // Step 1: Import level-js for browser IndexedDB
      console.log('📦 Importing level-js database...');
      const Level = (await import('level-js')).default;
      
      // Step 2: Create database instance (CRITICAL: must be Level instance, not string)
      const dbName = 'railgun-wallet-db';
      const db = new Level(dbName);
      
      console.log('✅ Database instance created:', dbName);
      
      // Step 3: Create artifact store using localforage
      console.log('📦 Creating artifact store...');
      const localforage = (await import('localforage')).default;
      
      localforage.config({
        name: 'railgun-artifacts',
        storeName: 'zkp-circuits',
      });
      
      // Use LOCAL ArtifactStore (imported at top) to ensure our quick-sync is used
      const artifactStore = new ArtifactStore(
        async (path) => {
          try {
            const data = await localforage.getItem(path);
            return data ?? null;
          } catch (err) {
            console.warn(`Could not load artifact ${path}:`, err.message);
            return null;
          }
        },
        async (_dir, path, data) => {
          try {
            await localforage.setItem(path, data);
          } catch (err) {
            console.error(`Failed to store artifact ${path}:`, err.message);
          }
        },
        async (path) => {
          try {
            const data = await localforage.getItem(path);
            return data !== null;
          } catch (err) {
            return false;
          }
        }
      );
      
      console.log('✅ Artifact store created');
      
      // Step 4: Set artifact store on LOCAL module (not SDK)
      // This is CRITICAL - using local functions ensures our quick-sync is used
      setArtifactStore(artifactStore);
      setUseNativeArtifacts(false); // browser uses WASM
      console.log('✅ Artifact store set on LOCAL module');

      // Step 5: Start Railgun Engine using LOCAL startRailgunEngine
      // This passes our custom quickSyncEventsGraph to the engine
      console.log('🚀 Starting Railgun Engine with LOCAL quick-sync...');

      // POI node URLs required for networks that use Proof of Innocence (like Sepolia)
      const poiNodeURLs = ['https://poi-node.railgun.ch/'];

      // CRITICAL: Using localStartRailgunEngine instead of SDK.startRailgunEngine
      // This ensures our custom quick-sync functions are passed to the engine
      await localStartRailgunEngine(
        'evbatterydapp',     // walletSource (max 16 chars)
        db,                   // db instance (Level-js)
        true,                 // shouldDebug
        artifactStore,        // artifactStore instance
        false,                // useNativeArtifacts (false for browser)
        false,                // skipMerkletreeScans
        poiNodeURLs           // POI node URLs array for Proof of Innocence
      );

      console.log('✅ Railgun Engine started with LOCAL quick-sync and POI nodes:', poiNodeURLs);

      // Ensure Groth16 prover is available for full proof generation (transfers)
      // This is required for generateTransferProof in the SDK.
      try {
        const snarkjs = await import('snarkjs');
        const engine = getEngine();
        if (engine?.prover?.setSnarkJSGroth16 && snarkjs?.groth16) {
          engine.prover.setSnarkJSGroth16(snarkjs.groth16);
          console.log('✅ Groth16 prover initialized with snarkjs');
        } else {
          console.warn('⚠️ Groth16 prover not available (snarkjs.groth16 missing)');
        }
      } catch (proverErr) {
        console.warn('⚠️ Failed to initialize Groth16 prover:', proverErr?.message || proverErr);
      }

      // CRITICAL: Inject local engine into SDK singleton so SDK functions work
      // This allows SDK.generatePOIsForWallet, SDK.refreshBalances, etc. to use our local engine
      try {
        const sdkModule = await import('@railgun-community/wallet');
        if (typeof sdkModule.setEngine === 'function' && hasEngine()) {
          sdkModule.setEngine(getEngine());
          console.log('✅ Local engine injected into SDK singleton');
        } else {
          console.warn('⚠️ SDK.setEngine not available or engine not ready');
        }
      } catch (injectErr) {
        console.warn('⚠️ Could not inject engine into SDK:', injectErr.message);
      }

      // Step 6: Load provider for Sepolia
      console.log('📡 Loading Sepolia network...');

      // FallbackProviderJsonConfig format - MUST have chainId and providers array
      // Use CORS-friendly public RPCs (rpc.sepolia.org has CORS issues in browser)
      const envRpcUrl = process.env.REACT_APP_RAILGUN_SCAN_RPC_URL || process.env.REACT_APP_RPC_URL;
      const safeScanRpcUrl =
        envRpcUrl && !String(envRpcUrl).toLowerCase().includes('alchemy.com')
          ? envRpcUrl
          : null;
      if (envRpcUrl && !safeScanRpcUrl) {
        console.warn('[Railgun] Skipping Alchemy RPC for scan provider due to free-tier eth_getLogs limits.');
      }
      const fallbackProviderConfig = {
        chainId: 11155111, // Sepolia chain ID
        providers: [
          // Use env RPC if available (highest priority)
          ...(safeScanRpcUrl ? [{
            provider: safeScanRpcUrl,
            priority: 1,
            weight: 3,
            maxLogsPerBatch: 10,
            stallTimeout: 2500,
          }] : []),
          {
            // publicnode.com is CORS-friendly
            provider: 'https://ethereum-sepolia.publicnode.com',
            priority: 2,
            weight: 2,
            maxLogsPerBatch: 5,
            stallTimeout: 2500,
          },
          {
            // drpc.org is generally CORS-friendly
            provider: 'https://sepolia.drpc.org',
            priority: 3,
            weight: 2,
            maxLogsPerBatch: 2,
            stallTimeout: 2500,
          },
          // Note: rpc.sepolia.org removed due to CORS issues in browser
        ],
      };

      try {
        // Use LOCAL loadProvider to ensure consistency with local engine
        await localLoadProvider(
          fallbackProviderConfig,
          NetworkName.EthereumSepolia,
          2000 // polling interval
        );
        console.log('✅ Sepolia network loaded via LOCAL provider');
      } catch (localProviderErr) {
        console.error('⚠️ LOCAL provider load failed:', localProviderErr.message);
      }

      // CRITICAL: Also load provider via SDK module so SDK functions can find it
      // SDK functions like gasEstimateForShield have their own provider lookup
      try {
        const sdkModule = await import('@railgun-community/wallet');
        if (typeof sdkModule.loadProvider === 'function') {
          if (typeof sdkModule.unloadProvider === 'function') {
            try {
              await sdkModule.unloadProvider(NetworkName.EthereumSepolia);
            } catch {
              // Provider may not be loaded yet.
            }
          }
          await sdkModule.loadProvider(
            fallbackProviderConfig,
            NetworkName.EthereumSepolia,
            2000
          );
          console.log('✅ Sepolia network also loaded via SDK provider');
        }
      } catch (sdkProviderErr) {
        console.warn('⚠️ SDK provider load note:', sdkProviderErr.message);
      }

      // NOTE: Local engine is now injected into SDK singleton
      // SDK functions like generatePOIsForWallet, refreshBalances, transfer functions, etc.
      // will use our local engine which has custom quick-sync for merkletree data
      console.log('ℹ️ SDK functions will use local engine via injected singleton');

      // Wait for engine to settle
      await new Promise(resolve => setTimeout(resolve, 1000));

      isInitialized = true;
      console.log('✅ Railgun SDK fully initialized');
      return { success: true };
      
    } catch (error) {
      console.error('❌ SDK initialization failed:', error);
      console.error('Error details:', { 
        message: error.message, 
        stack: error.stack,
        name: error.name 
      });
      initializationPromise = null;
      isInitialized = false;
      return { success: false, error: String(error.message || error) };
    }
  })();
  
  return initializationPromise;
}

/**
 * Create wallet from MetaMask signature
 * Accepts optional mnemonic for wallet restoration (same mnemonic = same wallet)
 *
 * @param {string} signature - User's signed message
 * @param {Object} opts - Options: { userAddress, mnemonic? }
 *   - userAddress: EOA address
 *   - mnemonic: (optional) Existing mnemonic to restore wallet
 * @returns {Promise<Object>} { walletID, railgunAddress, encryptionKey, mnemonic }
 */
export async function createWalletFromSignature(signature, opts = {}) {
  try {
    console.log('🔑 Creating wallet from signature...');

    // Ensure SDK is initialized (uses LOCAL functions now)
    const initRes = await initializeSDK(opts);
    if (!initRes.success) {
      throw new Error(`SDK initialization failed: ${initRes.error}`);
    }

    console.log('✅ Engine ready for wallet creation (using LOCAL functions)');

    // Derive encryption key from signature
    const encryptionKey = keccak256(toUtf8Bytes(String(signature)));
    console.log('🔐 Encryption key derived');

    // Use provided mnemonic (for restore) or generate new one
    const mnemonic = opts.mnemonic || (Wallet.createRandom().mnemonic || {}).phrase || null;

    if (!mnemonic) {
      throw new Error('Failed to get or generate mnemonic');
    }

    console.log('🔄 Creating wallet via LOCAL createRailgunWallet...', opts.mnemonic ? '(restoring from mnemonic)' : '(new wallet)');
    const encBytes = getBytes(encryptionKey);

    // Use LOCAL createRailgunWallet (consistent with local engine)
    const created = await localCreateRailgunWallet(
      encBytes,
      mnemonic,
      undefined,
      0
    );

    const walletID = typeof created === 'string' ? created : created.id || created.walletID;
    let railgunAddress = created.railgunAddress || null;

    // Try to get address if not provided
    if (!railgunAddress) {
      try {
        // Use LOCAL walletForID
        const wallet = localWalletForID(walletID);
        console.log('[Railgun][Debug] wallet keys after creation:', wallet ? Object.keys(wallet) : null);
        if (wallet && typeof wallet.getAddress === 'function') {
          railgunAddress = await wallet.getAddress();
        }
      } catch (addrErr) {
        console.warn('⚠️ Could not get wallet address:', addrErr.message);
      }
    }

    // NOTE: Wallet creation in SDK engine for transfers is handled on-demand in transfer.js
    // This keeps balance viewing fast and avoids SDK engine initialization during wallet creation

    console.log('✅ Wallet created successfully:', { walletID, railgunAddress });
    return { walletID, railgunAddress, encryptionKey, mnemonic };

  } catch (err) {
    console.error('❌ Wallet creation failed:', err.message);
    console.error('Stack:', err.stack);
    throw err;
  }
}

/**
 * Load existing wallet by ID
 * @param {string} walletID - Wallet ID to load
 * @returns {Promise<Object>} { walletID, railgunAddress }
 */
export async function loadWallet(walletID) {
  try {
    const initRes = await initializeSDK();
    if (!initRes.success) {
      throw new Error(`SDK not initialized: ${initRes.error}`);
    }

    // Use LOCAL walletForID
    const wallet = localWalletForID(walletID);
    const address = await wallet.getAddress();
    return { walletID, railgunAddress: address };
  } catch (err) {
    console.error('❌ Failed to load wallet:', err.message);
    throw err;
  }
}

/**
 * Get private balances for wallet
 * @param {string} walletID - Wallet ID
 * @param {string[]} tokens - Token addresses (optional)
 * @returns {Promise<Object>} Balances
 */
export async function getPrivateBalances(walletID, tokens = [], options = {}) {
  // Use LOCAL functions for consistency with local engine
  await ensureBalanceCallback();

  // Trigger a scan (async updates arrive via callback)
  const chain = NETWORK_CONFIG[NetworkName.EthereumSepolia].chain;

  // If fullRescan is requested, do a complete UTXO merkletree rescan
  // This is slower but can resolve sync issues
  if (options.fullRescan) {
    try {
      console.log('[getPrivateBalances] Starting FULL UTXO rescan (this may take a while)...');
      await localRescanFullUTXO(chain, [walletID]);
      console.log('[getPrivateBalances] Full rescan complete');
    } catch (e) {
      console.warn('⚠️ Full rescan failed:', e?.message || e);
    }
  }

  try {
    await localRefreshBalances(chain, [walletID]);
  } catch (e) {
    console.warn('⚠️ refreshBalances failed:', e?.message || e);
  }

  // CRITICAL: Generate POIs for funds that have completed the standby period
  // Without this, shielded funds stay in MissingInternalPOI/MissingExternalPOI buckets
  // and never become Spendable. Testnet standby is 1 minute, mainnet is 1 hour.
  // Note: For now, we still use SDK.generatePOIsForWallet as local equivalent may not exist
  const SDK = await loadSdk();
  if (typeof SDK.generatePOIsForWallet === 'function') {
    try {
      console.log('[getPrivateBalances] Triggering POI generation for wallet:', walletID);
      await SDK.generatePOIsForWallet(NetworkName.EthereumSepolia, walletID);
      console.log('[getPrivateBalances] POI generation complete');

      // CRITICAL: Refresh balances AGAIN after POI generation to get updated buckets
      // POI generation may have moved funds from ShieldPending/MissingPOI to Spendable
      console.log('[getPrivateBalances] Refreshing balances after POI generation...');
      await localRefreshBalances(chain, [walletID]);

      // Small delay to let balance callbacks fire
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log('[getPrivateBalances] Post-POI refresh complete');
    } catch (e) {
      // POI generation can fail if no UTXOs need POIs - this is expected
      console.warn('⚠️ generatePOIsForWallet:', e?.message || e);
    }
  }

  // Pull from cache - check all balance buckets
  const spendableEvt =
    balanceCache.get(cacheKey(walletID, 'Spendable')) ||
    balanceCache.get(cacheKey(walletID, 'RailgunWalletBalanceBucket.Spendable'));

  // Pending includes: ShieldPending (standby period) + MissingInternalPOI + MissingExternalPOI
  const shieldPendingEvt =
    balanceCache.get(cacheKey(walletID, 'ShieldPending')) ||
    balanceCache.get(cacheKey(walletID, 'RailgunWalletBalanceBucket.ShieldPending'));

  const missingInternalPOIEvt =
    balanceCache.get(cacheKey(walletID, 'MissingInternalPOI')) ||
    balanceCache.get(cacheKey(walletID, 'RailgunWalletBalanceBucket.MissingInternalPOI'));

  const missingExternalPOIEvt =
    balanceCache.get(cacheKey(walletID, 'MissingExternalPOI')) ||
    balanceCache.get(cacheKey(walletID, 'RailgunWalletBalanceBucket.MissingExternalPOI'));

  // Helper: extract token amount
  const getTokenAmount = (evt) => {
    if (!evt?.erc20Amounts?.length) return 0n;

    // If caller passed tokens, filter by those; otherwise try to pick WETH by wrappedAddress.
    const wanted = (tokens || []).map(t => String(t).toLowerCase());
    const weth = String(NETWORK_CONFIG[NetworkName.EthereumSepolia]?.baseToken?.wrappedAddress || '').toLowerCase();

    const match = evt.erc20Amounts.find(a => {
      const addr =
        (a?.tokenData?.tokenAddress || a?.tokenAddress || a?.address || '').toLowerCase();
      if (!addr) return false;
      if (wanted.length) return wanted.includes(addr);
      return addr === weth;
    });

    if (!match) return 0n;

    const raw = match.amountString ?? match.amount ?? match.balance ?? '0';
    try { return BigInt(raw); } catch { return 0n; }
  };

  const spendable = getTokenAmount(spendableEvt);

  // Sum all non-spendable buckets as "pending"
  const shieldPending = getTokenAmount(shieldPendingEvt);
  const missingInternalPOI = getTokenAmount(missingInternalPOIEvt);
  const missingExternalPOI = getTokenAmount(missingExternalPOIEvt);
  const pending = shieldPending + missingInternalPOI + missingExternalPOI;

  // Log detailed bucket breakdown for debugging
  console.log('[getPrivateBalances] Balance breakdown:', {
    spendable: spendable.toString(),
    shieldPending: shieldPending.toString(),
    missingInternalPOI: missingInternalPOI.toString(),
    missingExternalPOI: missingExternalPOI.toString(),
    totalPending: pending.toString()
  });

  // Explain why funds might be stuck in ShieldPending
  if (shieldPending > 0n && spendable === 0n) {
    console.log('[getPrivateBalances] ⏳ Funds are in ShieldPending (standby period).');
    console.log('[getPrivateBalances] Testnet standby: 60 seconds (~5 blocks at 12s/block)');
    console.log('[getPrivateBalances] This is based on BLOCK TIME, not wall clock.');
    console.log('[getPrivateBalances] Wait for more blocks to pass, then refresh again.');
  }

  if (missingInternalPOI > 0n || missingExternalPOI > 0n) {
    console.log('[getPrivateBalances] ⚠️ Funds need POI generation - standby complete but no proofs yet');
  }

  // Return in the shape your balances.js already expects.
  return {
    spendable,
    pending,
    weth: spendable,
    pendingWeth: pending,
    totalWeth: spendable + pending,
    // Also expose detailed breakdown for UI if needed
    buckets: {
      spendable,
      shieldPending,
      missingInternalPOI,
      missingExternalPOI
    }
  };
}



/**
 * Send private transfer
 * @param {Object} params - Transfer parameters
 * @returns {Promise<string>} Transaction hash
 */
export async function sendPrivateTransfer(params = {}) {
  try {
    const SDK = await loadSdk();
    
    if (typeof SDK.sendPrivateTransfer === 'function') {
      return await SDK.sendPrivateTransfer(params);
    }
    
    throw new Error('SDK.sendPrivateTransfer not available');
  } catch (err) {
    console.error('❌ Transfer failed:', err.message);
    throw err;
  }
}

/**
 * Force a full rescan and POI generation
 * Use this to resolve sync issues or to force funds from ShieldPending to Spendable
 * @param {string} walletID - Wallet ID
 * @returns {Promise<Object>} Updated balances
 */
export async function forceFullRescan(walletID) {
  console.log('[forceFullRescan] Starting full rescan for wallet:', walletID);

  const chain = NETWORK_CONFIG[NetworkName.EthereumSepolia].chain;

  // Step 1: Full UTXO merkletree rescan (uses LOCAL function)
  try {
    console.log('[forceFullRescan] Step 1/3: Full UTXO merkletree rescan...');
    await localRescanFullUTXO(chain, [walletID]);
    console.log('[forceFullRescan] UTXO rescan complete');
  } catch (e) {
    console.warn('⚠️ Full UTXO rescan failed:', e?.message || e);
  }

  // Step 2: Generate POIs (still uses SDK as no local equivalent yet)
  const SDK = await loadSdk();
  if (typeof SDK.generatePOIsForWallet === 'function') {
    try {
      console.log('[forceFullRescan] Step 2/3: Generating POI proofs...');
      await SDK.generatePOIsForWallet(NetworkName.EthereumSepolia, walletID);
      console.log('[forceFullRescan] POI generation complete');
    } catch (e) {
      console.warn('⚠️ POI generation failed:', e?.message || e);
    }
  }

  // Step 3: Refresh balances (uses LOCAL function)
  try {
    console.log('[forceFullRescan] Step 3/3: Refreshing balances...');
    await localRefreshBalances(chain, [walletID]);
    console.log('[forceFullRescan] Balance refresh complete');
  } catch (e) {
    console.warn('⚠️ Balance refresh failed:', e?.message || e);
  }

  // Wait for callbacks
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Get updated balances
  console.log('[forceFullRescan] Getting updated balances...');
  return getPrivateBalances(walletID);
}

/**
 * Debug function to check SDK scan status
 * Call from browser console: window.railgunDebug.getScanStatus()
 */
export async function getScanStatus(walletID) {
  const SDK = await loadSdk();
  const chain = NETWORK_CONFIG[NetworkName.EthereumSepolia].chain;

  const status = {
    walletID,
    chain: chain,
    timestamp: new Date().toISOString(),
    balanceCache: {},
    sdkFunctions: {}
  };

  // Check which SDK functions are available
  status.sdkFunctions = {
    refreshBalances: typeof SDK.refreshBalances === 'function',
    generatePOIsForWallet: typeof SDK.generatePOIsForWallet === 'function',
    rescanFullUTXOMerkletreesAndWallets: typeof SDK.rescanFullUTXOMerkletreesAndWallets === 'function',
    getLatestRailgunTxidData: typeof SDK.getLatestRailgunTxidData === 'function',
  };

  // Try to get latest TXID data (shows how far the scan has progressed)
  if (typeof SDK.getLatestRailgunTxidData === 'function') {
    try {
      const txidData = await SDK.getLatestRailgunTxidData(TXIDVersion.V2_PoseidonMerkle, chain);
      status.latestTxidData = txidData;
      console.log('[getScanStatus] Latest TXID data:', txidData);
    } catch (e) {
      status.latestTxidDataError = e?.message || String(e);
    }
  }

  // Check balance cache contents
  for (const [key, value] of balanceCache.entries()) {
    status.balanceCache[key] = {
      hasErc20Amounts: !!value?.erc20Amounts,
      erc20Count: value?.erc20Amounts?.length || 0,
      sample: value?.erc20Amounts?.[0] || null
    };
  }

  console.log('[getScanStatus] Full status:', status);
  return status;
}

// Expose debug functions to browser console
if (typeof window !== 'undefined') {
  window.railgunDebug = {
    getScanStatus: async () => {
      const stored = localStorage.getItem('railgun.wallet');
      if (!stored) {
        console.error('No wallet found in localStorage');
        return null;
      }
      const parsed = JSON.parse(stored);
      return getScanStatus(parsed.walletID);
    },
    forceFullRescan: async () => {
      const stored = localStorage.getItem('railgun.wallet');
      if (!stored) {
        console.error('No wallet found in localStorage');
        return null;
      }
      const parsed = JSON.parse(stored);
      return forceFullRescan(parsed.walletID);
    },
    getBalanceCache: () => {
      const result = {};
      for (const [key, value] of balanceCache.entries()) {
        result[key] = value;
      }
      console.log('Balance cache:', result);
      return result;
    },
    // Check SDK's provider block number
    checkProviderBlock: async () => {
      const SDK = await loadSdk();
      const networkConfig = NETWORK_CONFIG[NetworkName.EthereumSepolia];
      console.log('=== Network Config ===');
      console.log('NetworkName.EthereumSepolia:', NetworkName.EthereumSepolia);
      console.log('NETWORK_CONFIG entry:', networkConfig ? 'exists' : 'MISSING');

      if (!networkConfig) {
        console.error('NETWORK_CONFIG[EthereumSepolia] is undefined!');
        console.log('Available networks:', Object.keys(NETWORK_CONFIG));
        return { error: 'Network config missing' };
      }

      const chain = networkConfig.chain;
      console.log('Chain:', chain);

      // Get block from MetaMask for comparison
      const metamaskBlockHex = await window.ethereum.request({ method: 'eth_blockNumber' });
      const metamaskBlock = parseInt(metamaskBlockHex, 16);

      console.log('=== Block Number Comparison ===');
      console.log('MetaMask current block:', metamaskBlock);

      // Try to access SDK's internal provider
      if (typeof SDK.getProviderForNetwork === 'function') {
        try {
          const provider = SDK.getProviderForNetwork(NetworkName.EthereumSepolia);
          if (provider && typeof provider.getBlockNumber === 'function') {
            const sdkBlock = await provider.getBlockNumber();
            console.log('SDK provider block:', sdkBlock);
            console.log('Difference:', metamaskBlock - sdkBlock, 'blocks');
          }
        } catch (e) {
          console.log('SDK provider getBlockNumber error:', e.message);
        }
      }

      // Check if SDK has any internal block tracking
      if (typeof SDK.getLatestRailgunTxidData === 'function') {
        try {
          console.log('Calling getLatestRailgunTxidData with chain:', chain);
          const txidData = await SDK.getLatestRailgunTxidData(TXIDVersion.V2_PoseidonMerkle, chain);
          console.log('SDK TXID merkletree data:', txidData);
        } catch (e) {
          console.log('SDK TXID data error:', e.message);
          console.log('Full error:', e);
        }
      }

      return { metamaskBlock, chain };
    },
    // Detailed inspection of ShieldPending data
    inspectShieldPending: () => {
      console.log('=== ShieldPending Inspection ===');
      const shieldPendingEvt =
        balanceCache.get(cacheKey(localStorage.getItem('railgun.wallet') ? JSON.parse(localStorage.getItem('railgun.wallet')).walletID : '', 'ShieldPending'));

      if (!shieldPendingEvt) {
        console.log('No ShieldPending data in cache');
        return null;
      }

      console.log('ShieldPending event:', shieldPendingEvt);
      console.log('ERC20 amounts:', shieldPendingEvt.erc20Amounts);

      // Look for any block number info
      if (shieldPendingEvt.erc20Amounts) {
        shieldPendingEvt.erc20Amounts.forEach((amt, i) => {
          console.log(`Token ${i}:`, {
            tokenAddress: amt.tokenData?.tokenAddress || amt.tokenAddress,
            amount: amt.amountString || amt.amount,
            // Check for any block-related fields
            allFields: Object.keys(amt)
          });
        });
      }

      return shieldPendingEvt;
    },
    // Try to force SDK to scan from a specific block
    scanFromBlock: async (startBlock) => {
      const SDK = await loadSdk();
      const chain = NETWORK_CONFIG[NetworkName.EthereumSepolia]?.chain;

      if (!chain) {
        console.error('Chain config not available');
        return { error: 'Chain config missing' };
      }

      console.log('=== Forcing scan from block', startBlock, '===');

      // Try different SDK scan methods
      const methods = [
        'scanContractHistory',
        'scanUTXOMerkletree',
        'fullRescanBalancesAllNetworks',
        'syncRailgunTransactionsV2'
      ];

      for (const method of methods) {
        if (typeof SDK[method] === 'function') {
          console.log(`Found SDK.${method}, attempting...`);
          try {
            await SDK[method](chain, startBlock);
            console.log(`${method} completed`);
          } catch (e) {
            console.log(`${method} error:`, e.message);
          }
        }
      }

      // Also try the rescan we know works
      const stored = localStorage.getItem('railgun.wallet');
      if (stored) {
        const { walletID } = JSON.parse(stored);
        console.log('Running full UTXO rescan for wallet...');
        try {
          await SDK.rescanFullUTXOMerkletreesAndWallets(chain, [walletID]);
          console.log('UTXO rescan complete');
        } catch (e) {
          console.log('UTXO rescan error:', e.message);
        }

        // Refresh balances
        try {
          await SDK.refreshBalances(chain, [walletID]);
          console.log('Balance refresh complete');
        } catch (e) {
          console.log('Balance refresh error:', e.message);
        }
      }

      return { scanned: true };
    },
    // List all available SDK functions (for debugging)
    listSDKFunctions: async () => {
      const SDK = await loadSdk();
      const functions = Object.keys(SDK).filter(k => typeof SDK[k] === 'function').sort();
      console.log('Available SDK functions:', functions);
      return functions;
    },
    // Reset and reinitialize TXID merkletree
    resetTXIDMerkletree: async () => {
      const SDK = await loadSdk();
      const chain = NETWORK_CONFIG[NetworkName.EthereumSepolia]?.chain;

      console.log('=== Resetting TXID Merkletree ===');

      if (typeof SDK.fullResetTXIDMerkletreesV2 === 'function') {
        try {
          console.log('Calling fullResetTXIDMerkletreesV2...');
          await SDK.fullResetTXIDMerkletreesV2(chain);
          console.log('TXID merkletree reset complete');
        } catch (e) {
          console.log('Reset error:', e.message);
        }
      }

      // Try to get the merkletree after reset
      if (typeof SDK.getTXIDMerkletreeForNetwork === 'function') {
        try {
          console.log('Getting TXID merkletree...');
          const merkletree = await SDK.getTXIDMerkletreeForNetwork(TXIDVersion.V2_PoseidonMerkle, NetworkName.EthereumSepolia);
          console.log('TXID merkletree:', merkletree);
        } catch (e) {
          console.log('Get merkletree error:', e.message);
        }
      }

      return { reset: true };
    },
    // Get all shields to see if SDK can find them
    getAllShields: async () => {
      const SDK = await loadSdk();

      console.log('=== Getting All Shields ===');

      if (typeof SDK.getAllShields === 'function') {
        try {
          const shields = await SDK.getAllShields(NetworkName.EthereumSepolia);
          console.log('All shields:', shields);
          return shields;
        } catch (e) {
          console.log('getAllShields error:', e.message);
        }
      }

      if (typeof SDK.getShieldsForTXIDVersion === 'function') {
        try {
          const shields = await SDK.getShieldsForTXIDVersion(TXIDVersion.V2_PoseidonMerkle, NetworkName.EthereumSepolia);
          console.log('Shields for V2:', shields);
          return shields;
        } catch (e) {
          console.log('getShieldsForTXIDVersion error:', e.message);
        }
      }

      return null;
    },
    // Get current wallet ID
    getWalletID: () => {
      const stored = localStorage.getItem('railgun.wallet');
      if (stored) {
        const parsed = JSON.parse(stored);
        console.log('Current wallet:', parsed);
        return parsed;
      }
      console.log('No wallet in localStorage');
      return null;
    },
    // Check POI status
    checkPOIStatus: async () => {
      const SDK = await loadSdk();
      const stored = localStorage.getItem('railgun.wallet');
      if (!stored) {
        console.error('No wallet in localStorage');
        return null;
      }
      const { walletID } = JSON.parse(stored);

      console.log('=== Checking POI Status ===');
      console.log('Wallet ID:', walletID);

      // Get TXO POI status
      if (typeof SDK.getTXOsReceivedPOIStatusInfoForWallet === 'function') {
        try {
          const poiStatus = await SDK.getTXOsReceivedPOIStatusInfoForWallet(
            TXIDVersion.V2_PoseidonMerkle,
            NetworkName.EthereumSepolia,
            walletID
          );
          console.log('POI Status (received TXOs):', poiStatus);
        } catch (e) {
          console.log('POI status error:', e.message);
        }
      }

      // Check pending spent POIs
      if (typeof SDK.getChainTxidsStillPendingSpentPOIs === 'function') {
        try {
          const pending = await SDK.getChainTxidsStillPendingSpentPOIs(
            TXIDVersion.V2_PoseidonMerkle,
            NetworkName.EthereumSepolia,
            walletID
          );
          console.log('Pending spent POIs:', pending);
        } catch (e) {
          console.log('Pending POIs error:', e.message);
        }
      }

      // Check spendable UTXOs directly
      if (typeof SDK.getSpendableUTXOsForToken === 'function') {
        try {
          const wethAddress = NETWORK_CONFIG[NetworkName.EthereumSepolia]?.baseToken?.wrappedAddress;
          console.log('Checking spendable UTXOs for WETH:', wethAddress);
          const utxos = await SDK.getSpendableUTXOsForToken(
            TXIDVersion.V2_PoseidonMerkle,
            NetworkName.EthereumSepolia,
            walletID,
            { tokenAddress: wethAddress, tokenType: 0 } // ERC20
          );
          console.log('Spendable UTXOs:', utxos);
        } catch (e) {
          console.log('Spendable UTXOs error:', e.message);
        }
      }

      // Get detailed POI status with full object
      if (typeof SDK.getTXOsReceivedPOIStatusInfoForWallet === 'function') {
        try {
          const poiStatus = await SDK.getTXOsReceivedPOIStatusInfoForWallet(
            TXIDVersion.V2_PoseidonMerkle,
            NetworkName.EthereumSepolia,
            walletID
          );
          console.log('=== Detailed POI Status ===');
          if (poiStatus && poiStatus.length > 0) {
            poiStatus.forEach((status, i) => {
              console.log(`TXO ${i}:`, JSON.stringify(status, null, 2));
            });
          }
        } catch (e) {
          console.log('Detailed POI status error:', e.message);
        }
      }

      // Try to get ALL balances including by bucket
      if (typeof SDK.balanceForERC20Token === 'function') {
        try {
          const wethAddress = NETWORK_CONFIG[NetworkName.EthereumSepolia]?.baseToken?.wrappedAddress;
          const chain = NETWORK_CONFIG[NetworkName.EthereumSepolia]?.chain;

          // Try each balance bucket
          const buckets = ['Spendable', 'ShieldPending', 'MissingInternalPOI', 'MissingExternalPOI'];
          for (const bucket of buckets) {
            try {
              const balance = await SDK.balanceForERC20Token(
                TXIDVersion.V2_PoseidonMerkle,
                chain,
                walletID,
                { tokenAddress: wethAddress, tokenType: 0 },
                bucket
              );
              console.log(`Balance bucket ${bucket}:`, balance?.toString() || '0');
            } catch (e) {
              // Might not support bucket parameter
            }
          }
        } catch (e) {
          console.log('Balance by bucket error:', e.message);
        }
      }

      return { checked: true };
    },
    // Try to manually sync a specific transaction
    syncTransaction: async (txHash) => {
      const SDK = await loadSdk();
      const chain = NETWORK_CONFIG[NetworkName.EthereumSepolia]?.chain;

      console.log('=== Syncing Transaction ===');
      console.log('TX Hash:', txHash);

      // Try to get railgun transactions for this txid
      if (typeof SDK.getRailgunTransactionsForTxid === 'function') {
        try {
          const txs = await SDK.getRailgunTransactionsForTxid(chain, txHash);
          console.log('Railgun transactions for txid:', txs);
        } catch (e) {
          console.log('getRailgunTransactionsForTxid error:', e.message);
        }
      }

      // Try to generate POI specifically for this transaction
      if (typeof SDK.generatePOIsForWalletAndRailgunTxid === 'function') {
        try {
          const stored = localStorage.getItem('railgun.wallet');
          if (stored) {
            const { walletID } = JSON.parse(stored);
            console.log('Generating POI for wallet and txid...');
            await SDK.generatePOIsForWalletAndRailgunTxid(
              TXIDVersion.V2_PoseidonMerkle,
              NetworkName.EthereumSepolia,
              walletID,
              txHash
            );
            console.log('POI generation for txid complete');
          }
        } catch (e) {
          console.log('generatePOIsForWalletAndRailgunTxid error:', e.message);
        }
      }

      // Try syncRailgunTransactionsV2 which might be the key
      if (typeof SDK.syncRailgunTransactionsV2 === 'function') {
        try {
          console.log('Calling syncRailgunTransactionsV2...');
          await SDK.syncRailgunTransactionsV2(chain);
          console.log('syncRailgunTransactionsV2 complete');
        } catch (e) {
          console.log('syncRailgunTransactionsV2 error:', e.message);
        }
      }

      return { synced: true };
    },
    // Query Railgun subgraph directly
    querySubgraph: async (txHash) => {
      const SEPOLIA_SUBGRAPH = 'https://rail-squid.squids.live/squid-railgun-eth-sepolia-v2/graphql';

      const query = `
        query GetRailgunTransactionsByTxid($txid: Bytes) {
          transactions(where: { transactionHash_eq: $txid }) {
            id
            nullifiers
            commitments
            transactionHash
            boundParamsHash
            blockNumber
            utxoTreeIn
            utxoTreeOut
            utxoBatchStartPositionOut
            hasUnshield
            blockTimestamp
            verificationHash
          }
        }
      `;

      console.log('=== Querying Railgun Subgraph ===');
      console.log('Endpoint:', SEPOLIA_SUBGRAPH);
      console.log('TX Hash:', txHash);

      try {
        const response = await fetch(SEPOLIA_SUBGRAPH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            variables: { txid: txHash }
          })
        });

        const result = await response.json();
        console.log('Subgraph response:', result);

        if (result.data?.transactions?.length > 0) {
          console.log('✅ Transaction found in subgraph!');
          console.log('Transactions:', result.data.transactions);
        } else {
          console.log('❌ Transaction NOT found in subgraph');
          console.log('This might be because:');
          console.log('1. The subgraph hasnt indexed this block yet');
          console.log('2. Shield transactions are stored differently');
        }

        return result;
      } catch (e) {
        console.error('Subgraph query error:', e.message);
        return { error: e.message };
      }
    },
    // Query for shield commitments by transaction hash
    queryShieldCommitment: async (txHash) => {
      const SEPOLIA_SUBGRAPH = 'https://rail-squid.squids.live/squid-railgun-eth-sepolia-v2/graphql';

      // First, let's introspect the schema to understand available queries
      const introspectionQuery = `
        query {
          __schema {
            queryType {
              fields {
                name
              }
            }
          }
        }
      `;

      console.log('=== Querying Shield Commitments ===');
      console.log('TX Hash:', txHash);

      try {
        // First get the schema
        console.log('Checking available queries...');
        const schemaResponse = await fetch(SEPOLIA_SUBGRAPH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: introspectionQuery })
        });
        const schemaResult = await schemaResponse.json();
        console.log('Available queries:', schemaResult.data?.__schema?.queryType?.fields?.map(f => f.name));

        // Try different query formats
        // Format 1: Using Bytes type
        const query1 = `
          query {
            commitments(where: { transactionHash_eq: "${txHash}" }, limit: 10) {
              id
              treeNumber
              treePosition
              blockNumber
              transactionHash
              commitmentType
              hash
            }
          }
        `;

        console.log('Trying query with inline variable...');
        const response = await fetch(SEPOLIA_SUBGRAPH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: query1 })
        });

        const result = await response.json();
        console.log('Subgraph response:', result);

        if (result.errors) {
          console.log('Query errors:', result.errors);
        }

        if (result.data?.commitments?.length > 0) {
          console.log('✅ Shield commitment found!');
          console.log('Commitments:', result.data.commitments);
        } else if (!result.errors) {
          console.log('❌ Shield commitment NOT found in subgraph');
        }

        return result;
      } catch (e) {
        console.error('Shield query error:', e.message);
        return { error: e.message };
      }
    },
    // Restore wallet from mnemonic (use this if you have the backup)
    restoreFromMnemonic: async (mnemonic) => {
      const SDK = await loadSdk();

      console.log('=== Restoring Wallet from Mnemonic ===');

      if (!mnemonic || typeof mnemonic !== 'string') {
        console.error('Please provide mnemonic as a string');
        return { error: 'Mnemonic required' };
      }

      // We need an encryption key - derive from a fixed message for restoration
      const tempKey = keccak256(toUtf8Bytes('railgun-restore-temp'));
      const encBytes = getBytes(tempKey);

      try {
        const created = await SDK.createRailgunWallet(
          encBytes,
          mnemonic.trim(),
          undefined,
          0
        );

        const walletID = typeof created === 'string' ? created : created.id || created.walletID;
        let railgunAddress = created.railgunAddress || null;

        if (!railgunAddress && typeof SDK.walletForID === 'function') {
          const wallet = SDK.walletForID(walletID);
          if (wallet && typeof wallet.getAddress === 'function') {
            railgunAddress = await wallet.getAddress();
          }
        }

        console.log('✅ Wallet restored:', { walletID, railgunAddress });

        // Save to localStorage (note: this won't have proper encryption without MetaMask)
        localStorage.setItem('railgun.wallet', JSON.stringify({ walletID, railgunAddress }));

        return { walletID, railgunAddress };
      } catch (e) {
        console.error('Restore error:', e.message);
        return { error: e.message };
      }
    },
    // Inspect merkletree and wallet state directly
    inspectState: async () => {
      console.log('=== Inspecting Railgun Engine State ===');

      const engine = getEngine();
      if (!engine) {
        console.error('❌ Engine not initialized');
        return { error: 'Engine not initialized' };
      }

      const chain = NETWORK_CONFIG[NetworkName.EthereumSepolia].chain;
      const txidVersion = TXIDVersion.V2_PoseidonMerkle;

      const state = {
        engineExists: true,
        wallets: [],
        merkletrees: {}
      };

      // Get wallet info
      try {
        const walletIDs = Object.keys(engine.wallets || {});
        state.walletCount = walletIDs.length;
        console.log(`Found ${walletIDs.length} wallets in engine`);

        for (const walletID of walletIDs) {
          const wallet = engine.wallets[walletID];
          const walletInfo = {
            id: walletID,
            hasAddress: typeof wallet?.getAddress === 'function'
          };

          // Try to get token balances directly
          if (typeof wallet?.getTokenBalancesByBucket === 'function') {
            try {
              const balancesByBucket = await wallet.getTokenBalancesByBucket(txidVersion, chain);
              walletInfo.buckets = {};
              for (const [bucket, balances] of Object.entries(balancesByBucket || {})) {
                const tokenHashes = Object.keys(balances || {});
                walletInfo.buckets[bucket] = {
                  tokenCount: tokenHashes.length,
                  tokens: tokenHashes.map(h => ({
                    hash: h,
                    balance: balances[h]?.balance?.toString() || '0',
                    tokenAddress: balances[h]?.tokenData?.tokenAddress
                  }))
                };
              }
              console.log(`Wallet ${walletID} balances by bucket:`, walletInfo.buckets);
            } catch (e) {
              walletInfo.balanceError = e.message;
              console.warn(`Could not get balances for wallet ${walletID}:`, e.message);

              // Try fallback: get raw token balances without bucket filtering
              try {
                if (typeof wallet?.getTokenBalances === 'function') {
                  const rawBalances = await wallet.getTokenBalances(txidVersion, chain, false);
                  const tokenHashes = Object.keys(rawBalances || {});
                  walletInfo.rawBalances = {
                    tokenCount: tokenHashes.length,
                    tokens: tokenHashes.slice(0, 5).map(h => ({
                      hash: h,
                      balance: rawBalances[h]?.balance?.toString() || '0',
                      tokenAddress: rawBalances[h]?.tokenData?.tokenAddress
                    }))
                  };
                  console.log(`Wallet ${walletID} raw balances (fallback):`, walletInfo.rawBalances);
                }
              } catch (e2) {
                walletInfo.rawBalanceError = e2.message;
                console.warn(`Raw balance fallback also failed:`, e2.message);
              }
            }
          }

          // Get wallet's RAILGUN address
          try {
            if (typeof wallet?.getAddress === 'function') {
              walletInfo.railgunAddress = await wallet.getAddress();
              console.log(`Wallet ${walletID} RAILGUN address:`, walletInfo.railgunAddress);
            }
          } catch (e) {
            walletInfo.addressError = e.message;
          }

          // Check wallet's scanned status
          walletInfo.availableMethods = Object.keys(wallet).filter(k => typeof wallet[k] === 'function').slice(0, 20);

          state.wallets.push(walletInfo);
        }
      } catch (e) {
        state.walletError = e.message;
        console.error('Error getting wallets:', e);
      }

      // Get merkletree info
      try {
        const utxoMerkletree = engine.getUTXOMerkletree?.(txidVersion, chain);
        if (utxoMerkletree) {
          state.merkletrees.utxo = {
            exists: true,
            treeCount: utxoMerkletree.trees?.length || 'unknown'
          };

          // Try to get tree length (number of leaves)
          if (typeof utxoMerkletree.getTreeLength === 'function') {
            try {
              const treeLength = await utxoMerkletree.getTreeLength(0);
              state.merkletrees.utxo.tree0Length = treeLength;
              console.log(`UTXO Merkletree tree 0 has ${treeLength} leaves`);
            } catch (e) {
              state.merkletrees.utxo.treeLengthError = e.message;
            }
          }
        } else {
          state.merkletrees.utxo = { exists: false };
          console.warn('UTXO Merkletree not found');
        }
      } catch (e) {
        state.merkletreeError = e.message;
        console.error('Error getting merkletree:', e);
      }

      console.log('=== Full State ===', state);
      return state;
    },

    // Force wallet to scan balances from merkletree
    forceScanWallet: async () => {
      console.log('=== Force Scanning Wallet Balances ===');

      const engine = getEngine();
      if (!engine) {
        console.error('❌ Engine not initialized');
        return { error: 'Engine not initialized' };
      }

      const chain = NETWORK_CONFIG[NetworkName.EthereumSepolia].chain;
      const txidVersion = TXIDVersion.V2_PoseidonMerkle;

      const walletIDs = Object.keys(engine.wallets || {});
      if (walletIDs.length === 0) {
        console.error('❌ No wallets found');
        return { error: 'No wallets' };
      }

      const walletID = walletIDs[0];
      const wallet = engine.wallets[walletID];
      console.log('Scanning wallet:', walletID);

      try {
        // Try to trigger wallet balance scan
        if (typeof wallet?.scanBalances === 'function') {
          console.log('Calling wallet.scanBalances...');
          await wallet.scanBalances(txidVersion, chain);
          console.log('✅ Wallet scan complete');
        } else {
          console.log('wallet.scanBalances not available, trying alternative methods...');

          // Try to get balances directly
          if (typeof wallet?.getTokenBalances === 'function') {
            console.log('Getting token balances...');
            const balances = await wallet.getTokenBalances(txidVersion, chain, false);
            const tokenCount = Object.keys(balances || {}).length;
            console.log(`Found ${tokenCount} tokens`);

            if (tokenCount > 0) {
              for (const data of Object.values(balances).slice(0, 5)) {
                console.log(`  Token: ${data?.tokenData?.tokenAddress}, Balance: ${data?.balance?.toString()}`);
              }
            }
            return { success: true, tokenCount, sample: Object.entries(balances || {}).slice(0, 3) };
          }
        }

        // Get updated balances
        if (typeof wallet?.getTokenBalancesByBucket === 'function') {
          const buckets = await wallet.getTokenBalancesByBucket(txidVersion, chain);
          console.log('Balances by bucket:', buckets);
          return { success: true, buckets };
        }

        return { success: true, message: 'Scan triggered' };
      } catch (e) {
        console.error('Force scan failed:', e);
        return { error: e.message, stack: e.stack };
      }
    },

    // Clear the IndexedDB database to force a full rescan from beginning
    clearDatabase: async () => {
      console.log('=== Clearing Railgun Database ===');
      console.log('This will delete all merkletree data and force a full rescan.');

      try {
        // Delete the IndexedDB database
        const deleteRequest = indexedDB.deleteDatabase('railgun-wallet-db');

        await new Promise((resolve, reject) => {
          deleteRequest.onsuccess = () => {
            console.log('✅ Database deleted successfully');
            resolve();
          };
          deleteRequest.onerror = () => {
            console.error('❌ Failed to delete database');
            reject(deleteRequest.error);
          };
          deleteRequest.onblocked = () => {
            console.warn('⚠️ Database deletion blocked - close other tabs using this app');
            reject(new Error('Database deletion blocked'));
          };
        });

        console.log('');
        console.log('🔄 Please refresh the page to rescan from the beginning.');
        console.log('The SDK will find your shield commitment and show the balance.');

        return { success: true, message: 'Database cleared. Refresh to rescan.' };
      } catch (e) {
        console.error('Clear database error:', e.message);
        return { error: e.message };
      }
    },
    // Execute a direct private transfer for console testing (bypasses UI flow)
    testPrivateTransfer: async ({
      toRailgunAddress,
      amountWei,
      tokenAddress,
      productId
    } = {}) => {
      if (!toRailgunAddress || typeof toRailgunAddress !== 'string') {
        throw new Error('toRailgunAddress is required');
      }
      if (amountWei == null) {
        throw new Error('amountWei is required');
      }

      console.log('=== Console Test: Private Transfer ===');
      console.log('Recipient:', toRailgunAddress);
      console.log('Amount (wei):', String(amountWei));

      const { privateTransfer } = await import('./railgun-clean/operations/transfer.js');
      const result = await privateTransfer({
        toRailgunAddress,
        amountWei: BigInt(amountWei),
        tokenAddress,
        productId: productId || `console-test-${Date.now()}`,
        onProgress: (state) => {
          console.log('[console-transfer-progress]', state);
        },
      });

      console.log('=== Console Test Transfer Result ===', result);
      return result;
    },
    // Execute a direct unshield for console testing (private -> public EOA)
    testUnshield: async ({
      amountWei,
      toWalletAddress,
      tokenAddress
    } = {}) => {
      if (amountWei == null) {
        throw new Error('amountWei is required');
      }

      console.log('=== Console Test: Unshield WETH ===');
      console.log('Amount (wei):', String(amountWei));
      if (toWalletAddress) {
        console.log('Recipient EOA:', toWalletAddress);
      }

      const { unshieldWETH } = await import('./railgun-clean/operations/unshield.js');
      const result = await unshieldWETH({
        amountWei: BigInt(amountWei),
        toWalletAddress,
        tokenAddress,
        onProgress: (state) => {
          console.log('[console-unshield-progress]', state);
        },
      });

      console.log('=== Console Test Unshield Result ===', result);
      return result;
    },
    // Convenience helper: refresh and return active wallet private balances
    refreshPrivateBalances: async () => {
      const stored = localStorage.getItem('railgun.wallet');
      if (!stored) {
        throw new Error('No active railgun.wallet in localStorage');
      }
      const { walletID } = JSON.parse(stored);
      return getPrivateBalances(walletID);
    }
  };
  console.log('🔧 Railgun debug tools available:');
  console.log('  - window.railgunDebug.inspectState() - Check merkletree and wallet state');
  console.log('  - window.railgunDebug.forceScanWallet() - Force wallet balance scan');
  console.log('  - window.railgunDebug.getScanStatus() - Get SDK scan status');
  console.log('  - window.railgunDebug.forceFullRescan() - Full UTXO rescan');
  console.log('  - window.railgunDebug.getBalanceCache() - View cached balances');
  console.log('  - window.railgunDebug.clearDatabase() - Clear IndexedDB and rescan');
  console.log('  - window.railgunDebug.testPrivateTransfer({...}) - Send private transfer from console');
  console.log('  - window.railgunDebug.testUnshield({...}) - Unshield private WETH to public EOA');
  console.log('  - window.railgunDebug.refreshPrivateBalances() - Refresh active wallet private balances');
}

const railgunClientBrowserApi = {
  initializeSDK,
  createWalletFromSignature,
  loadWallet,
  getPrivateBalances,
  sendPrivateTransfer,
  forceFullRescan,
  getScanStatus,
};

export default railgunClientBrowserApi;




