#!/bin/bash
set -e

cd /root/.openclaw

# Start OpenClaw gateway in background (foreground mode, no systemd)
echo "[entrypoint] Starting OpenClaw gateway..."
openclaw gateway &
GATEWAY_PID=$!

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
echo "[entrypoint] Gateway ready (PID $GATEWAY_PID)."

# Start MC server in background
echo "[entrypoint] Starting Mission Control on :18790..."
node workspace-sancho/scripts/mc-server.js &
MC_PID=$!

echo "[entrypoint] All services running. Gateway=$GATEWAY_PID MC=$MC_PID"

# Wait for either process to exit — if one dies, container stops
wait -n $GATEWAY_PID $MC_PID
EXIT_CODE=$?
echo "[entrypoint] A process exited with code $EXIT_CODE. Shutting down."
kill $GATEWAY_PID $MC_PID 2>/dev/null
exit $EXIT_CODE
