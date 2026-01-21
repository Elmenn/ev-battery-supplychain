/**
 * Railgun Clean - Consolidated Public API
 *
 * This is the single entry point for all Railgun functionality.
 * Components should ONLY import from this file, never from internal modules.
 *
 * COMPLETE API REFERENCE:
 *
 * Connection:
 *   - connectRailgun(options)        - Connect wallet (options: { userAddress, backendBaseURL, rpcUrl })
 *   - disconnectRailgun()            - Clear wallet connection
 *   - restoreRailgunConnection(addr) - Restore connection from localStorage
 *   - isRailgunConnectedForEOA(addr) - Check if connected for address
 *   - getRailgunState()              - Get current connection state
 *
 * Bootstrap/Initialization:
 *   - bootstrap(options)             - Initialize SDK
 *   - initRailgunForBrowser(options) - Alias for bootstrap
 *   - initRailgunEngine(options)     - Alias for bootstrap
 *   - stopRailgunEngineBrowser()     - No-op cleanup
 *
 * Balances:
 *   - getAllBalances()               - Get EOA + Railgun balances
 *   - refreshBalances(force, timeout)- Trigger balance refresh
 *   - getPrivateBalances()           - Alias for getAllBalances
 *
 * Payments:
 *   - paySellerV2(params)            - Execute private transfer
 *   - privateTransfer(params)        - Alias for paySellerV2
 *   - checkWalletState(eoaAddress)   - Check wallet exists and is loaded
 *
 * Shielding:
 *   - shieldWETH(amount, signer)     - Wrap ETH and record shield
 *   - getWETHBalance(address, provider) - Get WETH balance
 *
 * State:
 *   - getWalletState()               - Get in-memory wallet state
 *   - updateWalletState(updates)     - Update wallet state
 *   - resetWalletState()             - Clear wallet state
 *
 * Deprecated (no-op stubs with warnings):
 *   - setSignerAndProvider()         - Provider managed via window.ethereum
 *   - setRailgunIdentity()           - Identity managed internally
 *   - getRailgunAddressFromCredentials() - Use connectRailgun instead
 *
 * Aliases for RailgunSimple.tsx compatibility:
 *   - connectRailgunWallet()         - Alias for connectRailgun
 *   - getCurrentWallet()             - Returns current wallet info
 *
 * @module railgun-clean
 */

// ==========================================
// IMPORTS FROM INTERNAL MODULES
// ==========================================

// Bootstrap
import { bootstrap, initRailgunForBrowser, stopRailgunEngineBrowser } from './bootstrap';

// Connection
import {
  connectRailgun,
  disconnectRailgun,
  restoreRailgunConnection,
  isRailgunConnectedForEOA,
  getRailgunState
} from './connection';

// Balances
import { getAllBalances } from './balances';

// Payments
import { paySellerV2, checkWalletState } from './payments';

// Shield
import { shieldWETH, getWETHBalance } from './shield';

// Wallet State
import { getWalletState, updateWalletState, resetWalletState } from './wallet-state';

// ==========================================
// DEPRECATED FUNCTION STUBS
// ==========================================

/**
 * @deprecated Provider/signer managed via window.ethereum
 */
export const setSignerAndProvider = (provider, signer) => {
  console.warn('setSignerAndProvider is deprecated - provider managed via window.ethereum');
};

/**
 * @deprecated Identity managed internally by connection.js
 */
export const setRailgunIdentity = (identity) => {
  console.warn('setRailgunIdentity is deprecated - identity managed internally');
  // For backward compatibility, store in wallet state if provided
  if (identity && identity.walletID) {
    updateWalletState({
      walletID: identity.walletID,
      railgunAddress: identity.railgunAddress
    });
  }
};

/**
 * @deprecated Use connectRailgun instead - credentials are handled by backend
 */
export const getRailgunAddressFromCredentials = async (mnemonic, encryptionKey) => {
  console.warn('getRailgunAddressFromCredentials is deprecated - use connectRailgun instead');
  throw new Error('getRailgunAddressFromCredentials is deprecated. Use connectRailgun({ userAddress }) to connect and get railgun address.');
};

// ==========================================
// ALIASES FOR BACKWARD COMPATIBILITY
// ==========================================

/**
 * Alias for paySellerV2 - some components import as privateTransfer
 */
export const privateTransfer = paySellerV2;

/**
 * Alias for bootstrap - RailgunSimple.tsx imports as initRailgunEngine
 */
export const initRailgunEngine = bootstrap;

/**
 * Alias for getAllBalances - RailgunSimple.tsx imports as getPrivateBalances
 */
export const getPrivateBalances = getAllBalances;

/**
 * Alias for connectRailgun - RailgunSimple.tsx imports as connectRailgunWallet
 * Maps { mnemonic, encryptionKeyHex } to connectRailgun format
 */
export const connectRailgunWallet = async (options = {}) => {
  // RailgunSimple passes { mnemonic, encryptionKeyHex }
  // connectRailgun expects { userAddress }
  // Try to get userAddress from window.ethereum if not provided
  if (!options.userAddress && typeof window !== 'undefined' && window.ethereum) {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts && accounts.length > 0) {
        options.userAddress = accounts[0];
      }
    } catch (e) {
      console.warn('Could not get user address from MetaMask:', e);
    }
  }

  const result = await connectRailgun(options);

  // Map result format for RailgunSimple compatibility
  if (result.success) {
    return {
      walletID: result.walletID,
      railgunAddress: result.railgunAddress
    };
  }
  throw new Error(result.error || 'Failed to connect wallet');
};

/**
 * Get current wallet info - used by RailgunSimple.tsx
 */
export const getCurrentWallet = () => {
  try {
    const stored = localStorage.getItem('railgun.wallet');
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return {
      walletID: parsed.walletID,
      railgunAddress: parsed.railgunAddress,
      userAddress: parsed.userAddress
    };
  } catch (e) {
    return null;
  }
};

/**
 * Refresh balances - wrapper that triggers SDK balance refresh
 * Legacy API: refreshBalances(forceRefresh, timeoutMs)
 */
export const refreshBalances = async (forceRefresh = false, timeoutMs = 2000) => {
  console.log('Refreshing balances...', { forceRefresh, timeoutMs });
  // For now, delegate to getAllBalances which handles the refresh
  // In future, this could trigger a more aggressive scan
  try {
    const result = await getAllBalances();
    return result.success ? { success: true } : { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

// ==========================================
// NAMED EXPORTS
// ==========================================

// Bootstrap
export { bootstrap };
export { initRailgunForBrowser, stopRailgunEngineBrowser };

// Connection
export { connectRailgun, disconnectRailgun, restoreRailgunConnection, isRailgunConnectedForEOA, getRailgunState };

// Balances
export { getAllBalances };

// Payments
export { paySellerV2, checkWalletState };

// Wallet State
export { getWalletState, updateWalletState, resetWalletState };

// Shield
export { shieldWETH, getWETHBalance };

// ==========================================
// DEFAULT EXPORT
// ==========================================

export default {
  // Bootstrap
  bootstrap,
  initRailgunForBrowser,
  initRailgunEngine,
  stopRailgunEngineBrowser,

  // Connection
  connectRailgun,
  connectRailgunWallet,
  disconnectRailgun,
  restoreRailgunConnection,
  isRailgunConnectedForEOA,
  getRailgunState,
  getCurrentWallet,

  // Balances
  getAllBalances,
  getPrivateBalances,
  refreshBalances,

  // Payments
  paySellerV2,
  privateTransfer,
  checkWalletState,

  // Shield
  shieldWETH,
  getWETHBalance,

  // Wallet State
  getWalletState,
  updateWalletState,
  resetWalletState,

  // Deprecated
  setSignerAndProvider,
  setRailgunIdentity,
  getRailgunAddressFromCredentials,
};
