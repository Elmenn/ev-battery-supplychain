# ZKP & Privacy in Our EV Battery Supply Chain DApp

## 1. What We Have Built

### **A. Confidential Price Commitments**
- The product price is **never stored on-chain in plaintext**.
- Instead, a **Pedersen commitment** (hash of price + blinding factor) is stored on-chain in the `ProductEscrow` contract.
- The blinding factor and price are kept off-chain (in the browser or in the Verifiable Credential).

### **B. Zero-Knowledge Proofs (ZKP)**
- When a buyer purchases a product, a **ZKP is generated** (using a Rust backend) to prove that the committed price is within a valid range (e.g., 0 < price < 2^64), **without revealing the actual price**.
- The ZKP is included in the final Verifiable Credential (VC) as a field under `credentialSubject.price.zkpProof`.
- The ZKP can be verified by anyone with the VC, proving the price is in range without revealing it.

### **C. Verifiable Credentials (VC) Chain**
- Each product's lifecycle is recorded as a chain of VCs, with each stage signed by the relevant party (seller, then buyer).
- The `price` field in the VC is always a stringified object:
  - Early stages: `{"hidden":true}`
  - Final stage:  `{"hidden":true, "zkpProof":{...}}`
- The ZKP is only included in the final VC, after delivery confirmation.

### **D. Privacy by Design**
- The price is never revealed to unauthorized parties, on-chain or off-chain.
- Only the buyer and seller know the actual price and blinding factor.
- The VC chain and on-chain data do not leak the price.

---

## 2. How ZKP Works in Our System

- **On product creation:**
  - Seller creates a Pedersen commitment to the price and stores it on-chain.
  - No price is revealed.

- **On purchase:**
  - Buyer generates a ZKP (via backend) proving the committed price is in a valid range.
  - The ZKP is included in the final VC.

- **On delivery confirmation:**
  - The buyer reveals the price and blinding factor to the contract (to unlock payment), and the contract checks the commitment.
  - The final VC (signed by both parties) contains the ZKP, allowing third parties to verify the price was in range, but not see the value.

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
| On-chain price commitment      | ✅            | ✅                       |
| ZKP for price range            | ✅            | ✅                       |
| ETH value sent visible on-chain| ❌ Hidden     | ✅ Hidden                |
| Off-chain price in VC          | ✅ Hidden     | ✅ Hidden                |

---

## 7. Open Questions for Discussion

- Do we need to hide the ETH payment amount, or is data/VC privacy enough?
- Are there regulatory or user experience reasons to keep payments transparent?
- Are we willing to accept the technical complexity and costs of confidential payments?

---

*Prepared for discussion with project tutor/advisor.* 