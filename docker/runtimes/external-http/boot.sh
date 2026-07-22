#!/bin/bash
set -euo pipefail

export SANCHO_RUNTIME="${SANCHO_RUNTIME:-external-http}"

export SANCHO_HOME="${SANCHO_HOME:-/root/.openclaw}"
NEXT_PORT="${PORT:-3000}"

if [ -x /opt/sancho-seed/docker/init-home.sh ]; then
  bash /opt/sancho-seed/docker/init-home.sh "$SANCHO_HOME"
fi

# Runtime-agnostic bootstrap shared with the entrypoint's openclaw path: config
# symlinks (workspace-sancho/clients.json -> ../config/…), MC_BASE, MC_ADMIN_TOKEN,
# APIFY_TOKEN. Without this, external-http booted with an empty client list and
# POST /api/clients/create → ENOENT 500 (SAN-485). SOURCED so its env exports reach
# the Next.js app started below.
if [ -f /opt/sancho-seed/docker/bootstrap-common.sh ]; then
  . /opt/sancho-seed/docker/bootstrap-common.sh "$SANCHO_HOME"
fi

# Runtime selection must not decide whether the shared Mission Control schema
# is current. This is the same self-gated, non-fatal migration used by the
# OpenClaw entrypoint.
if [ -n "${DATABASE_URL:-}" ]; then
  echo "[external-http boot] Checking local DB migrations..."
  ( cd /app/mc-nextjs && node scripts/migrate-local.mjs ) || true
fi

if [ -z "${SANCHO_EXTERNAL_GATEWAY_URL:-}${SANCHO_EXTERNAL_RUNTIME_URL:-}${HERMES_EXTERNAL_GATEWAY_URL:-}${HERMES_EXTERNAL_BASE_URL:-}${HERMES_EXTERNAL_URL:-}" ]; then
  echo "[external-http boot] ERROR: configure SANCHO_EXTERNAL_GATEWAY_URL (or legacy HERMES_EXTERNAL_GATEWAY_URL)"
  exit 1
fi

echo "[external-http boot] Starting Next.js Mission Control on :$NEXT_PORT..."
cd /app/mc-nextjs
MC_WORKSPACE="${MC_WORKSPACE:-$SANCHO_HOME/workspace-sancho}" \
NEXTAUTH_URL="${NEXTAUTH_URL:-${BASE_URL:-}}" \
node_modules/.bin/next start -p "$NEXT_PORT" &
NEXTJS_PID=$!

echo "[external-http boot] NextJS=$NEXTJS_PID, runtime gateway=external"

set +e
wait "$NEXTJS_PID"
EXIT_CODE=$?
set -e

echo "[external-http boot] Process exited with code $EXIT_CODE."
exit "$EXIT_CODE"
