#!/usr/bin/env bash
# snapshot-data.sh — Periodic snapshot of instance data (private, gitignored)
# Cron: every 3 hours
#
# Creates a timestamped tarball of all instance-specific data that git
# doesn't track: brand data, agent memory, config, SQLite databases.
# Stores snapshots on the Hetzner volume at /mnt/data/snapshots/.
# Keeps the last 24 snapshots (~3 days at 3h intervals).

set -euo pipefail

OPENCLAW_ROOT="${OPENCLAW_HOME:-$HOME/.openclaw}"
SNAPSHOT_DIR="${SNAPSHOT_DATA_DIR:-/mnt/data/snapshots}"
STATE_FILE="$OPENCLAW_ROOT/workspace-cervantes/memory/snapshot-data-state.json"
TIMESTAMP=$(date '+%Y-%m-%d_%H%M')
START_SEC=$(date +%s)
MAX_SNAPSHOTS=24

cd "$OPENCLAW_ROOT"

# --- 1. Ensure snapshot directory exists ---
if [ ! -d "$SNAPSHOT_DIR" ]; then
  mkdir -p "$SNAPSHOT_DIR" 2>/dev/null || {
    echo "ERROR: Cannot create snapshot dir $SNAPSHOT_DIR"
    echo "  Is the Hetzner volume mounted at /mnt/data?"
    echo "  Override with: SNAPSHOT_DATA_DIR=/path/to/dir"
    exit 1
  }
fi

# --- 2. SQLite safe copy (atomic, avoids write locks) ---
SQLITE_TMP=$(mktemp -d)
for db in "$OPENCLAW_ROOT"/*.sqlite; do
  [ -f "$db" ] || continue
  DB_NAME=$(basename "$db")
  sqlite3 "$db" ".backup '$SQLITE_TMP/$DB_NAME'" 2>/dev/null || cp "$db" "$SQLITE_TMP/$DB_NAME"
done

# --- 3. Create tarball ---
SNAPSHOT_FILE="$SNAPSHOT_DIR/snapshot-$TIMESTAMP.tar.gz"

tar czf "$SNAPSHOT_FILE" \
  --warning=no-file-changed \
  --exclude='*.sqlite' \
  -C "$OPENCLAW_ROOT" \
  .env \
  config/instance.json \
  config/clients.json \
  workspace-sancho/brand/ \
  workspace-sancho/memory/ \
  workspace-cervantes/memory/ \
  cron/jobs.json \
  2>/dev/null || true

# Append SQLite backups to the tarball
if ls "$SQLITE_TMP"/*.sqlite 1>/dev/null 2>&1; then
  tar rzf "$SNAPSHOT_FILE" -C "$SQLITE_TMP" . 2>/dev/null || true
fi

rm -rf "$SQLITE_TMP"

# --- 4. Rotate old snapshots (keep last $MAX_SNAPSHOTS) ---
SNAPSHOT_COUNT=$(ls -1 "$SNAPSHOT_DIR"/snapshot-*.tar.gz 2>/dev/null | wc -l)
if [ "$SNAPSHOT_COUNT" -gt "$MAX_SNAPSHOTS" ]; then
  ls -1t "$SNAPSHOT_DIR"/snapshot-*.tar.gz | tail -n +$((MAX_SNAPSHOTS + 1)) | xargs rm -f
fi

# --- 5. Update state ---
END_SEC=$(date +%s)
DURATION=$((END_SEC - START_SEC))
SNAPSHOT_SIZE=$(du -sh "$SNAPSHOT_FILE" 2>/dev/null | cut -f1 || echo "unknown")

mkdir -p "$(dirname "$STATE_FILE")"
cat > "$STATE_FILE" << EOF
{
  "lastSnapshot": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "lastSnapshotLocal": "$TIMESTAMP",
  "snapshotFile": "$SNAPSHOT_FILE",
  "snapshotSize": "$SNAPSHOT_SIZE",
  "durationSec": $DURATION,
  "snapshotsRetained": $MAX_SNAPSHOTS,
  "status": "ok"
}
EOF

echo "Snapshot complete: $SNAPSHOT_FILE ($SNAPSHOT_SIZE, ${DURATION}s)"
