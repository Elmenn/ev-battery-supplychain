# Proof Binding to VC Context: Analysis & Implementation Plan

## Executive Summary

**Proof Binding** is a security enhancement that binds ZKP proofs to the VC context, preventing replay attacks and proof swapping. This document analyzes the implementation approach, pros/cons, and challenges.

---

## What is Proof Binding?

### Current Implementation (No Binding)

```rust
// ZKP Backend: Proof is only bound to commitment
let mut transcript = Transcript::new(b"ValueRangeProof");
let (proof, commitment) = RangeProof::prove_single(
    &bp_gens,
    &pc_gens,
    &mut transcript,
    value,
    &blinding,
    64,
);
```

**Problem:** The proof is only bound to the commitment. A malicious actor could:
1. **Replay Attack:** Use the same proof in a different VC
2. **Proof Swapping:** Swap proofs between different VCs
3. **Context Mismatch:** Use a proof for the wrong product/stage

### Enhanced Implementation (With Binding)

```rust
// ZKP Backend: Proof is bound to VC context
let mut transcript = Transcript::new(b"ValueRangeProof");
transcript.append_message(b"bind", binding_tag); // ✅ Add binding tag
let (proof, commitment) = RangeProof::prove_single(
    &bp_gens,
    &pc_gens,
    &mut transcript,
    value,
    &blinding,
    64,
);
```

**Solution:** The proof is bound to a binding tag that includes:
- `chainId`: Blockchain network (Sepolia = 11155111)
- `escrowAddr`: Product escrow contract address
- `productId`: Product ID from contract
- `stage`: VC stage (0, 1, 2)
- `schemaVersion`: VC schema version ("1.0")
- `previousVC CID`: Previous VC CID (optional, for Stage 2+)

---

## Benefits (Pros)

### 1. **Prevents Replay Attacks** ⭐⭐⭐
- **Problem:** Attacker reuses a proof from one VC in another VC
- **Solution:** Binding tag is unique per context, so proof only works for that context
- **Impact:** High security value

### 2. **Prevents Proof Swapping** ⭐⭐⭐
- **Problem:** Attacker swaps proofs between different VCs
- **Solution:** Binding tag ensures proof matches the VC context
- **Impact:** High security value

### 3. **Stronger Integrity** ⭐⭐
- **Problem:** Proof could be used for wrong product/stage
- **Solution:** Binding tag enforces context-specific proof
- **Impact:** Medium security value

### 4. **Audit Trail** ⭐⭐
- **Problem:** No way to verify proof is for the correct context
- **Solution:** Binding tag provides verification context
- **Impact:** Medium audit value

### 5. **Future-Proof** ⭐
- **Problem:** System may need to support multiple chains/products
- **Solution:** Binding tag makes proofs context-aware
- **Impact:** Low immediate value, high long-term value

---

## Challenges (Cons)

### 1. **VC CID Dependency** ⚠️
- **Problem:** VC CID is not available when generating proof (chicken-egg problem)
- **Impact:** Cannot use VC CID in binding tag for the same VC
- **Solution:** 
  - Use `previousVC CID` for Stage 2+ (available from Stage 0/1)
  - Use available context (chainId, escrowAddr, productId, stage) without current VC CID
  - Store binding tag in VC metadata for verification

### 2. **Bulletproofs Transcript Modification** ⚠️
- **Problem:** Must modify ZKP backend to accept binding tag
- **Impact:** Requires changes to Rust backend
- **Solution:** Add binding tag parameter to proof generation function
- **Complexity:** Low (straightforward modification)

### 3. **Verification Context** ⚠️
- **Problem:** Verifiers must know the binding tag
- **Impact:** Additional context required for verification
- **Solution:** 
  - Include binding tag in VC metadata
  - Derive binding tag from VC context during verification
  - Verify that binding tag matches VC context

### 4. **Backward Compatibility** ⚠️
- **Problem:** Existing VCs don't have binding tags
- **Impact:** Cannot verify old VCs with new verification logic
- **Solution:** 
  - Version the proof type (`zkRangeProof-v1` vs `zkRangeProof-v2`)
  - Support both bound and unbound proofs during transition
  - Document migration path

### 5. **Product ID Dependency** ⚠️
- **Problem:** Product ID must be available when generating proof
- **Impact:** Requires contract call to get product ID
- **Solution:** 
  - Product ID is available from contract (`contract.id()`)
  - Can be fetched during proof generation
  - Low overhead (single contract call)

---

## Implementation Approach

### Phase 1: Context-Based Binding (Without VC CID)

**Binding Tag Components:**
```javascript
const bindingTag = keccak256(
  solidityPacked(
    ['string', 'uint256', 'address', 'uint256', 'uint8', 'string'],
    [
      'zkp-bind-v1',      // Protocol identifier
      chainId,            // Chain ID (11155111 for Sepolia)
      escrowAddr,         // Product escrow address
      productId,          // Product ID from contract
      stage,              // VC stage (0, 1, 2)
      schemaVersion       // VC schema version ("1.0")
    ]
  )
);
```

**Pros:**
- ✅ All context available at proof generation time
- ✅ No chicken-egg problem
- ✅ Simple implementation
- ✅ Prevents replay attacks and proof swapping

**Cons:**
- ⚠️ Doesn't include current VC CID (not available yet)
- ⚠️ Less strict binding (still good security)

### Phase 2: Enhanced Binding (With Previous VC CID)

**Binding Tag Components:**
```javascript
const bindingTag = keccak256(
  solidityPacked(
    ['string', 'uint256', 'address', 'uint256', 'uint8', 'string', 'string'],
    [
      'zkp-bind-v2',      // Protocol identifier
      chainId,            // Chain ID
      escrowAddr,         // Product escrow address
      productId,          // Product ID
      stage,              // VC stage
      schemaVersion,      // VC schema version
      previousVC CID      // Previous VC CID (available for Stage 2+)
    ]
  )
);
```

**Pros:**
- ✅ Includes previous VC CID (stronger binding)
- ✅ Creates VC chain integrity
- ✅ Prevents proof reuse across VC chains

**Cons:**
- ⚠️ Stage 0 cannot use previous VC CID (no previous VC)
- ⚠️ Slightly more complex

---

## Technical Implementation

### 1. ZKP Backend Changes

**File:** `zkp-backend/src/zk/pedersen.rs`

```rust
pub fn prove_value_commitment_with_binding(
    value: u64,
    blinding: Scalar,
    binding_tag: &[u8],  // ✅ New parameter
) -> (CompressedRistretto, Vec<u8>, bool) {
    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(64, 1);

    // ✅ Add binding tag to transcript
    let mut transcript = Transcript::new(b"ValueRangeProof");
    transcript.append_message(b"bind", binding_tag);

    let (proof, commitment) = RangeProof::prove_single(
        &bp_gens,
        &pc_gens,
        &mut transcript,
        value,
        &blinding,
        64,
    ).expect("Range proof generation should not fail");

    let proof_bytes = proof.to_bytes();

    // ✅ Verification must also include binding tag
    let mut transcript = Transcript::new(b"ValueRangeProof");
    transcript.append_message(b"bind", binding_tag);
    let verified = RangeProof::verify_single(
        &proof,
        &bp_gens,
        &pc_gens,
        &mut transcript,
        &commitment,
        64,
    ).is_ok();

    (commitment, proof_bytes, verified)
}
```

**File:** `zkp-backend/src/main.rs`

```rust
#[derive(Deserialize)]
struct ValueCommitmentWithBindingRequest {
    value: u64,
    blinding_hex: String,
    binding_tag_hex: String,  // ✅ New parameter
}

#[post("/zkp/generate-value-commitment-with-binding")]
async fn generate_value_commitment_with_binding_ep(
    req: web::Json<ValueCommitmentWithBindingRequest>
) -> impl Responder {
    // Parse blinding factor
    let blinding_bytes = hex_decode(req.blinding_hex.trim_start_matches("0x"))?;
    let blinding = Scalar::from_bytes_mod_order(blinding_bytes);
    
    // ✅ Parse binding tag
    let binding_tag = hex_decode(req.binding_tag_hex.trim_start_matches("0x"))?;
    
    let (commitment, proof_bytes, verified) = prove_value_commitment_with_binding(
        req.value,
        blinding,
        &binding_tag,
    );
    
    HttpResponse::Ok().json(ValueCommitmentResponse {
        commitment: hex::encode(commitment.as_bytes()),
        proof: hex::encode(proof_bytes),
        verified,
    })
}
```

### 2. Frontend Changes

**File:** `frontend/src/utils/commitmentUtils.js`

```javascript
/**
 * Generate binding tag for ZKP proof
 * Binds proof to VC context to prevent replay attacks
 * 
 * @param {string|number} chainId - Chain ID (11155111 for Sepolia)
 * @param {string} escrowAddr - Product escrow address (checksummed)
 * @param {string|number|bigint} productId - Product ID from contract
 * @param {number} stage - VC stage (0, 1, 2)
 * @param {string} schemaVersion - VC schema version (default: "1.0")
 * @param {string} previousVC CID - Previous VC CID (optional, for Stage 2+)
 * @returns {string} - 32-byte hex string (64 hex chars, no 0x prefix)
 */
export function generateBindingTag({
  chainId,
  escrowAddr,
  productId,
  stage,
  schemaVersion = "1.0",
  previousVC CID = null,
}) {
  if (!chainId || !escrowAddr || productId === undefined || stage === undefined) {
    throw new Error("chainId, escrowAddr, productId, and stage are required");
  }

  // Normalize addresses
  const normalizedEscrow = getAddress(escrowAddr);
  const productIdNum = typeof productId === 'bigint' ? Number(productId) : Number(productId);
  const stageNum = Number(stage);

  // Build binding tag components
  const components = [
    'zkp-bind-v1',           // Protocol identifier
    chainId,                 // Chain ID
    normalizedEscrow,        // Escrow address
    productIdNum,            // Product ID
    stageNum,                // VC stage
    schemaVersion,           // Schema version
  ];

  // Add previous VC CID if available (for Stage 2+)
  if (previousVC CID) {
    components.push(previousVC CID);
  }

  // Generate binding tag using keccak256
  const bindingTag = solidityPackedKeccak256(
    ['string', 'uint256', 'address', 'uint256', 'uint8', 'string', ...(previousVC CID ? ['string'] : [])],
    components
  );

  // Remove 0x prefix and return as hex string (64 chars)
  return bindingTag.slice(2);
}

/**
 * Generate Pedersen commitment with binding tag
 * 
 * @param {number|string|bigint} value - Value to commit to
 * @param {string} productAddress - Escrow contract address
 * @param {string} sellerAddress - Seller's EOA address
 * @param {object} context - Binding context (chainId, productId, stage, etc.)
 * @param {string} zkpBackendUrl - ZKP backend URL
 * @returns {Promise<{commitment: string, proof: string, verified: boolean, bindingTag: string}>}
 */
export async function generateCommitmentWithBinding(
  value,
  productAddress,
  sellerAddress,
  context,
  zkpBackendUrl = 'http://localhost:5010'
) {
  // Generate deterministic blinding
  const blindingHex = generateDeterministicBlinding(productAddress, sellerAddress);

  // Generate binding tag
  const bindingTagHex = generateBindingTag(context);

  // Convert value to u64
  const valueNum = typeof value === 'bigint' ? Number(value) : Number(value);
  if (isNaN(valueNum) || valueNum < 0 || valueNum > Number.MAX_SAFE_INTEGER) {
    throw new Error(`Invalid value: ${value}. Must be a valid u64 number`);
  }

  // Call ZKP backend with value, blinding, and binding tag
  const response = await fetch(`${zkpBackendUrl}/zkp/generate-value-commitment-with-binding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      value: valueNum,
      blinding_hex: `0x${blindingHex}`,
      binding_tag_hex: `0x${bindingTagHex}`,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ZKP backend error: ${errorText}`);
  }

  const data = await response.json();
  return {
    commitment: data.commitment,
    proof: data.proof,
    verified: data.verified,
    bindingTag: bindingTagHex, // ✅ Return binding tag for VC storage
  };
}
```

### 3. VC Structure Changes

**File:** `frontend/src/utils/vcBuilder.mjs`

```javascript
// Add binding tag to ZKP proof metadata
const priceObj = {
  hidden: true,
  zkpProof: {
    protocol: 'bulletproofs-pedersen',
    version: '1.0',
    commitment,
    proof,
    encoding: 'hex',
    verified,
    proofType: 'zkRangeProof-v1',
    bindingTag: bindingTagHex,  // ✅ Add binding tag
    bindingContext: {            // ✅ Add binding context for verification
      chainId,
      escrowAddr,
      productId,
      stage,
      schemaVersion,
      previousVC CID,
    },
  },
};
```

### 4. Verification Changes

**File:** `frontend/src/utils/verifyZKP.js`

```javascript
/**
 * Verify ZKP proof with binding tag
 * 
 * @param {Object} vc - Verifiable Credential
 * @param {Object} context - Verification context (chainId, escrowAddr, productId, stage)
 * @returns {Object} - Verification result
 */
export async function verifyZKPWithBinding(vc, context) {
  // Extract ZKP proof from VC
  const { commitment, proof, bindingTag, bindingContext } = extractZKPProof(vc);

  // ✅ Verify binding tag matches context
  const expectedBindingTag = generateBindingTag({
    chainId: context.chainId,
    escrowAddr: context.escrowAddr,
    productId: context.productId,
    stage: context.stage,
    schemaVersion: bindingContext?.schemaVersion || "1.0",
    previousVC CID: bindingContext?.previousVC CID || null,
  });

  if (bindingTag !== expectedBindingTag) {
    return {
      verified: false,
      error: "Binding tag mismatch - proof is not bound to this VC context",
    };
  }

  // Verify ZKP proof (with binding tag)
  const zkpBackendUrl = process.env.REACT_APP_ZKP_BACKEND_URL || 'http://localhost:5010';
  const response = await fetch(`${zkpBackendUrl}/zkp/verify-value-with-binding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commitment,
      proof,
      binding_tag_hex: `0x${bindingTag}`,
    }),
  });

  const data = await response.json();
  return {
    verified: data.verified && bindingTag === expectedBindingTag,
    bindingTagMatch: bindingTag === expectedBindingTag,
    zkpVerified: data.verified,
  };
}
```

---

## Implementation Plan

### Phase 1: Backend Changes (2-3 hours)
1. ✅ Modify `prove_value_commitment_with_blinding` to accept binding tag
2. ✅ Add binding tag to transcript before proof generation
3. ✅ Update verification to include binding tag
4. ✅ Add new API endpoint `/zkp/generate-value-commitment-with-binding`
5. ✅ Add new API endpoint `/zkp/verify-value-with-binding`
6. ✅ Test backend changes

### Phase 2: Frontend Changes (2-3 hours)
1. ✅ Add `generateBindingTag` function to `commitmentUtils.js`
2. ✅ Update `generateCommitmentWithDeterministicBlinding` to use binding tag
3. ✅ Update `ProductFormStep3.jsx` to generate binding tag at product creation
4. ✅ Update `ProductDetail.jsx` to generate binding tag at delivery confirmation
5. ✅ Store binding tag in VC metadata
6. ✅ Update verification to check binding tag

### Phase 3: Testing (2-3 hours)
1. ✅ Test proof generation with binding tag
2. ✅ Test verification with binding tag
3. ✅ Test binding tag mismatch detection
4. ✅ Test backward compatibility (old proofs without binding tag)
5. ✅ Test end-to-end flow

### Phase 4: Documentation (1 hour)
1. ✅ Update ZKP documentation
2. ✅ Update VC documentation
3. ✅ Update security documentation
4. ✅ Add migration guide

---

## Migration Strategy

### Backward Compatibility

**Option 1: Versioned Proof Types**
- Old proofs: `zkRangeProof-v1` (no binding tag)
- New proofs: `zkRangeProof-v2` (with binding tag)
- Verifier checks proof type and handles accordingly

**Option 2: Optional Binding Tag**
- Binding tag is optional in VC
- If binding tag is present, verify it
- If binding tag is absent, use old verification logic

**Recommendation:** Use Option 1 (versioned proof types) for cleaner separation.

---

## Security Analysis

### Attack Vectors Prevented

1. **Replay Attack:** ✅ Prevented
   - Attacker cannot reuse proof in different VC
   - Binding tag is unique per context

2. **Proof Swapping:** ✅ Prevented
   - Attacker cannot swap proofs between VCs
   - Binding tag ensures proof matches VC context

3. **Context Mismatch:** ✅ Prevented
   - Proof cannot be used for wrong product/stage
   - Binding tag enforces context-specific proof

### Remaining Attack Vectors

1. **Binding Tag Forgery:** ⚠️ Possible if attacker controls context
   - **Mitigation:** Binding tag includes on-chain data (productId, escrowAddr)
   - **Risk:** Low (attacker would need to control contract)

2. **VC CID Manipulation:** ⚠️ Possible if attacker controls IPFS
   - **Mitigation:** VC CID is not used in Phase 1 binding tag
   - **Risk:** Low (IPFS is decentralized)

---

## Conclusion

### Recommendation: ✅ **Implement Proof Binding**

**Rationale:**
- ✅ Significant security improvement
- ✅ Moderate complexity
- ✅ Prevents important attack vectors
- ✅ Can be implemented incrementally
- ✅ No breaking changes (versioned proof types)

**Priority:** High

**Effort:** 6-9 hours total

**Risk:** Low (backward compatible, can be tested incrementally)

---

## Next Steps

1. **Review this analysis** - Confirm approach and priorities
2. **Implement Phase 1** - Backend changes
3. **Implement Phase 2** - Frontend changes
4. **Test thoroughly** - Ensure backward compatibility
5. **Deploy incrementally** - Test on testnet first

---

## References

- [ZKP Security Enhancements Analysis](./zkp-security-enhancements-analysis.md)
- [Bulletproofs Documentation](https://doc.dalek.rs/bulletproofs/)
- [Merlin Transcript Documentation](https://doc.dalek.rs/merlin/)

