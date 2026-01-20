# External Integrations

**Analysis Date:** 2026-01-20

## APIs & External Services

**Ethereum RPC (Alchemy):**
- Provider: Alchemy
- Purpose: Sepolia testnet access for contract interactions
- SDK/Client: `ethers` JsonRpcProvider
- Auth: `ALCHEMY_API_KEY` in `.env.truffle`
- Endpoint: `https://eth-sepolia.g.alchemy.com/v2/{API_KEY}`

**IPFS (Pinata):**
- Provider: Pinata
- Purpose: Store Verifiable Credentials (VCs) as JSON files
- SDK/Client: Direct REST API (`fetch`)
- Auth: `REACT_APP_PINATA_JWT` (Bearer token)
- Endpoint: `https://api.pinata.cloud/pinning/pinFileToIPFS`
- Implementation: `frontend/src/utils/ipfs.js`

**Railgun Privacy Protocol:**
- Provider: Railgun Community (SDK packages)
- Purpose: Shielded/private token transfers for payment privacy
- SDK/Client: `@railgun-community/wallet`, `@railgun-community/engine`
- Auth: None (client-side wallet creation via MetaMask signature)
- Network: EthereumSepolia (via `NetworkName.EthereumSepolia`)
- Implementation: `frontend/src/lib/railgun-client-browser.js`, `frontend/src/lib/railgun-clean/`

## Data Storage

**Databases:**

SQLite (Backend Railgun State):
- Type: SQLite via better-sqlite3
- Connection: File-based at `backend/railgun/data/railgun-integration.db`
- Client: `better-sqlite3` (synchronous API)
- Implementation: `backend/railgun/database/connection.js`
- Tables: `config` (key-value), `audit_history` (logging)

IndexedDB (Browser):
- Type: Browser IndexedDB via level-js
- Purpose: Railgun wallet data and ZKP artifacts
- Client: `level-js`, `localforage`
- Database names: `railgun-wallet-db`, `railgun-artifacts`

**File Storage:**
- Local filesystem only (no cloud storage)
- Artifacts cached in browser IndexedDB
- VCs stored on IPFS via Pinata

**Caching:**
- Browser: `localforage` for ZKP circuit artifacts
- localStorage: Railgun wallet credentials (`railgun.wallet` key)

## Smart Contracts

**ProductFactory:**
- Purpose: Factory pattern for creating ProductEscrow clones
- Address (Ganache): `0xAd5F3780044adcb0936F33DABd1081309ce6c174`
- Address (Sepolia): `0xc814fb0bE7A4E23a1d923D174159960676a632f2`
- ABI: `frontend/src/abis/ProductFactory.json`
- Implementation: `contracts/ProductFactory.sol`

**ProductEscrow_Initializer:**
- Purpose: Escrow contract for product lifecycle (purchase, delivery, payment)
- Pattern: Minimal proxy clones via OpenZeppelin Clones
- ABI: `frontend/src/abis/ProductEscrow_Initializer.json`
- Implementation: `contracts/ProductEscrow_Initializer.sol`

**WETH (Sepolia):**
- Address: `0xfff9976782d46CC05630d1f6eBAb18b2324d6B14`
- Purpose: Wrapped ETH for Railgun shielding

## Authentication & Identity

**Wallet Authentication:**
- Provider: MetaMask (browser extension)
- Implementation: `window.ethereum` API via ethers BrowserProvider
- Flow: User signs message to derive Railgun wallet encryption key

**Verifiable Credentials (VCs):**
- Standard: W3C VC Data Model with EIP-712 signatures
- Signing: MetaMask `eth_signTypedData_v4`
- Verification: `backend/api/verifyVC.js` using `ethers.verifyTypedData`
- Identity: DID format `did:ethr:{chainId}:{address}`

## Internal Backends

**VC Verification API:**
- Port: 5000
- Endpoints: `POST /verify-vc`, `POST /fetch-vc`
- Implementation: `backend/api/server.js`
- Purpose: Verify VC signatures, fetch VCs from IPFS

**ZKP Backend (Rust):**
- Port: 5010
- Endpoints:
  - `POST /zkp/generate` - Classic Bulletproof generation
  - `POST /zkp/verify` - Classic Bulletproof verification
  - `POST /zkp/commit-tx-hash` - Pedersen commitment to TX hash
  - `POST /zkp/prove_plus` - Bulletproofs+ generation
  - `POST /zkp/verify_plus` - Bulletproofs+ verification
  - `POST /zkp/generate-value-commitment` - Value commitment
  - `POST /zkp/verify-value-commitment` - Value commitment verification
- Implementation: `zkp-backend/src/main.rs`
- Purpose: Zero-knowledge proofs for transaction privacy

**Railgun API Backend:**
- Port: 3001
- Entry: `backend/railgun/start-api.js`
- Purpose: Server-side Railgun wallet operations

## Monitoring & Observability

**Error Tracking:**
- None (console logging only)

**Logs:**
- Console output with emoji prefixes for visual distinction
- Audit logging to SQLite `audit_history` table

## CI/CD & Deployment

**Hosting:**
- Development: Local (Ganache, Node.js servers)
- Production: Docker container for frontend

**CI Pipeline:**
- None detected in repository

**Docker:**
- `frontend/Dockerfile` - Multi-stage build (build + serve)
- `docker-compose.yml` - Frontend service on port 3000
- Base image: `node:18-alpine`
- Static server: `serve -s build -l 3000`

## Environment Configuration

**Required env vars (Frontend):**
- `REACT_APP_RPC_URL` - Ethereum RPC endpoint
- `REACT_APP_FACTORY_ADDRESS` - ProductFactory contract
- `REACT_APP_PINATA_JWT` - Pinata API authentication
- `REACT_APP_CHAIN_ALIAS` - Chain ID

**Required env vars (Truffle deployment):**
- `ALCHEMY_API_KEY` - Alchemy API access
- `MNEMONIC` - Wallet seed phrase

**Secrets location:**
- `.env.truffle` (root) - Deployment secrets
- `frontend/.env.ganache`, `frontend/.env.sepolia` - Environment configs
- `backend/railgun/.env` - Backend Railgun config

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## Network Communication Flow

```
Browser (React App)
    |
    +--> MetaMask (wallet signing, transactions)
    |
    +--> Alchemy RPC (contract reads/writes)
    |
    +--> Pinata API (VC storage to IPFS)
    |
    +--> localhost:5000 (VC verification backend)
    |
    +--> localhost:5010 (ZKP proof generation/verification)
    |
    +--> localhost:3001 (Railgun API backend)
```

---

*Integration audit: 2026-01-20*
