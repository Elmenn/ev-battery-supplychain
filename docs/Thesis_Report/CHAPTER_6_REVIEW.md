# Chapter 6 Evaluation Review: Required Updates

## Missing Elements Related to Purchase Transaction Verification

### 1. Gas Costs Section (Line 65, 184)
**Current:** Mentions `confirmOrder` with 2 events
**Issue:** We now use `confirmOrderWithCommitment` which can emit `PurchaseConfirmedWithCommitment` event
**Action Needed:** 
- Update function name to `confirmOrderWithCommitment`
- Update event count (2 or 3 events depending on whether purchase commitment is provided)
- May need to re-measure gas costs if different

### 2. Privacy Analysis - Events Section (Line 121)
**Current:** Only mentions `DeliveryConfirmedWithCommitment` event
**Missing:** `PurchaseConfirmedWithCommitment` event
**Action Needed:** Add mention of purchase transaction-hash commitment event

### 3. Privacy Table (Line 148-157)
**Current:** Doesn't explicitly verify purchase transaction commitment event
**Action Needed:** Add row for purchase transaction commitment verification

### 4. Auditor Verification Workflow (Line 375)
**Current:** Only mentions querying `DeliveryConfirmedWithCommitment` event
**Missing:** Querying `PurchaseConfirmedWithCommitment` event
**Action Needed:** Update to mention both events

### 5. Auditor Verification Time Table (Line 363)
**Current:** "Read on-chain state" step doesn't mention purchase transaction verification
**Action Needed:** Update notes to mention both purchase and delivery transaction verification

### 6. Transaction Verification Metrics
**Missing:** Explicit metric for transaction verification (both purchase and delivery)
**Action Needed:** Add to Auditor Verification Metrics section

## Specific Updates Needed

### Update 1: Gas Costs Metrics (Line 65)
```latex
\item \textbf{Per-transaction gas costs:} Measure gas consumption for core transactions (\texttt{createProduct}, \texttt{setPublicPriceWithCommitment}, \texttt{purchasePublic}, \texttt{confirmOrderWithCommitment}, \texttt{revealAndConfirmDelivery}).
```

### Update 2: Gas Costs Table (Line 184)
```latex
\texttt{confirmOrderWithCommitment} & 77,477 & 77,477 & 77,477 & 0 & 2-3 \\
```
Note: Event count is 2-3 because `PurchaseConfirmedWithCommitment` is only emitted if purchase commitment is provided.

### Update 3: Events Inspection (Line 121)
Add after "delivery transaction-hash commitment":
```latex
and the purchase transaction-hash commitment carried by \texttt{PurchaseConfirmedWithCommitment} (emitted during order confirmation if a purchase commitment is provided).
```

### Update 4: Privacy Table (After Line 155)
Add new row:
```latex
Purchase tx commitment matches event & Transaction verification (Ch.~5) & \checkmark Verified \\
```

### Update 5: Auditor Verification Time Table (Line 363)
Update the "Read on-chain state" step:
```latex
Read on-chain state ($C$, \texttt{vcCid}) + query events & $35.7$ (min $33.6$, max $38.2$) & Single RPC (Ganache) + event queries for \texttt{PurchaseConfirmedWithCommitment} and \texttt{DeliveryConfirmedWithCommitment} \\
```

### Update 6: Auditor Verification Description (Line 375)
Update to:
```latex
In the same pass, the auditor queries both the \texttt{PurchaseConfirmedWithCommitment} event (if emitted during order confirmation) and the \texttt{DeliveryConfirmedWithCommitment} event to verify that the on-chain transaction-hash commitments match the VC commitments (two indexed RPC lookups, <$2$ ms on our setup). These checks are grouped with the "Read on-chain state" step in Table~\ref{tab:eval-auditor-time}.
```

### Update 7: Auditor Verification Metrics (Line 79-85)
Add new bullet point:
```latex
\item \textbf{Transaction verification:} Time to verify both purchase and delivery transactions exist on-chain via commitment events (\texttt{PurchaseConfirmedWithCommitment}, \texttt{DeliveryConfirmedWithCommitment}).
```

## Testing Requirements

Since we've added new features, you should:

1. **Re-measure gas costs** for `confirmOrderWithCommitment`:
   - With purchase commitment (3 events: VcUpdated, OrderConfirmed, PurchaseConfirmedWithCommitment)
   - Without purchase commitment (2 events: VcUpdated, OrderConfirmed)
   - Compare to old `confirmOrder` if you have baseline

2. **Re-test transaction verification**:
   - Verify purchase transaction commitment matches `PurchaseConfirmedWithCommitment` event
   - Verify delivery transaction commitment matches `DeliveryConfirmedWithCommitment` event
   - Test cases where purchase commitment is not provided (no event emitted)

3. **Update auditor verification timing**:
   - Include time for querying `PurchaseConfirmedWithCommitment` event
   - Update total verification time if significantly different

4. **Update privacy analysis**:
   - Verify `PurchaseConfirmedWithCommitment` event doesn't leak transaction hash
   - Verify both events only expose commitments, not plaintext hashes

## Summary

The evaluation chapter needs updates to reflect:
- ✅ Transaction hash commitments are already mentioned (good!)
- ❌ `PurchaseConfirmedWithCommitment` event is missing
- ❌ `confirmOrderWithCommitment` function name needs update
- ❌ Transaction verification for purchase transactions needs explicit evaluation
- ❌ Auditor workflow needs to include purchase transaction verification step

