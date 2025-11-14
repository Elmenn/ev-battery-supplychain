# Figure 4: Threat Model

| **Actor** | **Access Level** | **What They Can Learn** |
|-----------|------------------|-------------------------|
| **Public Observer** | 🔵 **Public** | • Shield deposit amounts<br/>• Nullifiers and commitments<br/>• Merkle root changes<br/>• ZK proof verification<br/>• On-chain escrow events<br/>• Product purchase status |
| **Relayer** | 🟡 **Semi-trusted** | • Gas payment patterns<br/>• Transaction timing<br/>• Network congestion data<br/>• User wallet addresses (if paying gas)<br/>• Transaction metadata |
| **Seller** | 🟢 **Trusted** | • Payment amount (from memo binding)<br/>• Buyer's Railgun address<br/>• Transaction reference<br/>• Product details<br/>• Escrow confirmation status<br/>• Off-chain receipt data |
| **Buyer** | 🟢 **Trusted** | • Own shielded balance<br/>• Own transaction history<br/>• Payment recipient (seller)<br/>• Transaction amounts<br/>• Memo hash contents<br/>• Private transfer details |
| **Escrow Contract** | 🔴 **On-chain** | • memoHash (escrow binding)<br/>• txRef (transaction reference)<br/>• Product purchase status<br/>• Buyer anonymity (0x0 address)<br/>• Payment confirmation events<br/>• Access control (seller-only) |

---

**Color Legend:**
- 🔵 **Blue**: Public access (anyone can observe)
- 🟡 **Yellow**: Semi-trusted (limited access, some metadata)
- 🟢 **Green**: Trusted (full access to relevant information)
- 🔴 **Red**: On-chain (smart contract access)

**Access Level Definitions:**
- **Public**: Information visible to anyone on the blockchain
- **Semi-trusted**: Information available to service providers with limited scope
- **Trusted**: Information available to direct participants in the transaction
- **On-chain**: Information accessible to smart contracts and their logic

**Caption:** This threat model table maps different actors in the system to their access levels and the specific information they can learn, providing a comprehensive view of privacy guarantees and potential information leakage points.
