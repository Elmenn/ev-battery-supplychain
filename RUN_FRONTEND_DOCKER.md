cd frontend
copy .env.sepolia.example .env  # Windows (macOS/Linux: cp .env.sepolia.example .env)
cd .. && docker compose up --build
