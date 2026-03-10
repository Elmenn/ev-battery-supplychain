# Deferred Items - Phase 14

## Intentionally Deferred from Initial Phase 14 Scope

### True Many-Order Escrow Support

Current recommendation for Phase 14 is one active V2 order per escrow clone.
Supporting many concurrent orders in one escrow would require moving buyer/payment/VC/phase state out of product-level storage and into fully isolated order-level delivery and timeout flows.

### On-Chain Proof Verification

Phase 14 keeps quantity-total and total-payment proofs off-chain.
On-chain verification is deferred until the proof bundle, gas budget, and contract scope are stable.

### Direct Railgun Amount Binding

Current V2 design binds proofs to application-level anchors (`memoHash`, `railgunTxRef`, `orderId`, `contextHash`).
Direct cryptographic binding to Railgun internal payment amount witnesses remains deferred research.

### Unified Single-Circuit Proof

Phase 14 uses a proof bundle:
- quantity-total relation
- total-payment equality relation

Combining them into one circuit is deferred until the incremental bundle is stable and benchmarked.

### Partial Fills / Split Deliveries / Order Amendments

Phase 14 assumes one quantity choice and one seller-confirmed fulfillment path per order.
Amendments, partial fills, and split-shipment logic are deferred.
