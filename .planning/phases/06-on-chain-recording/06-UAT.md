---
status: testing
phase: 06-on-chain-recording
source: [06-01-SUMMARY.md, 06-02-PLAN.md (commits 2660a221, 8026b1ba, 36080900, db23f1b1)]
started: 2026-02-15T12:00:00Z
updated: 2026-02-15T12:00:00Z
---

## Current Test

number: 1
name: Marketplace badge shows "Purchased"
expected: |
  Navigate to the marketplace list. Find a product that has been purchased via private payment. The product card should display a purple "Purchased" badge (not "Awaiting Transporter").
awaiting: user response

## Tests

### 1. Marketplace badge shows "Purchased"
expected: Product card shows purple "Purchased" badge for privately-purchased products
result: [pending]

### 2. ProductDetail disabled button
expected: On the product detail page of a purchased product, the "Pay with Private Funds" button is replaced by a grayed-out "Already Purchased" disabled button
result: [pending]

### 3. Transaction references displayed
expected: On the purchased product's detail page, a purple "Private Payment Details" box shows Railgun Transfer tx hash (clickable Etherscan link), On-Chain Recording tx hash (clickable Etherscan link), and Memo Hash (truncated)
result: [pending]

### 4. Private transfer triggers on-chain recording
expected: After completing a private transfer (proof generation + Railgun tx), MetaMask automatically prompts for a second transaction to call recordPrivatePayment on the contract — no manual step required
result: [pending]

### 5. Success toast with Etherscan link
expected: After recording confirms, a success toast appears with a clickable Etherscan link to the recording transaction
result: [pending]

### 6. Contract error messages are user-friendly
expected: If the recording transaction fails (e.g., product already purchased, wrong phase), the error message is specific and human-readable (not a raw hex revert)
result: [pending]

### 7. End-to-end private payment flow
expected: Full flow works: click "Pay with Private Funds" → proof generation with progress → Railgun transfer confirms → recordPrivatePayment auto-fires → recording confirms → toast with Etherscan → product shows "Purchased" badge and "Already Purchased" button
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0

## Gaps

[none yet]
