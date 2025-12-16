# Public Payment Flow: Transaction Analysis for Etherscan Visibility

## Which Transactions Show ETH Values on Etherscan?

### Transaction Flow in Public Purchase

```
1. Buyer → purchasePublic() [msg.value = productPrice] ⚠️ REVEALS PRICE
2. Seller → confirmOrder() [msg.value = 0] ✅ No ETH
3. Transporter → createTransporter() [msg.value = 0] ✅ No ETH
4. Transporter → securityDeposit() [msg.value = deposit] ⚠️ Shows deposit (not price)
5. Seller → setTransporter() [msg.value = deliveryFee] ⚠️ Shows fee (not price)
6. Buyer → revealAndConfirmDelivery() [msg.value = 0] ✅ No ETH sent
   └─> Internal: _confirmDelivery() sends ETH to seller & transporter
       (visible in transaction trace, but not msg.value)
```

---

## Detailed Analysis

### 1. ✅ **purchasePublic()** - **CRITICAL: REVEALS PRODUCT PRICE**

```solidity
function purchasePublic() external payable {
    if (msg.value != publicPriceWei) revert IncorrectFee();
    productPrice = msg.value; // Escrow the actual ETH received
    // ...
}
```

**Etherscan Visibility**:
- ✅ **Transaction shows `msg.value = productPrice`**
- ✅ **Anyone can see the exact purchase price**
- ⚠️ **This is the MAIN transaction that reveals the price**

**Should we hide this TX hash?**: ✅ **YES - HIGH PRIORITY**

**Current Status**: ❌ **NOT hidden** - Transaction hash is public, price visible on Etherscan

---

### 2. ✅ **setTransporter()** - Shows Delivery Fee (Not Product Price)

```solidity
function setTransporter(address payable _transporter) external payable {
    if (msg.value != transporters[_transporter]) revert IncorrectDeliveryFee();
    deliveryFee = msg.value; // Use the actual ETH sent
    // ...
}
```

**Etherscan Visibility**:
- ✅ **Transaction shows `msg.value = deliveryFee`**
- ⚠️ **Shows delivery fee, NOT product price**
- ⚠️ **Could be used to estimate price range (fee is usually % of price)**

**Should we hide this TX hash?**: ⚠️ **OPTIONAL - Medium Priority**
- Doesn't directly reveal price
- But could be used for inference

**Current Status**: ❌ **NOT hidden**

---

### 3. ✅ **securityDeposit()** - Shows Security Deposit (Not Product Price)

```solidity
function securityDeposit() public payable {
    securityDeposits[msg.sender] += msg.value;
    // ...
}
```

**Etherscan Visibility**:
- ✅ **Transaction shows `msg.value = securityDeposit`**
- ⚠️ **Shows security deposit amount, NOT product price**
- ⚠️ **Usually a fixed amount or small % of price**

**Should we hide this TX hash?**: ❌ **NO - Low Priority**
- Doesn't reveal price
- Usually a fixed/small amount

**Current Status**: ❌ **NOT hidden**

---

### 4. ✅ **revealAndConfirmDelivery()** - No ETH Sent, But Internal Transfers Visible

```solidity
function revealAndConfirmDelivery(uint revealedValue, bytes32 blinding, string memory vcCID) public {
    // msg.value = 0 (no ETH sent by caller)
    _confirmDelivery(vcCID);
}

function _confirmDelivery(string memory vcCID) internal {
    // Internal transfers via .call{value:}
    owner.call{value: sellerAmount}(""); // productPrice
    transporter.call{value: transporterAmount}(""); // deliveryFee + securityDeposit
}
```

**Etherscan Visibility**:
- ✅ **Transaction shows `msg.value = 0`** (no ETH sent by buyer)
- ⚠️ **Internal transfers visible in transaction trace**
- ⚠️ **Can see `sellerAmount = productPrice` in trace**
- ⚠️ **Can see `transporterAmount = deliveryFee + securityDeposit` in trace**

**Should we hide this TX hash?**: ✅ **YES - HIGH PRIORITY**
- Internal transfers reveal the product price
- Currently we're hiding this one ✅

**Current Status**: ✅ **HIDDEN** - We already commit to this transaction hash

---

### 5. ✅ **confirmOrder()** - No ETH

```solidity
function confirmOrder(string memory vcCID) public {
    // msg.value = 0 (no ETH)
    // ...
}
```

**Etherscan Visibility**:
- ✅ **No ETH sent**
- ✅ **No sensitive data**

**Should we hide this TX hash?**: ❌ **NO**

**Current Status**: ❌ **NOT hidden** (not needed)

---

### 6. ✅ **createTransporter()** - No ETH

```solidity
function createTransporter(uint _feeInWei) public {
    // msg.value = 0 (no ETH)
    transporters[msg.sender] = _feeInWei; // Just stores the fee
    // ...
}
```

**Etherscan Visibility**:
- ✅ **No ETH sent**
- ✅ **Fee is stored but not sent**

**Should we hide this TX hash?**: ❌ **NO**

**Current Status**: ❌ **NOT hidden** (not needed)

---

## Summary: Which TX Hashes Should We Hide?

| Transaction | Shows Price? | Priority | Current Status |
|------------|--------------|----------|----------------|
| **purchasePublic()** | ✅ **YES** (msg.value) | 🔴 **HIGH** | ❌ **NOT hidden** |
| **revealAndConfirmDelivery()** | ✅ **YES** (internal transfers) | 🔴 **HIGH** | ✅ **HIDDEN** |
| **setTransporter()** | ⚠️ Indirect (fee inference) | 🟡 **MEDIUM** | ❌ **NOT hidden** |
| **securityDeposit()** | ❌ No | 🟢 **LOW** | ❌ **NOT hidden** |
| **confirmOrder()** | ❌ No | 🟢 **NONE** | ❌ **NOT hidden** |
| **createTransporter()** | ❌ No | 🟢 **NONE** | ❌ **NOT hidden** |

---

## Recommendations

### 🔴 **HIGH PRIORITY: Hide Purchase Transaction Hash**

**Why**: 
- Directly reveals product price via `msg.value`
- First transaction in the flow
- Most critical for privacy

**Implementation**:
- Add TX hash commitment to Stage 1 VC (Order Confirmation)
- Similar to how we add it to Stage 3 VC for delivery

**Challenge**:
- Purchase happens BEFORE VC creation
- Need to store commitment somewhere until VC is created
- Options:
  1. Store in contract temporarily
  2. Store in localStorage (current approach for delivery)
  3. Add to Stage 1 VC when seller confirms order

### ✅ **Already Hidden: Delivery Transaction**

**Status**: ✅ We already hide the delivery transaction hash in Stage 3 VC

**Why**: 
- Internal transfers reveal product price
- Critical transaction for completion

### 🟡 **OPTIONAL: Hide Transporter Selection Transaction**

**Why**:
- Delivery fee could be used to infer price range
- Not critical, but could enhance privacy

**Priority**: Medium (can be added later if needed)

---

## Implementation Plan

### Phase 1: Hide Purchase Transaction Hash (HIGH PRIORITY)

1. **Generate commitment after purchase**
   - After `purchasePublic()` transaction
   - Store commitment temporarily (localStorage or contract)

2. **Add to Stage 1 VC**
   - When seller calls `confirmOrder()`
   - Include purchase TX hash commitment in Stage 1 VC

3. **Verification**
   - Verifier can check commitment matches purchase transaction
   - Proves purchase without revealing hash

### Phase 2: Optional Enhancements

1. Hide transporter selection transaction hash
2. Add binding tags to link all commitments

---

## Current State vs. Recommended State

### Current State
- ✅ Delivery transaction hash: **HIDDEN** (Stage 3 VC)
- ❌ Purchase transaction hash: **VISIBLE** (shows price on Etherscan)
- ❌ Transporter selection: **VISIBLE** (shows fee)

### Recommended State
- ✅ Delivery transaction hash: **HIDDEN** (Stage 3 VC)
- ✅ Purchase transaction hash: **HIDDEN** (Stage 1 VC) ← **ADD THIS**
- ⚠️ Transporter selection: **OPTIONAL** (can add later)

---

## Conclusion

**The purchase transaction (`purchasePublic()`) is the most critical one to hide** because it directly reveals the product price via `msg.value` on Etherscan. We should add TX hash commitment for the purchase transaction, similar to how we do it for the delivery transaction.

