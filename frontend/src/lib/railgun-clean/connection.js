// Connection helpers for client-side Railgun wallet flow
// Exports: connectRailgun, disconnectRailgun, restoreRailgunConnection, isRailgunConnectedForEOA, getRailgunState

import { encryptMnemonic, decryptMnemonic } from './crypto.js';
import { RAILGUN_WALLET_SIGNATURE_MESSAGE } from './constants.js';

const ACTIVE_WALLET_KEY = 'railgun.wallet';
const WALLETS_BY_EOA_KEY = 'railgun.walletsByEOA';

function normalizeEOA(address) {
  return String(address || '').toLowerCase();
}

function readJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadWalletsByEOA() {
  const parsed = readJSON(WALLETS_BY_EOA_KEY, {});
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function saveWalletsByEOA(walletsByEOA) {
  writeJSON(WALLETS_BY_EOA_KEY, walletsByEOA || {});
}

function migrateLegacyActiveRecordToMap() {
  const active = readJSON(ACTIVE_WALLET_KEY, null);
  if (!active?.userAddress) return;

  const eoa = normalizeEOA(active.userAddress);
  const map = loadWalletsByEOA();
  if (!map[eoa] && active.encryptedMnemonic) {
    map[eoa] = { ...active, userAddress: eoa };
    saveWalletsByEOA(map);
  }
}

function getStoredWalletForEOA(eoaAddress) {
  const eoa = normalizeEOA(eoaAddress);
  if (!eoa) return null;

  const active = readJSON(ACTIVE_WALLET_KEY, null);
  const map = loadWalletsByEOA();
  const fromMap = map[eoa] || null;
  const normalizedFromMap = fromMap ? { ...fromMap, userAddress: eoa } : null;

  if (active?.userAddress && normalizeEOA(active.userAddress) === eoa) {
    // Prefer a record with encrypted mnemonic so restore is deterministic.
    if (active.encryptedMnemonic) return active;
    if (normalizedFromMap?.encryptedMnemonic) return normalizedFromMap;
    return active;
  }

  return normalizedFromMap;
}

function setStoredWalletForEOA(eoaAddress, walletRecord) {
  const eoa = normalizeEOA(eoaAddress);
  if (!eoa || !walletRecord) return;

  const normalizedRecord = { ...walletRecord, userAddress: eoa };
  const map = loadWalletsByEOA();
  map[eoa] = normalizedRecord;
  saveWalletsByEOA(map);
  writeJSON(ACTIVE_WALLET_KEY, normalizedRecord);
}

function clearActiveWalletRecord() {
  localStorage.removeItem(ACTIVE_WALLET_KEY);
}

function clearStoredWalletForEOA(eoaAddress) {
  const eoa = normalizeEOA(eoaAddress);
  if (!eoa) return;

  const map = loadWalletsByEOA();
  if (map[eoa]) {
    delete map[eoa];
    saveWalletsByEOA(map);
  }

  const active = readJSON(ACTIVE_WALLET_KEY, null);
  if (active?.userAddress && normalizeEOA(active.userAddress) === eoa) {
    clearActiveWalletRecord();
  }
}

/**
 * Retry wrapper with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum retry attempts (default 3)
 * @param {number} baseDelay - Base delay in ms (default 1000)
 * @returns {Promise} Result of fn() or throws after all retries fail
 */
async function withRetry(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      console.warn(`Attempt ${attempt}/${maxRetries} failed:`, err.message);
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, baseDelay * attempt));
    }
  }
}

let _state = {
  connected: false,
  eoa: null,
  walletID: null,
  railgunAddress: null
};

/**
 * Connect to Railgun wallet
 * Uses fixed signing message for deterministic key derivation and encrypts mnemonic for persistent storage.
 *
 * @param {string|Object} arg - EOA address string or options object { userAddress, backendBaseURL, rpcUrl }
 * @returns {Promise<{ success: boolean, walletID?: string, railgunAddress?: string, error?: string }>}
 */
export async function connectRailgun(arg) {
  let eoaAddress = null;
  if (!arg) throw new Error('eoaAddress required');
  if (typeof arg === 'string') eoaAddress = arg;
  else if (typeof arg === 'object') eoaAddress = arg.userAddress || arg.eoa || arg.address;
  if (!eoaAddress) throw new Error('userAddress required');
  const normalizedEOA = normalizeEOA(eoaAddress);

  try {
    migrateLegacyActiveRecordToMap();

    // Initialize SDK (non-blocking if already initialized) with retry logic
    const client = await import('../railgun-client-browser.js');
    const initRes = await withRetry(
      () => client.initializeSDK(),
      3,  // 3 attempts
      1000 // 1s, 2s, 3s backoff
    );
    if (!initRes || !initRes.success) {
      throw new Error(initRes && initRes.error ? initRes.error : 'Failed to initialize Railgun SDK');
    }

    // Request signature with FIXED message (no timestamp - deterministic)
    const provider = new (await import('ethers')).ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const signature = await signer.signMessage(RAILGUN_WALLET_SIGNATURE_MESSAGE);

    // Check for existing encrypted mnemonic for this user
    const stored = getStoredWalletForEOA(normalizedEOA);

    if (stored && stored.encryptedMnemonic && normalizeEOA(stored.userAddress) === normalizedEOA) {
      // Try to decrypt and restore existing wallet
      console.log('Found encrypted mnemonic, attempting to restore wallet...');
      const mnemonic = await decryptMnemonic(stored.encryptedMnemonic, signature);

      if (mnemonic) {
        // Recreate wallet with existing mnemonic
        const walletInfo = await client.createWalletFromSignature(signature, {
          userAddress: eoaAddress,
          mnemonic // Pass existing mnemonic to recreate same wallet
        });

        if (walletInfo && walletInfo.walletID) {
          // Update stored data with new walletID (may differ due to SDK internals) but keep encrypted mnemonic
          const updatedStore = {
            ...stored,
            walletID: walletInfo.walletID,
            railgunAddress: walletInfo.railgunAddress || stored.railgunAddress,
            timestamp: Date.now()
          };
          setStoredWalletForEOA(normalizedEOA, updatedStore);

          _state.connected = true;
          _state.eoa = normalizedEOA;
          _state.walletID = walletInfo.walletID;
          _state.railgunAddress = walletInfo.railgunAddress || null;

          console.log('Wallet restored from encrypted mnemonic');
          return { success: true, walletID: walletInfo.walletID, railgunAddress: walletInfo.railgunAddress || null };
        }
      } else {
        console.warn('Failed to decrypt mnemonic, creating new wallet');
      }
    }

    // Create NEW wallet (no existing encrypted mnemonic or decryption failed)
    console.log('Creating new Railgun wallet...');
    const walletInfo = await client.createWalletFromSignature(signature, { userAddress: eoaAddress });
    if (!walletInfo || !walletInfo.walletID) {
      throw new Error('SDK failed to create wallet from signature');
    }

    // Encrypt mnemonic before storing (NEVER store plaintext)
    const encryptedMnemonic = await encryptMnemonic(walletInfo.mnemonic, signature);

    const store = {
      walletID: walletInfo.walletID,
      railgunAddress: walletInfo.railgunAddress || null,
      userAddress: normalizedEOA,
      encryptedMnemonic, // Encrypted payload: { iv, salt, data }
      timestamp: Date.now()
    };
    setStoredWalletForEOA(normalizedEOA, store);

    _state.connected = true;
    _state.eoa = normalizedEOA;
    _state.walletID = walletInfo.walletID;
    _state.railgunAddress = walletInfo.railgunAddress || null;

    console.log('New wallet created and mnemonic encrypted');
    return { success: true, walletID: walletInfo.walletID, railgunAddress: walletInfo.railgunAddress || null };
  } catch (err) {
    _state.connected = false;
    // Convert technical errors to user-friendly messages
    const errMsg = String(err.message || err);
    const friendlyMessage = errMsg.includes('Failed to initialize') || errMsg.includes('SDK')
      ? 'Connection failed. Please try again.'
      : errMsg.includes('User rejected') || errMsg.includes('rejected')
      ? 'Connection cancelled.'
      : errMsg.includes('MetaMask') || errMsg.includes('wallet')
      ? 'Wallet error. Please try again.'
      : 'Connection failed. Please try again.';
    return { success: false, error: friendlyMessage };
  }
}

/**
 * Disconnect active Railgun wallet session.
 * By default, this clears in-memory state + active session record only.
 * Stored per-EOA encrypted wallet records are preserved unless clearStored is requested.
 *
 * @param {{ clearStored?: boolean|string, userAddress?: string }|undefined} options
 * @returns {{ success: boolean }}
 */
export function disconnectRailgun(options = {}) {
  const opts = options && typeof options === 'object' ? options : {};

  // Clear in-memory state
  _state = { connected: false, eoa: null, walletID: null, railgunAddress: null };

  // Clear active localStorage session record
  let active = null;
  try {
    active = readJSON(ACTIVE_WALLET_KEY, null);
    clearActiveWalletRecord();
    console.log('Railgun wallet disconnected (active session cleared)');
  } catch (e) {
    console.warn('Failed to clear active localStorage session:', e);
  }

  // Optionally clear persistent stored records
  try {
    if (opts.clearStored === true || opts.clearStored === 'current') {
      const targetEOA = normalizeEOA(opts.userAddress || active?.userAddress);
      if (targetEOA) {
        clearStoredWalletForEOA(targetEOA);
      }
    } else if (opts.clearStored === 'all') {
      localStorage.removeItem(WALLETS_BY_EOA_KEY);
    }
  } catch (e) {
    console.warn('Failed to clear persistent wallet storage:', e);
  }

  return { success: true };
}

/**
 * Restore Railgun connection from localStorage
 * Requires MetaMask signature to decrypt stored mnemonic.
 *
 * @param {string} userAddress - Optional user address to verify connection belongs to
 * @returns {Promise<{ success: boolean, connected?: boolean, walletID?: string, railgunAddress?: string, userAddress?: string, error?: string }>}
 */
export async function restoreRailgunConnection(userAddress) {
  try {
    migrateLegacyActiveRecordToMap();
    const stored = getStoredWalletForEOA(userAddress);
    if (!stored) {
      return { success: false, connected: false, error: 'No stored connection found' };
    }
    if (!stored.userAddress) {
      return { success: false, connected: false, error: 'Invalid stored connection data' };
    }

    // If userAddress provided, verify it matches
    if (userAddress && stored.userAddress.toLowerCase() !== userAddress.toLowerCase()) {
      return { success: false, connected: false, error: 'Stored connection belongs to different user' };
    }

    // Check if we have encrypted mnemonic (new format)
    if (!stored.encryptedMnemonic) {
      // Legacy format without encrypted mnemonic - user needs to reconnect
      console.warn('Legacy wallet format detected - requires full reconnection');
      return { success: false, connected: false, error: 'Legacy wallet format - please reconnect' };
    }

    // Request signature to decrypt mnemonic
    // connectRailgun will handle the decryption and wallet restoration
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
      const parsed = readJSON(ACTIVE_WALLET_KEY, null);
      if (parsed && parsed.userAddress && parsed.walletID) {
        return normalizeEOA(parsed.userAddress) === normalizeEOA(eoaAddress);
      }
    } catch {
      // ignore
    }
    return false;
  }
  return normalizeEOA(eoaAddress) === _state.eoa;
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
      const parsed = readJSON(ACTIVE_WALLET_KEY, null);
      if (parsed && parsed.walletID && parsed.userAddress) {
        state = {
          connected: true,
          eoa: parsed.userAddress,
          walletID: parsed.walletID,
          railgunAddress: parsed.railgunAddress || null
        };
      }
    } catch {
      // ignore
    }
  }

  return state;
}

const railgunConnectionApi = {
  connectRailgun,
  disconnectRailgun,
  restoreRailgunConnection,
  isRailgunConnectedForEOA,
  getRailgunState,
};

export default railgunConnectionApi;
