# Transaction Hash Privacy: Breaking the Link Between TX Hashes and Products

## Problem Statement

Currently, transaction hashes are stored directly in VCs (`credentialSubject.transactionId`), creating a direct link:
- **VC contains:** `transactionId: "0xabc123..."`
- **Anyone can:** Look up `0xabc123...` on Etherscan
- **Result:** See the exact ETH value sent, revealing the price

## Current Linkability Points

1. **VC → Transaction Hash:** `credentialSubject.transactionId` stores the hash directly
2. **Transaction Hash → Etherscan:** Hash is public and can be looked up
3. **Etherscan → ETH Value:** Transaction shows `msg.value` (the price)

**Attack Vector:**
```
VC (IPFS) → transactionId → Etherscan → ETH value = Price revealed
```

---

## Solution Options

### Option 1: Transaction Hash Commitment (Recommended) ⭐

**Concept:** Store a Pedersen commitment to the transaction hash instead of the hash itself.

**How it works:**
1. Generate a Pedersen commitment: `C = PedersenCommit(txHash, blinding)`
2. Store `C` in VC instead of `txHash`
3. Use ZKP to prove the commitment is valid without revealing the hash
4. Only authorized parties (buyer/seller) know the actual hash

**Implementation:**
- You already have `prove_txid_commitment()` in `zkp-backend/src/zk/txid_pedersen_proof.rs`!
- Store commitment in VC: `credentialSubject.transactionCommitment`
- Store blinding factor off-chain (in buyer's wallet or encrypted)
- Use ZKP to prove commitment is valid

**Privacy Level:** ⭐⭐⭐⭐ (Very High)
- Transaction hash is hidden
- Commitment doesn't reveal the hash
- ZKP proves validity without revealing
- Only authorized parties can link to Etherscan

**Pros:**
- ✅ Strong privacy (hash is hidden)
- ✅ Already have the code (`prove_txid_commitment`)
- ✅ ZKP proves validity
- ✅ Can still verify authenticity

**Cons:**
- ⚠️ Requires storing blinding factor securely
- ⚠️ Slightly more complex than direct hash

---

### Option 2: Remove Transaction Hash from VC

**Concept:** Simply don't store the transaction hash in the VC at all.

**How it works:**
1. Remove `transactionId` from VC
2. Store transaction hash separately (off-chain, encrypted, or in buyer's wallet)
3. Only authorized parties have access

**Privacy Level:** ⭐⭐⭐⭐⭐ (Maximum)
- No transaction hash in VC
- No linkability possible from VC
- Complete privacy

**Pros:**
- ✅ Maximum privacy
- ✅ Simple implementation
- ✅ No additional ZKP needed

**Cons:**
- ❌ Loses auditability (can't verify which transaction)
- ❌ Harder to link VC to on-chain transaction
- ❌ May need alternative verification method

---

### Option 3: Product-Specific Transaction Identifier

**Concept:** Use a product-specific identifier instead of the actual transaction hash.

**How it works:**
1. Generate: `productTxId = keccak256(productAddress + productId + timestamp + salt)`
2. Store `productTxId` in VC instead of actual `txHash`
3. Map `productTxId → txHash` off-chain (encrypted database)
4. Only authorized parties can look up the mapping

**Privacy Level:** ⭐⭐⭐ (Moderate)
- Transaction hash is not in VC
- Requires off-chain mapping to find actual hash
- Mapping is encrypted/private

**Pros:**
- ✅ Breaks direct linkability
- ✅ Still allows verification (with mapping)
- ✅ Product-specific identifier

**Cons:**
- ⚠️ Requires off-chain mapping service
- ⚠️ Mapping must be secured
- ⚠️ Less transparent than on-chain

---

### Option 4: Merkle Tree Batching

**Concept:** Batch multiple transactions in a Merkle tree, making individual transactions harder to identify.

**How it works:**
1. Collect multiple transactions in a batch
2. Build Merkle tree: `root = MerkleRoot([tx1, tx2, tx3, ...])`
3. Store Merkle root in VC: `credentialSubject.transactionMerkleRoot`
4. Store Merkle proof off-chain (for verification)
5. Individual transaction hashes are hidden in the batch

**Privacy Level:** ⭐⭐⭐ (Moderate)
- Individual transactions are hidden in batch
- Harder to identify specific transaction
- Requires batching mechanism

**Pros:**
- ✅ Hides individual transactions
- ✅ Still allows verification (with Merkle proof)
- ✅ Scalable (batch many transactions)

**Cons:**
- ⚠️ Requires batching infrastructure
- ⚠️ Delays (must wait for batch)
- ⚠️ More complex implementation

---

### Option 5: Hybrid: Commitment + Optional Hash

**Concept:** Store commitment by default, but allow optional hash for public transparency.

**How it works:**
1. Always store: `transactionCommitment` (Pedersen commitment)
2. Optionally store: `transactionId` (only if user opts in for transparency)
3. Default: Commitment only (private)
4. Optional: Both commitment and hash (transparent)

**Privacy Level:** ⭐⭐⭐⭐ (Very High, configurable)
- Default: Maximum privacy
- Optional: Transparency if needed
- User choice

**Pros:**
- ✅ Privacy by default
- ✅ Flexibility (user can opt for transparency)
- ✅ Best of both worlds

**Cons:**
- ⚠️ More complex (two modes)
- ⚠️ Need to handle both cases

---

## Recommended Solution: Option 1 (Transaction Hash Commitment)

### Why This is Best:

1. **You already have the code:** `prove_txid_commitment()` exists in your codebase
2. **Strong privacy:** Transaction hash is hidden
3. **Verifiable:** ZKP proves commitment is valid
4. **Auditable:** Can still verify authenticity (with commitment)
5. **No infrastructure changes:** Works with existing system

### Implementation Steps:

1. **Modify VC Builder:**
   ```javascript
   // Instead of:
   credentialSubject.transactionId = txHash;
   
   // Do:
   const { commitment, proof } = await generateTxHashCommitment(txHash);
   credentialSubject.transactionCommitment = commitment;
   credentialSubject.transactionCommitmentProof = proof;
   ```

2. **Store Blinding Factor:**
   - Store in buyer's wallet (localStorage/encrypted)
   - Or encrypt and store in VC (only buyer can decrypt)

3. **Verification:**
   - Verify ZKP proof of commitment
   - Commitment proves transaction hash is valid
   - But doesn't reveal the hash itself

4. **Optional: Authorized Lookup:**
   - Only buyer/seller can reveal the actual hash (they have blinding factor)
   - They can look up on Etherscan if needed
   - But public can't link VC to transaction

---

## Comparison Table

| Option | Privacy | Verifiability | Complexity | Infrastructure | Recommended |
|--------|---------|---------------|------------|----------------|-------------|
| **1. Hash Commitment** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | None | ✅ **YES** |
| **2. Remove Hash** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐ | None | ⚠️ Maybe |
| **3. Product ID** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | Mapping DB | ⚠️ Maybe |
| **4. Merkle Tree** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | Batching | ❌ No |
| **5. Hybrid** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | None | ⚠️ Maybe |

---

## Implementation Plan for Option 1

### Phase 1: Backend (ZKP)
1. ✅ Already have `prove_txid_commitment()` - verify it works
2. Add `verify_txid_commitment()` if not exists
3. Add API endpoint: `POST /zkp/commit-tx-hash`

### Phase 2: Frontend
1. Modify `buildStage3VC()` to use commitment instead of hash
2. Generate commitment when creating VC
3. Store blinding factor securely (localStorage/encrypted)

### Phase 3: VC Structure
1. Update VC schema:
   ```json
   {
     "credentialSubject": {
       "transactionCommitment": "0x...",  // Pedersen commitment
       "transactionCommitmentProof": "0x..."  // ZKP proof
     }
   }
   ```

### Phase 4: Verification
1. Update auditor to verify commitment proof
2. Remove direct transaction hash lookup
3. Only authorized parties can reveal hash

---

## Privacy Improvement

**Before:**
- Transaction hash in VC → Direct link to Etherscan → Price revealed
- **Privacy: 0%** (completely linkable)

**After (Option 1):**
- Transaction commitment in VC → No direct link → Price hidden
- **Privacy: ~90%** (only authorized parties can link)

**After (Option 2):**
- No transaction hash in VC → No link possible → Price hidden
- **Privacy: 100%** (completely unlinkable, but loses auditability)

---

## Recommendation

**Implement Option 1 (Transaction Hash Commitment)** because:
1. ✅ You already have the code
2. ✅ Strong privacy (90%+)
3. ✅ Maintains verifiability
4. ✅ No infrastructure changes needed
5. ✅ Can be implemented quickly

This makes it **very hard** (but not impossible) to link a VC to a specific transaction, significantly improving privacy while maintaining auditability.

