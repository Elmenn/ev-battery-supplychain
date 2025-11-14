# ZKP & Privacy in Our EV Battery Supply Chain DApp

> **See also:**
> - [ZKP Technical Background](./zkp-technical-background.md) - Comprehensive background on ZKPs, Pedersen Commitments, and Bulletproofs
> - [ZKP Security Enhancements Analysis](./zkp-security-enhancements-analysis.md) - Analysis of proposed security improvements
> - [ZKP & VC Architecture](./zkp-vc-architecture.md) - Detailed architecture and workflow

## 1. What We Have Built

### **A. Confidential Price Commitments with On-Chain Binding**
- The product price is **never stored on-chain in plaintext**.
- Instead, a **Pedersen commitment** (commitment of price + deterministic blinding factor) is stored on-chain in the `ProductEscrow` contract via `setPublicPriceWithCommitment()`.
- The blinding factor is **deterministically generated** from `keccak256(productAddress + sellerAddress)`, ensuring seller and buyer generate the same commitment.
- The actual price and blinding factor are kept off-chain (in the browser or in the Verifiable Credential).
- The on-chain commitment serves as an **immutable anchor** that can be verified against the commitment in the VC.

### **B. Zero-Knowledge Proofs (ZKP)**
- When a product is created, the seller generates a **Pedersen commitment with deterministic blinding** and stores it on-chain.
- When a buyer purchases a product, a **ZKP is generated** (using a Rust backend) to prove that the committed price is within a valid range (e.g., 0 < price < 2^64), **without revealing the actual price**.
- The ZKP is included in the final Verifiable Credential (VC) as a field under `credentialSubject.price.zkpProof`.
- The ZKP can be verified by anyone with the VC, proving the price is in range without revealing it.
- The VC commitment can be **verified against the on-chain commitment** to ensure integrity and prevent tampering.

### **C. Verifiable Credentials (VC) Chain**
- Each product's lifecycle is recorded as a chain of VCs, with each stage signed by the relevant party (seller, then buyer).
- The `price` field in the VC is always a stringified JSON object:
  - **Stage 0/1 (Initial):** `{"hidden":true, "zkpProof":{"commitment":"...", "proof":"...", "protocol":"bulletproofs-pedersen", "proofType":"zkRangeProof-v1"}}`
  - **Stage 2 (Intermediate):** Inherits from Stage 0/1 (commitment preserved)
  - **Stage 3 (Final):** Same structure as Stage 0/1, with both seller and buyer signatures
- The ZKP commitment and proof are included from the initial VC (Stage 0/1), ensuring the commitment is bound to the product from creation.

### **D. Privacy by Design**
- The price is never revealed to unauthorized parties, on-chain or off-chain.
- Only the buyer and seller know the actual price and blinding factor.
- The VC chain and on-chain data do not leak the price.

---

## 2. How ZKP Works in Our System

- **On product creation:**
  - Seller generates a **deterministic blinding factor** from `keccak256(productAddress + sellerAddress)`.
  - Seller creates a Pedersen commitment to the price using this blinding factor (via ZKP backend).
  - Seller stores both the public price and the commitment on-chain via `setPublicPriceWithCommitment()`.
  - The commitment is included in the initial VC.
  - No price is revealed, but the commitment is publicly verifiable.

- **On purchase:**
  - Buyer purchases the product via `purchasePublic()`, sending the exact `publicPriceWei` as `msg.value`.
  - The contract stores the buyer address and changes phase to `Purchased`.
  - Buyer can verify that the VC commitment matches the on-chain commitment.

- **On delivery confirmation (Stage 3 VC):**
  - Buyer generates the same commitment using the same deterministic blinding (productAddress + sellerAddress are known).
  - Buyer generates a ZKP (via backend) with deterministic blinding, proving the committed price is in a valid range.
  - The generated commitment is verified to match the on-chain commitment.
  - The ZKP is included in the final VC, which is signed by both seller and buyer.
  - The buyer reveals the price and blinding factor to the contract (to unlock payment), and the contract checks the commitment.
  - The final VC (signed by both parties) contains the ZKP, allowing third parties to verify the price was in range, but not see the value.
  - Third parties can verify that the VC commitment matches the on-chain commitment, ensuring integrity.

---

## 2.1. Technical Implementation Details

### **ZKP Backend (Rust)**
- **Library:** `bulletproofs` crate (Dalek-NG implementation)
- **Cryptographic Curve:** Ristretto255 (compressed Ristretto points, 32 bytes)
- **Proof Type:** Bulletproofs range proof (single-party, 64-bit range)
- **Commitment Format:** `CompressedRistretto` (32 bytes, hex-encoded in API)
- **Proof Format:** Serialized bytes (hex-encoded in API)

### **API Endpoints**
- **`POST /zkp/generate-value-commitment-with-blinding`**
  - **Request:** `{value: u64, blinding_hex: string}` (32-byte hex string)
  - **Response:** `{commitment: string, proof: string, verified: boolean}`
  - **Purpose:** Generate Pedersen commitment and ZKP proof with deterministic blinding

- **`POST /zkp/verify-value`**
  - **Request:** `{commitment: string, proof: string}` (hex-encoded)
  - **Response:** `{verified: boolean}`
  - **Purpose:** Verify a ZKP proof against a commitment

### **Deterministic Blinding Algorithm**
```javascript
// Frontend implementation (commitmentUtils.js)
blinding = keccak256(solidityPacked(['address', 'address'], [productAddress, sellerAddress]))
```
- **Input:** Product escrow address + Seller EOA address (both checksummed)
- **Output:** 32-byte hex string (64 hex characters, no 0x prefix)
- **Purpose:** Ensures seller and buyer generate the same commitment for the same product

### **Smart Contract Storage**
- **Storage Variable:** `bytes32 public publicPriceCommitment;`
- **Function:** `setPublicPriceWithCommitment(uint256 priceWei, bytes32 commitment)`
- **Access Control:** `onlySeller`, `whenNotStopped`, `phase == Listed`
- **Event:** `PublicPriceCommitmentSet(uint256 indexed id, bytes32 commitment)`

### **VC Structure**
The ZKP proof is stored in the VC as:
```json
{
  "credentialSubject": {
    "price": "{\"hidden\":true,\"zkpProof\":{\"commitment\":\"...\",\"proof\":\"...\",\"protocol\":\"bulletproofs-pedersen\",\"proofType\":\"zkRangeProof-v1\"}}"
  }
}
```
- **Location:** `credentialSubject.price.zkpProof` (stringified JSON)
- **Fields:**
  - `commitment`: Hex-encoded CompressedRistretto point (64 hex chars)
  - `proof`: Hex-encoded Bulletproofs proof bytes
  - `protocol`: `"bulletproofs-pedersen"`
  - `proofType`: `"zkRangeProof-v1"`

---

## 2.2. Commitment Binding (New Feature)

### **What is Commitment Binding?**
Commitment binding is a security enhancement that stores the Pedersen commitment on-chain and allows verification that the commitment in the VC matches the on-chain commitment.

### **How It Works:**
1. **Deterministic Blinding:** The blinding factor is computed from `keccak256(productAddress + sellerAddress)`, ensuring both seller and buyer generate the same commitment.
2. **On-Chain Storage:** During product creation, the seller calls `setPublicPriceWithCommitment(price, commitment)` to store both the public price and the Pedersen commitment on-chain.
3. **VC Inclusion:** The same commitment is included in the VC's `credentialSubject.price.zkpProof.commitment` field.
4. **Verification:** Anyone can verify that the VC commitment matches the on-chain commitment, ensuring:
   - The VC commitment was not tampered with
   - The commitment in the VC is the same one stored on-chain
   - Integrity of the price commitment across the system

### **Benefits:**
- **Tamper Resistance:** Prevents unauthorized modification of the price commitment in off-chain VCs.
- **Auditability:** Allows external parties to verify that the price commitment in a VC matches the on-chain record.
- **Integrity:** Ensures consistency between on-chain and off-chain data.
- **Future-Proof:** Lays the groundwork for on-chain ZKP verification.

### **Verification Process**
1. **Fetch VC from IPFS:** Retrieve the VC using the CID stored on-chain
2. **Extract ZKP Proof:** Parse `credentialSubject.price.zkpProof` from the VC
3. **Verify ZKP:** Call `/zkp/verify-value` with the commitment and proof
4. **Verify Commitment Match:** Compare `vc.credentialSubject.price.zkpProof.commitment` with `contract.publicPriceCommitment()`
5. **Verify Signatures:** Verify EIP-712 signatures of seller and buyer using the VC's `proof` array

### **Current Implementation Status**
- ✅ **Seller Flow:** Seller generates deterministic commitment, stores on-chain, includes in VC
- ✅ **Buyer Flow:** Buyer uses deterministic blinding to generate same commitment, verifies against on-chain commitment
- ✅ **Verification:** ZKP proof verification and commitment matching are fully implemented
- ✅ **Commitment Binding:** On-chain commitment storage and verification working end-to-end

---

## 3. Where the System Lacks (Current Limitations)

- **ETH Payment Privacy:**
  - The actual ETH value sent in the purchase transaction (`msg.value`) is **visible on-chain**.
  - Anyone can see how much ETH was paid by inspecting the transaction.
  - The ZKP/commitment system hides the price in the data and VC, but **not in the payment itself**.

- **No Confidential Payment Pool:**
  - There is no privacy-preserving payment pool or confidential transfer mechanism.
  - The contract does not accept a ZKP for payment; it requires a public ETH transfer.

- **ZKP is Only for Data Privacy:**
  - The ZKP proves the price is in range, but does not hide the ETH transfer amount.
  - The privacy guarantee is for the data/VC, not for the payment.

---

## 4. What Would Be Needed for True Confidential Payments?

- **Integrate a privacy-preserving payment protocol** (e.g., Aztec, Nightfall, or a custom ZKP escrow):
  - Users deposit ETH into a privacy pool and receive confidential notes.
  - Payments are made by transferring notes and submitting ZKPs, not by sending ETH directly.
  - The contract verifies the ZKP and releases funds without revealing the amount on-chain.

- **Major technical challenges:**
  - Requires advanced ZKP circuit design and Solidity integration.
  - Higher gas costs, more complex audits, and user education.
  - Alternatively, leverage an existing protocol like Aztec for easier integration.

---

## 5. Decision Points for the Project

- **Is it sufficient to hide the price in the data/VC, or do we need to hide the ETH payment amount on-chain as well?**
- **If true confidential payments are required:**
  - Are we willing to integrate a protocol like Aztec, or build a custom ZKP payment pool?
  - Do we have the technical resources and time for this?
- **If only data privacy is required:**
  - Our current system is robust and achieves strong privacy for all off-chain and on-chain data, except for the ETH payment itself.

---

## 6. Summary Table

| Feature                        | Current System | True Confidential Payment |
|--------------------------------|---------------|--------------------------|
| On-chain price commitment      | ✅ (Deterministic, bound) | ✅                       |
| Commitment binding (on-chain)  | ✅            | ✅                       |
| ZKP for price range            | ✅            | ✅                       |
| Deterministic blinding         | ✅            | ✅ (if needed)           |
| VC commitment verification     | ✅            | ✅                       |
| ETH value sent visible on-chain| ❌ Hidden     | ✅ Hidden                |
| Off-chain price in VC          | ✅ Hidden     | ✅ Hidden                |

---

## 7. Open Questions for Discussion

- Do we need to hide the ETH payment amount, or is data/VC privacy enough?
- Are there regulatory or user experience reasons to keep payments transparent?
- Are we willing to accept the technical complexity and costs of confidential payments?
