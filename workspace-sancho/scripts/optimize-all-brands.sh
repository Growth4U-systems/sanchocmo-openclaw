#!/bin/bash
# optimize-all-brands.sh — Find and compress all unoptimized PNG/JPG across brand/
# Designed to run via cron. Skips originals/ directories.
set -euo pipefail

WORKSPACE="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$WORKSPACE/scripts/optimize-image.sh"
COUNT=0
SAVED=0

while IFS= read -r -d '' file; do
  ORIG_SIZE=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file")
  "$SCRIPT" "$file" 82 1200
  NAME="${file%.*}"
  WEBP="$NAME.webp"
  if [[ -f "$WEBP" ]]; then
    NEW_SIZE=$(stat -f%z "$WEBP" 2>/dev/null || stat -c%s "$WEBP")
    SAVED=$(( SAVED + ORIG_SIZE - NEW_SIZE ))
    COUNT=$(( COUNT + 1 ))
  fi
done < <(find "$WORKSPACE/brand" -type f \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" \) -not -path "*/originals/*" -not -path "*/_archive/*" -not -path "*/_backups/*" -print0)

if (( COUNT > 0 )); then
  echo "📊 Optimized $COUNT images, saved $(( SAVED/1024/1024 )) MB"
else
  echo "✅ No unoptimized images found"
fi
