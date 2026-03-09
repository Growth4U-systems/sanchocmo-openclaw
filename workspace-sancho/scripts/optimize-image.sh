#!/bin/bash
# optimize-image.sh — Compress PNG/JPG to WebP, keep original in /originals
# Usage: optimize-image.sh <image_path> [quality] [max_width]
# Example: optimize-image.sh mockups/hero.png 82 1200
#
# Defaults: quality=82, max_width=1200
# Output: same path but .webp extension. Original moved to originals/ subfolder.

set -euo pipefail

INPUT="$1"
QUALITY="${2:-82}"
MAX_WIDTH="${3:-1200}"

if [[ ! -f "$INPUT" ]]; then
  echo "❌ File not found: $INPUT" >&2
  exit 1
fi

DIR="$(dirname "$INPUT")"
BASENAME="$(basename "$INPUT")"
NAME="${BASENAME%.*}"
EXT="${BASENAME##*.}"
ORIGINALS_DIR="$DIR/originals"
OUTPUT="$DIR/$NAME.webp"

# Skip if already webp
EXT_LOWER=$(echo "$EXT" | tr '[:upper:]' '[:lower:]')
if [[ "$EXT_LOWER" == "webp" ]]; then
  echo "⏭️  Already WebP: $INPUT"
  exit 0
fi

# Get current width
CURRENT_WIDTH=$(sips -g pixelWidth "$INPUT" 2>/dev/null | awk '/pixelWidth/{print $2}')

# Build cwebp args
ARGS=(-q "$QUALITY" -m 6)

# Resize if wider than max
if [[ -n "$CURRENT_WIDTH" ]] && (( CURRENT_WIDTH > MAX_WIDTH )); then
  ARGS+=(-resize "$MAX_WIDTH" 0)
fi

# Convert
cwebp "${ARGS[@]}" "$INPUT" -o "$OUTPUT" 2>/dev/null

# Move original
mkdir -p "$ORIGINALS_DIR"
mv "$INPUT" "$ORIGINALS_DIR/$BASENAME"

# Stats
ORIG_SIZE=$(stat -f%z "$ORIGINALS_DIR/$BASENAME" 2>/dev/null || stat -c%s "$ORIGINALS_DIR/$BASENAME")
NEW_SIZE=$(stat -f%z "$OUTPUT" 2>/dev/null || stat -c%s "$OUTPUT")
REDUCTION=$(( (ORIG_SIZE - NEW_SIZE) * 100 / ORIG_SIZE ))

echo "✅ $BASENAME → $NAME.webp | $(( ORIG_SIZE/1024 ))KB → $(( NEW_SIZE/1024 ))KB (-${REDUCTION}%)"
