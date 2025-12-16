```mermaid
flowchart LR
    subgraph Lifecycle["Intra-product chain (transaction lifecycle)"]
        direction LR
        B0["Battery S0<br/>listing"]
        B1["Battery S1<br/>order confirmed"]
        B2["Battery S2<br/>delivered"]
        B0 -->|previousCredential =<br/>CID(Battery S0)| B1
        B1 -->|previousCredential =<br/>CID(Battery S1)| B2
        HEAD["on-chain:<br/>vcCid = CID(Battery S2)"]
        B2 -.->|on-chain pointer| HEAD
    end

    subgraph Provenance["Inter-product chain (supply chain provenance)"]
        direction LR
        A2["Anode S2<br/>(delivered)"]
        C2["Cathode S2<br/>(delivered)"]
        NOTE1["Anode has S0→S1→S2<br/>with its own previousCredential"]
        NOTE2["Cathode has S0→S1→S2<br/>with its own previousCredential"]
        A2 -.-> NOTE1
        C2 -.-> NOTE2
    end

    B0 -.->|componentCredentials[0] =<br/>CID(Anode S2)| A2
    B0 -.->|componentCredentials[1] =<br/>CID(Cathode S2)| C2

    style Lifecycle fill:#ffffff,stroke:#000000,stroke-width:2px
    style Provenance fill:#ffffff,stroke:#000000,stroke-width:2px
    style B0 fill:#ffffff,stroke:#000000,stroke-width:1.5px
    style B1 fill:#ffffff,stroke:#000000,stroke-width:1.5px
    style B2 fill:#ffffff,stroke:#000000,stroke-width:1.5px
    style A2 fill:#ffffff,stroke:#000000,stroke-width:1px,stroke-dasharray: 5 5
    style C2 fill:#ffffff,stroke:#000000,stroke-width:1px,stroke-dasharray: 5 5
    style HEAD fill:#f0f0f0,stroke:#000000,stroke-width:1px
    style NOTE1 fill:#ffffff,stroke:none,color:#666666,font-size:10px
    style NOTE2 fill:#ffffff,stroke:none,color:#666666,font-size:10px
```

