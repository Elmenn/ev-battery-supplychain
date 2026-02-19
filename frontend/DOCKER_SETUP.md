# Docker Setup for Frontend

This guide explains how to set up and run the frontend using Docker, so you don't need to install Node.js or any JavaScript tooling.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- A Pinata account (for IPFS storage) - get a free account at [Pinata](https://www.pinata.cloud/)

## Quick Start

### Fastest Path (Supervisor Demo)

If `frontend/.env` is already present and valid in this repo, the fastest run path is:

```bash
docker compose up --build
```

Then open:
```
http://localhost:3000
```

No Node.js or npm installation is required on the host.

### 1. Configure Environment Variables

Before building the Docker image, you need to create a `.env` file in the `frontend` directory:

```bash
cd frontend
copy .env.example .env     # Windows
# cp .env.example .env      # macOS/Linux
```

**Edit `frontend/.env` and fill in the required values:**

#### Required Variables:
- **`REACT_APP_PINATA_JWT`**: Your Pinata JWT token (get from [Pinata Dashboard](https://app.pinata.cloud/))
  - Sign up for a free account at https://www.pinata.cloud/
  - Go to API Keys section
  - Create a new key and copy the JWT token

- **`REACT_APP_FACTORY_ADDRESS`**: The deployed ProductFactory contract address
  - This will be provided after contract deployment
  - For testing, you can use: `0x0000000000000000000000000000000000000000` (but the app won't work fully)

- **`REACT_APP_RPC_URL`**: Ethereum RPC endpoint
  - For Ganache (local): `http://127.0.0.1:8545`
  - For Sepolia (testnet): `https://ethereum-sepolia.publicnode.com` or your Alchemy/Infura endpoint

- **`REACT_APP_CHAIN_ID`**: Ethereum chain ID
  - For Ganache: `1337`
  - For Sepolia: `11155111`

- **`REACT_APP_ZKP_BACKEND_URL`**: ZKP backend service URL
  - Default: `http://localhost:5010`
  - Make sure the ZKP backend is running if you need ZKP verification

#### Optional Variables:
- **`REACT_APP_RAILGUN_API_URL`**: Railgun backend URL (for private payments)
  - Default: `http://localhost:3001`
  - Only needed if testing private payment features

- **`REACT_APP_CHAIN_ALIAS`**: Chain alias (usually same as CHAIN_ID)
- **`REACT_APP_RAILGUN_CHAIN`**: Railgun chain name (e.g., `ethereum`)
- **`REACT_APP_RAILGUN_NETWORK`**: Railgun network name (e.g., `Ethereum_Sepolia` for Sepolia)
- **`REACT_APP_SHIELD_STRATEGY`**: Shield strategy (`dev` or `sdk`)

### 2. Build and Run with Docker Compose

From the repository root:

```bash
docker compose up --build
```

This will:
1. Build the frontend Docker image (includes installing dependencies and building the React app)
2. Start the container serving the app on port 3000

The first build may take 10-15 minutes. Subsequent builds will be faster due to Docker layer caching.

### 3. Access the Application

Open your browser and navigate to:
```
http://localhost:3000
```

## Network-Specific Setup

### For Ganache (Local Development)

1. Copy the Ganache-specific example:
   ```bash
   cd frontend
   copy .env.ganache.example .env
   ```

2. Edit `.env` and fill in:
   - `REACT_APP_PINATA_JWT` (required)
   - `REACT_APP_FACTORY_ADDRESS` (after contract deployment)
   - `REACT_APP_RPC_URL=http://127.0.0.1:8545` (or your Ganache port)
   - `REACT_APP_CHAIN_ID=1337`

3. Make sure Ganache is running before starting the frontend

### For Sepolia (Testnet)

1. Copy the Sepolia-specific example:
   ```bash
   cd frontend
   copy .env.sepolia.example .env
   ```

2. Edit `.env` and fill in:
   - `REACT_APP_PINATA_JWT` (required)
   - `REACT_APP_FACTORY_ADDRESS` (after contract deployment)
   - `REACT_APP_RPC_URL` (Sepolia RPC endpoint)
   - `REACT_APP_CHAIN_ID=11155111`
   - `REACT_APP_RAILGUN_NETWORK=Ethereum_Sepolia` (if using Railgun)

3. Make sure MetaMask is configured for Sepolia network

## Important Notes

### Environment Variables at Build Time

⚠️ **Critical**: React apps embed environment variables at **build time**, not runtime. This means:
- You **must** create `frontend/.env` **before** running `docker compose up --build`
- If you change `.env` after building, you need to rebuild: `docker compose up --build`
- The `.env` file is copied into the Docker build context and used during `npm run build`

### Updating Environment Variables

If you need to update environment variables:

1. Edit `frontend/.env` with your new values
2. Rebuild the Docker image:
   ```bash
   docker compose up --build
   ```

### Stopping the Container

- Press `Ctrl+C` in the terminal, or
- Run `docker compose down` in another terminal

### Starting Again

After stopping, you can start the container again without rebuilding:
```bash
docker compose up
```

To rebuild (if you changed code or environment variables):
```bash
docker compose up --build
```

## Troubleshooting

### "REACT_APP_PINATA_JWT is missing" error
- Make sure you've created `frontend/.env` from `frontend/.env.example`
- Add your Pinata JWT token to `REACT_APP_PINATA_JWT` in the `.env` file
- Rebuild: `docker compose up --build`

### "Invalid factory address" error
- Ensure `REACT_APP_FACTORY_ADDRESS` in `frontend/.env` matches the deployed contract address
- Rebuild after updating: `docker compose up --build`

### Port 3000 already in use
- Stop any other services using port 3000
- Or change the port mapping in `docker-compose.yml`:
  ```yaml
  ports:
    - "3001:3000"  # Maps host port 3001 to container port 3000
  ```

### Environment variables not updating
- Remember: React embeds env vars at build time
- After changing `.env`, you **must** rebuild: `docker compose up --build`

### Docker build fails
- Make sure Docker Desktop is running
- Check that `frontend/.env` exists and is properly formatted (no syntax errors)
- Ensure you have enough disk space (Docker images can be large)

## Example .env File

Here's a minimal example for local Ganache development:

```env
# Network
REACT_APP_RPC_URL=http://127.0.0.1:8545
REACT_APP_CHAIN_ID=1337
REACT_APP_CHAIN_ALIAS=1337

# Contracts (update after deployment)
REACT_APP_FACTORY_ADDRESS=0x1234567890123456789012345678901234567890

# Pinata IPFS (REQUIRED - get from https://www.pinata.cloud/)
REACT_APP_PINATA_JWT=your-actual-jwt-token-here

# ZKP Backend
REACT_APP_ZKP_BACKEND_URL=http://localhost:5010

# Optional: Railgun
REACT_APP_RAILGUN_API_URL=http://localhost:3001
REACT_APP_RAILGUN_CHAIN=ethereum
REACT_APP_RAILGUN_NETWORK=local
REACT_APP_SHIELD_STRATEGY=dev
```

## Next Steps

After the frontend is running:
1. Make sure the ZKP backend is running (if needed): `cd zkp-backend && cargo run`
2. Make sure the Express API is running (optional): `cd backend/api && npm start`
3. Connect MetaMask to the correct network (Ganache or Sepolia)
4. Start testing the application!

For more information, see the main [README.md](../README.md).
