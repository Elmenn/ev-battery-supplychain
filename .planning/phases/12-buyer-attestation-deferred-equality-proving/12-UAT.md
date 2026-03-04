---
status: complete
phase: 12-buyer-attestation-deferred-equality-proving
source: [12-01-SUMMARY.md, 12-02-SUMMARY.md, 12-03-SUMMARY.md, 12-04-SUMMARY.md, 12-05-SUMMARY.md, 12-06-SUMMARY.md, 12-07-SUMMARY.md]
started: 2026-03-04T00:00:00Z
updated: 2026-03-04T12:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Backend buyer_secrets API — POST endpoint
expected: With the backend running, POST /buyer-secrets returns 200/201 and GET /buyer-secrets/:pa/:ba returns the saved row. Server doesn't crash on either call.
result: pass

### 2. ZKP backend equality proof endpoints
expected: With the ZKP backend running (port 5010), POST /zkp/generate-equality-proof returns a JSON body with proof_r_hex, proof_s_hex, and verified:true. POST /zkp/verify-equality-proof returns verified:true for a valid proof.
result: pass

### 3. Payment flow — buyer attestation non-blocking
expected: When a buyer completes a private payment (recordPrivatePayment succeeds), the payment success screen ("Payment recorded on-chain") appears as normal. Even if the ZKP backend is down or the backend is unreachable, the success screen still appears — it is never blocked by the attestation step.
result: pass

### 4. Payment flow — MetaMask blob signing prompt
expected: After payment confirms on-chain and before the "complete" step renders, MetaMask prompts the buyer to sign the message "EV Supply Chain Buyer Privacy Key v1" (the buyer-blob signing message). The buyer signs, and the success screen then appears.
result: pass

### 5. Seller confirmOrder — ECIES step non-blocking
expected: When the seller clicks "Confirm Order", the flow completes: VC is signed, uploaded to IPFS, and confirmOrder is recorded on-chain. If the buyer has not yet paid (no buyer_secrets row exists), the seller still confirms successfully — a console warning appears but no error is shown to the user.
result: pass

### 6. Buyer panel — "Verify Price" button visibility
expected: After the seller confirms the order (phase = OrderConfirmed), the buyer loads the product detail page and loads the VC via the "Load VC" input. A "Price Verification" panel appears (indigo border) with a "Verify Price" button — but ONLY if the VC's credentialSubject.attestation.encryptedOpening field is present. If encryptedOpening is absent, the panel shows "Price verification available once the seller confirms the order."
result: pass

### 7. Buyer panel — "Generate Equality Proof" gating
expected: "Generate Equality Proof" button does NOT appear until "Verify Price" has been clicked and returned a pass. After Workstream A passes (green "Price verified — commitment matches." text), the "Generate Equality Proof" button appears below it.
result: pass

### 8. Auditor panel — equality proof status card
expected: In the VerifyVCInline auditor panel (accessible to any user via the Audit section), when a VC is loaded that has credentialSubject.attestation present, a "Payment Equality Proof" card appears below the existing chain anchor results. It shows "Not yet generated" if no proof exists, or a "Verify Equality Proof" button if paymentEqualityProof is present in the VC.
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
