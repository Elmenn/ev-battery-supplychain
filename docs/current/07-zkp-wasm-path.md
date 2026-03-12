# ZKP WASM Path (Current)

This document explains what WebAssembly (WASM) is in the context of this repo, how the current browser proof path works, and how proof generation and verification now run in-browser for the active end-to-end flow.

## 1) What WASM Means Here

WebAssembly is a low-level binary format that allows code written in languages like Rust to run inside the browser at near-native speed.

In this repo, WASM is used to move the active Bulletproof-based proving and verification logic from the Rust HTTP backend into the browser itself.

That means:
- the frontend no longer needs to call `localhost:5010` for the active private-order proof flow when `REACT_APP_ZKP_MODE=wasm`
- the same Rust proving logic is compiled into browser-loadable `.wasm` artifacts
- the browser executes those proofs through a dedicated worker so the UI thread is not blocked directly by the WASM module

## 2) Why This Exists

Originally, the active ZKP flow depended on the Rust backend service on port `5010`.

The goal of the WASM path is to make the active user flow work without that backend for:
- buyer proof generation
- auditor proof verification

This reduces operational dependencies and makes the cryptographic path easier to ship in browser-only environments.

## 3) Current Modes

The frontend supports three ZKP modes in `frontend/src/utils/zkp/zkpClient.js`:

- `backend`
  - all supported proof operations use the Rust HTTP backend
- `wasm`
  - all supported proof operations use the browser WASM worker
- `shadow`
  - backend is authoritative, but the same operation is also run in WASM and compared for mismatch logging

The active mode is controlled by:

```env
REACT_APP_ZKP_MODE=backend|wasm|shadow
```

Current default:
- if unset, it falls back to `backend`

## 4) Current Active Proof Operations in WASM

The browser WASM path now supports the active proof system used in the shipped private-order flow:

- scalar commitment with blinding
- equality proof generation
- equality proof verification
- quantity-total proof generation
- quantity-total proof verification
- total-payment equality proof generation
- total-payment equality proof verification

These are implemented in:
- `zkp-backend/zkp-wasm/src/lib.rs`

The generated artifacts are loaded from:
- `frontend/public/wasm/zkp-wasm/zkp_wasm.js`
- `frontend/public/wasm/zkp-wasm/zkp_wasm_bg.wasm`

## 5) Build Path

The WASM package is built from the frontend directory using:

```bash
npm run zkp:wasm:dev-build
```

or:

```bash
npm run zkp:wasm:build
```

These scripts run `wasm-pack` against:

- `../zkp-backend/zkp-wasm`

and output the generated browser package into:

- `frontend/public/wasm/zkp-wasm/`

## 6) Runtime Architecture

The current runtime path is:

1. frontend code requests a proof operation
2. the dispatch layer checks `REACT_APP_ZKP_MODE`
3. in `wasm` mode, the request goes to the WASM provider
4. the WASM provider posts a message to `frontend/public/wasmZkpWorker.js`
5. the worker loads the generated `zkp_wasm.js` entrypoint and `.wasm` binary
6. the worker calls the exported Rust/WASM function
7. the result is posted back to the frontend caller

Main files:
- dispatch mode selection:
  - `frontend/src/utils/zkp/zkpClient.js`
  - `frontend/src/utils/equalityProofClient.js`
- WASM request bridge:
  - `frontend/src/utils/zkp/providers/wasmProvider.js`
- WASM worker:
  - `frontend/public/wasmZkpWorker.js`
- Rust/WASM exports:
  - `zkp-backend/zkp-wasm/src/lib.rs`

## 7) How Buyer-Side Proof Generation Works in WASM

In the active order flow:

1. seller lists with public `unitPriceWei`
2. buyer enters private `quantity`
3. frontend computes:

```text
totalWei = unitPriceWei * quantity
```

4. frontend generates fresh blindings:
- `r_qty`
- `r_total`
- `r_pay`

5. frontend generates commitments:
- `C_qty`
- `C_total`
- `C_pay`

6. frontend generates two proofs:
- quantity-total proof:
  - proves `totalWei = unitPriceWei * quantity`
- total-payment equality proof:
  - proves `C_total` and `C_pay` hide the same value

In `wasm` mode, steps 5 and 6 run in-browser through the worker/WASM path.

## 8) How Auditor Verification Works in WASM

In the current `VRC 5.0` model:
- the final VRC embeds the commitments
- the final VRC embeds the proof payloads

During audit:

1. auditor loads the VRC
2. application verifies:
   - issuer signature
   - on-chain CID hash anchor
   - credential status
3. application reads:
   - `credentialSubject.commitments`
   - `credentialSubject.zkProofs`
4. the proof verification calls are dispatched
5. in `wasm` mode, verification is executed inside the browser WASM worker

So for the active proof path, auditor verification no longer requires the ZKP backend when the frontend is running with `REACT_APP_ZKP_MODE=wasm`.

## 9) How the Commitment Math Works

The active private commitments are Pedersen commitments:

```text
C = vG + rH
```

where:
- `v` is the hidden value
- `r` is the blinding scalar
- `G` and `H` are fixed public generators

For the current order flow:
- `C_qty = Commit(quantity, r_qty)`
- `C_total = Commit(totalWei, r_total)`
- `C_pay = Commit(totalWei, r_pay)`

Important:
- `C_total` and `C_pay` intentionally commit to the same numeric value
- they use different blindings
- later equality proof verifies they hide the same value without revealing it

## 10) How the Proofs Work at a High Level

### Quantity-Total Proof

Purpose:
- prove that the hidden total matches the public unit price and hidden quantity

Statement:

```text
totalWei = unitPriceWei * quantity
```

Public inputs:
- `C_qty`
- `C_total`
- `unitPriceWei`
- `contextHash`

Private witness:
- `quantity`
- `r_qty`
- `r_total`

### Total-Payment Equality Proof

Purpose:
- prove that the hidden paid amount equals the hidden total

Statement:

```text
C_total and C_pay open to the same value
```

Public inputs:
- `C_total`
- `C_pay`
- `contextHash`

Private witness:
- `r_total`
- `r_pay`

## 11) Why the Worker Is Used

The browser does not call the WASM exports directly from React components.

Instead, the app uses a worker because:
- proof generation can take noticeable time
- running this directly on the main browser thread would hurt UI responsiveness
- the worker isolates the cryptographic work from React rendering

That is why `frontend/public/wasmZkpWorker.js` exists.

## 12) Current E2E Status

Current proven status:
- the active end-to-end flow works with `REACT_APP_ZKP_MODE=wasm`
- buyer proof generation worked with no local ZKP backend running on port `5010`
- auditor proof verification also worked with no local ZKP backend running

This confirms that the active proof path is currently functional in-browser through WASM.

## 13) Shadow Mode

`shadow` mode exists to compare backend and WASM behavior during migration.

Important detail:
- proof generation is randomized
- therefore raw proof bytes are not expected to match

So in shadow mode:
- generation compares proof shape / successful result
- verification compares the final `verified` boolean

This is intentional and avoids false mismatch warnings.

## 14) Current Remaining Gaps

The active user flow no longer needs the ZKP backend when `REACT_APP_ZKP_MODE=wasm`.

Remaining work is now mostly around:
- documentation
- performance benchmarking
- identifying whether any old backend-only proof endpoints are still needed for legacy flows or can be removed

## 15) Relevant Files

Frontend:
- `frontend/src/utils/zkp/zkpClient.js`
- `frontend/src/utils/equalityProofClient.js`
- `frontend/src/utils/zkp/providers/wasmProvider.js`
- `frontend/public/wasmZkpWorker.js`
- `frontend/public/wasm/zkp-wasm/`

Rust/WASM:
- `zkp-backend/zkp-wasm/src/lib.rs`
- `zkp-backend/zkp-wasm/Cargo.toml`

Native backend reference implementation:
- `zkp-backend/src/main.rs`
- `zkp-backend/src/zk/equality_proof.rs`
- `zkp-backend/src/zk/quantity_total_proof.rs`
