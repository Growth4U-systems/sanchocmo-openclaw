#!/usr/bin/env bash
# Backup: commit + push entire ~/.openclaw to GitHub
# Cron: 03:00 diario

set -euo pipefail

OPENCLAW_ROOT="${OPENCLAW_HOME:-$HOME/.openclaw}"

# Source env vars for webhook
[ -f "$OPENCLAW_ROOT/.env" ] && source "$OPENCLAW_ROOT/.env" 2>/dev/null || true

STATE_FILE="$OPENCLAW_ROOT/workspace-sancho/memory/backup-state.json"
LOG_FILE="$OPENCLAW_ROOT/workspace-sancho/memory/backup.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
START_SEC=$(date +%s)

cd "$OPENCLAW_ROOT"

# --- 1. Ensure git repo + remote ---
if [ ! -d .git ]; then
  echo "❌ No git repo at $OPENCLAW_ROOT"
  exit 1
fi

# --- 2. Stage all changes ---
git add -A

# --- 3. Commit ---
if git diff --cached --quiet 2>/dev/null; then
  echo "ℹ️  No changes to backup at $TIMESTAMP"
  CHANGES=0
else
  FILE_COUNT=$(git diff --cached --name-only | wc -l | tr -d ' ')
  git commit -m "backup $TIMESTAMP" --quiet
  CHANGES=$FILE_COUNT
  echo "✅ Backup committed: $TIMESTAMP ($CHANGES files)"
fi

# --- 4. Push to remote ---
if git remote get-url origin &>/dev/null; then
  BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "main")
  git push origin "$BRANCH" --quiet 2>/dev/null && echo "☁️ Pushed to GitHub ($BRANCH)" || echo "⚠️ Push failed (will retry next backup)"
fi

# --- 5. Update state ---
END_SEC=$(date +%s)
DURATION=$((END_SEC - START_SEC))
COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "none")

mkdir -p "$(dirname "$STATE_FILE")"
cat > "$STATE_FILE" << EOF
{
  "lastBackup": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "lastBackupLocal": "$TIMESTAMP",
  "commitHash": "$COMMIT_HASH",
  "filesChanged": $CHANGES,
  "durationSec": $DURATION,
  "status": "ok"
}
EOF

# --- 6. Append log ---
echo "[$TIMESTAMP] commit=$COMMIT_HASH changes=$CHANGES duration=${DURATION}s" >> "$LOG_FILE"

echo "📦 Backup complete (${DURATION}s)"

# --- Discord webhook fallback (runs without LLM) ---
ALERT_SCRIPT="$OPENCLAW_ROOT/workspace-cervantes/scripts/discord-alert.sh"
if [ -f "$ALERT_SCRIPT" ] && [ -n "${DISCORD_WEBHOOK_CERVANTES:-}" ]; then
  # Alert if last backup > 48h
  if [ -f "$STATE_FILE" ]; then
    LAST_TS=$(python3 -c "
import json, datetime
with open('$STATE_FILE') as f:
    state = json.load(f)
last = state.get('lastBackup', '')
if last:
    dt = datetime.datetime.fromisoformat(last.replace('Z', '+00:00'))
    print(int(dt.timestamp()))
else:
    print(0)
" 2>/dev/null || echo 0)
    NOW_TS=$(date +%s)
    DIFF=$(( NOW_TS - LAST_TS ))
    if [ "$DIFF" -gt 172800 ]; then
      "$ALERT_SCRIPT" "⚠️" "Backup Warning — $(date +%Y-%m-%d)" "Last backup was more than 48h ago."
    fi
  fi
fi
