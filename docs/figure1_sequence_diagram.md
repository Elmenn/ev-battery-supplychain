```mermaid
sequenceDiagram
    participant Buyer as Buyer EOA +<br/>Railgun Wallet
    participant Pool as Railgun<br/>Shielded Pool
    participant Seller as Seller<br/>Railgun Wallet
    participant Escrow as Escrow<br/>Contract

    Note over Buyer,Escrow: Figure 1: End-to-End Private Payment Flow

    Note over Buyer,Pool: Step 1: Shield ETH<br/>(Amount public unless pre-shielded)
    Buyer->>Pool: Shield ETH with deposit proof
    Pool->>Pool: Create commitment in Merkle tree
    Pool-->>Buyer: Commitment confirmed

    Note over Buyer,Seller: Step 2: Private Transfer<br/>(Amount & parties hidden)
    Buyer->>Pool: Generate ZK proof for ownership
    Pool->>Pool: Validate proof & create new commitments
    Pool->>Seller: Encrypted output notes
    Pool-->>Buyer: Transfer confirmed

    Note over Buyer,Seller: Step 3: Off-chain Memo Binding<br/>(Contains amount off-chain)
    Buyer->>Seller: Create memoHash = keccak256(escrow, buyerKey, txRef, amount, token)
    Buyer->>Escrow: Post pending receipt to backend
    Note over Escrow: Backend stores receipt for seller polling

    Note over Seller,Escrow: Step 4: Seller On-chain Confirmation
    Seller->>Escrow: Poll backend for receipt
    Seller->>Escrow: recordPrivatePayment(productId, memoHash, txRef)
    Escrow->>Escrow: Store hash & mark purchased
    Escrow-->>Seller: Payment confirmed on-chain

    Note over Buyer,Escrow: Color Legend:<br/>🔵 Blue = Public/on-chain visible<br/>🟢 Green = Private via Railgun ZK<br/>🟣 Purple = Off-chain only<br/>🔴 Red = On-chain confirmation/action
```

**Caption:** This sequence diagram illustrates the complete private payment flow from ETH shielding through on-chain confirmation. The color coding shows which steps are public, private, off-chain, or require on-chain action.
