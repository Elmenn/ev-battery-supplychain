# Phase 4: WETH Shielding (Public to Private) - Research

**Researched:** 2026-01-26
**Domain:** Railgun SDK shielding, private balance management, transaction UX
**Confidence:** HIGH

## Summary

This phase implements WETH shielding from public wallet to Railgun private balance. The codebase already has partial implementation in `shield.js` with `shieldWETH()` and `estimateShieldWETH()` functions, but these have known issues with SDK function parameters (V2 vs chain object confusion). The private balance display infrastructure exists in `railgun-client-browser.js` with a balance cache pattern.

Key work involves: (1) fixing the shielding functions to use correct SDK API, (2) implementing reliable private balance fetching and display, (3) adding UI feedback per CONTEXT.md decisions (spinner, toast with Etherscan link, side-by-side balances).

**Primary recommendation:** Fix existing `shield.js` functions using verified SDK parameters, leverage the balance callback infrastructure already in `railgun-client-browser.js`, and update `PrivateFundsDrawer.jsx` UI to show side-by-side public/private WETH balances with proper loading states.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @railgun-community/wallet | 10.4.0 | Shield transactions, balance refresh | Official Railgun SDK |
| @railgun-community/shared-models | 7.6.1 | NETWORK_CONFIG, TXIDVersion, EVMGasType | Types and network config |
| ethers | 6.13.1 | ERC-20 approval, transaction signing | Industry standard |
| react-hot-toast | 2.5.2 | Success/error notifications | Already used in codebase |

### Supporting (Already Available)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| level-js | 6.1.0 | IndexedDB for SDK persistence | SDK initialization |
| localforage | 1.10.0 | Artifact storage | SDK artifact caching |

### No Additional Libraries Needed
All required dependencies are already installed. The codebase has working patterns for all needed functionality.

## Architecture Patterns

### Existing Project Structure (Use As-Is)
```
frontend/src/lib/
  railgun-clean/
    shield.js           # shieldWETH, estimateShieldWETH (MODIFY)
    balances.js         # getAllBalances (MODIFY for private balance)
    index.js            # Public API exports
  railgun-client-browser.js  # SDK wrapper with balance cache (REFERENCE)
  railgun/
    wallets/balance-update.ts  # setOnBalanceUpdateCallback (REFERENCE)
    wallets/balances.ts        # refreshBalances implementation (REFERENCE)

frontend/src/components/railgun/
  PrivateFundsDrawer.jsx     # UI component (MODIFY)

frontend/src/helpers/
  format.js                  # fmt18() for BigInt display (USE)
```

### Pattern 1: SDK Shield Function Call
**What:** Call gasEstimateForShield and populateShield with correct parameters
**When to use:** Every shield operation
**Example:**
```javascript
// Source: Railgun docs + shield.js analysis
import {
  gasEstimateForShield,
  populateShield,
  getShieldPrivateKeySignatureMessage,
} from '@railgun-community/wallet';
import { NETWORK_CONFIG, NetworkName, TXIDVersion } from '@railgun-community/shared-models';

// Get chain from NETWORK_CONFIG (NOT NetworkName string)
const network = NetworkName.EthereumSepolia;
const chain = NETWORK_CONFIG[network].chain;

// Shield private key from user signature
const baseMsg = getShieldPrivateKeySignatureMessage();
const sig = await signer.signMessage(baseMsg);
const shieldPrivateKey = ethers.keccak256(ethers.toUtf8Bytes(sig));

// Estimate gas
const gasEstimate = await gasEstimateForShield(
  TXIDVersion.V2_PoseidonMerkle,  // txidVersion enum, NOT string
  chain,                           // Chain object, NOT network name
  shieldPrivateKey,
  erc20AmountRecipients,           // [{ tokenAddress, amount, recipientAddress }]
  [],                              // nftAmountRecipients (empty for ERC-20)
  fromWalletAddress
);
```

### Pattern 2: ERC-20 Amount Recipients Format
**What:** Structure token amounts for shield functions
**When to use:** Building shield transaction parameters
**Example:**
```javascript
// Source: Railgun SDK types + existing shield.js
const erc20AmountRecipients = [{
  tokenAddress: WETH_ADDRESS,           // ERC-20 contract address
  amount: amountWei.toString(),         // Wei as string (NOT BigInt directly)
  recipientAddress: railgunAddress      // 0zk... format Railgun address
}];
```

### Pattern 3: ERC-20 Approval Before Shield
**What:** Approve proxy contract to spend WETH before shielding
**When to use:** Before every shield transaction
**Example:**
```javascript
// Source: shield.js lines 232-254
const spender = NETWORK_CONFIG[network].proxyContract;

const erc20 = new ethers.Contract(WETH_ADDRESS, [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
], signer);

const allowance = await erc20.allowance(fromWalletAddress, spender);
if (allowance < amountWei) {
  const approveTx = await erc20.approve(spender, amountWei);
  await approveTx.wait();
}
```

### Pattern 4: Balance Cache with Callbacks
**What:** Use SDK balance callbacks to cache private balances
**When to use:** Displaying private balances
**Example:**
```javascript
// Source: railgun-client-browser.js lines 14-36
const balanceCache = new Map(); // key: `${walletID}:${bucket}` => RailgunBalancesEvent

SDK.setOnBalanceUpdateCallback((evt) => {
  // evt.balanceBucket: 'Spendable', 'ShieldPending', etc.
  balanceCache.set(`${evt.railgunWalletID}:${evt.balanceBucket}`, evt);
});

// Access cached balance
const spendableEvt = balanceCache.get(`${walletID}:Spendable`);
const wethBalance = spendableEvt?.erc20Amounts?.find(
  a => a.tokenAddress.toLowerCase() === WETH_ADDRESS.toLowerCase()
)?.amount ?? 0n;
```

### Pattern 5: Etherscan Link in Toast
**What:** Show clickable transaction link in toast notification
**When to use:** After successful shield transaction
**Example:**
```javascript
// Source: ProductDetail.jsx pattern + CONTEXT.md requirement
const explorerUrl = `https://sepolia.etherscan.io/tx/${txHash}`;

toast.success(
  <span>
    WETH shielded successfully!{' '}
    <a href={explorerUrl} target="_blank" rel="noreferrer" className="underline">
      View on Etherscan
    </a>
  </span>,
  { duration: 5000 }
);
```

### Anti-Patterns to Avoid
- **Using NetworkName string where Chain object expected:** SDK functions use `chain` object from NETWORK_CONFIG, not string
- **Using 'V2_PoseidonMerkle' string literal:** Import and use `TXIDVersion.V2_PoseidonMerkle` enum
- **Passing BigInt directly to SDK:** Convert to string with `.toString()` first
- **Polling for balances:** Use SDK balance callbacks instead

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Shield signature | Custom signing logic | `getShieldPrivateKeySignatureMessage()` from SDK | SDK provides exact message format |
| Gas estimation | Manual gas math | `gasEstimateForShield()` from SDK | Handles ZK proof complexity |
| Transaction building | Manual calldata | `populateShield()` from SDK | Complex contract interaction |
| Balance formatting | Custom BigInt formatter | `fmt18()` from helpers/format.js | Already handles all edge cases |
| Proxy contract address | Hardcoded address | `NETWORK_CONFIG[network].proxyContract` | SDK maintains correct addresses |
| Balance bucket logic | Custom state tracking | SDK's `RailgunWalletBalanceBucket` enum | POI system categorization |

**Key insight:** The Railgun SDK handles complex ZK proof generation and contract interaction. The existing `railgun-client-browser.js` already has working balance callback infrastructure that just needs to be properly utilized.

## Common Pitfalls

### Pitfall 1: TXIDVersion String vs Enum
**What goes wrong:** Shield functions fail with "Invalid txidVersion" or "No deployment for chain"
**Why it happens:** Using string `'V2_PoseidonMerkle'` instead of `TXIDVersion.V2_PoseidonMerkle` enum
**How to avoid:** Always import and use the enum from @railgun-community/shared-models
**Warning signs:** Error messages mentioning txidVersion or deployment
**Current code issue:** `shield.js` uses string literals in some places

### Pitfall 2: NetworkName vs Chain Object
**What goes wrong:** Shield functions fail with chain-related errors
**Why it happens:** Passing `NetworkName.EthereumSepolia` (string) where `chain` object expected
**How to avoid:** Get chain from `NETWORK_CONFIG[NetworkName.EthereumSepolia].chain`
**Warning signs:** Errors mentioning "chain.type" or "chain.id" undefined
**Current code note:** Existing shield.js correctly extracts chain but comments are confusing

### Pitfall 3: Balance Callback Not Registered
**What goes wrong:** Private balance always shows 0 even after shielding
**Why it happens:** `setOnBalanceUpdateCallback` not called during SDK init
**How to avoid:** Call `ensureBalanceCallback()` before any balance operations
**Warning signs:** balanceCache Map stays empty, no callback logs
**Current code:** `railgun-client-browser.js` has `ensureBalanceCallback()` function

### Pitfall 4: ShieldPending vs Spendable Balance
**What goes wrong:** User shields WETH but balance shows 0
**Why it happens:** Shielded funds start in `ShieldPending` bucket, not `Spendable`
**How to avoid:** Display both Spendable and ShieldPending balances in UI with clear labels
**Warning signs:** Balance appears after ~15 blocks but shows 0 immediately
**CONTEXT.md decision:** Already specifies showing pending balance

### Pitfall 5: Missing ERC-20 Approval
**What goes wrong:** Shield transaction reverts
**Why it happens:** Proxy contract not approved to spend user's WETH
**How to avoid:** Check allowance and approve before shield (existing code does this)
**Warning signs:** "ERC20: transfer amount exceeds allowance" error
**Current code:** shield.js handles this correctly

### Pitfall 6: Amount as BigInt vs String
**What goes wrong:** SDK functions fail or produce wrong amounts
**Why it happens:** Passing BigInt where string expected
**How to avoid:** Always use `.toString()` for amounts in `erc20AmountRecipients`
**Warning signs:** Type errors or amounts multiplied/divided unexpectedly

## Code Examples

Verified patterns from official sources and existing codebase:

### Complete Shield Flow
```javascript
// Source: Railgun docs + existing shield.js pattern
export async function shieldWETH(amountWeth, signer) {
  // 1. Get chain and addresses
  const network = NetworkName.EthereumSepolia;
  const chain = NETWORK_CONFIG[network].chain;
  const WETH_ADDRESS = NETWORK_CONFIG[network].baseToken.wrappedAddress;
  const proxyContract = NETWORK_CONFIG[network].proxyContract;

  const stored = JSON.parse(localStorage.getItem('railgun.wallet'));
  const railgunAddress = stored.railgunAddress;
  const fromWalletAddress = await signer.getAddress();
  const amountWei = ethers.parseEther(String(amountWeth));

  // 2. Approve WETH spending
  const erc20 = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, signer);
  const allowance = await erc20.allowance(fromWalletAddress, proxyContract);
  if (allowance < amountWei) {
    const approveTx = await erc20.approve(proxyContract, amountWei);
    await approveTx.wait();
  }

  // 3. Get shield private key
  const msg = getShieldPrivateKeySignatureMessage();
  const sig = await signer.signMessage(msg);
  const shieldPrivateKey = ethers.keccak256(ethers.toUtf8Bytes(sig));

  // 4. Build recipients
  const erc20AmountRecipients = [{
    tokenAddress: WETH_ADDRESS,
    amount: amountWei.toString(),
    recipientAddress: railgunAddress
  }];

  // 5. Estimate gas
  const gasEstimate = await gasEstimateForShield(
    TXIDVersion.V2_PoseidonMerkle,
    chain,
    shieldPrivateKey,
    erc20AmountRecipients,
    [],
    fromWalletAddress
  );

  // 6. Get gas details
  const fee = await signer.provider.getFeeData();
  const gasDetails = {
    evmGasType: EVMGasType.Type2,
    gasEstimate: BigInt(gasEstimate.gasEstimate),
    maxFeePerGas: fee.maxFeePerGas,
    maxPriorityFeePerGas: fee.maxPriorityFeePerGas
  };

  // 7. Populate and send
  const { transaction } = await populateShield(
    TXIDVersion.V2_PoseidonMerkle,
    chain,
    shieldPrivateKey,
    erc20AmountRecipients,
    [],
    gasDetails
  );

  const tx = await signer.sendTransaction(transaction);
  const receipt = await tx.wait();

  // 8. Trigger balance refresh
  await refreshBalances(chain, [stored.walletID]);

  return { success: true, txHash: receipt.hash };
}
```

### Balance Display Component Pattern
```javascript
// Source: PrivateFundsDrawer.jsx pattern + CONTEXT.md decisions
function BalanceDisplay({ publicWeth, privateWeth, pendingWeth, isLoading }) {
  return (
    <div className="flex gap-4">
      {/* Public WETH */}
      <div className="flex-1 p-3 bg-gray-50 rounded-lg">
        <span className="text-xs text-gray-500 uppercase">Public</span>
        <p className="font-mono text-lg">
          {isLoading ? <Spinner /> : `${fmt18(publicWeth)} WETH`}
        </p>
      </div>

      {/* Private WETH */}
      <div className="flex-1 p-3 bg-purple-50 rounded-lg">
        <span className="text-xs text-purple-500 uppercase">Private</span>
        <p className="font-mono text-lg text-purple-700">
          {isLoading ? <Spinner /> : `${fmt18(privateWeth)} WETH`}
        </p>
        {pendingWeth > 0n && (
          <p className="text-xs text-orange-500">
            +{fmt18(pendingWeth)} pending
          </p>
        )}
      </div>
    </div>
  );
}
```

### Toast with Etherscan Link
```javascript
// Source: ProductDetail.jsx pattern + react-hot-toast docs
import toast from 'react-hot-toast';

function showSuccessToast(txHash) {
  const explorerUrl = `https://sepolia.etherscan.io/tx/${txHash}`;

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
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| String txidVersion | `TXIDVersion.V2_PoseidonMerkle` enum | SDK 10.x | Type safety, correct deployments |
| NetworkName for functions | Chain object from NETWORK_CONFIG | SDK 10.x | Correct chain identification |
| Polling for balances | Balance update callbacks | SDK pattern | Efficient, real-time updates |
| Single balance bucket | Multiple buckets (Spendable, Pending, etc.) | POI system | Privacy compliance |

**Current SDK Version:** @railgun-community/wallet 10.4.0

**Balance Buckets (RailgunWalletBalanceBucket):**
- `Spendable` - Ready to use in private transactions
- `ShieldPending` - Newly shielded, waiting for block confirmations
- `ProofSubmitted` - POI proof submitted, awaiting confirmation
- `MissingInternalPOI` / `MissingExternalPOI` - Needs POI attestation
- `ShieldBlocked` - Blocked from use
- `Spent` - Already used

## Open Questions

Things that couldn't be fully resolved:

1. **ShieldPending Duration**
   - What we know: Shielded funds start in ShieldPending bucket
   - What's unclear: Exact block count before moving to Spendable on Sepolia
   - Recommendation: Display pending balance with "pending" label, let SDK handle transition

2. **V2 vs V3 TXIDVersion**
   - What we know: Current code tries V2 then V3 as fallback
   - What's unclear: When to use V3_PoseidonMerkle
   - Recommendation: Use V2 as primary (SDK 10.4.0 default), log if V3 needed

3. **Balance Refresh Timing After Shield**
   - What we know: `refreshBalances()` triggers scan, callback fires on completion
   - What's unclear: How long until ShieldPending balance appears
   - Recommendation: Wait for confirmation vs optimistic - CONTEXT.md defers to Claude's discretion
   - Recommendation: Wait for tx confirmation, then call refreshBalances, show spinner during

## Sources

### Primary (HIGH confidence)
- [Railgun Shield ERC-20 Tokens](https://docs.railgun.org/developer-guide/wallet/transactions/shielding/shield-erc-20-tokens) - gasEstimateForShield, populateShield API
- [Railgun Balance Callbacks](https://docs.railgun.org/developer-guide/wallet/private-balances/balance-and-sync-callbacks) - setOnBalanceUpdateCallback, RailgunBalancesEvent
- [Railgun Updating Balances](https://docs.railgun.org/developer-guide/wallet/private-balances/updating-balances) - refreshBalances usage
- Codebase: `frontend/src/lib/railgun-clean/shield.js` - Existing implementation to fix
- Codebase: `frontend/src/lib/railgun-client-browser.js` - Balance cache pattern
- Codebase: `frontend/src/lib/railgun/wallets/balance-update.ts` - RailgunBalancesEvent structure

### Secondary (MEDIUM confidence)
- [Railgun Shield Base Token](https://docs.railgun.org/developer-guide/wallet/transactions/shielding/shield-base-token) - Base token shield (alternative approach)
- Codebase: `frontend/src/lib/railgun/wallets/balances.ts` - refreshBalances implementation details
- Codebase: `frontend/src/components/marketplace/ProductDetail.jsx` - Etherscan link pattern

### Tertiary (LOW confidence)
- WebSearch results on Railgun SDK versions - general guidance

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and working
- Architecture: HIGH - Existing patterns in codebase, official docs verified
- Pitfalls: HIGH - Identified from current code issues and SDK documentation
- Balance display: MEDIUM - Integration with existing callback system needs testing

**Research date:** 2026-01-26
**Valid until:** 2026-03-26 (60 days - SDK is stable at 10.x)

## Implementation Guidance

### Critical Fixes Needed in shield.js

1. **Import TXIDVersion enum:**
```javascript
import { TXIDVersion } from '@railgun-community/shared-models';
```

2. **Use enum instead of string:**
```javascript
// WRONG
'V2_PoseidonMerkle'

// CORRECT
TXIDVersion.V2_PoseidonMerkle
```

3. **Verify chain object extraction:**
```javascript
// Already correct in code but verify:
const chain = NETWORK_CONFIG[network].chain;
```

### UI Changes for PrivateFundsDrawer.jsx

Per CONTEXT.md decisions:
1. Side-by-side layout: "Public: X WETH | Private: Y WETH"
2. WETH only focus (not all tokens)
3. Loading spinner during fetch/update
4. Simple spinner with "Shielding WETH..." during shield
5. Toast with Etherscan link on success
6. Error handling: Claude's discretion based on error type

### Recommended Balance Update Timing

Per Claude's discretion (CONTEXT.md):
- **Approach:** Wait for transaction confirmation, then trigger balance refresh
- **Rationale:** Optimistic updates could show wrong balance if tx fails; waiting is safer
- **Implementation:** Show spinner until refreshBalances callback fires
