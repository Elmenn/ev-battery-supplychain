# ERC-7984 Spike

This worktree isolates the ERC-7984 / fhEVM marketplace redesign from the legacy Railgun-first model.

## Current final state

As of April 9, 2026, the spike has proven:

- a WETH-backed Sepolia ERC-7984 marketplace flow
- a full browser-driven stakeholder flow for buyer, seller, and transporter
- VRC build, signing, archive, and verification support
- smart-contract evaluation with real Sepolia receipts
- Fiat-Shamir vs Bulletproof comparison for the two implemented marketplace statements

The current live model is:

- public funding asset: real Sepolia WETH
- private settlement asset: the local ERC-7984 confidential token contract
- confidential collateral model:
  - buyer purchase amount
  - seller bond
  - seller delivery fee
  - transporter bond

The current ERC-7984 Sepolia contracts are also verified on Etherscan for the directly deployed contracts:

- confidential token
- funding wrapper
- escrow implementation
- factory

Product escrows are minimal-proxy clones of the verified implementation.

## Authoritative docs

### Architecture and protocol shape

- [02-product-escrow-confidential-redesign.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\02-product-escrow-confidential-redesign.md)
  - redesign of the escrow/factory path
- [03-confidential-equality-attestation-and-audit-plan.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\03-confidential-equality-attestation-and-audit-plan.md)
  - equality-attestation design and audit model
- [04-private-quantity-payment-bridge-options.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\04-private-quantity-payment-bridge-options.md)
  - privacy-model options and bridge rationale
- [05-payment-bridge-artifact-spec.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\05-payment-bridge-artifact-spec.md)
  - canonical bridge artifact and field semantics
- [06-confidential-funding-wrapper-flow.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\06-confidential-funding-wrapper-flow.md)
  - WETH to confidential-balance funding flow
- [07-typed-payment-bridge-architecture-note.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\07-typed-payment-bridge-architecture-note.md)
  - typed architecture and trust-boundary view
- [10-what-is-hidden-proved-and-verified.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\10-what-is-hidden-proved-and-verified.md)
  - compact privacy-model explanation
- [12-unit-price-on-chain-decision-note.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\12-unit-price-on-chain-decision-note.md)
  - final decision and implementation of public on-chain `unitPrice`

### Flow and smart-contract behavior

- [08-end-to-end-stakeholder-flow.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\08-end-to-end-stakeholder-flow.md)
  - end-to-end stakeholder flow
- [11-smart-contract-function-map-and-transaction-note.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\11-smart-contract-function-map-and-transaction-note.md)
  - detailed function map, transaction map, and measurement appendix
- [13-smart-contract-evaluation-summary.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\13-smart-contract-evaluation-summary.md)
  - compact final smart-contract evaluation summary

### Proof and end-to-end evaluation

- [16-marketplace-proof-comparison-summary.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\16-marketplace-proof-comparison-summary.md)
  - frozen Fiat-Shamir vs Bulletproof comparison
- [17-vrc-signature-and-end-to-end-evaluation.md](c:\Users\yamen\ev-battery-supplychain-erc7984\docs\erc7984-spike\17-vrc-signature-and-end-to-end-evaluation.md)
  - signature timing and end-to-end KPI closure

## Cleanup note

The earlier intermediate notes that were only useful during planning or supervisor-briefing were removed. The remaining set is intended to be the minimal documentation set that still explains:

- what the system is
- how the current flow works
- what is hidden and proved
- what was actually measured

## Code areas

- `contracts/erc7984`
- `scripts/erc7984`
- `test/erc7984`
- `frontend/src/components/erc7984`
- `frontend/src/utils/erc7984`
- `docs/erc7984-spike`
