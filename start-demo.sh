#!/usr/bin/env bash
set -euo pipefail

no_build=false
timeout_seconds=300

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build)
      no_build=true
      shift
      ;;
    --timeout-seconds)
      timeout_seconds="${2:-}"
      if [[ -z "$timeout_seconds" ]]; then
        echo "Missing value for --timeout-seconds" >&2
        exit 1
      fi
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: ./start-demo.sh [--no-build] [--timeout-seconds N]" >&2
      exit 1
      ;;
  esac
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
frontend_env_path="$repo_root/frontend/.env"

assert_docker_engine_ready() {
  if ! docker info >/dev/null 2>&1; then
    echo "Docker Desktop is installed, but the Docker engine is not reachable. Start Docker Desktop and wait until it is fully running, then rerun ./start-demo.sh." >&2
    exit 1
  fi
}

test_http_ok() {
  local url="$1"
  curl -fsS --max-time 5 "$url" >/dev/null 2>&1
}

if [[ ! -f "$frontend_env_path" ]]; then
  echo "Missing frontend/.env. Create it from frontend/.env.sepolia.example before running the demo stack." >&2
  exit 1
fi

assert_docker_engine_ready

cd "$repo_root"

compose_args=(compose up -d)
if [[ "$no_build" == false ]]; then
  compose_args+=(--build)
fi

echo "Starting Docker demo stack from $repo_root..."
docker "${compose_args[@]}"

declare -a target_names=(
  "Backend API"
  "Indexer"
  "ZKP Backend"
  "Frontend"
)

declare -a target_urls=(
  "http://localhost:5000/health"
  "http://localhost:5000/indexer/health"
  "http://localhost:5010/health"
  "http://localhost:3000"
)

echo "Waiting for services to become healthy..."
deadline=$((SECONDS + timeout_seconds))
while (( SECONDS < deadline )); do
  all_ready=true
  for i in "${!target_urls[@]}"; do
    if ! test_http_ok "${target_urls[$i]}"; then
      all_ready=false
      break
    fi
  done

  if [[ "$all_ready" == true ]]; then
    echo
    echo "Docker demo stack is ready."
    for i in "${!target_urls[@]}"; do
      printf '  %-12s %s\n' "${target_names[$i]}" "${target_urls[$i]}"
    done
    echo
    echo "Useful commands:"
    echo "  docker compose logs -f"
    echo "  ./stop-demo.sh"
    exit 0
  fi

  sleep 5
done

echo "Timed out waiting for full readiness after $timeout_seconds seconds." >&2
echo "Current container status:" >&2
docker compose ps >&2
echo >&2
echo "Recent logs:" >&2
docker compose logs --tail 100 >&2
exit 1
