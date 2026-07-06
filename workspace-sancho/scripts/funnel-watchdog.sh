#!/bin/bash
# Tailscale Funnel Watchdog
# Re-enables funnel if it reverts to tailnet-only

STATUS=$(tailscale funnel status 2>&1)

if echo "$STATUS" | grep -q "tailnet only"; then
  echo "$(date): Funnel down — re-enabling..."
  tailscale serve reset 2>/dev/null
  tailscale funnel --bg --set-path / http://127.0.0.1:18789 2>/dev/null
  tailscale funnel --bg --set-path /mc http://127.0.0.1:18790 2>/dev/null
  echo "$(date): Funnel re-enabled"
else
  echo "$(date): Funnel OK"
fi
