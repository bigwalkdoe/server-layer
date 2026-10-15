#!/usr/bin/env bash
#
# Follow logs from the server-layer stack.
#
#   ./logs.sh              # every service
#   ./logs.sh app          # one service
#
# Container logs go to stdout and are captured by Docker's json-file driver with
# the size limits set in docker-compose.yml, so there are no log files on disk
# to rotate.

set -uo pipefail

REPO_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cd "$REPO_DIR/configs" || exit 1

if [ "$#" -eq 0 ]; then
    echo "Following logs from all services (Ctrl+C to exit)..."
    # exec so Ctrl+C reaches Compose directly instead of the shell wrapper.
    exec docker compose logs -f --tail=50
fi

echo "Following logs for service: $1"
exec docker compose logs -f --tail=50 "$1"
