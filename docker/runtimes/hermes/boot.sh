#!/bin/bash
set -euo pipefail

export SANCHO_RUNTIME="${SANCHO_RUNTIME:-hermes}"

export SANCHO_HOME="${SANCHO_HOME:-/root/.openclaw}"
NEXT_PORT="${PORT:-3000}"
HERMES_GATEWAY_COMMAND="${HERMES_GATEWAY_COMMAND:-}"
HERMES_BRIDGE_ENABLED="${HERMES_BRIDGE_ENABLED:-0}"
HERMES_BRIDGE_PORT="${HERMES_BRIDGE_PORT:-18795}"

if [ -x /opt/sancho-seed/docker/init-home.sh ]; then
  bash /opt/sancho-seed/docker/init-home.sh "$SANCHO_HOME"
fi

# Runtime-agnostic bootstrap shared with the entrypoint's openclaw path: config
# symlinks (workspace-sancho/clients.json -> ../config/…), MC_BASE, MC_ADMIN_TOKEN,
# APIFY_TOKEN. Without this, hermes booted with an empty client list and POST
# /api/clients/create → ENOENT 500 (SAN-485). SOURCED so its env exports reach the
# bridge and the Next.js app started below.
if [ -f /opt/sancho-seed/docker/bootstrap-common.sh ]; then
  . /opt/sancho-seed/docker/bootstrap-common.sh "$SANCHO_HOME"
fi

# Keep the runtime-neutral data plane aligned with the OpenClaw boot path.
# The migrator self-skips managed/Neon databases and is non-fatal for a local
# database that is still unavailable.
if [ -n "${DATABASE_URL:-}" ]; then
  echo "[hermes boot] Checking local DB migrations..."
  ( cd /app/mc-nextjs && node scripts/migrate-local.mjs ) || true
fi

BRIDGE_PID=""
if [ "$HERMES_BRIDGE_ENABLED" = "1" ]; then
  export HERMES_GATEWAY_URL="${HERMES_GATEWAY_URL:-http://127.0.0.1:${HERMES_BRIDGE_PORT}}"
  export SANCHO_WEBHOOK_URL="${SANCHO_WEBHOOK_URL:-http://127.0.0.1:${NEXT_PORT}/api/chat/webhook}"
  export SANCHO_CONTEXT_PACK_URL="${SANCHO_CONTEXT_PACK_URL:-http://127.0.0.1:${NEXT_PORT}/api/chat/context-pack}"
  echo "[hermes boot] Starting Sancho Hermes bridge on :$HERMES_BRIDGE_PORT..."
  node /opt/sancho-seed/docker/runtimes/hermes/bridge.mjs &
  BRIDGE_PID=$!
fi

if [ -z "${HERMES_GATEWAY_URL:-}${HERMES_BASE_URL:-}${HERMES_URL:-}${HERMES_GATEWAY_COMMAND:-}" ]; then
  echo "[hermes boot] ERROR: configure HERMES_GATEWAY_URL/HERMES_BASE_URL or HERMES_GATEWAY_COMMAND"
  exit 1
fi

HERMES_PID=""
if [ -n "$HERMES_GATEWAY_COMMAND" ]; then
  echo "[hermes boot] Starting Hermes gateway command..."
  cd "$SANCHO_HOME"
  bash -lc "$HERMES_GATEWAY_COMMAND" &
  HERMES_PID=$!
fi

echo "[hermes boot] Starting Next.js Mission Control on :$NEXT_PORT..."
cd /app/mc-nextjs
MC_WORKSPACE="${MC_WORKSPACE:-$SANCHO_HOME/workspace-sancho}" \
NEXTAUTH_URL="${NEXTAUTH_URL:-${BASE_URL:-}}" \
node_modules/.bin/next start -p "$NEXT_PORT" &
NEXTJS_PID=$!

echo "[hermes boot] All services running. Hermes=${HERMES_PID:-external} Bridge=${BRIDGE_PID:-external} NextJS=$NEXTJS_PID"

set +e
if [ -n "$HERMES_PID" ] && [ -n "$BRIDGE_PID" ]; then
  wait -n "$HERMES_PID" "$BRIDGE_PID" "$NEXTJS_PID"
elif [ -n "$HERMES_PID" ]; then
  wait -n "$HERMES_PID" "$NEXTJS_PID"
elif [ -n "$BRIDGE_PID" ]; then
  wait -n "$BRIDGE_PID" "$NEXTJS_PID"
else
  wait "$NEXTJS_PID"
fi
EXIT_CODE=$?
set -e

echo "[hermes boot] A process exited with code $EXIT_CODE. Shutting down."
kill ${HERMES_PID:-} ${BRIDGE_PID:-} "$NEXTJS_PID" 2>/dev/null || true
exit "$EXIT_CODE"
