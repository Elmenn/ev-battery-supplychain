flowchart TD
  A["User creates Product"] --> B["VC issued (off-chain)"]
  B --> C["VC signed (EIP-712)"]
  C --> D["VC uploaded to IPFS"]
  D --> E["VC CID stored on-chain (Product contract)"]
  E --> F["Product listed in Marketplace"]
  F --> G["Buyer purchases product (on-chain)"]
  G --> H["Delivery confirmed (on-chain)"]
  H --> I["ZKP generated for tx hash (off-chain)"]
  I --> J["New VC issued (off-chain, includes tx hash & ZKP)"]
  J --> K["New VC signed and uploaded to IPFS"]
  K --> L["VC CID updated on-chain"]
  L --> M["Traceability via chain of VCs"]
  subgraph Current_Flow
    A
    B
    C
    D
    E
    F
    G
    H
    I
    J
    K
    L
    M
  end