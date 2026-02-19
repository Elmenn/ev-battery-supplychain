# Railgun Integration (Current) + How Privacy Works

This document is implementation-focused for this project, with short official context.

## A) How This Repo Integrates Railgun

## SDK/Engine Initialization
- Implemented in `frontend/src/lib/railgun-client-browser.js`.
- Starts local Railgun engine with POI node support.
- Loads Sepolia providers and skips Alchemy scan RPC if detected (to avoid free-tier `eth_getLogs` limits).
- Injects local engine into SDK singleton for transfer/balance functions.

## Wallet Connection
- Implemented in `frontend/src/lib/railgun-clean/connection.js`.
- User signs one fixed message (`RAILGUN_WALLET_SIGNATURE_MESSAGE`).
- Signature-derived key encrypts mnemonic and stores it in localStorage (`railgun.wallet`).
- Reconnect restores same wallet from encrypted mnemonic.

## Private Transfer Path
- Implemented in `frontend/src/lib/railgun-clean/operations/transfer.js`.
- 3-step SDK flow:
  1. `gasEstimateForUnprovenTransfer`
  2. `generateTransferProof`
  3. `populateProvedTransfer`
- Transaction is sent with the connected EOA signer (`sendWithPublicWallet = true`).
- App extracts:
  - `memoHash` (local memo digest)
  - `railgunTxRef` (first nullifier used as reference)

## On-Chain Linking in This App
- After private transfer, app records payment with:
  - `recordPrivatePayment(productId, memoHash, railgunTxRef)`
- Later seller confirms order with VC CID:
  - `confirmOrder(cid)` stores `keccak256(cid)` as `vcHash`.

## B) How Railgun Privacy Works (Official High Level)
- Railgun uses shielded notes/commitments and Merkle trees for private state.
- Users prove spend validity with zero-knowledge proofs without revealing amounts.
- Nullifiers prevent double-spending while keeping note contents private.
- Flow conceptually includes shield, private transact, and optional unshield.
- Proof of Innocence (POI) is used for compliance-oriented spend validity checks on supported flows.

## Official References
- Docs home: https://docs.railgun.org/
- SDK overview: https://docs.railgun.org/developer-guide/wallet-sdk/overview
- Shield flow: https://docs.railgun.org/developer-guide/wallet-sdk/transactions/shield
- Transact flow: https://docs.railgun.org/developer-guide/wallet-sdk/transactions/transact
- Unshield flow: https://docs.railgun.org/developer-guide/wallet-sdk/transactions/unshield
- Proof of Innocence: https://docs.railgun.org/wiki/learn/proof-of-innocence-poi
