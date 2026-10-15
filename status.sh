#!/usr/bin/env bash
#
# Show the state of the server-layer stack.

set -uo pipefail

REPO_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cd "$REPO_DIR/configs" || exit 1

echo "Containers:"
echo "==========="
# -a so that crash-looping or exited containers are visible rather than absent.
docker compose ps -a

echo
echo "Health:"
echo "======="
# The published port comes from the running stack; .env is read by Compose, not
# by this shell, so ${NGINX_HTTP_PORT} would only ever be the fallback here.
PORT=$(docker compose port nginx 80 2>/dev/null | head -n1 | sed 's/.*://')
if ! curl -fsS --max-time 5 "http://localhost:${PORT:-8081}/ready" 2>/dev/null; then
    echo "  (no answer from the app through nginx)"
fi

echo
echo "Resource Usage:"
echo "==============="
# Unquoted on purpose: these are separate container IDs. With no IDs (nothing
# running) this reports on every container on the host, so don't call it then.
ids=$(docker compose ps -q)
if [ -n "$ids" ]; then
    # shellcheck disable=SC2086
    docker stats --no-stream $ids
else
    echo "  (nothing running)"
fi
