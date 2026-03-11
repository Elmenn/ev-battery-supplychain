cd frontend
copy .env.sepolia.example .env  # Windows (macOS/Linux: cp .env.sepolia.example .env)
cd ..
docker compose up --build

# Or, once frontend/.env already exists:
.\start-demo.ps1

# This now starts the full demo stack:
# - frontend on http://localhost:3000
# - backend API on http://localhost:5000
# - ZKP backend on http://localhost:5010
