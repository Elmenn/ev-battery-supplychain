# Commitment Binding Flow Analysis

## Current Flow (Before Binding)

### Stage 0: Product Creation (Seller)
1. Seller sets public price via `setPublicPrice(priceWei)`
2. Only `publicPriceWei` stored on-chain
3. No commitment stored

### Stage 1: Public Purchase (Buyer)
1. Buyer calls `purchasePublic()` with exact `publicPriceWei`
2. Contract stores buyer address
3. Phase changes to `Purchased`

### Stage 2: VC Creation with ZKP (Buyer)
1. Buyer calls ZKP backend: `POST /zkp/generate-value-commitment` with `value: priceWei`
2. Backend generates **random** Pedersen commitment + proof
3. Buyer embeds commitment in VC's `credentialSubject.price.zkpProof.commitment`
4. VC uploaded to IPFS

### Stage 3: Verification
1. VC verification checks signatures ✅
2. ZKP verification checks proof validity ✅
3. **NO CHECK**: VC commitment vs on-chain reference (doesn't exist yet)

## Problem: Random Blinding Factors

The ZKP backend generates commitments with **random blinding factors**:
```rust
let mut bytes = [0u8; 32];
rng.fill_bytes(&mut bytes);
let blinding = Scalar::from_bytes_mod_order(bytes);
```

This means:
- Seller can't pre-generate the commitment (random each time)
- Buyer generates a different commitment than seller would
- Can't bind VC commitment to on-chain commitment directly

## Solution: Deterministic Commitment Generation

### Approach: Deterministic Blinding Factor

Generate blinding factor deterministically from:
- `productAddress` (known after deployment)
- `sellerAddress` (known during creation)
- Or combination: `keccak256(productAddress + sellerAddress)`

**Benefits:**
- Seller and buyer generate **same commitment** for same product
- No need to store blinding factor (can recompute)
- Maintains privacy (blinding is still secret, just deterministic)
- Enables binding verification

### Implementation Plan

#### Step 1: Create Deterministic Commitment Utility

**File:** `frontend/src/utils/commitmentUtils.js`

```javascript
/**
 * Generate deterministic blinding factor for Pedersen commitment
 * @param {string} productAddress - Escrow contract address
 * @param {string} sellerAddress - Seller's EOA address
 * @returns {string} - 32-byte hex string for blinding factor
 */
export function generateDeterministicBlinding(productAddress, sellerAddress) {
  // Use keccak256 of productAddress + sellerAddress as seed
  const seed = ethers.solidityPackedKeccak256(
    ['address', 'address'],
    [productAddress, sellerAddress]
  );
  return seed; // 32 bytes, can be used as scalar
}
```

**Note:** The ZKP backend expects a u64 value, but we need to convert the deterministic seed to a format the backend can use. We have two options:

1. **Modify ZKP backend** to accept deterministic blinding factor
2. **Generate commitment on frontend** (would require WASM port of Bulletproofs)

**Recommendation:** Option 1 - Add endpoint to ZKP backend that accepts blinding factor.

#### Step 2: Update ZKP Backend

**File:** `zkp-backend/src/main.rs`

Add new endpoint:
```rust
#[post("/zkp/generate-value-commitment-with-blinding")]
async fn generate_value_commitment_with_blinding(req: web::Json<ValueCommitmentWithBlindingRequest>) -> impl Responder {
    let ValueCommitmentWithBlindingRequest { value, blinding_hex } = req.0;
    // Parse blinding from hex
    // Use provided blinding instead of random
    // Generate commitment and proof
}
```

#### Step 3: Update Product Creation Flow

**File:** `frontend/src/components/marketplace/ProductFormStep3.jsx`

**Changes:**
1. After product deployment, compute deterministic blinding
2. Call ZKP backend with value + blinding to get commitment
3. Call `setPublicPriceWithCommitment(priceWei, commitment)` instead of `setPublicPrice(priceWei)`
4. Store commitment in localStorage for reference

#### Step 4: Update Buyer VC Generation Flow

**File:** `frontend/src/components/marketplace/ProductDetail.jsx`

**Changes:**
1. When buyer generates VC, fetch `publicPriceCommitment` from contract
2. Compute same deterministic blinding (productAddress + sellerAddress)
3. Call ZKP backend with value + blinding
4. Verify generated commitment matches on-chain commitment
5. If match: proceed with VC creation
6. If no match: error (shouldn't happen with deterministic blinding)

#### Step 5: Add Verification Step

**File:** `frontend/src/components/vc/VerifyVCInline.js` or new component

**New verification:**
- Fetch `publicPriceCommitment` from contract
- Compare with VC's `credentialSubject.price.zkpProof.commitment`
- Show "On-chain binding verified" badge if match

## Impact Analysis

### What Changes

1. **Product Creation (Seller)**
   - ✅ Calls ZKP backend to generate commitment
   - ✅ Stores commitment on-chain via `setPublicPriceWithCommitment`
   - ✅ Slightly longer creation time (one extra API call)

2. **Public Purchase (Buyer)**
   - ✅ No changes - still calls `purchasePublic()` with ETH

3. **VC Generation (Buyer)**
   - ✅ Fetches on-chain commitment
   - ✅ Verifies commitment matches before creating VC
   - ✅ Slightly longer VC generation (one contract read + verification)

4. **VC Verification**
   - ✅ New check: VC commitment vs on-chain commitment
   - ✅ Shows binding verification status

### What Stays the Same

1. ✅ VC signature verification (unchanged)
2. ✅ ZKP proof verification (unchanged)
3. ✅ IPFS storage (unchanged)
4. ✅ Delivery confirmation flow (unchanged)
5. ✅ All existing VC stages (Stage 0, 1, 2, 3)

### Backward Compatibility

**Legacy Products:**
- Products created before binding have `publicPriceCommitment = 0x00...00`
- UI should handle gracefully:
  - Show "Legacy product - no commitment binding" message
  - Skip commitment verification for legacy products
  - All other functionality works normally

## Testing Checklist

- [ ] Product creation with commitment binding
- [ ] Public purchase flow (unchanged)
- [ ] VC generation with commitment verification
- [ ] VC verification with binding check
- [ ] Legacy product handling (no commitment)
- [ ] Error handling (commitment mismatch, ZKP backend down)
- [ ] End-to-end flow: creation -> purchase -> VC -> verification

## Security Considerations

1. **Deterministic Blinding Security**
   - Blinding is still secret (only seller/buyer can compute)
   - Deterministic doesn't mean predictable to attackers
   - Product address is public, but combined with seller address provides entropy

2. **Commitment Binding**
   - Prevents VC tampering (can't change commitment after product creation)
   - Enables audit trail (on-chain record of expected commitment)
   - Doesn't reveal price (commitment is hiding)

3. **Backward Compatibility**
   - Legacy products still work
   - No breaking changes to existing flows
   - Gradual migration path

