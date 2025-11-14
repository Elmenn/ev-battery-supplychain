# Configuration Values Reference

This document shows where each configuration value is located in the codebase.

## 1. CONFIG.ENCRYPTION_KEY (Encryption Key)

### Location: Backend API
**File:** `backend/railgun/api/railgun-api.js`

The encryption key is generated and stored in the database when a wallet is first created:

```824:872:backend/railgun/api/railgun-api.js
app.get('/api/railgun/wallet-credentials/:userAddress', requireNetwork, simpleRateLimit, async (req, res) => {
  try {
    const eoa = req.params.userAddress.toLowerCase();
    const network = req.railgunNetwork; // Always 'sepolia' from middleware

    console.log('🔐 Wallet credentials request', { eoa, network });

    const raw = await db.getConfig(`wallet_${eoa}`);
    if (!raw) {
      return res.status(404).json({ success: false, error: 'Wallet not found for this user' });
    }

    const info = JSON.parse(raw);

    // normalize encryption key back to hex string if needed (code kept from your file)
    let encryptionKey = info.encryptionKey;
    if (Array.isArray(encryptionKey)) {
      encryptionKey = ethers.hexlify(new Uint8Array(encryptionKey));
    } else if (typeof encryptionKey === 'string') {
      if (encryptionKey.includes(',')) {
        encryptionKey = ethers.hexlify(new Uint8Array(encryptionKey.split(',').map(Number)));
      } else if (!encryptionKey.startsWith('0x')) {
        encryptionKey = ethers.hexlify(encryptionKey);
      }
    } else {
      encryptionKey = ethers.hexlify(encryptionKey);
    }

    // Align stored network with normalized network to prevent mismatches
    if (info.network !== network) {
      info.network = network;
      await db.setConfig(`wallet_${eoa}`, JSON.stringify(info));
      console.log('🔄 Updated stored network to', network, 'for user', eoa);
    }

    // Return only what the client SDK needs. Do NOT include a bogus "railgunAddress".
    return res.json({
      success: true,
      data: {
        mnemonic: info.mnemonic,
        encryptionKey,
        network: network,
      },
    });
  } catch (error) {
    console.error('❌ Wallet credentials request failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

**Initial Generation:** The encryption key is created when a wallet is first created (if it doesn't exist):

```269:270:backend/railgun/api/railgun-api.js
            const mnemonic = ethers.Wallet.createRandom().mnemonic.phrase;
      const encryptionKey = ethers.hexlify(ethers.randomBytes(32));
```

### Location: Frontend Usage
**File:** `frontend/src/lib/railgunV2SepoliaClient.js`

The encryption key is fetched from the backend API and stored in localStorage:

```1331:1342:frontend/src/lib/railgunV2SepoliaClient.js
async function fetchWalletCredentials({ backendBaseURL, userAddress, network = 'sepolia' }) {
  const res = await fetch(
    `${backendBaseURL}/api/railgun/wallet-credentials/${userAddress}`,
    { headers: { 'x-railgun-network': network } }
  );
  if (!res.ok) throw new Error('Backend wallet-credentials failed.');
  const json = await res.json();
  if (!json?.data?.mnemonic || !json?.data?.encryptionKey) {
    throw new Error('Invalid wallet credentials.');
  }
  return json.data;
}
```

It's stored in localStorage after connection:

```1554:1563:frontend/src/lib/railgunV2SepoliaClient.js
    // Store connection info in localStorage (same format as railgunClient.js)
    const connectionInfo = {
      network: 'sepolia',
      walletID: result.walletID,
      railgunAddress: result.railgunAddress,
      userAddress: userAddress,
      encryptionKey: encryptionKey,
      connectedAt: new Date().toISOString()
    };
    localStorage.setItem('railgun.wallet', JSON.stringify(connectionInfo));
```

**Storage Format:**
- **Database:** Stored in SQLite database at key `wallet_${userAddress}` as part of JSON object
- **localStorage:** Stored as `railgun.wallet` JSON object with key `encryptionKey`
- **Format:** 32-byte hex string prefixed with `0x` (66 characters total: `0x` + 64 hex chars)

---

## 2. Mnemonic Variable

### Location: Backend API
**File:** `backend/railgun/api/railgun-api.js`

The mnemonic is generated when a wallet is first created:

```269:273:backend/railgun/api/railgun-api.js
            const mnemonic = ethers.Wallet.createRandom().mnemonic.phrase;
      const encryptionKey = ethers.hexlify(ethers.randomBytes(32));
            walletInfo = {
                mnemonic,
                encryptionKey,
```

It's returned via the wallet-credentials endpoint:

```862:866:backend/railgun/api/railgun-api.js
      data: {
        mnemonic: info.mnemonic,
        encryptionKey,
        network: network,
      },
```

### Location: Frontend Usage
**File:** `frontend/src/lib/railgunV2SepoliaClient.js`

The mnemonic is fetched from the backend and used to create/load the wallet:

```1518:1542:frontend/src/lib/railgunV2SepoliaClient.js
    // Fetch wallet credentials from backend (matches railgunClient.js)
    const { mnemonic, encryptionKey } = await fetchWalletCredentials({ backendBaseURL, userAddress });
    validateCredentials(mnemonic, encryptionKey);
    
    // Try to load existing wallet first, create if not found (matches railgunClient.js logic)
    let result;
    const stored = JSON.parse(localStorage.getItem('railgun.wallet') || 'null');
    
    try {
      // Try to load existing wallet by walletID from storage if available
      if (stored?.walletID) {
        console.log('🔍 Attempting to load existing wallet:', stored.walletID);
        result = await createOrLoadWallet({ 
          walletID: stored.walletID,
          encryptionKeyHex: encryptionKey,
          mnemonic: undefined // Don't pass mnemonic when loading existing
        });
      } else {
        // No existing wallet, create new one
        console.log('🆕 Creating new wallet...');
        result = await createOrLoadWallet({ 
          walletID: undefined,
          encryptionKeyHex: encryptionKey,
          mnemonic: mnemonic
        });
      }
```

**Storage Format:**
- **Database:** Stored in SQLite database at key `wallet_${userAddress}` as part of JSON object
- **Format:** 12 or 24-word BIP39 mnemonic phrase (space-separated words)
- **Security:** Never stored in frontend localStorage for security reasons

---

## 3. tokenAddress

### Location: Frontend - Default WETH Token
**File:** `frontend/src/lib/railgunV2SepoliaClient.js`

The default token address for Sepolia WETH is defined as a constant:

```260:268:frontend/src/lib/railgunV2SepoliaClient.js
  // Use chain from NETWORK_CONFIG (patched by bootstrap, should always exist)
  chain: officialSepoliaConfig?.chain ?? { type: 0, id: 11155111 },
  // Official Sepolia WETH (updated to match actual shielded token)
  WETH: '0xfff9976782d46cc05630d1f6ebab18b2324d6b14',
  // Railgun Shield (proxy) – official Sepolia proxy contract
  SHIELD: '0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea',
  // WETH decimals
  DECIMALS_WETH: 18,
};
```

Used in shield operations:

```2408:2419:frontend/src/lib/railgunV2SepoliaClient.js
  const tokenAddress = SEPOLIA.WETH.toLowerCase();
  const tokenData = {
    tokenType: 0, // 0 = ERC20
    tokenAddress: tokenAddress,
    tokenSubID: '0x0000000000000000000000000000000000000000000000000000000000000000', // zero for ERC20
  };

  const erc20Recipients = [{
    tokenAddress: tokenAddress,
    amount: BigInt(amountWei).toString(),
    recipientAddress: toRailgunAddress,
  }];
```

### Location: Dynamic Usage
The `tokenAddress` can be:
- **Hardcoded:** `SEPOLIA.WETH` constant for default operations
- **Parameter:** Passed as function parameter (e.g., `privateTransfer({ tokenAddress, ... })`)
- **Environment Variable:** `REACT_APP_WETH_ADDRESS` (if defined)
- **Product Data:** Retrieved from product configuration in marketplace

**Common Values:**
- Sepolia WETH: `0xfff9976782d46cc05630d1f6ebab18b2324d6b14`
- Sepolia WETH (alternative): `0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9`
- ETH (zero address): `0x0000000000000000000000000000000000000000`

---

## 4. recipientAddress

### Location: Frontend - Private Transfer
**File:** `frontend/src/lib/railgunV2SepoliaClient.js`

The recipient address is typically the Railgun address (0zk1... format) of the recipient:

```2415:2419:frontend/src/lib/railgunV2SepoliaClient.js
  const erc20Recipients = [{
    tokenAddress: tokenAddress,
    amount: BigInt(amountWei).toString(),
    recipientAddress: toRailgunAddress,
  }];
```

For shield operations, the recipient is usually your own Railgun address:

```2236:2247:frontend/src/lib/railgunV2SepoliaClient.js
  const toAddress = await getRailgunAddress(); // 0zk… address (MUST be your wallet's 0zk or wallet can't decrypt)
  const amountWei = ethers.parseUnits(String(amountEth), SEPOLIA.DECIMALS_WETH);
  
  // Ensure WETH allowance
  await ensureWETHAllowance(amountWei);

  // Build recipients
  const recipients = [{ 
    tokenAddress: SEPOLIA.WETH, 
    recipientAddress: toAddress, // ✅ MUST be your 0zk or wallet can't decrypt
    amount: amountWei.toString() 
  }];
```

**Format:**
- **Railgun Address:** Starts with `0zk1`, followed by 120-140 alphanumeric characters (e.g., `0zk1q...`)
- **Validation:** Must match Railgun address format: `/^0zk1[0-9a-z]{120,140}$/`

**Usage:**
- **Shield:** Usually your own Railgun address (from `getRailgunAddress()`)
- **Private Transfer:** The recipient's Railgun address (passed as parameter `toRailgunAddress`)
- **Unshield:** Your public Ethereum address (0x... format)

---

## 5. PRIVATE_KEY Environment Variable

### Location: Backend/Deployment
**File:** `docs/DEPLOYMENT_GUIDE.md` and `truffle-config.js`

The `PRIVATE_KEY` environment variable is used for:
1. **Contract Deployment:** Signing deployment transactions
2. **Backend Operations:** Sending transactions from the backend (if needed)

**Setup Instructions:**

```126:126:docs/DEPLOYMENT_GUIDE.md
PRIVATE_KEY=your_deployment_private_key
```

**Usage in Truffle Config:**

```15:15:truffle-config.js
 * - PRIVATE_KEY: Direct private key (faster, less secure)
```

**Security Notes:**
- **Never commit** private keys to version control
- Store in `.env` file (which is gitignored)
- Use environment-specific secrets (development vs production)
- Consider using hardware wallets or secure key management services for production

**Current Status:**
- The frontend does **NOT** use `PRIVATE_KEY` directly
- The frontend uses MetaMask or wallet connection (via `window.ethereum`) to get a signer
- Private keys are handled by the user's wallet (MetaMask, etc.)
- The backend generates mnemonic/encryption keys but does not store user private keys

**If you need to set PRIVATE_KEY:**
1. Create or edit `.env` file in the project root
2. Add: `PRIVATE_KEY=0x...` (your private key without quotes)
3. Ensure `.env` is in `.gitignore`
4. **Never commit this file to version control**

---

## Summary Table

| Configuration | Location | Storage | Format | Example |
|--------------|----------|---------|--------|---------|
| **encryptionKey** | Backend API → Database → localStorage | SQLite DB + localStorage | `0x` + 64 hex chars | `0x1234...abcd` |
| **mnemonic** | Backend API → Database | SQLite DB only | 12/24 words | `abandon abandon...` |
| **tokenAddress** | Frontend constants | Code | 0x + 40 hex chars | `0xfff9976...` |
| **recipientAddress** | Function parameter | Runtime | `0zk1...` (120-140 chars) | `0zk1q...` |
| **PRIVATE_KEY** | `.env` file | Environment variable | `0x` + 64 hex chars | `0x1234...abcd` |

---

## Quick Access

### Get Current Values (Browser Console)

```javascript
// Get encryption key from localStorage
const wallet = JSON.parse(localStorage.getItem('railgun.wallet') || '{}'));
console.log('Encryption Key:', wallet.encryptionKey);
console.log('Wallet ID:', wallet.walletID);
console.log('Railgun Address:', wallet.railgunAddress);

// Get token address constant
console.log('WETH Token:', window.RGV2?.SEPOLIA?.WETH);

// Get your Railgun address
const addr = await window.RGV2.RG.walletForID(wallet.walletID)?.getAddress();
console.log('My Railgun Address:', addr);
```

### Get Values from Backend

```bash
# Check backend API for wallet credentials (requires userAddress)
curl http://localhost:3001/api/railgun/wallet-credentials/YOUR_ETH_ADDRESS \
  -H "x-railgun-network: sepolia"
```

---

## Important Security Notes

1. **Encryption Key:** 
   - Stored in database and localStorage
   - Used to encrypt/decrypt wallet data
   - Keep secure and never expose

2. **Mnemonic:**
   - Only stored in backend database
   - Never sent to frontend or stored in localStorage
   - Can recover entire wallet if lost

3. **PRIVATE_KEY:**
   - Only needed for backend operations (contract deployment)
   - Frontend uses MetaMask/wallet connection instead
   - Never commit to version control

4. **Token Address:**
   - Public information (contract addresses)
   - Can be safely hardcoded or stored in config

5. **Recipient Address:**
   - Public Railgun address
   - No security risk to expose

