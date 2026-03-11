#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! docker info >/dev/null 2>&1; then
  echo "Docker engine is not reachable. Start Docker Desktop before using ./stop-demo.sh." >&2
  exit 1
fi

cd "$repo_root"

echo "Stopping Docker demo stack..."
docker compose down
echo "Docker demo stack stopped."
