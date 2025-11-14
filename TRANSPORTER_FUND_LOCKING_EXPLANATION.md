# 🔒 Transporter Fund Locking Mechanism

## Answer: When Are Transporter Funds Locked?

**The transporter's delivery fee is locked when the seller selects/chooses the transporter**, NOT when the transporter makes a bid.

---

## 📋 Detailed Flow

### 1. **Transporter Makes a Bid** (`createTransporter`)
```solidity
function createTransporter(uint _feeInWei) public nonReentrant
```
- **Action:** Transporter calls this function with their delivery fee amount
- **What happens:**
  - The fee amount is **stored** in `transporters[msg.sender] = _feeInWei`
  - Transporter is registered: `isTransporter[msg.sender] = true`
  - **NO FUNDS ARE LOCKED** at this point
  - It's just a bid/offer, not a payment

**Code Reference:**
```solidity
// contracts/ProductEscrow_Initializer.sol:458-471
function _createTransporter(uint _feeInWei) internal {
    if (transporterCount >= MAX_BIDS) revert BidCapReached();
    if (transporters[msg.sender] != 0) revert AlreadyExists();
    transporters[msg.sender] = _feeInWei;  // ✅ Just stores the fee amount
    isTransporter[msg.sender] = true;
    transporterAddresses.push(msg.sender);
    transporterCount++;
    emit TransporterCreated(msg.sender, id, _feeInWei, block.timestamp);
    // No phase change here
}
```

---

### 2. **Optional: Security Deposit** (`securityDeposit`)
```solidity
function securityDeposit() public payable nonReentrant
```
- **Action:** Transporter can optionally deposit a security deposit
- **What happens:**
  - Funds are **locked** in `securityDeposits[msg.sender] += msg.value`
  - This is separate from the delivery fee
  - Can be withdrawn if transporter is not selected (via `withdrawBid()`)
  - Used as penalty if transporter fails to deliver on time

**Code Reference:**
```solidity
// contracts/ProductEscrow_Initializer.sol:478-483
function _securityDeposit() internal {
    if (!isTransporter[msg.sender]) revert NotRegistered();
    securityDeposits[msg.sender] += msg.value;  // ✅ Funds locked here
    emit TransporterSecurityDeposit(msg.sender, id, msg.value, block.timestamp);
}
```

---

### 3. **Seller Selects Transporter** (`setTransporter`) ⭐ **THIS IS WHERE DELIVERY FEE IS LOCKED**
```solidity
function setTransporter(address payable _transporter) external payable onlySeller nonReentrant
```
- **Action:** Seller calls this function and **sends the delivery fee** (`msg.value`)
- **What happens:**
  - Seller must send exactly `transporters[_transporter]` (the bid amount)
  - **Delivery fee is locked:** `deliveryFee = msg.value`
  - Transporter is set: `transporter = _transporter`
  - Phase changes to `Phase.Bound`
  - **This is when the delivery fee is actually locked in the contract**

**Code Reference:**
```solidity
// contracts/ProductEscrow_Initializer.sol:437-452
function setTransporter(address payable _transporter) external payable onlySeller nonReentrant {
    if (phase != Phase.OrderConfirmed) revert WrongPhase();
    if (block.timestamp > orderConfirmedTimestamp + BID_WINDOW) revert BiddingWindowNotExpired();
    if (!isTransporter[_transporter]) revert NotATransporter();
    
    // Verify the delivery fee matches what was bid
    if (msg.value != transporters[_transporter]) revert IncorrectDeliveryFee();
    
    deliveryFee = msg.value;  // ✅ DELIVERY FEE LOCKED HERE
    transporter = _transporter;
    
    Phase oldPhase = phase;
    phase = Phase.Bound;
    emit PhaseChanged(id, oldPhase, phase, msg.sender, block.timestamp, msg.value, bytes32(0));
    emit TransporterSelected(id, _transporter, msg.value, block.timestamp);
}
```

---

## 💰 Fund Flow Summary

| Step | Who Pays | What Gets Locked | When |
|------|----------|------------------|------|
| **1. Bid** | Transporter | ❌ Nothing | When transporter calls `createTransporter()` |
| **2. Security Deposit** (Optional) | Transporter | ✅ Security deposit | When transporter calls `securityDeposit()` |
| **3. Selection** | **Seller** | ✅ **Delivery fee** | **When seller calls `setTransporter()`** |

---

## 🔍 Important Points

### 1. **Seller Pays the Delivery Fee**
- The **seller** sends the delivery fee when selecting a transporter
- The transporter does NOT pay the delivery fee upfront
- The delivery fee is locked in the contract and paid to the transporter upon successful delivery

### 2. **Security Deposit is Optional**
- Transporters can optionally deposit a security deposit
- This is separate from the delivery fee
- Used as a penalty if delivery is late
- Can be withdrawn if transporter is not selected

### 3. **Bid Withdrawal**
- Transporters can withdraw their bid (and security deposit) if not selected
- They call `withdrawBid()` to get their security deposit back
- The bid fee itself was never locked, so nothing to refund there

**Code Reference:**
```solidity
// contracts/ProductEscrow_Initializer.sol:720-743
function _withdrawBid() internal {
    if (phase != Phase.OrderConfirmed) revert WrongPhase();
    if (transporter == msg.sender) revert AlreadySelected();
    uint fee = transporters[msg.sender];
    uint deposit = securityDeposits[msg.sender];
    if (fee == 0 && deposit == 0) revert NotRegistered();
    
    transporters[msg.sender] = 0;
    securityDeposits[msg.sender] = 0;  // ✅ Security deposit refunded
    isTransporter[msg.sender] = false;
    transporterCount--;
    
    uint refundAmount = deposit;  // Only security deposit is refunded
    if (refundAmount > 0) {
        (bool sent, ) = payable(msg.sender).call{value: refundAmount}("");
        if (!sent) revert RefundFailed();
        emit FundsTransferred(msg.sender, id, refundAmount, block.timestamp);
    }
    emit BidWithdrawn(msg.sender, id, refundAmount, block.timestamp);
}
```

---

## 🎯 Final Answer

**Q: When does the transporter's money get locked?**
- **A: The delivery fee is locked when the seller selects the transporter** (not when the transporter makes a bid)
- The transporter only makes a bid (no funds locked)
- The seller pays and locks the delivery fee when selecting
- The transporter can optionally lock a security deposit when bidding (separate from delivery fee)

---

## 📊 Visual Flow

```
1. Transporter Bids
   └─> createTransporter(fee)
       └─> Stores fee amount (NO FUNDS LOCKED)
       
2. (Optional) Transporter Deposits Security
   └─> securityDeposit()
       └─> Locks security deposit ✅
       
3. Seller Selects Transporter ⭐
   └─> setTransporter(transporter) + msg.value (delivery fee)
       └─> Locks delivery fee ✅
       └─> Transporter is set
       └─> Phase → Bound
       
4. Delivery Complete
   └─> revealAndConfirmDelivery()
       └─> Transporter receives: deliveryFee + securityDeposit
```

---

## 🔐 Security Considerations

1. **Seller pays delivery fee upfront** - Ensures commitment
2. **Security deposit optional** - Provides incentive for on-time delivery
3. **Bid withdrawal allowed** - Non-selected transporters can recover deposits
4. **Delivery fee locked** - Prevents seller from backing out after selection

---

**Summary:** The delivery fee is locked when the **seller selects the transporter**, not when the transporter makes the bid. The bid is just an offer; the actual payment happens when the seller accepts it.

---

## 💰 When Does the Transporter Get Paid?

**Yes! The transporter gets their funds released when the buyer confirms delivery.**

### Payment Flow on Delivery Confirmation

When the buyer calls `revealAndConfirmDelivery()`:

1. **Buyer confirms delivery** - Calls `revealAndConfirmDelivery(revealedValue, blinding, vcCID)`
2. **Price commitment is verified** - Ensures the revealed price matches the commitment
3. **Funds are distributed:**
   - **Seller receives:** `productPrice` (the purchase price)
   - **Transporter receives:** `deliveryFee + securityDeposits[transporter]`

**Code Reference:**
```solidity
// contracts/ProductEscrow_Initializer.sol:575-614
function _confirmDelivery(string memory vcCID) internal {
    // ... validation checks ...
    
    if (purchaseMode == PurchaseMode.Public) {
        uint256 sellerAmount = productPrice;
        
        // ✅ Transporter payout calculation
        uint256 transporterAmount = deliveryFee + securityDeposits[transporter];
        
        // Zero out funds (effects first)
        productPrice = 0;
        securityDeposits[transporter] = 0;
        deliveryFee = 0;
        
        // Pay seller
        (bool sentSeller, ) = owner.call{value: sellerAmount}("");
        
        // ✅ Pay transporter
        if (transporter != address(0) && transporterAmount > 0) {
            (bool sentTransporter, ) = transporter.call{value: transporterAmount}("");
            if (!sentTransporter) revert TransferFailed(transporter, transporterAmount);
        }
    }
    
    // Transfer ownership to buyer
    owner = buyer;
}
```

### What the Transporter Receives

| Payment Component | Source | When Locked |
|-------------------|--------|-------------|
| **Delivery Fee** | Seller paid when selecting transporter | When seller called `setTransporter()` |
| **Security Deposit** | Transporter's own deposit (optional) | When transporter called `securityDeposit()` |

**Total Payout:** `deliveryFee + securityDeposits[transporter]`

---

## ⏰ Alternative Scenarios

### 1. **Late Delivery (Timeout)**
If delivery is not confirmed within the `DELIVERY_WINDOW` (2 days):
- Buyer can call `deliveryTimeout()`
- Transporter's security deposit is penalized (10% per day late)
- Penalty goes to buyer as refund
- Remaining security deposit (if any) is returned to transporter

**Code Reference:**
```solidity
// contracts/ProductEscrow_Initializer.sol:630-663
function _deliveryTimeout() internal {
    // ... timeout checks ...
    
    uint penalty = (securityDeposits[transporter] * 10 * lateDays) / 100;
    if (penalty > securityDeposits[transporter]) penalty = securityDeposits[transporter];
    
    uint refundToBuyer = productPrice + penalty;  // Buyer gets penalty
    // Transporter loses penalty portion of security deposit
}
```

### 2. **Delivery Cancelled by Seller**
If seller cancels delivery:
- Transporter does NOT receive delivery fee
- Security deposit is returned to transporter
- Buyer gets full refund

---

## 📊 Complete Payment Timeline

```
1. Transporter Bids
   └─> createTransporter(fee)
       └─> No funds locked

2. (Optional) Security Deposit
   └─> securityDeposit()
       └─> Transporter locks security deposit ✅

3. Seller Selects Transporter
   └─> setTransporter() + msg.value
       └─> Seller locks delivery fee ✅

4. Buyer Confirms Delivery ⭐
   └─> revealAndConfirmDelivery()
       └─> Transporter receives: deliveryFee + securityDeposit ✅
       └─> Seller receives: productPrice ✅
       └─> Buyer receives: Product ownership ✅
```

---

## ✅ Final Answer

**Q: When does the transporter get their funds released?**
- **A: When the buyer confirms delivery** by calling `revealAndConfirmDelivery()`
- The transporter receives:
  - The delivery fee (that the seller locked when selecting them)
  - Their security deposit (if they deposited one)
- This happens automatically in the smart contract when delivery is confirmed

