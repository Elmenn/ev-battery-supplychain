# Docker Setup for Full ERC-7984 Demo Stack

This guide explains how to run the current ERC-7984 demo stack with Docker so you do not need local Node.js, npm, or Rust tooling.

## What Docker Starts

`docker compose up --build` starts:
- frontend at `http://localhost:3000`
- backend API at `http://localhost:5000`
- ZKP backend at `http://localhost:5010`

This is the easiest supervisor/demo path for the current Sepolia ERC-7984 spike.

## Prerequisites

- Docker Desktop installed and running
- a valid `frontend/.env` file
- Sepolia RPC access
- a Pinata JWT if you want upload/archive flows

## Quick Start

### 1. Create `frontend/.env`

For the current ERC-7984 Sepolia deployment:

```powershell
cd frontend
copy .env.sepolia.example .env
```

Then edit `frontend/.env` only if needed.

Already prefilled in the example:
- latest verified ERC-7984 factory
- latest verified ERC-7984 confidential token
- latest verified funding wrapper
- Sepolia WETH public token
- local backend / ZKP URLs

You should still provide:
- `REACT_APP_PINATA_JWT`

Optional for Sepolia free-tier RPC/indexer stability:
- `INDEXER_BATCH_SIZE=10`
- `INDEXER_START_BLOCK=<factory deployment block>`

### 2. Start the Stack

From the repo root:

```powershell
docker compose up --build
```

Or:

```powershell
.\start-demo.ps1
```

Then open:

```text
http://localhost:3000
```

## Important Behavior

### Frontend Environment Variables

The frontend is a React build, so environment variables are embedded at build time.

That means:
- you must create `frontend/.env` before `docker compose up --build`
- if you change `frontend/.env`, rebuild the stack

```powershell
docker compose up --build
```

### Backend Environment Variables

The backend service also reads values from `frontend/.env` through Docker Compose.

That allows the same env file to drive:
- frontend RPC/factory/backend URLs
- backend indexer RPC/factory config
- optional VC status admin token

## Health Checks

You can confirm the stack is healthy with:

```text
http://localhost:5000/health
http://localhost:5000/indexer/health
http://localhost:5010/health
```

## Stopping and Restarting

Stop:

```powershell
docker compose down
```

Or:

```powershell
.\stop-demo.ps1
```

Start again without rebuild:

```powershell
docker compose up
```

Rebuild after env/code changes:

```powershell
docker compose up --build
```

## Troubleshooting

### Docker engine is not reachable

Start Docker Desktop first. The included `start-demo.ps1` checks for this and stops early if the engine is not running.

### Frontend cannot reach backend or ZKP backend

Check:
- `http://localhost:5000/health`
- `http://localhost:5010/health`

If needed:

```powershell
docker compose ps
docker compose logs backend
docker compose logs zkp-backend
```

### Indexer errors on Sepolia free-tier RPC

Set in `frontend/.env`:

```env
INDEXER_BATCH_SIZE=10
INDEXER_START_BLOCK=<your factory deployment block>
```

Then rebuild:

```powershell
docker compose up --build
```

### `REACT_APP_PINATA_JWT` missing

Add it to `frontend/.env`, then rebuild.

### `Invalid factory address`

Check that `frontend/.env` still matches the latest verified ERC-7984 deployment, then rebuild.

Current verified ERC-7984 Sepolia contracts:
- factory: `0x595c596F9fde72DD41ECB4b729c05f79867fAB4C`
- confidential token: `0x7CB22914e17CfdcfDE9F84D4df5A4A47233D46e9`
- funding wrapper: `0xA87435D1a6a764B555c4F941d8E2b5688Ced2c52`
- public token (WETH): `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`

## Notes

- Backend SQLite data is stored in a Docker volume so it survives container restarts.
- This stack is meant for easy demo/supervisor use, not hardened production deployment.
- The frontend still uses build-time environment variables, so env changes require rebuilds.
- Product escrows are clone contracts; the verified implementation/factory addresses above are the authoritative deployed code entry points.
