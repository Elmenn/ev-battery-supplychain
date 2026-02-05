# Phase 6: On-Chain Recording - Research

**Researched:** 2026-02-05
**Domain:** Smart contract integration, UI state management, error handling
**Confidence:** HIGH

## Summary

This phase implements on-chain recording of private payment references by calling `recordPrivatePayment(productId, memoHash, railgunTxRef)` on the ProductEscrow contract after a Railgun transfer completes. The contract function sets `buyer = msg.sender`, `purchaseMode = PurchaseMode.Private`, `purchased = true`, and transitions `phase` from `Listed` to `Purchased`. The codebase already has patterns for this in `confirmPrivatePayment()` in ProductDetail.jsx, but that function is designed for seller confirmation. Phase 6 needs to trigger this immediately after private transfer in PrivatePaymentModal.

Key work involves: (1) calling recordPrivatePayment from PrivatePaymentModal immediately after privateTransfer succeeds, (2) showing toast with Etherscan link after recording, (3) storing transaction state in localStorage, (4) updating ProductCard badge to show "Purchased" status, and (5) decoding contract revert reasons for user-friendly errors.

**Primary recommendation:** Add recordPrivatePayment call to PrivatePaymentModal.handlePrivatePayment() after the privateTransfer succeeds. Buyer pays gas for this call. Use the existing toast pattern from PrivateFundsDrawer shield operation.

## Contract Interface

### recordPrivatePayment Function

**Source:** `contracts/ProductEscrow_Initializer.sol` lines 729-770

```solidity
function recordPrivatePayment(
    uint256 _productId,
    bytes32 _memoHash,
    bytes32 _railgunTxRef
) external nonReentrant whenNotStopped
```

**Parameters:**
| Parameter | Type | Source | Description |
|-----------|------|--------|-------------|
| `_productId` | uint256 | `contract.id()` | Product ID from escrow contract |
| `_memoHash` | bytes32 | Phase 5 transfer result | keccak256 hash of memo text |
| `_railgunTxRef` | bytes32 | Phase 5 transfer result | First nullifier from Railgun tx |

**Caller Restriction:**
```solidity
// Line 746
if (msg.sender != buyer && msg.sender != owner) revert NotParticipant();
```

**CRITICAL:** Only buyer or seller (owner) can call. Since `buyer` is initially `address(0)` before purchase, the **buyer who pays** becomes `msg.sender` and the function sets `buyer = payable(msg.sender)` on line 748.

**State Changes:**
```solidity
buyer = payable(msg.sender);           // Line 748
purchaseMode = PurchaseMode.Private;   // Line 749
purchased = true;                       // Line 750
purchaseTimestamp = uint64(block.timestamp);  // Line 751
phase = Phase.Purchased;               // Line 760
```

**Events Emitted:**
- `PurchasedPrivate(buyer, memoHash, railgunTxRef)` - Line 762
- `PhaseChanged(id, oldPhase, phase, msg.sender, timestamp, memoHash)` - Line 763
- `ProductStateChanged(...)` - Line 767
- `PrivatePaymentRecorded(id, memoHash, railgunTxRef, msg.sender, timestamp)` - Line 769

### Phase and PurchaseMode Enums

**Source:** `contracts/ProductEscrow_Initializer.sol`

```solidity
enum Phase { Listed, Purchased, OrderConfirmed, Bound, Delivered, Expired }
//           0       1          2               3      4          5

enum PurchaseMode { None, Public, Private }
//                  0     1       2
```

### Contract Revert Reasons

**Source:** `contracts/ProductEscrow_Initializer.sol` lines 7-66

| Error | When | User Message |
|-------|------|--------------|
| `WrongProductId()` | `_productId != id` | "Wrong product ID - check contract address" |
| `ZeroMemoHash()` | `_memoHash == bytes32(0)` | "Invalid memo hash - payment may have failed" |
| `ZeroTxRef()` | `_railgunTxRef == bytes32(0)` | "Invalid transaction reference" |
| `AlreadyPurchased()` | `phase != Phase.Listed` | "Product already purchased" |
| `PrivateDisabled()` | `!privateEnabled` | "Private payments are disabled for this product" |
| `AlreadyPaid()` | `productMemoHashes[id] != bytes32(0)` | "Payment already recorded" |
| `MemoAlreadyUsed()` | `usedMemoHash[_memoHash]` | "This payment was already used" |
| `PaymentAlreadyRecorded()` | `privatePayments[_memoHash]` | "Payment already confirmed on-chain" |
| `NotParticipant()` | `msg.sender != buyer && msg.sender != owner` | "Only buyer or seller can record payment" |

### ABI for recordPrivatePayment

**Source:** `frontend/src/abis/ProductEscrow_Initializer.json` lines 2024-2046

```json
{
  "inputs": [
    { "internalType": "uint256", "name": "_productId", "type": "uint256" },
    { "internalType": "bytes32", "name": "_memoHash", "type": "bytes32" },
    { "internalType": "bytes32", "name": "_railgunTxRef", "type": "bytes32" }
  ],
  "name": "recordPrivatePayment",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}
```

## Existing UI Patterns

### Toast with Etherscan Link

**Source:** `frontend/src/components/railgun/PrivateFundsDrawer.jsx` lines 188-203

```javascript
const explorerUrl = `https://sepolia.etherscan.io/tx/${result.txHash}`;
toast.success(
  <div>
    <p>WETH shielded successfully!</p>
    <a
      href={explorerUrl}
      target="_blank"
      rel="noreferrer"
      className="text-blue-500 underline text-sm"
    >
      View on Etherscan
    </a>
  </div>,
  { duration: 5000 }
);
```

### Explorer URL Helper

**Source:** `frontend/src/utils/errorHandler.js` lines 117-130

```javascript
export function getExplorerUrl(txHash, chainId = 11155111) {
  if (!txHash) return null;
  const explorerMap = {
    1: 'https://etherscan.io/tx/',
    11155111: 'https://sepolia.etherscan.io/tx/',
    137: 'https://polygonscan.com/tx/',
    1337: null, // Local network
  };
  const baseUrl = explorerMap[chainId] || explorerMap[11155111];
  return baseUrl ? `${baseUrl}${txHash}` : null;
}
```

### Contract Call Pattern

**Source:** `frontend/src/components/marketplace/ProductDetail.jsx` lines 302-336

```javascript
const signer = await provider.getSigner();
const contract = new ethers.Contract(address, ESCROW_ABI, signer);

// Preflight check with staticCall
await contract.recordPrivatePayment.staticCall(
  productId,
  pendingPayment.memoHash,
  pendingPayment.txRefBytes32
);

// Gas estimation
const estimatedGas = await contract.recordPrivatePayment.estimateGas(
  productId,
  pendingPayment.memoHash,
  pendingPayment.txRefBytes32
);

// Add 20% headroom
const gasLimit = (estimatedGas * 120n) / 100n;

// Send transaction
const tx = await contract.recordPrivatePayment(
  productId,
  pendingPayment.memoHash,
  pendingPayment.txRefBytes32,
  { gasLimit }
);

const receipt = await tx.wait();
```

### Error Handling for Contract Reverts

**Source:** `frontend/src/components/marketplace/ProductDetail.jsx` lines 367-398

```javascript
// Handle specific revert reasons
if (String(error).includes("NotParticipant")) {
  throw new Error('Preflight failed: NotParticipant - switch to the buyer account');
}

if (String(error).includes("AlreadyRecorded") ||
    String(error).includes("already recorded") ||
    String(error).includes("AlreadyPurchased")) {
  // Payment already recorded - clean up stale state
  toast.success('Payment was already confirmed on-chain! Receipt cleaned up.');
  return;
}
```

### Badge Logic in ProductCard

**Source:** `frontend/src/components/marketplace/ProductCard.jsx` lines 19-31

```javascript
let badge = { text: "Available", cls: "bg-gray-100 text-gray-700" };

if (ownerIsBuyer)
  badge = { text: "Delivered", cls: "bg-green-100 text-green-700" };
else if (hasTransporter)
  badge = { text: "In Delivery", cls: "bg-blue-100 text-blue-700" };
else if (product.purchased)
  badge = {
    text: "Awaiting Transporter",
    cls: "bg-yellow-100 text-yellow-800",
  };
else if (hasBuyer)
  badge = { text: "Awaiting Confirm", cls: "bg-orange-100 text-orange-800" };
```

**Issue:** Badge shows "Awaiting Transporter" for purchased. Need to add explicit "Purchased" badge for clarity.

### localStorage Keys

**Source:** `frontend/src/components/marketplace/ProductDetail.jsx` line 63

```javascript
const getPendingPrivatePaymentKey = (productAddress) =>
  `pending_private_payment_${productAddress}`;
```

**Data Structure from Phase 5:**
```javascript
// Source: PrivatePaymentModal.jsx lines 972-978
const pendingPaymentData = {
  productId: product.id || '1',
  txHash: hash,
  memoHash: result.memoHash,           // bytes32
  railgunTxRef: result.railgunTxRef,   // bytes32
  timestamp: Date.now(),
  productAddress: product.address || product.contractAddress
};
```

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ethers | 6.13.1 | Contract interaction, transaction signing | Industry standard |
| react-hot-toast | 2.5.2 | Success/error notifications | Already used throughout codebase |

### Supporting (Already Available)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ProductEscrowABI | - | Contract ABI | Already imported in components |
| errorHandler.js | - | Error formatting, explorer URLs | Already exists in utils |

### No Additional Libraries Needed
All required dependencies are already installed.

## Architecture Patterns

### Pattern 1: Record Immediately After Transfer

**What:** Call recordPrivatePayment right after privateTransfer succeeds, in the same flow
**When to use:** In PrivatePaymentModal.handlePrivatePayment() after receiving transfer result
**Example:**
```javascript
// After privateTransfer succeeds
const transferResult = await privateTransfer({...});

if (transferResult.success) {
  // Immediately record on-chain
  onProgress?.({ step: 'recording', message: 'Recording payment on-chain...' });

  const contract = new ethers.Contract(product.address, ESCROW_ABI, signer);
  const productId = await contract.id();

  const recordTx = await contract.recordPrivatePayment(
    productId,
    transferResult.memoHash,
    transferResult.railgunTxRef
  );

  const recordReceipt = await recordTx.wait();
}
```

### Pattern 2: Pending State in localStorage

**What:** Store intermediate state for resilience across page refreshes
**When to use:** Between Railgun transfer and on-chain recording
**Example:**
```javascript
// Before recording on-chain
const pendingKey = `pending_private_payment_${product.address}`;
const pendingData = {
  productId,
  txHash: transferResult.txHash,
  memoHash: transferResult.memoHash,
  railgunTxRef: transferResult.railgunTxRef,
  timestamp: Date.now(),
  status: 'recording' // New status for Phase 6
};
localStorage.setItem(pendingKey, JSON.stringify(pendingData));

// After successful recording
localStorage.removeItem(pendingKey);
// Or update status
pendingData.status = 'confirmed';
pendingData.recordTxHash = recordReceipt.hash;
```

### Pattern 3: Error Decoding

**What:** Map contract errors to user-friendly messages
**When to use:** In catch block after contract call fails
**Example:**
```javascript
const ERROR_MESSAGES = {
  'WrongProductId': 'Wrong product ID - check contract address',
  'ZeroMemoHash': 'Invalid memo hash - payment may have failed',
  'ZeroTxRef': 'Invalid transaction reference',
  'AlreadyPurchased': 'Product already purchased',
  'PrivateDisabled': 'Private payments are disabled for this product',
  'AlreadyPaid': 'Payment already recorded',
  'MemoAlreadyUsed': 'This payment was already used',
  'PaymentAlreadyRecorded': 'Payment already confirmed on-chain',
  'NotParticipant': 'Only buyer or seller can record payment'
};

function decodeContractError(error) {
  const errorStr = String(error);
  for (const [key, message] of Object.entries(ERROR_MESSAGES)) {
    if (errorStr.includes(key)) {
      return message;
    }
  }
  return error.reason || error.message || 'Transaction failed';
}
```

### Pattern 4: Toast with Etherscan Link

**What:** Show success toast with clickable link to block explorer
**When to use:** After recordPrivatePayment transaction confirms
**Example:**
```javascript
import { getExplorerUrl } from '../../utils/errorHandler';

const explorerUrl = getExplorerUrl(recordReceipt.hash, chainId);

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
```

### Anti-Patterns to Avoid

- **Separate step for recording:** User expects single flow; don't make them click "Record Payment" separately
- **Generic error messages:** Contract reverts have specific reasons; decode and show them
- **Losing memoHash/railgunTxRef:** Store in localStorage immediately after transfer, before recording
- **No retry mechanism:** If recording fails, user needs to be able to retry without re-transferring
- **Hiding transaction references:** User explicitly requested to see txHash, memoHash after purchase

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Explorer URLs | String concatenation | `getExplorerUrl()` from errorHandler.js | Handles multiple chains |
| Error messages | Generic catch | `decodeContractError()` with error map | User needs specific feedback |
| Gas estimation | Hard-coded 200000 | `contract.estimateGas()` + 20% | Actual gas varies |
| Contract calls | Raw ethers calls | Preflight with staticCall, then estimate, then send | Catches errors early |

## Common Pitfalls

### Pitfall 1: Recording Before Transfer Confirms
**What goes wrong:** Recording fails because Railgun transfer hasn't settled
**Why it happens:** Not waiting for transfer receipt
**How to avoid:** Wait for privateTransfer to return success with txHash
**Warning signs:** Recording tx pending indefinitely

### Pitfall 2: Double Recording
**What goes wrong:** User clicks button twice, second call reverts
**Why it happens:** Button not disabled during recording
**How to avoid:** Disable button with loading state, check localStorage for pending status
**Warning signs:** `PaymentAlreadyRecorded` or `AlreadyPurchased` error

### Pitfall 3: Lost State on Refresh
**What goes wrong:** User refreshes during recording, payment lost
**Why it happens:** Not persisting memoHash/railgunTxRef to localStorage
**How to avoid:** Save to localStorage before starting recording, add retry mechanism
**Warning signs:** User reports payment "disappeared"

### Pitfall 4: Wrong Error Decoding
**What goes wrong:** User sees generic "Transaction failed" instead of specific reason
**Why it happens:** Not parsing error string for custom error names
**How to avoid:** Check for each error name in error string, map to user message
**Warning signs:** Support requests about vague error messages

### Pitfall 5: NotParticipant Error After Seller Confirmation Removal
**What goes wrong:** Recording fails with NotParticipant
**Why it happens:** Backend seller confirmation was removed; buyer must call recordPrivatePayment
**How to avoid:** Buyer (msg.sender) calls recordPrivatePayment directly after transfer
**Warning signs:** Error when seller tries to confirm on behalf of buyer

## Code Examples

### Complete Recording Flow

```javascript
// In PrivatePaymentModal.handlePrivatePayment()

// 1. Execute private transfer (existing code)
const transferResult = await privateTransfer({
  toRailgunAddress: sellerRailgunAddress,
  amountWei: amount.toString(),
  tokenAddress,
  productId: product.id,
  onProgress
});

if (!transferResult.success) {
  throw new Error(transferResult.error || 'Transfer failed');
}

// 2. Store pending state for resilience
const pendingKey = `pending_private_payment_${product.address}`;
const pendingData = {
  productId: product.id,
  txHash: transferResult.txHash,
  memoHash: transferResult.memoHash,
  railgunTxRef: transferResult.railgunTxRef,
  timestamp: Date.now(),
  status: 'recording'
};
localStorage.setItem(pendingKey, JSON.stringify(pendingData));

// 3. Record on-chain
onProgress?.({ step: 'recording', message: 'Recording payment on-chain...' });

const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const contract = new ethers.Contract(product.address, ESCROW_ABI, signer);

// Get product ID from contract (not from product object - may be stale)
const contractProductId = await contract.id();

// Preflight check
try {
  await contract.recordPrivatePayment.staticCall(
    contractProductId,
    transferResult.memoHash,
    transferResult.railgunTxRef
  );
} catch (error) {
  const userMessage = decodeContractError(error);
  throw new Error(`Recording will fail: ${userMessage}`);
}

// Estimate gas
const estimatedGas = await contract.recordPrivatePayment.estimateGas(
  contractProductId,
  transferResult.memoHash,
  transferResult.railgunTxRef
);
const gasLimit = (estimatedGas * 120n) / 100n;

// Send transaction
const recordTx = await contract.recordPrivatePayment(
  contractProductId,
  transferResult.memoHash,
  transferResult.railgunTxRef,
  { gasLimit }
);

onProgress?.({ step: 'confirming', message: 'Waiting for confirmation...' });

const recordReceipt = await recordTx.wait();

// 4. Update localStorage
pendingData.status = 'confirmed';
pendingData.recordTxHash = recordReceipt.hash;
localStorage.setItem(pendingKey, JSON.stringify(pendingData));

// 5. Show success toast with Etherscan link
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
```

### Error Decoding Helper

```javascript
// In a new file or added to errorHandler.js

const CONTRACT_ERRORS = {
  'WrongProductId': 'Wrong product ID - check contract address',
  'ZeroMemoHash': 'Invalid memo hash - payment may have failed',
  'ZeroTxRef': 'Invalid transaction reference',
  'AlreadyPurchased': 'Product already purchased',
  'PrivateDisabled': 'Private payments are disabled for this product',
  'AlreadyPaid': 'Payment already recorded',
  'MemoAlreadyUsed': 'This payment was already used',
  'PaymentAlreadyRecorded': 'Payment already confirmed on-chain',
  'NotParticipant': 'Only buyer or seller can record payment'
};

export function decodeContractError(error) {
  const errorStr = String(error);

  // Check for known contract errors
  for (const [errorName, userMessage] of Object.entries(CONTRACT_ERRORS)) {
    if (errorStr.includes(errorName)) {
      return userMessage;
    }
  }

  // Fall back to extractErrorMessage from errorHandler.js
  return extractErrorMessage(error);
}
```

### Updated ProductCard Badge

```javascript
// In ProductCard.jsx

let badge = { text: "Available", cls: "bg-gray-100 text-gray-700" };

if (ownerIsBuyer) {
  badge = { text: "Delivered", cls: "bg-green-100 text-green-700" };
} else if (hasTransporter) {
  badge = { text: "In Delivery", cls: "bg-blue-100 text-blue-700" };
} else if (product.purchased && product.purchaseMode === 2) {
  // Private purchase (PurchaseMode.Private = 2)
  badge = { text: "Purchased", cls: "bg-purple-100 text-purple-700" };
} else if (product.purchased) {
  // Public purchase
  badge = { text: "Purchased", cls: "bg-yellow-100 text-yellow-800" };
} else if (hasBuyer) {
  badge = { text: "Awaiting Confirm", cls: "bg-orange-100 text-orange-800" };
}
```

### Retry Mechanism for Failed Recording

```javascript
// Check for pending payment on ProductDetail mount
useEffect(() => {
  const pendingKey = `pending_private_payment_${address}`;
  const pendingRaw = localStorage.getItem(pendingKey);

  if (pendingRaw) {
    const pending = JSON.parse(pendingRaw);
    if (pending.status === 'recording' && pending.memoHash && pending.railgunTxRef) {
      // Show retry button
      setPendingPaymentData(pending);
      setShowRetryButton(true);
    }
  }
}, [address]);

// Retry recording handler
const handleRetryRecording = async () => {
  if (!pendingPaymentData) return;

  setRetrying(true);
  try {
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(address, ESCROW_ABI, signer);
    const productId = await contract.id();

    const tx = await contract.recordPrivatePayment(
      productId,
      pendingPaymentData.memoHash,
      pendingPaymentData.railgunTxRef
    );

    const receipt = await tx.wait();

    // Update localStorage
    pendingPaymentData.status = 'confirmed';
    pendingPaymentData.recordTxHash = receipt.hash;
    localStorage.setItem(
      `pending_private_payment_${address}`,
      JSON.stringify(pendingPaymentData)
    );

    toast.success('Payment recorded on-chain!');
    setShowRetryButton(false);
    loadProductData(); // Refresh product state

  } catch (error) {
    const userMessage = decodeContractError(error);
    toast.error(userMessage);
  } finally {
    setRetrying(false);
  }
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Seller confirms payment | Buyer records payment | Phase 6 (backend removal) | Buyer pays gas, simpler flow |
| Backend pending receipts | localStorage pending state | Phase 5-6 transition | No backend dependency |
| Generic error messages | Decoded contract errors | Phase 6 requirement | Better UX |

## Open Questions

1. **Retry on Different Device**
   - What we know: localStorage is device-local
   - What's unclear: How does user retry if they started on mobile, finish on desktop?
   - Recommendation: Store minimal data (memoHash, railgunTxRef) - user can enter manually if needed

2. **Gas Price Spikes**
   - What we know: Buyer pays gas for recordPrivatePayment
   - What's unclear: Behavior if gas spikes between transfer and recording
   - Recommendation: Show estimated gas cost before recording, allow cancel

3. **PurchaseMode Display**
   - What we know: Contract stores purchaseMode (0=None, 1=Public, 2=Private)
   - What's unclear: Should badge differentiate private vs public purchases?
   - Recommendation: Show "Purchased" for both, add icon/tooltip for private (Claude's discretion)

## Sources

### Primary (HIGH confidence)
- `contracts/ProductEscrow_Initializer.sol` - recordPrivatePayment implementation, error definitions
- `frontend/src/abis/ProductEscrow_Initializer.json` - ABI for function signature
- `frontend/src/components/marketplace/ProductDetail.jsx` - Existing confirmPrivatePayment pattern
- `frontend/src/components/railgun/PrivateFundsDrawer.jsx` - Toast with Etherscan link pattern
- `frontend/src/utils/errorHandler.js` - getExplorerUrl helper

### Secondary (MEDIUM confidence)
- Phase 5 RESEARCH.md and SUMMARY.md - privateTransfer return values
- `frontend/src/components/railgun/PrivatePaymentModal.jsx` - Current payment flow

## Metadata

**Confidence breakdown:**
- Contract interface: HIGH - Verified from Solidity source
- Error handling: HIGH - Error names from contract, patterns from codebase
- UI patterns: HIGH - Existing code in codebase
- localStorage patterns: HIGH - Already used in Phase 5

**Research date:** 2026-02-05
**Valid until:** 2026-04-05 (60 days - contract and UI patterns are stable)
