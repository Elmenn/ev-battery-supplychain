# zkp-wasm

Browser-oriented WASM bindings for the active Bulletproof-based proving and verification flow.

## Exports

Value-commitment compatibility exports:

- `generate_value_commitment_with_blinding(value, blinding_hex)`
- `generate_value_commitment_with_binding(value, blinding_hex, binding_tag_hex?)`
- `verify_value_commitment(commitment_hex, proof_hex, binding_tag_hex?)`

Active private-order flow exports:

- `generate_scalar_commitment_with_blinding(value, blinding_hex)`
- `generate_equality_proof(c_left_hex, c_right_hex, r_left_hex, r_right_hex, context_hash_hex)`
- `verify_equality_proof(c_left_hex, c_right_hex, proof_r_hex, proof_s_hex, context_hash_hex)`
- `generate_quantity_total_proof(c_quantity_hex, c_total_hex, unit_price_wei, r_quantity_hex, r_total_hex, context_hash_hex)`
- `verify_quantity_total_proof(c_quantity_hex, c_total_hex, unit_price_wei, proof_r_hex, proof_s_hex, context_hash_hex)`
- `generate_total_payment_equality_proof(c_total_hex, c_pay_hex, r_total_hex, r_pay_hex, context_hash_hex)`
- `verify_total_payment_equality_proof(c_total_hex, c_pay_hex, proof_r_hex, proof_s_hex, context_hash_hex)`

Input conventions:

- hex inputs accept with or without `0x`
- scalar commitment / proof amount values are decimal strings parsed into canonical non-negative scalar values
- legacy value-commitment compatibility functions still parse `value` as `u64`

## Build

From `frontend/`:

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
npm run zkp:wasm:dev-build
# or
npm run zkp:wasm:build
```

Artifacts are written to:

`frontend/public/wasm/zkp-wasm/`

## Runtime Use

The generated artifacts are loaded by:

- `frontend/public/wasmZkpWorker.js`

The frontend dispatches proof operations through:

- `frontend/src/utils/zkp/providers/wasmProvider.js`
- `frontend/src/utils/equalityProofClient.js`
- `frontend/src/utils/zkp/zkpClient.js`

For the full current explanation, see:

- `docs/current/07-zkp-wasm-path.md`
