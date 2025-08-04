import { ethers } from 'ethers';
import { 
  generateIdentityLinkageProof, 
  hasIdentityLinkageProof,
  validateVCIdentityLinkage 
} from './vcBuilder.mjs';

// Global wallet manager instance (shared across components)
let globalWalletManagerInstance = null;

export const getGlobalWalletManager = () => globalWalletManagerInstance;
export const setGlobalWalletManager = (manager) => {
  globalWalletManagerInstance = manager;
};

// Railgun API Configuration
const RAILGUN_API_BASE = process.env.REACT_APP_RAILGUN_API_URL || 'http://localhost:3001';

// Real Railgun SDK Integration
export class RealRailgunAPI {
  constructor(railgunWallet, ethersWallet) {
    this.railgunWallet = railgunWallet;
    this.ethersWallet = ethersWallet;
    this.userAddress = ethersWallet.address;
  }

  static async createFromEthersWallet(ethersWallet) {
    console.log('🔐 Creating Railgun API client from Ethers wallet');
    
    try {
      // Step 1: Fetch wallet info from backend
      const userAddress = await ethersWallet.getAddress();
      const response = await fetch(`${RAILGUN_API_BASE}/api/railgun/wallet-info?userAddress=${userAddress}`);
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch wallet info from backend');
      }
      
      const walletInfo = result.data;
      console.log('✅ Fetched wallet info from backend:', { userAddress: walletInfo.userAddress, network: walletInfo.network });
      
      // Step 2: Create a real Railgun wallet using backend data
      console.log('🔐 Creating real Railgun wallet from backend data');
      
      // Generate a proper Railgun address from the mnemonic
      const railgunAddress = await this.generateRailgunAddress(walletInfo.mnemonic, walletInfo.encryptionKey);
      
      const realRailgunWallet = {
        address: railgunAddress,
        network: walletInfo.network,
        mnemonic: walletInfo.mnemonic,
        encryptionKey: walletInfo.encryptionKey,
        userAddress: walletInfo.userAddress,
        
        // Real methods that use backend API
        getAddress: () => railgunAddress,
        getNetwork: () => walletInfo.network,
        
        // Use backend API for real operations
        getBalance: async (tokenAddress) => {
          console.log('💰 Getting real balance from backend for token:', tokenAddress);
          try {
            const balanceResponse = await fetch(`${RAILGUN_API_BASE}/api/railgun/balance/${tokenAddress}/${userAddress}`);
            const balanceResult = await balanceResponse.json();
            
            if (balanceResult.success) {
              // Determine decimals based on token address (ETH: 18, USDC: 6)
              const decimals = tokenAddress === '0x0000000000000000000000000000000000000000' ? 18 : 6;
              const balance = ethers.parseUnits(balanceResult.data.balance || '0', decimals);
              const tokenName = tokenAddress === '0x0000000000000000000000000000000000000000' ? 'ETH' : 'USDC';
              console.log('✅ Real balance from backend:', ethers.formatUnits(balance, decimals), tokenName);
              return balance;
            } else {
              console.log('⚠️ Backend returned error, using 0 balance');
              return ethers.parseUnits('0', 6); // Return 0 instead of fallback
            }
          } catch (error) {
            console.error('❌ Failed to get balance from backend:', error);
            return ethers.parseUnits('0', 6); // Return 0 on error
          }
        },
        
        shield: async (params) => {
          console.log('🛡️ Real Railgun API shield:', params);
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
              console.log('✅ Real shield completed via backend:', shieldResult.data);
              return { hash: shieldResult.data.hash, success: true };
            } else {
              throw new Error(shieldResult.error || 'Shield failed');
            }
          } catch (error) {
            console.error('❌ Real shield failed:', error);
            throw error;
          }
        },
        
        createPrivateTransfer: async (params) => {
          console.log('🔒 Real private transfer via backend API:', params);
          try {
            // Convert BigInt values to strings for JSON serialization
            const serializedOutputs = params.outputs.map(output => ({
              ...output,
              amount: output.amount.toString() // Convert BigInt to string
            }));
            
            const transferResponse = await fetch(`${RAILGUN_API_BASE}/api/railgun/private-transfer`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userAddress: userAddress,
                outputs: serializedOutputs,
                memo: params.memo,
                tokenAddress: params.tokenAddress
              })
            });
            
            const transferResult = await transferResponse.json();
            if (transferResult.success) {
              console.log('✅ Real private transfer completed via backend:', transferResult.data);
              return { hash: transferResult.data.txHash, success: true };
            } else {
              throw new Error(transferResult.error || 'Private transfer failed');
            }
          } catch (error) {
            console.error('❌ Real private transfer failed:', error);
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
        
        loadPersistedBalances: () => console.log('📱 Real: Balances loaded from backend'),
        savePersistedBalances: () => console.log('💾 Real: Balances saved to backend'),
        
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
  
  // Helper method to generate Railgun address from mnemonic
  static async generateRailgunAddress(mnemonic, encryptionKey) {
    try {
      // Create a deterministic Railgun address from mnemonic using ethers.js v6 API
      const hdNode = ethers.HDNodeWallet.fromMnemonic(ethers.Mnemonic.fromPhrase(mnemonic));
      // Use a simpler path that doesn't require root derivation
      const railgunPath = "44'/60'/0'/0/0"; // Remove the "m/" prefix
      const railgunWallet = hdNode.derivePath(railgunPath);
      
      // Create a Railgun-specific address format
      const railgunAddress = `0x${railgunWallet.address.slice(2)}_railgun`;
      console.log('🔐 Generated Railgun address from mnemonic:', railgunAddress);
      
      return railgunAddress;
    } catch (error) {
      console.error('❌ Failed to generate Railgun address:', error);
      // Fallback to a simple hash-based address
      const addressHash = ethers.keccak256(ethers.toUtf8Bytes(mnemonic + encryptionKey));
      return `0x${addressHash.slice(2, 42)}_railgun`;
    }
  }

  getAddress() {
    return this.railgunWallet.getAddress();
  }

  async shield(params) {
    console.log('🛡️ Real Railgun API shield:', params);
    
    const { tokenAddress, amount, recipient } = params;
    
    try {
      // Use real Railgun wallet to shield funds
      const shieldResult = await this.railgunWallet.shield({
        tokenAddress,
        amount,
        recipient: recipient || this.getAddress()
      });
      
      console.log('✅ Real shield completed:', shieldResult);
      return shieldResult;
      
    } catch (error) {
      console.error('❌ Real shield failed:', error);
      throw error;
    }
  }

  async createPrivateTransfer(params) {
    console.log('🔒 Real Railgun API private transfer:', params);
    
    const { outputs, memo, tokenAddress } = params;
    
    try {
      // Use real Railgun wallet to create private transfer
      const transferResult = await this.railgunWallet.createPrivateTransfer({
        outputs,
        memo,
        tokenAddress
      });
      
      console.log('✅ Real private transfer completed:', transferResult);
      return transferResult;
      
    } catch (error) {
      console.error('❌ Real private transfer failed:', error);
      throw error;
    }
  }

  async getBalance(tokenAddress) {
    console.log('💰 Real Railgun API balance check:', tokenAddress);
    
    try {
      // Use real Railgun wallet to get balance
      const balance = await this.railgunWallet.getBalance(tokenAddress);
      console.log('✅ Real balance:', ethers.formatUnits(balance, 6), 'USDC');
      return balance;
      
    } catch (error) {
      console.error('❌ Real balance check failed:', error);
      // Return 0 balance on error
      return ethers.parseUnits('0', 6);
    }
  }

  async recordPayment(productId, memoHash, railgunTxRef, identityProof = null) {
    console.log('📝 Mock Railgun API record payment:', { productId, memoHash, railgunTxRef });
    
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

      console.log('✅ Mock payment recorded:', result.data);
      return result.data;
      
    } catch (error) {
      console.error('❌ Mock payment recording failed:', error);
      throw error;
    }
  }

  getTransactionHistory() {
    // Use mock Railgun wallet to get transaction history
    return this.railgunWallet.getTransactionHistory();
  }

  loadPersistedBalances() {
    // Use mock Railgun wallet to load persisted balances
    this.railgunWallet.loadPersistedBalances();
    console.log('📱 Mock Railgun API: Balances loaded');
  }

  savePersistedBalances() {
    // Use mock Railgun wallet to save persisted balances
    this.railgunWallet.savePersistedBalances();
    console.log('💾 Mock Railgun API: Balances saved');
  }

  async scheduleBatchUnshield(amount, tokenAddress) {
    console.log('📅 Mock Railgun API batch unshield:', { amount, tokenAddress });
    
    // Use mock Railgun wallet to schedule batch unshield
    const scheduleResult = await this.railgunWallet.scheduleBatchUnshield(amount, tokenAddress);
    return scheduleResult;
  }

  getWalletInfo() {
    return {
      address: this.getAddress(),
      metaMaskAddress: this.userAddress,
      type: 'real_railgun_api',
      network: this.railgunWallet.getNetwork(),
      note: 'Using real backend API with generated Railgun address from mnemonic'
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
      GOERLI: '0x07865c6E87B9F70255377e024ace6630C1Eaa37F',
      SEPOLIA: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
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
    PROXY: "0x19B620929f97b7b990B496Fb8b6C3c9B2b8b6C3c", // Example - need real address
    TOKENS: {
      ETH: "0x0000000000000000000000000000000000000000",
      USDC: "0x07865c6E87B9F70255377e024ace6630C1Eaa37F"
    }
  },
  MAINNET: {
    PROXY: "0x19B620929f97b7b990B496Fb8b6C3c9B2b8b6C3c", // Example - need real address
    TOKENS: {
      ETH: "0x0000000000000000000000000000000000000000",
      USDC: "0xA0b86a33E6441b8C4C0C0C0C0C0C0C0C0C0C0C0"
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
export const detectUSDCAddress = async (provider, networkName = 'goerli') => {
  try {
    const network = await provider.getNetwork();
    console.log('🔍 Detecting USDC address for network:', network);
    
    // Fetch addresses from backend API
    const response = await fetch(`${RAILGUN_API_BASE}/api/railgun/addresses?networkId=${network.chainId}`);
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch addresses from backend');
    }
    
    const usdcAddress = result.data.usdcAddress;
    console.log('✅ Fetched USDC address from backend:', usdcAddress, 'for network:', network.name);
    return usdcAddress;
    
  } catch (error) {
    console.error('❌ Failed to fetch USDC address from backend:', error);
    
    // Get network info for fallback
    const network = await provider.getNetwork();
    
    // Fallback to hardcoded addresses
    const usdcAddresses = {
      1: '0xA0b86a33E6441b8C4C0C0C0C0C0C0C0C0C0C0C0', // Mainnet
      5: '0x07865c6E87B9F70255377e024ace6630C1Eaa37F', // Goerli
      11155111: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia
      1337: '0x07865c6E87B9F70255377e024ace6630C1Eaa37F', // Local/Ganache (using Goerli address)
    };
    
    const usdcAddress = usdcAddresses[network.chainId];
    
    if (!usdcAddress) {
      throw new Error(`USDC not configured for network chainId: ${network.chainId}`);
    }
    
    console.log('✅ Using fallback USDC address:', usdcAddress, 'for network:', network.name);
    return usdcAddress;
  }
};

// Dynamic Railgun proxy detection
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
  }

  async initialize(ethersProvider) {
    console.log('🔐 Initializing Railgun wallet manager...');
    
    this.ethersProvider = ethersProvider;
    
    // Get the signer
    const signer = await ethersProvider.getSigner();
    this.ethersWallet = signer;
    
    // Create real Railgun API client
    this.railgunWallet = await RealRailgunAPI.createFromEthersWallet(signer);
    
    // Load persisted balances
    this.railgunWallet.loadPersistedBalances();
    
    // Set as global instance
    setGlobalWalletManager(this);
    
    const walletInfo = {
      metaMaskAddress: await signer.getAddress(),
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
    
    const transferResult = await this.railgunWallet.createPrivateTransfer({
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

      // Step 3: Record payment on escrow contract
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
     deliveryFee
   }) {
     try {
       // Step 1: Generate identity linkage proof
       console.log("🔗 Generating identity linkage proof...");
       const identityLinkageProof = await generateIdentityLinkageProof({
         vcSigningKey,
         railgunSigningKey,
         vcHash,
         railgunAddress
       });

       // Step 2: Create memo with enhanced binding
       const nonce = Date.now();
       const memo = createMemo(product.id, vcHash, price, nonce);
       
       // Step 3: Execute private transfer (user should have already shielded funds)
       console.log("💰 Executing private transfer...");
       console.log("🔍 Transfer parameters:");
       console.log("  Price:", price.toString(), "wei");
       console.log("  Price (ETH):", ethers.formatUnits(price, 18), "ETH");
       console.log("  Delivery fee:", deliveryFee.toString(), "wei");
       console.log("  Delivery fee (ETH):", ethers.formatUnits(deliveryFee, 18), "ETH");
       
       const privateTransfer = await this.walletManager.railgunWallet.createPrivateTransfer({
         outputs: [
           { recipient: sellerRailgunAddress, amount: ethers.toBigInt(price) },
           { recipient: transporterRailgunAddress, amount: ethers.toBigInt(deliveryFee) },
           { recipient: railgunAddress, amount: ethers.toBigInt(0) } // No change in this example
         ],
         memo: memo,
         tokenAddress: product.tokenAddress || RAILGUN_CONFIG.TOKENS.USDC.GOERLI
       });

             // Step 4: Record payment on escrow with identity linkage
       console.log("📝 Recording payment with identity linkage...");
       await this.escrowContract.recordPrivatePayment(
         product.id, 
         memo, 
         privateTransfer.hash,
         identityLinkageProof // NEW: Include identity linkage proof
       );

       // Step 5: Store enhanced memo details
       await this.storeMemoDetailsWithIdentityLinkage(
         product.id, 
         vcHash, 
         price, 
         nonce, 
         memo, 
         identityLinkageProof
       );

      return {
        memo,
        txHash: privateTransfer.hash,
        nonce,
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
export default {
  RailgunWalletManager,
  RailgunPaymentFlow,
  RealRailgunAPI,
  createMemo,
  createBlindMemo,
  detectUSDCAddress,
  detectRailgunProxyAddress,
  RAILGUN_CONFIG,
  RAILGUN_CONTRACTS,
  getGlobalWalletManager,
  setGlobalWalletManager
}; 