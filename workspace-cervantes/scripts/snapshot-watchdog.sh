#!/usr/bin/env bash
# snapshot-watchdog.sh — Alert if the data snapshot is stale.
# Cron: hourly (the snapshot itself runs every 3h, so a 6h threshold gives
# headroom for one missed cycle before alerting).
#
# Reads workspace-cervantes/memory/snapshot-data-state.json and sends a
# Discord alert via discord-alert.sh when lastSnapshot is too old.

set -euo pipefail

OPENCLAW_ROOT="${OPENCLAW_HOME:-$HOME/.openclaw}"
STATE_FILE="$OPENCLAW_ROOT/workspace-cervantes/memory/snapshot-data-state.json"
ALERT_SCRIPT="$OPENCLAW_ROOT/workspace-cervantes/scripts/discord-alert.sh"
THRESHOLD_SEC=21600  # 6 hours

# Source .env for the Discord webhook
[ -f "$OPENCLAW_ROOT/.env" ] && set -a && source "$OPENCLAW_ROOT/.env" 2>/dev/null && set +a || true

# --- Check 1: state file must exist ---
if [ ! -f "$STATE_FILE" ]; then
  if [ -x "$ALERT_SCRIPT" ]; then
    "$ALERT_SCRIPT" "🚨" "Snapshot Watchdog — $(hostname)" \
      "snapshot-data-state.json missing. Has snapshot-data.sh ever run? Check /var/log/snapshot-data.log."
  fi
  echo "ERROR: state file missing: $STATE_FILE" >&2
  exit 1
fi

# --- Check 2: lastSnapshot timestamp must be recent ---
LAST_TS=$(python3 -c "
import json, datetime, sys
with open('$STATE_FILE') as f:
    state = json.load(f)
last = state.get('lastSnapshot', '')
if not last:
    print(0); sys.exit(0)
dt = datetime.datetime.fromisoformat(last.replace('Z', '+00:00'))
print(int(dt.timestamp()))
" 2>/dev/null || echo 0)

NOW_TS=$(date +%s)
DIFF=$(( NOW_TS - LAST_TS ))

if [ "$DIFF" -gt "$THRESHOLD_SEC" ]; then
  HOURS=$(( DIFF / 3600 ))
  if [ -x "$ALERT_SCRIPT" ]; then
    "$ALERT_SCRIPT" "🚨" "Snapshot Watchdog — $(hostname)" \
      "Last data snapshot was ${HOURS}h ago (threshold: 6h). Check /var/log/snapshot-data.log and verify the cron entry: \`crontab -l | grep snapshot\`."
  fi
  echo "ALERT: snapshot is ${HOURS}h stale" >&2
  exit 1
fi

echo "OK: last snapshot was $(( DIFF / 60 ))min ago"
