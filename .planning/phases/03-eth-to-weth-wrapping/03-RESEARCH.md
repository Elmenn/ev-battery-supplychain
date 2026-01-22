# Phase 3: ETH to WETH Wrapping - Research

**Researched:** 2026-01-22
**Domain:** Ethereum token wrapping, WETH9 contract interaction, ethers.js v6
**Confidence:** HIGH

## Summary

This phase involves fixing the existing `wrapETHtoWETH()` function in `shield.js` to work correctly with the UI. The function is already implemented but there is a critical bug: the `PrivateFundsDrawer.jsx` component calls `wrapETHtoWETH(wrapAmt)` without passing the required `signer` parameter, causing the function to throw "Signer required for wrapETHtoWETH".

The solution is straightforward: either (a) update the function to obtain the signer internally from `window.ethereum`, or (b) update the UI to pass the signer. Option (a) is preferred for API simplicity and consistency with other railgun-clean functions.

**Primary recommendation:** Modify `wrapETHtoWETH()` to obtain signer from MetaMask when not provided, making the signer parameter optional. This matches the pattern used in `getAllBalances()` which also obtains the provider/signer internally.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ethers | 6.13.1 | Ethereum interaction | Already in use; v6 API for BrowserProvider |
| @railgun-community/shared-models | 7.6.1 | NETWORK_CONFIG with WETH address | Provides canonical WETH address for Sepolia |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-hot-toast | 2.5.2 | User feedback | Already used for success/error notifications |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct WETH9 contract call | Railgun SDK `populateShieldBaseToken` | SDK bundles wrap+shield; we need wrap-only for Phase 3 |

**No new dependencies required.** All necessary packages are already installed.

## Architecture Patterns

### Current File Structure
```
frontend/src/lib/railgun-clean/
  shield.js           # Contains wrapETHtoWETH(), shieldWETH()
  balances.js         # Contains getAllBalances() - reference for pattern
  index.js            # Exports wrapETHtoWETH
```

### Pattern 1: Internal Signer Resolution

**What:** Functions obtain signer from `window.ethereum` when not provided
**When to use:** For API simplicity; caller doesn't need to manage signer
**Example:**
```javascript
// Source: balances.js pattern (lines 18-22)
export async function wrapETHtoWETH(amountEth, signer = null) {
  // If no signer provided, get from MetaMask
  if (!signer && typeof window !== 'undefined' && window.ethereum) {
    const provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
  }

  if (!signer) {
    throw new Error('MetaMask not connected');
  }
  // ... rest of function
}
```

### Pattern 2: WETH Address from SDK Config

**What:** Use NETWORK_CONFIG from @railgun-community/shared-models for WETH address
**When to use:** Always, for consistency and correct network support
**Example:**
```javascript
// Source: shield.js (lines 27-29)
const networkName = NetworkName.EthereumSepolia;
const sepoliaConfig = NETWORK_CONFIG[networkName];
const WETH_ADDRESS = sepoliaConfig?.baseToken?.wrappedAddress
  || '0xfff9976782d46cc05630d1f6ebab18b2324d6b14';
```

### Pattern 3: Transaction Result Format

**What:** Return consistent `{ success, txHash?, error? }` format
**When to use:** All transaction operations
**Example:**
```javascript
// Source: shield.js pattern
return { success: true, txHash: receipt.hash };
// or
return { success: false, error: error.message };
```

### Anti-Patterns to Avoid
- **Requiring signer parameter when component already has MetaMask connected:** Creates unnecessary coupling and verbose UI code
- **Hardcoding WETH addresses:** Use NETWORK_CONFIG fallback pattern for multi-network support
- **Throwing errors for user-facing operations:** Return `{ success: false, error }` instead for graceful UI handling

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WETH address lookup | Hardcoded address | `NETWORK_CONFIG[network].baseToken.wrappedAddress` | Multi-network support, SDK-verified addresses |
| Error message extraction | Custom parsing | `extractErrorMessage()` from `errorHandler.js` | Consistent error handling across app |
| Provider/signer setup | Manual `new ethers.providers.Web3Provider()` | `new ethers.BrowserProvider(window.ethereum)` | ethers v6 API |

**Key insight:** The WETH9 contract is standard across all EVM chains. The only variable is the contract address, which the SDK provides.

## Common Pitfalls

### Pitfall 1: Missing Signer Parameter (Current Bug)

**What goes wrong:** UI calls `wrapETHtoWETH(amount)` but function requires `wrapETHtoWETH(amount, signer)`
**Why it happens:** Function signature expects signer, but UI doesn't pass it
**How to avoid:** Make signer optional with internal resolution
**Warning signs:** Error "Signer required for wrapETHtoWETH" in console

### Pitfall 2: ethers v5 vs v6 API Confusion

**What goes wrong:** Using `ethers.utils.parseEther()` instead of `ethers.parseEther()`
**Why it happens:** Many tutorials/examples use v5 syntax
**How to avoid:** Always use v6 imports: `import { ethers } from 'ethers'` then `ethers.parseEther()`
**Warning signs:** "ethers.utils is undefined" error

### Pitfall 3: Not Waiting for Transaction Receipt

**What goes wrong:** UI shows success before transaction is mined
**Why it happens:** Returning after `wethContract.deposit()` without `tx.wait()`
**How to avoid:** Always `await tx.wait()` before returning success
**Warning signs:** Balance doesn't update; transaction may fail silently

### Pitfall 4: Insufficient ETH for Gas + Value

**What goes wrong:** User tries to wrap 1.0 ETH but has exactly 1.0 ETH (no gas)
**Why it happens:** UI allows wrapping full balance
**How to avoid:** Check `ethBalance > wrapAmount + estimatedGas` before transaction
**Warning signs:** "insufficient funds for intrinsic transaction cost" error

### Pitfall 5: Wrong WETH Address on Sepolia

**What goes wrong:** Transaction succeeds but balance doesn't update in Railgun
**Why it happens:** Multiple WETH contracts exist on Sepolia
**How to avoid:** Use SDK's `NETWORK_CONFIG[NetworkName.EthereumSepolia].baseToken.wrappedAddress`
**Warning signs:** WETH balance shows 0 after successful wrap

## Code Examples

Verified patterns from official sources:

### WETH9 Contract Interface
```javascript
// Source: https://github.com/gnosis/canonical-weth/blob/master/contracts/WETH9.sol
const wethABI = [
  'function deposit() public payable',               // Wrap ETH to WETH
  'function withdraw(uint wad) public',              // Unwrap WETH to ETH
  'function balanceOf(address) public view returns (uint256)',
  'function approve(address guy, uint wad) public returns (bool)',
  'event Deposit(address indexed dst, uint wad)',
  'event Withdrawal(address indexed src, uint wad)'
];
```

### ethers v6 Payable Function Call
```javascript
// Source: https://docs.ethers.org/v6/getting-started/
const wethContract = new ethers.Contract(WETH_ADDRESS, wethABI, signer);
const tx = await wethContract.deposit({ value: ethers.parseEther(amountEth) });
const receipt = await tx.wait();
console.log('Wrap confirmed:', receipt.hash);
```

### MetaMask Signer in ethers v6
```javascript
// Source: https://docs.ethers.org/v6/getting-started/
if (window.ethereum) {
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
}
```

### Error Handling Pattern
```javascript
// Source: frontend/src/utils/errorHandler.js (existing codebase)
import { extractErrorMessage } from '../../utils/errorHandler';

try {
  const tx = await wethContract.deposit({ value: amountWei });
  await tx.wait();
  return { success: true, txHash: tx.hash };
} catch (error) {
  // ethers v6 error codes
  if (error.code === 'ACTION_REJECTED') {
    return { success: false, error: 'Transaction cancelled by user' };
  }
  if (error.code === 'INSUFFICIENT_FUNDS') {
    return { success: false, error: 'Insufficient ETH for gas and value' };
  }
  return { success: false, error: extractErrorMessage(error) };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ethers.utils.parseEther()` | `ethers.parseEther()` | ethers v6 (2023) | Import paths changed |
| `new ethers.providers.Web3Provider()` | `new ethers.BrowserProvider()` | ethers v6 (2023) | Class renamed |
| Require signer as parameter | Obtain signer internally | Pattern in codebase | API simplicity |

**Deprecated/outdated:**
- ethers v5 syntax (utils namespace) - project uses ethers 6.13.1
- `setSignerAndProvider()` - marked deprecated in index.js

## Addresses Reference

| Network | WETH Address | Source |
|---------|--------------|--------|
| Sepolia | `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` | SDK NETWORK_CONFIG, Etherscan verified |
| Sepolia (alt) | `0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9` | Some protocols use this |

The codebase uses `0xfff9976782d46cc05630d1f6ebab18b2324d6b14` (case-insensitive match to first) which is the standard Uniswap WETH on Sepolia.

## Open Questions

Things that couldn't be fully resolved:

1. **Balance refresh timing**
   - What we know: `refreshBalances()` is called after wrap completes
   - What's unclear: How long until WETH balance shows (blockchain confirmation time)
   - Recommendation: Add brief delay or optimistic UI update

2. **Gas estimation UX**
   - What we know: WETH deposit costs ~45,000 gas
   - What's unclear: Whether to show gas estimate before user confirms
   - Recommendation: MetaMask shows gas; no need to duplicate

## Sources

### Primary (HIGH confidence)
- ethers.js v6 documentation - https://docs.ethers.org/v6/getting-started/
- WETH9 canonical implementation - https://github.com/gnosis/canonical-weth/blob/master/contracts/WETH9.sol
- Sepolia WETH Etherscan - https://sepolia.etherscan.io/token/0xfff9976782d46cc05630d1f6ebab18b2324d6b14

### Secondary (MEDIUM confidence)
- Existing codebase patterns in `balances.js`, `errorHandler.js`
- Railgun SDK documentation - https://docs.railgun.org/developer-guide/wallet/transactions/shielding/shield-base-token

### Tertiary (LOW confidence)
- None - all findings verified with primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - using existing packages, no new dependencies
- Architecture: HIGH - following existing patterns in codebase
- Pitfalls: HIGH - current bug identified from code analysis

**Research date:** 2026-01-22
**Valid until:** 60 days (stable domain, well-understood WETH9 contract)

## Implementation Guidance

### Minimal Fix Approach
The quickest fix is to make `signer` optional in `wrapETHtoWETH()`:

```javascript
// shield.js - line 16 change
export async function wrapETHtoWETH(amountEth, signer = null) {
  // Get signer from MetaMask if not provided
  if (!signer && typeof window !== 'undefined' && window.ethereum) {
    const provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
  }

  if (!signer) {
    throw new Error('MetaMask not connected');
  }
  // ... rest unchanged
}
```

This requires:
1. One change to `shield.js` (make signer optional)
2. Zero changes to `PrivateFundsDrawer.jsx` (already calls correctly)
3. Zero changes to `index.js` (already exports correctly)

### Testing Checklist
1. Connect MetaMask to Sepolia
2. Have at least 0.02 ETH (0.01 for wrap + gas)
3. Click wrap button with 0.01 amount
4. Confirm MetaMask transaction
5. Verify WETH balance increases after confirmation
