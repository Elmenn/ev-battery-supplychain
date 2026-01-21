// Railgun SDK Browser Wrapper
// Provides proper initialization with artifact store, network configuration, and wallet creation

import { ethers } from 'ethers';
import { keccak256, toUtf8Bytes, getBytes, Wallet } from 'ethers';
import { NetworkName } from '@railgun-community/shared-models';

let isInitialized = false;
let initializationPromise = null;
let sdk = null;

async function loadSdk() {
  if (sdk) return sdk;
  try {
    const mod = await import('@railgun-community/wallet');
    sdk = mod;
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
      
      const SDK = await loadSdk();
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
      
      const ArtifactStore = SDK.ArtifactStore;
      const artifactStore = new ArtifactStore(
        async (filePath) => {
          try {
            const data = await localforage.getItem(filePath);
            if (!data) return null;
            return data instanceof Uint8Array ? data : new Uint8Array(data);
          } catch (err) {
            console.warn(`⚠️ Could not load artifact ${filePath}:`, err.message);
            return null;
          }
        },
        async (filePath, data) => {
          try {
            await localforage.setItem(filePath, data);
          } catch (err) {
            console.error(`❌ Failed to store artifact ${filePath}:`, err.message);
          }
        },
        async (filePath) => {
          try {
            const data = await localforage.getItem(filePath);
            return data !== null;
          } catch (err) {
            return false;
          }
        }
      );
      
      console.log('✅ Artifact store created');
      
      // Step 4: Set artifact store on SDK (if method exists)
      if (typeof SDK.setArtifactStore === 'function') {
        SDK.setArtifactStore(artifactStore);
        console.log('✅ Artifact store set on SDK');
      }
      
      // Step 5: Start Railgun Engine with CORRECT parameters
      console.log('🚀 Starting Railgun Engine...');
      
      // CRITICAL: Pass db INSTANCE, not string
      // CRITICAL: Pass artifactStore INSTANCE (with correct getArtifact signature)
      await SDK.startRailgunEngine(
        'evbatterydapp',     // walletSource (max 16 chars)
        db,                   // db instance (Level-js)
        true,                 // shouldDebug
        artifactStore,        // artifactStore instance
        false,                // useNativeArtifacts (false for browser)
        false                 // skipMerkletreeScans
      );
      
      console.log('✅ Railgun Engine started');
      
      // Step 6: Load provider for Sepolia
      console.log('📡 Loading Sepolia network...');
      const rpcUrl = options.rpcUrl || process.env.REACT_APP_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/demo';
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      
      try {
        await SDK.loadProvider(
          provider,
          NetworkName.EthereumSepolia,
          2000 // polling interval
        );
        console.log('✅ Sepolia network loaded');
      } catch (providerErr) {
        console.warn('⚠️ Provider load warning:', providerErr.message);
        // Don't fail - engine is still usable
      }
      
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

    const SDK = await loadSdk();

    // Ensure SDK is initialized
    const initRes = await initializeSDK(opts);
    if (!initRes.success) {
      throw new Error(`SDK initialization failed: ${initRes.error}`);
    }

    console.log('✅ SDK ready for wallet creation');

    // Derive encryption key from signature
    const encryptionKey = keccak256(toUtf8Bytes(String(signature)));
    console.log('🔐 Encryption key derived');

    // Check available wallet methods
    const hasCRW = typeof SDK.createRailgunWallet === 'function';
    console.log('💼 Wallet creation method available:', hasCRW);

    if (!hasCRW) {
      throw new Error('SDK.createRailgunWallet not available');
    }

    // Use provided mnemonic (for restore) or generate new one
    const mnemonic = opts.mnemonic || (Wallet.createRandom().mnemonic || {}).phrase || null;

    if (!mnemonic) {
      throw new Error('Failed to get or generate mnemonic');
    }

    console.log('🔄 Creating wallet via SDK...', opts.mnemonic ? '(restoring from mnemonic)' : '(new wallet)');
    const encBytes = getBytes(encryptionKey);

    const created = await SDK.createRailgunWallet(
      encBytes,
      mnemonic,
      undefined,
      0
    );

    const walletID = typeof created === 'string' ? created : created.id || created.walletID;
    let railgunAddress = created.railgunAddress || null;

    // Try to get address if not provided
    if (!railgunAddress && typeof SDK.walletForID === 'function') {
      try {
        const wallet = SDK.walletForID(walletID);
        if (wallet && typeof wallet.getAddress === 'function') {
          railgunAddress = await wallet.getAddress();
        }
      } catch (addrErr) {
        console.warn('⚠️ Could not get wallet address:', addrErr.message);
      }
    }

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
    const SDK = await loadSdk();
    
    const initRes = await initializeSDK();
    if (!initRes.success) {
      throw new Error(`SDK not initialized: ${initRes.error}`);
    }
    
    if (typeof SDK.walletForID === 'function') {
      const wallet = SDK.walletForID(walletID);
      const address = await wallet.getAddress();
      return { walletID, railgunAddress: address };
    }
    
    throw new Error('SDK.walletForID not available');
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
export async function getPrivateBalances(walletID, tokens = []) {
  try {
    const SDK = await loadSdk();
    
    if (typeof SDK.getPrivateBalances === 'function') {
      return await SDK.getPrivateBalances(walletID, tokens);
    }
    
    throw new Error('SDK.getPrivateBalances not available');
  } catch (err) {
    console.error('❌ Failed to get balances:', err.message);
    throw err;
  }
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

export default {
  initializeSDK,
  createWalletFromSignature,
  loadWallet,
  getPrivateBalances,
  sendPrivateTransfer,
};



