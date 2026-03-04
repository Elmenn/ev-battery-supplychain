# Phase 13: Pre-Payment Price Commitment Verification - Research

**Researched:** 2026-03-04
**Domain:** React component state refactor + cryptographic commitment verification UI
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Pre-payment verify badge**
- Placement: product detail page, near price / before "Buy" button
- Trigger: button (explicit user action, not auto-run on page load)
- Label: "Verify Price"
- No MetaMask required — pure computation
- Inputs: `priceWei` (from `getProductMeta(address)`), `r_price` (from `generateDeterministicBlinding(address, product.owner)`), `C_price` (from `product.priceCommitment`)
- Verification logic: call ZKP backend via `openAndVerifyCommitment`, compare result hex with on-chain `C_price`
- Pass: green badge "Price commitment verified — listed price matches on-chain commitment"
- Fail: red warning "Price commitment mismatch — do not proceed with payment"
- Loading: spinner "Verifying price commitment..."
- Gating: "Buy" button is NOT hard-blocked. Buyer sees badge and decides

**Workstream A simplification**
- Remove manual "Verify Price" button from post-payment buyer panel
- Auto-run Workstream A silently when buyer panel becomes visible (`role === 'buyer' && phase >= OrderConfirmed && auditVC exists`)
- Remove ECIES decrypt from Workstream A: derive `r_price = generateDeterministicBlinding(address, product.owner)` directly, get `value` from `priceWei` from DB
- Workstream A still: recomputes C_price from (value, r_price), compares with VC's `credentialSubject.priceCommitment.commitment`, sets `workstreamAResult = true` if match

**Workstream B simplification**
- Remove `decryptedOpening` as input to Workstream B
- Replace `decryptedOpening.blinding_price` with `generateDeterministicBlinding(address, product.owner)` inline
- `blobPlaintext` cache kept for `r_pay`

**State cleanup**
- Remove `decryptedOpening` / `setDecryptedOpening` state from ProductDetail.jsx
- Remove `decryptOpening` import from ecies.js if no longer called
- Keep `blobPlaintext` / `setBlobPlaintext`
- Keep all workstream loading/result/error state

### Claude's Discretion
- Exact JSX positioning of pre-payment badge
- Whether to implement auto-run or button (user prefers button, but agent may choose auto-run if it's fast and cacheable)
- Error handling for ZKP backend unavailability (show "Unable to verify — ZKP backend offline" instead of silent fail)
- Whether to show loading indicator during pre-payment verify or show result inline

### Deferred Ideas (OUT OF SCOPE)
- Forced gate: blocking payment if verification fails
- Auto-run pre-payment verify on page load
- Removing ECIES entirely from the codebase
- Moving priceWei into the on-chain contract
</user_constraints>

---

## Summary

Phase 13 is a single-file refactor of `ProductDetail.jsx`. There are no new libraries, no new backend endpoints, no contract changes, and no new utility files. All cryptographic primitives required are already in the codebase and fully operational.

The work splits into two tracks that happen in the same file:

**Track 1 — Pre-payment badge:** Add new state (`priceVerifyStatus`), a `handleVerifyPrice` handler, and a new JSX section placed near the "Buy" button. The handler reads `priceWei` from the DB (via an on-demand `getProductMeta` call — priceWei is not pre-loaded at mount), derives `r_price` deterministically, and calls the existing `openAndVerifyCommitment` utility. No new API calls or utility functions are required.

**Track 2 — Workstream simplification:** Gut three things from the existing Workstream A handler (`handleWorkstreamA`): the `getBuyerSecretBlob` read for x25519_priv, the `decryptOpening` call, and the `setDecryptedOpening` cache. Replace them with one deterministic line. Wire the handler to `useEffect` instead of a button. Remove the `decryptedOpening` state variable and clean up the Workstream B handler similarly.

**Primary recommendation:** Implement as two sequential plans — Plan 1 adds the pre-payment badge (additive, no breakage risk), Plan 2 refactors the existing buyer panel (reductive, higher breakage risk if sequence incorrect).

---

## Standard Stack

No new libraries needed. All existing.

### Core (already installed)
| Library/Utility | Purpose | Location |
|-----------------|---------|----------|
| `commitmentUtils.js` | `generateDeterministicBlinding`, `openAndVerifyCommitment` | `frontend/src/utils/` |
| `productMetaApi.js` | `getProductMeta` — fetches `priceWei` from DB | `frontend/src/utils/` |
| `zkpClient.js` | `generateValueCommitmentWithBlinding` (called by openAndVerifyCommitment) | `frontend/src/utils/zkp/` |
| React `useEffect` | Trigger auto-run of Workstream A when conditions met | Already in component |
| React `useState` | State for badge result (`priceVerifyStatus`) | Already in component |

### No New Installations Needed
All packages are already in `package.json`. This phase is purely a component-level refactor.

---

## Architecture Patterns

### Component State After Phase 13

**New state to add:**
```jsx
// Pre-payment price verification state
const [priceVerifyStatus, setPriceVerifyStatus] = useState(null); // null | 'verified' | 'mismatch' | 'error' | 'loading'
```

**State to remove:**
```jsx
// REMOVE these:
const [decryptedOpening, setDecryptedOpening] = useState(null);
```

**State to keep unchanged:**
```jsx
const [blobPlaintext, setBlobPlaintext] = useState(null);
const [workstreamAResult, setWorkstreamAResult] = useState(null);
const [workstreamALoading, setWorkstreamALoading] = useState(false);
const [workstreamBResult, setWorkstreamBResult] = useState(null);
const [workstreamBLoading, setWorkstreamBLoading] = useState(false);
const [workstreamError, setWorkstreamError] = useState('');
```

### Pattern 1: Pre-Payment Verify Badge Handler

The key insight: `priceWei` is NOT currently pre-loaded at page mount time in ProductDetail. It is only fetched inside `handleConfirmOrder` (seller flow) via `getProductMeta`. The pre-payment badge handler must fetch it itself on demand.

`product.priceCommitment` IS available at mount — `getProductState` in `escrowHelpers.js` calls `contract.priceCommitment()` and includes it in the returned state object (confirmed by code inspection, HIGH confidence).

```jsx
// Source: product logic already in ProductDetail.jsx + commitmentUtils.js
const handleVerifyPrice = async () => {
  setPriceVerifyStatus('loading');
  try {
    // priceWei: fetch from DB (getProductMeta already has null-return contract)
    const meta = await getProductMeta(address);
    const priceWeiRaw = meta?.priceWei;
    if (!priceWeiRaw) {
      throw new Error('Price metadata not available from backend.');
    }
    const priceValueNum = Number(priceWeiRaw);

    // r_price: deterministic — no seller cooperation needed
    const blindingPrice = generateDeterministicBlinding(address, product.owner);

    // C_price: from on-chain product state (already loaded at mount)
    const cPriceHex = product?.priceCommitment;
    if (!cPriceHex) {
      throw new Error('Price commitment not found on-chain.');
    }

    // Call ZKP backend to compute C_check = commit(priceWei, r_price)
    const result = await openAndVerifyCommitment({
      value: priceValueNum,
      blindingPrice,
      cPriceHex,
    });

    setPriceVerifyStatus(result.verified ? 'verified' : 'mismatch');
  } catch (err) {
    // Distinguish ZKP backend down from data errors
    const isNetworkError = err.message?.includes('Failed to fetch') ||
      err.message?.includes('ZKP backend error');
    if (isNetworkError) {
      setPriceVerifyStatus('error'); // show "ZKP backend offline" message
    } else {
      setPriceVerifyStatus('mismatch'); // data issue — treat as fail-open warning
    }
  }
};
```

### Pattern 2: Pre-Payment Badge JSX Placement

The badge belongs near the "Buy" button. In the current JSX, the buyer "Buy with Railgun" button appears at line ~754 inside:
```jsx
{(role.role === "visitor" || role.role === "buyer") && product.phase === Phase.Listed && ( ... )}
```

The badge should appear immediately above this block, gated on `phase === Phase.Listed`. The badge is visible to both visitors and buyers (anyone who might buy). Since `priceVerifyStatus` persists in state, the badge remains visible after clicking once.

```jsx
{/* PRE-PAYMENT PRICE VERIFICATION */}
{product.phase === Phase.Listed && product?.priceCommitment && (
  <div className="bg-white border rounded-lg p-4 space-y-2">
    <div className="flex items-center gap-3">
      <Button
        size="sm"
        variant="outline"
        onClick={handleVerifyPrice}
        disabled={priceVerifyStatus === 'loading'}
      >
        {priceVerifyStatus === 'loading' ? 'Verifying...' : 'Verify Price'}
      </Button>
      {priceVerifyStatus === 'verified' && (
        <span className="text-xs text-green-700 font-medium">
          Price commitment verified — listed price matches on-chain commitment
        </span>
      )}
      {priceVerifyStatus === 'mismatch' && (
        <span className="text-xs text-red-700 font-medium">
          Price commitment mismatch — do not proceed with payment
        </span>
      )}
      {priceVerifyStatus === 'error' && (
        <span className="text-xs text-amber-700 font-medium">
          Unable to verify — ZKP backend offline
        </span>
      )}
    </div>
  </div>
)}
```

### Pattern 3: Workstream A Auto-Run via useEffect

Current Workstream A is triggered by a button (`handleWorkstreamA` called by `onClick`). After Phase 13 it should fire automatically when the buyer panel becomes visible.

**Trigger condition:** `role === 'buyer' && product.phase >= Phase.OrderConfirmed && auditVC !== null`

```jsx
// Source: ProductDetail.jsx (new useEffect to add)
useEffect(() => {
  if (
    role.role === 'buyer' &&
    product?.phase >= Phase.OrderConfirmed &&
    auditVC &&
    workstreamAResult === null &&   // don't re-run if already done
    !workstreamALoading
  ) {
    handleWorkstreamA();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [role.role, product?.phase, auditVC]);
```

**Warning:** `handleWorkstreamA` must NOT be listed in useEffect deps. It is a function defined inside the component body and its reference changes every render, which would trigger infinite re-renders. The pattern here (deps on primitive values, handler called by reference with eslint-disable) is already used for `loadProductData` in this component.

### Pattern 4: Simplified handleWorkstreamA

Before (lines 470-519 in ProductDetail.jsx):
```jsx
// Step 1: blob fetch + decrypt for x25519_priv (REMOVE entirely from A)
const row = await getBuyerSecretBlob(address, buyerAddr);
const blobData = await decryptBuyerBlob(row.encryptedBlob, signer);
setBlobPlaintext(blobData);

// Step 2: ECIES decrypt opening (REMOVE entirely)
const encOpening = auditVC?.credentialSubject?.attestation?.encryptedOpening;
if (!encOpening) throw new Error('Encrypted opening not found in VC...');
const opening = await decryptOpening(encOpening, blobData.x25519_priv);
setDecryptedOpening(opening);

// Step 3: verify using decrypted opening's value + blinding
const result = await openAndVerifyCommitment({
  value: opening.value,
  blindingPrice: opening.blinding_price,
  cPriceHex,
});
```

After (Phase 13) — Workstream A becomes a pure DB-read + deterministic computation:
```jsx
// No ECIES decrypt. No setDecryptedOpening. No blob fetch. No MetaMask prompt.
const cPriceHex = auditVC?.credentialSubject?.priceCommitment?.commitment;
if (!cPriceHex) throw new Error('Price commitment not found in VC.');

const meta = await getProductMeta(address);
const priceValueNum = Number(meta?.priceWei ?? '0');
const blindingPrice = generateDeterministicBlinding(address, product?.owner);

const result = await openAndVerifyCommitment({
  value: priceValueNum,
  blindingPrice,
  cPriceHex,
});
```

**Critical data dependency analysis:** Workstream A currently fetches and decrypts the blob to cache `blobPlaintext` for Workstream B (`r_pay`). After simplification, Workstream A no longer fetches the blob. This means `blobPlaintext` will be `null` when Workstream B runs. This is safe because Workstream B already has its own independent blob fetch path (lines 532-537) that fires when `cachedBlob` is null. Workstream B will prompt MetaMask once for the blob decrypt when the user clicks "Generate Equality Proof". No functionality is lost.

Also remove: the `const signer = await provider.getSigner()` and `const buyerAddr = await signer.getAddress()` lines from Workstream A — they are no longer needed since the handler no longer calls any MetaMask-dependent operation.

### Pattern 5: Simplified handleWorkstreamB (r_price derivation)

Current Workstream B (lines 544-555) has a fallback block that reads `decryptedOpening` and falls back to ECIES decrypt if not cached:

```jsx
// ---- REMOVE: decryptedOpening fallback block ----
let opening = decryptedOpening;
if (!opening) {
  const encOpening = auditVC?.credentialSubject?.attestation?.encryptedOpening;
  if (!encOpening) throw new Error('Encrypted opening not found in VC.');
  opening = await decryptOpening(encOpening, cachedBlob.x25519_priv);
  setDecryptedOpening(opening);
}
// ---- END REMOVE ----

// This line already exists — keep it, it was never using decryptedOpening for rPriceHex
const rPriceHex = generateDeterministicBlinding(address, product?.owner);
```

After Phase 13, only the fallback block is removed. The `rPriceHex` line on line 555 is already deterministic and already present — no change needed there.

### Pattern 6: Import Cleanup

After removing `decryptOpening` usage from both handlers:

```jsx
// BEFORE:
import { encryptOpening, decryptOpening } from '../../utils/ecies';

// AFTER (decryptOpening no longer called anywhere in ProductDetail):
import { encryptOpening } from '../../utils/ecies';
```

`encryptOpening` stays — it is called in `handleConfirmOrder` (seller flow, line 322). `decryptOpening` is called only in two places that Phase 13 removes: `handleWorkstreamA` (line 495) and `handleWorkstreamB` (line 548).

### Pattern 7: JSX cleanup — remove encryptedOpening gate

The current buyer attestation panel JSX has a gate:
```jsx
{auditVC?.credentialSubject?.attestation?.encryptedOpening && (
  <div> ... Workstream A button ... </div>
)}
```

This gate must be removed. Post-Phase 13, Workstream A does not need `encryptedOpening`. The panel should display whenever `auditVC` is loaded. The simplified display condition:

```jsx
{/* Buyer attestation panel — Workstream A auto-runs, B is manual */}
{role.role === 'buyer' && product?.phase >= Phase.OrderConfirmed && auditVC && (
  <div className="border border-indigo-200 rounded-lg p-4 bg-indigo-50 space-y-3">
    {/* Workstream A: show status (auto-runs, no button) */}
    {/* Workstream B: show button (gated on workstreamAResult === true) */}
  </div>
)}
```

### Anti-Patterns to Avoid

- **Removing encryptOpening import:** Only `decryptOpening` is removed. `encryptOpening` stays for the seller confirmOrder ECIES step. Do not remove the entire ecies.js import.
- **Removing blob fetch from Workstream A without verifying Workstream B's fallback:** Already verified — Workstream B lines 533-537 handle the null blobPlaintext case independently.
- **Adding priceWei state at component level:** Not needed. On-demand `getProductMeta` call in the handler is correct and cheap. Avoid unnecessary global state.
- **Blocking the "Buy" button:** Explicitly deferred per CONTEXT.md. The badge is informational only.
- **Auto-running handleWorkstreamA without a null guard on workstreamAResult:** Always check `workstreamAResult === null` before auto-triggering. Without this guard, every `auditVC` state change re-runs the verification.
- **Listing handleWorkstreamA in useEffect deps:** This causes infinite re-renders. Reference the function without listing it as a dep, with eslint-disable comment.
- **Keeping the encryptedOpening availability message:** Current JSX has "Price verification available once the seller confirms the order." This message is now obsolete — remove it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Commitment recomputation | Custom Pedersen commit in JS | `openAndVerifyCommitment` in commitmentUtils.js | Calls the verified ZKP backend with correct hex format |
| Hex normalization | Custom toLowerCase/replace | Already done inside `openAndVerifyCommitment` | Handles 0x prefix and case normalization |
| Deterministic blinding | Custom keccak256 hash | `generateDeterministicBlinding` in commitmentUtils.js | Same formula used by seller; must match exactly |
| Backend metadata fetch | Custom fetch wrapper | `getProductMeta` in productMetaApi.js | Null-return contract built-in, avoids boilerplate |

---

## Common Pitfalls

### Pitfall 1: priceWei availability at badge time

**What goes wrong:** The pre-payment badge calls `openAndVerifyCommitment` with `priceWei` that is `null` or `0` because `getProductMeta` returned null (DB unavailable or product not in DB).

**Why it happens:** `getProductMeta` has a null-return contract for 404 and network errors. Pre-migration products (listed before Phase 11) have no DB row.

**How to avoid:** Explicitly check `meta?.priceWei` before proceeding. Show "Unable to verify — price not available from backend" rather than calling `openAndVerifyCommitment` with `0`. Do not attempt a localStorage fallback for priceWei in the badge handler — that data path is not reliable for cross-device buyers.

**Warning signs:** Commitment always returns `verified: false` for pre-migration products even though the seller is honest.

### Pitfall 2: product.priceCommitment format

**What goes wrong:** `openAndVerifyCommitment` receives `cPriceHex` in a format that doesn't normalize correctly (bytes32 returned by ethers may have 0x prefix).

**Why it happens:** `contract.priceCommitment()` returns a bytes32 value. Ethers.js returns it as `0x` + 64 hex chars. `openAndVerifyCommitment` normalizes internally (removes `0x`, lowercases) — this is handled. No issue here.

**How to avoid:** Use `product.priceCommitment` directly — it is already confirmed populated by `getProductState` (HIGH confidence, verified by code inspection of `escrowHelpers.js` lines 69, 86, 112).

### Pitfall 3: useEffect infinite loop for Workstream A auto-run

**What goes wrong:** `handleWorkstreamA` is listed as a useEffect dependency. Every render creates a new function reference, triggering the effect endlessly.

**Why it happens:** Standard React closure behavior. Functions defined inside the component body are not stable references across renders.

**How to avoid:** List only primitive deps in the useEffect: `[role.role, product?.phase, auditVC]`. Call `handleWorkstreamA()` inside the effect without listing it as a dep. Add `// eslint-disable-next-line react-hooks/exhaustive-deps` comment. This is the same pattern used for `loadProductData` already in this component.

**Warning signs:** "Maximum update depth exceeded" React error, or repeated ZKP backend calls visible in network tab.

### Pitfall 4: Workstream A panel still gated on encryptedOpening

**What goes wrong:** After removing the button-based Workstream A, the developer leaves the `encryptedOpening` JSX gate. The buyer attestation panel never renders (no encryptedOpening in VC), and the auto-run useEffect condition is never satisfied.

**Why it happens:** The gate was written when ECIES was a hard requirement for Workstream A.

**How to avoid:** Remove the `auditVC?.credentialSubject?.attestation?.encryptedOpening` gate from the buyer attestation panel. Replace with simple `auditVC` existence check.

### Pitfall 5: decryptedOpening still read in Workstream B after state removal

**What goes wrong:** `decryptedOpening` state is deleted but the fallback block in `handleWorkstreamB` (lines 544-549) still references it, causing a ReferenceError at runtime.

**How to avoid:** When removing `decryptedOpening` state variable, also remove the entire `opening` fallback block in Workstream B. The `rPriceHex = generateDeterministicBlinding(...)` line (already on line 555) does not depend on `decryptedOpening` at all — it is independently correct.

### Pitfall 6: Workstream A still tries to get signer after simplification

**What goes wrong:** The simplified Workstream A handler retains `const signer = await provider.getSigner()` and `const buyerAddr = await signer.getAddress()` from the original, which are no longer needed. This silently triggers a MetaMask connection prompt even though the handler is supposed to be "no MetaMask required."

**How to avoid:** Remove those two lines from `handleWorkstreamA`. The simplified handler only calls `getProductMeta` (no signer) and `openAndVerifyCommitment` (no signer).

---

## Code Examples

### Verified: openAndVerifyCommitment signature

```js
// Source: frontend/src/utils/commitmentUtils.js line 324
export async function openAndVerifyCommitment({ value, blindingPrice, cPriceHex }) {
  // Calls ZKP backend: POST http://localhost:5010/zkp/generate-value-commitment-with-blinding
  // Body: { value: number, blinding_hex: "0x" + 64hexchars }
  // Returns { verified: boolean, cCheck: string }
  // Normalizes hex internally (0x prefix handled, case-insensitive comparison)
}
```

### Verified: generateDeterministicBlinding signature

```js
// Source: frontend/src/utils/commitmentUtils.js line 15
export function generateDeterministicBlinding(productAddress, sellerAddress) {
  // Returns keccak256(productAddress, sellerAddress) as 64-char hex, no 0x prefix
  // Throws if either address is missing
  // Normalizes to checksum format internally via ethers.getAddress
}
```

### Verified: getProductMeta return shape

```js
// Source: backend REST GET /metadata/:address
// Returns: { productAddress, productMeta, priceWei, priceCommitment, sellerRailgunAddress, vcCid }
// priceWei is TEXT in SQLite, serialized as string (e.g., "1000000000000000000")
// Returns null for 404 and network errors (null-return contract)
```

### Verified: product.priceCommitment is available at mount

```js
// Source: frontend/src/utils/escrowHelpers.js lines 69, 86, 112
// getProductState calls contract.priceCommitment() in the Promise.all batch
// Returns { ..., priceCommitment, ... } — type bytes32 (0x-prefixed 64 hex chars)
```

### Current handleWorkstreamA — annotated for Phase 13 changes

```jsx
// Source: ProductDetail.jsx lines 470-519
const handleWorkstreamA = async () => {
  setWorkstreamALoading(true);
  setWorkstreamError('');
  try {
    // REMOVE: signer + buyerAddr (no longer needed)
    const signer = await provider.getSigner();
    const buyerAddr = await signer.getAddress();

    // REMOVE: blob fetch block (not needed for r_price; Workstream B has own fetch)
    const row = await getBuyerSecretBlob(address, buyerAddr);
    if (!row?.encryptedBlob) throw new Error('...');
    const blobData = await decryptBuyerBlob(row.encryptedBlob, signer);
    setBlobPlaintext(blobData);

    // REMOVE: ECIES decrypt block
    const encOpening = auditVC?.credentialSubject?.attestation?.encryptedOpening;
    if (!encOpening) throw new Error('Encrypted opening not found in VC...');
    const opening = await decryptOpening(encOpening, blobData.x25519_priv);
    setDecryptedOpening(opening);

    // KEEP: cPriceHex from VC
    const cPriceHex = auditVC?.credentialSubject?.priceCommitment?.commitment;
    if (!cPriceHex) throw new Error('Price commitment not found in VC.');

    // REPLACE: deterministic inputs instead of decrypted opening
    const meta = await getProductMeta(address);
    const priceValueNum = Number(meta?.priceWei ?? '0');
    const blindingPrice = generateDeterministicBlinding(address, product?.owner);

    const result = await openAndVerifyCommitment({
      value: priceValueNum,      // was: opening.value
      blindingPrice,             // was: opening.blinding_price
      cPriceHex,
    });

    setWorkstreamAResult(result.verified);
    if (!result.verified) setWorkstreamError('Price commitment mismatch...');
  } catch (err) {
    setWorkstreamAResult(false);
    setWorkstreamError(err.message || 'Verification failed');
  } finally {
    setWorkstreamALoading(false);
  }
};
```

### Current handleWorkstreamB — annotated for Phase 13 changes

```jsx
// Source: ProductDetail.jsx lines 521-598
const handleWorkstreamB = async () => {
  // ...
  // KEEP: blobPlaintext fetch/cache for r_pay (unchanged)
  let cachedBlob = blobPlaintext;
  if (!cachedBlob) {
    const row = await getBuyerSecretBlob(address, buyerAddr);
    if (!row?.encryptedBlob) throw new Error('Buyer secret blob not found.');
    cachedBlob = await decryptBuyerBlob(row.encryptedBlob, signer);
    setBlobPlaintext(cachedBlob);
  }
  const rPay = cachedBlob.r_pay;

  // REMOVE: entire opening fallback block (decryptedOpening state no longer exists)
  let opening = decryptedOpening;
  if (!opening) {
    const encOpening = auditVC?.credentialSubject?.attestation?.encryptedOpening;
    if (!encOpening) throw new Error('Encrypted opening not found in VC.');
    opening = await decryptOpening(encOpening, cachedBlob.x25519_priv);
    setDecryptedOpening(opening);
  }

  // KEEP (already present, unchanged):
  const cPriceHex = auditVC?.credentialSubject?.priceCommitment?.commitment;
  const cPayHex = auditVC?.credentialSubject?.attestation?.buyerPaymentCommitment?.commitment;
  const rPriceHex = generateDeterministicBlinding(address, product?.owner);

  // ... rest of handler unchanged
};
```

---

## Open Questions

1. **Does `getProductState` return `priceCommitment`?** — RESOLVED (HIGH confidence)
   - Confirmed by code inspection: `escrowHelpers.js` calls `contract.priceCommitment()` in the `Promise.all` batch and returns it as `priceCommitment` in the product state object (lines 69, 86, 112).
   - `product.priceCommitment` is available at page load without any changes to `escrowHelpers.js`.

2. **Auto-run timing: will `auditVC` be loaded before Workstream A fires?**
   - `auditVC` is loaded by the "Load VC" button (user action). The auto-run useEffect conditions on `auditVC !== null`.
   - If the user refreshes after VC was previously loaded, the CID is in the DB and auto-populated into `auditCid` via the vcCid useEffect. But `auditVC` itself is only loaded when the user clicks "Load VC" — there is no auto-fetch of the full VC JSON.
   - This is acceptable scope for Phase 13. Workstream A will auto-run once the user loads the VC. Document as expected UX behavior.

3. **Are `decryptBuyerBlob` / `getBuyerSecretBlob` imports still needed after Workstream A simplification?**
   - Yes — both are still called in Workstream B (lines 534-537). Imports stay unchanged.

---

## Implementation Plan Recommendation

Given the scope, two plans are appropriate:

**Plan 1 — Pre-payment verify badge (additive, no risk)**
- Add `priceVerifyStatus` state
- Add `handleVerifyPrice` handler
- Add badge JSX above the "Buy with Railgun" button section

**Plan 2 — Workstream simplification (reductive, medium risk)**
- Remove `decryptedOpening` state + setter
- Simplify `handleWorkstreamA`: remove signer, blob fetch, ECIES decrypt, add deterministic inputs
- Add useEffect to auto-run `handleWorkstreamA`
- Simplify `handleWorkstreamB`: remove opening fallback block
- Remove `encryptedOpening` JSX gate on buyer attestation panel
- Remove "Price verification available once the seller confirms the order." obsolete message
- Update ecies.js import: `{ encryptOpening, decryptOpening }` becomes `{ encryptOpening }`

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `frontend/src/components/marketplace/ProductDetail.jsx` (1061 lines) — full current implementation
- Direct code inspection: `frontend/src/utils/commitmentUtils.js` — `generateDeterministicBlinding`, `openAndVerifyCommitment`
- Direct code inspection: `frontend/src/utils/productMetaApi.js` — `getProductMeta` null-return contract
- Direct code inspection: `frontend/src/utils/zkp/providers/backendProvider.js` — ZKP backend POST endpoint
- Direct code inspection: `frontend/src/utils/ecies.js` — `decryptOpening`, `encryptOpening`
- Direct code inspection: `frontend/src/utils/escrowHelpers.js` lines 69, 86, 112 — `priceCommitment` in product state
- `.planning/phases/13-pre-payment-price-commitment-verification/13-CONTEXT.md` — locked decisions

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — project history, key decisions

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, all verified by code inspection
- Architecture: HIGH — all patterns verified against actual ProductDetail.jsx code
- Pitfalls: HIGH — all pitfalls identified by reading the actual implementation line by line

**Research date:** 2026-03-04
**Valid until:** 2026-04-03 (stable — single file refactor, no external dependencies changing)
