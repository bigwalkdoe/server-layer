#!/usr/bin/env bash
#
# End-to-end smoke test for the spectre-server-layer stack.
#
# Builds and runs the whole stack under an isolated Compose project name and a
# throwaway env file, asserts the observable contract of the running system,
# then tears everything down. It never reads or writes configs/.env, never
# touches a stack you already have running, and never leaves volumes behind.
#
# Requires: docker (with the compose plugin), curl, node.
#
# Usage:
#   ./smoke-test.sh            # full run
#   KEEP_UP=1 ./smoke-test.sh  # leave the stack running for inspection

set -uo pipefail

REPO_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
COMPOSE_FILE="$REPO_DIR/configs/docker-compose.yml"

PROJECT="spectre-server-layer-smoke-$$"
HTTP_PORT=${HTTP_PORT:-18081}
HTTPS_PORT=${HTTPS_PORT:-18443}
POSTGRES_PORT=${POSTGRES_PORT:-15435}
REDIS_PORT=${REDIS_PORT:-16379}
BASE="http://127.0.0.1:${HTTP_PORT}"
SECURE="https://127.0.0.1:${HTTPS_PORT}"

POSTGRES_PASSWORD="smoke-postgres-$$"
REDIS_PASSWORD="smoke-redis-$$"

TMP_ENV=$(mktemp -t spectre-server-layer-smoke-env.XXXXXX)
chmod 600 "$TMP_ENV"

pass=0
fail=0
failures=()

ok() { pass=$((pass + 1)); printf '  \033[32mok\033[0m   %s\n' "$1"; }
bad() {
  fail=$((fail + 1))
  failures+=("$1")
  printf '  \033[31mFAIL\033[0m %s\n' "$1"
  [ -n "${2:-}" ] && printf '       %s\n' "$(printf '%s' "$2" | head -c 400 | tr '\n' ' ')"
  return 0
}

expect_eq() { # expect_eq <name> <expected> <actual>
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected [$2], got [$3]"; fi
}

expect_contains() { # expect_contains <name> <haystack> <needle>
  case "$2" in
    *"$3"*) ok "$1" ;;
    *) bad "$1" "expected to contain [$3], got [$(printf '%s' "$2" | head -c 200 | tr '\n' ' ')]" ;;
  esac
}

expect_not_contains() { # expect_not_contains <name> <haystack> <needle>
  case "$2" in
    *"$3"*) bad "$1" "did not expect [$3] in [$(printf '%s' "$2" | head -c 200 | tr '\n' ' ')]" ;;
    *) ok "$1" ;;
  esac
}

abort() { printf '\n\033[31mfatal:\033[0m %s\n' "$1" >&2; exit 1; }

compose() { docker compose --project-name "$PROJECT" --env-file "$TMP_ENV" -f "$COMPOSE_FILE" "$@"; }
http_status() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$1"; }
http_body() { curl -s --max-time 10 "$1"; }
http_headers() { curl -s -D - -o /dev/null --max-time 10 "$1"; }

# Read a dot-path out of JSON on stdin (no jq dependency; the app pretty-prints).
jget() {
  node -e '
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => { raw += c; });
    process.stdin.on("end", () => {
      let value;
      try { value = JSON.parse(raw); } catch (e) { process.stdout.write("<<invalid-json>>"); return; }
      for (const key of process.argv[1].split(".")) {
        if (value === null || typeof value !== "object") { value = undefined; break; }
        value = value[key];
      }
      process.stdout.write(value === undefined ? "<<missing>>" : String(value));
    });
  ' "$1"
}

cleanup() {
  if [ "${KEEP_UP:-0}" = "1" ]; then
    printf '\nKEEP_UP=1: leaving project %s running; tear down with:\n  docker compose -p %s down -v\n' \
      "$PROJECT" "$PROJECT"
  else
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  rm -f "$TMP_ENV"
}
trap cleanup EXIT

printf 'spectre-server-layer smoke test (project %s)\n' "$PROJECT"
printf '%s\n' '---------------------------------------------------------------'

# ---------------------------------------------------------------- preflight --
for tool in docker curl node openssl; do
  command -v "$tool" >/dev/null 2>&1 || abort "required tool not found: $tool"
done
docker compose version >/dev/null 2>&1 || abort "docker compose plugin not available"
for port in "$HTTP_PORT" "$HTTPS_PORT" "$POSTGRES_PORT" "$REDIS_PORT"; do
  (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null && abort "host port $port is already in use"
done

# nginx will not start without a certificate. Generation is idempotent, so this
# is a no-op once the certificate exists.
"$REPO_DIR/gen-dev-cert.sh" >/dev/null || abort "could not generate the development TLS certificate"

CERT_FINGERPRINT_BEFORE=$(openssl x509 -in "$REPO_DIR/configs/nginx/certs/server.crt" -noout -fingerprint -sha256)
"$REPO_DIR/gen-dev-cert.sh" >/dev/null || abort "certificate generator failed on the second run"
CERT_FINGERPRINT_AFTER=$(openssl x509 -in "$REPO_DIR/configs/nginx/certs/server.crt" -noout -fingerprint -sha256)

GIT_BEFORE=$(cd "$REPO_DIR" && git status --porcelain 2>/dev/null)

cat >"$TMP_ENV" <<EOF
COMPOSE_PROJECT_NAME=$PROJECT
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD
NGINX_HTTP_PORT=$HTTP_PORT
NGINX_HTTPS_PORT=$HTTPS_PORT
POSTGRES_PORT=$POSTGRES_PORT
REDIS_PORT=$REDIS_PORT
EOF

# ------------------------------------------------- 1. static configuration --
printf '\nconfiguration\n'

compose config >/dev/null 2>&1 || abort "docker compose config rejected the compose file"
CONFIG_STDERR=$(compose config 2>&1 >/dev/null | grep -v '^$' || true)
if [ -n "$CONFIG_STDERR" ]; then
  bad "compose config emits no warnings" "$CONFIG_STDERR"
  printf '\n\033[31mrefusing to start a stack from a compose file that warns\033[0m\n'
  exit 1
fi
ok "compose config emits no warnings"

RESOLVED=$(compose config 2>/dev/null)
expect_not_contains "images are pinned (no :latest)" "$RESOLVED" ":latest"
expect_not_contains "the nginx-config named volume is gone" "$RESOLVED" "nginx-config"
expect_contains "nginx configs are bind-mounted from the repo" "$RESOLVED" "type: bind"
expect_contains "postgres password has no weak default" "$RESOLVED" "smoke-postgres-$$"
expect_not_contains "postgres default password is gone" "$RESOLVED" "apppass"
expect_contains "the HTTPS port is published" "$RESOLVED" "target: 443"
expect_contains "the TLS certificate directory is bind-mounted" "$RESOLVED" "configs/nginx/certs"
expect_not_contains "there is no stale 8443 mapping" "$RESOLVED" "published: \"8443\""

# --------------------------------------------------------- 2. bring it up ----
printf '\nstartup\n'

if ! UP_OUTPUT=$(compose up -d --build --wait --wait-timeout 180 2>&1); then
  bad "docker compose up reached a healthy state" "$UP_OUTPUT"
  printf '\n\033[31mcannot continue without a running stack\033[0m\n'
  compose ps 2>&1 | sed 's/^/       /'
  exit 1
fi
ok "docker compose up reached a healthy state"

RUNNING=$(compose ps --services --status running 2>/dev/null | sort | tr '\n' ' ')
for svc in nginx app postgres redis; do
  expect_contains "$svc is running" "$RUNNING" "$svc"
done
expect_not_contains "ollama is not started by default" "$RUNNING" "ollama"

# -------------------------------------------------- 3. edge (nginx) layer ----
printf '\nnginx\n'

expect_eq "GET /healthz is 200" 200 "$(http_status "$BASE/healthz")"
expect_eq "GET /healthz is a liveness probe only" "ok" "$(http_body "$BASE/healthz" | tr -d '\n')"

HOME_HTML=$(http_body "$BASE/")
expect_contains "GET / serves the repository's own index.html" "$HOME_HTML" "Spectre Server Layer"
expect_not_contains "GET / does not serve the stock nginx page" "$HOME_HTML" "Welcome to nginx"

expect_eq "GET /static/asset.txt is 200" 200 "$(http_status "$BASE/static/asset.txt")"
expect_contains "static content is served from the repo" "$(http_body "$BASE/static/asset.txt")" "Static asset"

HEADERS=$(http_headers "$BASE/")
expect_contains "security headers are present" "$HEADERS" "X-Content-Type-Options: nosniff"
expect_not_contains "server version is not disclosed" "$HEADERS" "Server: nginx/"

printf '\ntls\n'

# The certificate generator must be idempotent: re-running it must not replace
# a certificate that is already there.
expect_eq "gen-dev-cert.sh is idempotent" "$CERT_FINGERPRINT_BEFORE" "$CERT_FINGERPRINT_AFTER"

expect_eq "HTTPS GET /healthz is 200" 200 \
  "$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "$SECURE/healthz")"
expect_contains "HTTPS serves the repository's landing page" \
  "$(curl -sk --max-time 10 "$SECURE/")" "Spectre Server Layer"
expect_eq "HTTPS GET /health is proxied to the app" 200 \
  "$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "$SECURE/health")"
expect_eq "HTTPS /ready reports ready" "true" \
  "$(curl -sk --max-time 10 "$SECURE/ready" | jget ready)"
expect_eq "HTTPS static content is served" 200 \
  "$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "$SECURE/static/asset.txt")"

# Prove TLS is real and that nginx serves exactly the generated certificate.
#
# The fingerprint is the version-independent proof. openssl formats subject lines
# differently between releases ("CN = localhost" in 3.0, "CN=localhost" in 3.5),
# so the subject is compared with whitespace stripped rather than raw — matching
# the raw text made this assertion depend on the openssl version.
SERVED_CERT=$(openssl s_client -connect "127.0.0.1:${HTTPS_PORT}" -servername localhost </dev/null 2>/dev/null \
  | openssl x509 -noout -fingerprint -sha256 -subject -ext subjectAltName 2>/dev/null || true)

SERVED_FP=$(printf '%s\n' "$SERVED_CERT" | sed -n 's/.*[Ff]ingerprint=//p' | tr -d ' \r' | head -n1)
FILE_FP=$(openssl x509 -in "$REPO_DIR/configs/nginx/certs/server.crt" -noout -fingerprint -sha256 \
  | sed -n 's/.*[Ff]ingerprint=//p' | tr -d ' \r')

expect_eq "nginx serves exactly the generated certificate" "$FILE_FP" "$SERVED_FP"
expect_contains "the served certificate is issued for localhost" \
  "$(printf '%s' "$SERVED_CERT" | tr -d ' ')" "CN=localhost"
expect_contains "the certificate covers 127.0.0.1 via SAN" "$SERVED_CERT" "127.0.0.1"

TLS_VERSION=$(openssl s_client -connect "127.0.0.1:${HTTPS_PORT}" -servername localhost </dev/null 2>/dev/null \
  | grep -oE 'TLSv1\.[23]' | head -n1 || true)
case "$TLS_VERSION" in
  TLSv1.2|TLSv1.3) ok "negotiated $TLS_VERSION" ;;
  *) bad "TLS handshake negotiates TLS 1.2 or 1.3" "got [${TLS_VERSION:-none}]" ;;
esac

# Verification must be genuinely possible: trusting the certificate directly has
# to succeed, which proves the chain and SANs are valid rather than merely
# bypassed with -k.
expect_eq "curl verifies the certificate when given it directly" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
     --cacert "$REPO_DIR/configs/nginx/certs/server.crt" "$SECURE/healthz")"

# --------------------------------------------------------- 4. application ----
printf '\napplication\n'

expect_eq "GET /health is proxied to the app" 200 "$(http_status "$BASE/health")"
expect_eq "GET /ready reports ready" "true" "$(http_body "$BASE/ready" | jget ready)"
expect_eq "app reports postgres reachable" "true" "$(http_body "$BASE/api/info" | jget database.reachable)"
expect_eq "app reports redis reachable" "true" "$(http_body "$BASE/api/info" | jget redis.reachable)"
expect_eq "unknown paths are a JSON 404" 404 "$(http_status "$BASE/definitely-not-a-route")"

FIRST=$(http_body "$BASE/api/data")
SECOND=$(http_body "$BASE/api/data")
expect_eq "/api/data is a cache miss first" "false" "$(printf '%s' "$FIRST" | jget cached)"
expect_eq "/api/data is a cache hit second" "true" "$(printf '%s' "$SECOND" | jget cached)"
expect_eq "/api/data cache returns the same payload" \
  "$(printf '%s' "$FIRST" | jget random)" "$(printf '%s' "$SECOND" | jget random)"

# ---------------------------------------------------- 5. backend security ----
printf '\nbackend security\n'

UNAUTH=$(compose exec -T redis redis-cli ping 2>&1)
expect_not_contains "redis rejects unauthenticated clients" "$UNAUTH" "PONG"
AUTH=$(compose exec -T redis redis-cli --no-auth-warning -a "$REDIS_PASSWORD" ping 2>&1)
expect_contains "redis accepts the configured password" "$AUTH" "PONG"

# Password authentication must be tested from *outside* the postgres container.
# The upstream image trusts `local` and `127.0.0.1/32` connections from within
# its own container, so a socket or loopback check there passes no matter what
# the password is. Every other source (including the app) hits the
# `host all all all scram-sha-256` rule.
pg_query() {
  docker run --rm --network "${PROJECT}_app-network" \
    -e PGPASSWORD="$1" postgres:17-alpine \
    psql -h postgres -U appuser -d appdb -tAc 'select 1' 2>&1
}
WEAK=$(pg_query apppass)
expect_contains "postgres rejects the old default password" "$WEAK" "password authentication failed"
STRONG=$(pg_query "$POSTGRES_PASSWORD")
expect_eq "postgres accepts the configured password" "1" "$(printf '%s' "$STRONG" | tr -d '[:space:]')"

APP_BINDINGS=$(docker inspect -f '{{json .HostConfig.PortBindings}}' "$(compose ps -q app)")
expect_not_contains "the app is not published to the host" "$APP_BINDINGS" "HostPort"
PG_BINDINGS=$(docker inspect -f '{{json .HostConfig.PortBindings}}' "$(compose ps -q postgres)")
expect_contains "postgres is bound to loopback only" "$PG_BINDINGS" '"HostIp":"127.0.0.1"'
REDIS_BINDINGS=$(docker inspect -f '{{json .HostConfig.PortBindings}}' "$(compose ps -q redis)")
expect_contains "redis is bound to loopback only" "$REDIS_BINDINGS" '"HostIp":"127.0.0.1"'

NGINX_ID=$(compose ps -q nginx)
SECURITY_OPT=$(docker inspect -f '{{json .HostConfig.SecurityOpt}}' "$NGINX_ID" 2>/dev/null)
expect_contains "nginx runs with no-new-privileges" "$SECURITY_OPT" "no-new-privileges"
CAP_DROP=$(docker inspect -f '{{json .HostConfig.CapDrop}}' "$NGINX_ID" 2>/dev/null)
expect_contains "nginx drops all capabilities" "$CAP_DROP" "ALL"
NGINX_ROOTFS=$(docker inspect -f '{{.HostConfig.ReadonlyRootfs}}' "$NGINX_ID" 2>/dev/null)
expect_eq "nginx root filesystem is read-only" "true" "$NGINX_ROOTFS"

# ----------------------------------------------------------- 6. hygiene ------
printf '\nhygiene\n'

GIT_AFTER=$(cd "$REPO_DIR" && git status --porcelain 2>/dev/null)
expect_eq "the smoke test did not modify the working tree" "$GIT_BEFORE" "$GIT_AFTER"

# ------------------------------------------------------------- summary -------
printf '%s\n' '---------------------------------------------------------------'
printf 'passed: %d   failed: %d\n' "$pass" "$fail"
if [ "$fail" -gt 0 ]; then
  printf '\nfailures:\n'
  for name in "${failures[@]}"; do printf '  - %s\n' "$name"; done
  exit 1
fi
printf '\n\033[32mall checks passed\033[0m\n'
