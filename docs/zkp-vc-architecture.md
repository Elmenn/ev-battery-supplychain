# ⚡️ EV Battery Supply Chain dApp — ZKP & VC Architecture

## Workflow Overview

```mermaid
sequenceDiagram
    participant Seller
    participant Buyer
    participant Backend
    participant SmartContract
    participant IPFS

    Seller->>Backend: Generate price commitment
    Seller->>IPFS: Upload initial VC (Stage 0/1)
    Seller->>SmartContract: Store initial VC CID
    Buyer->>SmartContract: Purchase product
    Seller->>IPFS: Upload intermediate VC (Stage 2)
    Seller->>SmartContract: Update VC CID
    Buyer->>Backend: Request ZKP for price
    Backend->>Buyer: Return ZKP proof
    Buyer->>Seller: Share VC draft with ZKP
    Seller->>Buyer: Sign VC draft
    Buyer->>IPFS: Upload final VC (Stage 3, with ZKP, both signatures)
    Buyer->>SmartContract: Update VC CID
    Any->>IPFS: Anyone can fetch and verify VC chain
    Any->>SmartContract: Anyone can fetch current VC CID
```

---

## VC Chain Structure

```mermaid
flowchart LR
    subgraph VC_Chain
      VC0[Stage 0/1 VC\nSeller only] --> VC1[Stage 2 VC\nBuyer as holder, seller-signed]
      VC1 --> VC2[Stage 3 VC\nBoth signatures, ZKP included]
    end
    VC2 -->|current| OnChain[ProductEscrow.vcCid]
    VC0 -.->|previousCredential| VC1
    VC1 -.->|previousCredential| VC2
```

---

## Privacy with ZKP

```mermaid
flowchart TD
    subgraph Privacy
      A[Price] -->|Commitment| B[On-chain Commitment]
      B -->|ZKP| C[Final VC]
      C -->|Verification| D[Anyone can verify price in range]
      A -.->|Never revealed| D
    end
```

---

## How ZKP is Used

- **Pedersen Commitment:** Seller commits to the price at product creation (on-chain, not revealed).
- **ZKP (Bulletproofs):** At delivery, a ZKP is generated to prove the price is in an allowed range, without revealing it.
- **VC Inclusion:** The ZKP is included in the final VC, which is signed by both seller and buyer.
- **Verification:** Anyone can verify the ZKP and both signatures, but cannot learn the actual price.

---

## Auditability

- **VC chain is stored on IPFS, anchored on-chain via the latest CID.**
- **Each VC is signed (W3C-compliant `proof` array).**
- **ZKP is included in the final VC.**
- **Anyone can walk the VC chain, verify signatures, and check the ZKP.**

---

## Summary Table

| Stage         | VC Uploaded? | CID On-Chain? | ZKP Included? | Signatures         |
|---------------|:-----------:|:-------------:|:-------------:|:------------------:|
| Initial (0/1) |     Yes     |     Yes       |      No       | Seller             |
| Stage 2       |     Yes     |     Yes       |      No       | Seller             |
| Final (3)     |     Yes     |     Yes       |     Yes       | Seller + Buyer     |

---

**This architecture provides:**
- **Confidentiality:** Price is never revealed, only proven in range.
- **Auditability:** Full VC chain, signatures, and ZKP are all verifiable.
- **Compliance:** Uses W3C VC standards and best practices for ZKP integration. 