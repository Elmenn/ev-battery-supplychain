# EV Battery Supply Chain dApp

This repository contains a full-stack prototype of a privacy-preserving marketplace for EV battery components. The stack includes:

- **Smart contracts** (Solidity + Truffle)
- **React frontend** (with optional Railgun integration for private payments)
- **Node.js backend** (Express API)
- **Rust backend** (ZKP service using Bulletproofs)

The instructions below assume you want to run the entire stack locally from a fresh clone.

---

## 1. Prerequisites

Install the following before you begin:

- [Node.js](https://nodejs.org/) v18 or later (npm included)
- [Rust](https://www.rust-lang.org/tools/install) v1.70 or later (for the ZKP backend)
- [Ganache](https://trufflesuite.com/ganache/) CLI or GUI *or* another local Ethereum JSON-RPC endpoint (optional but strongly recommended)
- [MetaMask](https://metamask.io/) browser extension (optional for UI testing)
- [Git](https://git-scm.com/)

(Optional) If you plan to use the Rust backend frequently, install the `wasm32-unknown-unknown` toolchain:

```bash
rustup target add wasm32-unknown-unknown
```

---

## 2. Clone the Repository

```bash
git clone https://github.com/<your-org>/ev-battery-supplychain.git
cd ev-battery-supplychain
```

> Replace `<your-org>` with the correct GitHub org or username.

---

## 3. Install Dependencies

### Root dependencies

These install the Truffle toolchain and helper packages used across the repo.

```bash
npm install
```

### Frontend dependencies

```bash
cd frontend
npm install
cd ..
```

### Backend (Express API) dependencies

```bash
cd backend/api
npm install
cd ../..
```

### Railgun helper API (optional - not required for public flow)

> **Note:** The Railgun backend is completely optional. The public purchase flow with ZKP commitments works without it. Only install if you need private payment features.

The repo includes a helper script in `backend/railgun`. Install dependencies only if you plan to use private payments:

```bash
cd backend/railgun/api
npm install
cd ../../..
```

### ZKP backend (Rust)

The Rust backend uses Cargo. Build it once to pull dependencies:

```bash
cd zkp-backend
cargo build
cd ..
```

---

## 4. Configure Environment

Choose your network: **Ganache (local)** or **Sepolia (testnet)**.

### Option A: Ganache (Local Development)

1. **Start Ganache CLI:**
   ```bash
   ganache --port 7545 --wallet.totalAccounts 20
   ```

2. **Configure frontend environment:**
   ```bash
   cd frontend
   copy .env.ganache .env     # Windows
   # cp .env.ganache .env      # macOS/Linux
   cd ..
   ```

3. **Deploy contracts to Ganache:**
   ```bash
   npx truffle compile
   npx truffle migrate --network development
   ```

4. **Update frontend `.env` with deployed contract addresses** (from migration output).

### Option B: Sepolia (Testnet)

1. **Create `.env.truffle` in repo root:**
   ```bash
   MNEMONIC="your twelve word mnemonic phrase here"
   ALCHEMY_API_KEY="your-alchemy-api-key"
   ```

2. **Get Sepolia ETH:**
   - Use a [Sepolia faucet](https://sepoliafaucet.com/) to fund your deployment account
   - Ensure the account has enough ETH for gas fees

3. **Configure frontend environment:**
   ```bash
   cd frontend
   copy .env.sepolia .env     # Windows
   # cp .env.sepolia .env      # macOS/Linux
   cd ..
   ```

4. **Deploy contracts to Sepolia:**
   ```bash
   npx truffle compile
   npx truffle migrate --network sepolia
   ```

5. **Update frontend `.env` with:**
   - Deployed contract addresses (from migration output)
   - Your RPC endpoint URL
   - Chain ID: `11155111`

6. **Configure MetaMask:**
   - Add Sepolia network if not already added
   - Import the account you used for deployment (or connect a different account with Sepolia ETH)

---

## 5. Start Supporting Services

### 5.1 Blockchain Network

**For Ganache:** Already running from Step 4A.

**For Sepolia:** No local blockchain needed - you're using the public testnet. Just ensure MetaMask is connected to Sepolia.

### 5.2 Deploy Smart Contracts

**Already done in Step 4** (Ganache or Sepolia). If you need to redeploy:

```bash
# For Ganache
npx truffle migrate --network development

# For Sepolia
npx truffle migrate --network sepolia
```

### 5.3 Start the ZKP Backend

In a new terminal:

```bash
cd zkp-backend
cargo run
```

This exposes the ZKP API on `http://127.0.0.1:5010` (adjust in `.env` files if you change the port).

### 5.4 Start the Express API (optional but recommended)

```bash
cd backend/api
npm start
```

This runs the REST API on `http://127.0.0.1:5000` by default.

### 5.5 Optional: Railgun helper API (skip for public flow)

> **Skip this step** if you only want to test the public purchase flow with ZKP commitments. The Railgun API is only needed for private payment features.

If you need the Railgun helper API for private payments, you can run:

```bash
cd backend/railgun/api
npm start
```

**Note:** The frontend will gracefully handle the Railgun API being offline - private payment buttons will be hidden, but public purchases work normally.

---

## 6. Run the Frontend

Back in the `frontend` directory:

```bash
cd frontend
npm start
```

The app will open at `http://localhost:3000`. Confirm the browser can reach:

- **Ganache:** http://127.0.0.1:7545 (if using local development)
- **Sepolia RPC:** Your configured Alchemy/Infura endpoint (if using testnet)
- **Express API:** http://127.0.0.1:5000 (if you started it)
- **ZKP backend:** http://127.0.0.1:5010

**Connect MetaMask:**
- **Ganache:** Add network `http://127.0.0.1:7545` (Chain ID: 1337) and import a Ganache account
- **Sepolia:** Ensure MetaMask is connected to Sepolia network (Chain ID: 11155111)

---

## 7. Automated Tests

### Smart contract tests (Truffle)

```bash
npx truffle test
```

### Frontend tests

```bash
cd frontend
npm test
```

### Backend API tests (if available)

From `backend/api` run your usual Node test command (currently no script is defined beyond `npm start`).

### Rust backend tests

```bash
cd zkp-backend
cargo test
```

---

## 8. Common Issues & Tips

1. **Contracts not found in frontend**: After migration, confirm the frontend `src/config` (or `.env`) references the new contract addresses.
2. **ZKP verification fails**: Ensure the Rust backend is running and the frontend `.env` points to it.
3. **Railgun is optional**: The public purchase flow with ZKP commitments works completely without Railgun. The frontend automatically detects if the Railgun API is offline and hides private payment features. You only need the Railgun backend if you want to test private payments.
4. **Port conflicts**: If you already use ports 3000, 5000, 5010, or 7545, adjust `.env` files, Express config, or start commands accordingly.

---

## 9. File/Directory Overview

```
ev-battery-supplychain/
├── contracts/         # Solidity contracts
├── migrations/        # Truffle deployment scripts
├── test/              # Smart contract tests
├── frontend/          # React app (Railgun-integrated UI)
├── backend/api/       # Express REST API
├── backend/railgun/   # Optional Railgun helper scripts (excluded from git - see .gitignore)
├── zkp-backend/       # Rust ZKP service (Bulletproofs)
├── docs/              # Architecture, ZKP, and protocol docs
├── truffle-config.js  # Truffle network configuration
└── README.md          # You are here
```

---

## 10. Helpful Commands

| Task | Command |
| ---- | ------- |
| Compile contracts | `npx truffle compile` |
| Deploy to Ganache | `npx truffle migrate --network development` |
| Deploy to Sepolia | `npx truffle migrate --network sepolia` |
| Run Ganache | `ganache --port 7545` |
| Run ZKP backend | `cd zkp-backend && cargo run` |
| Run Express API | `cd backend/api && npm start` |
| Run frontend | `cd frontend && npm start` |
| Run contract tests | `npx truffle test` |
| Run Rust tests | `cd zkp-backend && cargo test` |

---

## 11. Support & Further Documentation

Detailed architecture, cryptography notes, and protocol specifications live under the `docs/` directory. Recommended reading order for understanding the public purchase flow:

1. `docs/zkp-privacy-summary.md` - Overview of ZKP implementation and privacy features
2. `docs/zkp-technical-background.md` - Comprehensive background on ZKPs, Pedersen Commitments, and Bulletproofs
3. `docs/SMART_CONTRACT_SPECIFICATION.md` - Smart contract details and API
4. `docs/zkp-vc-architecture.md` - Detailed workflow with numbered sequence diagrams

**For Auditors:**
- **`docs/AUDITOR_GUIDE.md`** - **Step-by-step guide for verifying product credentials** ⭐

**Additional Resources:**
- `docs/zkp-documentation-index.md` - Complete index of all ZKP documentation
- `docs/architecture.md` - Overall system architecture
- `docs/API_REFERENCE.md` - Complete API reference for all services

For troubleshooting, open an issue or contact the project maintainer.

---

**Happy hacking!** ✨
