# Docker Setup for Full Demo Stack

This guide explains how to run the full demo stack with Docker so you do not need local Node.js, npm, or Rust tooling.

## What Docker Starts

`docker compose up --build` now starts:
- frontend at `http://localhost:3000`
- backend API at `http://localhost:5000`
- ZKP backend at `http://localhost:5010`

The stack is intended to be the easiest supervisor/demo path.

## Prerequisites

- Docker Desktop installed and running
- A valid `frontend/.env` file
- Sepolia RPC and deployed contract addresses if you want the full live flow

## Quick Start

### 1. Create `frontend/.env`

For Sepolia:

```powershell
cd frontend
copy .env.sepolia.example .env
```

For Ganache:

```powershell
cd frontend
copy .env.ganache.example .env
```

Then edit `frontend/.env`.

Minimum important values:
- `REACT_APP_FACTORY_ADDRESS`
- `REACT_APP_RPC_URL`
- `REACT_APP_PINATA_JWT`
- `REACT_APP_VC_BACKEND_URL=http://localhost:5000`
- `REACT_APP_ZKP_BACKEND_URL=http://localhost:5010`

Recommended for Sepolia free-tier RPC providers:
- `INDEXER_BATCH_SIZE=10`
- `INDEXER_START_BLOCK=<factory deployment block>`

Optional for VC status admin actions:
- `VC_STATUS_ADMIN_TOKEN=<your token>`

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

Set the deployed `REACT_APP_FACTORY_ADDRESS` in `frontend/.env`, then rebuild.

## Notes

- Backend SQLite data is stored in a Docker volume so it survives container restarts.
- This stack is meant for easy demo/supervisor use, not hardened production deployment.
- The frontend still uses build-time environment variables, so env changes require rebuilds.
