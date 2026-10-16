#!/usr/bin/env bash
#
# Start the spectre-server-layer stack.
#
# There is deliberately no `export $(cat .env | xargs)` here. That idiom word-
# splits on whitespace, so any value containing a space, quote or newline is
# silently corrupted — and it is unnecessary, because Compose loads
# `configs/.env` on its own (the compose file lives in that directory).

set -euo pipefail

REPO_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cd "$REPO_DIR/configs"

command -v docker >/dev/null 2>&1 || { echo "error: docker is not installed" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "error: the 'docker compose' plugin (Compose v2) is required" >&2; exit 1; }

if [ ! -f .env ]; then
    cat >&2 <<'EOF'
error: configs/.env is missing.

Create it and set the two required secrets:

    cp configs/.env.example configs/.env
    # then edit configs/.env and set POSTGRES_PASSWORD and REDIS_PASSWORD
EOF
    exit 1
fi

echo "Starting the spectre-server-layer stack..."

# nginx will not start without a certificate; generation is idempotent.
"$REPO_DIR/gen-dev-cert.sh"

docker compose up -d --build

echo
docker compose ps

# Read the port from the running stack rather than guessing from the environment:
# .env is read by Compose, not by this shell.
PORT=$(docker compose port nginx 80 2>/dev/null | head -n1 | sed 's/.*://')
SPORT=$(docker compose port nginx 443 2>/dev/null | head -n1 | sed 's/.*://')
echo
echo "Landing page: http://localhost:${PORT:-8081}/"
echo "Secure:       https://localhost:${SPORT:-8443}/   (self-signed certificate)"
echo "Health:       ./status.sh     Logs: ./logs.sh"
