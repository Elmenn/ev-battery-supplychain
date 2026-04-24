# Validation And Freeze Checklist

Date: `2026-04-24`

This checklist defines the final execution order for code, runtime evidence, and artifact/document freeze.

## 0) Contract publication gate (Sepolia Etherscan)

Goal:

- verify source for all directly deployed ERC-7984 contracts

Run:

```powershell
npm run verify:erc7984:sepolia
```

Current status in this environment:

- completed (`2026-04-24`)
- verified:
  - `0xe04F94DCfC2B6f64352AcAdAD64FF4cA8505BF04` (ConfidentialOrderToken)
  - `0x8bdb7B543B9137A47348D9915D6557bC46E4F873` (ConfidentialPaymentFundingWrapper)
  - `0x58a971f033D19c53893074287c31329d43fAc076` (ProductEscrowConfidential_Initializer)
  - `0x6C26F71Ec9C6b8c830A17291C3Bf7f90292d28E7` (ProductEscrowConfidential_PrivatePrice)
  - `0x3651a8D91cc797c5dFCb2fBc50CA50b6c9cfa572` (ProductFactoryConfidential)

## 1) Code health gate

Goal:

- compile + tests pass on the current dual-profile contract set

Run:

```powershell
npm run compile:erc7984
npm run test:erc7984
```

Current status in this environment:

- `compile` blocked by Hardhat native compiler issues (`HH505`) and no network access for wasm compiler download (`HH502`)

## 2) Service readiness gate (for runtime evaluation)

Goal:

- backend/API and zkp-backend are both healthy before running evaluation scripts

Run:

```powershell
Invoke-RestMethod -Uri "http://localhost:5000/health"
Invoke-RestMethod -Uri "http://localhost:5010/health"
```

Expected:

- both return healthy/ok

## 3) Fresh proof runtime dataset (Layer B)

Goal:

- rerun proof-runtime benchmark with stable sample size

Run:

```powershell
New-Item -ItemType Directory -Force "docs\erc7984-spike\artifacts\proof-vrc" | Out-Null
$date = Get-Date -Format "yyyy-MM-dd_HHmmss"
npm run eval:erc7984:proof-vrc -- --iterations 100 --json-only | Out-File -FilePath "docs\erc7984-spike\artifacts\proof-vrc\run-$date.json" -Encoding utf8
```

Current status in this environment:

- completed
- frozen run file: `docs\erc7984-spike\artifacts\proof-vrc\run-2026-04-24_185359.json`

## 4) Fresh order-runtime dataset (smart-contract runtime)

Goal:

- keep all selected CID order JSON artifacts in `docs/erc7984-spike/artifacts/order-runtime/`

Run per CID:

```powershell
npm run eval:erc7984:order -- --vc-cid <CID>
```

Then save each JSON output in:

- `docs/erc7984-spike/artifacts/order-runtime/<CID>.json`

## 5) Regenerate CSV + figure artifacts

Proof artifacts:

```powershell
$date = Get-Date -Format "yyyy-MM-dd_HHmmss"
python scripts\erc7984\export-proof-vrc-artifacts.py `
  --input-json "docs\erc7984-spike\artifacts\proof-vrc\run-$date.json" `
  --output-dir "docs\erc7984-spike\artifacts\proof-vrc"
```

Smart-contract runtime artifacts:

```powershell
python scripts\erc7984\export-smart-contract-runtime-artifacts.py `
  --input-dir "docs\erc7984-spike\artifacts\order-runtime" `
  --output-dir "docs\erc7984-spike\artifacts\order-runtime" `
  --include-signature-baseline
```

Status in this environment:

- export scripts executed successfully against frozen runtime inputs
- proof runtime export reflects latest frozen run (`2026-04-24_185359`)

## 6) Paper figure selection freeze

Recommended core figures:

1. `plot_layer_a_generation_median_ms.png`
2. `plot_layer_a_verification_median_ms.png`
3. `plot_layer_a_proof_size_bytes.png`
4. `plot_runtime_combined_proof_verify_mean_ms.png`
5. `plot_sc_core_step_gas_mean.png`
6. `plot_sc_vs_erc20_multiplier_with_profile_range.png`

Optional appendix:

- `plot_runtime_statement_verify_dispersion_ms.png`
- `plot_sc_profile_fee_totals_mean_eth.png`
- `plot_sc_profile_elapsed_mean_s.png`
- `plot_vc_signature_baseline_median_range_ms.png`

## 7) Documentation freeze pass

Before freeze:

- ensure docs 11/13/22/23 all reference the same active contract set
- ensure old contracts are marked legacy/archival only
- ensure all numeric values in docs are sourced from current artifact CSV/JSON

Freeze output:

- lock selected plots
- lock artifact CSV/JSON
- lock final evaluation notes
