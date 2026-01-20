# Architecture

**Analysis Date:** 2026-01-20

## Pattern Overview

**Overall:** Monorepo with decoupled frontend, multiple backend services, and smart contracts

**Key Characteristics:**
- React SPA frontend with ethers.js for blockchain interaction
- Multiple backend microservices (Railgun API, ZKP API)
- Solidity smart contracts using Factory + Proxy (Clone) pattern
- Privacy-preserving payments via Railgun integration
- Zero-knowledge proofs for confidential data commitments
- IPFS (Pinata) for decentralized Verifiable Credential storage

## Layers

**Presentation Layer (Frontend):**
- Purpose: User interface for marketplace interactions
- Location: `frontend/src/`
- Contains: React components, views, UI components
- Depends on: ethers.js, Railgun SDK, backend APIs
- Used by: End users via browser

**Smart Contract Layer:**
- Purpose: On-chain escrow logic, product lifecycle management
- Location: `contracts/`
- Contains: Solidity contracts (ProductFactory, ProductEscrow_Initializer)
- Depends on: OpenZeppelin (ReentrancyGuard, Clones, Ownable)
- Used by: Frontend via ethers.js

**Railgun Backend Service:**
- Purpose: Privacy wallet management, private payment orchestration
- Location: `backend/railgun/`
- Contains: Express.js API, SQLite database
- Depends on: @railgun-community packages, ethers.js
- Used by: Frontend for private payment flows

**ZKP Backend Service:**
- Purpose: Bulletproof/Pedersen commitment generation and verification
- Location: `zkp-backend/`
- Contains: Rust Actix-web server with cryptographic primitives
- Depends on: curve25519-dalek, bulletproofs crate
- Used by: Frontend for TX hash commitments, value commitments

**External Storage (IPFS):**
- Purpose: Decentralized Verifiable Credential storage
- Location: External (Pinata gateway)
- Contains: JSON VCs with proofs
- Used by: Frontend uploads, retrieval via IPFS gateway

## Data Flow

**Product Creation Flow:**

1. Seller fills ProductFormWizard (Steps 1-4) in `frontend/src/components/marketplace/`
2. Step 2.5: Optional Railgun address configuration for private payments
3. Step 3: Calls ProductFactory.createProduct() with price commitment
4. Factory clones ProductEscrow_Initializer and initializes it
5. Stage 0 VC uploaded to Pinata, CID stored on-chain via updateVcCid()

**Public Purchase Flow:**

1. Buyer calls purchasePublic() with ETH matching publicPriceWei
2. Contract moves to Phase.Purchased, escrows ETH
3. Seller confirms order via confirmOrder(), moves to Phase.OrderConfirmed
4. Transporters bid, seller selects via setTransporter(), moves to Phase.Bound
5. Buyer confirms delivery via revealAndConfirmDelivery()
6. Contract releases ETH to seller/transporter, moves to Phase.Delivered

**Private Payment Flow (Railgun):**

1. Buyer connects Railgun wallet via RailgunConnectionButton
2. Buyer opens PrivatePaymentModal, initiates private transfer
3. Frontend calls Railgun SDK for shielded transfer to seller's 0zk address
4. recordPrivatePayment() called on-chain with memoHash and railgunTxRef
5. Contract moves to Phase.Purchased with PurchaseMode.Private
6. Delivery confirmation proceeds without on-chain ETH transfer

**ZKP Commitment Flow:**

1. Purchase/delivery transaction completed on-chain
2. Frontend calls ZKP backend `/zkp/commit-tx-hash` with tx_hash
3. Rust backend generates Pedersen commitment + Bulletproof
4. Commitment stored in VC credentialSubject.txHashCommitment
5. VC uploaded to Pinata, CID updated on-chain

**State Management:**
- React useState/useEffect for component state
- localStorage for persisted Railgun wallet credentials
- On-chain state via ProductEscrow_Initializer.phase enum
- SQLite for Railgun backend audit logs and wallet configs

## Key Abstractions

**ProductEscrow_Initializer (Clone Pattern):**
- Purpose: Each product gets a minimal proxy clone
- Examples: `contracts/ProductEscrow_Initializer.sol`
- Pattern: OpenZeppelin Clones library for gas-efficient deployments
- Phases: Listed -> Purchased -> OrderConfirmed -> Bound -> Delivered/Expired

**Verifiable Credentials (W3C VC):**
- Purpose: Provenance chain for supply chain attestations
- Examples: `frontend/src/utils/vcBuilder.js`
- Pattern: Stage 0 (product) -> Stage 2 (sale) -> Stage 3 (delivery)
- Links: previousCredential field creates linear chain via CIDs

**Price Commitments:**
- Purpose: Hide exact price while proving validity
- Examples: `zkp-backend/src/zk/pedersen.rs`
- Pattern: Pedersen commitment C = vG + rH, Bulletproof range proof

**Railgun Wallet Integration:**
- Purpose: Privacy-preserving payments
- Examples: `frontend/src/lib/railgun-clean/`, `backend/railgun/api/railgun-api.js`
- Pattern: Frontend SDK handles wallet, backend provides identity management

## Entry Points

**Frontend Application:**
- Location: `frontend/src/index.js`
- Triggers: Browser load
- Responsibilities: Bootstrap React, initialize Railgun SDK

**React Router:**
- Location: `frontend/src/App.js`
- Routes: `/` (MarketplaceView), `/product/:address` (ProductDetail), `/railgun-test`

**Railgun Backend API:**
- Location: `backend/railgun/start-api.js`
- Triggers: `node start-api.js`
- Responsibilities: Start Express server on port 3001

**ZKP Backend API:**
- Location: `zkp-backend/src/main.rs`
- Triggers: `cargo run`
- Responsibilities: Start Actix-web server on port 5010

**Smart Contract Deployment:**
- Location: `migrations/1_initial_migration.js`
- Triggers: `truffle migrate`
- Responsibilities: Deploy ProductEscrow_Initializer impl, then ProductFactory

## Error Handling

**Strategy:** Custom errors in contracts, try/catch in frontend

**Patterns:**
- Solidity: Custom error types (NotBuyer, WrongPhase, etc.) for gas efficiency
- Frontend: Try/catch with console.error and user-facing alerts
- Backend APIs: JSON error responses with status codes

## Cross-Cutting Concerns

**Logging:**
- Frontend: console.log with emoji prefixes for flow tracing
- Railgun Backend: console.log with checkmarks/X for success/failure
- ZKP Backend: println! macro with [API] prefix

**Validation:**
- Smart Contracts: require/revert with custom errors
- Frontend: Input validation before contract calls
- Backend: Request body validation, CORS origin checks

**Authentication:**
- Wallet-based: MetaMask signs transactions
- Railgun: Mnemonic-derived wallet ID stored in localStorage
- Backend: Rate limiting, CORS, no traditional auth

**Rate Limiting:**
- Railgun Backend: Simple in-memory rate limit (30 req/min)
- ZKP Backend: None (local dev only)

---

*Architecture analysis: 2026-01-20*
