// Connection helpers for client-side Railgun wallet flow
// Exports: connectRailgun, disconnectRailgun, restoreRailgunConnection, isRailgunConnectedForEOA, getRailgunState

let _state = {
  connected: false,
  eoa: null,
  walletID: null,
  railgunAddress: null
};

const DEFAULT_API = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_RAILGUN_API_URL) || 'http://localhost:3001';

/**
 * Connect to Railgun wallet
 * @param {string|Object} arg - EOA address string or options object { userAddress, backendBaseURL, rpcUrl }
 * @returns {Promise<{ success: boolean, walletID?: string, railgunAddress?: string, error?: string }>}
 */
export async function connectRailgun(arg) {
  let eoaAddress = null;
  if (!arg) throw new Error('eoaAddress required');
  if (typeof arg === 'string') eoaAddress = arg;
  else if (typeof arg === 'object') eoaAddress = arg.userAddress || arg.eoa || arg.address;
  if (!eoaAddress) throw new Error('userAddress required');

  try {
    // Initialize SDK (non-blocking if already initialized)
    const client = await import('../railgun-client-browser.js');
    const initRes = await client.initializeSDK();
    if (!initRes || !initRes.success) {
      throw new Error(initRes && initRes.error ? initRes.error : 'Failed to initialize Railgun SDK');
    }

    // If we have an existing walletID for this user, try to load it
    const storedRaw = localStorage.getItem('railgun.wallet') || null;
    let stored = null;
    try { stored = storedRaw ? JSON.parse(storedRaw) : null; } catch (e) { stored = null; }

    if (stored && stored.userAddress && stored.userAddress.toLowerCase() === String(eoaAddress).toLowerCase() && stored.walletID) {
      // Try to load wallet in SDK
      try {
        const loaded = await client.loadWallet(stored.walletID);
        _state.connected = true;
        _state.eoa = String(eoaAddress).toLowerCase();
        _state.walletID = stored.walletID;
        _state.railgunAddress = stored.railgunAddress || null;
        localStorage.setItem('railgun.wallet', JSON.stringify({ ...stored, timestamp: Date.now() }));
        return { success: true, walletID: stored.walletID, railgunAddress: stored.railgunAddress || null };
      } catch (e) {
        console.warn('Failed to load stored wallet in SDK, creating new wallet:', e.message);
      }
    }

    // Create a new wallet deterministically using a MetaMask signature
    const provider = new (await import('ethers')).ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const msg = `Connect Railgun wallet for ${String(eoaAddress)} at ${new Date().toISOString()}`;
    const signature = await signer.signMessage(msg);

    // Create wallet from signature via wrapper
    const walletInfo = await client.createWalletFromSignature(signature, { userAddress: eoaAddress });
    if (!walletInfo || !walletInfo.walletID) {
      throw new Error('SDK failed to create wallet from signature');
    }

    const store = {
      walletID: walletInfo.walletID,
      railgunAddress: walletInfo.railgunAddress || null,
      userAddress: String(eoaAddress).toLowerCase(),
      timestamp: Date.now()
    };
    localStorage.setItem('railgun.wallet', JSON.stringify(store));

    _state.connected = true;
    _state.eoa = String(eoaAddress).toLowerCase();
    _state.walletID = walletInfo.walletID;
    _state.railgunAddress = walletInfo.railgunAddress || null;

    return { success: true, walletID: walletInfo.walletID, railgunAddress: walletInfo.railgunAddress || null };
  } catch (err) {
    _state.connected = false;
    return { success: false, error: String(err.message || err) };
  }
}

/**
 * Disconnect Railgun wallet and clear localStorage
 * @returns {{ success: boolean }}
 */
export function disconnectRailgun() {
  // Clear in-memory state
  _state = { connected: false, eoa: null, walletID: null, railgunAddress: null };

  // Clear localStorage
  try {
    localStorage.removeItem('railgun.wallet');
    console.log('Railgun wallet disconnected and localStorage cleared');
  } catch (e) {
    console.warn('Failed to clear localStorage:', e);
  }

  return { success: true };
}

/**
 * Restore Railgun connection from localStorage
 * @param {string} userAddress - Optional user address to verify connection belongs to
 * @returns {Promise<{ success: boolean, connected?: boolean, walletID?: string, railgunAddress?: string, userAddress?: string, error?: string }>}
 */
export async function restoreRailgunConnection(userAddress) {
  try {
    const storedRaw = localStorage.getItem('railgun.wallet');
    if (!storedRaw) {
      return { success: false, connected: false, error: 'No stored connection found' };
    }

    const stored = JSON.parse(storedRaw);
    if (!stored || !stored.walletID || !stored.userAddress) {
      return { success: false, connected: false, error: 'Invalid stored connection data' };
    }

    // If userAddress provided, verify it matches
    if (userAddress && stored.userAddress.toLowerCase() !== userAddress.toLowerCase()) {
      return { success: false, connected: false, error: 'Stored connection belongs to different user' };
    }

    // Try to reconnect using stored user address
    const result = await connectRailgun({ userAddress: stored.userAddress });

    if (result.success) {
      return {
        success: true,
        connected: true,
        walletID: result.walletID,
        railgunAddress: result.railgunAddress,
        userAddress: stored.userAddress
      };
    }

    return { success: false, connected: false, error: result.error || 'Failed to restore connection' };
  } catch (e) {
    return { success: false, connected: false, error: String(e.message || e) };
  }
}

/**
 * Check if Railgun is connected for a specific EOA
 * @param {string} eoaAddress - EOA address to check
 * @returns {boolean}
 */
export function isRailgunConnectedForEOA(eoaAddress) {
  if (!_state.connected || !_state.eoa) {
    // Also check localStorage in case state was lost
    try {
      const stored = localStorage.getItem('railgun.wallet');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.userAddress && parsed.walletID) {
          return parsed.userAddress.toLowerCase() === String(eoaAddress).toLowerCase();
        }
      }
    } catch (e) {
      // ignore
    }
    return false;
  }
  return String(eoaAddress).toLowerCase() === _state.eoa;
}

/**
 * Get current Railgun connection state
 * @returns {{ connected: boolean, eoa: string|null, walletID: string|null, railgunAddress: string|null }}
 */
export function getRailgunState() {
  // Merge in-memory state with localStorage for completeness
  let state = { ..._state };

  if (!state.connected) {
    try {
      const stored = localStorage.getItem('railgun.wallet');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.walletID && parsed.userAddress) {
          state = {
            connected: true,
            eoa: parsed.userAddress,
            walletID: parsed.walletID,
            railgunAddress: parsed.railgunAddress || null
          };
        }
      }
    } catch (e) {
      // ignore
    }
  }

  return state;
}

export default { connectRailgun, disconnectRailgun, restoreRailgunConnection, isRailgunConnectedForEOA, getRailgunState };
