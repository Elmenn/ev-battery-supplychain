# Phase 2: Wallet Connection in Browser - Research

**Researched:** 2026-01-21
**Domain:** Railgun SDK Wallet Connection + Browser-based Encrypted Storage
**Confidence:** HIGH

## Summary

This phase implements browser-based Railgun wallet connection with encrypted mnemonic storage. The codebase already has substantial infrastructure in place via `railgun-clean/connection.js` and `railgun-client-browser.js`, but the current implementation has gaps that need addressing based on the CONTEXT.md decisions.

The key work involves: (1) fixing the connection flow to properly derive encryption keys from MetaMask signatures, (2) implementing encrypted localStorage for mnemonic persistence, (3) improving UI feedback with spinner states and truncated address display, and (4) adding retry logic for SDK initialization failures.

**Primary recommendation:** Build on existing `railgun-clean/connection.js` and `RailgunConnectionButton.jsx`, adding Web Crypto API-based AES-GCM encryption for mnemonic storage and improving the UX flow to match CONTEXT.md requirements.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @railgun-community/wallet | 10.4.0 | Railgun SDK for wallet creation/loading | Official Railgun SDK |
| @railgun-community/shared-models | 7.6.1 | Types, NetworkName, NETWORK_CONFIG | Railgun types and config |
| ethers | 6.13.1 | MetaMask interaction, signing, key derivation | Industry standard Ethereum library |
| level-js | 6.1.0 | IndexedDB-backed storage for SDK | Required for browser SDK persistence |
| localforage | 1.10.0 | Artifact storage | SDK artifact caching |

### Supporting (Already Available)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-hot-toast | 2.5.2 | User feedback notifications | All success/error states |
| Web Crypto API | Native | AES-GCM encryption for mnemonic | localStorage encryption |

### No Additional Libraries Needed
The codebase has all required dependencies. The Web Crypto API is built into browsers and provides AES-GCM encryption without additional packages.

## Architecture Patterns

### Existing Project Structure (Use As-Is)
```
frontend/src/lib/
├── railgun-clean/           # Primary API (SINGLE SOURCE OF TRUTH)
│   ├── index.js             # Public API exports
│   ├── connection.js        # Connection flow (MODIFY THIS)
│   ├── bootstrap.js         # SDK initialization
│   └── wallet-state.js      # In-memory state
├── railgun-client-browser.js  # SDK wrapper (createWalletFromSignature)
└── railgun/wallets/wallets.js # Low-level SDK functions

frontend/src/components/railgun/
├── RailgunConnectionButton.jsx  # Primary button (MODIFY THIS)
└── RailgunSimple.tsx           # Reference implementation
```

### Pattern 1: Signature-Based Encryption Key Derivation
**What:** Derive encryption key from MetaMask signature using keccak256
**When to use:** Every wallet connection - deterministic key from user's signature
**Example:**
```javascript
// Source: railgun-client-browser.js line 179
import { keccak256, toUtf8Bytes, getBytes } from 'ethers';

const encryptionKey = keccak256(toUtf8Bytes(String(signature)));
const encBytes = getBytes(encryptionKey); // Uint8Array for SDK
```

### Pattern 2: Web Crypto AES-GCM Encryption for Mnemonic
**What:** Encrypt mnemonic before localStorage storage using MetaMask-derived key
**When to use:** Storing mnemonic in localStorage, retrieving on connection restore
**Example:**
```javascript
// Source: MDN Web Crypto API + Auth0 best practices
async function encryptMnemonic(mnemonic, signature) {
  const encoder = new TextEncoder();
  const data = encoder.encode(mnemonic);

  // Derive key from signature
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signature),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  // Store salt + iv + ciphertext
  return { salt: Array.from(salt), iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) };
}
```

### Pattern 3: SDK Wallet Creation Flow
**What:** Create Railgun wallet using SDK's createRailgunWallet
**When to use:** New wallet creation (mnemonic not stored)
**Example:**
```javascript
// Source: Railgun Developer Docs + railgun/wallets/wallets.js
import { createRailgunWallet } from './railgun/wallets/wallets';
import { NETWORK_CONFIG, NetworkName } from '@railgun-community/shared-models';

const { deploymentBlock } = NETWORK_CONFIG[NetworkName.EthereumSepolia];
const creationBlockNumbers = { [NetworkName.EthereumSepolia]: deploymentBlock };

const { id: walletID, railgunAddress } = await createRailgunWallet(
  encryptionKeyBytes, // Uint8Array from getBytes(keccak256(...))
  mnemonic,           // 12-word phrase
  creationBlockNumbers,
  0                   // derivation index
);
```

### Pattern 4: SDK Wallet Loading Flow
**What:** Load existing wallet by ID using loadWalletByID
**When to use:** Restoring connection from localStorage
**Example:**
```javascript
// Source: Railgun Developer Docs + railgun/wallets/wallets.js
import { loadWalletByID, getRailgunAddress } from './railgun/wallets/wallets';

const walletInfo = await loadWalletByID(
  encryptionKeyBytes, // Must match key used at creation
  walletID,           // Stored in localStorage
  false               // isViewOnlyWallet
);

const railgunAddress = getRailgunAddress(walletID);
```

### Pattern 5: Retry with Exponential Backoff
**What:** Silent retry 2-3 times on SDK failures before showing error
**When to use:** SDK initialization, wallet creation
**Example:**
```javascript
async function withRetry(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, baseDelay * attempt));
    }
  }
}
```

### Anti-Patterns to Avoid
- **Storing mnemonic in plaintext localStorage:** Always encrypt with user-derived key
- **Using btoa/atob for "encryption":** These are encoding, not encryption - use AES-GCM
- **Auto-connecting on page load:** User must explicitly click to connect
- **Exposing technical errors to user:** Map to friendly messages like "Connection failed. Please try again."

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mnemonic generation | Custom word list/entropy | `ethers.Wallet.createRandom().mnemonic.phrase` | Proper entropy, BIP-39 compliant |
| Encryption key derivation | Simple hash | `crypto.subtle.deriveKey` with PBKDF2 | Resistant to brute force |
| Symmetric encryption | XOR or custom cipher | Web Crypto AES-GCM | Authenticated encryption, no padding oracle |
| Railgun address validation | Regex pattern | `RailgunEngine.decodeAddress()` | SDK handles format changes |
| Network configuration | Hardcoded addresses | `NETWORK_CONFIG[NetworkName.EthereumSepolia]` | SDK maintains current addresses |

**Key insight:** The Railgun SDK and ethers.js provide battle-tested cryptographic primitives. Browser's Web Crypto API provides hardware-accelerated, constant-time encryption. Custom crypto code is almost always wrong.

## Common Pitfalls

### Pitfall 1: Encryption Key Not Matching at Load Time
**What goes wrong:** Wallet created with one signature, loaded with different signature derived key
**Why it happens:** MetaMask signature includes timestamp/nonce, making it non-deterministic
**How to avoid:** Use fixed message for signing: "Railgun Wallet Encryption Key" (no timestamp)
**Warning signs:** "Could not load RAILGUN wallet" error on connection restore

### Pitfall 2: SDK Not Initialized Before Wallet Operations
**What goes wrong:** `createRailgunWallet` or `loadWalletByID` fails with undefined engine
**Why it happens:** Async initialization not awaited
**How to avoid:** Always call `initializeSDK()` and await before wallet operations. The existing `railgun-client-browser.js` handles this.
**Warning signs:** "getEngine() undefined" or "No RAILGUN wallet for ID" errors

### Pitfall 3: Browser Tab Closed During First Connection
**What goes wrong:** Mnemonic generated but not encrypted/stored before tab close
**Why it happens:** localStorage.setItem called after async wallet creation
**How to avoid:** Store encrypted mnemonic BEFORE calling SDK createRailgunWallet, update with walletID after
**Warning signs:** User sees "Connect" button after previously connecting

### Pitfall 4: MetaMask Account Switch Not Detected
**What goes wrong:** Railgun wallet stays connected to wrong EOA after MetaMask switch
**Why it happens:** Missing `accountsChanged` event listener
**How to avoid:** Current RailgunConnectionButton.jsx already handles this (lines 90-138) - keep this logic
**Warning signs:** Railgun address shown but doesn't match current MetaMask account

### Pitfall 5: Double SDK Initialization
**What goes wrong:** "Engine already started" error or resource conflicts
**Why it happens:** Multiple components trigger initialization
**How to avoid:** Use the existing singleton pattern in `railgun-client-browser.js` (initializationPromise pattern)
**Warning signs:** Console warnings about duplicate initialization

### Pitfall 6: Copy Button UX Issues
**What goes wrong:** User clicks copy, nothing happens, no feedback
**Why it happens:** Missing clipboard API fallback, no success indicator
**How to avoid:** Use `navigator.clipboard.writeText()` with toast confirmation
**Warning signs:** User repeatedly clicking copy button

## Code Examples

Verified patterns from official sources and existing codebase:

### Mnemonic Generation
```javascript
// Source: railgun-client-browser.js line 192
import { Wallet } from 'ethers';

const mnemonic = Wallet.createRandom().mnemonic.phrase;
// Returns 12-word BIP-39 phrase
```

### Signature Request for Encryption Key
```javascript
// Source: railgun-clean/connection.js lines 54-57
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
// Fixed message (no timestamp) for deterministic encryption key
const msg = "Railgun Wallet Encryption Key";
const signature = await signer.signMessage(msg);
```

### Check MetaMask Connected
```javascript
// Source: RailgunConnectionButton.jsx line 184
if (!currentUser) {
  // Show "Please connect MetaMask first"
  return null;
}
```

### Truncated Address Display
```javascript
// Source: RailgunConnectionButton.jsx line 193
const truncated = `${railgunAddress.slice(0, 8)}...${railgunAddress.slice(-8)}`;
// Displays: "0zk1q23a...xyz789"
```

### Copy to Clipboard
```javascript
// Pattern: navigator.clipboard + toast
const copyAddress = async () => {
  try {
    await navigator.clipboard.writeText(railgunAddress);
    toast.success('Address copied!');
  } catch (err) {
    toast.error('Failed to copy');
  }
};
```

### Connection State Persistence
```javascript
// Source: railgun-clean/connection.js lines 65-71
const store = {
  walletID: walletInfo.walletID,
  railgunAddress: walletInfo.railgunAddress || null,
  userAddress: String(eoaAddress).toLowerCase(),
  timestamp: Date.now()
};
localStorage.setItem('railgun.wallet', JSON.stringify(store));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `createRailgunWallet(encKey, mnemonic, undefined)` | `createRailgunWallet(encKey, mnemonic, creationBlockNumbers, derivationIndex)` | SDK 10.x | Proper wallet scanning from correct block |
| btoa() for storage | AES-GCM via Web Crypto | Best practice | Actual encryption vs. base64 encoding |
| Auto-connect on load | Explicit user click | UX best practice | User control, security |

**Current best practice:**
- Use `creationBlockNumbers` with network-specific deployment blocks for efficient scanning
- PBKDF2 key derivation (100k iterations) for brute-force resistance
- AES-GCM authenticated encryption for mnemonic storage

## Open Questions

Things that couldn't be fully resolved:

1. **Import Existing Mnemonic Flow**
   - What we know: CONTEXT.md says "Support both: import existing mnemonic OR generate new one"
   - What's unclear: Where does import UI appear? Modal? Settings page?
   - Recommendation: Start with generate-only flow, add import as enhancement

2. **Encryption Key Persistence**
   - What we know: Encryption key derived from MetaMask signature
   - What's unclear: Should encrypted mnemonic be re-encrypted with new signature each session?
   - Recommendation: Use fixed signing message so same signature (thus same key) always derived

3. **View-Only Wallet Support**
   - What we know: SDK supports view-only wallets via `createViewOnlyRailgunWallet`
   - What's unclear: Is this needed for Phase 2?
   - Recommendation: Out of scope for Phase 2, can add later

## Sources

### Primary (HIGH confidence)
- [Railgun Developer Guide - RAILGUN Wallets](https://docs.railgun.org/developer-guide/wallet/private-wallets/railgun-wallets) - createRailgunWallet, loadWalletByID API
- [Railgun Developer Guide - Start Engine](https://docs.railgun.org/developer-guide/wallet/getting-started/5.-start-the-railgun-privacy-engine) - Engine initialization
- Codebase: `frontend/src/lib/railgun/wallets/wallets.js` - Working SDK wrapper functions
- Codebase: `frontend/src/lib/railgun-client-browser.js` - Browser SDK initialization pattern
- Codebase: `frontend/src/lib/railgun-clean/connection.js` - Current connection implementation

### Secondary (MEDIUM confidence)
- [MDN Web Crypto API - SubtleCrypto.encrypt()](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt) - AES-GCM encryption
- [Auth0 - Secure Browser Storage](https://auth0.com/blog/secure-browser-storage-the-facts/) - localStorage security patterns
- [ethers.js v6 - Signer](https://docs.ethers.org/v6/api/wallet/) - signMessage API

### Tertiary (LOW confidence)
- WebSearch results on wallet connection button UX patterns - general guidance only

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and working in codebase
- Architecture: HIGH - Patterns verified in existing code, following Railgun docs
- Pitfalls: HIGH - Derived from codebase analysis and SDK documentation
- Encryption pattern: MEDIUM - Web Crypto standard, but integration with Railgun flow needs testing

**Research date:** 2026-01-21
**Valid until:** 2026-03-21 (60 days - SDK is stable at 10.x)
