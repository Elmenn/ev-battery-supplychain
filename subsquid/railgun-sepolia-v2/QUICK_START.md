# Quick Start Guide

## Setup

1. **Install dependencies**:
   ```bash
   cd subsquid/railgun-sepolia-v2
   npm install
   ```

2. **Create `.env` file**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set:
   - `DB_PORT=5433`
   - `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/squid?options=-c%20search_path%3Dpublic`
   - `RPC_SEPOLIA=https://ethereum-sepolia.publicnode.com`

3. **Start PostgreSQL**:
   ```bash
   docker-compose up -d
   ```

4. **Generate code and migrations**:
   ```bash
   npm run codegen
   npm run build
   npm run migration:generate
   npm run migration:apply
   ```

5. **Run processor** (indexes transactions):
   ```bash
   npm run process
   ```

6. **Start GraphQL server** (in another terminal):
   ```bash
   npm run serve
   ```

## Test Your Transaction

Once the processor has indexed your transaction (block 9536064), query it:

```graphql
query {
  transactions(where: { transactionHash_eq: "0x35d98f0b0f011f74e6f3bf0f56c15106fb4799bf44040b2d009a54a7db91f87a" }) {
    id
    transactionHash
    blockNumber
    blockTimestamp
  }
}
```

## Connect SDK to Local Endpoint

Once GraphQL server is running on `http://localhost:4000/graphql`:

```javascript
// In browser console
window.__OVERRIDE_SEPOLIA_V2_SUBGRAPH__ = 'http://localhost:4000/graphql';
// Then reload and run sync
await window.RGV2.RG.syncRailgunTransactionsV2(window.RGV2.SEPOLIA.networkName);
```

