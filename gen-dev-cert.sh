#!/usr/bin/env bash
#
# Generate the self-signed TLS certificate used by the development stack.
#
# The certificate is written to configs/nginx/certs/ and mounted read-only into
# nginx. It is gitignored: never commit a private key.
#
# Idempotent — if a certificate already exists it is left alone. Delete the
# files (or run with FORCE=1) to regenerate.
#
# Requires openssl. ./start.sh and ./smoke-test.sh call this automatically, so a
# fresh clone works without a manual step.

set -euo pipefail

REPO_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CERT_DIR="$REPO_DIR/configs/nginx/certs"
CRT="$CERT_DIR/server.crt"
KEY="$CERT_DIR/server.key"
DAYS=${CERT_DAYS:-3650}

if [ "${FORCE:-0}" != "1" ] && [ -s "$CRT" ] && [ -s "$KEY" ]; then
    echo "TLS certificate already present: $CRT"
    echo "Delete it, or run FORCE=1 $0, to regenerate."
    exit 0
fi

command -v openssl >/dev/null 2>&1 || {
    echo "error: openssl is required to generate the development certificate" >&2
    exit 1
}

mkdir -p "$CERT_DIR"

# SANs are what modern clients actually check; CN alone is ignored by browsers.
openssl req -x509 -newkey rsa:2048 -nodes \
    -days "$DAYS" \
    -keyout "$KEY" \
    -out "$CRT" \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1" \
    -addext "basicConstraints=critical,CA:FALSE" \
    -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
    -addext "extendedKeyUsage=serverAuth" \
    >/dev/null 2>&1

chmod 600 "$KEY"
chmod 644 "$CRT"

echo "Generated a self-signed development certificate:"
echo "  certificate: $CRT"
echo "  private key: $KEY  (mode 600, gitignored)"
echo "  valid for:   $DAYS days, SANs: localhost, 127.0.0.1, ::1"
echo
echo "Browsers will warn until you trust it. This certificate is for local"
echo "development only — replace it with a real one before exposing the stack."
