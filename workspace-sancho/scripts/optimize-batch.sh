#!/usr/bin/env bash
# optimize-batch.sh — Compress all PNG/JPG in a directory to WebP
# Usage: optimize-batch.sh <directory> [quality] [max_width]
# Example: optimize-batch.sh brand/growth4u/visual-identity/mockups 82 1200

set -euo pipefail

DIR="$1"
QUALITY="${2:-82}"
MAX_WIDTH="${3:-1200}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ ! -d "$DIR" ]]; then
  echo "❌ Directory not found: $DIR" >&2
  exit 1
fi

COUNT=0
SAVED=0

while IFS= read -r -d '' file; do
  ORIG_SIZE=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file")
  "$SCRIPT_DIR/optimize-image.sh" "$file" "$QUALITY" "$MAX_WIDTH"
  NAME="${file%.*}"
  WEBP="$NAME.webp"
  if [[ -f "$WEBP" ]]; then
    NEW_SIZE=$(stat -f%z "$WEBP" 2>/dev/null || stat -c%s "$WEBP")
    SAVED=$(( SAVED + ORIG_SIZE - NEW_SIZE ))
    COUNT=$(( COUNT + 1 ))
  fi
done < <(find "$DIR" -maxdepth 1 -type f \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" \) -print0)

echo ""
echo "📊 Batch complete: $COUNT files converted, $(( SAVED/1024/1024 )) MB saved"
