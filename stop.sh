#!/usr/bin/env bash
#
# Stop the spectre-server-layer stack.
#
# Named volumes (postgres-data, redis-data, ollama-data) are preserved, so no
# data is lost. Use `docker compose -f configs/docker-compose.yml down -v` if you
# really do want to destroy the volumes as well.

set -euo pipefail

REPO_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cd "$REPO_DIR/configs"

echo "Stopping the spectre-server-layer stack (volumes are preserved)..."
docker compose down --remove-orphans

echo "Containers stopped."
