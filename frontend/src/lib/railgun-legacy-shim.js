/**
 * Legacy Railgun Client Shim
 * 
 * This file provides a temporary shim for components still using the old API.
 * It wraps the new Railgun structure to match the old API.
 * 
 * Inspired by the working Railgun-Community/wallet repository pattern.
 */

// Wallet cache (similar to working repo's Map-based cache)
const walletCache = new Map(); // userAddress -> { walletInfo, encryptionKey }

// Engine initialization flag and promise (prevents concurrent initialization)
let engineInitialized = false;
let engineInitializationPromise = null;

/**
 * Fetch wallet credentials from backend API
 * (Following working repo pattern from serve-html.ts)
 */
async function fetchWalletCredentials(userAddress) {
  const RAILGUN_API_BASE = process.env.REACT_APP_RAILGUN_API_URL || 'http://localhost:3001';
  const credUrl = `${RAILGUN_API_BASE}/api/railgun/wallet-credentials/${userAddress}`;
  
  console.log('🔐 Fetching wallet credentials from backend...');
  console.log(`   API: ${credUrl}`);
  
  try {
    // Use fetch with x-railgun-network header (as per working repo)
    const credentialsResponse = await fetch(credUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-railgun-network': 'sepolia', // Required header (from working repo)
      },
    });
    
    if (!credentialsResponse.ok) {
      if (credentialsResponse.status === 404) {
        throw new Error('Wallet not found in backend. The backend will create a wallet when you first access it.');
      }
      const errorText = await credentialsResponse.text();
      throw new Error(`Backend API error: ${credentialsResponse.status} - ${errorText}`);
    }
    
    const credentialsResult = await credentialsResponse.json();
    
    if (!credentialsResult.success || !credentialsResult.data) {
      throw new Error('Wallet credentials not found: ' + (credentialsResult.error || 'Invalid response'));
    }
    
    return credentialsResult.data;
  } catch (error) {
    console.error('❌ Failed to fetch wallet credentials:', error);
    throw new Error(`Cannot fetch wallet credentials. Please ensure the Railgun backend is running at ${RAILGUN_API_BASE}. Error: ${error.message}`);
  }
}

/**
 * Initialize Railgun Engine (following working repo pattern)
 * 
 * CRITICAL: Uses a global promise to prevent concurrent initialization
 * when multiple components call this simultaneously (e.g., React StrictMode)
 */
async function initializeEngine(rpcUrl = null) {
  // If already initialized, return immediately
  if (engineInitialized) {
    return;
  }

  // If initialization is in progress, wait for it to complete
  if (engineInitializationPromise) {
    console.log('⏳ Engine initialization already in progress, waiting...');
    return engineInitializationPromise;
  }

  // Create and store initialization promise
  engineInitializationPromise = (async () => {
    console.log('🚀 Initializing Railgun Engine for browser...');
    
    try {
      const { initRailgunForBrowser, loadProviderBrowser } = await import('./railgun-browser-init');
      const { NetworkName } = await import('@railgun-community/shared-models');
      
      // Initialize engine (this function already has concurrency protection)
      await initRailgunForBrowser({
        walletSource: 'evbatterydapp',
        poiNodeURLs: ['https://ppoi-agg.horsewithsixlegs.xyz'],
        shouldDebug: true,
        verboseScanLogging: false,
      });
      
      console.log('✅ Railgun Engine initialized');
      
      // Load provider (non-blocking - if it fails, connection can still continue)
      let defaultRpcUrl = rpcUrl || process.env.REACT_APP_RPC_URL || 'https://rpc.sepolia.org';
      
      // If the RPC is PublicNode (rate-limited), replace it with rpc.sepolia.org
      if (defaultRpcUrl && defaultRpcUrl.includes('publicnode.com')) {
        console.warn('⚠️ PublicNode RPC detected (rate-limited) - switching to rpc.sepolia.org');
        defaultRpcUrl = 'https://rpc.sepolia.org';
      }
      
      console.log('🔧 Loading provider with RPC:', defaultRpcUrl || 'fallback endpoints');
      
      try {
        await loadProviderBrowser(NetworkName.EthereumSepolia, defaultRpcUrl);
        console.log('✅ Provider loaded');
      } catch (providerError) {
        console.warn('⚠️ Provider loading failed (non-critical):', providerError.message);
        console.warn('⚠️ Connection will continue, but balance scanning may be delayed');
        // Don't throw - allow connection to proceed without provider for now
      }
      
      engineInitialized = true;
    } catch (initError) {
      console.error('❌ Failed to initialize Railgun Engine:', initError);
      // If engine is already initialized, that's fine
      if (!initError.message.includes('already') && !initError.message.includes('Railgun core modules')) {
        // Clear promise on error so it can be retried
        engineInitializationPromise = null;
        throw initError;
      }
      engineInitialized = true; // Mark as initialized even if it was already initialized
    }
  })();

  return engineInitializationPromise;
}

/**
 * Load wallet from credentials (following working repo pattern from serve-html.ts)
 */
async function loadWalletFromCredentials(userAddress, mnemonic, encryptionKey, rpcUrl = null) {
  // Check cache first (following working repo pattern)
  if (walletCache.has(userAddress)) {
    console.log('✅ Using cached wallet for:', userAddress);
    return walletCache.get(userAddress);
  }

  // Ensure engine is initialized (critical - working repo does this first)
  // Pass rpcUrl if provided
  await initializeEngine(rpcUrl);

  // Normalize encryption key format (following working repo pattern)
  // Remove 0x prefix if present, ensure it's 64 hex chars
  let cleanEncKey = encryptionKey.startsWith('0x') ? encryptionKey.slice(2) : encryptionKey;
  if (cleanEncKey.length !== 64) {
    throw new Error(`Invalid encryptionKey format: must be 64 hex chars, got ${cleanEncKey.length}`);
  }

  // Import createRailgunWallet
  const { createRailgunWallet } = await import('./railgun/wallets/wallets.js');

  // Create wallet using credentials from backend
  console.log('🆕 Creating Railgun wallet from backend credentials...');
  const walletInfo = await createRailgunWallet(
    cleanEncKey,
    mnemonic,
    undefined, // creationBlockNumbers - will use current block
    0 // railgunWalletDerivationIndex
  );

  console.log('✅ Railgun wallet created:', walletInfo.id);
  console.log('   Railgun Address:', walletInfo.railgunAddress);

  // Cache wallet (following working repo pattern)
  const cached = { walletInfo, encryptionKey: cleanEncKey };
  walletCache.set(userAddress, cached);

  return cached;
}

/**
 * Connect to Railgun (main entry point)
 */
export const connectRailgun = async (options = {}) => {
  // Extract options
  const { userAddress, backendBaseURL, rpcUrl } = options;
  
  if (!userAddress) {
    throw new Error('userAddress is required for connectRailgun');
  }

  try {
    console.log('🔐 Connecting to Railgun for user:', userAddress);
    
    // Step 1: Fetch credentials from backend (following working repo pattern)
    const { mnemonic, encryptionKey } = await fetchWalletCredentials(userAddress);
    
    // Step 2: Load wallet from credentials (this will initialize engine if needed)
    // Pass rpcUrl to initializeEngine if provided
    const { walletInfo } = await loadWalletFromCredentials(userAddress, mnemonic, encryptionKey, rpcUrl);
    
    // Store only minimal info in localStorage (NO sensitive data like encryption key or mnemonic)
    // These stay in the backend for security
    const walletData = {
      walletID: walletInfo.id,
      railgunAddress: walletInfo.railgunAddress,
      userAddress: userAddress,
      rpcUrl: rpcUrl || null, // Store RPC URL for later use
      // ⚠️ DO NOT store encryptionKey or mnemonic here - they're in the backend
      timestamp: Date.now(),
    };
    localStorage.setItem(`railgun.wallet.${userAddress.toLowerCase()}`, JSON.stringify(walletData));
    console.log('💾 Wallet reference stored in localStorage (credentials remain in backend)');
    
    // Also store in legacy format for backwards compatibility
    const connectionData = {
      walletID: walletInfo.id,
      railgunAddress: walletInfo.railgunAddress,
      userAddress: userAddress,
      rpcUrl: rpcUrl || null, // Store RPC URL for later use
      timestamp: Date.now(),
    };
    localStorage.setItem('railgun.wallet', JSON.stringify(connectionData));
    
    return {
      success: true,
      walletID: walletInfo.id,
      railgunAddress: walletInfo.railgunAddress,
      userAddress: userAddress,
    };
    
  } catch (error) {
    console.error('❌ Railgun connection failed:', error);
    throw error;
  }
};

export const disconnectRailgun = async (...args) => {
  // Clear localStorage connection
  try {
    localStorage.removeItem('railgun.wallet');
    console.log('🔌 Railgun connection cleared from localStorage');
    return { success: true };
  } catch (error) {
    console.warn('⚠️ Error disconnecting Railgun:', error);
    return { success: false };
  }
};

export const restoreRailgunConnection = async (userAddress) => {
  // Try to restore connection from localStorage AND load wallet into SDK
  try {
    const stored = JSON.parse(localStorage.getItem('railgun.wallet') || 'null');
    if (stored && stored.walletID && stored.railgunAddress && stored.userAddress) {
      // Check if the stored connection belongs to the requested user
      if (userAddress && stored.userAddress.toLowerCase() !== userAddress.toLowerCase()) {
        console.log('🔍 Stored Railgun connection belongs to different user');
        return { success: false, connected: false };
      }
      
      console.log('🔍 Found stored Railgun connection:', {
        walletID: stored.walletID,
        railgunAddress: stored.railgunAddress,
        userAddress: stored.userAddress,
      });
      
      // CRITICAL: Actually restore the wallet in the SDK (not just read from localStorage)
      // Load wallet from backend credentials to ensure it's loaded in the SDK
      try {
        // Fetch credentials from backend (same user, so we can restore)
        const { mnemonic, encryptionKey } = await fetchWalletCredentials(userAddress);
        
        // Load wallet from credentials (will initialize engine if needed)
        // This ensures the wallet is actually loaded in the SDK, not just stored in localStorage
        const { walletInfo } = await loadWalletFromCredentials(userAddress, mnemonic, encryptionKey, stored.rpcUrl || null);
        
        // Verify the wallet ID matches (if it changed, update localStorage)
        if (walletInfo.id !== stored.walletID) {
          console.warn('⚠️ Wallet ID changed - updating localStorage');
          const updatedData = {
            ...stored,
            walletID: walletInfo.id,
            railgunAddress: walletInfo.railgunAddress,
            timestamp: Date.now(),
          };
          localStorage.setItem('railgun.wallet', JSON.stringify(updatedData));
        }
        
        console.log('✅ Wallet restored and loaded in SDK');
      } catch (restoreError) {
        console.warn('⚠️ Failed to restore wallet in SDK (non-critical):', restoreError.message);
        // Continue anyway - wallet info is in localStorage, SDK might load it later
        // Don't fail the restore if SDK initialization fails
      }
      
      // Return connection info in the format expected by components
      return {
        success: true,
        connected: true,
        walletID: stored.walletID,
        railgunAddress: stored.railgunAddress,
        userAddress: stored.userAddress,
      };
    }
    console.log('🔍 No stored Railgun connection found');
    return { success: false, connected: false };
  } catch (error) {
    console.warn('⚠️ Error restoring Railgun connection:', error);
    return { success: false, connected: false };
  }
};

export const setSignerAndProvider = async (...args) => {
  console.warn('setSignerAndProvider is deprecated. Signer/provider are now managed by the new structure.');
};

export const setRailgunIdentity = async (...args) => {
  console.warn('setRailgunIdentity is deprecated. Identity is now managed by the new structure.');
};

export const createRailgunWallet = async (...args) => {
  throw new Error(
    'Legacy Railgun API not yet implemented. ' +
    'Please use the new structure: import { createRailgunWallet } from "./lib/railgun/wallets"'
  );
};

export const refreshBalances = async (forceRefresh = false, timeoutMs = 2000) => {
  try {
    // Legacy API signature: refreshBalances(forceRefresh, timeoutMs)
    // New API signature: refreshBalances(chain, walletIdFilter)
    
    // CRITICAL: Ensure engine is initialized before refreshing balances
    // This prevents "RAILGUN Engine not yet initialized" errors
    if (!engineInitialized) {
      console.log('⚠️ Engine not initialized yet - initializing now...');
      try {
        // Get stored wallet to determine RPC URL
        const stored = JSON.parse(localStorage.getItem('railgun.wallet') || 'null');
        const rpcUrl = stored?.rpcUrl || process.env.REACT_APP_RPC_URL || null;
        await initializeEngine(rpcUrl);
      } catch (initError) {
        console.warn('⚠️ Failed to initialize engine during balance refresh:', initError.message);
        // Continue anyway - might already be initialized
      }
    }
    
    const { refreshBalances: refreshBalancesNew } = await import('./railgun/wallets/balances.js');
    const { awaitWalletScan } = await import('./railgun/wallets/wallets.js');
    const { getEngine } = await import('./railgun/core/engine.js');
    const { TXIDVersion, NetworkName } = await import('@railgun-community/shared-models');
    
    // Get stored wallet info
    const stored = JSON.parse(localStorage.getItem('railgun.wallet') || 'null');
    if (!stored || !stored.walletID) {
      throw new Error('No Railgun wallet connected. Please connect first.');
    }
    
    // Get network chain from NETWORK_CONFIG
    const { NETWORK_CONFIG } = await import('@railgun-community/shared-models');
    const network = NETWORK_CONFIG[NetworkName.EthereumSepolia];
    if (!network || !network.chain) {
      throw new Error('Network configuration not found for EthereumSepolia');
    }
    const chain = network.chain;
    
    // CRITICAL: Check if UTXO merkletree is empty (following serve-html.ts pattern)
    // If merkletree is empty, we need to scan first
    // If merkletree has data, balances might already be decrypted (but wallet still needs to scan)
    if (!forceRefresh) {
      try {
        const engine = getEngine();
        const shields = await engine.getAllShieldCommitments(
          TXIDVersion.V2_PoseidonMerkle,
          chain,
          0,
        );
        if (shields.length > 0) {
          console.log(`📊 UTXO merkletree already has ${shields.length} commitments`);
          console.log(`📊 Wallet may still need to decrypt its balances`);
        } else {
          console.log(`📊 UTXO merkletree is empty - will start scan...`);
        }
      } catch (err) {
        console.warn(`⚠️ Could not check UTXO merkletree status - proceeding with scan...`);
      }
    }
    
    // Refresh balances for the connected wallet (this triggers UTXO/TXID scan)
    const walletIdFilter = forceRefresh ? [stored.walletID] : undefined;
    
    console.log('🔄 Refreshing Railgun balances...', { chain, walletIdFilter });
    await refreshBalancesNew(chain, walletIdFilter);
    console.log('✅ refreshBalances() call completed - scan continues in background');
    
    // CRITICAL: Wait for wallet scan to complete (following serve-html.ts pattern line 4054-4059)
    // This ensures UTXO merkletree is synced and wallet has decrypted its balances
    console.log('⏳ Waiting for wallet scan to complete...');
    try {
      await Promise.race([
        awaitWalletScan(stored.walletID, chain),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Scan timeout')), 120000)) // 2 min timeout
      ]);
      console.log('✅ Wallet scan completed - balances should now be available');
    } catch (scanWaitError) {
      console.warn('⚠️ Scan wait timeout or error - continuing anyway...', scanWaitError.message);
      // Continue - scan might still be in progress, balances might still update
    }
    
    return { success: true };
  } catch (error) {
    console.error('❌ Failed to refresh balances:', error);
    throw error;
  }
};

export const getAllBalances = async (...args) => {
  try {
    // CRITICAL: Ensure engine is initialized before getting balances
    // This prevents "RAILGUN Engine not yet initialized" errors
    if (!engineInitialized) {
      console.log('⚠️ Engine not initialized yet - initializing now...');
      try {
        // Get stored wallet to determine RPC URL
        const stored = JSON.parse(localStorage.getItem('railgun.wallet') || 'null');
        const rpcUrl = stored?.rpcUrl || process.env.REACT_APP_RPC_URL || null;
        await initializeEngine(rpcUrl);
      } catch (initError) {
        console.warn('⚠️ Failed to initialize engine during balance check:', initError.message);
        // Continue anyway - might already be initialized
      }
    }
    
    // CRITICAL: Use fullWalletForID instead of walletForID (matches serve-html.ts pattern)
    // fullWalletForID ensures we get a RailgunWallet (full wallet) with all balance methods
    // walletForID might return AbstractWallet which may not have all methods
    const { fullWalletForID } = await import('./railgun/wallets/wallets.js');
    const { balanceForERC20Token } = await import('./railgun/wallets/balance-update.js');
    const { TXIDVersion, NetworkName, NETWORK_CONFIG } = await import('@railgun-community/shared-models');
    const { ethers } = await import('ethers');
    
    // Get stored wallet info
    const stored = JSON.parse(localStorage.getItem('railgun.wallet') || 'null');
    
    // Get EOA balances (from MetaMask)
    let eoaBalances = { eth: '0.0', weth: '0.0' };
    try {
      if (window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        
        // Get ETH balance
        const ethBalance = await provider.getBalance(address);
        eoaBalances.eth = ethers.formatEther(ethBalance);
        
        // Get WETH balance (Sepolia WETH)
        // Use the address from railgun-bootstrap (matches NETWORK_CONFIG)
        const sepoliaConfig = NETWORK_CONFIG[NetworkName.EthereumSepolia];
        const WETH_ADDRESS = sepoliaConfig?.baseToken?.wrappedAddress || '0xfff9976782d46cc05630d1f6ebab18b2324d6b14';
        const wethABI = ['function balanceOf(address) view returns (uint256)'];
        const wethContract = new ethers.Contract(WETH_ADDRESS, wethABI, provider);
        const wethBalance = await wethContract.balanceOf(address);
        eoaBalances.weth = ethers.formatEther(wethBalance);
      }
    } catch (eoaError) {
      console.warn('⚠️ Failed to get EOA balances:', eoaError);
    }
    
    // Get Railgun balances (following serve-html.ts pattern)
    let railgunBalances = { weth: 0n, pendingWeth: 0n };
    if (stored && stored.walletID) {
      try {
        // CRITICAL: Use fullWalletForID (matches serve-html.ts)
        // This ensures we get a RailgunWallet (full wallet) not just AbstractWallet
        const wallet = fullWalletForID(stored.walletID);
        const sepoliaConfig = NETWORK_CONFIG[NetworkName.EthereumSepolia];
        const WETH_ADDRESS = sepoliaConfig?.baseToken?.wrappedAddress || '0xfff9976782d46cc05630d1f6ebab18b2324d6b14';
        
        // CRITICAL: Check UTXO merkletree state before getting balances (matches serve-html.ts pattern)
        // If merkletree is empty, balances will be 0 even if wallet has funds
        try {
          const { getEngine } = await import('./railgun/core/engine.js');
          const engine = getEngine();
          const shields = await engine.getAllShieldCommitments(
            TXIDVersion.V2_PoseidonMerkle,
            sepoliaConfig.chain,
            0,
          );
          
          if (shields.length === 0) {
            console.warn('⚠️ UTXO merkletree is empty - balances will be 0 until scan completes');
            console.warn('⚠️ Call refreshBalances() first to sync the merkletree');
          } else {
            console.log(`📊 UTXO merkletree has ${shields.length} commitments - checking balances...`);
          }
        } catch (merkletreeCheckError) {
          console.warn('⚠️ Could not check UTXO merkletree state:', merkletreeCheckError.message);
        }
        
        // Get spendable WETH balance (onlySpendable=true, matches serve-html.ts)
        const spendableBalance = await balanceForERC20Token(
          TXIDVersion.V2_PoseidonMerkle,
          wallet,
          NetworkName.EthereumSepolia,
          WETH_ADDRESS,
          true // onlySpendable - matches serve-html.ts pattern
        );
        railgunBalances.weth = spendableBalance;
        
        // Get total balance (all balances, including pending) - matches serve-html.ts pattern
        const totalBalance = await balanceForERC20Token(
          TXIDVersion.V2_PoseidonMerkle,
          wallet,
          NetworkName.EthereumSepolia,
          WETH_ADDRESS,
          false // all balances (not just spendable)
        );
        // Pending = total - spendable
        railgunBalances.pendingWeth = totalBalance > spendableBalance ? totalBalance - spendableBalance : 0n;
        
        console.log('💰 Balance retrieved:', {
          spendable: spendableBalance.toString(),
          total: totalBalance.toString(),
          pending: railgunBalances.pendingWeth.toString(),
        });
        
        // Warn if balances are 0 but merkletree has commitments (wallet might need to decrypt)
        if (spendableBalance === 0n && totalBalance === 0n) {
          try {
            const { getEngine } = await import('./railgun/core/engine.js');
            const engine = getEngine();
            const shields = await engine.getAllShieldCommitments(
              TXIDVersion.V2_PoseidonMerkle,
              sepoliaConfig.chain,
              0,
            );
            if (shields.length > 0) {
              console.warn('⚠️ Balances are 0 but UTXO merkletree has commitments');
              console.warn('⚠️ Wallet may need to decrypt its UTXOs - call refreshBalances() to trigger wallet scan');
            }
          } catch (checkError) {
            // Ignore - already checked above
          }
        }
      } catch (railgunError) {
        console.warn('⚠️ Failed to get Railgun balances:', railgunError);
        // Return zero balances if wallet not loaded yet
        railgunBalances = { weth: 0n, pendingWeth: 0n };
      }
    }
    
    return {
      success: true,
      data: {
        eoa: eoaBalances,
        railgun: railgunBalances,
      },
    };
  } catch (error) {
    console.error('❌ Failed to get all balances:', error);
    return {
      success: false,
      error: error.message,
      data: {
        eoa: { eth: '0.0', weth: '0.0' },
        railgun: { weth: 0n, pendingWeth: 0n },
      },
    };
  }
};

export const privateTransfer = async (...args) => {
  throw new Error(
    'Legacy Railgun API not yet implemented. ' +
    'Please use the new structure: import { populateProvedTransfer } from "./lib/railgun/transactions"'
  );
};

export const getRailgunAddressFromCredentials = async (...args) => {
  throw new Error(
    'Legacy Railgun API not yet implemented. ' +
    'Please use the new structure: import { getRailgunAddress } from "./lib/railgun/wallets"'
  );
};

export const isRailgunConnectedForEOA = async (...args) => {
  return { connected: false, message: 'Legacy API not yet implemented. Please use new structure.' };
};

export const getIsConnecting = () => {
  return false;
};

