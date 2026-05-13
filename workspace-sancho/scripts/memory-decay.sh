#!/bin/bash
# memory-decay.sh — Score memory files by relevance/recency
# Identifies topic notes not referenced in 60+ days for archival proposal
# Run: bash scripts/memory-decay.sh

set -euo pipefail

WORKSPACE="${OPENCLAW_WORKSPACE:-$HOME/.openclaw/workspace-sancho}"
TOPICS_DIR="$WORKSPACE/memory/topics"
ARCHIVE_DIR="$WORKSPACE/memory/archive"

echo "🧹 Memory Decay Analysis — $(date +%Y-%m-%d)"
echo ""

STALE_COUNT=0
STALE_FILES=""

CUTOFF_EPOCH=$(date -v-60d +%s 2>/dev/null || date -d "60 days ago" +%s)

echo "Files older than 60 days in topics/:"
echo ""

for f in "$TOPICS_DIR"/*.md; do
    [ -f "$f" ] || continue
    fname=$(basename "$f")
    
    # Get file modification time
    FMTIME=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f")
    
    if [ "$FMTIME" -lt "$CUTOFF_EPOCH" ]; then
        # Check if referenced in recent daily notes (last 30 days)
        RECENT_REFS=$(grep -rl "$fname" "$WORKSPACE/memory/" --include="20*.md" 2>/dev/null | wc -l | tr -d ' ')
        BRAND_REFS=$(grep -rl "$fname" "$WORKSPACE/brand/" 2>/dev/null | wc -l | tr -d ' ')
        
        TOTAL_REFS=$((RECENT_REFS + BRAND_REFS))
        FDATE=$(date -r "$FMTIME" +%Y-%m-%d 2>/dev/null || date -d @"$FMTIME" +%Y-%m-%d)
        FSIZE=$(wc -c < "$f" | tr -d ' ')
        
        if [ "$TOTAL_REFS" -eq 0 ]; then
            echo "  ⚠️  $fname (last modified: $FDATE, ${FSIZE}B, 0 refs) → CANDIDATE for archive"
            STALE_COUNT=$((STALE_COUNT + 1))
            STALE_FILES="$STALE_FILES $fname"
        else
            echo "  ✅ $fname (last modified: $FDATE, refs: $TOTAL_REFS) → still referenced"
        fi
    fi
done

echo ""
echo "Summary: $STALE_COUNT stale files (unreferenced, >60d old)"

if [ "$STALE_COUNT" -gt 0 ]; then
    echo ""
    echo "To archive these files, run:"
    for fname in $STALE_FILES; do
        echo "  mv \"$TOPICS_DIR/$fname\" \"$ARCHIVE_DIR/\""
    done
fi

echo ""
echo "Done."
