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

---

## 2. Clone the Repository

```bash
git clone https://github.com/Elmenn/ev-battery-supplychain
cd ev-battery-supplychain
```

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
   copy .env.ganache.example .env.ganache     # Windows
   # cp .env.ganache.example .env.ganache      # macOS/Linux
   ```
   
   **Edit `.env.ganache` and fill in:**
   - `REACT_APP_PINATA_JWT`: Get a free JWT token from [Pinata](https://www.pinata.cloud/) (required for IPFS uploads)
   - `REACT_APP_FACTORY_ADDRESS`: Will be filled after contract deployment (see step 3)
   - `REACT_APP_ZKP_BACKEND_URL`: Default is `http://localhost:5010` (change if using different port)
   
   Then copy to `.env`:
   ```bash
   copy .env.ganache .env     # Windows
   # cp .env.ganache .env      # macOS/Linux
   cd ..
   ```

3. **Deploy contracts to Ganache:**
   ```bash
   npx truffle compile
   npx truffle migrate --network development
   ```
   
   **Copy the deployed `ProductFactory` address from the migration output.**

4. **Update frontend `.env` with the deployed factory address:**
   - Open `frontend/.env`
   - Set `REACT_APP_FACTORY_ADDRESS` to the `ProductFactory` address from step 3
   - Example: `REACT_APP_FACTORY_ADDRESS=0x1234567890123456789012345678901234567890`

### Option B: Sepolia (Testnet)

1. **Create `.env.truffle` in repo root:**
   ```bash
   copy .env.truffle.example .env.truffle     # Windows
   # cp .env.truffle.example .env.truffle      # macOS/Linux
   # Then edit .env.truffle and fill in your actual values
   ```

2. **Get Sepolia ETH:**
   - Use a [Sepolia faucet](https://sepoliafaucet.com/) to fund your deployment account
   - Ensure the account has enough ETH for gas fees

3. **Configure frontend environment:**
   ```bash
   cd frontend
   copy .env.sepolia.example .env.sepolia     # Windows
   # cp .env.sepolia.example .env.sepolia      # macOS/Linux
   ```
   
   **Edit `.env.sepolia` and fill in:**
   - `REACT_APP_PINATA_JWT`: Get a free JWT token from [Pinata](https://www.pinata.cloud/) (required for IPFS uploads)
   - `REACT_APP_FACTORY_ADDRESS`: Will be filled after contract deployment (see step 4)
   - `REACT_APP_RPC_URL`: Default is public Sepolia RPC (or use your Alchemy/Infura endpoint)
   - `REACT_APP_ZKP_BACKEND_URL`: Default is `http://localhost:5010` (change if using different port)
   
   Then copy to `.env`:
   ```bash
   copy .env.sepolia .env     # Windows
   # cp .env.sepolia .env      # macOS/Linux
   cd ..
   ```

4. **Deploy contracts to Sepolia:**
   ```bash
   npx truffle compile
   npx truffle migrate --network sepolia
   ```
   
   **Copy the deployed `ProductFactory` address from the migration output.**

5. **Update frontend `.env` with the deployed factory address:**
   - Open `frontend/.env`
   - Set `REACT_APP_FACTORY_ADDRESS` to the `ProductFactory` address from step 4
   - Example: `REACT_APP_FACTORY_ADDRESS=0x1234567890123456789012345678901234567890`
   - Verify `REACT_APP_CHAIN_ID=11155111` is set correctly

6. **Configure MetaMask:**
   - Add Sepolia network if not already added (Chain ID: 11155111)
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
## Docker (Frontend Only, for Evaluators)

If you want to run only the frontend without installing Node, npm, or the React toolchain, you can use the provided Docker setup.

1. In the `frontend` folder, create a `.env` file from the Sepolia example:

   **Windows:**
   ```bash
   cd frontend
   copy .env.sepolia.example .env
   cd ..
macOS / Linux:

cd frontend
cp .env.sepolia.example .env
cd ..


From the repository root, build and start the Dockerized frontend:

docker compose up --build


Open the app in your browser at:

http://localhost:3000


The Docker container builds the existing React app and serves the static bundle.
For full functionality (ZKP backend + REST API), the existing services still need to be started separately:

cd zkp-backend && cargo run
cd backend/api && npm start
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

1. **"Invalid factory address" error**: Make sure `REACT_APP_FACTORY_ADDRESS` in `frontend/.env` matches the deployed `ProductFactory` address from the migration output. Restart `npm start` after updating `.env`.

2. **"REACT_APP_PINATA_JWT is missing" error**: 
   - Sign up for a free account at [Pinata](https://www.pinata.cloud/)
   - Create a new API key and copy the JWT token
   - Add it to `frontend/.env` as `REACT_APP_PINATA_JWT=your-token-here`
   - Restart `npm start`

3. **ZKP verification fails**: Ensure the Rust backend is running (`cd zkp-backend && cargo run`) and `REACT_APP_ZKP_BACKEND_URL` in `frontend/.env` points to it (default: `http://localhost:5010`).

4. **Contracts not found in frontend**: After migration, confirm `REACT_APP_FACTORY_ADDRESS` in `frontend/.env` references the new contract address. Restart the frontend after updating.

5. **Railgun is optional**: The public purchase flow with ZKP commitments works completely without Railgun. The frontend automatically detects if the Railgun API is offline and hides private payment features. You only need the Railgun backend if you want to test private payments.

6. **Port conflicts**: If you already use ports 3000, 5000, 5010, or 7545, adjust `.env` files, Express config, or start commands accordingly.

7. **Environment variables not updating**: After changing `.env` files, you must restart `npm start` for changes to take effect (React apps read env vars at build time).

8. **ESLint errors blocking dev build**: If ESLint errors prevent the frontend from starting, you can disable ESLint during development by adding to `frontend/.env`:
   ```
   DISABLE_ESLINT_PLUGIN=true
   ```
   Note: This is a development-only workaround. Fix ESLint errors before committing code.

9. **Ganache port**: Ensure your Ganache is running on port 7545 (or update `REACT_APP_RPC_URL` in `.env` to match your Ganache port).

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
