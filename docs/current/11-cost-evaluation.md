# Cost Evaluation (Current)

This document defines how to evaluate the cost profile of the current system.

The goal is to measure:
- blockchain transaction cost
- VRC publication cost
- supporting off-chain operational cost
- how the WASM-first proof path shifts cost away from centralized backend infrastructure

This is separate from latency and proof-performance evaluation.

## 1) Evaluation Goals

The evaluation should answer:

1. What does one full happy-path order cost on-chain?
2. Which actor pays which transaction costs?
3. What off-chain services still introduce recurring cost?
4. How does the current WASM path change the cost model relative to backend proving?
5. Which costs are per-order versus fixed operational costs?

## 2) Scope

Evaluate the currently shipped system:

1. seller creates listing
2. buyer records private order payment
3. seller confirms and anchors final VRC
4. transporter workflow actions where relevant
5. archive/status/indexer/backend support

Include:
- Sepolia gas usage and ETH-denominated transaction cost
- IPFS / Pinata publication assumptions
- backend hosting/storage assumptions
- proof execution cost on client devices versus server-side infrastructure

Do not include:
- ERC-7984 spike cost model
- future production-chain fee projections beyond simple optional estimates

## 3) Cost Dimensions

### A. On-Chain Transaction Cost

Measure for each important transaction:

- `createProductV2(...)`
- `recordPrivateOrderPayment(...)`
- `confirmOrderById(...)`
- `createTransporter(...)`
- `setTransporter(...)`
- `confirmDelivery(...)`
- timeout / withdrawal paths if they are part of the evaluated scenario

For each transaction record:
- tx hash
- gas used
- effective gas price
- total cost in ETH
- optional fiat estimate at the time of reporting

### B. VRC Publication Cost

Evaluate:
- Pinata/IPFS upload dependency
- archive write to backend storage
- expected recurring cost model

For local evaluation, this is mostly a service-dependency note rather than a measured blockchain fee.

### C. Backend Operational Cost

Identify the off-chain services that remain part of the current architecture:

- backend API + SQLite storage
- backend VC archive
- backend credential-status registry
- backend indexer
- RPC/provider usage

Questions:
- which are fixed operational costs?
- which scale per order?
- which are optional for a demo but required for a sustained deployment?

### D. Proof-System Cost

The active flow now supports browser-side WASM proving/verifying.

So the relevant question is no longer on-chain proving cost, but:
- whether proofs require paid backend infrastructure
- whether proof work is shifted to the client browser/device

In the current architecture:
- proof generation cost is primarily client compute
- proof verification cost is primarily client compute
- backend ZKP hosting is no longer required for the active flow when `REACT_APP_ZKP_MODE=wasm`

This should be documented explicitly as an architectural cost reduction.

## 4) Metrics

### Per-Transaction Metrics

For each transaction:
- `gasUsed`
- `gasPriceWei`
- `txCostWei`
- `txCostEth`

Optional:
- `txCostFiat`

### Per-Order Aggregated Metrics

For one full happy-path order, compute:

- seller chain cost total
- buyer chain cost total
- transporter chain cost total
- total chain cost across all actors

### Off-Chain Service Metrics

Qualitative / semi-quantitative:
- Pinata dependency present: yes/no
- archive backend required: yes/no
- credential-status backend required: yes/no
- dedicated proof backend required in active WASM mode: yes/no

Optional estimated categories:
- monthly Pinata/storage plan
- monthly VPS/container hosting cost
- monthly RPC/provider cost assumptions

### Architecture-Cost Shift Metrics

Document:
- `proofBackendRequiredActiveFlow`
- `proofExecutionLocation`
- `centralizedInfrastructureReduction`

## 5) Data Sources

Use:
- wallet tx confirmations
- block explorer receipts
- frontend tx hashes
- contract receipts from console/logs if available
- backend configuration and service dependencies

Where possible, collect:
- exact gas used from the explorer
- effective gas price from the receipt
- tx hash for each measured action

## 6) Test Scenarios

### Scenario A: Happy Path Cost

Measure one full successful order:
- listing creation
- buyer order payment record
- seller confirm/order anchor
- transporter selection / confirm delivery if part of the run

Goal:
- obtain one realistic per-order cost profile

### Scenario B: Minimal Purchase Cost

Measure only:
- listing creation
- buyer order payment record
- seller confirm

Goal:
- isolate the essential purchase/VRC cost without delivery extras

### Scenario C: Recovery / Retry Cost

If a retry flow causes an additional on-chain tx, document it.

Goal:
- determine whether recovery materially increases cost

## 7) Measurement Procedure

For each transaction in the evaluated run:

1. capture tx hash
2. open the receipt or explorer entry
3. record:
   - gas used
   - effective gas price
   - total fee paid
4. map the transaction to the actor:
   - seller
   - buyer
   - transporter

For off-chain cost:
- list the active dependencies used in the run
- classify them as:
  - required in active architecture
  - optional
  - demo-only

## 8) Suggested Results Tables

### Transaction-Level Cost Table

| Action | Actor | Tx Hash | Gas Used | Gas Price (gwei) | Cost (ETH) | Notes |
|---|---|---|---:|---:|---:|---|
| createProductV2 | Seller | `0x576f8e8af763023da644a61c2ccc66b742d6e38e9f19a4555d9ecc464fdebc75` | 315,364 | 1.50000001 | 0.00047304600315364 | Factory created escrow and funded 0.01 ETH protocol collateral internally |
| recordPrivateOrderPayment | Buyer | `0xc2e98fb314abbf1b56dbaa077c38eab287e6255f4ccaea2f91e3d70abfe37b68` | 479,154 | 1.50000001 | 0.00071873100479154 | Buyer anchored `orderId`, `memoHash`, `railgunTxRef`, commitments, and `contextHash` |
| confirmOrderById | Seller | `0x757369712bf0a71acf4340153ef6187dd3329182ea056fb23b3608239035a993` | 117,577 | 1.50000001 | 0.00017636550117577 | Seller anchored final VRC CID/hash for the order |
| createTransporter | Transporter | `0x426af0650f1741eadffe260a273e3d67ed3ecca775b1977725045757eafd6a56` | 155,364 | 1.50000001 | 0.00023304600155364 | Transporter registered with 0.01 ETH bond in this run |
| setTransporter | Seller | `0x1a08eb818f121812aa0e5b3a073dcfa86eeb6d45a621ddbf1b7d710ed39d75a1` | 75,205 | 1.50000001 | 0.00011280750075205 | Seller selected transporter; tx also carried the tiny configured delivery fee amount |
| confirmDelivery | Transporter | `0x8310308c92e4fc39b261d110ba73d5feaae6c99bd15397c25157f1bb2b841848` | 87,361 | 1.50000001 | 0.00013104150087361 | Delivery completion released escrowed payouts |

### Aggregated Actor Cost Table

| Actor | Chain Cost (ETH) | Off-Chain Direct Cost | Notes |
|---|---:|---|---|
| Seller | 0.00076221900508146 | Pinata/IPFS publication dependency | Includes `createProductV2`, `confirmOrderById`, and `setTransporter` tx fees |
| Buyer | 0.00071873100479154 | None directly in normal web usage | This table only covers the escrow/product-contract txs; buyer also paid separate Railgun transfer gas |
| Transporter | 0.00036408750242725 | None directly in normal web usage | Includes `createTransporter` and `confirmDelivery` tx fees |
| System / Operator | 0 ETH per order on-chain | Backend hosting, archive, status, indexer, RPC | Operational rather than per-order chain fee |

### Architecture Cost Table

| Component | Required in Current Active Flow? | Cost Type | Notes |
|---|---|---|---|
| Sepolia gas | Yes | per transaction |  |
| Pinata/IPFS upload | Yes | per service plan / usage |  |
| Backend API + DB | Yes | fixed operational |  |
| Indexer | Yes | fixed operational |  |
| VC archive | Yes | fixed operational |  |
| ZKP backend | No in WASM mode | optional / fallback |  |

## 9) Measured Happy-Path Cost Result

One full happy-path run has already been measured from Sepolia explorer receipts.

### Product-Contract Transaction Total

The five product-contract transactions in the measured run sum to:

- `0.00184503751230025 ETH`

Breakdown by actor:

- Seller: `0.00076221900508146 ETH`
- Buyer: `0.00071873100479154 ETH`
- Transporter: `0.00036408750242725 ETH`

### Important Additional Buyer Cost

The buyer also paid a separate Railgun private-transfer transaction outside the product contract:

- Railgun transfer tx: `0xdd2af9d8e1e22bfa68d8782c9a71dd8457fb2f5860ba72be81ec7fee82d35c05`
- Gas used: `1,204,952`
- Gas price: `1.00000001 gwei`
- Cost: `0.00120495201204952 ETH`

So if the evaluation counts the full chain-visible buyer-side payment path, the buyer's effective chain cost in this run is:

- `0.00192368301684106 ETH`

And the broader end-to-end chain cost across all participating actors plus the Railgun payment layer is:

- `0.00304998952434977 ETH`

### Interpretation

This measured run shows:

- the largest single chain fee in the workflow is the Railgun private-transfer transaction
- the largest product-contract fee is `recordPrivateOrderPayment(...)`
- seller-side order anchoring (`confirmOrderById`) is comparatively inexpensive
- delivery-related contract actions are small relative to the private payment step

### Notes

- The product-address export contained five product-contract transactions:
  - `recordPrivateOrderPayment`
  - `confirmOrderById`
  - `createTransporter`
  - `setTransporter`
  - `confirmDelivery`
- `createProductV2` was measured separately from the factory transaction because it targets the factory, not the newly created product address
- The transporter registration in this run included a `0.01 ETH` bond value transfer, and `setTransporter` included a tiny configured value transfer; those escrowed values are not counted as gas fee

## 10) Success Criteria

The current architecture should be considered cost-reasonable if:

- the essential happy-path chain cost is bounded and explainable
- actor cost allocation is clear
- the proof system does not require dedicated backend infrastructure in active WASM mode
- remaining off-chain costs are operationally simple to justify

## 11) Current Expected Findings

Based on the current implementation, the likely evaluation outcome is:

### Strong Areas
- proof generation and verification no longer require a dedicated active ZKP backend in WASM mode
- on-chain actions are limited to anchor/state-transition transactions rather than on-chain proof verification
- heavy cryptographic work is shifted off-chain to the client browser

### Cost Drivers
- Sepolia transaction fees for listing, purchase recording, seller confirmation, and delivery actions
- Pinata/IPFS publication for final VRC storage
- backend hosting for archive/status/indexer functions

### Key Architectural Observation

The current system trades:
- lower proof-infrastructure centralization

for:
- continued reliance on backend operational services for archival, indexing, and credential status

## 12) Follow-Up Questions

After collecting results, the main follow-up questions should be:

1. Is VRC archival still best handled via Pinata plus backend archive, or should one be reduced?
2. Is the backend indexer/status/archive stack lightweight enough for the intended deployment model?
3. Does the current actor cost distribution match the business logic?
4. Should the delivery flow be included in the primary cost evaluation or treated separately?

## 13) Related Docs

- `docs/current/01-end-to-end-flow.md`
- `docs/current/07-zkp-wasm-path.md`
- `docs/current/08-zkp-wasm-evaluation.md`
- `docs/current/09-end-to-end-latency-and-recovery-evaluation.md`
