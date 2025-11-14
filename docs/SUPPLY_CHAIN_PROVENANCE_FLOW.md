# 🔗 Supply Chain Provenance Flow - UI/UX Design

## Overview

This document explains how the UI/UX will work after implementing supply chain provenance, where assembled products can reference their component VCs.

---

## Current Flow (Single Product Transaction Chain)

```
Step 1: Product Info
  ↓
Step 2: Additional Details
  ↓
Step 2.5: Railgun (Optional)
  ↓
Step 3: Deploy & Create VC
  ↓
Step 4: Success
```

**VC Chain:** `Stage 0 → Stage 2 → Stage 3` (transaction lifecycle only)

---

## New Flow (Supply Chain Provenance)

### Scenario 1: Creating a Component Product (No Changes)

**Example:** Creating a "Cathode" or "Anode" product

```
Step 1: Product Info
  ↓
Step 2: Additional Details
  ↓
Step 2.5: Railgun (Optional)
  ↓
Step 3: Deploy & Create VC
  ↓
Step 4: Success
```

**Result:** Component VC created with `componentCredentials: []` (empty)

---

### Scenario 2: Creating an Assembled Product (NEW)

**Example:** Creating a "Battery" from "Cathode" + "Anode" VCs

```
Step 1: Product Info
  ↓
Step 1.5: Component Selection (NEW)
  ↓
Step 2: Additional Details
  ↓
Step 2.5: Railgun (Optional)
  ↓
Step 3: Deploy & Create VC (with componentCredentials)
  ↓
Step 4: Success (with provenance visualization)
```

---

## Detailed UI/UX Flow

### Step 1: Product Info (Unchanged)

**UI:**
```
┌─────────────────────────────────────┐
│ Step 1: Product Info                │
├─────────────────────────────────────┤
│ Product Name: [Battery________]     │
│ Price (ETH): [0.5________]          │
│                                     │
│ ℹ️ Price will be hidden on-chain    │
│                                     │
│ [Next →]                            │
└─────────────────────────────────────┘
```

**No changes needed here.**

---

### Step 1.5: Component Selection (NEW)

**UI:**
```
┌─────────────────────────────────────────────────────────┐
│ Step 1.5: Component Products (Optional)                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Is this product assembled from other products?          │
│                                                         │
│ ○ No, this is a raw material/component                 │
│ ● Yes, this product uses components                    │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ Component VCs:                                          │
│                                                         │
│ ┌───────────────────────────────────────────────────┐ │
│ │ Component 1:                                      │ │
│ │ IPFS CID: [QmCathodeVC...] [Verify] [Remove]     │ │
│ │ Product: Cathode                                  │ │
│ │ Status: ✅ Verified                               │ │
│ └───────────────────────────────────────────────────┘ │
│                                                         │
│ ┌───────────────────────────────────────────────────┐ │
│ │ Component 2:                                      │ │
│ │ IPFS CID: [QmAnodeVC...] [Verify] [Remove]       │ │
│ │ Product: Anode                                    │ │
│ │ Status: ✅ Verified                               │ │
│ └───────────────────────────────────────────────────┘ │
│                                                         │
│ [+ Add Component VC]                                    │
│                                                         │
│ ℹ️ Add IPFS CIDs of component VCs to establish         │
│    supply chain provenance. Each component VC will     │
│    be fetched and verified before proceeding.          │
│                                                         │
│ [← Back]  [Next →]                                     │
└─────────────────────────────────────────────────────────┘
```

**User Actions:**
1. **Toggle:** Select if product uses components
2. **Add Component:** Click "+ Add Component VC"
3. **Input CID:** Paste IPFS CID (e.g., `QmCathodeVC...`)
4. **Verify:** System fetches VC from IPFS and validates:
   - VC exists and is valid JSON
   - VC has valid signatures
   - VC is a Stage 3 (delivered) VC
   - VC product name is displayed
5. **Remove:** Remove a component if needed

**Validation:**
- ✅ Component VC must exist on IPFS
- ✅ Component VC must be valid (parseable JSON)
- ✅ Component VC should be Stage 3 (delivered) - warning if not
- ✅ Component VC signatures should be valid - warning if not
- ⚠️ Allow adding even if verification fails (with warning)

**Data Stored:**
```javascript
{
  usesComponents: true,
  componentCredentials: [
    {
      cid: "QmCathodeVC...",
      productName: "Cathode",
      verified: true,
      stage: 3,
      issuer: "did:ethr:...",
      holder: "did:ethr:..."
    },
    {
      cid: "QmAnodeVC...",
      productName: "Anode",
      verified: true,
      stage: 3,
      issuer: "did:ethr:...",
      holder: "did:ethr:..."
    }
  ]
}
```

---

### Step 2: Additional Details (Unchanged)

**UI:**
```
┌─────────────────────────────────────┐
│ Step 2: Additional Details          │
├─────────────────────────────────────┤
│ Batch: [BATCH-001________]          │
│ Quantity: [100________]             │
│ Certificate Name: [ISO9001____]     │
│ Certificate CID: [QmCert...]        │
│                                     │
│ [← Back]  [Next →]                  │
└─────────────────────────────────────┘
```

**No changes needed here.**

---

### Step 3: Deploy & Create VC (Modified)

**What Changes:**
- When building Stage 0 VC, populate `componentCredentials` array with CIDs from Step 1.5

**VC Structure:**
```json
{
  "credentialSubject": {
    "productName": "Battery",
    "componentCredentials": [
      "QmCathodeVC...",
      "QmAnodeVC..."
    ],
    "previousCredential": null,
    // ... other fields
  }
}
```

**UI (during processing):**
```
┌─────────────────────────────────────┐
│ Step 3: Deploying & Creating VC     │
├─────────────────────────────────────┤
│                                     │
│ 🔐 Connecting to MetaMask...        │
│ ✅ MetaMask connected               │
│                                     │
│ 🚀 Deploying ProductEscrow...       │
│ ✅ Contract deployed                │
│                                     │
│ 🔐 Generating price commitment...   │
│ ✅ Commitment generated             │
│                                     │
│ 📝 Creating VC with components:     │
│    • Cathode (QmCathodeVC...)       │
│    • Anode (QmAnodeVC...)           │
│ ✅ VC created                       │
│                                     │
│ 📤 Uploading VC to IPFS...          │
│ ✅ VC uploaded: QmBatteryVC...      │
│                                     │
│ 🔐 Storing CID on-chain...          │
│ ✅ CID stored                       │
│                                     │
│ [Processing...]                     │
└─────────────────────────────────────┘
```

---

### Step 4: Success Page (Enhanced)

**UI:**
```
┌─────────────────────────────────────────────────────────┐
│ ✅ Product Created Successfully!                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Product: Battery                                        │
│ Contract: 0x1006e9688D39dE8A7c985F83a291247Cbc299121   │
│ VC CID: QmBatteryVC...                                  │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ 🔗 Supply Chain Provenance:                             │
│                                                         │
│     ┌──────────┐                                        │
│     │ Cathode  │                                        │
│     │ VC       │                                        │
│     └────┬─────┘                                        │
│          │                                              │
│          ├──────────────┐                              │
│          │              │                              │
│     ┌────┴─────┐   ┌────┴─────┐                       │
│     │  Anode   │   │ Battery  │                       │
│     │   VC     │   │   VC     │                       │
│     └──────────┘   └──────────┘                       │
│                                                         │
│ Component VCs:                                          │
│ • Cathode (QmCathodeVC...) [View]                      │
│ • Anode (QmAnodeVC...) [View]                          │
│                                                         │
│ [View Product]  [View VC]  [View Provenance Chain]     │
└─────────────────────────────────────────────────────────┘
```

---

## Product Detail Page (Enhanced)

### Component Products Section

**UI:**
```
┌─────────────────────────────────────────────────────────┐
│ Product: Battery                                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ... (existing product info) ...                         │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ 🔗 Component Products:                                  │
│                                                         │
│ ┌───────────────────────────────────────────────────┐ │
│ │ Cathode                                           │ │
│ │ VC: QmCathodeVC... [View VC] [Verify]            │ │
│ │ Status: ✅ Verified                               │ │
│ └───────────────────────────────────────────────────┘ │
│                                                         │
│ ┌───────────────────────────────────────────────────┐ │
│ │ Anode                                             │ │
│ │ VC: QmAnodeVC... [View VC] [Verify]              │ │
│ │ Status: ✅ Verified                               │ │
│ └───────────────────────────────────────────────────┘ │
│                                                         │
│ [View Full Provenance Chain]                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Provenance Chain Viewer (NEW)

**UI:**
```
┌─────────────────────────────────────────────────────────┐
│ 🔗 Supply Chain Provenance Chain                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Product: Battery                                        │
│ VC: QmBatteryVC...                                      │
│                                                         │
│ Provenance Tree:                                        │
│                                                         │
│                    ┌──────────────┐                     │
│                    │   Battery    │                     │
│                    │  (Current)   │                     │
│                    └──────┬───────┘                     │
│                           │                             │
│            ┌──────────────┼──────────────┐              │
│            │              │              │              │
│      ┌─────┴─────┐  ┌─────┴─────┐  ┌─────┴─────┐      │
│      │  Cathode  │  │   Anode   │  │ Separator │      │
│      │           │  │           │  │           │      │
│      │ VC: Qm... │  │ VC: Qm... │  │ VC: Qm... │      │
│      │ ✅ Valid  │  │ ✅ Valid  │  │ ✅ Valid  │      │
│      └───────────┘  └───────────┘  └───────────┘      │
│                                                         │
│ [Expand All] [Collapse All] [Export Chain]             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- Visual tree/graph of component relationships
- Click to expand/collapse component details
- Verify all component VCs in chain
- Export provenance chain as JSON/PDF
- Navigate to any component VC

---

## Verification Flow (Enhanced)

### Component VC Verification

When verifying a product VC that has components:

1. **Verify the main VC** (existing flow)
2. **Fetch all component VCs** from IPFS
3. **Verify each component VC:**
   - Valid JSON structure
   - Valid signatures
   - Valid ZKP (if present)
   - Commitment matches on-chain (if applicable)
4. **Verify component chain integrity:**
   - All component CIDs in `componentCredentials` exist
   - All component VCs are valid
   - Component VCs are Stage 3 (delivered)

**UI:**
```
┌─────────────────────────────────────────────────────────┐
│ 🔍 Verification Results                                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Main VC (Battery):                                      │
│ ✅ Signatures Valid                                     │
│ ✅ ZKP Valid                                            │
│ ✅ Commitment Matches                                   │
│                                                         │
│ Component VCs:                                          │
│                                                         │
│ • Cathode (QmCathodeVC...):                            │
│   ✅ Valid JSON                                         │
│   ✅ Signatures Valid                                   │
│   ✅ ZKP Valid                                          │
│   ✅ Stage 3 (Delivered)                                │
│                                                         │
│ • Anode (QmAnodeVC...):                                │
│   ✅ Valid JSON                                         │
│   ✅ Signatures Valid                                   │
│   ✅ ZKP Valid                                          │
│   ✅ Stage 3 (Delivered)                                │
│                                                         │
│ ✅ All component VCs verified                           │
│ ✅ Provenance chain integrity verified                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## User Stories

### Story 1: Component Manufacturer
**As a** cathode manufacturer  
**I want to** create a product listing for "Cathode"  
**So that** I can sell it to battery assemblers

**Flow:**
1. Create product "Cathode" (no components)
2. Buyer purchases and receives delivery
3. Stage 3 VC created with `componentCredentials: []`

---

### Story 2: Battery Assembler
**As a** battery assembler  
**I want to** create a "Battery" product that references the "Cathode" and "Anode" VCs I purchased  
**So that** I can prove the provenance of my battery components

**Flow:**
1. Create product "Battery"
2. In Step 1.5, add component VCs:
   - Paste CID of "Cathode" VC (from previous purchase)
   - Paste CID of "Anode" VC (from previous purchase)
3. System verifies component VCs
4. Stage 0 VC created with `componentCredentials: ["QmCathodeVC...", "QmAnodeVC..."]`
5. Buyer can verify full provenance chain

---

### Story 3: Auditor
**As an** auditor  
**I want to** verify the full provenance chain of a battery  
**So that** I can confirm it was assembled from verified components

**Flow:**
1. View "Battery" product
2. Click "View Provenance Chain"
3. System displays tree with all components
4. Click "Verify All" to verify:
   - Main VC signatures, ZKP, commitment
   - All component VCs signatures, ZKP, commitments
   - Component chain integrity
5. Export verification report

---

## Technical Implementation Notes

### Step 1.5 Component Selection

**New Component:** `ProductFormStep1_5_Components.jsx`

**Functions:**
- `fetchAndVerifyComponentVC(cid)` - Fetch VC from IPFS and validate
- `validateComponentVC(vc)` - Check signatures, stage, etc.
- `addComponent(cid)` - Add component to list
- `removeComponent(index)` - Remove component from list

**State:**
```javascript
{
  usesComponents: false,
  componentCredentials: [],
  componentVCs: [], // Full VC objects for display
  loading: false,
  errors: {}
}
```

### VC Builder Modification

**File:** `frontend/src/utils/vcBuilder.mjs`

**Change:**
```javascript
export function buildStage0VC({ 
  product, 
  sellerAddr, 
  issuerProof,
  componentCredentials = [] // NEW
}) {
  // ...
  credentialSubject: {
    // ...
    componentCredentials: componentCredentials.map(c => c.cid || c), // Extract CIDs
    // ...
  }
}
```

### Verification Enhancement

**File:** `frontend/src/components/vc/VerifyVCInline.js`

**New Function:**
```javascript
const handleVerifyComponentChain = async () => {
  // Fetch all component VCs
  // Verify each component VC
  // Display results
}
```

---

## Summary

**Key Changes:**
1. ✅ New Step 1.5 for component selection
2. ✅ Component VC input and verification
3. ✅ Enhanced success page with provenance visualization
4. ✅ Enhanced product detail page with component section
5. ✅ New provenance chain viewer
6. ✅ Enhanced verification to include component chain

**User Benefits:**
- ✅ Full supply chain traceability
- ✅ Visual provenance chain
- ✅ Component verification
- ✅ Exportable provenance reports

**Backward Compatibility:**
- ✅ Products without components work exactly as before
- ✅ `componentCredentials: []` for non-assembled products
- ✅ Existing VCs remain valid

