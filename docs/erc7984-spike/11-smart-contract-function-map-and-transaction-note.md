# ERC-7984 Smart Contract Function Map And Transaction Note

This note focuses on three practical outputs:

- a smart-contract function map
- a transaction table for the current main ERC-7984 flow
- a gas / transaction evaluation note

It is written for the current working ERC-7984 path, not the older Railgun escrow contracts.

It is the detailed smart-contract companion note. The frozen compact smart-contract evaluation is:

- [13-smart-contract-evaluation-summary.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\13-smart-contract-evaluation-summary.md)

## Primary smart-contract files

The current main path is built around these files:

- [ProductFactoryConfidential.sol](c:\Users\yamen\ev-battery-supplychain-erc7984\contracts\erc7984\ProductFactoryConfidential.sol)
- [ProductEscrowConfidential_Initializer.sol](c:\Users\yamen\ev-battery-supplychain-erc7984\contracts\erc7984\ProductEscrowConfidential_Initializer.sol)
- [ConfidentialPaymentFundingWrapper.sol](c:\Users\yamen\ev-battery-supplychain-erc7984\contracts\erc7984\ConfidentialPaymentFundingWrapper.sol)

There is also one important token-level entrypoint used operationally:

- ERC-7984 token `confidentialTransferAndCall(...)`

That token call is what delivers confidential deposits into the escrow receiver.

## What each contract is responsible for

### `ProductFactoryConfidential`

Responsibility:

- deploy a new escrow clone for each product
- initialize the escrow with:
  - product id
  - product name
  - public `unitPrice`
  - `unitPriceHash`
  - seller
  - payment token

Main public entrypoint:

- `createProductConfidentialV1(string name, uint64 unitPrice, bytes32 unitPriceHash, IERC7984 paymentToken)`

Operational meaning:

- one product listing transaction
- one new escrow instance

### `ConfidentialPaymentFundingWrapper`

Responsibility:

- convert a public ERC-20 funding asset into confidential ERC-7984 balance

Main public entrypoint:

- `deposit(uint256 amount)`

Operational meaning:

- user funds private balance before participating in the marketplace flow

### `ProductEscrowConfidential_Initializer`

Responsibility:

- hold ERC-7984 settlement state
- accept confidential deposits
- manage order phases
- manage equality attestation status
- manage transporter bidding and selection
- release confidential payouts

This is the main protocol contract in the current spike.

## Smart-contract function map

### Factory layer

| Function | Triggered by | Purpose | Main writes / effects |
| --- | --- | --- | --- |
| `createProductConfidentialV1(...)` | seller | create product escrow | deploy clone, increment product count, call `initializeConfidential(...)` |
| `createProductConfidentialV1ForSeller(...)` | admin/factory helper path | create product for another seller | same as above, but seller supplied explicitly |

### Funding wrapper layer

| Function | Triggered by | Purpose | Main writes / effects |
| --- | --- | --- | --- |
| `deposit(uint256 amount)` | buyer / seller / transporter | mint confidential balance from public ERC-20 | transfer public token in, mint confidential ERC-7984 balance out |

### Escrow lifecycle layer

| Function | Triggered by | Purpose | Main writes / effects |
| --- | --- | --- | --- |
| `initializeConfidential(...)` | factory only | initialize new escrow clone | sets seller, token, product id, public `unitPrice`, `unitPriceHash`, phase `Listed` |
| `onConfidentialTransferReceived(...)` | ERC-7984 token callback | accept confidential deposit into escrow | dispatches to buyer purchase / seller bond / delivery fee / transporter security handlers |
| `confirmOrderById(bytes32 orderId, string vcCID)` | seller | bind signed VRC after buyer deposit and seller bond/equality | stores `vcHash`, moves `Purchased -> OrderConfirmed` |
| `createTransporter(uint256 quotedFee)` | transporter | register delivery bid | records quoted fee and transporter status |
| `setTransporter(address transporter_)` | seller | select winning transporter | sets transporter, moves `OrderConfirmed -> Bound` |
| `finalizeEqualityAttestation(bytes32 orderId, EqualityTarget target, bytes abiEncodedCleartexts, bytes decryptionProof)` | seller / transporter flow helper | finalize seller/transporter bond equality result | checks decrypted handle result, stores `VerifiedTrue` or `VerifiedFalse` |
| `confirmDelivery(bytes32 orderId, bytes32 hash)` | transporter | confirm delivery against bound VRC hash | checks `vcHash`, releases confidential payouts, moves `Bound -> Delivered` |

### Timeout / recovery layer

| Function | Triggered by | Purpose | Main writes / effects |
| --- | --- | --- | --- |
| `sellerTimeout()` | anyone after timeout | expire if seller never confirms order | refunds/slashes confidential balances, marks order expired |
| `bidTimeout()` | anyone after timeout | expire if no transporter is selected in time | refunds buyer/seller confidential balances, marks order expired |
| `deliveryTimeout()` | anyone after timeout | expire if delivery never completes | redistributes confidential balances, marks order expired |
| `withdrawBid()` | non-selected transporter | remove stale bid | clears bid registration |

### Read / support layer

| Function | Used by | Purpose |
| --- | --- | --- |
| `getOrder(bytes32 orderId)` | frontend / verifier | read buyer, `vcHash`, timestamps, phase |
| `getVcHash()` | transporter / verifier | read bound VRC hash |
| `getAllTransporters()` | seller / transporter UI | list bids |
| `getSellerBondEqualityAttestation()` | seller UI / verifier | read seller attestation status |
| `getTransporterBondEqualityAttestation()` | transporter UI / verifier | read transporter attestation status |
| `hasBuyerDeposit()` / `hasSellerBondDeposit()` / `hasSellerDeliveryFeeDeposit()` / `hasTransporterSecurityDeposit()` | frontend / verifier | read confidential funding presence flags |

## Transaction table for the main live flow

The table below lists the main user-visible transactions in the current ERC-7984 path.

| Step | Actor | Transaction | Main contract/function | Purpose |
| --- | --- | --- | --- | --- |
| 1 | Seller | create listing | factory `createProductConfidentialV1(...)` | deploy new confidential escrow |
| 2 | Any actor | approve funding token | public ERC-20 `approve(...)` | allow wrapper to pull public funding asset |
| 3 | Any actor | fund private balance | wrapper `deposit(...)` | convert public balance into confidential ERC-7984 balance |
| 4 | Buyer | confidential order deposit | token `confidentialTransferAndCall(...)` -> escrow `onConfidentialTransferReceived(...)` | record buyer confidential purchase funding |
| 5 | Seller | seller bond deposit | token `confidentialTransferAndCall(...)` -> escrow `onConfidentialTransferReceived(...)` | record seller confidential bond |
| 6 | Seller helper flow | finalize seller equality | escrow `finalizeEqualityAttestation(...)` | mark seller bond equality result on-chain |
| 7 | Seller | confirm order and bind VRC | escrow `confirmOrderById(...)` | store `vcHash` and move to `OrderConfirmed` |
| 8 | Transporter | submit bid | escrow `createTransporter(...)` | register quoted delivery fee |
| 9 | Seller | select transporter | escrow `setTransporter(...)` | bind chosen transporter |
| 10 | Seller | delivery-fee deposit | token `confidentialTransferAndCall(...)` -> escrow `onConfidentialTransferReceived(...)` | fund confidential delivery fee |
| 11 | Transporter | transporter bond deposit | token `confidentialTransferAndCall(...)` -> escrow `onConfidentialTransferReceived(...)` | record transporter confidential security deposit |
| 12 | Transporter helper flow | finalize transporter equality | escrow `finalizeEqualityAttestation(...)` | mark transporter bond equality result on-chain |
| 13 | Transporter | confirm delivery | escrow `confirmDelivery(...)` | release confidential payouts and move to `Delivered` |

## Simple reading of the transaction pattern

The current main path is not just a sequence of direct escrow calls.

There are really three transaction categories:

### A. Setup transactions

- listing creation
- ERC-20 approval
- wrapper funding deposit

### B. Confidential funding transactions

- buyer purchase deposit
- seller bond deposit
- seller delivery-fee deposit
- transporter security deposit

These all enter through:

- token `confidentialTransferAndCall(...)`
- then escrow `onConfidentialTransferReceived(...)`

### C. Control / governance transactions

- `finalizeEqualityAttestation(...)`
- `confirmOrderById(...)`
- `createTransporter(...)`
- `setTransporter(...)`
- `confirmDelivery(...)`

These decide whether the protocol can move forward.

## Gas / transaction evaluation note

### Current status

This note now contains:

- one first measured buyer-side runtime slice on Sepolia
- plus the broader qualitative gas profile for the rest of the flow

It is still not the final full end-to-end benchmark yet, because seller and transporter phases are still being collected.

Why it is still partial:

- the measured dataset currently covers:
  - product creation
  - WETH wrap
  - ERC-20 approval
  - wrapper deposit
  - buyer confidential purchase
- the measured dataset does not yet cover:
  - seller bond and seller equality finalization
  - order confirmation
  - transporter bid and selection
  - seller delivery-fee deposit
  - transporter bond and transporter equality finalization
  - delivery confirmation

So the correct academic wording today is:

- function-level transaction pattern is known
- one real buyer-side Sepolia runtime slice has now been measured on the updated contract shape
- final end-to-end gas benchmarking still needs the remaining seller and transporter receipts

### First measured runtime slice: buyer path on Sepolia

The first measured runtime slice was taken on the updated Sepolia deployment with:

- public on-chain `unitPrice`
- real Sepolia WETH as the public funding asset
- the ERC-7984 confidential token and wrapper path

The measured transactions were:

| Step | Actor | Purpose | Gas used | Fee paid |
| --- | --- | --- | ---: | ---: |
| `create_product` | seller | create new confidential listing via factory | `390,798` | `0.00175050304068402 ETH` |
| `buyer_wrap_weth` | buyer | wrap public ETH into WETH | `27,938` | `0.000159753127003448 ETH` |
| `buyer_approve_wrapper` | buyer | approve wrapper to pull WETH | `46,052` | `0.000234028761852888 ETH` |
| `buyer_private_deposit` | buyer | deposit WETH into confidential funding wrapper | `336,179` | `0.001778434928799823 ETH` |
| `buyer_confidential_purchase` | buyer | confidential ERC-7984 purchase deposit | `1,004,050` | `0.00528610209091865 ETH` |

Measured total for this slice:

- `0.009208821949258829 ETH`

#### Interpretation

This first measured slice already shows a clear cost pattern:

1. The dominant buyer-side runtime cost is the confidential purchase transaction.
- `buyer_confidential_purchase` is the most expensive step by far in both gas and fee.
- This matches the architecture: it is the heaviest protocol transaction because it routes through the confidential ERC-7984 token path and then into escrow callback logic.

2. The wrapper bridge is not negligible.
- `buyer_private_deposit` is materially more expensive than simple public-token preparation.
- This reflects the extra protocol cost of moving from public WETH into private balance.

3. Public-token preparation is comparatively lightweight.
- `buyer_wrap_weth` and `buyer_approve_wrapper` are small compared with the confidential path.
- They are still useful to keep in the evaluation because they are part of the real user-facing WETH-backed system.

4. Listing creation is a meaningful setup cost.
- `create_product` is also substantial because the factory deploys and initializes a fresh confidential escrow instance.

#### Percentage split inside this measured slice

For this buyer-side runtime slice:

- `buyer_confidential_purchase` is about `57.4%` of the measured total fee
- `buyer_private_deposit` is about `19.3%`
- `create_product` is about `19.0%`
- `buyer_approve_wrapper` is about `2.5%`
- `buyer_wrap_weth` is about `1.7%`

This supports a simple conclusion:

> In the current ERC-7984 architecture, the main cost is concentrated in the confidential callback-based purchase transaction, with the wrapper-based public-to-private funding step as the second most important buyer-side overhead.

#### Measurement metadata

This measured slice used these Sepolia transactions:

- `create_product`: `0x2165d202b05588668d3718484e36b9040cd1ed321a33d40813b3e8ce7c372070`
- `buyer_wrap_weth`: `0xaec783ac82cd2dcce3a1837d1c9b2a2591ba425a2d860d7495e516802fcba4f2`
- `buyer_approve_wrapper`: `0x79de04beeb3ae2e6975025371824a4aadbb18c7e1df62d9c96a9a8529c42eb3a`
- `buyer_private_deposit`: `0xda10aef9cb808b75124980226cb63f92ad5a1c32f60cdd9c1bb1fab04eebe14b`
- `buyer_confidential_purchase`: `0x45a767e5bcd32db28b579c4f4c74c701b6972dd864a1e802c912ba2d14b42970`

### Second measured runtime slice: seller confirmation path on Sepolia

The second measured runtime slice covers the seller-side path from public-funding preparation through order confirmation.

The measured transactions were:

| Step | Actor | Purpose | Gas used | Fee paid |
| --- | --- | --- | ---: | ---: |
| `seller_approve_wrapper` | seller | approve wrapper to pull WETH | `46,040` | `0.00018930746854476 ETH` |
| `seller_private_deposit` | seller | deposit WETH into confidential funding wrapper | `338,079` | `0.001412292526008441 ETH` |
| `seller_bond_deposit` | seller | confidential seller-bond deposit | `916,992` | `0.00354516692557824 ETH` |
| `seller_finalize_equality` | seller | finalize on-chain seller equality attestation | `345,032` | `0.001424468799653384 ETH` |
| `seller_confirm_order` | seller | bind signed VRC and move to `OrderConfirmed` | `103,243` | `0.000428964630503101 ETH` |

Measured total for this slice:

- `0.007000200350287926 ETH`

#### Interpretation

This seller-side measured slice shows a different cost concentration from the buyer path:

1. The seller bond deposit is the dominant seller-side transaction.
- `seller_bond_deposit` is the heaviest seller-side step in both gas and fee.
- This is expected because it again goes through the confidential token callback path into escrow state updates.

2. Equality finalization is a real cost center, not a negligible helper step.
- `seller_finalize_equality` is materially expensive.
- This matters architecturally because the ERC-7984 flow uses explicit equality-attestation finalization as part of the settlement control path.

3. VRC binding itself is comparatively cheap.
- `seller_confirm_order` is much lighter than the confidential bond deposit and the equality finalization step.
- So the expensive part of seller confirmation is not the CID/hash anchoring itself, but the confidential bond and attestation path that must happen before it.

4. Public-to-private funding overhead remains present but secondary.
- wrapper approval and wrapper deposit still add overhead for the seller wallet, but they are not the dominant seller-side cost.

#### Percentage split inside this measured slice

For this seller-side runtime slice:

- `seller_bond_deposit` is about `50.6%` of the measured total fee
- `seller_finalize_equality` is about `20.3%`
- `seller_private_deposit` is about `20.2%`
- `seller_confirm_order` is about `6.1%`
- `seller_approve_wrapper` is about `2.7%`

This supports a simple conclusion:

> On the seller side, the main cost is concentrated in the confidential bond-deposit and equality-attestation steps, while the final VRC binding transaction is relatively cheap.

#### Measurement metadata

This measured slice used these Sepolia transactions:

- `seller_approve_wrapper`: `0xcd6c8ab48c84b8a61a0b6f746b9416db89311b32a461e6bb5fc77eeaadae97e1`
- `seller_private_deposit`: `0x371830dbb07b8a0d7ee026526a6c031ed1d742aefdf2b22f9d92a0338ccda9ab`
- `seller_bond_deposit`: `0x215925d77e112df9c52a270f823f27fcb53201dd2e6bcb5907b979289efdea62`
- `seller_finalize_equality`: `0xec73451b09b33e10fc9b01234ff718321c49fd43689b0ed2fb13910b36e617d3`
- `seller_confirm_order`: `0xdac6d314ce5aa6a900c819ab87f0fbbc7bdcc297928be81e5d217e1a9fd2543a`

### Combined reading of the measured buyer and seller slices

Across the measured buyer and seller runtime slices so far:

- buyer-side dominant cost:
  - confidential purchase deposit
- seller-side dominant cost:
  - confidential seller bond deposit
- equality finalization is also a meaningful cost center
- public WETH preparation and wrapper approval are comparatively small

This means the current ERC-7984 path already shows a fairly clear cost signature:

- public-token preparation is cheap
- wrapper deposit is noticeable
- confidential token callback transactions are the heaviest steps
- equality-attestation finalization is a non-trivial control-path cost
- CID/VRC binding is relatively lightweight compared with confidential settlement steps

### Third measured runtime slice: transporter and delivery path on Sepolia

The third measured runtime slice covers the transporter-side funding path, bid/selection phase, delivery-fee funding, transporter bond path, and final delivery confirmation.

The measured transactions were:

| Step | Actor | Purpose | Gas used | Fee paid |
| --- | --- | --- | ---: | ---: |
| `transporter_approve_wrapper` | transporter | approve wrapper to pull WETH | `46,040` | `0.00024247263731472 ETH` |
| `transporter_private_deposit` | transporter | deposit WETH into confidential funding wrapper | `338,079` | `0.001849164187045161 ETH` |
| `transporter_bid` | transporter | submit delivery bid | `127,030` | `0.00049656132079216 ETH` |
| `select_transporter` | seller | select winning transporter | `70,012` | `0.000326077453250944 ETH` |
| `seller_delivery_fee` | seller | confidential delivery-fee deposit | `802,725` | `0.004215051714217575 ETH` |
| `transporter_bond_deposit` | transporter | confidential transporter bond deposit | `917,201` | `0.005658994465526045 ETH` |
| `transporter_finalize_equality` | transporter | finalize on-chain transporter equality attestation | `345,081` | `0.00203761823908269 ETH` |
| `confirm_delivery` | transporter | confirm delivery and release payouts | `811,178` | `0.003997678797587396 ETH` |

Measured total for this slice:

- `0.018823618814816691 ETH`

#### Interpretation

This third measured slice shows that the delivery phase is the most expensive section of the whole runtime flow measured so far.

1. The transporter bond deposit is the single most expensive transaction in this slice.
- `transporter_bond_deposit` is the largest fee in the transporter/delivery path.
- This matches the seller-bond pattern: confidential bond deposits are consistently among the heaviest protocol transactions.

2. Delivery-fee funding is also expensive.
- `seller_delivery_fee` is another large confidential callback-based deposit.
- This reinforces that confidential settlement funding steps dominate the runtime cost profile more than simple control calls do.

3. Final delivery confirmation is substantial.
- `confirm_delivery` is one of the heaviest direct escrow control calls in the whole measured dataset.
- This is expected because it performs the final settlement transition and payout release logic.

4. Bid and selection calls are relatively cheap.
- `transporter_bid` and `select_transporter` are small compared with the confidential funding and settlement steps.
- This means the coordination layer is not the main gas driver; the settlement layer is.

5. Equality finalization remains a meaningful cost center.
- `transporter_finalize_equality` is again non-trivial, just as on the seller side.
- This confirms that explicit equality-attestation finalization is part of the cost signature of the current design.

#### Percentage split inside this measured slice

For this transporter and delivery runtime slice:

- `transporter_bond_deposit` is about `30.1%` of the measured total fee
- `seller_delivery_fee` is about `22.4%`
- `confirm_delivery` is about `21.2%`
- `transporter_finalize_equality` is about `10.8%`
- `transporter_private_deposit` is about `9.8%`
- `transporter_bid` is about `2.6%`
- `select_transporter` is about `1.7%`
- `transporter_approve_wrapper` is about `1.3%`

This supports a simple conclusion:

> In the delivery phase, cost is dominated by confidential funding deposits and final settlement, while bidding and transporter selection are comparatively cheap.

#### Measurement metadata

This measured slice used these Sepolia transactions:

- `transporter_approve_wrapper`: `0x270d5a36761018e88a9877b5cc9fa5d1c76536d7b5e41e8cfaef37e5f9b55683`
- `transporter_private_deposit`: `0xf97e24f7777717c4d2be963ef5cc73cc686a4a302bc55a3679ea3b839efff4d3`
- `transporter_bid`: `0x255772354ddd25ae231ddec6e64979bf15069ba847d5973c49d60974cf4d0cea`
- `select_transporter`: `0xcd21196d137e160f509a1e67e2403dba211537510a41dbbd336d03ac2cbf0bbb`
- `seller_delivery_fee`: `0xfe4f04187e1897fd55d07363a46be2cd56dba2cb2495d8ec62d227de501e6cad`
- `transporter_bond_deposit`: `0xbe84c42c3e2bcb53d4bff9f0a6aaeafdea8488fb43e6dc6cf40d0dcd6e397d87`
- `transporter_finalize_equality`: `0x04ee4f1bb680e486dcb1cf576fbf880bd864604db5a23b00d79cdda3369ee383`
- `confirm_delivery`: `0x7d0625a924749f5c01b50581bfae7483bb52a8b029a1b37c82b065c519965f47`

### Combined measured total for the full successful runtime flow

Across the three measured runtime slices:

- buyer-side slice total:
  - `0.009208821949258829 ETH`
- seller-side slice total:
  - `0.007000200350287926 ETH`
- transporter and delivery slice total:
  - `0.018823618814816691 ETH`

Combined measured total:

- `0.035032641114363446 ETH`

#### Overall reading of the measured flow

The end-to-end runtime measurements now support a clear overall interpretation:

1. The most expensive parts of the protocol are the confidential settlement transactions.
- buyer confidential purchase
- seller bond deposit
- seller delivery-fee deposit
- transporter bond deposit
- final delivery confirmation

2. Equality-attestation finalization is a real architectural cost.
- both seller and transporter equality finalization steps are non-trivial transactions
- this should be treated as part of the protocol’s runtime overhead, not merely as a negligible helper step

3. Public WETH preparation is cheap by comparison.
- wrap and approve steps are small relative to confidential settlement and attestation costs

4. Coordination calls are also cheap by comparison.
- transporter bid
- transporter selection
- VRC binding via `confirmOrderById(...)`

So the measured end-to-end cost signature of the current ERC-7984 marketplace is:

- cheap public preparation
- moderate wrapper funding overhead
- expensive confidential callback-based settlement deposits
- meaningful equality-attestation overhead
- substantial final delivery settlement

### Plain WETH baseline comparison

To close the missing “confidential txns vs ERC20/WETH” KPI, a small repeated Sepolia baseline was measured using plain WETH actions at the same `0.0004 WETH` scale as the fresh buyer purchase path.

The repeated baseline actions were:

- WETH `approve(...)`
- WETH `transfer(...)` from buyer to seller
- WETH `transfer(...)` from seller to transporter

The baseline was run twice for each action.

#### Repeated WETH baseline averages

| Baseline action | Runs | Average gas used | Average fee | Average confirmation latency |
| --- | ---: | ---: | ---: | ---: |
| WETH `approve(...)` | `2` | `36,090` | `0.000129896 ETH` | `10,562 ms` |
| WETH `transfer(...)` buyer -> seller | `2` | `34,470` | `0.000133628 ETH` | `11,437 ms` |
| WETH `transfer(...)` seller -> transporter | `2` | `43,032` | `0.000166032 ETH` | `11,707 ms` |

#### Baseline interpretation

This gives a reasonable public-token reference point for the current runtime flow.

The most useful plain-token comparison is against the average WETH transfer gas:

- average public WETH transfer baseline:
  - about `34,470` gas

Compared with that baseline:

- `buyer_confidential_purchase` (`1,004,050` gas) is about `29.1x` heavier
- `seller_bond_deposit` (`916,992` gas) is about `26.6x` heavier
- `seller_delivery_fee` (`802,725` gas) is about `23.3x` heavier
- `transporter_bond_deposit` (`917,201` gas) is about `26.6x` heavier
- wrapper `deposit(...)` (`336,179` gas in the buyer slice) is about `9.8x` heavier

This supports a clean statement:

> The confidential ERC-7984 settlement path is substantially more expensive than a plain WETH transfer baseline, with the heaviest confidential deposit transactions costing roughly one order of magnitude more than wrapper funding and over twenty times more than a direct public WETH transfer.

The approval comparison is also useful:

- plain WETH `approve(...)` baseline average:
  - `36,090` gas
- measured marketplace approvals:
  - buyer approval: `46,052` gas
  - seller approval: `46,040` gas
  - transporter approval: `46,040` gas

That tells us the approval overhead is unsurprising and close to standard ERC-20 behavior.

### Average confirmation latency from repeated runs

The repeated WETH baseline also closes the missing average confirmation-latency KPI for a small repeated on-chain test set.

Measured average confirmation latencies:

- WETH `approve(...)`:
  - `10,562 ms`
- WETH `transfer(...)` buyer -> seller:
  - `11,437 ms`
- WETH `transfer(...)` seller -> transporter:
  - `11,707 ms`

Simple overall average across these repeated baseline actions:

- about `11.2 seconds`

#### Latency interpretation

This repeated latency result should be read carefully:

- it is a Sepolia public-token confirmation baseline
- it reflects submit-to-receipt wall-clock time
- it is not yet a repeated confidential-flow latency benchmark

So the current status is:

- average confirmation latency has now been measured for a repeated public WETH baseline
- the confidential-flow side still has only single-run timestamp evidence from the measured runtime slices

That makes the current evaluation honest and still useful:

- repeated average confirmation latency:
  - available for the public-token baseline
- confidential transaction gas/fee profile:
  - available across the full measured runtime flow

#### Baseline measurement metadata

This repeated baseline used these Sepolia transactions:

- `baseline_approve_run_1`: `0x4b150d1aee76ab379c17d15fd34c5d14a496b7ff2298afb865f31b386a0a7185`
- `baseline_transfer_buyer_to_seller_run_1`: `0xcb1da861fb1150ff99410d63a60ee0865d3b56bf65c4914d4d1f6782af7016e8`
- `baseline_transfer_seller_to_transporter_run_1`: `0x54c9c4e23b7cb058025d2e4e81a2d6924b98d280a39e2a0edeb69d68c62ac77f`
- `baseline_approve_run_2`: `0x968d3320d8bebe90bae5b0b16183c5ea86b0f00e35009390a5d7d339ed33ef1f`
- `baseline_transfer_buyer_to_seller_run_2`: `0x0dc9cdc78114ca7e5a022109c8799912a05d971e9e17f5fb87c8cf06c07b72de`
- `baseline_transfer_seller_to_transporter_run_2`: `0x8f6cad1247e8f59933672efea2f2295abdf8bf2071b0e0a6a4dd8cb29bd447d0`

### Repeated confidential-run latency benchmark

To complement the single-run confidential runtime slices, a repeated confidential benchmark was run on Sepolia for the core buyer/seller confidential path at the same `0.0004 WETH` scale.

The repeated confidential actions were:

- create product
- buyer private deposit through the wrapper
- buyer confidential purchase deposit
- seller private deposit through the wrapper
- seller confidential bond deposit
- seller equality finalization

The confidential benchmark was run twice for each action.

#### Repeated confidential benchmark averages

| Confidential action | Runs | Average gas used | Average fee | Average confirmation latency |
| --- | ---: | ---: | ---: | ---: |
| create product | `2` | `356,255` | `0.001529189 ETH` | `11,443 ms` |
| buyer private deposit | `2` | `315,701` | `0.001514044 ETH` | `11,755 ms` |
| buyer confidential purchase | `2` | `984,138` | `0.004194244 ETH` | `54,427 ms` |
| seller private deposit | `2` | `315,701` | `0.001267455 ETH` | `12,048 ms` |
| seller confidential bond | `2` | `917,016` | `0.003818538 ETH` | `47,638 ms` |
| seller equality finalization | `2` | `345,020` | `0.001504202 ETH` | `12,990 ms` |

#### Confidential benchmark interpretation

This repeated benchmark sharpens the earlier single-run reading:

1. The heaviest confidential transactions are also the slowest to confirm.
- buyer confidential purchase:
  - about `54.4 s` average confirmation latency
- seller confidential bond:
  - about `47.6 s`

2. Wrapper deposits stay close to public-token confirmation latency.
- buyer and seller private deposits both stayed near `12 s`
- this is only slightly above the repeated public WETH baseline

3. Equality finalization behaves like a moderate direct escrow transaction.
- about `13.0 s` average latency
- much faster than the heavy confidential deposit callbacks

4. Product creation is not a latency outlier.
- about `11.4 s` average latency
- roughly in the same confirmation range as ordinary public-token transactions on Sepolia

#### Confidential vs public latency comparison

Comparing repeated confidential actions against the repeated public WETH baseline:

- public WETH transfer baseline:
  - about `11.4 - 11.7 s`
- confidential wrapper deposit:
  - about `11.8 - 12.0 s`
- seller equality finalization:
  - about `13.0 s`
- buyer confidential purchase:
  - about `54.4 s`
- seller confidential bond:
  - about `47.6 s`

This shows a clear pattern:

- public-token actions and wrapper deposits confirm in roughly the same time range on Sepolia
- the heavy confidential callback transactions take substantially longer on average

So the confidential path differs from the public-token baseline not only in gas cost, but also in confirmation latency.

#### Confidential vs public gas comparison

The repeated confidential benchmark also reinforces the gas comparison:

- average public WETH transfer baseline:
  - about `34,470` gas
- average buyer confidential purchase:
  - about `984,138` gas
- average seller confidential bond:
  - about `917,016` gas

So under repeated measurement:

- buyer confidential purchase is about `28.6x` a plain WETH transfer
- seller confidential bond is about `26.6x` a plain WETH transfer

These repeated results are consistent with the earlier single-run measurements and make the comparison much stronger.

#### Confidential benchmark measurement metadata

This repeated confidential benchmark used these Sepolia transactions:

- `confidential_create_product_run_1`: `0x96156fbcca4bdb782b9bd1aedadc13594bf479892f40c8b660b31fac248e3ac5`
- `confidential_buyer_private_deposit_run_1`: `0x9b2052b7836b0154f560e2a5c231133ec90e59a2cbcaeeadcf56df0f440026f6`
- `confidential_buyer_purchase_run_1`: `0xd19dad498efcb30dc8f58f1422392091e3d89bc10e255eb1790d2d45e0989828`
- `confidential_seller_private_deposit_run_1`: `0xb66c83afd1ef4b456b722e5532836811d078a1e031545b06ab6304512df3f59a`
- `confidential_seller_bond_run_1`: `0xa396eb3f8c49ea2e0b5e97eed616c83a474d4b02c4834575f25fa2008ea8976c`
- `confidential_seller_finalize_equality_run_1`: `0xe7794caddb0069642d9b7127d04f0a9db92dd4d277a9152ebd1400b109b5b82f`
- `confidential_create_product_run_2`: `0x176891ef84cd08706207f46dd5128823d823e07dcf174189f40aad3d35a01c91`
- `confidential_buyer_private_deposit_run_2`: `0x39dbdf525060ec53ee51429fa0149d68b534fb24544574fee9605f58dabecce8`
- `confidential_buyer_purchase_run_2`: `0xb40450fa4dd9d217ae967334de237a42854e5b0d153c213fa2a3033059652e57`
- `confidential_seller_private_deposit_run_2`: `0xbf2c16ff0e7edc64d4e489ae8967ba8d07b11981163098d60c499c865419968f`
- `confidential_seller_bond_run_2`: `0x49dbfc603881161fa87201b1f9b1cf4d8511df39672d8b2f1b345365b7f0c0e9`
- `confidential_seller_finalize_equality_run_2`: `0x1a3151ecbd1913b5faf1274d2d0f05bf9cf80af94c4d1b84aa583596de0817e8`

### Likely qualitative gas profile

| Transaction type | Expected relative cost | Why |
| --- | --- | --- |
| factory `createProductConfidentialV1(...)` | high | clone deployment + initialization writes |
| wrapper `deposit(...)` | low to moderate | ERC-20 transfer + confidential mint |
| token `confidentialTransferAndCall(...)` buyer/seller/transporter deposits | moderate to high | token-side confidential transfer + escrow callback + state updates |
| `finalizeEqualityAttestation(...)` | moderate | decryption proof checking + equality status write |
| `createTransporter(...)` | low | register fee + append transporter |
| `setTransporter(...)` | low | set selected transporter + phase change |
| `confirmOrderById(...)` | moderate | store `vcHash`, update order state, emit CID-bearing event |
| `confirmDelivery(...)` | high | validate final state + perform confidential payouts + clear state |
| timeout functions | moderate to high | confidential redistribution plus expiry state changes |

### Gas-heavy points to call out

The most likely gas-heavy user-visible points are:

1. product creation
- because a new escrow clone is deployed and initialized

2. confidential deposit transactions
- because they are not simple bookkeeping calls
- they route through ERC-7984 token logic and then into escrow receiver logic

3. delivery confirmation
- because this is the final settlement transaction
- it performs the largest state transition and payout logic

### What should be measured next

For the next extension of this note, we should collect the remaining real transaction receipts for the same successful order flow and record:

- transaction hash
- function called
- gas used
- effective gas price
- total fee paid
- calldata size
- whether the call was:
  - direct escrow call
  - token callback path
  - wrapper funding path

Important precondition:

- do this on the now-implemented contract shape that stores both public on-chain `unitPrice` and `unitPriceHash`

The next missing measurement set should include:

- seller bond deposit
- seller equality finalization
- order confirmation
- transporter bid
- transporter selection
- seller delivery-fee deposit
- transporter bond deposit
- transporter equality finalization
- delivery confirmation

### Suggested interpretation language

If you need a short report-style sentence now:

> The current ERC-7984 flow introduces more transaction complexity than a plain public escrow because confidential funding enters through token callback paths and equality attestation finalization steps, but the gas-critical transactions are concentrated in product creation, confidential deposit callbacks, and final delivery settlement.

## What this note is good for

This note should help with:

- making the smart-contract code path visible
- explaining which functions are actually protocol-critical
- separating funding transactions from control transactions
- preparing a later receipt-based gas benchmark

## Related docs

- [08-end-to-end-stakeholder-flow.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\08-end-to-end-stakeholder-flow.md)
- [07-typed-payment-bridge-architecture-note.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\07-typed-payment-bridge-architecture-note.md)
- [10-what-is-hidden-proved-and-verified.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\10-what-is-hidden-proved-and-verified.md)
