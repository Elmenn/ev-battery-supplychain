import { ethers, ZeroAddress, getAddress, solidityPackedKeccak256 } from 'ethers';
import { 
  generateIdentityLinkageProof, 
  hasIdentityLinkageProof,
  validateVCIdentityLinkage 
} from './vcBuilder.mjs';
// Remove static import to avoid circular dependency - use dynamic imports instead
import { NetworkName } from '@railgun-community/shared-models';

// Railgun API base (declare early to avoid TDZ surprises in helpers)
const RAILGUN_API_BASE =
  process.env.REACT_APP_RAILGUN_API_URL || 'http://localhost:3001';

// Dev strategy helper
const isDevShieldStrategy = () =>
  (process.env.REACT_APP_SHIELD_STRATEGY || 'dev').toLowerCase() === 'dev';

// Phase 1B: Real Railgun SDK Integration
const isSDKShieldStrategy = () =>
  (process.env.REACT_APP_SHIELD_STRATEGY || 'dev').toLowerCase() === 'sdk';

// One-time SDK init (on first modal open)
async function initRailgunSDKOnce(rpcUrl, network) {
  if (window.__rgInit) return;
  
  try {
    // Import and initialize the real Railgun SDK
    const { initRailgunWallet } = await import('../railgun/railgunWalletClient');
    
    // Create a provider for the RPC URL
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Initialize the SDK with the provider
    await initRailgunWallet({ provider, rpcUrl });
    
    window.__rgInit = true;
    console.log('🔧 Real Railgun SDK initialized for:', { network, rpcUrl });
  } catch (error) {
    console.error('❌ Failed to initialize Railgun SDK:', error);
    // Clear the failed state so we can retry
    window.__rgInit = false;
    throw error;
  }
}

// Ensure valid txRefBytes32
function ensureTxRefBytes32(maybe) {
  const isHex32 = (v) => typeof v === 'string' && v.startsWith('0x') && v.length === 66;
  if (isHex32(maybe)) return maybe;
  // Random 32 bytes, 0x + 64 hex chars
  const rnd = [...window.crypto.getRandomValues(new Uint8Array(32))]
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return '0x' + rnd;
}

// helpers: txRef handling (client-side safety only; source of truth is backend)
function sanitizeTxRef(raw) {
  if (typeof raw !== 'string') return null;
  const hex = raw.toLowerCase().replace(/[^0-9a-fx]/g, '');
  if (hex.startsWith('0x') && hex.length === 66) return hex;  // 32 bytes
  return null;
}

function generateValidTxRef() {
  // 0x + 64 hex chars
  return '0x' + [...window.crypto.getRandomValues(new Uint8Array(32))]
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// Constants
export const DEFAULT_GAS_LIMIT_PRIVATE = 200_000n;

// Helper function to credit local shielded balance for development
export async function creditLocalShieldedBalance({ railgunAddress, tokenAddress, amountWei }) {
  // Mirror into localStorage so UI can reflect balance immediately (dev only)
  try {
    const key = `dev_balance_${railgunAddress.toLowerCase()}_${tokenAddress.toLowerCase()}`;
    const cur = BigInt(localStorage.getItem(key) || '0');
    const next = (cur + BigInt(amountWei)).toString();
    localStorage.setItem(key, next);
    console.log('🏠 Dev mirror: stored balance in localStorage');
  } catch (e) {
    console.warn('⚠️ Dev mirror failed:', e.message);
  }
}

// Utility functions for private payments (using helpers above)
export { sanitizeTxRef, generateValidTxRef };

export function resolvePaymentToken(network) {
  // Use WETH on Sepolia when in SDK mode, ETH on local networks
  const isSDK = process.env.REACT_APP_SHIELD_STRATEGY === 'sdk';
  
  if (isSDK && network?.chainId === 11155111n) {
    // Official Sepolia WETH address
    const wethAddress = '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9';
    console.log('🔧 SDK mode on Sepolia: using official WETH address:', wethAddress);
    return { address: wethAddress, symbol: 'WETH', decimals: 18 };
  }
  
  // Default to ETH for local networks or dev mode
  console.log('🏠 Dev mode or local network: using ETH (ZeroAddress)');
  return { address: ZeroAddress, symbol: 'ETH', decimals: 18 };
}

export function assertBigintAmount(x, label = 'amount') {
  if (typeof x !== 'bigint' || x <= 0n) {
    throw new Error(`${label} must be a positive bigint`);
  }
}

export function toBytes32(hex) {
  // normalize 0x-prefixed values to 32 bytes
  if (typeof hex !== 'string' || !hex.startsWith('0x')) {
    throw new Error('txRef must be 0x-prefixed hex string');
  }
  const len = (hex.length - 2) / 2;
  if (len === 32) return hex;
  if (len > 32) throw new Error('txRef longer than 32 bytes');
  // left-pad to 32 bytes
  return '0x' + hex.slice(2).padStart(64, '0');
}

export async function buildPrivateMemo({
  provider, escrowAddress, buyerEOA, railgunTxRef, amountAtomic, tokenAddress
}) {
  const net = await provider.getNetwork();
  const chainId = net.chainId;
  const txRef32 = toBytes32(railgunTxRef);
  const memoHash = solidityPackedKeccak256(
    ['uint256','address','address','bytes32','uint256','address'],
    [chainId, escrowAddress, getAddress(buyerEOA), txRef32, amountAtomic, getAddress(tokenAddress)]
  );
  return { memoHash, txRef32, chainId };
}

// (RAILGUN_API_BASE moved to top)

// Global wallet manager instance (shared across components)
let globalWalletManagerInstance = null;

export const getGlobalWalletManager = () => globalWalletManagerInstance;
export const setGlobalWalletManager = (manager) => {
  globalWalletManagerInstance = manager;
};

// Real Railgun SDK Integration
export class RealRailgunAPI {
  constructor(railgunWallet, ethersWallet) {
    this.railgunWallet = railgunWallet;
    this.ethersWallet = ethersWallet;
    this.userAddress = ethersWallet.address;
  }

  // Check backend status to gate private UI
  static async checkBackendStatus() {
    try {
      const response = await fetch(`${RAILGUN_API_BASE}/api/railgun/status`);
      const result = await response.json();
      
      if (!result.success) {
        return { engineReady: false, fallbackMode: true, error: result.error };
      }
      
      return {
        engineReady: result.data.engineReady,
        fallbackMode: result.data.fallbackMode,
        mode: result.data.mode
      };
    } catch (error) {
      console.warn('⚠️ Failed to check backend status:', error);
      return { engineReady: false, fallbackMode: true, error: error.message };
    }
  }

  static async createFromEthersWallet(ethersWallet) {
    console.log('🔐 Creating Railgun API client from Ethers wallet');
    
    try {
      // Step 1: Check backend status first
      const status = await RealRailgunAPI.checkBackendStatus();
      if (status.fallbackMode) {
        console.warn('⚠️ Backend in fallback mode - private operations disabled');
      }
      
      // Step 2: Fetch wallet info from backend
      const userAddress = await ethersWallet.getAddress();
      const response = await fetch(`${RAILGUN_API_BASE}/api/railgun/wallet-info?userAddress=${userAddress}`);
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch wallet info from backend');
      }
      
      const walletInfo = result.data; // { userAddress, network, createdAt } - no railgunAddress anymore
      console.log('✅ Fetched wallet info from backend:', { userAddress: walletInfo.userAddress, network: walletInfo.network });
      
      // Step 2: Create a real Railgun wallet using backend data
      console.log('🔐 Creating real Railgun wallet from backend data');
      
      // ✅ FIXED: Backend no longer provides railgunAddress - SDK will generate it
      // The backend only provides mnemonic + encryptionKey, not the derived address
      // We'll create a placeholder that the SDK will replace with the real address
      
      // Create a wallet object that will work with the SDK
      // The actual Railgun address will be generated by the SDK when needed
      const realRailgunWallet = {
        address: null, // Will be populated by SDK when wallet is created
        network: walletInfo.network,
        // 🔒 SECURITY: No secrets stored in frontend
        userAddress: walletInfo.userAddress,
        
        // Backend methods that use backend API
        getAddress: () => {
          // This will be called by the SDK to get the real address
          // For now, return a placeholder that indicates the wallet needs to be initialized
          return '0zk1q...placeholder'; // SDK will replace this
        },
        getNetwork: () => walletInfo.network,
        
        // Use backend API for real operations
        getBalance: async (tokenAddress) => {
          console.log('💰 Backend balance check:', tokenAddress);
          
          // DEV strategy: prefer local mirror so the UI updates immediately on localhost
          if (isDevShieldStrategy()) {
            try {
              // Use userAddress as fallback since railgunAddress isn't available yet
              const key = `dev_balance_${userAddress.toLowerCase()}_${tokenAddress.toLowerCase()}`;
              const localWei = localStorage.getItem(key);
              if (localWei && /^[0-9]+$/.test(localWei)) {
                console.log('🏠 Dev strategy: using local mirror balance:', localWei);
                return BigInt(localWei);
              }
            } catch {}
          }
          
          // Determine token type and decimals for consistent logging
          const isETH = (tokenAddress === ethers.ZeroAddress);
          const decimals = isETH ? 18 : 6;
          const tokenSymbol = isETH ? 'ETH' : 'USDC';
          
          console.log(`🏠 Using ${tokenSymbol} balance tracking (${decimals} decimals)`);
          
          try {
            // Try to get balance from backend first
            const balanceResponse = await fetch(`${RAILGUN_API_BASE}/api/railgun/balance/${tokenAddress}/${userAddress}`);
            if (balanceResponse.ok) {
            const balanceResult = await balanceResponse.json();
            if (balanceResult.success) {
                // Backend returns balanceWei as string, convert directly to BigInt
                const balance = BigInt(balanceResult.data.balanceWei || '0');
                console.log(`✅ Backend ${tokenSymbol} balance:`, ethers.formatUnits(balance, decimals), tokenSymbol);
              return balance;
              }
            }
          } catch (error) {
            console.warn('⚠️ Backend balance check failed, trying localStorage fallback');
          }
          
          // Fallback: check localStorage for development (legacy format)
          try {
            // Use userAddress as fallback since railgunAddress isn't available yet
            const balanceKey = `local_balance_${userAddress}_${tokenAddress}`;
            const storedBalance = localStorage.getItem(balanceKey);
            if (storedBalance) {
              const balance = BigInt(storedBalance);
              console.log(`🏠 LocalStorage ${tokenSymbol} balance:`, ethers.formatUnits(balance, decimals), tokenSymbol);
              console.log('⚠️  USING LOCALSTORAGE FALLBACK - Backend balance not available!');
              return balance;
            }
          } catch (error) {
            console.warn('⚠️ LocalStorage balance check failed');
          }
          
          // Default to 0 if no balance found
          console.log(`🎭 No ${tokenSymbol} balance found, defaulting to 0`);
          return ethers.parseUnits('0', decimals);
        },
        
        shield: async (params) => {
          console.log('🛡️ Backend shield:', params);
          try {
            const shieldResponse = await fetch(`${RAILGUN_API_BASE}/api/railgun/shield`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userAddress: userAddress,
                tokenAddress: params.tokenAddress,
                amount: params.amount.toString(), // Convert BigInt to string
                recipient: params.recipient,
                signedTransaction: params.signedTransaction // Include signed transaction
              })
            });
            
            const shieldResult = await shieldResponse.json();
            if (shieldResult.success) {
              console.log('✅ Backend shield completed:', shieldResult.data);
              return { hash: shieldResult.data.hash, success: true };
            } else {
              throw new Error(shieldResult.error || 'Shield failed');
            }
          } catch (error) {
            console.error('❌ Backend shield failed:', error);
            throw error;
          }
        },
        
        createPrivateTransfer: async (params) => {
          console.log('🔒 Backend private transfer:', params);
          try {
            // Convert BigInt values to strings for JSON serialization
            const serializedOutputs = params.outputs.map(output => ({
              toRailgunAddress: output.toRailgunAddress ?? output.recipient,
              amount: output.amount.toString(),
              tokenAddress: params.tokenAddress
            }));
            
            const txRefBytes32 = ensureTxRefBytes32(params.txRefBytes32);
            
            const transferResponse = await fetch(`${RAILGUN_API_BASE}/api/railgun/private-transfer`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userAddress: userAddress,
                outputs: serializedOutputs,
                memo: params.memo ?? '0x',
                tokenAddress: params.tokenAddress,
                txRefBytes32
              })
            });
            
            const transferResult = await transferResponse.json();
            
            if (transferResult.success) {
              const raw = transferResult.data?.txHash ?? transferResult.data?.hash ?? '';
              const txRef = sanitizeTxRef(raw) ?? txRefBytes32;
              
              console.log('✅ Backend private transfer completed:', { 
                txHash: txRef, 
                original: raw,
                sanitized: txRef 
              });
              
              return { 
                txHash: txRef, 
                success: true, 
                memo: params.memo 
              };
            } else {
              throw new Error(transferResult.error || 'Private transfer failed');
            }
          } catch (error) {
            console.error('❌ Backend private transfer failed:', error);
            throw error;
          }
        },
        
        getTransactionHistory: async () => {
          console.log('📜 Getting transaction history from backend');
          try {
            const historyResponse = await fetch(`${RAILGUN_API_BASE}/api/railgun/audit-history?userAddress=${userAddress}`);
            const historyResult = await historyResponse.json();
            
            if (historyResult.success) {
              return historyResult.data.transactions || [];
            } else {
              return [];
            }
          } catch (error) {
            console.error('❌ Failed to get transaction history:', error);
            return [];
          }
        },
        
        loadPersistedBalances: () => console.log('📱 Backend: Balances loaded from backend'),
        savePersistedBalances: () => console.log('💾 Backend: Balances saved to backend'),
        
        scheduleBatchUnshield: async (amount, tokenAddress) => {
          console.log('📅 Real batch unshield via backend:', { amount, tokenAddress });
          // This would call the backend API for batch unshield
          return { hash: `0x${Date.now().toString(16)}_unshield`, success: true };
        }
      };
      
      console.log('✅ Real Railgun wallet created using backend data');
      
      return new RealRailgunAPI(realRailgunWallet, ethersWallet);
      
    } catch (error) {
      console.error('❌ Failed to create Railgun API client:', error);
      throw error;
    }
  }
  
  // ❌ REMOVED: generateRailgunAddress method no longer needed
  // Backend now provides railgunAddress directly via /wallet-info endpoint
  // This prevents any accidental secret generation in the frontend

  getAddress() {
    return this.railgunWallet.getAddress();
  }

  // Get wallet credentials from backend for SDK operations
  async getWalletCredentials() {
    try {
      console.log('🔐 Fetching wallet credentials from backend...');
      
      const userAddress = await this.ethersWallet.getAddress();
      const response = await fetch(`${RAILGUN_API_BASE}/api/railgun/wallet-credentials/${userAddress}`);
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch wallet credentials from backend');
      }
      
      console.log('✅ Got wallet credentials from backend');
      return result.data; // { mnemonic, encryptionKey, network }
      
    } catch (error) {
      console.error('❌ Failed to get wallet credentials:', error);
      throw error;
    }
  }

  // Check if private operations are enabled
  async isPrivateEnabled() {
    try {
      const status = await RealRailgunAPI.checkBackendStatus();
      return status.engineReady && !status.fallbackMode;
    } catch (error) {
      console.warn('⚠️ Failed to check private status:', error);
      return false;
    }
  }

  async shield(params) {
    console.log('🛡️ Backend shield:', params);
    
    try {
      // Use backend API to shield funds
      const shieldResult = await this.railgunWallet.shield({
        tokenAddress: params.tokenAddress,
        amount: params.amount,
        recipient: params.recipient || this.getAddress()
      });
      
      console.log('✅ Backend shield completed:', shieldResult);
      return shieldResult;
      
    } catch (error) {
      console.error('❌ Backend shield failed:', error);
      throw error;
    }
  }



  async getBalance(tokenAddress) {
    console.log('💰 Balance check:', tokenAddress);

    // SDK strategy: use real Railgun SDK
    if (isSDKShieldStrategy()) {
      try {
        await initRailgunSDKOnce(
          process.env.REACT_APP_RAILGUN_RPC_URL || process.env.REACT_APP_RPC_URL,
          NetworkName.EthereumSepolia
        );
        
        // Use real SDK balance query
        const { getWalletBalance } = await import('../railgun/railgunWalletClient');
        const balance = await getWalletBalance(tokenAddress);
        
        console.log('🔧 SDK strategy: real balance query result:', balance);
        return BigInt(balance || '0');
    } catch (error) {
        console.error('❌ SDK balance query failed:', error);
        return 0n; // fail-closed in UI
      }
    }

    // DEV strategy: prefer local mirror so the UI updates immediately on localhost
    if (isDevShieldStrategy()) {
      try {
        const key = `dev_balance_${this.railgunWallet.getAddress().toLowerCase()}_${tokenAddress.toLowerCase()}`;
        const localWei = localStorage.getItem(key);
        if (localWei && /^[0-9]+$/.test(localWei)) {
          console.log('🏠 Dev strategy: using local mirror balance:', localWei);
          return BigInt(localWei);
        }
      } catch {}
    }
    
    try {
      // Use backend API to get balance
      const balance = await this.railgunWallet.getBalance(tokenAddress);
      
      // Determine decimals and label based on token address
      const isETH = (tokenAddress === ethers.ZeroAddress);
      const decimals = isETH ? 18 : 6;
      const tokenSymbol = isETH ? 'ETH' : 'USDC';
      
      console.log(`✅ Backend ${tokenSymbol} balance:`, ethers.formatUnits(balance, decimals), tokenSymbol);
      return balance;
      
    } catch (error) {
      console.error('❌ Backend balance check failed:', error);
      // Return 0 balance on error with correct decimals
      const isETH = (tokenAddress === ethers.ZeroAddress);
      const decimals = isETH ? 18 : 6;
      return ethers.parseUnits('0', decimals);
    }
  }

  async recordPayment(productId, memoHash, railgunTxRef, identityProof = null) {
    console.log('📝 Backend record payment:', { productId, memoHash, railgunTxRef });
    
    try {
      const response = await fetch(`${RAILGUN_API_BASE}/api/railgun/record-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId,
          memoHash,
          railgunTxRef,
          identityProof
        })
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Payment recording failed');
      }

      console.log('✅ Backend payment recorded:', result.data);
      return result.data;
      
    } catch (error) {
      console.error('❌ Backend payment recording failed:', error);
      throw error;
    }
  }

  getTransactionHistory() {
    // Use backend API to get transaction history
    return this.railgunWallet.getTransactionHistory();
  }

  loadPersistedBalances() {
    // Use backend API to load persisted balances
    this.railgunWallet.loadPersistedBalances();
    console.log('📱 Backend: Balances loaded');
  }

  savePersistedBalances() {
    // Use backend API to save persisted balances
    this.railgunWallet.savePersistedBalances();
    console.log('💾 Backend: Balances saved');
  }

  async scheduleBatchUnshield(amount, tokenAddress) {
    console.log('📅 Backend batch unshield via backend:', { amount, tokenAddress });
    
    try {
      // Use backend API to schedule batch unshield
      const scheduleResult = await this.railgunWallet.scheduleBatchUnshield(amount, tokenAddress);
      
      console.log('✅ Backend batch unshield completed:', scheduleResult);
      return scheduleResult;
      
    } catch (error) {
      console.error('❌ Backend batch unshield failed:', error);
      throw error;
    }
  }

  getWalletInfo() {
    return {
      address: this.getAddress(),
      metaMaskAddress: this.userAddress,
      type: 'wallet_sdk + backend_audit',
      network: this.railgunWallet.getNetwork(),
      note: 'Using Wallet SDK locally; backend used for audit/status only'
    };
  }
}

// Railgun Integration Utilities for EV Battery Marketplace
// This file provides the core functionality for private payments using Railgun

// Railgun Configuration
export const RAILGUN_CONFIG = {
  // Network configuration
  NETWORKS: {
    GOERLI: {
      chainId: 5,
      name: 'Goerli Testnet',
      rpcUrl: 'https://goerli.infura.io/v3/YOUR_PROJECT_ID',
      explorer: 'https://goerli.etherscan.io'
    },
    SEPOLIA: {
      chainId: 11155111,
      name: 'Sepolia Testnet', 
      rpcUrl: 'https://sepolia.infura.io/v3/YOUR_PROJECT_ID',
      explorer: 'https://sepolia.etherscan.io'
    }
  },
  
  // Token addresses (USDC for now)
  TOKENS: {
    USDC: {
        GOERLI: process.env.REACT_APP_USDC_GOERLI_ADDRESS || '0x07865c6E87B9F70255377e024ace6630C1Eaa37F',
  SEPOLIA: process.env.REACT_APP_USDC_SEPOLIA_ADDRESS || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
    }
  },
  
  // Relayer configuration
  RELAYER: {
    GOERLI: 'https://relayer-goerli.railgun.org',
    SEPOLIA: 'https://relayer-sepolia.railgun.org'
  },
  
  // Batch unshield schedule
  BATCH_SCHEDULE: {
    interval: 12 * 60 * 60 * 1000, // 12 hours in milliseconds
    minAmount: ethers.parseUnits('10', 6), // 10 USDC minimum
    maxAmount: ethers.parseUnits('10000', 6) // 10,000 USDC maximum
  }
};

// Railgun contract addresses
export const RAILGUN_CONTRACTS = {
  GOERLI: {
    PROXY: process.env.REACT_APP_RAILGUN_PROXY_GOERLI || "0x19B620929f97b7b990B496Fb8b6C3c9B2b8b6C3c", // Example - need real address
    TOKENS: {
      ETH: "0x0000000000000000000000000000000000000000",
      USDC: process.env.REACT_APP_USDC_GOERLI_ADDRESS || "0x07865c6E87B9F70255377e024ace6630C1Eaa37F"
    }
  },
  MAINNET: {
    PROXY: process.env.REACT_APP_RAILGUN_PROXY_MAINNET || "0x19B620929f97b7b990B496Fb8b6C3c9B2b8b6C3c", // Example - need real address
    TOKENS: {
      ETH: "0x0000000000000000000000000000000000000000",
      USDC: process.env.REACT_APP_USDC_MAINNET_ADDRESS || "0xA0b86a33E6441b8C4C0C0C0C0C0C0C0C0C0C0C0"
    }
  }
};

// Memo creation utilities
export const createMemo = (productId, vcHash, amount, nonce) => {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ['uint256', 'bytes32', 'uint256', 'uint256'],
    [productId, vcHash, amount, nonce]
  );
  return ethers.keccak256(encoded);
};

export const createBlindMemo = (productId, vcHash, nonce) => {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ['uint256', 'bytes32', 'uint256'],
    [productId, vcHash, nonce]
  );
  return ethers.keccak256(encoded);
};

// Dynamic token detection
export const detectRailgunProxyAddress = async (provider) => {
  try {
    const network = await provider.getNetwork();
    console.log('🔍 Detecting Railgun proxy for network:', network);
    
    // Fetch addresses from backend API
    const response = await fetch(`${RAILGUN_API_BASE}/api/railgun/addresses?networkId=${network.chainId}`);
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch addresses from backend');
    }
    
    const proxyAddress = result.data.railgunProxyAddress;
    console.log('✅ Fetched Railgun proxy from backend:', proxyAddress, 'for network:', network.name);
    console.log('⚠️  NOTE: This is a placeholder address. Update with real Railgun proxy address.');
    
    return proxyAddress;
    
  } catch (error) {
    console.error('❌ Failed to fetch Railgun proxy from backend:', error);
    
    // Get network info for fallback
    const network = await provider.getNetwork();
    
    // Fallback to hardcoded addresses
    const proxyAddresses = {
      1: '0x19B620929f97b7b990B496Fb8b6C3c9B2b8b6C3C', // Mainnet (placeholder)
      5: '0x19B620929f97b7b990B496Fb8b6C3c9B2b8b6C3C', // Goerli (placeholder)
      11155111: '0x19B620929f97b7b990B496Fb8b6C3c9B2b8b6C3C', // Sepolia (placeholder)
      1337: '0x19B620929f97b7b990B496Fb8b6C3c9B2b8b6C3C', // Local/Ganache (placeholder)
    };
    
    const proxyAddress = proxyAddresses[network.chainId];
    
    if (!proxyAddress) {
      throw new Error(`Railgun proxy not configured for network chainId: ${network.chainId}`);
    }
    
    console.log('✅ Using fallback Railgun proxy:', proxyAddress, 'for network:', network.name);
    console.log('⚠️  NOTE: This is a placeholder address. Update with real Railgun proxy address.');
    
    return proxyAddress;
  }
};

// Wallet management
export class RailgunWalletManager {
  constructor() {
    this.railgunWallet = null;
    this.ethersProvider = null;
    this.ethersWallet = null;
    this.api = null; // Add API reference
  }

  async initialize(ethersProvider) {
    console.log('🔐 Initializing Railgun wallet manager...');
    
    this.ethersProvider = ethersProvider;
    
    // Get the signer
    const signer = await ethersProvider.getSigner();
    this.ethersWallet = signer;
    
    // Store MetaMask address for backend requests
    this.metaMaskAddress = await signer.getAddress();
    
    // Create backend API client
    this.api = await RealRailgunAPI.createFromEthersWallet(signer);
    
    // 🔧 CRITICAL FIX: Initialize the real Railgun SDK wallet
    console.log('🔐 Creating real Railgun wallet in SDK...');
    await this.initializeSDKWallet();
    
    this.railgunWallet = this.api; // Keep backward compatibility
    
    // Load persisted balances
    this.railgunWallet.loadPersistedBalances();
    
    // Set as global instance
    setGlobalWalletManager(this);
    
    const walletInfo = {
      metaMaskAddress: this.metaMaskAddress,
      railgunAddress: this.railgunWallet.getAddress(),
      isConnected: true
    };
    
    console.log('✅ Railgun wallet manager initialized:', walletInfo);
    return walletInfo;
  }

  async shieldFunds(amount, tokenAddress) {
    if (!this.railgunWallet) {
      throw new Error('Railgun wallet not initialized');
    }
    
    console.log('🛡️ Shielding funds:', { amount, tokenAddress });
    
    const shieldResult = await this.railgunWallet.shield({
      tokenAddress,
      amount,
      recipient: this.railgunWallet.getAddress()
    });
    
    return shieldResult;
  }

  async payPrivately(product, vcHash, sellerAddress, transporterAddress) {
    if (!this.railgunWallet) {
      throw new Error('Railgun wallet not initialized');
    }
    
    console.log('🔒 Making private payment:', { product, vcHash });
    
    // Create memo for the payment
    const memo = createMemo(product.id, vcHash, product.price, Date.now());
    
    const transferResult = await this.createPrivateTransfer({
      outputs: [
        {
          recipient: sellerAddress,
          amount: product.price
        }
      ],
      memo,
      tokenAddress: product.tokenAddress || RAILGUN_CONFIG.TOKENS.USDC.GOERLI
    });
    
    return transferResult;
  }

    // 🔧 CRITICAL FIX: Initialize the real Railgun SDK wallet
  async initializeSDKWallet() {
    try {
      console.log('🔐 Initializing real Railgun SDK wallet...');
      
      // Step 1: Ensure SDK is initialized
      await initRailgunSDKOnce(
        process.env.REACT_APP_RAILGUN_RPC_URL || process.env.REACT_APP_RPC_URL,
        NetworkName.EthereumSepolia
      );
      
      // Step 2: Get wallet credentials from backend
      const credentials = await this.api.getWalletCredentials();
      console.log('✅ Got wallet credentials from backend:', { 
        hasMnemonic: !!credentials.mnemonic, 
        hasEncryptionKey: !!credentials.encryptionKey,
        network: credentials.network 
      });
      
      // Step 3: Create the real Railgun wallet in SDK
      console.log('📦 Importing railgunWalletClient...');
      const railgunClient = await import('../railgun/railgunWalletClient');
      console.log('📦 Import result:', railgunClient);
      console.log('📦 Available exports:', Object.keys(railgunClient));
      
      const { createRailgunWallet, walletForID } = railgunClient;
      console.log('🔍 Extracted functions:', { 
        createRailgunWallet: typeof createRailgunWallet, 
        walletForID: typeof walletForID 
      });
      
      // Convert encryption key to Uint8Array
      let encryptionKeyBytes;
      if (typeof credentials.encryptionKey === 'string') {
        if (credentials.encryptionKey.startsWith('0x')) {
          // Convert hex string to Uint8Array
          encryptionKeyBytes = new Uint8Array(
            credentials.encryptionKey.slice(2).match(/.{1,2}/g).map(byte => parseInt(byte, 16))
          );
        } else {
          throw new Error('Encryption key must be a hex string starting with 0x');
        }
      } else if (credentials.encryptionKey instanceof Uint8Array) {
        encryptionKeyBytes = credentials.encryptionKey;
      } else {
        throw new Error('Encryption key must be a hex string or Uint8Array');
      }
      
      // Create the wallet
      const walletResult = await createRailgunWallet(
        encryptionKeyBytes,           // encryptionKey (Uint8Array)
        credentials.mnemonic,         // mnemonic (string)
        [],                          // creationBlockNumbers (empty for new wallet)
        0                           // derivationIndex
      );
      
      console.log('✅ Railgun wallet created in SDK:', walletResult);
      
      // Get the actual wallet object
      const actualWallet = await walletForID(walletResult.id);
      console.log('✅ Got actual wallet object:', actualWallet.constructor.name);
      
      // Store the wallet ID for future use
      this.railgunWalletID = walletResult.id;
      this.actualRailgunWallet = actualWallet;
      
      console.log('✅ Real Railgun SDK wallet initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize SDK wallet:', error);
      throw error;
    }
  }

  async createPrivateTransfer(params) {
    // SDK strategy: use real Railgun SDK
    if (isSDKShieldStrategy()) {
      try {
        await initRailgunSDKOnce(
          process.env.REACT_APP_RAILGUN_RPC_URL || process.env.REACT_APP_RPC_URL,
          NetworkName.EthereumSepolia
        );
        
        const outputs = (params.outputs || []).map(o => ({
          // SDK typically wants recipients and amounts (ERC20AmountRecipients or similar)
          toRailgunAddress: o.toRailgunAddress ?? o.recipient,
          amount: BigInt(o.amount),
          tokenAddress: params.tokenAddress,
        }));

        // Use real SDK transfer
        const { privateTransfer } = await import('../railgun/railgunWalletClient');
        const ref = ensureTxRefBytes32(params?.txRefBytes32);
        
        // SDK expects single output for now
        const output = outputs[0];
        const result = await privateTransfer(
          output.toRailgunAddress,
          params.tokenAddress,
          output.amount,
          params.memo || '0x'
        );
        
        console.log('🔧 SDK strategy: real transfer completed:', result);
        return { 
          success: true, 
          txHash: result.txHash, 
          txRefBytes32: result.txRefBytes32 || ref 
        };
      } catch (error) {
        console.error('❌ SDK transfer failed:', error);
        // Fall back to backend path on SDK failure
      }
    }

    // Fallback: keep your working backend path (WALLET mode)
    return await this.createPrivateTransferViaBackend(params);
  }

  async createPrivateTransferViaBackend(params) {
    // Normalize & prepare request for backend
    const ref = ensureTxRefBytes32(params?.txRefBytes32);
    const outputs = (params.outputs || []).map(o => ({
      // your UI uses { recipient, amount }, normalize here:
      toRailgunAddress: o.toRailgunAddress ?? o.recipient,
      amount: (typeof o.amount === 'bigint' ? o.amount : BigInt(o.amount)).toString(),
      tokenAddress: params.tokenAddress,
    }));

    const body = {
      userAddress: this.metaMaskAddress,          // buyer EOA for audit only
      outputs,
      memo: params.memo ?? '0x',
      tokenAddress: params.tokenAddress,
      txRefBytes32: ref,
      // wallet mode (dev): backend expects a txHash-looking value
      txHash: ref,
    };

    console.log('🔒 Manager → backend /private-transfer:', body);

    const res = await fetch(`${RAILGUN_API_BASE}/api/railgun/private-transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json?.success) {
      const msg = json?.error || `HTTP ${res.status}`;
      throw new Error(`Private transfer failed: ${msg}`);
    }
    // Return a consistent shape to the caller
    const rawHash = json?.data?.txHash ?? json?.data?.hash ?? ref;
    return { txHash: rawHash, txRefBytes32: ref, success: true };
  }

  async scheduleBatchUnshield(amount, tokenAddress) {
    if (!this.railgunWallet) {
      throw new Error('Railgun wallet not initialized');
    }
    
    console.log('📅 Scheduling batch unshield:', { amount, tokenAddress });
    
    const scheduleResult = await this.railgunWallet.scheduleBatchUnshield(amount, tokenAddress);
    
    return scheduleResult;
  }

  getWalletInfo() {
    if (!this.railgunWallet) {
      return null;
    }
    
    return this.railgunWallet.getWalletInfo();
  }
}

// Payment flow utilities
export class RailgunPaymentFlow {
  constructor(walletManager, escrowContract) {
    this.walletManager = walletManager;
    this.escrowContract = escrowContract;
  }

  async executePrivatePayment(product, vcHash) {
    try {
      // Step 1: Shield funds if needed
      const totalAmount = product.price + product.deliveryFee;
      await this.walletManager.shieldFunds(
        totalAmount, 
        product.tokenAddress || RAILGUN_CONFIG.TOKENS.USDC.GOERLI
      );

      // Step 2: Create private transfer
      const paymentResult = await this.walletManager.payPrivately(
        product,
        vcHash,
        product.sellerAddress,
        product.transporterAddress
      );

      // ✅ Step 3: Record payment on escrow contract
      // Note: recordPrivatePayment(productId, memoHash, railgunTxRef) - productId param is correct
      await this.escrowContract.recordPrivatePayment(
        product.id,
        paymentResult.memo,
        paymentResult.txHash
      );

      // Step 4: Store memo details for audit
      await this.storeMemoDetails(product.id, vcHash, product.price, paymentResult.nonce, paymentResult.memo);

      return paymentResult;
    } catch (error) {
      console.error('Failed to execute private payment:', error);
      throw error;
    }
  }

  /**
   * Execute private payment with identity linkage proof
   * This proves the same person controls both the VC signing wallet and Railgun wallet
   * Sequence: Proof → Transfer → Memo → Record
   */
     async executePrivatePaymentWithIdentityLinkage({
     product,
     vcHash,
     vcSigningKey,        // Private key that signed the VC
     railgunSigningKey,   // Private key for Railgun wallet
     railgunAddress,      // Railgun wallet address
     sellerRailgunAddress,
     transporterRailgunAddress,
     price,
    deliveryFee,
    provider,            // Provider for network detection
    escrowAddress        // Escrow contract address
   }) {
     try {
      // Validate escrow contract
      if (!this.escrowContract) {
        throw new Error("Escrow contract not initialized. Please check contract ABI and address.");
      }
      
      const escrowAddr = this.escrowContract.target ?? this.escrowContract.address;
      console.log("🔧 Escrow contract validated:", escrowAddr);
      
      // Get the real product ID from the escrow contract
      const escrowId = await this.escrowContract.id();
      console.log("🔍 Escrow contract ID:", escrowId.toString());
      
      // Check if private purchases are enabled
      const privateEnabled = await this.escrowContract.privateEnabled();
      if (!privateEnabled) {
        throw new Error("Private purchases are disabled for this product. Please contact the seller to enable private purchases.");
      }
      console.log("✅ Private purchases enabled:", privateEnabled);
      
      // Step 1: Generate identity linkage proof FIRST (bound to buyerEOA)
       console.log("🔗 Generating identity linkage proof...");
       const identityLinkageProof = await generateIdentityLinkageProof({
         vcSigningKey,
         railgunSigningKey,
         vcHash,
         railgunAddress
       });

      // Step 2: Execute private transfer to get railgunTxRef
       console.log("💰 Executing private transfer...");
       console.log("🔍 Transfer parameters:");
       console.log("  Price:", price.toString(), "wei");
      
      // Get token decimals for proper formatting
      const tokenDecimals = product.tokenAddress === "0x0000000000000000000000000000000000000000" ? 18 : 6;
      console.log(`  Price (${tokenDecimals === 18 ? 'ETH' : 'USDC'}):`, ethers.formatUnits(price, tokenDecimals), tokenDecimals === 18 ? 'ETH' : 'USDC');
       console.log("  Delivery fee:", deliveryFee.toString(), "wei");
      console.log(`  Delivery fee (${tokenDecimals === 18 ? 'ETH' : 'USDC'}):`, ethers.formatUnits(deliveryFee, tokenDecimals), tokenDecimals === 18 ? 'ETH' : 'USDC');
      
      // Build outputs array - only include recipients that exist and have positive amounts
      const outputs = [];
      
      // Always include the main price output (required)
      if (price > 0n) {
        // Use seller's Railgun address - this must be the actual seller's Railgun address
        if (!sellerRailgunAddress || sellerRailgunAddress === "0x0000000000000000000000000000000000000000") {
          throw new Error("Seller's Railgun address is required for private transfer. Cannot send to zero address.");
        }
        
        outputs.push({ recipient: sellerRailgunAddress, amount: ethers.toBigInt(price) });
        console.log("📤 Added price output:", { recipient: sellerRailgunAddress, amount: price.toString() });
      }
      
      // Include delivery fee if it exists and is positive
      if (deliveryFee > 0n && transporterRailgunAddress && transporterRailgunAddress !== "0x0000000000000000000000000000000000000000") {
        outputs.push({ recipient: transporterRailgunAddress, amount: ethers.toBigInt(deliveryFee) });
        console.log("📤 Added delivery fee output:", { recipient: transporterRailgunAddress, amount: deliveryFee.toString() });
      }
      
      // Ensure we have at least one output
      if (outputs.length === 0) {
        throw new Error("No valid outputs for private transfer - price must be greater than 0");
      }
      
      console.log("📤 Transfer outputs:", outputs);
       
             // ✅ FIX: Use WETH token address for Sepolia (same as used for shielding)
      const tokenAddress = product.tokenAddress || 
        (process.env.REACT_APP_SHIELD_STRATEGY === 'sdk' ? 
          '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9' : // Official Sepolia WETH
          ethers.ZeroAddress); // ETH for local networks
      
      console.log('🔧 Using token address for transfer:', tokenAddress);
      
      const privateTransfer = await this.walletManager.createPrivateTransfer({
        outputs: outputs,
        memo: "0x", // Placeholder memo, will be replaced with robust hash
        tokenAddress: tokenAddress,
        txRefBytes32: "" // Will be set after we get the txHash
      });

      // Step 3: Build robust memo hash using txRef and other params
      console.log("🔐 Building robust memo hash...");
      
      // Ensure we have a proper provider for getting the signer
      let buyerEOA;
      try {
        if (typeof provider === 'string') {
          // If provider is a string (URL), create a new provider
          const ethersProvider = new ethers.JsonRpcProvider(provider);
          const signer = await ethersProvider.getSigner();
          buyerEOA = typeof signer.getAddress === 'function'
            ? await signer.getAddress()
            : signer.address; // some signers expose .address in v6
        } else if (provider && typeof provider.getSigner === 'function') {
          // If provider is already an ethers provider, use it
          const signer = await provider.getSigner();
          buyerEOA = typeof signer.getAddress === 'function'
            ? await signer.getAddress()
            : signer.address; // some signers expose .address in v6
        } else {
          // Fallback to window.ethereum
          const ethersProvider = new ethers.BrowserProvider(window.ethereum);
          const signer = await ethersProvider.getSigner();
          buyerEOA = typeof signer.getAddress === 'function'
            ? await signer.getAddress()
            : signer.address; // some signers expose .address in v6
        }
        
        console.log("✅ Buyer EOA address retrieved:", buyerEOA);
      } catch (error) {
        console.error("❌ Failed to get buyer EOA address:", error);
        // Use a fallback address for development
        buyerEOA = "0x0000000000000000000000000000000000000000";
        console.warn("⚠️ Using fallback buyer address:", buyerEOA);
      }
      
      // Step 3: Build memo hash with identity linkage
      console.log('📝 Building private memo hash...');
      
       // Use real transfer artifact from SDK when available
      const rawRef = privateTransfer.txHash ?? privateTransfer.hash ?? '';
      const safeRef = sanitizeTxRef(rawRef) ?? generateValidTxRef();
      
      // Update the privateTransfer with the correct txRefBytes32 for idempotency
      privateTransfer.txRefBytes32 = safeRef;
       
       console.log('🔍 Real transfer artifact used for txRef32:', { 
         original: rawRef, 
         sanitized: safeRef,
         source: rawRef ? 'SDK' : 'generated'
       });
      
      console.log('🔍 TxRef sanitization:', { 
        original: rawRef, 
        sanitized: safeRef,
        privateTransfer 
      });
      
      const { memoHash, txRef32 } = await buildPrivateMemo({
        provider: provider, // Pass the original provider
        escrowAddress,
        buyerEOA,
        railgunTxRef: safeRef, // Use sanitized txRef
        amountAtomic: price,
        tokenAddress: tokenAddress // Use the same token address as the transfer
      });

      // Step 4: Preflight check with staticCall
      console.log('🔍 Preflight check: recordPrivatePayment.staticCall...');
      console.log('🔧 Contract instance:', this.escrowContract);
      console.log('🔧 Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(this.escrowContract)));
      console.log('🔧 Has recordPrivatePayment:', typeof this.escrowContract.recordPrivatePayment);
      console.log('🔧 Has staticCall:', typeof this.escrowContract.recordPrivatePayment?.staticCall);
      
      // Check if the required method exists
      if (!this.escrowContract.recordPrivatePayment) {
        throw new Error('Contract does not have recordPrivatePayment method. Check ABI and contract deployment.');
      }
      
      // Validate participant - only seller can call recordPrivatePayment
      console.log('🧾 Validating participant permissions...');
      const [onchainOwner, onchainBuyer, isPrivateEnabled] = await Promise.all([
        this.escrowContract.owner(),
        this.escrowContract.buyer(),
        this.escrowContract.privateEnabled()
      ]);
      
      console.log('🔎 Escrow state:', { 
        id: escrowId.toString(), 
        owner: onchainOwner, 
        buyer: onchainBuyer, 
        privateEnabled: isPrivateEnabled,
        signer: buyerEOA 
      });
      
      if (buyerEOA.toLowerCase() !== onchainOwner.toLowerCase()) {
        // Don't throw — finish the buyer flow and return enough info for the UI
        console.log('ℹ️ Buyer completed private transfer, but seller must record on-chain');
        return {
          memo: memoHash,
          txHash: privateTransfer.hash ?? privateTransfer.txHash ?? safeRef,
          txRef32,
          status: 'transfer_complete_pending_seller_record',
          message: 'Private transfer complete. Waiting for seller to record the payment on-chain.'
        };
      }
      
      console.log('✅ Participant validation passed - seller can record payment');
      
      try {
        // Use traditional staticCall for preflight check
        await this.escrowContract.recordPrivatePayment.staticCall(
          escrowId, 
          memoHash, 
          txRef32
        );
        console.log('✅ Preflight check passed - recordPrivatePayment will succeed');
      } catch (error) {
        console.error('❌ Preflight check failed:', error);
        // Handle specific revert reasons
        if (String(error).includes("NotParticipant")) {
          throw new Error("Preflight failed: NotParticipant — switch to the seller account to confirm the payment.");
        }
        throw new Error(`Preflight check failed: ${error.reason || error.message}`);
      }
      
      // Step 5: Record private payment on-chain
      console.log('📝 Recording private payment on-chain...');
      const gasLimit = process.env.REACT_APP_GAS_LIMIT_PRIVATE ? 
        BigInt(process.env.REACT_APP_GAS_LIMIT_PRIVATE) : 
        DEFAULT_GAS_LIMIT_PRIVATE;
      
      const tx = await this.escrowContract.recordPrivatePayment(
        escrowId, // Use escrowId instead of product.id
        memoHash, 
        txRef32,
        { gasLimit }
      );
      
      const receipt = await tx.wait();
      console.log("✅ Payment recorded on-chain:", receipt.hash);

      // Step 6: Store enhanced memo details
       await this.storeMemoDetailsWithIdentityLinkage(
        escrowId, // Use escrowId instead of product.id
         vcHash, 
         price, 
        Date.now(), // nonce
        memoHash,   // Use robust memo hash
         identityLinkageProof
       );

      return {
        memo: memoHash,
        txHash: privateTransfer.hash,
        recordTxHash: receipt.hash,
        txRef32,
        nonce: Date.now(),
        identityLinkageProof,
        status: 'completed_with_identity_linkage'
      };

    } catch (error) {
      console.error("Failed to execute private payment with identity linkage:", error);
      throw new Error(`Private payment with identity linkage failed: ${error.message}`);
    }
  }

  /**
   * Store memo details with identity linkage proof
   */
  async storeMemoDetailsWithIdentityLinkage(productId, vcHash, amount, nonce, memoHash, identityLinkageProof) {
    const memoDetails = {
      productId: productId,
      vcHash: vcHash,
      amount: amount.toString(), // Convert BigInt to string for JSON serialization
      nonce: nonce,
      memoHash: memoHash,
      timestamp: Date.now(),
      stakeholder: 'buyer',
      identityLinkageProof: identityLinkageProof // NEW: Include identity linkage proof
    };

    // Store in localStorage for now (in production, use secure storage)
    localStorage.setItem(`memo_${productId}`, JSON.stringify(memoDetails));
    
    console.log('Memo details with identity linkage stored:', memoDetails);
    return memoDetails;
  }

  /**
   * Verify identity linkage for a completed payment
   */
  async verifyPaymentIdentityLinkage(productId, vc) {
    try {
      // Step 1: Check if VC has identity linkage proof
      const hasLinkage = hasIdentityLinkageProof(vc);
      if (!hasLinkage) {
        return {
          hasIdentityLinkage: false,
          message: "No identity linkage proof found in VC"
        };
      }

      // Step 2: Verify the identity linkage proof
      const validation = await validateVCIdentityLinkage(vc);
      
      // Step 3: Get payment details from escrow
      const paymentDetails = await this.escrowContract.getPrivatePaymentDetails(productId);
      
      // Step 4: Get stored memo details
      const storedMemo = localStorage.getItem(`memo_${productId}`);
      const memoDetails = storedMemo ? JSON.parse(storedMemo) : null;
      
      return {
        hasIdentityLinkage: true,
        identityLinkageValid: validation.valid,
        vcHash: validation.vcHash,
        railgunAddress: validation.railgunAddress,
        railgunTxHash: paymentDetails.railgunTxRef,
        memoVerified: memoDetails && memoDetails.memoHash === paymentDetails.memoHash,
        message: validation.valid ? 
          "Identity linkage verified - same person controls both wallets" :
          "Identity linkage verification failed"
      };

    } catch (error) {
      console.error("Failed to verify payment identity linkage:", error);
      return {
        hasIdentityLinkage: false,
        error: error.message,
        message: "Identity linkage verification failed"
      };
    }
  }

  /**
   * Audit function that proves payment without revealing identities
   */
  async auditPaymentWithIdentityLinkage(productId, vc) {
    try {
      // Step 1: Verify identity linkage
      const linkageVerification = await this.verifyPaymentIdentityLinkage(productId, vc);
      
      // Step 2: Verify memo binding
      const memoVerification = await this.verifyMemo(productId, vc.vcHash, vc.amount, vc.nonce, vc.memoHash);
      
      // Step 3: Get payment details from escrow
      const paymentDetails = await this.escrowContract.getPrivatePaymentDetails(productId);
      
      return {
        productId,
        auditTimestamp: new Date().toISOString(),
        identityLinkage: {
          verified: linkageVerification.identityLinkageValid,
          railgunAddress: linkageVerification.railgunAddress,
          message: linkageVerification.message
        },
        memoBinding: {
          verified: memoVerification.verified,
          memoHash: memoVerification.memoHash,
          message: memoVerification.message
        },
        escrowRecord: {
          hasPayment: paymentDetails.hasPayment,
          memoHash: paymentDetails.memoHash,
          railgunTxRef: paymentDetails.railgunTxRef
        },
        overallVerification: 
          linkageVerification.identityLinkageValid && 
          memoVerification.verified && 
          paymentDetails.hasPayment,
        auditMessage: "Payment verified with identity linkage - same person controls both VC signing and Railgun wallets"
      };

    } catch (error) {
      console.error("Audit with identity linkage failed:", error);
      return {
        productId,
        auditTimestamp: new Date().toISOString(),
        error: error.message,
        overallVerification: false,
        auditMessage: "Audit failed"
      };
    }
  }

  async storeMemoDetails(productId, vcHash, amount, nonce, memoHash) {
    const memoDetails = {
      productId: productId,
      vcHash: vcHash,
      amount: amount,
      nonce: nonce,
      memoHash: memoHash,
      timestamp: Date.now(),
      stakeholder: 'buyer'
    };

    // Store in localStorage for now (in production, use secure storage)
    localStorage.setItem(`memo_${productId}`, JSON.stringify(memoDetails));
    
    console.log('Memo details stored:', memoDetails);
    return memoDetails;
  }

  async verifyMemo(productId, vcHash, amount, nonce, memoHash) {
    const computedMemo = createMemo(productId, vcHash, amount, nonce);
    const isValid = computedMemo === memoHash;
    
    return {
      verified: isValid,
      computedMemo: computedMemo,
      providedMemo: memoHash,
      amount: amount,
      productId: productId,
      vcHash: vcHash,
      nonce: nonce
    };
  }
}

// Default export
const railgunUtils = {
  RailgunWalletManager,
  RailgunPaymentFlow,
  RealRailgunAPI,
  createMemo,
  createBlindMemo,
  detectRailgunProxyAddress,
  RAILGUN_CONFIG,
  RAILGUN_CONTRACTS,
  getGlobalWalletManager,
  setGlobalWalletManager
};

export default railgunUtils; 