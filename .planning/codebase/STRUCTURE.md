# Codebase Structure

**Analysis Date:** 2026-01-20

## Directory Layout

```
ev-battery-supplychain/
├── .planning/              # GSD planning documents
│   └── codebase/           # Architecture documentation
├── backend/                # Backend services
│   ├── api/                # VC fetch utilities
│   │   └── fetchVC.js      # IPFS VC retrieval
│   └── railgun/            # Railgun privacy service
│       ├── api/            # Express API server
│       │   └── railgun-api.js  # Main API (~36KB)
│       ├── database/       # SQLite connection
│       │   └── connection.js
│       ├── data/           # SQLite database files
│       └── start-api.js    # Entry point
├── contracts/              # Solidity smart contracts
│   ├── ProductFactory.sol  # Clone factory
│   ├── ProductEscrow.sol   # Legacy escrow (reference)
│   ├── ProductEscrow_Initializer.sol  # Proxy-compatible escrow
│   └── helpers/            # Test helpers
├── docs/                   # Documentation
│   ├── railgun/            # Railgun integration docs
│   ├── references/         # Academic references
│   ├── TEST_REPORTS/       # Test results
│   └── Thesis_Report/      # Thesis documentation
├── frontend/               # React SPA
│   ├── public/             # Static assets
│   ├── scripts/            # Build scripts
│   └── src/                # Source code (see below)
├── migrations/             # Truffle migrations
│   └── 1_initial_migration.js
├── test/                   # Contract test files
├── zkp-backend/            # Rust ZKP service
│   └── src/                # Rust source
│       ├── main.rs         # Actix-web server
│       ├── lib.rs          # Library exports
│       └── zk/             # ZKP modules
│           ├── pedersen.rs # Value commitments
│           ├── txid_pedersen_proof.rs  # TX hash commitments
│           └── bp_plus_pedersen.rs     # Bulletproofs+
├── build/                  # Truffle build artifacts
├── ganache-db/             # Local Ganache blockchain data
└── node_modules/           # Root dependencies (Truffle)
```

## Frontend Source Structure

```
frontend/src/
├── abis/                   # Contract ABI JSON files
│   ├── ProductFactory.json
│   └── ProductEscrow_Initializer.json
├── components/             # React components
│   ├── marketplace/        # Product listing components
│   │   ├── ProductCard.jsx
│   │   ├── ProductDetail.jsx  # Large (~800 lines)
│   │   ├── ProductFormWizard.jsx
│   │   ├── ProductFormStep1.jsx
│   │   ├── ProductFormStep2.jsx
│   │   ├── ProductFormStep2_5_Railgun.jsx
│   │   ├── ProductFormStep3.jsx
│   │   ├── ProductFormStep4.jsx
│   │   ├── ProductList.js
│   │   └── StageCard.jsx
│   ├── railgun/            # Privacy payment components
│   │   ├── PrivateFundsDrawer.jsx
│   │   ├── PrivatePaymentModal.jsx
│   │   ├── RailgunConnectionButton.jsx
│   │   ├── RailgunInitializationTest.jsx
│   │   ├── RailgunSimple.tsx
│   │   └── index.js
│   ├── shared/             # Shared UI components
│   │   └── TruncatedText.js
│   ├── thesis/             # Thesis demo components
│   ├── ui/                 # Base UI primitives
│   │   ├── button.js
│   │   ├── card.js
│   │   ├── AlertBadge.js
│   │   ├── StageCard.js
│   │   └── Tabs.jsx
│   └── vc/                 # Verifiable Credential components
│       ├── ProvenanceChainViewer.jsx
│       ├── VCViewer.jsx
│       ├── VerifyVCTab-Enhanced.js
│       ├── VerifyVCInline.js
│       └── ZKPVerificationBox.js
├── config/                 # Configuration files
├── helpers/                # Helper utilities
│   └── format.js           # Number formatting
├── layout/                 # Layout components
│   ├── Header.jsx
│   └── Sidebar.jsx
├── lib/                    # Core libraries
│   ├── artifacts/          # ZKP artifact management
│   ├── ethers/             # Ethers.js utilities
│   ├── poi/                # Proof of Innocence
│   ├── polyfills/          # Browser polyfills
│   ├── railgun/            # Railgun SDK wrappers (TypeScript)
│   │   ├── core/           # Engine, providers, prover
│   │   ├── history/        # Transaction history
│   │   ├── process/        # Data extraction
│   │   ├── quick-sync/     # Graph sync (V2/V3)
│   │   ├── railgun-txids/  # TX ID tracking
│   │   ├── transactions/   # TX builders
│   │   ├── util/           # Utilities
│   │   └── wallets/        # Wallet management
│   ├── railgun-clean/      # Simplified Railgun client
│   │   ├── bootstrap.js
│   │   ├── balances.js
│   │   ├── connection.js
│   │   ├── payments.js
│   │   ├── shield.js
│   │   └── wallet-state.js
│   ├── railgun-bootstrap.js
│   ├── railgun-browser-init.js
│   ├── railgun-client-browser.js
│   ├── railgun-legacy-shim.js
│   └── railgun-stub.js
├── utils/                  # Utility functions
│   ├── commitmentUtils.js  # Commitment binding tags
│   ├── errorHandler.js
│   ├── error.js
│   ├── ipfs.js             # Pinata upload
│   ├── logger.js
│   ├── signVcWithMetamask.js  # EIP-712 signing
│   ├── vcBuilder.js        # VC construction
│   ├── verifyVc.js
│   ├── verifyZKP.js
│   └── web3Utils.js        # Contract interaction helpers
├── views/                  # Page-level components
│   └── MarketplaceView.jsx
├── App.js                  # Root component with routing
├── App.css
├── index.js                # Entry point
└── index.css
```

## Directory Purposes

**`backend/railgun/api/`:**
- Purpose: Express API for Railgun wallet management
- Contains: railgun-api.js (main API logic, ~36KB)
- Key files: `railgun-api.js` handles wallet info, balance, transfers

**`backend/railgun/database/`:**
- Purpose: SQLite persistence for wallet configs and audit logs
- Contains: connection.js (Database class)
- Key files: `connection.js`, `schema.sql`

**`contracts/`:**
- Purpose: Solidity smart contracts for escrow system
- Contains: Factory pattern implementation
- Key files: `ProductFactory.sol`, `ProductEscrow_Initializer.sol`

**`frontend/src/components/marketplace/`:**
- Purpose: Product listing and purchase UI
- Contains: Cards, forms, detail views
- Key files: `ProductDetail.jsx` (main product view), `ProductFormWizard.jsx`

**`frontend/src/components/railgun/`:**
- Purpose: Privacy payment UI components
- Contains: Connection, payment modal, funds drawer
- Key files: `PrivatePaymentModal.jsx`, `RailgunConnectionButton.jsx`

**`frontend/src/lib/railgun/`:**
- Purpose: Railgun SDK TypeScript wrappers
- Contains: Core engine, wallets, transactions
- Key files: `core/engine.ts`, `wallets/wallets.ts`

**`frontend/src/lib/railgun-clean/`:**
- Purpose: Simplified Railgun client for browser
- Contains: Bootstrap, balances, payments
- Key files: `bootstrap.js`, `payments.js`

**`frontend/src/utils/`:**
- Purpose: Shared utility functions
- Contains: VC building, signing, IPFS, commitments
- Key files: `vcBuilder.js`, `ipfs.js`, `commitmentUtils.js`

**`zkp-backend/src/`:**
- Purpose: Rust ZKP generation and verification
- Contains: Pedersen commitments, Bulletproofs
- Key files: `main.rs`, `zk/pedersen.rs`, `zk/txid_pedersen_proof.rs`

## Key File Locations

**Entry Points:**
- `frontend/src/index.js`: React bootstrap
- `frontend/src/App.js`: Router and main component
- `backend/railgun/start-api.js`: Railgun API entry
- `zkp-backend/src/main.rs`: ZKP API entry

**Configuration:**
- `truffle-config.js`: Truffle/Solidity config
- `frontend/.env`: Frontend environment (REACT_APP_*)
- `backend/railgun/.env`: Railgun backend config
- `.env.truffle`: Deployment keys

**Core Logic:**
- `contracts/ProductEscrow_Initializer.sol`: Main escrow contract
- `contracts/ProductFactory.sol`: Factory for clones
- `frontend/src/utils/vcBuilder.js`: VC construction
- `frontend/src/lib/railgun-clean/payments.js`: Private payments
- `backend/railgun/api/railgun-api.js`: Railgun API

**ABIs:**
- `frontend/src/abis/ProductFactory.json`
- `frontend/src/abis/ProductEscrow_Initializer.json`

**Testing:**
- `frontend/src/**/__tests__/`: Co-located frontend tests
- `test/`: Root-level contract tests
- `zkp-backend/tests/`: Rust integration tests

## Naming Conventions

**Files:**
- React components: PascalCase.jsx (e.g., `ProductCard.jsx`)
- Utilities: camelCase.js (e.g., `vcBuilder.js`)
- Solidity: PascalCase_Suffix.sol (e.g., `ProductEscrow_Initializer.sol`)
- Rust: snake_case.rs (e.g., `txid_pedersen_proof.rs`)

**Directories:**
- Lowercase with hyphens for multi-word (e.g., `railgun-clean`)
- Singular for component groups (e.g., `marketplace`, not `marketplaces`)

**Components:**
- Feature prefix: `Product*`, `Railgun*`, `VC*`
- Step suffix for wizards: `ProductFormStep1.jsx`

## Where to Add New Code

**New Feature (Full Stack):**
- UI Component: `frontend/src/components/{feature}/`
- Smart Contract: `contracts/{Feature}.sol`
- Backend API: `backend/{service}/api/`
- Tests: Co-located `__tests__/` folders

**New React Component:**
- Marketplace: `frontend/src/components/marketplace/`
- Railgun: `frontend/src/components/railgun/`
- Shared: `frontend/src/components/shared/`
- UI Primitives: `frontend/src/components/ui/`

**New Smart Contract:**
- Implementation: `contracts/{ContractName}.sol`
- Test helpers: `contracts/helpers/`
- Migration: `migrations/N_{migration_name}.js`

**New Utility Function:**
- Frontend: `frontend/src/utils/{utilName}.js`
- Railgun lib: `frontend/src/lib/railgun-clean/`

**New Backend Endpoint:**
- Railgun API: Add route in `backend/railgun/api/railgun-api.js`
- ZKP API: Add handler in `zkp-backend/src/main.rs`

**New ZKP Circuit:**
- Module: `zkp-backend/src/zk/{circuit_name}.rs`
- Export: Update `zkp-backend/src/zk/mod.rs`

## Special Directories

**`build/`:**
- Purpose: Truffle contract compilation artifacts
- Generated: Yes (by `truffle compile`)
- Committed: Partially (ABIs copied to frontend/src/abis)

**`ganache-db/`:**
- Purpose: Local blockchain state persistence
- Generated: Yes (by Ganache)
- Committed: No (gitignored recommended)

**`frontend/build/`:**
- Purpose: Production frontend bundle
- Generated: Yes (by `npm run build`)
- Committed: No

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes (by `npm install`)
- Committed: No

**`.planning/`:**
- Purpose: GSD planning and documentation
- Generated: By GSD commands
- Committed: Yes (for team reference)

---

*Structure analysis: 2026-01-20*
