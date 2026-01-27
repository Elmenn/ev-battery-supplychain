# Phase 5: Private Payment Transfer - Research

**Researched:** 2026-01-27
**Domain:** Railgun SDK private transfers, ZK proof generation, POI integration
**Confidence:** HIGH

## Summary

This phase implements private token transfers between Railgun 0zk addresses (buyer to seller). The Railgun SDK provides a three-step process: gas estimation, proof generation, and transaction population. The codebase already has TypeScript implementations in `frontend/src/lib/railgun/transactions/` that follow the SDK patterns, plus a stub `sendPrivateTransfer` in `railgun-client-browser.js` that needs to be properly implemented.

Key work involves: (1) implementing the transfer functions using SDK's `gasEstimateForUnprovenTransfer`, `generateTransferProof`, and `populateProvedTransfer`, (2) integrating POI verification which is automatic in SDK 10.x, (3) generating a memoHash for the transaction, and (4) extracting nullifiers as the railgunTxRef for on-chain recording via `recordPrivatePayment()`.

**Primary recommendation:** Create `transfer.js` in `railgun-clean/operations/` following the same pattern as `shield.js`, using the SDK's top-level exports. Use memoText (hashed) as the memoHash and transaction nullifiers as the railgunTxRef for the smart contract.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @railgun-community/wallet | 10.4.0 | Private transfer functions, proof generation | Official Railgun SDK |
| @railgun-community/shared-models | 7.6.1 | TXIDVersion, NetworkName, NETWORK_CONFIG, RailgunERC20AmountRecipient | Types and network config |
| ethers | 6.13.1 | Transaction signing, hashing utilities | Industry standard |
| react-hot-toast | 2.5.2 | Success/error notifications | Already used in codebase |

### Supporting (Already Available)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| level-js | 6.1.0 | IndexedDB for SDK persistence | SDK initialization |
| localforage | 1.10.0 | Artifact storage | ZK circuit caching |

### No Additional Libraries Needed
All required dependencies are already installed. The transfer pattern mirrors the shield pattern.

## Architecture Patterns

### Existing Project Structure (Use As-Is)
```
frontend/src/lib/
  railgun-clean/
    shield.js           # Pattern to follow
    operations/
      transfer.js       # TO CREATE - private transfer implementation
    index.js            # Add exports
  railgun-client-browser.js  # SDK wrapper with sendPrivateTransfer stub
  railgun/
    transactions/
      tx-transfer.ts        # TypeScript transfer implementation (REFERENCE)
      tx-proof-transfer.ts  # Proof generation implementation (REFERENCE)
      tx-generator.ts       # Transaction batch building (REFERENCE)
      proof-cache.ts        # Proof caching logic (REFERENCE)

frontend/src/components/railgun/
  PrivatePaymentModal.jsx   # UI component (MODIFY to use new transfer.js)
```

### Pattern 1: Three-Step Transfer Flow
**What:** Gas estimate, generate proof, populate transaction
**When to use:** Every private transfer operation
**Example:**
```javascript
// Source: Railgun docs + existing tx-transfer.ts
import {
  gasEstimateForUnprovenTransfer,
  generateTransferProof,
  populateProvedTransfer,
} from '@railgun-community/wallet';
import {
  NetworkName,
  NETWORK_CONFIG,
  TXIDVersion,
  EVMGasType,
  calculateGasPrice,
} from '@railgun-community/shared-models';

// Step 1: Gas Estimation
const gasEstimate = await gasEstimateForUnprovenTransfer(
  TXIDVersion.V2_PoseidonMerkle,  // txidVersion
  networkName,                     // NetworkName.EthereumSepolia
  railgunWalletID,                 // from stored wallet
  encryptionKey,                   // derived from signature
  memoText,                        // optional memo
  erc20AmountRecipients,           // [{tokenAddress, amount, recipientAddress}]
  [],                              // nftAmountRecipients (empty for ERC-20)
  originalGasDetails,              // {evmGasType, gasEstimate, maxFeePerGas, ...}
  feeTokenDetails,                 // for broadcaster fee (optional)
  sendWithPublicWallet             // true to skip broadcaster
);

// Step 2: Generate ZK Proof (20-30 seconds)
await generateTransferProof(
  TXIDVersion.V2_PoseidonMerkle,
  networkName,
  railgunWalletID,
  encryptionKey,
  showSenderAddressToRecipient,    // false for privacy
  memoText,
  erc20AmountRecipients,
  [],                              // nftAmountRecipients
  broadcasterFeeERC20AmountRecipient, // optional
  sendWithPublicWallet,
  overallBatchMinGasPrice,
  progressCallback                 // (progress, status) => {}
);

// Step 3: Populate Transaction
const { transaction, nullifiers, preTransactionPOIsPerTxidLeafPerList } =
  await populateProvedTransfer(
    TXIDVersion.V2_PoseidonMerkle,
    networkName,
    railgunWalletID,
    showSenderAddressToRecipient,
    memoText,
    erc20AmountRecipients,
    [],
    broadcasterFeeERC20AmountRecipient,
    sendWithPublicWallet,
    overallBatchMinGasPrice,
    gasDetails
  );
```

### Pattern 2: RailgunERC20AmountRecipient Structure
**What:** Structure token amounts for transfer functions
**When to use:** Building transfer parameters
**Example:**
```javascript
// Source: @railgun-community/shared-models
const erc20AmountRecipients = [{
  tokenAddress: WETH_ADDRESS,           // ERC-20 contract address
  amount: amountWei,                    // BigInt (NOT string for transfer)
  recipientAddress: sellerRailgunAddress // 0zk... format
}];
```

### Pattern 3: MemoHash Generation
**What:** Create deterministic hash from memo text for on-chain recording
**When to use:** Before transfer, to store with recordPrivatePayment()
**Example:**
```javascript
// Source: ethers.js + escrow contract requirements
import { keccak256, toUtf8Bytes } from 'ethers';

// Generate unique memo with product reference
const memoText = `EV-Battery-Payment:${productId}:${Date.now()}`;

// Hash for on-chain recording (bytes32)
const memoHash = keccak256(toUtf8Bytes(memoText));
// Result: 0x... (32 bytes)
```

### Pattern 4: RailgunTxRef from Nullifiers
**What:** Use transaction nullifiers as the railgunTxRef for on-chain recording
**When to use:** After transfer completes, for recordPrivatePayment()
**Example:**
```javascript
// Source: proof-cache.ts + escrow contract requirements
// populateProvedTransfer returns nullifiers array
const { transaction, nullifiers } = await populateProvedTransfer(...);

// Use first nullifier as transaction reference (bytes32)
const railgunTxRef = nullifiers[0]; // Already 0x... format

// OR hash multiple nullifiers if present
const railgunTxRef = nullifiers.length === 1
  ? nullifiers[0]
  : keccak256(ethers.solidityPacked(['bytes32[]'], [nullifiers]));
```

### Pattern 5: Encryption Key Derivation
**What:** Derive wallet encryption key from user signature
**When to use:** For any SDK operation requiring encryptionKey
**Example:**
```javascript
// Source: railgun-client-browser.js pattern
import { keccak256, toUtf8Bytes, getBytes } from 'ethers';

// Same signature used for wallet creation
const signature = await signer.signMessage('RAILGUN Wallet\nNetwork: Sepolia');
const encryptionKey = keccak256(toUtf8Bytes(String(signature)));

// For SDK functions expecting bytes
const encryptionKeyBytes = getBytes(encryptionKey);
```

### Pattern 6: Progress Callback for UX
**What:** Report proof generation progress to UI
**When to use:** During generateTransferProof (20-30 seconds)
**Example:**
```javascript
// Source: tx-generator.ts type definition
const progressCallback = (progress, status) => {
  // progress: 0-100
  // status: 'Generating proof...' etc.
  onProgress?.({
    step: 'proving',
    message: `Generating ZK proof... ${progress}%`,
    progress
  });
};

await generateTransferProof(
  // ... other params
  progressCallback
);
```

### Anti-Patterns to Avoid
- **String amounts in transfer:** Unlike shield which uses `.toString()`, transfers expect BigInt for amount
- **Missing encryptionKey:** Required for proof generation, derive from signature
- **Skipping gas estimation:** Gas estimate is required before proof generation
- **Not waiting for proof:** Proof generation is async and takes 20-30 seconds
- **Using memoText as memoHash directly:** Hash the memoText with keccak256 first

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ZK proof generation | Custom SNARK circuits | `generateTransferProof()` | Complex cryptography, SDK handles artifacts |
| Gas estimation | Manual calculation | `gasEstimateForUnprovenTransfer()` | ZK proofs have variable gas costs |
| Transaction building | Manual calldata | `populateProvedTransfer()` | Complex contract ABI encoding |
| POI verification | Custom POI logic | SDK's automatic POI | Required for spendability, SDK handles it |
| Nullifier extraction | Custom parsing | `populateProvedTransfer()` returns them | Part of SDK response |
| Address validation | Regex matching | `assertValidRailgunAddress()` from SDK | Proper cryptographic validation |

**Key insight:** The SDK handles all the cryptographic complexity. The three-step flow (estimate, prove, populate) is required - don't try to skip steps.

## Common Pitfalls

### Pitfall 1: Proof Not Cached
**What goes wrong:** `populateProvedTransfer` fails with "No proof found"
**Why it happens:** `generateTransferProof` caches the proof internally; not calling it first
**How to avoid:** Always call `generateTransferProof` before `populateProvedTransfer`
**Warning signs:** "Invalid proof for this transaction" error

### Pitfall 2: Parameter Mismatch Between Proof and Populate
**What goes wrong:** `populateProvedTransfer` throws "Mismatch: erc20AmountRecipients"
**Why it happens:** Parameters passed to populate don't match those used in proof generation
**How to avoid:** Use identical parameters for both `generateTransferProof` and `populateProvedTransfer`
**Warning signs:** Any "Mismatch:" error
**Current code reference:** See `proof-cache.ts:validateCachedProvedTransaction()`

### Pitfall 3: Missing Encryption Key
**What goes wrong:** Proof generation fails or produces invalid proof
**Why it happens:** encryptionKey not passed or derived incorrectly
**How to avoid:** Derive encryptionKey from same signature used for wallet creation
**Warning signs:** Cryptographic errors during proof generation
**Current code:** railgun-client-browser.js line 244-245

### Pitfall 4: Insufficient Spendable Balance
**What goes wrong:** Gas estimation fails with balance error
**Why it happens:** Checking total balance instead of spendable (ShieldPending != Spendable)
**How to avoid:** Check `RailgunWalletBalanceBucket.Spendable` balance before transfer
**Warning signs:** "Insufficient balance" when balance appears sufficient
**CONTEXT.md note:** On Sepolia testnet, pending balances are treated as spendable

### Pitfall 5: POI Proof Not Generated
**What goes wrong:** Recipient can't spend received tokens (marked "Incomplete")
**Why it happens:** Sender's wallet not open after transfer to generate POI
**How to avoid:** Wait for transfer confirmation with wallet open, SDK auto-generates POI
**Warning signs:** Recipient sees balance in "Incomplete" state
**SDK behavior:** POI is generated automatically by sender's wallet after tx confirms

### Pitfall 6: Wrong TXIDVersion
**What goes wrong:** "No deployment for chain" or similar errors
**Why it happens:** Using wrong TXIDVersion for network
**How to avoid:** Use `TXIDVersion.V2_PoseidonMerkle` (SDK 10.x default)
**Current code:** shield.js uses V2 with V3 fallback pattern

### Pitfall 7: RailgunTxRef Format
**What goes wrong:** `recordPrivatePayment` reverts with "Zero tx ref"
**Why it happens:** Passing undefined or invalid bytes32
**How to avoid:** Use nullifiers[0] from `populateProvedTransfer` response
**Warning signs:** Transaction fails at escrow contract

## Code Examples

Verified patterns from official sources and existing codebase:

### Complete Private Transfer Implementation
```javascript
// Source: Railgun docs + shield.js pattern + tx-transfer.ts
import { ethers } from 'ethers';
import {
  NetworkName,
  NETWORK_CONFIG,
  TXIDVersion,
  EVMGasType,
  calculateGasPrice,
  getEVMGasTypeForTransaction,
} from '@railgun-community/shared-models';
import {
  gasEstimateForUnprovenTransfer,
  generateTransferProof,
  populateProvedTransfer,
  refreshBalances,
} from '@railgun-community/wallet';
import { initializeSDK } from '../railgun-client-browser';

export async function privateTransfer({
  toRailgunAddress,
  amountWei,
  tokenAddress,
  productId,
  onProgress
}) {
  console.log('[Transfer] ===== START privateTransfer =====');

  // 1. Validate inputs
  if (!toRailgunAddress || !toRailgunAddress.startsWith('0zk')) {
    throw new Error('Invalid recipient Railgun address');
  }
  if (!amountWei || BigInt(amountWei) <= 0n) {
    throw new Error('Invalid transfer amount');
  }

  // 2. Ensure SDK is initialized
  const initResult = await initializeSDK();
  if (!initResult.success) {
    throw new Error(`SDK initialization failed: ${initResult.error}`);
  }

  // 3. Get wallet info from localStorage
  const stored = JSON.parse(localStorage.getItem('railgun.wallet') || 'null');
  if (!stored?.walletID || !stored?.encryptionKey) {
    throw new Error('No Railgun wallet connected');
  }
  const { walletID, encryptionKey } = stored;

  // 4. Setup network and addresses
  const networkName = NetworkName.EthereumSepolia;
  const sepoliaConfig = NETWORK_CONFIG[networkName];
  const chain = sepoliaConfig.chain;

  // Use WETH if no token specified
  const actualTokenAddress = tokenAddress || sepoliaConfig.baseToken.wrappedAddress;

  // 5. Build recipients array
  const erc20AmountRecipients = [{
    tokenAddress: actualTokenAddress,
    amount: BigInt(amountWei),
    recipientAddress: toRailgunAddress
  }];

  // 6. Generate memo and hash for on-chain recording
  const memoText = `EV-Battery-Payment:${productId || 'direct'}:${Date.now()}`;
  const memoHash = ethers.keccak256(ethers.toUtf8Bytes(memoText));

  // 7. Get provider and fee data
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const fee = await provider.getFeeData();

  const evmGasType = getEVMGasTypeForTransaction(networkName, true);
  const originalGasDetails = {
    evmGasType,
    gasEstimate: 0n, // Will be filled by gas estimation
    maxFeePerGas: BigInt(fee.maxFeePerGas ?? 0),
    maxPriorityFeePerGas: BigInt(fee.maxPriorityFeePerGas ?? 0),
  };

  onProgress?.({ step: 'estimate', message: 'Estimating gas...' });

  // 8. Estimate gas
  console.log('[Transfer] Estimating gas...');
  const gasEstimateResult = await gasEstimateForUnprovenTransfer(
    TXIDVersion.V2_PoseidonMerkle,
    networkName,
    walletID,
    encryptionKey,
    memoText,
    erc20AmountRecipients,
    [], // nftAmountRecipients
    originalGasDetails,
    undefined, // feeTokenDetails (no broadcaster)
    true // sendWithPublicWallet
  );

  console.log('[Transfer] Gas estimate:', gasEstimateResult);

  const gasDetails = {
    evmGasType,
    gasEstimate: BigInt(gasEstimateResult.gasEstimate),
    maxFeePerGas: BigInt(fee.maxFeePerGas ?? 0),
    maxPriorityFeePerGas: BigInt(fee.maxPriorityFeePerGas ?? 0),
  };

  // 9. Calculate batch min gas price
  const overallBatchMinGasPrice = calculateGasPrice(gasDetails);

  onProgress?.({ step: 'proving', message: 'Generating ZK proof... (this takes 20-30 seconds)' });

  // 10. Generate ZK proof
  console.log('[Transfer] Generating proof...');
  await generateTransferProof(
    TXIDVersion.V2_PoseidonMerkle,
    networkName,
    walletID,
    encryptionKey,
    false, // showSenderAddressToRecipient
    memoText,
    erc20AmountRecipients,
    [], // nftAmountRecipients
    undefined, // broadcasterFeeERC20AmountRecipient
    true, // sendWithPublicWallet
    overallBatchMinGasPrice,
    (progress, status) => {
      onProgress?.({
        step: 'proving',
        message: `Generating proof... ${Math.round(progress * 100)}%`,
        progress: Math.round(progress * 100)
      });
    }
  );

  console.log('[Transfer] Proof generated, populating transaction...');
  onProgress?.({ step: 'populate', message: 'Building transaction...' });

  // 11. Populate transaction
  const { transaction, nullifiers, preTransactionPOIsPerTxidLeafPerList } =
    await populateProvedTransfer(
      TXIDVersion.V2_PoseidonMerkle,
      networkName,
      walletID,
      false, // showSenderAddressToRecipient
      memoText,
      erc20AmountRecipients,
      [], // nftAmountRecipients
      undefined, // broadcasterFeeERC20AmountRecipient
      true, // sendWithPublicWallet
      overallBatchMinGasPrice,
      gasDetails
    );

  console.log('[Transfer] Transaction populated, nullifiers:', nullifiers);

  // 12. Extract railgunTxRef from nullifiers
  const railgunTxRef = nullifiers[0] || ethers.ZeroHash;

  onProgress?.({ step: 'sending', message: 'Sending transaction...' });

  // 13. Send transaction
  console.log('[Transfer] Sending transaction...');
  const tx = await signer.sendTransaction(transaction);
  console.log('[Transfer] Transaction sent, hash:', tx.hash);

  onProgress?.({ step: 'confirming', message: 'Waiting for confirmation...' });

  const receipt = await tx.wait();
  console.log('[Transfer] Transaction confirmed:', receipt.hash);

  // 14. Refresh balances
  try {
    await refreshBalances(chain, [walletID]);
  } catch (e) {
    console.warn('[Transfer] Balance refresh failed (non-critical):', e.message);
  }

  console.log('[Transfer] ===== END privateTransfer =====');

  return {
    success: true,
    txHash: receipt.hash,
    memoHash,
    railgunTxRef,
    nullifiers
  };
}
```

### Recording Private Payment On-Chain
```javascript
// Source: ProductEscrow contract + ethers pattern
import ProductEscrowABI from '../../abis/ProductEscrow_Initializer.json';

async function recordPaymentOnChain(productAddress, productId, memoHash, railgunTxRef, signer) {
  const escrow = new ethers.Contract(
    productAddress,
    ProductEscrowABI.abi,
    signer
  );

  // Call recordPrivatePayment(productId, memoHash, railgunTxRef)
  const tx = await escrow.recordPrivatePayment(
    productId,
    memoHash,      // bytes32 from keccak256(memoText)
    railgunTxRef   // bytes32 from nullifiers[0]
  );

  await tx.wait();
  return tx.hash;
}
```

### UI Progress Integration
```javascript
// Source: PrivatePaymentModal.jsx pattern
const [transferState, setTransferState] = useState({ step: 'idle', message: '' });

const handlePrivatePayment = async () => {
  try {
    setPaymentLoading(true);

    const result = await privateTransfer({
      toRailgunAddress: sellerRailgunAddress,
      amountWei: product.publicPriceWei,
      tokenAddress: WETH_ADDRESS,
      productId: product.id,
      onProgress: (state) => {
        setTransferState(state);
      }
    });

    if (result.success) {
      // Record on-chain
      await recordPaymentOnChain(
        product.address,
        product.id,
        result.memoHash,
        result.railgunTxRef,
        signer
      );

      toast.success('Private payment completed!');
    }
  } catch (error) {
    toast.error(`Payment failed: ${error.message}`);
  } finally {
    setPaymentLoading(false);
  }
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual proof generation | SDK's generateTransferProof | SDK 10.x | Simplified API |
| Manual POI handling | Automatic POI in SDK | POI deployment 2024 | No extra code needed |
| String amounts | BigInt amounts | SDK 10.x standardization | Type consistency |
| Broadcaster required | sendWithPublicWallet option | SDK enhancement | Direct wallet send supported |

**Current SDK Version:** @railgun-community/wallet 10.4.0

**Key SDK Functions for Transfer:**
- `gasEstimateForUnprovenTransfer` - Pre-proof gas estimation
- `generateTransferProof` - ZK proof generation (20-30 seconds)
- `populateProvedTransfer` - Build sendable transaction
- `refreshBalances` - Update wallet balances after transfer

**POI Handling:**
- POI is generated automatically by sender's wallet after transaction confirms
- Recipient's funds show as "Incomplete" until POI is generated
- Keep wallet open after transfer to ensure POI generation

## Open Questions

Things that couldn't be fully resolved:

1. **Exact Proof Generation Time on Sepolia**
   - What we know: Documentation says 20-30 seconds on slower devices
   - What's unclear: Actual time on user's browser/device
   - Recommendation: Show progress bar, allow cancel, test on various devices

2. **POI Generation Timing**
   - What we know: Generated automatically after tx confirms
   - What's unclear: Exact block delay until POI propagates
   - Recommendation: Inform user to keep wallet open, check POI status in UI

3. **Broadcaster vs Public Wallet**
   - What we know: Both work; broadcaster provides anonymity
   - What's unclear: Whether public wallet send is sufficient for supply chain use case
   - Recommendation: Start with sendWithPublicWallet=true (simpler), add broadcaster later if needed

4. **Multiple Token Transfers**
   - What we know: SDK supports multiple recipients in one tx
   - What's unclear: Whether we need this for the supply chain
   - Recommendation: Implement single recipient first (buyer->seller), extend later

## Sources

### Primary (HIGH confidence)
- [Railgun Private ERC-20 Transfers](https://docs.railgun.org/developer-guide/wallet/transactions/private-transfers/private-erc-20-transfers) - Transfer function parameters and flow
- [Railgun Private Proofs of Innocence](https://docs.railgun.org/wiki/assurance/private-proofs-of-innocence) - POI system overview
- Codebase: `frontend/src/lib/railgun/transactions/tx-transfer.ts` - Existing TypeScript implementation
- Codebase: `frontend/src/lib/railgun/transactions/tx-proof-transfer.ts` - Proof generation patterns
- Codebase: `frontend/src/lib/railgun/transactions/proof-cache.ts` - Proof caching and validation
- Codebase: `frontend/src/lib/railgun-clean/shield.js` - Pattern for SDK function calls
- Codebase: `contracts/ProductEscrow_Initializer.sol` - recordPrivatePayment() signature

### Secondary (MEDIUM confidence)
- [Railgun GitHub - wallet](https://github.com/Railgun-Community/wallet) - SDK source reference
- [npm @railgun-community/wallet](https://www.npmjs.com/package/@railgun-community/wallet) - Version 10.4.0 installed
- Codebase: `frontend/src/lib/railgun/transactions/tx-generator.ts` - Transaction batch building

### Tertiary (LOW confidence)
- WebSearch results on Railgun SDK - general patterns
- Medium articles on POI - conceptual understanding

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and working
- Architecture: HIGH - Existing TypeScript implementations in codebase
- Transfer functions: HIGH - Verified from official docs and existing code
- POI integration: MEDIUM - SDK handles automatically, but timing unclear
- MemoHash/TxRef: MEDIUM - Derived from contract requirements and SDK response

**Research date:** 2026-01-27
**Valid until:** 2026-03-27 (60 days - SDK is stable at 10.x)

## Implementation Guidance

### File to Create
`frontend/src/lib/railgun-clean/operations/transfer.js`

### Key Exports to Add to index.js
```javascript
// In frontend/src/lib/railgun-clean/index.js
export { privateTransfer, estimateTransferGas } from './operations/transfer';
```

### SDK Imports Pattern
```javascript
// Import from SDK (top-level named imports)
import {
  gasEstimateForUnprovenTransfer,
  generateTransferProof,
  populateProvedTransfer,
} from '@railgun-community/wallet';

import {
  NetworkName,
  NETWORK_CONFIG,
  TXIDVersion,
  EVMGasType,
  calculateGasPrice,
  getEVMGasTypeForTransaction,
} from '@railgun-community/shared-models';
```

### Critical Requirements
1. **Use TXIDVersion.V2_PoseidonMerkle** (not V3, not string)
2. **Use BigInt for amounts** (not string like shield)
3. **Call all three steps in order:** estimate -> generate proof -> populate
4. **Use identical parameters** for generateTransferProof and populateProvedTransfer
5. **Extract nullifiers[0] as railgunTxRef** for on-chain recording
6. **Hash memoText with keccak256** for memoHash

### UI Integration Points
- Show progress during proof generation (20-30 seconds)
- Display memoHash and railgunTxRef after transfer
- Add "Record on-chain" step after Railgun transfer completes
- Handle POI status display (funds may show as "Incomplete" briefly)
