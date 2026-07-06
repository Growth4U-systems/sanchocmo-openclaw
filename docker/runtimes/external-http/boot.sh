#!/bin/bash
set -euo pipefail

export SANCHO_RUNTIME="${SANCHO_RUNTIME:-external-http}"

SANCHO_HOME="${SANCHO_HOME:-/root/.openclaw}"
NEXT_PORT="${PORT:-3000}"

if [ -x /opt/sancho-seed/docker/init-home.sh ]; then
  bash /opt/sancho-seed/docker/init-home.sh "$SANCHO_HOME"
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
