1. Start Docker Desktop and wait until the engine is running.
2. From the repo root:

```powershell
cd frontend
copy .env.sepolia.example .env
cd ..
docker compose up --build
```

Or, once `frontend/.env` already exists:

```powershell
.\start-demo.ps1
```

This starts:
- frontend on `http://localhost:3000`
- backend API on `http://localhost:5000`
- ZKP backend on `http://localhost:5010`

The Sepolia example env already contains the latest verified ERC-7984 deployment addresses.
