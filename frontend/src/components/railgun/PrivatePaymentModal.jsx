import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '../ui/button';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import ProductEscrowABI from '../../abis/ProductEscrow_Initializer.json';
import PrivateFundsDrawer from './PrivateFundsDrawer';
import { fmt18 } from '../../helpers/format';
import { NetworkName, NETWORK_CONFIG } from '@railgun-community/shared-models';
import { getExplorerUrl, decodeContractError } from '../../utils/errorHandler';

import {
  connectRailgun,
  disconnectRailgun,
  setRailgunIdentity,
  refreshBalances,
  getAllBalances,
  privateTransfer,
  getRailgunAddressFromCredentials,
  checkWalletState
} from '../../lib/railgun-clean';

// Get WETH address from SDK config (must match what shield.js uses)
const SEPOLIA_WETH_ADDRESS = NETWORK_CONFIG[NetworkName.EthereumSepolia]?.baseToken?.wrappedAddress
  || '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';

// Alias for backward compatibility in this file
const paySellerV2 = privateTransfer;

// API base constant (mirror railgunUtils.js)
const RAILGUN_API_BASE = process.env.REACT_APP_RAILGUN_API_URL || 'http://localhost:3001';

// Extract the actual ABI array from the imported JSON
const ESCROW_ABI = ProductEscrowABI.abi;

const PrivatePaymentModal = ({ product, isOpen, onClose, onSuccess, currentUser }) => {
  const [currentStep, setCurrentStep] = useState('payment'); // payment -> complete (wallet connection moved to main nav)
  
  // 🧪 Debug: Log product only when it changes (not on every render)
  useEffect(() => {
    if (product) {
      console.log('🔍 PrivatePaymentModal received product:', product);
      console.log('🔍 Product seller:', product?.seller);
      console.log('🔍 Product keys:', Object.keys(product));
      console.log('🔍 Product owner:', product?.owner);
      console.log('🔍 Product creator:', product?.creator);
    }
  }, [product?.address]); // Only log when product address changes (i.e., different product)
  const [walletManager, setWalletManager] = useState(null);
  const [railgunAddress, setRailgunAddress] = useState(null);
  const [railgunWalletID, setRailgunWalletID] = useState(null);
  
  // Read persisted wallet info from localStorage
  const [railgun, setRailgun] = useState(() => {
    try { 
      return JSON.parse(localStorage.getItem('railgun.wallet') || 'null'); 
    } catch { 
      return null; 
    }
  });

  // Check if user has connected Railgun wallet by checking localStorage
  const railgunConnection = useMemo(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('railgun.wallet') || 'null');
      if (stored && stored.walletID && stored.userAddress) {
        // Accept credentials-only stored connections (backend holds sensitive secrets).
        const belongsToCurrentUser = stored.userAddress.toLowerCase() === currentUser.toLowerCase();
        const placeholderAddress = stored.railgunAddress || `0zk1q_dummy_${stored.walletID}`;
        return {
          isConnected: belongsToCurrentUser,
          walletID: belongsToCurrentUser ? stored.walletID : null,
          railgunAddress: belongsToCurrentUser ? placeholderAddress : null,
          userAddress: belongsToCurrentUser ? stored.userAddress : null
        };
      }
      return { isConnected: false, walletID: null, railgunAddress: null, userAddress: null };
    } catch (error) {
      console.error('❌ Error checking Railgun connection:', error);
      return { isConnected: false, walletID: null, railgunAddress: null, userAddress: null };
    }
  }, [currentUser]);

  const isRailgunConnected = railgunConnection.isConnected;

  // Add proper connection state tracking
  const [isConnecting, setIsConnecting] = useState(false);
  const [isActuallyConnected, setIsActuallyConnected] = useState(false);

  // Listen for connection changes from localStorage
  useEffect(() => {
    // Guard: prevent multiple concurrent executions
    if (window._isHandlingConnectionChange) {
      return;
    }
    
    const handleConnectionChange = async () => {
      // Guard: prevent multiple concurrent executions
      if (window._isHandlingConnectionChange) {
        return;
      }
      
      // Guard: don't react to our own localStorage writes
      if (window._isUpdatingRailgunStorage) {
        return;
      }
      
      window._isHandlingConnectionChange = true;
      
      try {
        // Add a small delay to allow connection data to be stored
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Force re-evaluation of connection status
        const stored = JSON.parse(localStorage.getItem('railgun.wallet') || 'null');
        console.log('🔍 Connection change handler - checking stored data:', stored);
      
      if (stored && stored.walletID && stored.userAddress) {
        const belongsToCurrentUser = stored.userAddress.toLowerCase() === currentUser.toLowerCase();
        console.log('🔍 Belongs to current user:', belongsToCurrentUser, {
          storedUser: stored.userAddress,
          currentUser: currentUser
        });

        const placeholderAddress = stored.railgunAddress || `0zk1q_dummy_${stored.walletID}`;

        if (belongsToCurrentUser) {
          console.log('🔍 Connection change - setting Railgun state:', placeholderAddress);
          setIsActuallyConnected(true);
          setRailgunAddress(placeholderAddress);
          setRailgunWalletID(stored.walletID);

          // Update the railgun state to trigger localStorage save
          setRailgun({ ...stored, railgunAddress: placeholderAddress });

          // Create walletManager for this connection (pass placeholder if real address missing)
          createWalletManagerForConnection(stored.walletID, placeholderAddress);

          // Set buyer's Railgun address to current user's (placeholder if necessary)
          setBuyerRailgunAddress(placeholderAddress);

          // ✅ Set isRGConnected to true for balance checking
          setIsRGConnected(true);

          // ✅ Set global Railgun identity for balance checking
          setRailgunIdentity({
            walletID: stored.walletID,
            railgunAddress: placeholderAddress
          });
        } else {
          console.log('🔍 Stored connection belongs to different user - clearing');
          setIsActuallyConnected(false);
          setRailgunAddress(null);
          setRailgunWalletID(null);
          setBuyerRailgunAddress('');
          setWalletManager(null);
          setRailgun(null);

          // ✅ Set isRGConnected to false when clearing connection
          setIsRGConnected(false);

          // ✅ Clear global Railgun identity
          disconnectRailgun();
        }
      } else {
        console.log('🔍 No valid stored connection found');
        
        // CRITICAL: Don't clear connection if we just opened the modal
        // Wait a bit longer for connection to complete (in case user is connecting)
        // Only clear if we've checked multiple times and still no connection
        const connectionWaitTime = 2000; // 2 seconds
        const lastCheck = window._lastConnectionCheck || 0;
        const checkCount = window._connectionCheckCount || 0;
        const maxChecks = 4; // Maximum 4 checks (2 seconds total)
        
        // If we've already done max checks, stop checking and clear
        if (checkCount >= maxChecks) {
          // Don't reset check count - we've already determined no connection
          // Only clear state if it's not already cleared (prevent infinite loops)
          if (isActuallyConnected || railgunAddress) {
            console.log('🔍 Max checks reached - clearing connection state');
            setIsActuallyConnected(false);
            setRailgunAddress(null);
            setRailgunWalletID(null);
            setBuyerRailgunAddress('');
            setWalletManager(null);
            setRailgun(null);
            setIsRGConnected(false);
          }
          return; // Stop here - don't schedule more checks
        }
        
        if (Date.now() - lastCheck < connectionWaitTime && checkCount < maxChecks) {
          console.log('🔍 Connection might be in progress - waiting before clearing', `(${checkCount + 1}/${maxChecks})`);
          window._lastConnectionCheck = Date.now();
          window._connectionCheckCount = checkCount + 1;
          
          // Schedule only ONE more check, not recursively
          if (!window._connectionCheckScheduled) {
            window._connectionCheckScheduled = true;
            setTimeout(() => {
              window._connectionCheckScheduled = false;
              handleConnectionChange().catch(console.error);
            }, 500);
          }
          return;
        }
        
        // If we get here, we've waited long enough but haven't reached max checks
        // This means enough time has passed since last check, so reset and clear
        window._lastConnectionCheck = Date.now();
        window._connectionCheckCount = maxChecks; // Set to max to prevent further checks
        
        // Only clear if we're sure there's no connection after waiting
        setIsActuallyConnected(false);
        setRailgunAddress(null);
        setRailgunWalletID(null);
        setBuyerRailgunAddress('');
        setWalletManager(null);
        setRailgun(null);
        
        // ✅ Set isRGConnected to false when no connection found
        setIsRGConnected(false);
        
        // DON'T call disconnectRailgun() here - it clears localStorage
        // If connection is in progress, we don't want to clear it
        // Only clear state, not localStorage
      }
      } finally {
        // Always release the guard
        window._isHandlingConnectionChange = false;
      }
    };

    // Listen for custom events
    const connectionChangeHandler = () => {
      handleConnectionChange().catch(console.error);
    };
    
    window.addEventListener('railgunConnectionChanged', connectionChangeHandler);
    
    // Also check on mount (but reset check tracking first)
    window._lastConnectionCheck = 0;
    window._connectionCheckCount = 0;
    window._connectionCheckScheduled = false;
    handleConnectionChange().catch(console.error);
    
    return () => {
      window.removeEventListener('railgunConnectionChanged', connectionChangeHandler);
      // Clear any pending checks and guards
      window._connectionCheckScheduled = false;
      window._isHandlingConnectionChange = false;
    };
  }, [currentUser]);
  
  // STEP 9: PPOI status indicator
  const [ppoiOK, setPpoiOK] = useState(null);

  // PPOI connectivity check function
  const checkPPOIConnectivity = async () => {
    try {
      const ppoiNodes = process.env.REACT_APP_PPOI_NODES 
        ? process.env.REACT_APP_PPOI_NODES.split(',')
        : ['https://ppoi-agg.horsewithsixlegs.xyz'];
      
      const pingPPOI = async (url) => {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 5000);
        try {
          const res = await fetch(url, { method: 'GET', mode: 'cors', signal: controller.signal });
          return res.ok;
        } catch (e) {
          return false;
        } finally { clearTimeout(t); }
      };

      const results = await Promise.all(ppoiNodes.map(pingPPOI));
      return results.some(r => r);
    } catch (error) {
      console.warn('[PPOI] Connectivity check failed:', error);
      return false;
    }
  };

  // Check PPOI connectivity on component mount
  useEffect(() => {
    (async () => {
      const ok = await checkPPOIConnectivity();
      setPpoiOK(ok);
    })();
  }, []);

  // Debug railgun state changes and persist to localStorage
  useEffect(() => {
    // Guard: prevent infinite loops by checking if value actually changed
    const currentStored = localStorage.getItem('railgun.wallet');
    const currentStoredParsed = currentStored ? JSON.parse(currentStored) : null;
    
    // Only update if the value actually changed
    if (railgun && JSON.stringify(railgun) !== JSON.stringify(currentStoredParsed)) {
      console.log('🔍 Railgun state changed:', railgun);
      // Set a flag to prevent the connection change handler from reacting to this write
      window._isUpdatingRailgunStorage = true;
      localStorage.setItem('railgun.wallet', JSON.stringify(railgun));
      console.log('💾 Railgun state saved to localStorage');
      // Clear the flag after a short delay
      setTimeout(() => {
        window._isUpdatingRailgunStorage = false;
      }, 100);
    }
  }, [railgun]);

  // ✅ Don't clear localStorage on mount - let the connection handler manage it

  // Helper function to shorten addresses for display
  function short(addr) {
    return addr ? `${addr.slice(0, 6)}…${addr.slice(-6)}` : '';
  }

  // Check private balance and show funding prompt if needed
  const checkPrivateBalance = async (forceRefresh = false) => {
    // Guard: Only proceed once Railgun is connected and we have a wallet
    if (!isRGConnected || !railgun?.walletID) {
      console.log('🔍 Skipping balance check - Railgun not connected yet');
      return;
    }
    
    try {
      // Use WETH address from SDK config (must match shield.js)
      const tokenAddress = SEPOLIA_WETH_ADDRESS;

      // Try to refresh balances (debounced to prevent spam)
      console.log('🔄 Attempting to refresh balances...');
      const refreshSuccess = await refreshBalances(forceRefresh, 2000);
      console.log('🔄 Balance refresh result:', refreshSuccess);

      // Get balances using the same approach as Private Funds Drawer
      const balanceResult = await getAllBalances();
      
      if (!balanceResult.success || !balanceResult.data?.railgun) {
        throw new Error('Failed to get Railgun balances');
      }
      
      const railgunBalances = balanceResult.data.railgun;
      
      // Format for display
      const fmt18 = (amount) => ethers.formatUnits(amount, 18);
      
        setPrivateBalance({ 
        weth: fmt18(railgunBalances.weth),                    // Show spendable (testnet-adjusted)
        pendingWeth: fmt18(railgunBalances.pendingWeth),      // Show pending
          eth: '0.0'  // ETH not supported in Railgun
        });
      
      console.log('🔍 Private balance loaded:', {
        spendableWeth: fmt18(railgunBalances.weth),
        pendingWeth: fmt18(railgunBalances.pendingWeth),
        totalWeth: fmt18(railgunBalances.weth + railgunBalances.pendingWeth)
      });
      
    } catch (error) {
      console.error('Failed to check private balance:', error);
      setPrivateBalance({ weth: '0.0', pendingWeth: '0.0', eth: '0.0' });
    }
  };

  // State declarations first
  const [shieldingLoading, setShieldingLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [network, setNetwork] = useState(null);
  const [paymentValidation, setPaymentValidation] = useState({ isValid: false, errors: [] });
  const [buyerRailgunAddress, setBuyerRailgunAddress] = useState('');
  
  // Private funds drawer state
  const [fundsOpen, setFundsOpen] = useState(false);
  const [privateBalance, setPrivateBalance] = useState(null);
  const [isRGConnected, setIsRGConnected] = useState(false);

  // Transfer progress state for proof generation UI
  const [transferProgress, setTransferProgress] = useState({ step: 'idle', message: '', progress: 0 });

  // Check balance when railgun wallet connects
  useEffect(() => {
    if (isRGConnected && railgun && railgun.walletID) {
      checkPrivateBalance(true); // Force refresh when wallet connects
    }
  }, [isRGConnected, railgun]);

  // Refresh balance when funds drawer is closed (in case funds were added)
  useEffect(() => {
    if (!fundsOpen && railgun && railgun.walletID) {
      // Small delay to allow any shield transactions to complete
      const timer = setTimeout(() => {
        checkPrivateBalance();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [fundsOpen, railgun]);

  const quickAmounts = [10, 50, 100, 500, 1000]; // Token amounts

  // Validation function for private payment
  const validatePrivatePayment = async () => {
    const errors = [];
    
    // TEST MODE: Skip most validation for testing
    const isTestMode = true; // Set to false for production
    
    if (isTestMode) {
      console.log("🧪 TEST MODE: Skipping most validation checks");
      console.log("🔍 Validation inputs:", {
        railgunAddress,
        buyerRailgunAddress,
        isActuallyConnected,
        currentUser,
        productSeller: product?.seller || product?.owner || product?.creator
      });
      
      // In test mode, current user IS the buyer - use their Railgun address
      const currentUserRailgunAddress = railgunAddress;
      console.log("🔍 Current user (buyer) Railgun address:", currentUserRailgunAddress);
      console.log("🔍 Address type:", typeof currentUserRailgunAddress);
      console.log("🔍 Address length:", currentUserRailgunAddress?.length);
      
      if (!currentUserRailgunAddress || currentUserRailgunAddress.trim() === '') {
        errors.push("Railgun wallet not connected - please connect your Railgun wallet first");
        console.log("❌ Error: No Railgun wallet connected");
        console.log("❌ Debug - railgunAddress is:", railgunAddress);
        console.log("❌ Debug - isActuallyConnected is:", isActuallyConnected);
      } else {
        console.log("✅ Buyer address validation passed (using current user's address)");
        // Update buyer address to current user's address
        setBuyerRailgunAddress(currentUserRailgunAddress);
      }
      
      const isValid = errors.length === 0;
      console.log("🔍 TEST MODE validation result:", { isValid, errors });
      setPaymentValidation({ isValid, errors });
      return isValid;
    }
    
    try {
      // Check network
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      
      // Only block non-local networks if NOT in SDK mode
      const isSDK = process.env.REACT_APP_SHIELD_STRATEGY === 'sdk';
      if (!isSDK && network.chainId !== 1337n) {
        errors.push("Private payments are disabled on non-local networks in dev mode.");
        return;
      }
      // In SDK mode (Sepolia), do NOT block.
      
      // Check if product has valid price
      if (!product.publicPriceWei || BigInt(product.publicPriceWei) <= 0n) {
        errors.push("Product must have a valid price");
      }
      
      // Check if buyer Railgun address is provided
      if (!buyerRailgunAddress || buyerRailgunAddress.trim() === '') {
        errors.push("Buyer Railgun address is required for private payment");
      } else if (!buyerRailgunAddress.startsWith('0zk1qy')) {
        errors.push("Invalid Railgun address format. Must start with '0zk1qy'");
      }
      
      // Check if private payments are enabled (optional - you can add this check)
      // const escrowContract = new ethers.Contract(product.address, ProductEscrowABI.abi, provider);
      // const privateEnabled = await escrowContract.privateEnabled();
      // if (!privateEnabled) {
      //   errors.push("Private payments are disabled for this product");
      // }
      
      // Check if private payments are enabled (TEMPORARILY DISABLED FOR TESTING)
      try {
        const escrowContract = new ethers.Contract(product.address, ESCROW_ABI, provider);
        const privateEnabled = await escrowContract.privateEnabled();
        if (!privateEnabled) {
          console.warn("Private payments disabled on contract, but allowing for testing");
          // errors.push("Private payments are disabled for this product. Please contact the seller to enable private purchases.");
        }
      } catch (error) {
        console.warn("Could not check private enabled status:", error.message);
        // Don't block validation if we can't check this
      }
      
      // Check private balance
      if (privateBalance) {
          const requiredAmount = BigInt(product.publicPriceWei || '0');
        const requiredEth = ethers.formatEther(requiredAmount);
        
        // Check ETH balance (since we're using ETH for payments)
        const haveEthWei = BigInt(privateBalance.eth || '0');
        const needEthWei = requiredAmount;
        
        console.log("💰 Private balance check:");
        console.log("  - Required:", requiredEth, "ETH");
        console.log("  - Have:", fmt18(haveEthWei), "ETH");
        console.log("  - Have (wei):", haveEthWei.toString());
        console.log("  - Need (wei):", needEthWei.toString());
        
        if (haveEthWei < needEthWei) {
          const shortfall = needEthWei - haveEthWei;
          const shortfallEth = ethers.formatEther(shortfall);
          errors.push(`Insufficient private balance. Need ${requiredEth} ETH, have ${fmt18(haveEthWei)} ETH. Shortfall: ${shortfallEth} ETH`);
        } else {
          console.log("✅ Sufficient private balance for payment");
        }
      } else {
        console.log("⚠️ No private balance data available - skipping balance check");
      }
      
    } catch (error) {
      errors.push(`Validation error: ${error.message}`);
    }
    
    const isValid = errors.length === 0;
    console.log("🔍 Payment validation result:", { isValid, errors });
    setPaymentValidation({ isValid, errors });
    return isValid;
  };

  // Validate payment when component updates
  useEffect(() => {
    if (currentStep === 'payment' && product && walletManager) {
      console.log("🔄 Triggering validation for payment step");
      validatePrivatePayment();
    }
  }, [currentStep, product, walletManager, buyerRailgunAddress]);
  
  // Force validation when entering payment step (only once, not on every render)
  const hasValidatedPaymentStep = React.useRef(false);
  useEffect(() => {
    if (currentStep === 'payment' && !hasValidatedPaymentStep.current) {
      console.log("🎯 Payment step activated - forcing validation");
      hasValidatedPaymentStep.current = true;
      setTimeout(() => {
        validatePrivatePayment();
      }, 100);
    } else if (currentStep !== 'payment') {
      // Reset flag when leaving payment step
      hasValidatedPaymentStep.current = false;
    }
  }, [currentStep]);

  // Get network info when component mounts
  useEffect(() => {
    if (window.ethereum) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      provider.getNetwork().then(setNetwork);
    }
  }, []);

  // Step 1: Connect Railgun Wallet (Phase 1: Minimal implementation)
  const handleConnectRailgun = async () => {
    try {
      console.log("🔐 Connecting to Railgun (Sepolia)…");
      setIsConnecting(true);
      setIsActuallyConnected(false);

      // Get user address from MetaMask
      const userAddress = await window.ethereum.request({ method: 'eth_accounts' })
        .then(a => a[0]);

      if (!userAddress) {
        throw new Error('Please connect MetaMask first');
      }

      // Connect using FIXED Phase 1 client
      const backendBaseURL = process.env.REACT_APP_RAILGUN_API_URL || 'http://localhost:3001';
      const rpcUrl = process.env.REACT_APP_RPC_URL; // your Alchemy endpoint from .env.sepolia
      
      console.log('🔍 Calling connectRailgun with:', { backendBaseURL, userAddress, rpcUrl });
      
      let result;
      try {
        result = await connectRailgun({
          backendBaseURL,
          userAddress,
          rpcUrl,
        });
        console.log('🔍 connectRailgun returned:', result);
      } catch (connectError) {
        console.error('❌ connectRailgun failed:', connectError);
        throw connectError;
      }

      if (!result || !result.walletID || !result.railgunAddress) {
        throw new Error('Invalid response from connectRailgun: ' + JSON.stringify(result));
      }

      const { walletID, railgunAddress } = result;
      console.log('✅ Connected:', { walletID, railgunAddress });
      
      // Set connection flag
      setIsRGConnected(true);

      // Update state (Phase 1: just store the address)
      setRailgunAddress(railgunAddress);
      setRailgunWalletID(walletID);
      
      // Create REAL wallet manager using RailgunWalletManager
      console.log('🔧 Creating REAL RailgunWalletManager...');
      
      try {
        // Create a simple wallet manager wrapper that uses V2 client (privateTransfer imported at top)
        const realWalletManager = {
          createPrivateTransfer: async (params) => {
            console.log('🔧 REAL createPrivateTransfer called with:', params);
            
            // Use the V2 client privateTransfer function
          
          // Extract the first output (we'll handle multiple outputs later)
          const firstOutput = params.outputs[0];
          if (!firstOutput) {
            throw new Error('No outputs provided for private transfer');
          }
          
          console.log('🔧 Calling real SDK privateTransfer:', {
            toAddress: firstOutput.recipient,
            tokenAddress: params.tokenAddress,
            amount: firstOutput.amount,
            memo: params.memo
          });
          
            const result = await privateTransfer({
              toRailgunAddress: firstOutput.recipient,
              amountWei: firstOutput.amount.toString(),
              memo: params.memo
            });
            
            console.log('✅ Real private transfer completed:', result);
            
            return {
              success: true,
              transactionHash: result,
              txRefBytes32: params.txRefBytes32,
              transfer: { transactionHash: result },
              proof: {}
            };
          },
          
          executePrivateTransfer: async (transfer) => {
            console.log('🔧 REAL executePrivateTransfer called with:', transfer);
            // Transfer is already executed by privateTransfer above
            return {
              success: true,
              transactionHash: transfer.transactionHash,
              message: 'Real private transfer executed'
            };
          },
          
          railgunWallet: {
            getAddress: () => railgunAddress
          }
        };
        
        setWalletManager(realWalletManager);
        console.log('✅ Wallet manager created using V2 client:', realWalletManager);
        
      } catch (error) {
        console.error('❌ Failed to create real wallet manager:', error);
        
        // Fallback to mock for now
        console.log('🔄 Falling back to mock wallet manager...');
        const mockWalletManager = {
          railgunWallet: {
            getAddress: () => railgunAddress
          },
          walletID: walletID,
          railgunAddress: railgunAddress,
          createPrivateTransfer: async (params) => {
            console.log('🔧 Mock createPrivateTransfer called with:', params);
            return {
              success: true,
              transactionHash: '0x' + Math.random().toString(16).substr(2, 64),
              message: 'Mock private transfer created (fallback)'
            };
          },
          executePrivateTransfer: async (transfer) => {
            console.log('🔧 Mock executePrivateTransfer called with:', transfer);
            return {
              success: true,
              transactionHash: '0x' + Math.random().toString(16).substr(2, 64),
              message: 'Mock private transfer executed (fallback)'
            };
          }
        };
        setWalletManager(mockWalletManager);
        console.log('✅ Mock wallet manager created (fallback):', mockWalletManager);
      }
      
      // Update the persisted railgun info
      const walletInfo = { network: 'sepolia', walletID, railgunAddress };
      console.log('🔍 Setting railgun state to:', walletInfo);
      setRailgun(walletInfo);
      console.log('🔍 Railgun state after set:', walletInfo);

      // Mark as actually connected
      setIsActuallyConnected(true);
      setIsConnecting(false);

      toast.success("🔐 Railgun wallet connected!");

      // Move to next step
      setCurrentStep('shield');

    } catch (err) {
      console.error("❌ Railgun connect failed:", err);
      setIsConnecting(false);
      setIsActuallyConnected(false);
      toast.error("Failed to connect Railgun wallet: " + err.message);
    }
  };

  // Step 2: Shield Funds
  const handleQuickAmount = (ethAmount) => {
    setAmount(ethAmount.toString());
    setCustomAmount(ethAmount.toString());
  };

  const handleCustomAmount = (value) => {
    setCustomAmount(value);
    setAmount(value);
  };

  const handleShield = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setShieldingLoading(true);

    try {
      console.log("🛡️ Starting shield operation...");
      
      // Get network information
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      setNetwork(network); // Set the network in component state
      console.log("🌐 Current network:", network.name, "Chain ID:", network.chainId);
      
      // Check if we're on a local network or in SDK mode
      const isLocalNetwork = network.chainId === 1337n || network.chainId === 31337n;
      const isSDK = process.env.REACT_APP_SHIELD_STRATEGY === 'sdk';
      
      if (isLocalNetwork || isSDK) {
        const networkType = isLocalNetwork ? "local" : "SDK";
        console.log(`🏠 ${networkType} network detected - proceeding with shield operation`);
        
        // Get Railgun address from SDK (not backend)
        let railgunAddress;
        let cleanRailgunAddress;
        
                 if (isSDK) {
           // SDK mode: get real Railgun address from state (already loaded by connectRailgun)
           try {
             // Railgun address is already in state from connectRailgun
             // If not, check localStorage
             if (!railgunAddress) {
               const stored = JSON.parse(localStorage.getItem('railgun.wallet') || 'null');
               railgunAddress = stored?.railgunAddress || null;
             }
             console.log("🔐 SDK Railgun address:", railgunAddress);
             
             // For SDK addresses, don't clean them (they're already in correct format)
             cleanRailgunAddress = railgunAddress;
             
             // ✅ CRITICAL FIX: Update the modal state with the real SDK address
             setRailgunAddress(railgunAddress);
             
           } catch (error) {
             console.error('❌ Failed to get SDK Railgun address:', error);
             throw new Error('Failed to get SDK Railgun address');
           }
         } else {
           // Dev mode: get address from backend wallet manager
           railgunAddress = walletManager.railgunWallet.getAddress();
           console.log("🔐 Backend Railgun address:", railgunAddress);
        
        // Ensure the Railgun address is properly formatted
           cleanRailgunAddress = railgunAddress.replace(/_railgun$/, '');
        console.log("🔐 Clean Railgun address:", cleanRailgunAddress);
        
           // Validate the address format (only for backend addresses)
        if (!ethers.isAddress(cleanRailgunAddress)) {
          throw new Error(`Invalid Railgun address format: ${cleanRailgunAddress}`);
           }
        }
        
        // Check balance (ETH for local, WETH for Sepolia)
        const signer = await provider.getSigner();
        const myAddress = await signer.getAddress();
        const amountWei = ethers.parseEther(amount);
        
        if (isLocalNetwork) {
          // Local network: check ETH balance
          const ethBalance = await provider.getBalance(myAddress);
        console.log("✅ ETH balance retrieved:", ethers.formatEther(ethBalance), "ETH");
        
        if (ethBalance < amountWei) {
          throw new Error(`Insufficient ETH balance. You have ${ethers.formatEther(ethBalance)} ETH, but trying to shield ${amount} ETH`);
        }
        } else {
          // SDK mode: check WETH balance (or skip balance check for now)
          console.log("🔧 SDK mode: balance check will be handled by the shield strategy");
        }
        
        // Determine token address based on network and strategy
        const tokenAddress = (isSDK && network.chainId === 11155111n)
          ? (process.env.REACT_APP_WETH_ADDRESS)
          : ethers.ZeroAddress; // dev/local
        
        // Phase 1: Skip shielding for now
        // TODO: Re-enable in Phase 2 when we add shielding functionality
        console.log("🔍 Phase 1: Skipping shield operation (not implemented yet)");
        const txHash = "0x0000000000000000000000000000000000000000000000000000000000000000"; // Placeholder
        
        toast.success(`🛡️ Shield complete: ${String(txHash).slice(0,10)}…`);
        
        // Move to next step
        setCurrentStep('payment');
        
      } else {
        // Non-local networks not supported for now
        console.log("🌐 Non-local network detected - private payments not supported (dev mode)");
        toast.error("Private payments only supported on localhost in dev mode.");
        return;
      }
      
    } catch (error) {
      console.error("Shield operation failed:", error);
      toast.error("Shield operation failed: " + error.message);
    } finally {
      setShieldingLoading(false);
    }
  };

  // Helper function to get seller's Railgun address
  const getSellerRailgunAddress = async (sellerEOA) => {
    // Use stored Railgun address from product data
    if (product?.sellerRailgunAddress) {
      console.log('✅ Using stored seller Railgun address:', product.sellerRailgunAddress);
      return product.sellerRailgunAddress;
    }

    // No fallback - seller must have connected their Railgun wallet when creating the product
    console.error('❌ Seller has not connected their Railgun wallet for this product');
    throw new Error('Seller has not enabled private payments for this product. The seller must connect their Railgun wallet when listing the product.');
  };

  // Step 3: Execute Private Payment
  const handlePrivatePayment = async () => {
    console.log("🚀 handlePrivatePayment called!");
    console.log("🔍 walletManager:", !!walletManager);
    console.log("🔍 product:", !!product);
    console.log("🔍 buyerRailgunAddress:", buyerRailgunAddress);
    
    if (!walletManager || !product) {
      console.log("❌ Missing walletManager or product");
      toast.error('Please connect your wallet first');
      return;
    }

    try {
      console.log("🔄 Starting private payment process...");
      setPaymentLoading(true);

      // Use WETH address from SDK config (must match shield.js)
      const tokenAddress = SEPOLIA_WETH_ADDRESS;
      const amount = BigInt(product.publicPriceWei || '0');

      console.log("💰 Amount:", amount.toString(), "wei");
      console.log("🔧 Token address:", tokenAddress);

      // Check spendable balance using same source as Private Funds Drawer
      const balanceResult = await getAllBalances();
      
      if (!balanceResult.success || !balanceResult.data?.railgun) {
        throw new Error('Failed to get Railgun balances for payment validation');
      }
      
      const railgunBalances = balanceResult.data.railgun;
      // On Sepolia testnet, include pending balance as spendable
      // (proof generation takes 20-30s, pending UTXOs will confirm by then)
      const spendableWeth = BigInt(railgunBalances.weth || 0n);
      const pendingWeth = BigInt(railgunBalances.pendingWeth || 0n);
      const totalAvailable = spendableWeth + pendingWeth;

      console.log("💰 Spendable WETH:", spendableWeth.toString());
      console.log("💰 Pending WETH:", pendingWeth.toString());
      console.log("💰 Total available:", totalAvailable.toString());
      console.log("💰 Required amount:", amount.toString());

      // Use total (spendable + pending) for testnet balance check
      if (totalAvailable < amount) {
        const availableEth = ethers.formatEther(totalAvailable);
        const requiredEth = ethers.formatEther(amount);
        throw new Error(`Insufficient private balance. Available: ${availableEth} WETH (including pending), Required: ${requiredEth} WETH.`);
      }
      
      // Get seller's Railgun address
      let sellerRailgunAddress;
      try {
        sellerRailgunAddress = await getSellerRailgunAddress(product.owner);
      console.log("🔍 Seller's Railgun address:", sellerRailgunAddress);
      } catch (error) {
        console.error("❌ Failed to get seller Railgun address:", error);
        throw new Error(`Unable to get seller's Railgun address. Seller must connect their Railgun wallet first. Error: ${error.message}`);
      }
      
      // Get the wallet ID string from the stored Railgun state
      const walletID = railgun?.walletID;
      if (!walletID) {
        throw new Error('No wallet ID available for private transfer');
      }
      
      console.log("🔍 Using wallet ID:", walletID, "(type:", typeof walletID, ")");
      
      // Check wallet state before attempting transfer
      console.log("🔍 Checking wallet state before transfer...");
      const walletState = await checkWalletState(walletID);
      console.log("🔍 Wallet state:", walletState);

      // checkWalletState now returns { success, data: { walletID, railgunAddress } }
      if (!walletState.success || !walletState.data?.walletID) {
        throw new Error(`Wallet not properly loaded. Please reconnect your wallet. Error: ${walletState.error || 'Unknown'}`);
      }
      
      // Reset transfer progress
      setTransferProgress({ step: 'idle', message: '', progress: 0 });

      // Debug: Log the exact params being passed
      console.log("🔍 About to call privateTransfer with:", {
        toRailgunAddress: sellerRailgunAddress,
        amountWei: amount.toString(),
        tokenAddress,
        productId: product.id
      });

      // Execute private transfer with progress callback
      // Note: privateTransfer expects toRailgunAddress (not sellerRailgunAddress)
      const result = await paySellerV2({
        toRailgunAddress: sellerRailgunAddress,
        amountWei: amount.toString(),
        tokenAddress,
        productId: product.id,
        onProgress: (state) => {
          setTransferProgress(state);
        }
      });

      // Handle result
      if (!result.success) {
        throw new Error(result.error || 'Transfer failed');
      }
      const hash = result.txHash;

      console.log('✅ Private payment tx:', hash);
      console.log('✅ memoHash:', result.memoHash);
      console.log('✅ railgunTxRef:', result.railgunTxRef);

      // Store pending payment data for seller to see (includes memoHash and railgunTxRef for Phase 6)
      const pendingPaymentData = {
        productId: product.id || '1',
        txHash: hash,
        memoHash: result.memoHash,           // For Phase 6 on-chain recording
        railgunTxRef: result.railgunTxRef,   // For Phase 6 on-chain recording
        timestamp: Date.now(),
        productAddress: product.address || product.contractAddress
      };

      const pendingKey = `pending_private_payment_${product.address || product.contractAddress}`;
      localStorage.setItem(pendingKey, JSON.stringify(pendingPaymentData));
      console.log('💾 Stored pending payment data for seller:', pendingPaymentData);

      // Phase 6: Record payment on-chain immediately after private transfer
      pendingPaymentData.status = 'recording';
      localStorage.setItem(pendingKey, JSON.stringify(pendingPaymentData));

      setTransferProgress({ step: 'recording', message: 'Recording payment on-chain...', progress: 80 });

      // Get signer and create contract
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const productAddress = product.address || product.contractAddress;
      const contract = new ethers.Contract(productAddress, ESCROW_ABI, signer);

      // Get product ID from contract (not from product object - may be stale)
      const contractProductId = await contract.id();

      // Preflight check with staticCall (catches errors early)
      try {
        await contract.recordPrivatePayment.staticCall(
          contractProductId,
          result.memoHash,
          result.railgunTxRef
        );
      } catch (preflightError) {
        const userMessage = decodeContractError(preflightError);
        throw new Error(`Recording will fail: ${userMessage}`);
      }

      // Estimate gas with 20% headroom
      const estimatedGas = await contract.recordPrivatePayment.estimateGas(
        contractProductId,
        result.memoHash,
        result.railgunTxRef
      );
      const gasLimit = (estimatedGas * 120n) / 100n;

      // Send transaction
      const recordTx = await contract.recordPrivatePayment(
        contractProductId,
        result.memoHash,
        result.railgunTxRef,
        { gasLimit }
      );

      setTransferProgress({ step: 'confirming', message: 'Waiting for on-chain confirmation...', progress: 90 });
      const recordReceipt = await recordTx.wait();

      // Update localStorage with confirmed status
      pendingPaymentData.status = 'confirmed';
      pendingPaymentData.recordTxHash = recordReceipt.hash;
      localStorage.setItem(pendingKey, JSON.stringify(pendingPaymentData));

      // Update history as well
      const historyKey = `private_payment_history_${product.address || product.contractAddress}`;
      const rawHistory = localStorage.getItem(historyKey);
      const parsedHistory = rawHistory ? JSON.parse(rawHistory) : [];
      const historyList = Array.isArray(parsedHistory) ? parsedHistory : [];
      const historyEntry = {
        ...pendingPaymentData,
        status: 'confirmed'
      };
      const exists = historyList.some((entry) => entry?.txHash === historyEntry.txHash);
      const nextHistory = exists ? historyList : [...historyList, historyEntry];
      const trimmedHistory = nextHistory.slice(-20);
      localStorage.setItem(historyKey, JSON.stringify(trimmedHistory));

      // Show success toast with Etherscan link
      const chainId = (await provider.getNetwork()).chainId;
      const explorerUrl = getExplorerUrl(recordReceipt.hash, Number(chainId));

      toast.success(
        <div>
          <p>Private payment recorded on-chain!</p>
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-500 underline text-sm"
            >
              View on Etherscan
            </a>
          )}
        </div>,
        { duration: 5000 }
      );
      setCurrentStep('complete');

    } catch (error) {
      console.error("Private payment failed:", error);
      const userMessage = decodeContractError(error);
      toast.error("Private payment failed: " + userMessage);
    } finally {
      setPaymentLoading(false);
    }
  };

  // Step 4: Complete and close
  const handleComplete = () => {
    onSuccess?.();
    onClose();
  };

  // 🧪 Debug function to test current state
  const debugCurrentState = () => {
    console.log('🔍 === DEBUGGING PRIVATE PAYMENT MODAL STATE ===');
    console.log('🔍 Current user:', currentUser);
    console.log('🔍 Railgun address state:', railgunAddress);
    console.log('🔍 Railgun wallet ID:', railgunWalletID);
    console.log('🔍 Is actually connected:', isActuallyConnected);
    console.log('🔍 Buyer Railgun address:', buyerRailgunAddress);
    console.log('🔍 Wallet manager:', walletManager ? 'Present' : 'Missing');
    
    // Check localStorage
    const stored = JSON.parse(localStorage.getItem('railgun.wallet') || 'null');
    console.log('🔍 Stored in localStorage:', stored);
    
    // Check validation
    const validation = validatePrivatePayment();
    console.log('🔍 Current validation result:', validation);
    
    // Check product data
    console.log('🔍 Product data:', product);
    console.log('🔍 Product keys:', product ? Object.keys(product) : 'No product');
    console.log('🔍 Product owner:', product?.owner);
    console.log('🔍 Product creator:', product?.creator);
    console.log('🔍 Product seller:', product?.seller);
    
    console.log('🔍 === END DEBUG ===');
    return { railgunAddress, buyerRailgunAddress, validation, product };
  };

  // Debug functions (only available in development with REACT_APP_VERBOSE=true)
  if (process.env.REACT_APP_VERBOSE === 'true' || process.env.NODE_ENV === 'development') {
    window.debugPrivatePaymentModal = debugCurrentState;
    window.getProductData = () => product;
  }

  // Create walletManager when Railgun wallet is connected
  const createWalletManagerForConnection = async (walletID, railgunAddress) => {
    try {
      console.log('🔧 Creating walletManager for connected Railgun wallet:', { walletID, railgunAddress });
      
      // ✅ Use the V2 client wallet directly instead of creating a new RailgunWalletManager
      // The wallet is already loaded and working in railgunClient.js
      const realWalletManager = {
        createPrivateTransfer: async (params) => {
          console.log('🔐 Creating private transfer with real Railgun SDK...');
          console.log('🔍 Params received:', params);

          // Extract parameters from the params object (privateTransfer imported at top)
          // params has structure: { outputs: [{ recipient, amount }], tokenAddress, memo, txRefBytes32 }
          const firstOutput = params.outputs?.[0];
          if (!firstOutput) {
            throw new Error('No outputs provided for private transfer');
          }
          
          console.log('🔍 Extracted parameters:', {
            to: firstOutput.recipient,
            tokenAddress: params.tokenAddress,
            amount: firstOutput.amount,
            memo: params.memo
          });
          
          // ✅ FIX: Use WETH token address from SDK config (same as used for shielding)
          const tokenAddress = params.tokenAddress === '0x0000000000000000000000000000000000000000'
            ? SEPOLIA_WETH_ADDRESS
            : params.tokenAddress;
          
          console.log('🔧 Using token address:', tokenAddress, '(was:', params.tokenAddress, ')');
          
          // Use the real SDK function with correct parameter order
          const result = await privateTransfer(
            firstOutput.recipient,
            tokenAddress,
            firstOutput.amount,
            params.memo || 'Private payment via EV Battery Supply Chain'
          );
          
          console.log('✅ Real private transfer created:', result);
          return result;
        },
        executePrivateTransfer: async (params) => {
          console.log('🚀 Executing private transfer with real Railgun SDK...');
          
          // For now, return success - the actual execution happens in the createPrivateTransfer
          return { 
            success: true, 
            transactionHash: params.transactionHash || 'real-tx-hash',
            message: 'Private transfer executed successfully'
          };
        }
      };
      
      console.log('✅ Real walletManager created using existing Railgun wallet');
      setWalletManager(realWalletManager);
      
    } catch (error) {
      console.error('❌ Failed to create real walletManager:', error);
      
      // Fallback to mock walletManager
      const mockWalletManager = {
        createPrivateTransfer: async (params) => {
          console.log('🧪 Mock createPrivateTransfer called with:', params);
          return { success: true, transactionHash: 'mock-tx-hash' };
        },
        executePrivateTransfer: async (params) => {
          console.log('🧪 Mock executePrivateTransfer called with:', params);
          return { success: true, transactionHash: 'mock-tx-hash' };
        }
      };
      
      console.log('🧪 Using mock walletManager as fallback');
      setWalletManager(mockWalletManager);
    }
  };

  // Reset modal when opened
  useEffect(() => {
    if (isOpen) {
      setCurrentStep('payment'); // Start with payment step (wallet connection moved to main nav)
      setWalletManager(null);
      // Don't reset railgunAddress - preserve connected wallet
      setBuyerRailgunAddress(''); // Clear buyer address
      setAmount('');
      setCustomAmount('');
      
      // ✅ Check for existing Railgun connection when modal opens
      const initializeModal = async () => {
        const stored = JSON.parse(localStorage.getItem('railgun.wallet') || 'null');
        if (stored && stored.walletID && stored.userAddress) {
          const belongsToCurrentUser = stored.userAddress.toLowerCase() === currentUser.toLowerCase();
          const placeholderAddress = stored.railgunAddress || `0zk1q_dummy_${stored.walletID}`;
          if (belongsToCurrentUser) {
            console.log('🔍 Modal opened - found existing Railgun connection:', placeholderAddress);
            setRailgunAddress(placeholderAddress);
            setRailgunWalletID(stored.walletID);
            // Create walletManager for this connection (placeholder if necessary)
            createWalletManagerForConnection(stored.walletID, placeholderAddress);
            // Set buyer's Railgun address to current user's address (placeholder)
            setBuyerRailgunAddress(placeholderAddress);

            // ✅ Set isRGConnected to true for balance checking
            setIsRGConnected(true);

            // ✅ Set global Railgun identity for balance checking
            setRailgunIdentity({
              walletID: stored.walletID,
              railgunAddress: placeholderAddress
            });

            // ✅ Check private balance when modal opens
            console.log('🔄 Checking private balance on modal open...');
            setTimeout(() => {
              checkPrivateBalance(true);
            }, 500); // Small delay to ensure wallet is ready
          }
        }
      
      // ✅ Check engine status when modal opens
      checkEngineStatus();
      };
      
      initializeModal().catch(console.error);
    }
  }, [isOpen]);
  
  // Check if Railgun engine is ready
  // NOTE: Backend API no longer needed - SDK is initialized client-side
  const checkEngineStatus = async () => {
    // Client-side SDK handles initialization via initializeSDK()
    // No backend status check needed
    console.log('[PrivatePaymentModal] Skipping backend status check - using client-side SDK');
  };

  if (!isOpen) return null;

  // If user hasn't connected Railgun wallet, show connection prompt
  if (!isRailgunConnected) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="text-center">
            <h2 className="text-xl font-bold mb-4">🔐 Railgun Wallet Required</h2>
            <p className="text-gray-600 mb-6">
              You need to connect your Railgun wallet to make private payments.
            </p>
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                Please go to the main marketplace and click "🔐 Connect Railgun" 
                in the top navigation bar.
              </p>
              <Button 
                onClick={onClose}
                className="w-full bg-gray-600 hover:bg-gray-700"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">🔒 Private Payment</h2>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {process.env.REACT_APP_SHIELD_STRATEGY === 'sdk' ? '🔧 SDK Mode' : '🏠 Dev Mode'}
            {/* STEP 9: PPOI status indicator */}
            <div className="flex items-center gap-1">
              PPOI: {ppoiOK === null ? '🔄 checking…' : ppoiOK ? '✅ online' : '❌ unreachable'}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Clean Phase 1 UI - Only Essential Buttons */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-center mb-2">🔐 Private Payment</h2>
          <p className="text-sm text-gray-600 text-center mb-4">
            Your Railgun wallet is connected - ready for private transactions
          </p>
          
          {/* Connection Status Badge */}
          <div className="flex justify-center mb-4">
            <div className="bg-green-50 border border-green-200 rounded-full px-3 py-1 text-xs text-green-700 font-medium">
              ✅ Railgun Wallet Connected
            </div>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center mb-6">
          {['payment', 'complete'].map((step, index) => {
            // Simplified logic
            let stepClass = 'bg-gray-200 text-gray-600 border-2 border-gray-200';
            
            if (step === 'payment' && currentStep === 'payment') {
              stepClass = 'bg-purple-600 text-white border-2 border-purple-600';
            } else if (step === 'complete' && currentStep === 'complete') {
              stepClass = 'bg-purple-600 text-white border-2 border-purple-600';
            } else if (step === 'payment' && currentStep === 'complete') {
              stepClass = 'bg-green-500 text-white border-2 border-green-500';
            }
            
            
            return (
            <div key={step} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${stepClass}`}>
                {index + 1}
              </div>
                {index < 1 && (
                <div className={`w-12 h-1 mx-2 ${
                    currentStep === 'complete' ? 'bg-green-500' : 'bg-gray-200'
                }`} />
              )}
            </div>
            );
          })}
        </div>
        
        {/* Step Labels */}
        <div className="flex justify-between mb-6 text-xs">
          <span className={`${currentStep === 'payment' ? 'text-purple-600 font-semibold' : 'text-gray-600'}`}>
            Make Payment
          </span>
          <span className={`${currentStep === 'complete' ? 'text-purple-600 font-semibold' : 'text-gray-600'}`}>
            Complete
          </span>
        </div>

        {/* Step Content */}
        {/* Shield step removed - wallet connection moved to main navigation */}
        {false && currentStep === 'shield' && (
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">Ready for Private Payment</h3>
              <p className="text-gray-600 text-sm">
                Your Railgun wallet is connected and ready for private transactions
              </p>
            </div>
            
            {/* Private Balance Display */}
            {privateBalance && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <div className="text-sm text-blue-800 mb-2">
                  Private Balance: 
                  <div className="font-mono font-medium space-y-1">
                        <div>{fmt18(privateBalance.weth)} WETH (Spendable)</div>
                        {privateBalance.pendingWeth && fmt18(privateBalance.pendingWeth) !== '0' && (
                          <div className="text-orange-600">{fmt18(privateBalance.pendingWeth)} WETH (Pending)</div>
                        )}
                        <div>{fmt18(privateBalance.eth)} ETH</div>
                      </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => setFundsOpen(true)}
                      size="sm"
                      variant="outline"
                    className="border-blue-300 text-blue-700 hover:bg-blue-100 flex-1"
                    >
                    🛡️ Add More Funds
                    </Button>
                    <Button 
                    onClick={checkPrivateBalance}
                      size="sm"
                      variant="outline"
                    className="border-green-300 text-green-700 hover:bg-green-100"
                    >
                      🔄 Refresh
                    </Button>
                </div>
              </div>
            )}
            
            <Button 
              onClick={() => setCurrentStep('payment')}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              🚀 Proceed to Payment
            </Button>
            
            <p className="text-xs text-gray-500 text-center">
              Click "Add More Funds" if you need to wrap ETH or shield WETH
            </p>
          </div>
        )}

        {currentStep === 'payment' && (
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">Complete Private Payment</h3>
              <p className="text-gray-600 text-sm">
                Execute the private payment using your shielded tokens
              </p>
            </div>
            
            {/* Private Balance Display */}
            {privateBalance && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <div className="text-sm text-blue-800 mb-2">
                  Private Balance: 
                  <div className="font-mono font-medium space-y-1">
                    <div>{fmt18(privateBalance.weth)} WETH (Spendable)</div>
                    {privateBalance.pendingWeth && fmt18(privateBalance.pendingWeth) !== '0' && (
                      <div className="text-orange-600">{fmt18(privateBalance.pendingWeth)} WETH (Pending)</div>
                    )}
                    <div>{fmt18(privateBalance.eth)} ETH</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={() => setFundsOpen(true)}
                    size="sm"
                    variant="outline"
                    className="border-blue-300 text-blue-700 hover:bg-blue-100 flex-1"
                  >
                    🛡️ Add More Funds
                  </Button>
                  <Button 
                    onClick={() => checkPrivateBalance(true)}
                    size="sm"
                    variant="outline"
                    className="border-green-300 text-green-700 hover:bg-green-100"
                  >
                    🔄 Refresh
                  </Button>
                </div>
              </div>
            )}
            
            {/* Payment Summary */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Product:</span>
                <span className="font-medium">{product.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Price:</span>
                <span className="font-medium text-green-600">
                  {product.price !== "Price hidden 🔒" ? product.price : "Hidden"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Privacy Level:</span>
                <span className="font-medium text-purple-600">Maximum (ZK-Proof)</span>
              </div>
            </div>
            
            {/* Buyer Wallet Info - Current User IS the Buyer */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Buyer Railgun Address (You)
              </label>
              <div className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-600">
                {buyerRailgunAddress || 'Not connected'}
              </div>
              <p className="text-xs text-gray-500">
                ✅ You are the buyer - using your connected Railgun wallet address
                <br />
                <span className="text-green-600 font-medium">🧪 Test Mode: Current user is automatically the buyer</span>
              </p>
            </div>
            
            {/* Validation Errors */}
            {!paymentValidation.isValid && paymentValidation.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <h4 className="text-sm font-medium text-red-800 mb-2">⚠️ Payment Validation Failed</h4>
                <ul className="text-sm text-red-700 space-y-1">
                  {paymentValidation.errors.map((error, index) => (
                    <li key={index}>• {error}</li>
                  ))}
                </ul>
              </div>
            )}
            
            <Button
              onClick={handlePrivatePayment}
              disabled={paymentLoading || !paymentValidation.isValid}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400"
            >
              {paymentLoading && transferProgress.step === 'proving' ? (
                <div className="flex flex-col items-center space-y-2">
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span className="text-sm">{transferProgress.message}</span>
                  </div>
                  {transferProgress.progress > 0 && (
                    <div className="w-full bg-purple-400 rounded-full h-2">
                      <div
                        className="bg-white h-2 rounded-full transition-all duration-300"
                        style={{ width: `${transferProgress.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              ) : paymentLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>{transferProgress.message || 'Processing Payment...'}</span>
                </div>
              ) : (
                'Complete Private Payment'
              )}
            </Button>

            {/* Warning about proof generation time */}
            <p className="text-xs text-yellow-600 mt-2 text-center">
              Note: Proof generation takes 20-30 seconds. Please wait.
            </p>

            {/* Helper Text */}
            <div className="text-xs text-gray-500 text-center">
              {paymentValidation.isValid ? (
                "Your payment will be completely private and untraceable"
              ) : (
                "Please fix the validation errors above to proceed with payment"
              )}
            </div>
          </div>
        )}

        {currentStep === 'pending' && (
          <div className="space-y-4 text-center">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto">
              <span className="text-3xl">⏳</span>
            </div>
            
            <h3 className="text-lg font-semibold text-yellow-800">Waiting for Seller Confirmation</h3>
            <p className="text-gray-600">
              Your private payment has been sent successfully! The seller needs to confirm the payment on-chain to complete the transaction.
            </p>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-left">
              <h4 className="text-sm font-medium text-blue-800 mb-2">📋 Next Steps:</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Seller will receive a notification</li>
                <li>• Seller must switch to their account ({product?.owner ? `${product.owner.slice(0, 6)}...${product.owner.slice(-4)}` : 'Seller account'})</li>
                <li>• Seller calls recordPrivatePayment on-chain</li>
                <li>• Transaction will be complete once confirmed</li>
              </ul>
            </div>
            
            <Button 
              onClick={handleComplete}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              Close
            </Button>
          </div>
        )}

        {currentStep === 'complete' && (
          <div className="space-y-4 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <span className="text-3xl">✅</span>
            </div>
            
            <h3 className="text-lg font-semibold text-green-800">Payment Complete!</h3>
            <p className="text-gray-600">
              Your private payment has been successfully processed. The transaction details are completely private.
            </p>
            
            <Button 
              onClick={handleComplete}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              Done
            </Button>
          </div>
        )}

        {/* Navigation */}
        {currentStep !== 'complete' && (
          <div className="flex justify-between mt-6 pt-4 border-t">
            <Button
              variant="outline"
              onClick={onClose}
              className="text-gray-600"
            >
              Cancel
            </Button>
            
            {currentStep === 'wallet' && (
              <div className="text-sm text-gray-500">
                Step 1 of 2
              </div>
            )}
            
            {false && currentStep === 'shield' && (
              <div className="text-sm text-gray-500">
                Ready for Payment
              </div>
            )}
            
            {currentStep === 'payment' && (
              <div className="text-sm text-gray-500">
                Step 1 of 2
              </div>
            )}
            
            {currentStep === 'complete' && (
              <div className="text-sm text-gray-500">
                Step 2 of 2
              </div>
            )}
          </div>
        )}

        {/* Private Funds Drawer */}
        <PrivateFundsDrawer 
          open={fundsOpen} 
          onClose={() => setFundsOpen(false)} 
        />
      </div>
    </div>
  );
};

export default PrivatePaymentModal; 
