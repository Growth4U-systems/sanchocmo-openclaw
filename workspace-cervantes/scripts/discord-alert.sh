#!/usr/bin/env bash
# Usage: discord-alert.sh "emoji" "title" "body"
# Sends a formatted alert to #cervantes-admin via Discord webhook.
# Requires DISCORD_WEBHOOK_CERVANTES env var.

set -euo pipefail

EMOJI="${1:-⚠️}"
TITLE="${2:-Alert}"
BODY="${3:-No details provided}"

WEBHOOK_URL="${DISCORD_WEBHOOK_CERVANTES:-}"
if [ -z "$WEBHOOK_URL" ]; then
  echo "[discord-alert] DISCORD_WEBHOOK_CERVANTES not set, skipping" >&2
  exit 0
fi

# Build JSON payload safely using Python
PAYLOAD=$(python3 -c "
import json, sys
content = sys.argv[1] + ' **' + sys.argv[2] + '**\n\n' + sys.argv[3]
print(json.dumps({'content': content}))
" "$EMOJI" "$TITLE" "$BODY")

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "$WEBHOOK_URL")

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "[discord-alert] Sent OK ($HTTP_CODE)"
else
  echo "[discord-alert] Failed ($HTTP_CODE)" >&2
fi
