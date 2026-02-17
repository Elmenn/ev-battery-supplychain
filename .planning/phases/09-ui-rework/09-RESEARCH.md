# Phase 9: UI Rework - Research

**Researched:** 2026-02-17
**Domain:** React UI wiring to redesigned smart contract (Phase 7) and append-only VC (Phase 8)
**Confidence:** HIGH

## Summary

Phase 9 rewires all marketplace UI components to match the redesigned `ProductEscrow_Initializer.sol` contract (Phase 7) and single append-only VC architecture (Phase 8). The current UI contains significant dead code from the old contract interface -- public purchase flows, buyer-driven delivery confirmation, stage-based VC building (buildStage2VC/buildStage3VC), and deprecated backend API calls. These must all be replaced with the new private-only, three-party (seller/buyer/transporter) flow.

The project uses React with Tailwind CSS utility classes, ethers.js v6, react-hot-toast, and a small custom UI component library (Button, Tabs, Tab from `components/ui/`). The existing patterns are consistent and well-established, so Phase 9 is primarily a rewiring and extension effort rather than a greenfield build.

**Primary recommendation:** Structure the phase as 4-5 plans ordered by dependency: (1) contract interaction layer + shared components, (2) seller flow (create + confirm + select transporter), (3) buyer flow (private purchase + hash display), (4) transporter flow (bid + deliver), (5) role-aware ProductDetail/ProductCard/timeline. Each plan should delete dead code as it rewires, not defer deletion.

## Standard Stack

The project already uses an established stack. No new libraries are needed.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.x | UI framework | Already in use |
| ethers | 6.x | Contract interaction | Already in use (v6 API throughout) |
| react-hot-toast | latest | Toast notifications | Already in use, pattern established |
| Tailwind CSS | 3.x | Utility-first CSS | Already in use (all components use tw classes) |
| lucide-react | latest | Icons | Already in use (Eye, EyeOff, Loader2) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| json-canonicalize | latest | VC canonicalization | Already in vcBuilder.mjs |
| uuid | v4 | VC ID generation | Already in vcBuilder.mjs |
| qrcode.react | latest | QR code for hash sharing | NEW - needed for hash copy/QR per CONTEXT decisions |

### New Dependency
Only **one** new dependency is needed: a QR code component for the hash-sharing UI. `qrcode.react` is the standard React QR code library.

```bash
cd frontend && npm install qrcode.react
```

## Architecture Patterns

### Current File Organization
```
frontend/src/
  components/
    marketplace/
      ProductCard.jsx         # Card in grid view
      ProductDetail.jsx       # Full product detail page (~1600 lines - NEEDS SPLITTING)
      ProductFormStep1.jsx    # Product name/details
      ProductFormStep2.jsx    # Component credentials
      ProductFormStep2_5_Railgun.jsx  # Seller Railgun connect
      ProductFormStep3.jsx    # Review & deploy (calls factory.createProduct)
      ProductFormStep4.jsx    # Success page
      ProductFormWizard.jsx   # Step controller
    railgun/
      PrivatePaymentModal.jsx # Buyer private payment (~1630 lines - NEEDS REWRITE)
      PrivateFundsDrawer.jsx  # Wrap/shield management
      RailgunConnectionButton.jsx
    ui/
      button.js               # Custom Button (default/secondary/ghost variants)
      Tabs.jsx                # Custom Tabs/Tab components
      card.js                 # Card component
      AlertBadge.js           # Alert badges
      StageCard.js            # Stage card display
    vc/
      VCViewer.jsx            # VC display
      VerifyVCInline.jsx      # Inline verification
      ProvenanceChainViewer.jsx # VC chain viewer
  utils/
    web3Utils.js              # confirmOrder, getCurrentCid, getTransporters
    vcBuilder.mjs             # createListingVC, appendPaymentProof, appendDeliveryProof (v2.0)
    vcVerifier.js             # verifyVcSchema, verifyVcIntegrity, etc.
    signVcWithMetamask.js     # EIP-712 signing (preparePayloadForSigning, signVcAsSeller)
    ipfs.js                   # uploadJson, fetchJson with caching
    commitmentUtils.js        # ZKP commitment utilities
    errorHandler.js           # decodeContractError, getExplorerUrl
  views/
    MarketplaceView.jsx       # Main marketplace grid + filters
```

### Recommended New/Modified Structure
```
frontend/src/
  components/
    marketplace/
      ProductCard.jsx              # MODIFY: dual badges, phase-aware
      ProductDetail.jsx            # MAJOR REWRITE: role-aware panels, timeline
      ProductFormStep3.jsx         # MODIFY: add bond disclosure card
      ProductFormWizard.jsx        # MINOR: no structural change
    railgun/
      PrivatePaymentModal.jsx      # MAJOR REWRITE: stepped drawer, amount entry
    shared/                        # NEW folder for shared Phase 9 components
      PhaseTimeline.jsx            # NEW: horizontal/vertical adaptive timeline
      HashDisplay.jsx              # NEW: hash + copy + QR component
      CountdownTimer.jsx           # NEW: live countdown with color thresholds
      BondCard.jsx                 # NEW: bond amount display (read-only)
      TransporterBidTable.jsx      # NEW: sortable bid table with recommended badge
      TransporterBidModal.jsx      # NEW: modal bid form
      DeliveryConfirmModal.jsx     # NEW: transporter delivery confirmation
      PayoutSummaryCard.jsx        # NEW: post-delivery payout breakdown
  utils/
    web3Utils.js                   # MODIFY: update confirmOrder, add new helpers
    escrowHelpers.js               # NEW: all contract read/write functions
  views/
    MarketplaceView.jsx            # MODIFY: add transporter filter tabs
```

### Pattern 1: Contract Interaction Layer
**What:** Centralize all escrow contract interactions in a helper module instead of scattering ethers.Contract calls throughout components.
**When to use:** Every component that reads from or writes to the escrow contract.

```javascript
// utils/escrowHelpers.js
import { ethers } from "ethers";
import ProductEscrowABI from "../abis/ProductEscrow_Initializer.json";

const ESCROW_ABI = ProductEscrowABI.abi;

// Phase enum matching contract
export const Phase = {
  Listed: 0,
  Purchased: 1,
  OrderConfirmed: 2,
  Bound: 3,
  Delivered: 4,
  Expired: 5,
};

export const PHASE_LABELS = {
  [Phase.Listed]: "Listed",
  [Phase.Purchased]: "Purchased",
  [Phase.OrderConfirmed]: "Order Confirmed",
  [Phase.Bound]: "In Delivery",
  [Phase.Delivered]: "Delivered",
  [Phase.Expired]: "Expired",
};

// Time windows matching contract constants
export const SELLER_WINDOW = 2 * 24 * 60 * 60; // 2 days in seconds
export const BID_WINDOW = 2 * 24 * 60 * 60;
export const DELIVERY_WINDOW = 2 * 24 * 60 * 60;

export function getEscrowContract(address, signerOrProvider) {
  return new ethers.Contract(address, ESCROW_ABI, signerOrProvider);
}

export async function getProductState(address, provider) {
  const c = getEscrowContract(address, provider);
  const [name, owner, buyer, purchased, delivered, transporter, phase,
         vcHash, priceCommitment, sellerBond, bondAmount, deliveryFee,
         purchaseTimestamp, orderConfirmedTimestamp, boundTimestamp
  ] = await Promise.all([
    c.name(), c.owner(), c.buyer(), c.purchased(), c.delivered(),
    c.transporter(), c.phase(), c.getVcHash(), c.priceCommitment(),
    c.sellerBond(), c.bondAmount(), c.deliveryFee(),
    c.purchaseTimestamp(), c.orderConfirmedTimestamp(), c.boundTimestamp(),
  ]);
  return {
    name, owner, buyer, purchased, delivered, transporter,
    phase: Number(phase), vcHash, priceCommitment,
    sellerBond, bondAmount, deliveryFee,
    purchaseTimestamp: Number(purchaseTimestamp),
    orderConfirmedTimestamp: Number(orderConfirmedTimestamp),
    boundTimestamp: Number(boundTimestamp),
    address,
  };
}
```

### Pattern 2: Role Detection
**What:** Determine current user's role relative to a product.
**When to use:** Every conditional render in ProductDetail.

```javascript
export function detectRole(product, currentUser) {
  if (!currentUser || !product) return { role: "visitor" };
  const me = currentUser.toLowerCase();
  const isOwner = me === product.owner?.toLowerCase();
  const isBuyer = product.buyer && product.buyer !== ethers.ZeroAddress
    && me === product.buyer.toLowerCase();
  const isTransporter = product.transporter && product.transporter !== ethers.ZeroAddress
    && me === product.transporter.toLowerCase();
  if (isOwner) return { role: "seller" };
  if (isBuyer) return { role: "buyer" };
  if (isTransporter) return { role: "transporter" };
  return { role: "visitor" };
}
```

### Pattern 3: Confirmation Modal Pattern
**What:** The project uses a consistent modal pattern with Tailwind CSS.
**When to use:** Bond confirmation, fee deposit, delivery confirmation.

```jsx
// Existing modal pattern from PrivatePaymentModal.jsx
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
  <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
    {/* Header */}
    <div className="flex items-center justify-between mb-6">
      <h2 className="text-xl font-bold">Title</h2>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">x</button>
    </div>
    {/* Content */}
    {/* Actions */}
    <Button onClick={handleAction} className="w-full">Action</Button>
  </div>
</div>
```

### Anti-Patterns to Avoid
- **Scattering contract calls:** The current ProductDetail.jsx has inline `new ethers.Contract(...)` calls everywhere. Centralize in escrowHelpers.js.
- **Deprecated function calls:** ProductDetail.jsx calls `buildStage2VC()` and `buildStage3VC()` which now throw. These must be replaced with the v2.0 functions.
- **Backend Railgun API calls:** `IS_RAILGUN_API_CONFIGURED` is already set to `false`. Remove all code paths that depend on it.
- **Old confirmation flow:** The current buyer-driven `revealAndConfirmDelivery` / `updateVcCidAfterDelivery` pattern must be replaced with transporter-driven `confirmDelivery(hash)`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| QR code generation | Canvas drawing code | `qrcode.react` | Handles size, error correction, encoding edge cases |
| Countdown timer | setInterval math | Dedicated CountdownTimer component with `useEffect` + cleanup | Prevents memory leaks, handles tab-switch correctly |
| Contract error decoding | Custom error parsing | Existing `decodeContractError` from errorHandler.js | Already handles ethers v6 error format |
| Toast notifications | Custom notification system | Existing `react-hot-toast` | Already established pattern throughout app |
| EIP-712 signing | Raw typed data construction | Existing `signVcAsSeller`/`signVcWithMetamask` | Already handles v2.0 payload preparation |

## Common Pitfalls

### Pitfall 1: Calling Deprecated VC Functions
**What goes wrong:** `buildStage2VC()` and `buildStage3VC()` now throw errors (Phase 8 deprecated them).
**Why it happens:** ProductDetail.jsx line 688 calls `buildStage2VC` and line 946 calls `buildStage3VC`.
**How to avoid:** Replace with `appendPaymentProof()` and `appendDeliveryProof()` from vcBuilder.mjs.
**Warning signs:** "buildStage2VC removed in v2.0" error in console.

### Pitfall 2: Old Contract Functions That No Longer Exist
**What goes wrong:** UI calls functions removed in the Phase 7 contract redesign.
**Why it happens:** Old contract had `revealAndConfirmDelivery`, `updateVcCidAfterDelivery`, `publicPriceWei`, `privateEnabled`, `publicEnabled`. None of these exist anymore.
**How to avoid:** Map all contract calls to the new interface (see Contract Interface section below).
**Warning signs:** "function not found" errors in MetaMask transaction.

### Pitfall 3: Transporter Fee vs Bond Confusion
**What goes wrong:** `createTransporter(feeInWei)` requires `msg.value == bondAmount` (the bond stake), NOT the fee amount. The fee is just a quote.
**Why it happens:** The current `handleOfferToDeliver` passes `ethers.parseEther(feeInput)` as value but the contract expects `bondAmount` as value.
**How to avoid:** Always read `bondAmount` from factory/escrow and send that as msg.value. The fee is the function parameter only.
**Warning signs:** `InsufficientBond` revert.

### Pitfall 4: setTransporter Requires Delivery Fee as msg.value
**What goes wrong:** `setTransporter(addr)` requires `msg.value == transporters[addr]` (the quoted fee).
**Why it happens:** Seller must deposit the delivery fee when selecting a transporter. Current code passes `bid.fee` correctly but the UI doesn't show the deposit amount.
**How to avoid:** Show clear "You will deposit X ETH as delivery fee" before calling setTransporter.

### Pitfall 5: Phase-Gated UI Actions
**What goes wrong:** Buttons appear when they shouldn't, leading to failed transactions.
**Why it happens:** Phase gating not aligned with contract phase enum.
**How to avoid:** Use the `Phase` enum constants (0-5) consistently. Map every button to its required phase:
- `recordPrivatePayment` -> Phase.Listed (0) only
- `confirmOrder(vcCID)` -> Phase.Purchased (1) only
- `createTransporter(fee)` -> Phase.OrderConfirmed (2) only
- `setTransporter(addr)` -> Phase.OrderConfirmed (2) only
- `confirmDelivery(hash)` -> Phase.Bound (3) only

### Pitfall 6: Hash Display Timing
**What goes wrong:** Showing the vcHash before it exists causes blank/zero display.
**Why it happens:** vcHash is only set during `confirmOrder()` (Phase.Purchased -> Phase.OrderConfirmed).
**How to avoid:** Only show hash display component when `phase >= Phase.OrderConfirmed` and `vcHash !== bytes32(0)`. Per CONTEXT, buyer sees hash only in Bound phase and later.

### Pitfall 7: ProductDetail.jsx Is 1600+ Lines
**What goes wrong:** Modifying the file becomes error-prone and hard to review.
**Why it happens:** All role logic, mutations, effects, and render code is in one file.
**How to avoid:** Extract new components (PhaseTimeline, HashDisplay, TransporterBidTable, etc.) into separate files. Keep ProductDetail as an orchestrator that composes them.

## Contract Interface Reference

### Functions the UI Must Call

| Function | Caller | Phase | Parameters | msg.value | UI Context |
|----------|--------|-------|------------|-----------|------------|
| `factory.createProduct(name, commitment)` | Seller | N/A | string, bytes32 | bondAmount | ProductFormStep3 |
| `recordPrivatePayment(productId, memoHash, railgunTxRef)` | Buyer | Listed (0) | uint256, bytes32, bytes32 | 0 | PrivatePaymentModal |
| `confirmOrder(vcCID)` | Seller | Purchased (1) | string | 0 | ProductDetail seller panel |
| `createTransporter(feeInWei)` | Transporter | OrderConfirmed (2) | uint256 | bondAmount | TransporterBidModal |
| `setTransporter(addr)` | Seller | OrderConfirmed (2) | address | transporters[addr] | TransporterBidTable |
| `confirmDelivery(hash)` | Transporter | Bound (3) | bytes32 | 0 | DeliveryConfirmModal |
| `withdrawBid()` | Non-selected transporter | OrderConfirmed/Expired | none | 0 | TransporterBidTable |
| `sellerTimeout()` | Anyone | Purchased (1) | none | 0 | Timeout button |
| `bidTimeout()` | Anyone | OrderConfirmed (2) | none | 0 | Timeout button |
| `deliveryTimeout()` | Anyone | Bound (3) | none | 0 | Timeout button |

### View Functions the UI Reads

| Function | Returns | UI Context |
|----------|---------|------------|
| `phase()` | Phase enum (0-5) | Phase badge, action gating |
| `owner()` | address | Role detection |
| `buyer()` | address | Role detection |
| `transporter()` | address | Role detection |
| `purchased()` | bool | Status check |
| `delivered()` | bool | Status check |
| `getVcHash()` | bytes32 | Hash display, delivery verification |
| `getAllTransporters()` | (address[], uint256[]) | Bid table |
| `bondAmount()` | uint256 | Bond disclosure |
| `sellerBond()` | uint256 | Bond display |
| `deliveryFee()` | uint256 | Fee display |
| `securityDeposits(addr)` | uint256 | Transporter bond |
| `transporters(addr)` | uint256 | Transporter fee |
| `purchaseTimestamp()` | uint64 | Countdown timer |
| `orderConfirmedTimestamp()` | uint64 | Countdown timer |
| `boundTimestamp()` | uint64 | Countdown timer |
| `priceCommitment()` | bytes32 | VC verification |

### Functions That NO LONGER EXIST (Must Remove All References)

| Old Function | Replacement |
|--------------|-------------|
| `publicPriceWei()` | Removed - private-only, no public price |
| `privateEnabled()` | Removed - always private |
| `publicEnabled()` | Removed - always private |
| `revealAndConfirmDelivery()` | `confirmDelivery(hash)` (called by transporter, not buyer) |
| `updateVcCidAfterDelivery()` | Removed - vcHash set once in confirmOrder |
| `confirmOrderWithCommitment()` | `confirmOrder(vcCID)` (no commitment parameter) |
| `depositPurchase()` / `depositPurchasePrivate()` | Removed - use recordPrivatePayment |

## Code Examples

### Example 1: Seller Confirm Order Flow (v2.0 VC)

```javascript
// ProductDetail.jsx - Seller confirms order after purchase
import { createListingVC, appendPaymentProof } from "../../utils/vcBuilder.mjs";
import { signVcAsSeller } from "../../utils/signVcWithMetamask";
import { uploadJson, fetchJson } from "../../utils/ipfs";

const handleConfirmOrder = async () => {
  const signer = await provider.getSigner();
  const contract = getEscrowContract(address, signer);

  // 1. Fetch listing VC from IPFS (stored during product creation)
  const listingCid = localStorage.getItem(`vcCid_${address}`);
  const listingVc = await fetchJson(listingCid);

  // 2. Append payment proof
  const updatedVc = appendPaymentProof(listingVc, {
    buyerAddr: product.buyer,
    memoHash: product.memoHash, // from productMemoHashes mapping
    railgunTxRef: product.railgunTxRef,
    previousVersionCid: listingCid,
  });

  // 3. Sign the updated VC
  const proof = await signVcAsSeller(updatedVc, signer, address);
  updatedVc.proof.push(proof);

  // 4. Upload to IPFS
  const newCid = await uploadJson(updatedVc);

  // 5. Confirm order on-chain (stores keccak256(vcCID) as vcHash)
  const tx = await contract.confirmOrder(newCid);
  await tx.wait();
};
```

### Example 2: Transporter Bid Submission

```javascript
const handleSubmitBid = async (feeEth) => {
  const signer = await provider.getSigner();
  const contract = getEscrowContract(address, signer);

  const feeWei = ethers.parseEther(feeEth);
  const bondAmount = await contract.bondAmount();

  // createTransporter: fee is the parameter, bondAmount is msg.value
  const tx = await contract.createTransporter(feeWei, { value: bondAmount });
  await tx.wait();
};
```

### Example 3: Transporter Delivery Confirmation

```javascript
const handleConfirmDelivery = async () => {
  const signer = await provider.getSigner();
  const contract = getEscrowContract(address, signer);

  // vcHash is read from contract (set during confirmOrder)
  const vcHash = await contract.getVcHash();

  // Transporter verifies hash matches what they received from seller
  // Then submits it on-chain
  const tx = await contract.confirmDelivery(vcHash);
  await tx.wait();
  // After success: seller bond returned, transporter bond + fee returned
};
```

### Example 4: Countdown Timer Component

```jsx
// components/shared/CountdownTimer.jsx
import { useState, useEffect } from "react";

export function CountdownTimer({ deadline, label }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const update = () => {
      const now = Math.floor(Date.now() / 1000);
      setRemaining(Math.max(0, deadline - now));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  if (remaining <= 0) return <span className="text-red-600 font-medium">Expired</span>;

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  const totalWindow = deadline - (deadline - remaining); // approximate
  const pct = remaining / (2 * 24 * 3600); // 2-day window

  const color = pct < 0.10 ? "text-red-600" : pct < 0.25 ? "text-yellow-600" : "text-green-600";

  return (
    <div className={`font-mono text-sm ${color}`}>
      {label}: {hours}h {minutes}m {seconds}s
    </div>
  );
}
```

### Example 5: Hash Display with Copy + QR

```jsx
// components/shared/HashDisplay.jsx
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export function HashDisplay({ hash, label, guidance }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-gray-50 border rounded-lg p-4 space-y-3">
      <h4 className="font-medium text-sm">{label}</h4>
      <div className="flex items-center gap-2">
        <code className="text-xs bg-white px-2 py-1 rounded border flex-1 truncate">
          {hash}
        </code>
        <button onClick={handleCopy} className="text-sm text-blue-600 hover:text-blue-800">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <QRCodeSVG value={hash} size={128} className="mx-auto" />
      {guidance && <p className="text-xs text-gray-500">{guidance}</p>}
    </div>
  );
}
```

## Gap Analysis: Current UI vs New Contract

### Dead Code to Remove

1. **ProductDetail.jsx `handleConfirmOrder`** (lines 603-790): Calls `buildStage2VC()` (deprecated) and old `confirmOrder` with commitment bytes32. Replace with v2.0 flow.
2. **ProductDetail.jsx `handleRequestSellerSignature`** (lines 821-985): Builds Stage 3 VC with old `buildStage3VC()`. Remove entirely -- delivery is now transporter-driven.
3. **ProductDetail.jsx `handleSignAsSeller`** (lines 988-1024): Part of old buyer-driven delivery flow. Remove.
4. **ProductDetail.jsx `handleConfirmDeliveryClick`** (lines 1027-1275): Calls `revealAndConfirmDelivery` which no longer exists. Replace with transporter `confirmDelivery(hash)`.
5. **ProductDetail.jsx `confirmPrivatePayment`** (lines 244-373): Seller-side backend receipt confirmation. IS_RAILGUN_API_CONFIGURED is already false -- remove entirely.
6. **ProductDetail.jsx pending payment check** (lines 131-183): Backend API calls. Remove.
7. **PrivatePaymentModal.jsx**: ~70% dead code (mock wallet managers, shield step, connection polling). Rewrite from scratch.
8. **web3Utils.js `confirmOrder`**: Calls `confirmOrderWithCommitment` which no longer exists. Simplify to just `confirmOrder(vcCID)`.
9. **MarketplaceView.jsx `publicPriceWei` read** (line 100): This getter no longer exists on the contract. Remove.

### New Code Needed

1. **Transporter filter tabs** in MarketplaceView: "Needs Transporter" (phase=2), "My Bids", "Assigned to Me"
2. **Transporter bid modal** (TransporterBidModal.jsx): Fee input, bond disclosure, total impact
3. **Transporter delivery confirm modal** (DeliveryConfirmModal.jsx): Pre-filled hash, warning, submit
4. **Phase timeline component** (PhaseTimeline.jsx): Horizontal/vertical adaptive
5. **Hash display component** (HashDisplay.jsx): Copy + QR for seller/buyer/transporter
6. **Countdown timer** (CountdownTimer.jsx): For seller window, bid window, delivery window
7. **Payout summary card** (PayoutSummaryCard.jsx): Bond returned + fee paid + total
8. **Bond disclosure card** (BondCard.jsx): Read-only bond amount with explanation
9. **Seller order confirmation** semi-automatic flow with 1-click VC sign + IPFS + confirmOrder
10. **Sortable bid table** (TransporterBidTable.jsx): Fee, address, lowest-fee badge

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 3-stage VC chain (buildStage2VC, buildStage3VC) | Single append-only VC (createListingVC, appendPaymentProof, appendDeliveryProof) | Phase 8 | All VC-building code must switch to v2.0 functions |
| Buyer confirms delivery | Transporter confirms delivery via hash | Phase 7 | Delivery UI completely changes actor |
| Public + private purchase paths | Private-only (Railgun) | Phase 7 | Remove all public purchase buttons and flows |
| Seller-designated buyer | FCFS buyer (first recordPrivatePayment wins) | Phase 7 | Remove buyer designation UI |
| Backend Railgun API | Client-side SDK only | Phase 1-6 | IS_RAILGUN_API_CONFIGURED already false |
| vcCid stored as string on-chain | keccak256(vcCID) stored as bytes32 vcHash | Phase 7 | getCurrentCid returns hash not CID; CID only in events |
| No bonds | Seller bond at creation + transporter bond at bid | Phase 7 | Bond disclosure UI needed throughout |

**Deprecated/outdated:**
- `buildStage2VC`: Throws error, use `appendPaymentProof`
- `buildStage3VC`: Throws error, use `appendDeliveryProof`
- `IS_RAILGUN_API_CONFIGURED`: Already false, remove all dead paths
- `confirmOrderWithCommitment`: Does not exist on new contract
- `revealAndConfirmDelivery`: Does not exist on new contract
- `updateVcCidAfterDelivery`: Does not exist on new contract

## Open Questions

1. **QR code library installation**
   - What we know: qrcode.react is the standard React QR library
   - What's unclear: Whether the project's build config (config-overrides.js) needs updates
   - Recommendation: Install and test; fallback to copy-only if issues

2. **Transporter addresses: how to list bids in marketplace view?**
   - What we know: `getAllTransporters()` returns arrays per-product, MarketplaceView loads products from factory
   - What's unclear: Whether "My Bids" filter needs to iterate all products (expensive) or use event indexing
   - Recommendation: For now, iterate all products and call `isTransporter(myAddress)` -- optimize later if needed

3. **Product memoHash/railgunTxRef reads for seller confirm flow**
   - What we know: Contract stores `productMemoHashes[id]` and `productRailgunTxRefs[id]`
   - What's unclear: Whether these are easily readable or need events
   - Recommendation: Read `productMemoHashes(id)` and `productRailgunTxRefs(id)` directly -- they're public mappings

## Sources

### Primary (HIGH confidence)
- `contracts/ProductEscrow_Initializer.sol` - Full contract source read
- `frontend/src/utils/vcBuilder.mjs` - v2.0 VC builder source read
- `frontend/src/utils/vcVerifier.js` - Verification source read
- `frontend/src/components/marketplace/ProductDetail.jsx` - Full 1600-line source read
- `frontend/src/components/railgun/PrivatePaymentModal.jsx` - Full 1630-line source read
- `frontend/src/views/MarketplaceView.jsx` - Full source read
- `frontend/src/utils/web3Utils.js` - Full source read
- `frontend/src/components/ui/button.js` - UI component pattern
- `frontend/src/components/ui/Tabs.jsx` - UI component pattern
- `.planning/STATE.md` - Project state and decisions
- `.planning/phases/09-ui-rework/09-CONTEXT.md` - User decisions

### Secondary (MEDIUM confidence)
- Phase 7/8 summaries from STATE.md for contract/VC change history

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, only qrcode.react is new
- Architecture: HIGH - based on direct reading of all source files
- Contract interface: HIGH - read directly from ProductEscrow_Initializer.sol
- Gap analysis: HIGH - line-by-line comparison of UI calls vs contract interface
- Pitfalls: HIGH - identified from actual code paths that will break

**Research date:** 2026-02-17
**Valid until:** Indefinite (internal codebase research, not external dependencies)
