# EV Battery Supply Chain dApp

Privacy-preserving EV battery marketplace prototype with:
- Solidity escrow contracts (Truffle)
- React frontend
- Express backend API
- Rust ZKP backend
- Railgun private payment integration

## Current Implementation (Important)
- Active user flow is **private order-based purchase** (Sepolia-focused).
- Buyer payment is recorded via `recordPrivateOrderPayment(orderId, memoHash, railgunTxRef, quantityCommitment, totalCommitment, paymentCommitment, contextHash)`.
- Seller confirms order with VC CID via `confirmOrderById(orderId, cid)` (on-chain stores `keccak256(cid)`).
- Transporter confirms delivery with `confirmDelivery(hash)` where `hash == vcHash`.
- Railgun wallet connection is required for the active private payment flow.
- Backend recovery, indexing, VC archival, and credential-status checks are part of the active operational model.

Reference docs:
- `docs/current/01-end-to-end-flow.md`
- `docs/current/02-railgun-integration.md`
- `docs/current/03-auditor-verification.md` (includes dedicated DID signing/verification section `1.1`)
- `docs/current/04-did-signing-and-verification-standards.md` (standards mapping and compliance statement)
- `docs/current/06-vrc-model.md` (current VRC shape, W3C VC alignment, and placeholder template)
- `docs/current/07-zkp-wasm-path.md` (how the browser WASM proving/verifying path works)
- `docs/current/08-zkp-wasm-evaluation.md` (benchmark methodology and current WASM evaluation plan)

## Prerequisites
- Node.js 18+
- Rust (stable)
- Git
- MetaMask
- Sepolia ETH (for testnet gas)

## 1) Clone
```bash
git clone https://github.com/Elmenn/ev-battery-supplychain
cd ev-battery-supplychain
```

## 2) Install Dependencies
```bash
npm install
cd frontend && npm install
cd ../backend/api && npm install
cd ../../zkp-backend && cargo build
cd ..
```

Optional Railgun helper API dependencies:
```bash
cd backend/railgun/api && npm install
cd ../../..
```

## 3) Configure Env (Sepolia Recommended)
1. Root deploy env:
```bash
copy .env.truffle.example .env.truffle
```
Then edit `.env.truffle` with your private key and RPC URL.

2. Frontend env:
```bash
cd frontend
copy .env.sepolia.example .env
cd ..
```
Then edit `frontend/.env`:
- `REACT_APP_PINATA_JWT`
- `REACT_APP_FACTORY_ADDRESS` (after deployment)
- `REACT_APP_RPC_URL` (optional custom provider)
- `REACT_APP_ZKP_BACKEND_URL` (default `http://localhost:5010`)
- `REACT_APP_VC_BACKEND_URL` (default `http://localhost:5000`)
- `REACT_APP_QR_BASE_URL` (optional, for phone-scannable QR links)
- optional backend-read envs also picked up from `frontend/.env`:
  - `INDEXER_BATCH_SIZE`
  - `INDEXER_START_BLOCK`
  - `VC_STATUS_ADMIN_TOKEN`

## 4) Deploy Contracts
```bash
npx truffle compile
npx truffle migrate --network sepolia
```
Copy deployed `ProductFactory` address into `frontend/.env` as `REACT_APP_FACTORY_ADDRESS=...`.

## 5) Start Services
Terminal 1 (ZKP backend):
```bash
cd zkp-backend
cargo run
```

Terminal 2 (Express API):
```bash
cd backend/api
npm start
```

Terminal 3 (Frontend):
```bash
cd frontend
npm start
```

Optional Terminal 4 (Railgun helper API):
```bash
cd backend/railgun/api
npm start
```

## 5.1) Docker Demo Stack
If you want the easiest no-local-dependencies run path for a supervisor/demo:

```bash
cd frontend
copy .env.sepolia.example .env
cd ..
docker compose up --build
```

Or from the repo root with the wrapper script:

```powershell
.\start-demo.ps1
```

Or on macOS/Linux:

```bash
./start-demo.sh
```

This starts:
- frontend on `http://localhost:3000`
- backend API on `http://localhost:5000`
- ZKP backend on `http://localhost:5010`

Stop it with:

```powershell
.\stop-demo.ps1
```

Or on macOS/Linux:

```bash
./stop-demo.sh
```

Details:
- `RUN_FRONTEND_DOCKER.md`
- `frontend/DOCKER_SETUP.md`

## 6) Docker (Frontend Only)
For supervisor/demo quick start use:
- `RUN_FRONTEND_DOCKER.md`

Or run directly:
```bash
cd frontend
copy .env.sepolia.example .env
cd ..
docker compose up --build
```

## 7) Testing
Contracts:
```bash
npx truffle test
```

Frontend:
```bash
cd frontend
npm test
```

Rust:
```bash
cd zkp-backend
cargo test
```

## 8) Auditor Verification (Current)
`VerifyVCInline` "Run All" currently checks:
1. VC signatures (`POST /verify-vc`)
2. Credential status (`GET /vc-status/:cid`)
3. Current VC hash anchor (`keccak256(cid)` vs `getVcHash()`)
4. Provenance continuity
5. Governance consistency
6. Chain-wide on-chain anchors
7. Quantity-total proof
8. Total-payment equality proof

Signature check uses EIP-712 recovery plus `did:ethr` registry-based DID resolution.

VC retrieval is archive-first from backend storage and falls back to multiple IPFS gateways.

Details: `docs/current/03-auditor-verification.md`
Standards subsection in auditor doc: `docs/current/03-auditor-verification.md` (`Standards Basis`)
Standards basis: `docs/current/04-did-signing-and-verification-standards.md`

## 9) QR Delivery Hash Behavior
- UI shows plain delivery hash (`vcHash`) and QR code.
- QR contains deep-link payload (hash + product + chain + cid).
- Transporter must submit the exact hash in `confirmDelivery(hash)`.

Details: `docs/current/01-end-to-end-flow.md`

## 10) Notes
- Keep `.env` files and local DB files out of git.
- Rotate any token immediately if exposed.
