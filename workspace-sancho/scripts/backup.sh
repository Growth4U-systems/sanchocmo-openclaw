#!/usr/bin/env bash
# T-020: Backup automático de datos de cliente (git-based)
# Ejecuta: ./scripts/backup.sh
# Cron: 03:00 diario via LaunchAgent

set -euo pipefail

WORKSPACE="$HOME/.openclaw/workspace-sancho"
STATE_FILE="$WORKSPACE/memory/backup-state.json"
LOG_FILE="$WORKSPACE/memory/backup.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
START_SEC=$(date +%s)

cd "$WORKSPACE"

# --- 1. Ensure git repo ---
if [ ! -d .git ]; then
  git init
  echo "🆕 Git repo initialized in $WORKSPACE"
fi

# --- 2. Ensure .gitignore ---
cat > .gitignore << 'EOF'
node_modules/
.cache/
*.log
skills.bak.*
*.jsonl
.git-backup-temp
EOF

# --- 3. Stage files ---
git add -f .gitignore
# Add directories (ignore if missing)
for dir in brand/ campaigns/ memory/ intelligence/ scripts/; do
  [ -d "$dir" ] && git add "$dir" 2>/dev/null || true
done
# Add specific files
for f in TASKS.md MEMORY.md; do
  [ -f "$f" ] && git add "$f" 2>/dev/null || true
done
# Add root-level json files
git add *.json 2>/dev/null || true

# --- 4. Commit ---
if git diff --cached --quiet 2>/dev/null; then
  echo "ℹ️  No changes to backup at $TIMESTAMP"
  CHANGES=0
else
  FILE_COUNT=$(git diff --cached --name-only | wc -l | tr -d ' ')
  git commit -m "backup $TIMESTAMP" --quiet
  CHANGES=$FILE_COUNT
  echo "✅ Backup committed: $TIMESTAMP ($CHANGES files)"
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

# --- 7. Alert if >48h since last successful backup ---
if [ -f "$STATE_FILE" ]; then
  LAST_BACKUP=$(python3 -c "
import json, sys
from datetime import datetime, timezone, timedelta
try:
    d = json.load(open('$STATE_FILE'))
    lb = datetime.fromisoformat(d['lastBackup'].replace('Z','+00:00'))
    now = datetime.now(timezone.utc)
    if (now - lb) > timedelta(hours=48):
        print('ALERT')
    else:
        print('OK')
except:
    print('ALERT')
" 2>/dev/null)
  if [ "$LAST_BACKUP" = "ALERT" ]; then
    echo "⚠️  WARNING: >48h since last successful backup!"
    # This will be picked up by the healthcheck cron for #admin alert
  fi
fi

echo "📦 Backup complete (${DURATION}s)"
