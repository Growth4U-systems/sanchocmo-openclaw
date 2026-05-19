#!/bin/bash
# inject-env-vars.sh — Replace {UPPER_SNAKE_CASE} placeholders in .md files
# with actual environment variable values.
# Only processes whitelisted files. Lowercase placeholders ({slug}, {mcToken}) are untouched.
set -uo pipefail

OPENCLAW_ROOT="${OPENCLAW_HOME:-/root/.openclaw}"

# Default BASE_URL for standalone deployments
export BASE_URL="${BASE_URL:-http://localhost}"
export MC_BASE_URL="${MC_BASE_URL:-$BASE_URL/mc}"

echo "[env-inject] BASE_URL=$BASE_URL"
echo "[env-inject] MC_BASE_URL=$MC_BASE_URL"

# Files to process (relative to workspace root). Whitelist must reflect
# real paths; missing files are skipped with a warning by the loop below.
INJECT_FILES="SOUL.md AGENTS.md PROTOCOLS.md TOOLS.md _system/technical/mc-links-protocol.md _system/onboarding/client-onboarding.md _system/onboarding/client-onboarding-checklist.md _system/output/presentation-summary-protocol.md _system/output/project-threads-protocol.md"

for ws in "$OPENCLAW_ROOT"/workspace-sancho "$OPENCLAW_ROOT"/workspace-cervantes; do
  [ -d "$ws" ] || continue
  for relpath in $INJECT_FILES; do
    md="$ws/$relpath"
    [ -f "$md" ] || continue
    # Find all {UPPER_SNAKE_CASE} placeholders and replace with env values
    grep -oP '\{[A-Z][A-Z0-9_]+\}' "$md" 2>/dev/null | sort -u | while read -r placeholder; do
      var="${placeholder:1:-1}"  # Strip braces
      val="${!var:-}"            # Get env value
      if [ -n "$val" ]; then
        sed -i "s|{${var}}|${val}|g" "$md"
      fi
    done
  done
done

echo "[env-inject] Done"
