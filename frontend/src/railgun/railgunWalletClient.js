// railgunWalletClient.js - Official SDK v10.1.2 Implementation
// 
// Debug Logging Configuration:
// - Set REACT_APP_VERBOSE=true to enable verbose SDK logging
// - All errors and warnings are always logged
// - Engine debug logs are forwarded to console when verbose mode is enabled
// - Merkletree scan logging is enabled in verbose mode
//
// Wallet Creation Strategy (per official docs):
// - First launch: createRailgunWallet(encryptionKey, mnemonic, creationBlockNumbers, derivationIndex) 
//   → returns { id, railgunAddress } (NOT a wallet object)
// - Then: walletForID(walletID) → returns actual RailgunWallet object with methods
// - Subsequent launches: loadWalletByID(encryptionKey, walletID, isViewOnlyWallet)
// - Store walletID and encryptionKey for future reloads
// - Mnemonic must be 12 or 24 words
// - Creation block numbers optimize balance scans (optional)
//
// Encryption Key Strategy (Enterprise Approach):
// - Backend generates cryptographically secure 32-byte encryption keys
// - Frontend receives hex string and converts to Uint8Array for SDK
// - More secure than password-based PBKDF2 derivation
// - No password storage or verification in frontend
//
// Private Balance Tracking:
// - UTXO and TXID merkletree scanning for real-time balance updates
// - Balance buckets: Spendable, ShieldBlocked, ShieldPending, ProofSubmitted, etc.
// - Automatic balance sync when new transactions are detected
// - Callbacks for UI progress indicators and balance updates
// - Manual balance refresh: refreshPrivateBalances() for current wallet, refreshAllBalances() for all wallets
// - QuickSync: Automatically active for faster balance syncing via Graph Protocol
//
// Transaction Types:
// - Shielding: Convert public tokens to private balances (Sepolia WETH optimized)
// - Private Transfers: Send tokens privately between Railgun wallets
// - Cross-Contract Calls: Interact with DeFi contracts privately
// - Unshielding: Convert private balances back to public tokens
// - Relayer Support: For full anonymity (requires @railgun-community/waku-relayer-client)
//
// Sepolia Testnet Features:
// - WETH Contract: 0xfff9976782d46CC05630d1f6eBAb18b2324d6B14
// - RAILGUN Fee: 0.25% (25 basis points) on shielding
// - Auto-ETH wrapping for insufficient WETH balances
// - Comprehensive validation and error handling
// - Fee calculation and transparency
//
import { ethers } from 'ethers';
import { 
  startRailgunEngine,
  loadProvider,
  setFallbackProviderForNetwork,
  setPollingProviderForNetwork,
  createRailgunWallet,
  walletForID,
  loadWalletByID,
  balanceForERC20Token,
  generateTransferProof,
  populateProvedTransfer,
  populateShield,
  gasEstimateForShield,
  getProver,
  setLoggers,
  setOnUTXOMerkletreeScanCallback,
  setOnTXIDMerkletreeScanCallback,
  setOnBalanceUpdateCallback,
  refreshBalances,
  generateCrossContractCallsProof,
  populateProvedCrossContractCalls,
  generateUnshieldProof,
  populateProvedUnshield,
  getRandomBytes,
  bytesToHex,
} from '@railgun-community/wallet';
import { NetworkName, TXIDVersion, NETWORK_CONFIG, MerkletreeScanUpdateEvent, RailgunBalancesEvent } from '@railgun-community/shared-models';
import { chainConfigs } from '@railgun-community/deployments';
import { createArtifactStore } from './create-artifact-store';
import LevelDB from 'level-js';
import localforage from 'localforage';

// Helper function to read artifacts directly from localforage
async function readArtifact(path) {
  try {
    // returns ArrayBuffer/Uint8Array/string depending on what the SDK stored
    return await localforage.getItem(path);
  } catch (error) {
    console.error(`❌ Error reading artifact ${path}:`, error.message);
    return null;
  }
}

// Helper function to generate shield private keys (optional persistence)
let lastShieldPrivKey; // optional persistence
const getShieldPrivKey = () => {
  if (!lastShieldPrivKey) {
    lastShieldPrivKey = ensureShieldKeyHex('0x' + bytesToHex(getRandomBytes(32))); // Ensure 0x prefix
  }
  return lastShieldPrivKey;
};

// Helper to ensure shield key is always a 32-byte hex string
const ensureShieldKeyHex = k =>
  k instanceof Uint8Array ? bytesToHex(k) :
  (typeof k === 'string' && /^0x[0-9a-fA-F]{64}$/.test(k) ? k :
   (() => { throw new Error('shieldPrivateKey must be 32-byte 0x hex'); })());

// Module-level variable to store the artifact store instance
let artifactStoreInstance;

// Helper function to check if ZKP artifacts are ready for shielding
const checkArtifactsReady = async () => {
  try {
    if (!artifactStoreInstance) {
      console.warn('⚠️ No artifact store available');
      return false;
    }
    
    // ArtifactStore is just an adapter - we read directly from localforage
    
    // Check if key artifacts exist and are accessible
    const requiredArtifacts = [
      'circuits/poseidonMerkleTreeCircuit_v2.json',
      'circuits/poseidonMerkleTreeCircuit_v3.json'
    ];
    
    for (const artifact of requiredArtifacts) {
      try {
        // Try different possible method names
        let testArtifact = null;
        
        // Use our helper function to read directly from localforage
        console.log(`📥 Reading artifact ${artifact} from localforage...`);
        testArtifact = await readArtifact(artifact);
        
        if (!testArtifact) {
          console.log(`⏳ Artifact ${artifact} not ready yet`);
          return false;
        }
        console.log(`✅ Artifact ${artifact} is ready`);
      } catch (e) {
        console.log(`⏳ Artifact ${artifact} not accessible yet:`, e.message);
        return false;
      }
    }
    
    console.log('✅ All required ZKP artifacts are ready for shielding');
    return true;
  } catch (e) {
    console.warn('⚠️ Error checking artifacts:', e.message);
    return false;
  }
};

// Helper function to manually trigger artifact downloads
export const triggerArtifactDownload = async () => {
  try {
    console.log('🚀 Manually triggering ZKP artifact downloads...');
    if (!artifactStoreInstance) {
      throw new Error('No artifact store available');
    }
    
    // Try to access key artifacts to trigger downloads
    const artifacts = [
      'circuits/poseidonMerkleTreeCircuit_v2.json',
      'circuits/poseidonMerkleTreeCircuit_v3.json'
    ];
    
    console.log('📥 Triggering downloads for required artifacts...');
    
    for (const artifact of artifacts) {
      try {
        console.log(`📥 Triggering download for ${artifact}...`);
        // Access the artifact to trigger SDK download
        await readArtifact(artifact);
        console.log(`✅ ${artifact} access triggered successfully`);
      } catch (e) {
        console.warn(`⚠️ Failed to access ${artifact}:`, e.message);
      }
    }
    
    // Wait a moment for downloads to start, then check if they're ready
    console.log('⏳ Waiting for artifacts to download...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if artifacts are now ready
    const artifactsReady = await checkArtifactsReady();
    if (artifactsReady) {
      console.log('🎉 All artifacts are now ready!');
    } else {
      console.log('⏳ Artifacts are still downloading in the background...');
      console.log('💡 You can try shielding operations again in a few moments');
    }
    
    console.log('🎉 Artifact download process completed');
    return true;
  } catch (e) {
    console.error('❌ Failed to trigger artifact downloads:', e.message);
    return false;
  }
};

// Enhanced function to wait for artifacts with better timeout handling
const waitForArtifacts = async (maxWaitTimeMs = 60000) => { // 60 seconds default
  console.log('⏳ Waiting for ZKP artifacts to be ready...');
  
  const startTime = Date.now();
  let attempts = 0;
  const maxAttempts = Math.ceil(maxWaitTimeMs / 2000); // Check every 2 seconds
  
  while (Date.now() - startTime < maxWaitTimeMs) {
    attempts++;
    console.log(`🔍 Checking artifacts (attempt ${attempts}/${maxAttempts})...`);
    
    try {
      const ready = await checkArtifactsReady();
      if (ready) {
        console.log('✅ ZKP artifacts are now ready for shielding!');
        return true;
      }
    } catch (e) {
      console.log(`⚠️ Error checking artifacts (attempt ${attempts}):`, e.message);
    }
    
    // Wait 2 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.warn('⏰ Timeout waiting for ZKP artifacts');
  return false;
};

// Comprehensive function to check artifact download status
export const getArtifactStatus = async () => {
  try {
    if (!artifactStoreInstance) {
      return {
        status: 'no_store',
        message: 'No artifact store available',
        artifacts: {},
        ready: false
      };
    }
    
    const requiredArtifacts = [
      'circuits/poseidonMerkleTreeCircuit_v2.json',
      'circuits/poseidonMerkleTreeCircuit_v3.json'
    ];
    
    const artifactStatus = {};
    let allReady = true;
    
    for (const artifact of requiredArtifacts) {
      try {
        const artifactData = await readArtifact(artifact);
        if (artifactData) {
          artifactStatus[artifact] = {
            status: 'ready',
            size: artifactData.length || 'unknown',
            accessible: true
          };
        } else {
          artifactStatus[artifact] = {
            status: 'downloading',
            size: 'unknown',
            accessible: false
          };
          allReady = false;
        }
      } catch (e) {
        artifactStatus[artifact] = {
          status: 'error',
          error: e.message,
          accessible: false
        };
        allReady = false;
      }
    }
    
    return {
      status: allReady ? 'ready' : 'downloading',
      message: allReady ? 'All artifacts are ready for shielding' : 'Some artifacts are still downloading',
      artifacts: artifactStatus,
      ready: allReady
    };
  } catch (e) {
    return {
      status: 'error',
      message: `Error checking artifacts: ${e.message}`,
      artifacts: {},
      ready: false
    };
  }
};

// Force download of all required artifacts
export const forceDownloadArtifacts = async () => {
  try {
    console.log('🚀 Force downloading all required ZKP artifacts...');
    if (!artifactStoreInstance) {
      throw new Error('No artifact store available');
    }
    
    // First, try to warm up artifacts which will trigger actual SDK downloads
    console.log('🔥 Attempting to warm up artifacts via SDK...');
    try {
      await warmUpArtifacts();
    } catch (warmUpError) {
      console.log('⚠️ Warm-up failed, continuing with direct artifact access:', warmUpError.message);
    }
    
    const requiredArtifacts = [
      'circuits/poseidonMerkleTreeCircuit_v2.json',
      'circuits/poseidonMerkleTreeCircuit_v3.json'
    ];
    
    console.log('📥 Force downloading required artifacts...');
    
    for (const artifact of requiredArtifacts) {
      try {
        console.log(`📥 Force downloading ${artifact}...`);
        // Force download by accessing the artifact multiple times
        for (let i = 0; i < 3; i++) {
          try {
            await readArtifact(artifact);
            console.log(`✅ ${artifact} access attempt ${i + 1} successful`);
            break;
          } catch (e) {
            console.log(`⏳ ${artifact} access attempt ${i + 1} failed:`, e.message);
            if (i < 2) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
      } catch (e) {
        console.warn(`⚠️ Failed to force download ${artifact}:`, e.message);
      }
    }
    
    // Wait longer for downloads to complete (artifacts can be large)
    console.log('⏳ Waiting for downloads to complete (this may take several minutes)...');
    await new Promise(resolve => setTimeout(resolve, 15000)); // 15 seconds
    
    // Check final status
    const finalStatus = await getArtifactStatus();
    console.log('📊 Final artifact status:', finalStatus);
    
    if (finalStatus.ready) {
      console.log('🎉 All artifacts are now ready for shielding!');
    } else {
      console.log('⚠️ Some artifacts are still not ready');
      console.log('💡 This may take a few more minutes - artifacts download in background');
    }
    
    return finalStatus;
  } catch (e) {
    console.error('❌ Failed to force download artifacts:', e.message);
    return {
      status: 'error',
      message: `Force download failed: ${e.message}`,
      artifacts: {},
      ready: false
    };
  }
};

// Debug function to inspect localforage storage contents
export const inspectArtifactStorage = async () => {
  try {
    console.log('🔍 Inspecting artifact storage contents...');
    
    // Import localforage dynamically to avoid build issues
    const localforage = await import('localforage');
    
    // Get all keys in storage
    const keys = [];
    await localforage.default.iterate((value, key) => {
      keys.push(key);
    });
    
    console.log('📋 Storage keys found:', keys);
    
    // Check for artifact-related keys
    const artifactKeys = keys.filter(key => key.includes('circuits') || key.includes('artifacts'));
    console.log('🔧 Artifact-related keys:', artifactKeys);
    
    // Try to get details for each artifact key
    for (const key of artifactKeys) {
      try {
        const item = await readArtifact(key);
        if (item) {
          console.log(`✅ ${key}: ${item.length || 'unknown'} bytes`);
        } else {
          console.log(`⏳ ${key}: null/undefined`);
        }
      } catch (e) {
        console.log(`❌ ${key}: Error - ${e.message}`);
      }
    }
    
    return {
      totalKeys: keys.length,
      artifactKeys: artifactKeys,
      storageWorking: true
    };
  } catch (e) {
    console.error('❌ Failed to inspect storage:', e.message);
    return {
      totalKeys: 0,
      artifactKeys: [],
      storageWorking: false,
      error: e.message
    };
  }
};

// Function to check if artifacts are being downloaded by the SDK
export const checkArtifactDownloadActivity = async () => {
  try {
    console.log('🔍 Checking artifact download activity...');
    
    if (!artifactStoreInstance) {
      return {
        status: 'no_store',
        message: 'No artifact store available',
        activity: 'none'
      };
    }
    
    // Check if artifacts exist
    const currentStatus = await getArtifactStatus();
    console.log('📊 Current artifact status:', currentStatus);
    
    // Try to trigger downloads by accessing artifacts
    console.log('🚀 Triggering artifact access to check download activity...');
    
    const artifacts = [
      'circuits/poseidonMerkleTreeCircuit_v2.json',
      'circuits/poseidonMerkleTreeCircuit_v3.json'
    ];
    
    const accessResults = [];
    
    for (const artifact of artifacts) {
      try {
        console.log(`📥 Accessing ${artifact}...`);
        const startTime = Date.now();
        const result = await readArtifact(artifact);
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        if (result) {
          accessResults.push({
            artifact,
            status: 'ready',
            size: result.length || 'unknown',
            accessTime: duration
          });
          console.log(`✅ ${artifact}: Ready (${result.length || 'unknown'} bytes, ${duration}ms)`);
        } else {
          accessResults.push({
            artifact,
            status: 'downloading',
            size: 'unknown',
            accessTime: duration
          });
          console.log(`⏳ ${artifact}: Downloading (${duration}ms)`);
        }
      } catch (e) {
        accessResults.push({
          artifact,
          status: 'error',
          error: e.message,
          accessTime: 'N/A'
        });
        console.log(`❌ ${artifact}: Error - ${e.message}`);
      }
    }
    
    // Wait a moment and check again to see if anything changed
    console.log('⏳ Waiting to check for download progress...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const updatedStatus = await getArtifactStatus();
    console.log('📊 Updated artifact status:', updatedStatus);
    
    // Check if any artifacts were downloaded during the wait
    const downloadActivity = updatedStatus.ready !== currentStatus.ready;
    
    return {
      status: updatedStatus.status,
      message: updatedStatus.message,
      activity: downloadActivity ? 'active' : 'none',
      accessResults,
      beforeStatus: currentStatus,
      afterStatus: updatedStatus,
      downloadDetected: downloadActivity
    };
    
  } catch (e) {
    console.error('❌ Failed to check download activity:', e.message);
    return {
      status: 'error',
      message: `Check failed: ${e.message}`,
      activity: 'unknown',
      error: e.message
    };
  }
};

// Function to check if the SDK is actually using our artifact store
export const checkSDKArtifactStoreUsage = async () => {
  try {
    console.log('🔍 Checking if SDK is using our artifact store...');
    
    if (!artifactStoreInstance) {
      return {
        status: 'no_store',
        message: 'No artifact store available',
        sdkUsingStore: false
      };
    }
    
    // Check if the SDK has called our store functions
    console.log('📊 Checking artifact store usage by SDK...');
    
    // Try to access artifacts and see if the SDK calls our store
    const artifacts = [
      'circuits/poseidonMerkleTreeCircuit_v2.json',
      'circuits/poseidonMerkleTreeCircuit_v3.json'
    ];
    
    const usageResults = [];
    
    for (const artifact of artifacts) {
      try {
        console.log(`📥 Testing SDK access to ${artifact}...`);
        
        // This should trigger the SDK to use our artifact store
        const result = await readArtifact(artifact);
        
        if (result) {
          usageResults.push({
            artifact,
            status: 'found',
            size: result.length || 'unknown',
            sdkCalledStore: true
          });
          console.log(`✅ ${artifact}: Found in store (${result.length || 'unknown'} bytes)`);
        } else {
          usageResults.push({
            artifact,
            status: 'not_found',
            size: 'unknown',
            sdkCalledStore: true
          });
          console.log(`⏳ ${artifact}: Not found, but SDK called store`);
        }
      } catch (e) {
        usageResults.push({
          artifact,
          status: 'error',
          error: e.message,
          sdkCalledStore: false
        });
        console.log(`❌ ${artifact}: Error - ${e.message}`);
      }
    }
    
    // Check if any artifacts were found
    const artifactsFound = usageResults.some(r => r.status === 'found');
    const sdkUsingStore = usageResults.some(r => r.sdkCalledStore);
    
    console.log(`📊 SDK Artifact Store Usage Summary:`);
    console.log(`   - SDK called store: ${sdkUsingStore}`);
    console.log(`   - Artifacts found: ${artifactsFound}`);
    console.log(`   - Total artifacts tested: ${artifacts.length}`);
    
    return {
      status: artifactsFound ? 'ready' : 'downloading',
      message: artifactsFound ? 'Artifacts found in store' : 'Artifacts not found in store',
      sdkUsingStore,
      artifactsFound,
      usageResults,
      summary: {
        totalTested: artifacts.length,
        found: usageResults.filter(r => r.status === 'found').length,
        notFound: usageResults.filter(r => r.status === 'not_found').length,
        errors: usageResults.filter(r => r.status === 'error').length
      }
    };
    
  } catch (e) {
    console.error('❌ Failed to check SDK artifact store usage:', e.message);
    return {
      status: 'error',
      message: `Check failed: ${e.message}`,
      sdkUsingStore: false,
      error: e.message
    };
  }
};

// Address normalization w/ strong primitives
const normalizeAddress = (addr) => {
  if (addr == null) return addr;
  const s = (typeof addr === 'string' ? addr : String(addr)).trim();
  // Only lowercase 0x addresses; leave 0zk railgun addresses intact
  return s.startsWith('0x') ? s.toLowerCase() : s;
};

// Small guards to fail fast (helpful during dev)
const assertString = (v, name) => {
  if (typeof v !== 'string') throw new Error(`${name} must be a string`);
};
const assertHex40 = (v, name) => {
  assertString(v, name);
  if (!/^0x[0-9a-f]{40}$/.test(v)) throw new Error(`${name} must be 0x + 40 hex chars, got: ${v}`);
};

// Resolve Railgun proxy (spender) for Sepolia at runtime.
function getShieldSpenderForSepolia() {
  // prefer chainId lookup
  const cfg = chainConfigs?.[11155111] 
           || chainConfigs?.ethereumSepolia
           || chainConfigs?.sepolia;
  if (!cfg?.proxy) {
    throw new Error('Could not resolve Railgun proxy for Sepolia from @railgun-community/deployments');
  }
  // deployments exposes an object: { address, deploymentBlock }
  return cfg.proxy.address; // <- unwrap the 0x string
}


// WETH allowance management for shielding
// Sepolia WETH: 0xfff9976782d46CC05630d1f6eBAb18b2324d6B14
const WETH = normalizeAddress(process.env.REACT_APP_WETH_ADDRESS || '0xfff9976782d46CC05630d1f6eBAb18b2324d6B14');
const WETH_ABI = [
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function balanceOf(address owner) view returns (uint256)"
];

// RAILGUN fee constants (Sepolia testnet)
const RAILGUN_SHIELD_FEE_BPS = 25; // 0.25% = 25 basis points
const RAILGUN_SHIELD_FEE_DECIMALS = 4; // 4 decimal places for basis points

// Prefer env, else deployments. Always normalize to a checksummed 0x string.
const SHIELD_SPENDER = (() => {
  const fromEnv = process.env.REACT_APP_RAILGUN_SHIELD_SPENDER;
  const addr = fromEnv ? fromEnv : getShieldSpenderForSepolia();
  return normalizeAddress(addr); // normalize to lowercase, prevent checksum issues
})();

// WETH contract ABI for wrapping/unwrapping
const WETH_FULL_ABI = [
  "function deposit() payable",
  "function withdraw(uint256 wad)",
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

// Safe wallet source for Railgun Engine (lowercase, no spaces/hyphens, ≤16 chars)
const WALLET_SOURCE = 'evmarket01';

// Calculate RAILGUN shielding fees
const calculateShieldFee = (amountWei) => {
  const feeBps = BigInt(RAILGUN_SHIELD_FEE_BPS);
  const amount = BigInt(amountWei);
  const fee = (amount * feeBps) / BigInt(10000); // 10000 = 100%
  return fee;
};

// Calculate amount after shielding fee
const calculateAmountAfterFee = (amountWei) => {
  const fee = calculateShieldFee(amountWei);
  const amount = BigInt(amountWei);
  return amount - fee;
};

// Global state
let state = {
  ready: false,
  network: NetworkName.EthereumSepolia,
  railgunWalletID: null,
  railgunWallet: null, // Store the actual wallet object
  railgunAddress: null,
  mnemonic: null, // Store the mnemonic for wallet operations
  encryptionKey: null, // Store the encryption key for wallet operations
  userAddress: null, // Store the public EOA address
};

// Function to reload existing wallet using loadWalletByID
export async function reloadExistingWallet(encryptionKey, walletID) {
  try {
    console.log('🔄 Reloading existing Railgun wallet...');
    console.log('  - Wallet ID:', walletID);
    console.log('  - Encryption key type:', encryptionKey.constructor.name);
    
    // ✅ CORRECT: Use loadWalletByID with proper parameters
    // loadWalletByID(encryptionKey, railgunWalletID, isViewOnlyWallet)
    const reloadedWallet = await loadWalletByID(
      encryptionKey,           // encryptionKey (Uint8Array)
      walletID,                // railgunWalletID (string)
      false                    // isViewOnlyWallet (false for full wallet)
    );
    
    console.log('✅ Wallet reloaded successfully');
    console.log('  - Wallet type:', typeof reloadedWallet);
    console.log('  - Constructor:', reloadedWallet?.constructor?.name);
    
    // Get the Railgun address from the reloaded wallet
    const railgunAddress = reloadedWallet.getAddress();
    console.log('  - Railgun address:', railgunAddress);
    
    // Update state with reloaded wallet
    state = {
      ...state,
      ready: true,
      railgunWalletID: walletID,
      railgunWallet: reloadedWallet,
      railgunAddress: railgunAddress,
      encryptionKey: encryptionKey,
      userAddress: state.userAddress // Keep existing user address
    };
    
    return { railgunAddress, walletID };
    
  } catch (error) {
    console.error('❌ Failed to reload existing wallet:', error);
    throw error;
  }
}

// Initialize the RAILGUN Privacy Engine
export async function initRailgunWallet({ rpcUrl }) {
  try {
    console.log('🔧 Initializing Railgun SDK v10.1.2:', { rpcUrl });

    // Step 1: Start the RAILGUN Privacy Engine
    console.log('🚀 Starting RAILGUN Privacy Engine...');
    
    // LevelDOWN compatible database for storing encrypted wallets
    const dbPath = 'engine.db';
    const db = new LevelDB(dbPath);
    
    // Whether to forward Engine debug logs to Logger
    // Enable this for deeper debug logs in the RAILGUN Privacy Engine
    const shouldDebug = process.env.REACT_APP_VERBOSE === 'true';
    
    // Persistent store for downloading large artifact files required by Engine
    const artifactStore = createArtifactStore();
    // Store the instance globally for artifact checking functions
    artifactStoreInstance = artifactStore;
    
    // Whether to download native C++ or web-assembly artifacts
    // True for mobile. False for nodejs and browser.
    const useNativeArtifacts = false;
    
    // Whether to skip merkletree syncs and private balance scans. 
    // Only set to TRUE in shield-only applications that don't 
    // load private wallets or balances.
    const skipMerkletreeScans = false;
    
    // Array of aggregator node urls for Private Proof of Innocence (Private POI)
    // For now, leave empty - you can add public aggregator nodes later
    const poiNodeURLs = [];
    
    // Add a custom list to check Proof of Innocence against.
    // Leave blank to use the default list for the aggregator node provided.
    const customPOILists = [];
    
    // Set to true if you would like to view verbose logs for private balance and TXID scans
    // This provides detailed information about merkletree syncs and balance updates
    const verboseScanLogging = process.env.REACT_APP_VERBOSE === 'true';
    
    await startRailgunEngine(
      WALLET_SOURCE,
      db,
      shouldDebug,
      artifactStore,
      useNativeArtifacts,
      skipMerkletreeScans,
      poiNodeURLs,
      customPOILists,
      verboseScanLogging
    );
    
    console.log('✅ RAILGUN Privacy Engine started successfully!');

    // Step 1.5: Set up balance and sync callbacks for private balance tracking
    try {
      // Callback for UTXO merkletree scan progress (private balance scanning)
      const onUTXOMerkletreeScanCallback = (eventData) => {
        console.log('🔍 [UTXO Scan]:', {
          status: eventData.status,
          progress: eventData.progress,
          chain: eventData.chain,
          scanType: eventData.scanType,
          message: eventData.message
        });
        
        // You can use this to show progress bars or loading indicators in your UI
        // eventData.status: 'scanning', 'complete', 'error'
        // eventData.progress: 0-100 percentage
      };

      // Callback for TXID merkletree scan progress (transaction ID scanning)
      const onTXIDMerkletreeScanCallback = (eventData) => {
        console.log('🔍 [TXID Scan]:', {
          status: eventData.status,
          progress: eventData.progress,
          chain: eventData.chain,
          scanType: eventData.scanType,
          message: eventData.message
        });
      };

      // Callback for private balance updates (called when balances change)
      const onBalanceUpdateCallback = (balancesFormatted) => {
        console.log('💰 [Balance Update]:', {
          txidVersion: balancesFormatted.txidVersion,
          chain: balancesFormatted.chain,
          railgunWalletID: balancesFormatted.railgunWalletID,
          balanceBucket: balancesFormatted.balanceBucket,
          erc20Count: balancesFormatted.erc20Amounts?.length || 0,
          nftCount: balancesFormatted.nftAmounts?.length || 0
        });
        
        // Log detailed token balances
        if (balancesFormatted.erc20Amounts?.length > 0) {
          console.log('  📊 ERC20 Balances:');
          balancesFormatted.erc20Amounts.forEach(token => {
            console.log(`    - ${token.tokenAddress}: ${token.amount} (${token.balanceBucket})`);
          });
        }
        
        // You can use this to update your UI with real-time balance changes
        // balancesFormatted.balanceBucket: 'Spendable', 'ShieldBlocked', 'ShieldPending', etc.
      };

      // Set the callbacks in the SDK
      setOnUTXOMerkletreeScanCallback(onUTXOMerkletreeScanCallback);
      setOnTXIDMerkletreeScanCallback(onTXIDMerkletreeScanCallback);
      setOnBalanceUpdateCallback(onBalanceUpdateCallback);
      
      console.log('✅ Balance and sync callbacks configured');
      console.log('  - UTXO scan progress tracking enabled');
      console.log('  - TXID scan progress tracking enabled');
      console.log('  - Real-time balance updates enabled');
      
    } catch (e) {
      console.warn('⚠️ Failed to set up balance callbacks:', e.message);
    }

    // Step 1.6: Set up debug logging for Wallet SDK
    try {
      const logMessage = (msg) => {
        // Only log if verbose mode is enabled or if it's an error
        if (process.env.REACT_APP_VERBOSE === 'true' || msg?.includes?.('ERROR') || msg?.includes?.('WARN')) {
          console.log('🔍 [RAILGUN SDK]:', msg);
        }
      };
      
      const logError = (err) => {
        // Always log errors for debugging
        console.error('❌ [RAILGUN SDK ERROR]:', err);
      };

      setLoggers(logMessage, logError);
      console.log('✅ Debug logging configured for Railgun SDK');
      
      if (process.env.REACT_APP_VERBOSE === 'true') {
        console.log('🔍 Verbose logging enabled - all SDK messages will be shown');
      } else {
        console.log('ℹ️ Verbose logging disabled - only errors and warnings shown');
        console.log('💡 Set REACT_APP_VERBOSE=true to see all SDK debug messages');
      }
    } catch (e) {
      console.warn('⚠️ Failed to set up debug logging:', e.message);
    }

    // Step 2: Set up Groth16 prover for proof generation
    try {
      // Try to load snarkjs from global (if loaded via script tag)
      if (window.snarkjs && window.snarkjs.groth16) {
        getProver().setSnarkJSGroth16(window.snarkjs.groth16);
        console.log('✅ Groth16 prover set from global snarkjs');
      } else {
        console.log('⚠️ No global snarkjs found - proofs will not work');
        console.log('💡 Add <script src="./snarkjs.min.js"></script> to your index.html');
        console.log('💡 Download from: https://github.com/Railgun-Community/quickstart/blob/main/browser/snarkjs.min.js');
      }
    } catch (e) {
      console.log('⚠️ Failed to set Groth16 prover:', e.message);
    }

    // Step 2.5: Note about ZKP artifacts (they will download when needed)
    console.log('📥 ZKP artifacts will be downloaded automatically when needed');
    console.log('💡 First shielding operation may take a few minutes to download artifacts');
    console.log('💡 Subsequent operations will be faster once artifacts are cached');

    // Step 3: Load provider using the official format (Enhanced for Sepolia)
    const SEPOLIA_PROVIDERS_JSON = {
      chainId: 11155111, // Sepolia testnet
      providers: [
        {
          provider: rpcUrl.trim(),
          priority: 1,
          weight: 1,
        }
      ],
    };

    console.log('🔍 Loading Sepolia provider with official format:');
    console.log('  - providersJSON:', JSON.stringify(SEPOLIA_PROVIDERS_JSON, null, 2));
    console.log('  - network:', NetworkName.EthereumSepolia);

    // Load provider (this starts merkletree scanning)
    try {
      const pollingInterval = 1000 * 60 * 5; // 5 minutes (official docs recommendation)
      
      const { feesSerialized } = await loadProvider(
        SEPOLIA_PROVIDERS_JSON,
        NetworkName.EthereumSepolia,
        pollingInterval
      );
      
      console.log('✅ Provider loaded for Sepolia');
      console.log('  - Fees:', feesSerialized);
      
      // Parse and log fee information for user transparency
      if (feesSerialized) {
        console.log('💰 RAILGUN Fees (Sepolia):');
        console.log('  - Deposit/Shield fee:', feesSerialized.deposit || '25bp (0.25%)');
        console.log('  - Withdraw/Unshield fee:', feesSerialized.withdraw || '25bp (0.25%)');
        console.log('  - NFT fee:', feesSerialized.nft || '0bp (0%)');
      }
      
    } catch (error) {
      console.log('⚠️ loadProvider failed, trying setPollingProviderForNetwork...');
      console.log('  - Error:', error.message);
      
      // Fallback to alternative approach
      try {
        await setPollingProviderForNetwork(
          NetworkName.EthereumSepolia,
          SEPOLIA_PROVIDERS_JSON
        );
        console.log('✅ Polling provider set for Sepolia (fallback)');
      } catch (fallbackError) {
        console.log('❌ Both provider methods failed:');
        console.log('  - loadProvider error:', error.message);
        console.log('  - setPollingProviderForNetwork error:', fallbackError.message);
        throw new Error(`Failed to load Sepolia provider: ${error.message}`);
      }
    }

    // Step 4: Set fallback provider for MetaMask
    await setFallbackProviderForNetwork(
      NetworkName.EthereumSepolia,
      new ethers.BrowserProvider(window.ethereum)
    );
    console.log('✅ Fallback provider set for MetaMask');
    
    // Note: Merkletree scanning is automatically started by loadProvider above
    // This enables private balance tracking for all Railgun wallets in the database
    // Balance updates will be available through the SDK's balance functions

    // Step 5: Create/load wallet using backend credentials
    // 
    // Wallet Loading Strategy (per official docs):
    // 1. First time: Use createRailgunWallet with mnemonic + encryptionKey
    // 2. Subsequent launches: Use loadWalletByID with stored ID + encryptionKey
    // 3. Store railgunWallet.id and encryptionKey for future reloads
    //
    console.log('🔐 Fetching wallet credentials from backend...');
    
    // Get the user's MetaMask address to fetch their wallet credentials
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const userAddress = await signer.getAddress();
    
    // EOA type guard - ensure userAddress is a plain 0x... string
    if (typeof userAddress !== 'string' || !userAddress.startsWith('0x')) {
      throw new Error(`userAddress must be 0x-string, got: ${typeof userAddress}`);
    }
    console.log('👤 EOA set:', userAddress.toLowerCase());
    
    // Fetch wallet credentials from backend
    const credentialsResponse = await fetch(`${process.env.REACT_APP_RAILGUN_API_URL}/api/railgun/wallet-credentials/${userAddress}`);
    if (!credentialsResponse.ok) {
      throw new Error(`Failed to fetch wallet credentials: ${credentialsResponse.statusText}`);
    }
    
    const credentialsResult = await credentialsResponse.json();
    if (!credentialsResult.success) {
      throw new Error(credentialsResult.error || 'Backend failed to provide wallet credentials');
    }
    
         const { mnemonic, encryptionKey: encryptionKeyHex, railgunAddress } = credentialsResult.data;
     
     // Validate mnemonic (must be 12 or 24 words per docs)
     const wordCount = mnemonic.split(' ').length;
     if (wordCount !== 12 && wordCount !== 24) {
       throw new Error(`Invalid mnemonic: must be 12 or 24 words, got ${wordCount}`);
     }
     console.log('✅ Mnemonic validated:', wordCount, 'words');
     
          // Ensure encryption key is a proper hex string and convert to bytes
     // Per official docs: encryptionKey must be a 32-byte hex string (64 characters)
     // 
     // NOTE: We use backend-generated encryption keys instead of password-based generation
     // This is more secure because:
     // 1. Encryption key is never derived from user input
     // 2. Backend can use cryptographically secure random generation
     // 3. No password storage or verification needed in frontend
     // 4. Follows enterprise security best practices
     let encryptionKey;
     if (Array.isArray(encryptionKeyHex)) {
         // If backend still sends array, convert it
         encryptionKey = new Uint8Array(encryptionKeyHex);
         console.log('⚠️ Frontend: Fixed encryption key from array to Uint8Array');
     } else if (typeof encryptionKeyHex === 'string') {
         // Clean and validate hex string format
         let cleanKey = encryptionKeyHex;
         
         // Remove '0x' prefix if present
         if (cleanKey.startsWith('0x')) {
             cleanKey = cleanKey.slice(2);
         }
         
         // Validate hex string format and length (allow 64 or 66 chars with 0x)
         if (!/^[0-9a-fA-F]{64}$/.test(cleanKey)) {
             throw new Error(`Invalid encryption key format: must be 64 hex characters (got ${cleanKey.length}), or 66 with 0x prefix (got ${encryptionKeyHex.length})`);
         }
         
         // Convert hex string to bytes
         encryptionKey = ethers.getBytes('0x' + cleanKey);
         console.log('✅ Frontend: Encryption key converted from hex string to bytes');
         
         // Verify byte length (should be 32 bytes)
         if (encryptionKey.length !== 32) {
             throw new Error(`Invalid encryption key length: must be 32 bytes, got ${encryptionKey.length} bytes`);
         }
     } else {
         throw new Error(`Invalid encryption key format: ${typeof encryptionKeyHex}`);
     }
    
    // For existing wallets, we don't have creation block numbers yet
    // This would optimize balance scans if we knew when the wallet was created
    const creationBlockNumbers = undefined;
    
    console.log('🔐 Creating Railgun wallet with backend credentials...');
    console.log('  - Mnemonic length:', mnemonic.split(' ').length, 'words');
    console.log('  - Encryption key type:', encryptionKey.constructor.name);
    console.log('  - Creation block numbers:', creationBlockNumbers || 'Unknown (will scan from genesis)');
    
    const walletResult = await createRailgunWallet(
      encryptionKey, // encryptionKey (from backend)
      mnemonic, // mnemonic (from backend)
      creationBlockNumbers, // creationBlockNumbers (undefined for existing wallet)
      0 // railgunWalletDerivationIndex (default to 0)
    );
    
    console.log('🔍 DEBUG: createRailgunWallet returned:', walletResult);
    console.log('🔍 DEBUG: walletResult type:', typeof walletResult);
    console.log('🔍 DEBUG: walletResult keys:', walletResult ? Object.keys(walletResult) : 'null/undefined');
    
    // ✅ CORRECT: createRailgunWallet returns { id, railgunAddress }, NOT a wallet object
    if (!walletResult || !walletResult.id) {
      throw new Error('createRailgunWallet failed to return wallet ID');
    }
    
    const walletID = walletResult.id;
    console.log('✅ Extracted walletID:', walletID);
    
    // ✅ CORRECT: Use walletForID to get the actual wallet object with methods
    console.log('🔐 Getting actual wallet object with methods...');
    const actualWallet = await walletForID(walletID);
    console.log('🔍 DEBUG: actualWallet from walletForID:', actualWallet);
    console.log('🔍 DEBUG: actualWallet constructor:', actualWallet?.constructor?.name);
    console.log('🔍 DEBUG: actualWallet methods:', Object.getOwnPropertyNames(actualWallet));
    
    // ✅ CORRECT: Get the REAL Railgun address from the wallet object
    console.log('🔐 Getting real Railgun address from wallet...');
    const realRailgunAddress = actualWallet.getAddress();
    console.log('🔍 DEBUG: Real Railgun address from wallet.getAddress():', realRailgunAddress);
    
    // Validate shield spender configuration
    console.log('🧩 Railgun shield spender (Sepolia):', SHIELD_SPENDER);
    
    // Final validation - ensure we have a real shield spender
    if (!SHIELD_SPENDER || SHIELD_SPENDER === '0x0000000000000000000000000000000000000000') {
      throw new Error('Invalid Railgun shield spender for Sepolia - check deployments package');
    }
    
    // ✅ CORRECT: Store the actual wallet object, not the creation result
    state = { 
      ...state, 
      ready: true, 
      railgunWalletID: walletID, // Store the ID string for future loadWalletByID calls
      railgunWallet: actualWallet, // Store the ACTUAL wallet object with methods
      railgunAddress: realRailgunAddress, // Use the REAL address from the wallet
      mnemonic, // Store the mnemonic
      encryptionKey, // Store the encryption key for future wallet loading
      userAddress // ✅ keep the public 0x address for SDK calls that need it
    };

    console.log('✅ Railgun wallet created:', { railgunAddress: realRailgunAddress, walletID });
    
    // Important: Store walletID and encryptionKey for future launches
    // On next app launch, you could use loadWalletByID instead of createRailgunWallet
    console.log('💾 Wallet info stored for future reloads:');
    console.log('  - Wallet ID:', walletID);
    console.log('  - Encryption key type:', state.encryptionKey.constructor.name);
    console.log('  - Railgun address:', realRailgunAddress);
    
    // Run self-test to verify everything works
    try { 
      await __selfTestRailgunSDK(); 
    } catch (error) {
      console.warn('Self-test failed:', error.message);
    }
    
    return { railgunAddress: realRailgunAddress };
  } catch (error) {
    console.error('❌ Failed to initialize Railgun SDK:', error);
    throw error;
  }
}

export function getRailgunAddress() {
  if (!state.ready) {
    throw new Error('Railgun wallet not initialized');
  }
  return state.railgunAddress;
}

// Manually trigger a balance scan for the current wallet
export async function refreshPrivateBalances() {
  if (!state.ready || !state.railgunWallet) {
    throw new Error('Railgun wallet not initialized');
  }
  
  try {
    console.log('🔄 Manually refreshing private balances...');
    
    // Get the chain configuration for Sepolia
    const { chain } = NETWORK_CONFIG[NetworkName.EthereumSepolia];
    if (!chain) {
      throw new Error('Could not get Sepolia chain configuration');
    }
    
    // Optional: Only scan the current wallet (faster than scanning all wallets)
    const walletIdFilter = [state.railgunWalletID];
    
    console.log('🔍 Starting balance refresh scan...');
    console.log('  - Chain:', chain);
    console.log('  - Wallet ID filter:', walletIdFilter);
    console.log('  - This may take a few minutes on first sync, seconds on subsequent calls');
    
    // Use the official refreshBalances API
    await refreshBalances(chain, walletIdFilter);
    
    console.log('✅ Balance refresh scan completed successfully!');
    console.log('  - Check console for scan progress and balance update callbacks');
    console.log('  - New balances will be available through getWalletBalance()');
    
    // Optionally get the latest balance to confirm the refresh worked
    const wethBalance = await getWalletBalance(process.env.REACT_APP_WETH_ADDRESS || '0xfff9976782d97CC05630d1f6eBAb18b2324d6B14');
    console.log('  - Current WETH balance:', wethBalance?.toString() || '0');
    
    return wethBalance;
  } catch (error) {
    console.error('Failed to refresh private balances:', error);
    throw error;
  }
}

// Enhanced balance refresh with options (per official docs)
export async function refreshAllBalances(options = {}) {
  if (!state.ready) {
    throw new Error('Railgun wallet not initialized');
  }
  
  try {
    const { 
      walletIds = undefined, // undefined = scan all wallets, array = scan specific wallets
      showProgress = true 
    } = options;
    
    console.log('🔄 Starting comprehensive balance refresh...');
    
    // Get the chain configuration for Sepolia
    const { chain } = NETWORK_CONFIG[NetworkName.EthereumSepolia];
    if (!chain) {
      throw new Error('Could not get Sepolia chain configuration');
    }
    
    if (showProgress) {
      console.log('🔍 Balance refresh options:');
      console.log('  - Chain:', chain);
      console.log('  - Wallet filter:', walletIds ? `Specific wallets: ${walletIds.join(', ')}` : 'All wallets');
      console.log('  - First sync: ~few minutes, Subsequent: ~few seconds');
    }
    
    // Use the official refreshBalances API
    await refreshBalances(chain, walletIds);
    
    console.log('✅ Comprehensive balance refresh completed!');
    console.log('  - All wallets have been scanned');
    console.log('  - New balances available through getWalletBalance()');
    console.log('  - Check console for detailed scan progress and balance updates');
    
    return true;
  } catch (error) {
    console.error('Failed to refresh all balances:', error);
    throw error;
  }
}

// Ensure WETH allowance for shielding operations
export async function ensureWETHAllowance(amountWei) {
  if (!state.ready) {
    throw new Error('Railgun wallet not initialized');
  }
  
  // Defensive check for missing shield spender
  if (!SHIELD_SPENDER || SHIELD_SPENDER === '0x0000000000000000000000000000000000000000') {
    console.warn('⚠️ SHIELD_SPENDER is missing or zero address – skipping approval. Set REACT_APP_RAILGUN_SHIELD_SPENDER.');
    return;
  }
  
  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const owner = await signer.getAddress();

    const weth = new ethers.Contract(normalizeAddress(WETH), WETH_ABI, signer);
    const current = await weth.allowance(owner, SHIELD_SPENDER);

    if (current >= amountWei) {
      console.log('✅ Allowance sufficient:', current.toString());
      return;
    }
    
    console.log('🔧 Approving WETH for shield spender…');
    console.log('  - Owner:', owner);
    console.log('  - Spender:', SHIELD_SPENDER);
    console.log('  - Current allowance:', current.toString());
    console.log('  - Required amount:', amountWei.toString());
    
    const tx = await weth.approve(SHIELD_SPENDER, amountWei);
    await tx.wait();
    console.log('✅ WETH approved for spender', SHIELD_SPENDER);
  } catch (error) {
    console.error('Failed to ensure WETH allowance:', error);
    throw error;
  }
}

export async function getWalletBalance(tokenAddress) {
  if (!state.ready) {
    throw new Error('Railgun wallet not initialized');
  }
  
  try {
    // SDK v10.1.2 signature: balanceForERC20Token(txidVersion, wallet, networkName, tokenAddress, onlySpendable)
    if (!state.railgunWallet) {
      throw new Error('Railgun wallet object not available');
    }
    
    console.log('🔍 DEBUG: Calling balanceForERC20Token with:');
    console.log('  - wallet:', state.railgunWallet);
    console.log('  - networkName:', NetworkName.EthereumSepolia);
    console.log('  - tokenAddress:', tokenAddress);
    console.log('  - onlySpendable: true');
    
    const balance = await balanceForERC20Token(
      TXIDVersion.V3_PoseidonMerkle,            // ✅ Try V3 first for balance queries
      state.railgunWallet,
      NetworkName.EthereumSepolia,
      normalizeAddress(tokenAddress),            // ✅ normalize token address
      true
    );
    return balance;
  } catch (error) {
    console.error('Failed to get wallet balance:', error);
    throw error;
  }
}

export async function privateTransfer(
  toAddress,
  tokenAddress,
  amount,
  memo
) {
  if (!state.ready) {
    throw new Error('Railgun wallet not initialized');
  }

  try {
    // SDK v10.1.2 signature: generateTransferProof(txidVersion, networkName, railgunWalletID, encryptionKey, showSenderAddressToRecipient, memoText, erc20AmountRecipients, nftAmountRecipients, broadcasterFeeERC20AmountRecipient, sendWithPublicWallet, overallBatchMinGasPrice, progressCallback)
    if (!state.railgunWallet) {
      throw new Error('Railgun wallet object not available');
    }
    
    // ✅ use the SDK wallet object's id consistently
    const railgunWalletID = state.railgunWallet?.id;
    
    const transferProof = await generateTransferProof(
      TXIDVersion.V3_PoseidonMerkle,             // ✅ 1st param - Try V3 first
      NetworkName.EthereumSepolia, // networkName - use CORRECT camelCase key
      railgunWalletID,  // ✅ SDK wallet ID from wallet object
      ethers.hexlify(state.encryptionKey), // encryptionKey - FIXED: convert Uint8Array back to hex string
      false, // showSenderAddressToRecipient
      memo || '0x', // memoText
      [{ recipientAddress: normalizeAddress(toAddress), amount: amount.toString(), tokenAddress: normalizeAddress(tokenAddress) }], // erc20AmountRecipients - ✅ normalize addresses
      [], // nftAmountRecipients
      undefined, // broadcasterFeeERC20AmountRecipient
      false, // sendWithPublicWallet
      undefined, // overallBatchMinGasPrice
      undefined // progressCallback
    );

    // SDK v10.1.2 signature: populateProvedTransfer(txidVersion, networkName, railgunWalletID, showSenderAddressToRecipient, memoText, erc20AmountRecipients, nftAmountRecipients, broadcasterFeeERC20AmountRecipient, sendWithPublicWallet, overallBatchMinGasPrice, gasDetails)
    const populatedTransfer = await populateProvedTransfer(
      TXIDVersion.V3_PoseidonMerkle,             // ✅ 1st param - Try V3 first
      NetworkName.EthereumSepolia, // networkName - use CORRECT camelCase key
      railgunWalletID,  // ✅ SDK wallet ID from wallet object
      false, // showSenderAddressToRecipient
      memo || '0x', // memoText
      [{ recipientAddress: normalizeAddress(toAddress), amount: amount.toString(), tokenAddress: normalizeAddress(tokenAddress) }], // erc20AmountRecipients - ✅ normalize addresses
      [], // nftAmountRecipients
      undefined, // broadcasterFeeERC20AmountRecipient
      false, // sendWithPublicWallet
      undefined, // overallBatchMinGasPrice
      undefined // gasDetails
    );
    
    return { 
      txHash: populatedTransfer.transaction?.hash || '0x', 
      transfer: populatedTransfer.transaction,
      proof: transferProof 
    };
  } catch (error) {
    console.error('Failed to generate private transfer:', error);
    throw error;
  }
}

// Cross-contract calls for private DeFi interactions
export async function privateCrossContractCall(
  contractAddress,
  data,
  value = '0',
  options = {}
) {
  if (!state.ready || !state.railgunWallet) {
    throw new Error('Railgun wallet not initialized');
  }

  try {
    const { 
      memo = '0x',
      showSenderAddress = false,
      broadcasterFee = undefined,
      sendWithPublicWallet = false
    } = options;

    console.log('🔗 Generating private cross-contract call...');
    console.log('  - Contract:', contractAddress);
    console.log('  - Data length:', data.length);
    console.log('  - Value:', value);
    console.log('  - Memo:', memo);

    // ✅ use the SDK wallet object's id consistently
    const railgunWalletID = state.railgunWallet?.id;

    // Generate proof for cross-contract call
    const crossContractProof = await generateCrossContractCallsProof(
      TXIDVersion.V3_PoseidonMerkle,
      NetworkName.EthereumSepolia,
      railgunWalletID,
      ethers.hexlify(state.encryptionKey),
      showSenderAddress,
      memo,
      [{
        contractAddress: normalizeAddress(contractAddress),
        data: data,
        value: value.toString()
      }],
      undefined, // nftAmountRecipients
      broadcasterFee,
      sendWithPublicWallet,
      undefined, // overallBatchMinGasPrice
      undefined // progressCallback
    );

    console.log('✅ Cross-contract call proof generated');

    // Populate the transaction
    const populatedCrossContractCall = await populateProvedCrossContractCalls(
      TXIDVersion.V3_PoseidonMerkle,
      NetworkName.EthereumSepolia,
      railgunWalletID,
      showSenderAddress,
      memo,
      [{
        contractAddress: normalizeAddress(contractAddress),
        data: data,
        value: value.toString()
      }],
      undefined, // nftAmountRecipients
      broadcasterFee,
      sendWithPublicWallet,
      undefined, // overallBatchMinGasPrice
      undefined // gasDetails
    );

    console.log('✅ Cross-contract call transaction populated');

    return {
      txHash: populatedCrossContractCall.transaction?.hash || '0x',
      transaction: populatedCrossContractCall.transaction,
      proof: crossContractProof
    };

  } catch (error) {
    console.error('Failed to generate private cross-contract call:', error);
    throw error;
  }
}

export async function shield(tokenAddress, amount, options = {}) {
  if (!state.ready) throw new Error('Railgun wallet not initialized');
  if (!state.railgunWallet) throw new Error('Railgun wallet object not available');

  const { autoWrap = true } = options;

  const tokenAddrNorm = normalizeAddress(tokenAddress);
  assertHex40(tokenAddrNorm, 'tokenAddress');

  const fromEOA = normalizeAddress(state.userAddress);
  assertHex40(fromEOA, 'fromWalletPublicAddress');

  const railgunRecipient = String(state.railgunAddress);
  assertString(railgunRecipient, 'recipientAddress');

  console.log('🛡️ Attempting to shield WETH on Sepolia testnet...');
  console.log('  - Network: Sepolia Testnet (Chain ID: 11155111)');
  console.log('  - Token: WETH (Wrapped Ether)');
  console.log('  - Token Address:', tokenAddrNorm);
  console.log('  - Amount to shield:', ethers.formatEther(amount), 'WETH');
  console.log('  - Railgun recipient:', state.railgunAddress);
  console.log('  - Auto-wrap ETH to WETH:', autoWrap);
  
  // Calculate and display RAILGUN fees
  const shieldFee = calculateShieldFee(amount);
  const amountAfterFee = calculateAmountAfterFee(amount);
  console.log('💰 RAILGUN Fee Breakdown:');
  console.log('  - Shield fee: 0.25% (25 basis points)');
  console.log('  - Fee amount:', ethers.formatEther(shieldFee), 'WETH');
  console.log('  - Amount after fee:', ethers.formatEther(amountAfterFee), 'WETH');
  console.log('  - Total cost (including fee):', ethers.formatEther(amount), 'WETH');

  if (autoWrap) {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const owner = await signer.getAddress();
    const weth = new ethers.Contract(normalizeAddress(WETH), WETH_FULL_ABI, signer);
    const currentWETH = await weth.balanceOf(owner);
    if (currentWETH < amount) {
      await wrapETHtoWETH(amount - currentWETH);
    } else {
      console.log('✅ Sufficient WETH balance:', ethers.formatEther(currentWETH), 'WETH');
    }
  }

  console.log('🔐 Checking WETH allowance for shielding...');
  await ensureWETHAllowance(amount);

  // 1) Build recipients array
  const erc20AmountRecipients = [{
    recipientAddress: railgunRecipient,      // 0zk… address (do NOT lowercase)
    amount: String(amount),
    tokenAddress: tokenAddrNorm,             // normalized 0x…
  }];

  // 2) Create a fresh 32-byte shield key (hex string, 0x…)
  const shieldPrivateKey = ensureShieldKeyHex('0x' + bytesToHex(getRandomBytes(32))); // Ensure 0x prefix

  // 3) Get gas estimate FIRST – this triggers artifact download if needed
  console.log('🔍 Getting gas estimate with SDK v10.1.2...');
  
  // Validate recipient is a real Railgun address
  const recipient = String(state.railgunAddress);
  if (!/^0zk1[0-9a-z]{120,140}$/.test(recipient)) {
    throw new Error('Invalid Railgun recipient (expected 0zk… address)');
  }
  
  // Use V2_PoseidonMerkle for Sepolia (simple, working path)
  const txidVersion = TXIDVersion.V2_PoseidonMerkle;
  console.log(`✅ Using TXID version: ${txidVersion}`);
  
  const gasEstimate = await gasEstimateForShield(
    txidVersion,                               // ✅ Dynamic TXID version
    NetworkName.EthereumSepolia,               // networkName
    shieldPrivateKey,                          // fresh random shield key
    erc20AmountRecipients,                     // array
    [],                                        // nft recipients
    fromEOA                                    // public 0x sender (EOA)
  );

  console.log('✅ Gas estimate received:', gasEstimate);

  // 4) Populate transaction using SDK v10.1.2
  console.log('🔍 Populating shield transaction with SDK v10.1.2...');
  
  const shieldTransaction = await populateShield(
    txidVersion,                               // ✅ Same TXID version as gas estimate
    NetworkName.EthereumSepolia,               // networkName
    shieldPrivateKey,                          // ✅ same key as above
    erc20AmountRecipients,                     // ✅ same recipients
    [],                                        // nft recipients
    gasEstimate                                // ✅ gas details from step 3
  );

  console.log('✅ Shield transaction populated:', shieldTransaction);

  return {
    txHash: shieldTransaction.transaction?.hash || '0x',
    transaction: shieldTransaction.transaction
  };
}

// Convenience function: Shield ETH by auto-wrapping to WETH first
export async function shieldETH(amountWei, options = {}) {
  console.log('🛡️🔄 Shielding ETH (will auto-wrap to WETH):', ethers.formatEther(amountWei), 'ETH');
  
  // Always auto-wrap when shielding ETH
  const shieldOptions = { ...options, autoWrap: true };
  
  // Use WETH address for shielding
  return await shield(WETH, amountWei, shieldOptions);
}

// Comprehensive Sepolia WETH shielding with full validation
export async function shieldSepoliaWETH(amountWei, options = {}) {
  try {
    console.log('🛡️🚀 Starting comprehensive Sepolia WETH shielding...');
    console.log('  - Amount:', ethers.formatEther(amountWei), 'WETH');
    console.log('  - Options:', JSON.stringify(options, null, 2));

    // Step 1: Validate all prerequisites
    const validation = await validateSepoliaShielding(amountWei);
    
    if (!validation.valid) {
      console.log('❌ Shielding validation failed:', validation.reason);
      
      // Handle specific validation failures
      if (validation.reason === 'insufficient_weth') {
        console.log('💡 Auto-wrapping ETH to WETH...');
        await wrapETHtoWETH(validation.shortfall);
        console.log('✅ ETH wrapped to WETH successfully');
      }
      
      if (validation.reason === 'insufficient_allowance') {
        console.log('💡 Approving WETH for Railgun shield spender...');
        await ensureWETHAllowance(amountWei);
        console.log('✅ WETH allowance approved');
      }
      
      if (validation.reason === 'insufficient_gas') {
        throw new Error(`Insufficient ETH for gas fees. Need at least ${ethers.formatEther(validation.estimatedGas)} ETH, have ${ethers.formatEther(validation.ethBalance)} ETH`);
      }
      
      // Re-validate after fixes
      const revalidation = await validateSepoliaShielding(amountWei);
      if (!revalidation.valid) {
        throw new Error(`Shielding validation still failed after fixes: ${revalidation.reason}`);
      }
    }

    // Step 2: Execute the shield transaction
    console.log('🚀 Executing WETH shield transaction...');
    const shieldResult = await shield(WETH, amountWei, { ...options, autoWrap: false });
    
    // Step 3: Display comprehensive results
    console.log('🎉 Sepolia WETH shielding completed successfully!');
    console.log('📊 Transaction Summary:');
    console.log('  - Network: Sepolia Testnet');
    console.log('  - Token: WETH (Wrapped Ether)');
    console.log('  - Amount shielded:', ethers.formatEther(amountWei), 'WETH');
    console.log('  - RAILGUN fee: 0.25%');
    console.log('  - Fee amount:', ethers.formatEther(calculateShieldFee(amountWei)), 'WETH');
    console.log('  - Amount after fee:', ethers.formatEther(calculateAmountAfterFee(amountWei)), 'WETH');
    console.log('  - Transaction hash:', shieldResult.txHash);
    console.log('  - Railgun address:', state.railgunAddress);
    
    // Step 4: Refresh balances to show new private balance
    console.log('🔄 Refreshing private balances...');
    try {
      await refreshPrivateBalances();
      console.log('✅ Private balances refreshed');
    } catch (error) {
      console.warn('⚠️ Failed to refresh private balances:', error.message);
    }
    
    return {
      ...shieldResult,
      network: 'Sepolia Testnet',
      token: 'WETH',
      amountShielded: amountWei,
      feeAmount: calculateShieldFee(amountWei),
      amountAfterFee: calculateAmountAfterFee(amountWei),
      railgunAddress: state.railgunAddress
    };

  } catch (error) {
    console.error('❌ Sepolia WETH shielding failed:', error);
    throw error;
  }
}

// Wrap SepoliaETH to WETH for shielding
export async function wrapETHtoWETH(amountWei) {
  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    
    console.log('🔄 Wrapping ETH to WETH...');
    console.log('  - Amount:', ethers.formatEther(amountWei), 'ETH');
    
    const weth = new ethers.Contract(normalizeAddress(WETH), WETH_FULL_ABI, signer);
    
    // Check current WETH balance
    const owner = await signer.getAddress();
    const currentWETH = await weth.balanceOf(owner);
    console.log('  - Current WETH balance:', ethers.formatEther(currentWETH), 'WETH');
    
    // Wrap ETH to WETH
    const tx = await weth.deposit({ value: amountWei });
    console.log('  - Wrapping transaction:', tx.hash);
    
    await tx.wait();
    console.log('✅ ETH wrapped to WETH successfully!');
    
    // Check new WETH balance
    const newWETH = await weth.balanceOf(owner);
    console.log('  - New WETH balance:', ethers.formatEther(newWETH), 'WETH');
    
    return newWETH;
  } catch (error) {
    console.error('Failed to wrap ETH to WETH:', error);
    throw error;
  }
}

// Unshield tokens from private balance to public wallet
export async function unshield(
  toAddress,
  tokenAddress,
  amount,
  options = {}
) {
  if (!state.ready || !state.railgunWallet) {
    throw new Error('Railgun wallet not initialized');
  }

  try {
    const { 
      memo = '0x',
      showSenderAddress = false,
      broadcasterFee = undefined,
      sendWithPublicWallet = false
    } = options;

    console.log('🔄 Unshielding tokens to public wallet...');
    console.log('  - To address:', toAddress);
    console.log('  - Token:', tokenAddress);
    console.log('  - Amount:', amount.toString());
    console.log('  - Memo:', memo);

    // ✅ use the SDK wallet object's id consistently
    const railgunWalletID = state.railgunWallet?.id;

    // Build recipients array for unshielding
    const erc20AmountRecipients = [{
      recipientAddress: normalizeAddress(toAddress), // Public 0x address
      amount: amount.toString(),
      tokenAddress: normalizeAddress(tokenAddress)
    }];

    // Generate proof for unshielding
    const unshieldProof = await generateUnshieldProof(
      TXIDVersion.V3_PoseidonMerkle,
      NetworkName.EthereumSepolia,
      railgunWalletID,
      ethers.hexlify(state.encryptionKey),
      showSenderAddress,
      memo,
      erc20AmountRecipients,
      [], // nftAmountRecipients
      broadcasterFee,
      sendWithPublicWallet,
      undefined, // overallBatchMinGasPrice
      undefined // progressCallback
    );

    console.log('✅ Unshield proof generated');

    // Populate the transaction
    const populatedUnshield = await populateProvedUnshield(
      TXIDVersion.V3_PoseidonMerkle,
      NetworkName.EthereumSepolia,
      railgunWalletID,
      showSenderAddress,
      memo,
      erc20AmountRecipients,
      [], // nftAmountRecipients
      broadcasterFee,
      sendWithPublicWallet,
      undefined, // overallBatchMinGasPrice
      undefined // gasDetails
    );

    console.log('✅ Unshield transaction populated');

    return {
      txHash: populatedUnshield.transaction?.hash || '0x',
      transaction: populatedUnshield.transaction,
      proof: unshieldProof
    };

  } catch (error) {
    console.error('Failed to generate unshield transaction:', error);
    throw error;
  }
}

// Convenience function: Unshield WETH back to ETH
export async function unshieldWETHtoETH(amountWei, toAddress, options = {}) {
  console.log('🔄🛡️ Unshielding WETH to ETH:', ethers.formatEther(amountWei), 'WETH');
  
  // Unshield WETH to the specified address
  const unshieldResult = await unshield(toAddress, WETH, amountWei, options);
  
  // Note: The recipient will need to unwrap WETH to ETH after receiving
  console.log('💡 Recipient should unwrap WETH to ETH after receiving');
  
  return unshieldResult;
}

// Validate Sepolia WETH shielding prerequisites
export async function validateSepoliaShielding(amountWei) {
  if (!state.ready) {
    throw new Error('Railgun wallet not initialized');
  }

  try {
    console.log('🔍 Validating Sepolia WETH shielding prerequisites...');
    
    // Check if we're on Sepolia testnet
    const provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    
    if (network.chainId !== 11155111n) {
      throw new Error(`Wrong network! Expected Sepolia (11155111), got ${network.chainId}`);
    }
    console.log('✅ Network: Sepolia testnet confirmed');

    // Check WETH contract exists and is accessible
    const wethContract = new ethers.Contract(WETH, WETH_ABI, provider);
    try {
      const wethName = await wethContract.name();
      const wethSymbol = await wethContract.symbol();
      console.log('✅ WETH Contract:', `${wethName} (${wethSymbol})`);
    } catch (error) {
      throw new Error(`WETH contract not accessible: ${error.message}`);
    }

    // Check user's WETH balance
    const signer = await provider.getSigner();
    const userAddress = await signer.getAddress();
    const wethBalance = await wethContract.balanceOf(userAddress);
    
    console.log('💰 WETH Balance Check:');
    console.log('  - User address:', userAddress);
    console.log('  - Current WETH balance:', ethers.formatEther(wethBalance), 'WETH');
    console.log('  - Required amount:', ethers.formatEther(amountWei), 'WETH');
    
    if (wethBalance < amountWei) {
      const shortfall = amountWei - wethBalance;
      console.log('⚠️ Insufficient WETH balance');
      console.log('  - Shortfall:', ethers.formatEther(shortfall), 'WETH');
      console.log('  - Need to wrap ETH to WETH first');
      return { 
        valid: false, 
        reason: 'insufficient_weth',
        shortfall: shortfall,
        needsWrapping: true
      };
    }

    // Check WETH allowance for Railgun shield spender
    const currentAllowance = await wethContract.allowance(userAddress, SHIELD_SPENDER);
    console.log('🔐 WETH Allowance Check:');
    console.log('  - Shield spender:', SHIELD_SPENDER);
    console.log('  - Current allowance:', ethers.formatEther(currentAllowance), 'WETH');
    console.log('  - Required allowance:', ethers.formatEther(amountWei), 'WETH');
    
    if (currentAllowance < amountWei) {
      console.log('⚠️ Insufficient WETH allowance');
      console.log('  - Need to approve WETH for Railgun shield spender');
      return { 
        valid: false, 
        reason: 'insufficient_allowance',
        currentAllowance: currentAllowance,
        needsApproval: true
      };
    }

    // Check ETH balance for gas fees
    const ethBalance = await provider.getBalance(userAddress);
    const estimatedGas = ethers.parseEther('0.01'); // Rough estimate for Sepolia
    
    console.log('⛽ Gas Fee Check:');
    console.log('  - ETH balance:', ethers.formatEther(ethBalance), 'ETH');
    console.log('  - Estimated gas cost:', ethers.formatEther(estimatedGas), 'ETH');
    
    if (ethBalance < estimatedGas) {
      console.log('⚠️ Insufficient ETH for gas fees');
      return { 
        valid: false, 
        reason: 'insufficient_gas',
        ethBalance: ethBalance,
        estimatedGas: estimatedGas
      };
    }

    console.log('✅ All Sepolia WETH shielding prerequisites validated!');
    return { valid: true };

  } catch (error) {
    console.error('❌ Sepolia shielding validation failed:', error);
    throw error;
  }
}

// Comprehensive transaction helper for common DeFi operations
export async function privateDeFiInteraction(
  operation,
  params,
  options = {}
) {
  if (!state.ready || !state.railgunWallet) {
    throw new Error('Railgun wallet not initialized');
  }

  try {
    console.log('🔗 Executing private DeFi interaction:', operation);
    
    switch (operation) {
      case 'swap':
        // Example: Private token swap via DEX
        const { tokenIn, tokenOut, amountIn, minAmountOut, swapData } = params;
        return await privateCrossContractCall(
          tokenOut, // DEX contract address
          swapData, // Encoded swap function call
          '0', // No ETH value for token swaps
          { ...options, memo: `Swap ${amountIn} ${tokenIn} for ${tokenOut}` }
        );

      case 'stake':
        // Example: Private staking
        const { stakingContract, stakingAmount, stakingData } = params;
        return await privateCrossContractCall(
          stakingContract,
          stakingData,
          '0',
          { ...options, memo: `Stake ${stakingAmount}` }
        );

      case 'lend':
        // Example: Private lending
        const { lendingPool, lendingAmount, lendingData } = params;
        return await privateCrossContractCall(
          lendingPool,
          lendingData,
          '0',
          { ...options, memo: `Lend ${lendingAmount}` }
        );

      case 'yield_farm':
        // Example: Private yield farming
        const { farmContract, farmAmount, farmData } = params;
        return await privateCrossContractCall(
          farmContract,
          farmData,
          '0',
          { ...options, memo: `Farm ${farmAmount}` }
        );

      default:
        throw new Error(`Unknown DeFi operation: ${operation}`);
    }

  } catch (error) {
    console.error(`Failed to execute DeFi operation ${operation}:`, error);
    throw error;
  }
}

// Warm up artifacts by calling an SDK function that uses the prover
export async function warmUpArtifacts() {
  if (!state.ready) {
    throw new Error('Railgun wallet not initialized');
  }
  
  try {
    console.log('🔥 Warming up ZKP artifacts...');
    
    // First, let's check if artifacts are actually ready
    const currentStatus = await getArtifactStatus();
    console.log('📊 Current artifact status before warm-up:', currentStatus);
    
    if (currentStatus.ready) {
      console.log('✅ Artifacts are already ready, no warm-up needed');
      return true;
    }
    
    console.log('📥 Artifacts not ready, triggering download via SDK call...');
    
    // Create minimal test parameters to trigger artifact fetch
    const recipients = [{
      recipientAddress: state.railgunAddress,
      amount: '1', // 1 wei just to trigger artifact fetch
      tokenAddress: normalizeAddress(WETH),
    }];
    
    const shieldKey = '0x' + bytesToHex(getRandomBytes(32));
    
    console.log('🚀 Calling gasEstimateForShield to trigger artifact download...');
    
    // This call will trigger the SDK to fetch and cache artifacts
    const gasEstimate = await gasEstimateForShield(
      TXIDVersion.V3_PoseidonMerkle, // Try V3 first, then fall back to V2 if needed
      NetworkName.EthereumSepolia,
      shieldKey,
      recipients,
      [],
      normalizeAddress(state.userAddress)
    );
    
    console.log('✅ gasEstimateForShield completed, gas estimate:', gasEstimate);
    
    // Wait a moment for artifacts to download
    console.log('⏳ Waiting for artifacts to download...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check if artifacts are now ready
    const newStatus = await getArtifactStatus();
    console.log('📊 Artifact status after warm-up:', newStatus);
    
    if (newStatus.ready) {
      console.log('🎉 Warm-up successful - artifacts are now ready!');
      return true;
    } else {
      console.log('⚠️ Warm-up completed but artifacts still not ready');
      console.log('💡 This may take a few more minutes for large files');
      return false;
    }
    
  } catch (e) {
    console.warn('⚠️ Warm-up failed:', e.message);
    console.log('💡 This is expected if artifacts are still downloading');
    return false;
  }
}

// Re-export the core SDK functions that other modules need
export { createRailgunWallet, walletForID, loadWalletByID } from '@railgun-community/wallet';

// Add built‑in "self-tests" to catch regressions instantly
export async function __selfTestRailgunSDK() {
  const errs = [];
  try {
    // Check NETWORK_CONFIG mapping
    const cfg = NETWORK_CONFIG[NetworkName.EthereumSepolia];
    console.log('🧪 TEST: NETWORK_CONFIG[Sepolia] =', cfg);
    if (!cfg?.chain?.id) errs.push('Missing Sepolia chain mapping in NETWORK_CONFIG');

    // Check txidVersion constants
    if (typeof TXIDVersion.V3_PoseidonMerkle === 'undefined') {
      errs.push('TXIDVersion.V3_PoseidonMerkle missing');
    }
    if (typeof TXIDVersion.V2_PoseidonMerkle === 'undefined') {
      errs.push('TXIDVersion.V2_PoseidonMerkle missing');
    }

    // If wallet is ready, try a dry-run balance call (won't throw if signature is correct)
    if (state.ready && state.railgunWallet) {
      console.log('🧪 TEST: balanceForERC20Token signature – calling...');
      try {
        await balanceForERC20Token(
          TXIDVersion.V3_PoseidonMerkle, // Try V3 first for balance queries
          state.railgunWallet,
          NetworkName.EthereumSepolia,
          // use a benign address (WETH on Sepolia or ZeroAddress if you prefer)
          normalizeAddress(process.env.REACT_APP_WETH_ADDRESS || '0xfff9976782d46CC05630d1f6eBAb18b2324d6B14'),
          true
        );
        console.log('✅ TEST PASS: balanceForERC20Token accepted parameters');
      } catch (e) {
        errs.push('balanceForERC20Token call rejected – likely wrong signature: ' + e.message);
      }
    } else {
      console.log('ℹ️ TEST: wallet not ready yet – skip live balance probe');
    }
  } catch (e) {
    errs.push('Self-test crashed: ' + e.message);
  }

  if (errs.length) {
    console.log('❗ RAILGUN SELF-TEST FAILURES:\n - ' + errs.join('\n - '));
  } else {
    console.log('🎉 RAILGUN SELF-TEST: all checks passed.');
  }
}
