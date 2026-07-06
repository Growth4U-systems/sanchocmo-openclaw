#!/bin/bash
# memory-index.sh — Auto-regenerate memory/INDEX.md
# Run: bash scripts/memory-index.sh

set -euo pipefail

WORKSPACE="${OPENCLAW_WORKSPACE:-$HOME/.openclaw/workspace-sancho}"
MEMORY_DIR="$WORKSPACE/memory"
INDEX_FILE="$MEMORY_DIR/INDEX.md"

cat > "$INDEX_FILE" << 'HEADER'
# Memory Index
> Auto-maintained by `scripts/memory-index.sh`.

## Structure
```
memory/
├── YYYY-MM-DD.md   ← Daily notes (flat, per openClaw convention)
├── topics/         ← Topic-specific deep dives
├── clients/        ← Per-client curated memory
├── archive/        ← Old daily notes (>30d) + monthly summaries
├── skills.md       ← Skills changelog
├── INDEX.md        ← This file
├── *.json          ← State trackers
└── *.sqlite        ← OpenClaw search indices (managed by system)
```

HEADER

# Daily notes (flat: memory/YYYY-MM-DD.md)
echo "## Daily Notes (memory/YYYY-MM-DD.md)" >> "$INDEX_FILE"
DAILY_COUNT=$(ls "$MEMORY_DIR/"20*.md 2>/dev/null | wc -l | tr -d ' ')
echo "Active: $DAILY_COUNT files" >> "$INDEX_FILE"
echo "" >> "$INDEX_FILE"
for f in $(ls -r "$MEMORY_DIR/"20*.md 2>/dev/null | head -5); do
    echo "- $(basename $f)" >> "$INDEX_FILE"
done
[ "$DAILY_COUNT" -gt 5 ] && echo "- ... and $((DAILY_COUNT - 5)) more" >> "$INDEX_FILE"
echo "" >> "$INDEX_FILE"

# Topics
echo "## Topic Notes (memory/topics/)" >> "$INDEX_FILE"
TOPIC_COUNT=$(ls "$MEMORY_DIR/topics/"*.md 2>/dev/null | wc -l | tr -d ' ')
echo "Total: $TOPIC_COUNT files" >> "$INDEX_FILE"
echo "" >> "$INDEX_FILE"
for f in $(ls -r "$MEMORY_DIR/topics/"*.md 2>/dev/null); do
    echo "- $(basename $f)" >> "$INDEX_FILE"
done
echo "" >> "$INDEX_FILE"

# Clients
echo "## Client Memory (memory/clients/)" >> "$INDEX_FILE"
for f in "$MEMORY_DIR/clients/"*.md; do
    [ -f "$f" ] || continue
    echo "- $(basename $f)" >> "$INDEX_FILE"
done
echo "" >> "$INDEX_FILE"

# State files
echo "## State Files (memory/*.json)" >> "$INDEX_FILE"
for f in "$MEMORY_DIR/"*.json; do
    [ -f "$f" ] || continue
    echo "- $(basename $f)" >> "$INDEX_FILE"
done
echo "" >> "$INDEX_FILE"

# Archive
echo "## Archive (memory/archive/)" >> "$INDEX_FILE"
ARCHIVE_COUNT=$(ls "$MEMORY_DIR/archive/"*.md 2>/dev/null | wc -l | tr -d ' ')
echo "Total: $ARCHIVE_COUNT files" >> "$INDEX_FILE"
echo "" >> "$INDEX_FILE"

echo "" >> "$INDEX_FILE"
echo "*Last updated: $(date +%Y-%m-%d\ %H:%M)*" >> "$INDEX_FILE"

echo "✅ INDEX.md regenerated ($DAILY_COUNT daily, $TOPIC_COUNT topics, $ARCHIVE_COUNT archived)"
