# Figure 2: Privacy at Each Step

| **Step** | **Visible on-chain** | **Hidden** |
|----------|----------------------|------------|
| **Shield ETH** | • Deposit amount<br/>• Buyer EOA address<br/>• Commitment hash<br/>• Merkle tree update | • Buyer's Railgun address<br/>• Note encryption keys<br/>• Internal note structure |
| **Private Transfer** | • Nullifiers (spent notes)<br/>• New commitments<br/>• Merkle root changes<br/>• ZK proof verification | • Transfer amount<br/>• Sender identity<br/>• Recipient identity<br/>• Note contents |
| **Off-chain Memo Binding** | No on-chain record | • Memo hash contents<br/>• Transaction reference<br/>• Amount details<br/>• Buyer identity<br/>• Product information |
| **Seller Confirmation** | • memoHash (escrow binding)<br/>• txRef (transaction reference)<br/>• Product purchase status<br/>• Escrow state changes | • Actual payment amount<br/>• Buyer EOA address<br/>• Private transfer details<br/>• Note contents |

---

**Color Legend:**
- 🔵 **Blue**: Public/on-chain visible information
- 🟢 **Green**: Hidden/private information
- ⚪ **White**: No on-chain record (off-chain only)

**Caption:** This table shows the privacy characteristics of each step in the private payment process, clearly distinguishing between what becomes visible on-chain and what remains hidden through Railgun's privacy mechanisms.
