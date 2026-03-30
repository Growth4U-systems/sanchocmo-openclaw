#!/bin/bash
set -e

cd /root/.openclaw

# Ensure openclaw.json exists
if [ ! -f openclaw.json ]; then
  echo "[entrypoint] ERROR: openclaw.json not found."
  echo "  Copy from example: cp config/openclaw.json.example openclaw.json"
  echo "  Then edit with your gateway token and API keys."
  exit 1
fi

# Install Node dependencies if needed (e.g., ws for MC server)
if [ -f workspace-sancho/package.json ] && [ ! -d workspace-sancho/node_modules ]; then
  echo "[entrypoint] Installing Node dependencies..."
  (cd workspace-sancho && npm install --production --quiet)
fi

# Start OpenClaw gateway in background (foreground mode, no systemd)
echo "[entrypoint] Starting OpenClaw gateway..."
openclaw gateway run &
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
