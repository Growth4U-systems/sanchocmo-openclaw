#!/bin/bash
set -e

cd /root/.openclaw

echo "[entrypoint] Starting OpenClaw gateway..."
openclaw daemon start

# Wait for gateway to be ready (max 60s)
echo "[entrypoint] Waiting for gateway on :18789..."
TRIES=0
until curl -sf http://localhost:18789/healthz > /dev/null 2>&1; do
  TRIES=$((TRIES + 1))
  if [ $TRIES -ge 30 ]; then
    echo "[entrypoint] ERROR: Gateway did not start after 60s"
    exit 1
  fi
  sleep 2
done
echo "[entrypoint] Gateway ready."

# Start MC server in foreground (keeps container alive)
echo "[entrypoint] Starting Mission Control on :18790..."
exec node workspace-sancho/scripts/mc-server.js
