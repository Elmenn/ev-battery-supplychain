# Technology Stack

**Analysis Date:** 2026-01-20

## Languages

**Primary:**
- JavaScript (ES6+) - Frontend React app, Backend Node.js services
- Solidity ^0.8.0/^0.8.21 - Smart contracts (Ethereum)
- Rust (Edition 2021) - ZKP backend service

**Secondary:**
- TypeScript - Partial usage in Railgun SDK integration files
- JSX - React component syntax

## Runtime

**Environment:**
- Node.js 18+ (specified in Dockerfile: `node:18-alpine`)
- Browser (React SPA targeting modern browsers)
- Rust (Cargo/Actix-web for ZKP backend)

**Package Manager:**
- npm (root, frontend, backend/api)
- Cargo (zkp-backend)
- Lockfiles: `package-lock.json` present in root and `frontend/`; `Cargo.lock` in `zkp-backend/`

## Frameworks

**Core:**
- React 18.3.1 - Frontend SPA framework (`frontend/package.json`)
- Express 5.1.0 - Backend VC verification API (`backend/api/package.json`)
- Actix-web 4 - ZKP proof generation/verification API (`zkp-backend/Cargo.toml`)
- Truffle - Smart contract development/deployment (`truffle-config.js`)

**Testing:**
- Mocha/Chai 4.5.0 - Smart contract and integration tests
- Jest via react-scripts - Frontend unit tests (`@testing-library/react`)
- truffle-assertions 0.9.2 - Smart contract test assertions

**Build/Dev:**
- react-app-rewired 2.2.1 - Custom webpack config for CRA
- webpack (via react-scripts 5.0.1) - Module bundling
- Docker - Containerized frontend deployment

## Key Dependencies

**Critical (Frontend):**
- `ethers` 6.13.1 - Ethereum wallet/contract interaction
- `web3` 4.16.0 - Alternative Web3 provider
- `@railgun-community/wallet` 10.4.0 - Privacy SDK for shielded transactions
- `@railgun-community/engine` 9.4.0 - Railgun core engine
- `@railgun-community/shared-models` 7.6.1 - Shared Railgun types
- `@mui/material` 6.1.2 - UI component library
- `react-router-dom` 6.30.1 - Client-side routing
- `axios` 1.9.0 - HTTP client
- `snarkjs` 0.7.5 - ZK-SNARK utilities

**Critical (Backend):**
- `express` 5.1.0 - HTTP server (VC verification)
- `better-sqlite3` 11.10.0 - SQLite database for Railgun state
- `ethers` 6.14.4 - Contract interaction for verification

**Critical (Contracts):**
- `@openzeppelin/contracts` 5.4.0 - Security primitives (Clones, Ownable, ReentrancyGuard)
- `@truffle/hdwallet-provider` 2.1.15 - Wallet provider for deployments

**Critical (ZKP Backend - Rust):**
- `bulletproofs` 4.0.0 - Classic Bulletproof R1CS proofs
- `tari_bulletproofs_plus` 0.4.1 - Bulletproofs+ range proofs
- `curve25519-dalek-ng` 4.1.1 - Elliptic curve for classic BP
- `curve25519-dalek` 4.2 - Elliptic curve for BP+
- `actix-web` 4 - HTTP server
- `serde` 1.0 - JSON serialization

**Infrastructure:**
- `level-js` 6.1.0 - IndexedDB wrapper for browser storage
- `localforage` 1.10.0 - Browser storage abstraction (artifacts)

## Configuration

**Environment Variables:**

Frontend (`.env.ganache`, `.env.sepolia`):
- `REACT_APP_RPC_URL` - Ethereum RPC endpoint
- `REACT_APP_FACTORY_ADDRESS` - ProductFactory contract address
- `REACT_APP_PINATA_JWT` - Pinata API token for IPFS
- `REACT_APP_CHAIN_ALIAS` - Chain ID (1337 ganache, 11155111 sepolia)
- `REACT_APP_RAILGUN_API_URL` - Backend Railgun API URL
- `REACT_APP_RAILGUN_CHAIN` - Railgun network name
- `REACT_APP_WETH_ADDRESS` - WETH contract (Sepolia)

Root (`.env.truffle`):
- `ALCHEMY_API_KEY` - Alchemy RPC API key
- `MNEMONIC` - Wallet mnemonic for deployments

**Build Configuration:**
- `truffle-config.js` - Solidity compiler (0.8.21), network configs (development, sepolia)
- `frontend/config-overrides.js` - Webpack polyfills for Node.js modules, Railgun SDK resolution
- `docker-compose.yml` - Frontend container on port 3000

## Platform Requirements

**Development:**
- Node.js 18+
- npm
- Rust toolchain (for zkp-backend)
- Ganache CLI or Ganache GUI (port 8545)
- Python3, make, g++ (for native module compilation in Docker)

**Production:**
- Docker (frontend served via `serve`)
- Ethereum node access (Alchemy Sepolia RPC)
- ZKP backend running on port 5010
- VC verification backend on port 5000
- Railgun API backend on port 3001

**Networks:**
- Development: Local Ganache (chain 1337, port 8545)
- Testnet: Sepolia (chain 11155111, via Alchemy)

---

*Stack analysis: 2026-01-20*
