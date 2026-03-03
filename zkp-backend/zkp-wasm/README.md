# zkp-wasm

Browser-oriented WASM bindings for Bulletproofs value commitment generation and verification.

## Exports

- `generate_value_commitment_with_blinding(value, blinding_hex)`
- `generate_value_commitment_with_binding(value, blinding_hex, binding_tag_hex?)`
- `verify_value_commitment(commitment_hex, proof_hex, binding_tag_hex?)`

All hex inputs accept with or without `0x`.
`value` is a decimal string parsed as `u64`.

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
