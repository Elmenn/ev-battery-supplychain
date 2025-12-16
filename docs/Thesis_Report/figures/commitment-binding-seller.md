```mermaid
sequenceDiagram
    participant Seller
    participant ZKPBackend as ZKP Backend
    participant Escrow as ProductEscrow
    participant IPFS as IPFS (Storage)

    Note over Seller,Escrow: Seller: Commitment Creation (Product Listing, Stage S0)

    Seller->>Seller: (1) Choose public price v in the frontend\n(no price is sent on-chain yet)

    Seller->>Seller: (2) Compute deterministic blinding b = keccak256(escrowAddr, sellerAddr, protocolLabel)\nCompute price binding tag t_price from protocol + VC context

    Seller->>ZKPBackend: (3) POST /zkp/generate-value-commitment-with-blinding(v, b, t_price)

    ZKPBackend->>ZKPBackend: Generate Pedersen commitment C = Com(v; b)\nGenerate Bulletproofs range proof π bound to t_price
    ZKPBackend->>Seller: (4) Return { commitment: C, proof: π, bindingTag: t_price }

    Seller->>Escrow: (5) setPublicPriceWithCommitment(C)
    Escrow->>Escrow: Store C in publicPriceCommitment
    Escrow->>Escrow: Set commitmentFrozen = true
    Escrow->>Escrow: Emit PublicPriceCommitmentSet(id, C)

    Note over Seller,IPFS: After commitment stored on-chain

    Seller->>Seller: (6) Build Stage S0 VC\ncredentialSubject.price.zkp = { C, π, t_price }
    Seller->>Seller: (7) Sign S0 VC with EIP-712 (seller as issuer)

    Seller->>IPFS: (8) Upload Stage S0 VC → get vcCid
    Seller->>Escrow: (9) Call VC CID update function(vcCid)
    Escrow->>Escrow: Store vcCid as VC head for this product (Stage S0)

```

