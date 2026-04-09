# ERC-7984 Smart Contract Evaluation Summary

This note is the compact smart-contract evaluation summary for the current ERC-7984 marketplace path.

It uses only measured Sepolia results.

It covers only on-chain / transaction-level evaluation.
It does not cover off-chain proof-generation, proof-size, VRC verification, or signature-verification KPIs.

## Scope

Contracts involved in the measured runtime flow:

- [ProductFactoryConfidential.sol](c:\Users\yamen\ev-battery-supplychain-erc7984\contracts\erc7984\ProductFactoryConfidential.sol)
- [ConfidentialPaymentFundingWrapper.sol](c:\Users\yamen\ev-battery-supplychain-erc7984\contracts\erc7984\ConfidentialPaymentFundingWrapper.sol)
- ERC-7984 confidential token via `confidentialTransferAndCall(...)`
- [ProductEscrowConfidential_Initializer.sol](c:\Users\yamen\ev-battery-supplychain-erc7984\contracts\erc7984\ProductEscrowConfidential_Initializer.sol)

Measured environment:

- Sepolia
- real Sepolia WETH as the public funding asset
- updated contract shape with public on-chain `unitPrice` and `unitPriceHash`

## Measured full runtime cost

The full successful runtime flow was measured end to end.

Measured slice totals:

| Slice | Measured total fee |
| --- | ---: |
| Buyer-side slice | `0.009208821949258829 ETH` |
| Seller-side slice | `0.007000200350287926 ETH` |
| Transporter / delivery slice | `0.018823618814816691 ETH` |
| Full measured runtime total | `0.035032641114363446 ETH` |

## Highest-cost transactions in the measured runtime flow

| Transaction | Gas used | Fee paid |
| --- | ---: | ---: |
| buyer confidential purchase | `1,004,050` | `0.00528610209091865 ETH` |
| transporter bond deposit | `917,201` | `0.005658994465526045 ETH` |
| seller bond deposit | `916,992` | `0.00354516692557824 ETH` |
| seller delivery-fee deposit | `802,725` | `0.004215051714217575 ETH` |
| confirm delivery | `811,178` | `0.003997678797587396 ETH` |

Measured pattern:

- the dominant costs are the confidential settlement transactions
- equality finalization is also a meaningful cost center
- direct control calls like bid, select transporter, and confirm order are comparatively cheap

## Plain WETH baseline

A repeated Sepolia WETH baseline was measured at the same `0.0004 WETH` scale.

Repeated baseline averages:

| Baseline action | Runs | Average gas used | Average fee | Average confirmation latency |
| --- | ---: | ---: | ---: | ---: |
| WETH `approve(...)` | `2` | `36,090` | `0.000129896 ETH` | `10,562 ms` |
| WETH `transfer(...)` buyer -> seller | `2` | `34,470` | `0.000133628 ETH` | `11,437 ms` |
| WETH `transfer(...)` seller -> transporter | `2` | `43,032` | `0.000166032 ETH` | `11,707 ms` |

Simple public baseline reading:

- plain WETH transfer confirms in about `11.2 s`
- plain WETH transfer costs about `34k - 43k` gas

## Repeated confidential benchmark

A repeated confidential benchmark was also measured at the same `0.0004 WETH` scale.

Repeated confidential averages:

| Confidential action | Runs | Average gas used | Average fee | Average confirmation latency |
| --- | ---: | ---: | ---: | ---: |
| create product | `2` | `356,255` | `0.001529189 ETH` | `11,443 ms` |
| buyer private deposit | `2` | `315,701` | `0.001514044 ETH` | `11,755 ms` |
| buyer confidential purchase | `2` | `984,138` | `0.004194244 ETH` | `54,427 ms` |
| seller private deposit | `2` | `315,701` | `0.001267455 ETH` | `12,048 ms` |
| seller confidential bond | `2` | `917,016` | `0.003818538 ETH` | `47,638 ms` |
| seller equality finalization | `2` | `345,020` | `0.001504202 ETH` | `12,990 ms` |

Core repeated confidential-path fee total across these six average steps:

- `0.013827672 ETH`

## Confidential vs plain-token comparison

Using the repeated measurements:

| Comparison | Relative cost |
| --- | ---: |
| buyer confidential purchase vs plain WETH transfer | `28.6x` gas |
| seller confidential bond vs plain WETH transfer | `26.6x` gas |
| buyer/seller private deposit vs plain WETH transfer | `9.2x` gas |
| seller equality finalization vs plain WETH transfer | `10.0x` gas |

Latency comparison:

| Comparison | Relative latency |
| --- | ---: |
| buyer confidential purchase vs plain WETH transfer | about `4.8x` slower |
| seller confidential bond vs plain WETH transfer | about `4.2x` slower |
| buyer/seller private deposit vs plain WETH transfer | close to public baseline |
| seller equality finalization vs plain WETH transfer | slightly above public baseline |

## Main conclusions

1. The expensive part of the ERC-7984 path is the confidential settlement layer.
- buyer purchase deposit
- seller bond deposit
- seller delivery-fee deposit
- transporter bond deposit
- delivery confirmation

2. Equality attestation is a real on-chain overhead.
- seller equality finalization and transporter equality finalization are not negligible helper steps

3. Public-token preparation is cheap by comparison.
- WETH `approve(...)`
- WETH `transfer(...)`
- bid / selection control calls

4. Wrapper funding is noticeably more expensive than plain WETH transfer, but still much cheaper than the heaviest confidential deposit callbacks.

## What is complete

For the smart-contract evaluation, these are now measured with real results:

- confidential transaction gas cost
- confidential transaction fee cost
- plain WETH / ERC-20 baseline comparison
- repeated public baseline confirmation latency
- repeated confidential buyer/seller-path confirmation latency
- full single-run end-to-end runtime cost

## Remaining optional extension

No required smart-contract KPI is still missing.

One optional extension remains if a future pass wants a more symmetrical latency dataset:

1. Repeated latency benchmarking for the full transporter / delivery slice
- transporter bid
- select transporter
- seller delivery-fee deposit
- transporter bond deposit
- transporter equality finalization
- confirm delivery

Those steps already have real gas and fee measurements from the measured runtime flow. The missing part is only repeated average-latency sampling for that slice.

## Related notes

- [11-smart-contract-function-map-and-transaction-note.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\11-smart-contract-function-map-and-transaction-note.md)
- [12-unit-price-on-chain-decision-note.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\12-unit-price-on-chain-decision-note.md)
