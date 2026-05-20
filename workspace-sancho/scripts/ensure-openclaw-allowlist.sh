#!/usr/bin/env bash
# ensure-openclaw-allowlist.sh — Ensure Content Engine model names are present
# in openclaw.json's agents.defaults.models allowlist. Idempotent.
#
# Why:
#   The Content Engine cron template (_system/content-engine-cron-jobs.json)
#   uses anthropic/claude-sonnet-4-5 (4 jobs) and claude-opus-4-6 (Editorial
#   Dispatch). The openclaw daemon rejects a cron whose payload.model is not
#   present in agents.defaults.models — preflight fails with
#   "cron payload.model 'X' rejected by agents.defaults.models allowlist".
#
#   On a fresh openclaw install the allowlist only contains the agent's
#   default primary+fallbacks (typically openrouter/openai/gpt-5.5 +
#   openai/gpt-5.5). This script adds the Content Engine models so the cron
#   seeding can succeed.
#
#   This script must run BEFORE the openclaw daemon caches the allowlist; in
#   practice that means the operator must restart the sanchocmo container
#   after running it. The script prints the restart command at the end.
#
# Usage:
#   ./scripts/ensure-openclaw-allowlist.sh
#   ./scripts/ensure-openclaw-allowlist.sh --config /custom/path/openclaw.json
#
# Exit codes:
#   0  — allowlist already correct, or successfully patched
#   1  — config not found, jq missing, or patch failed

set -euo pipefail

CONFIG="${OPENCLAW_CONFIG:-$HOME/.openclaw/.openclaw/openclaw.json}"
# All models referenced by _system/content-engine-cron-jobs.json (template),
# canonicalised to the provider-prefixed form. The openclaw cron preflight
# normalises bare names like `sonnet` and `claude-opus-4-6` by prepending
# `openrouter/`, so the unprefixed forms do NOT match — every entry here is
# the literal string the preflight compares against payload.model.
REQUIRED_MODELS=(
  "anthropic/claude-sonnet-4-5"
  "anthropic/claude-opus-4-6"
)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config) CONFIG="$2"; shift 2;;
    -h|--help) sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
    *) echo "Unknown flag: $1" >&2; exit 1;;
  esac
done

if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required but not installed" >&2
  exit 1
fi

if [[ ! -f "$CONFIG" ]]; then
  echo "ERROR: openclaw config not found at $CONFIG" >&2
  echo "Set OPENCLAW_CONFIG or pass --config /path/to/openclaw.json" >&2
  exit 1
fi

# Detect which required models are missing
MISSING=()
for m in "${REQUIRED_MODELS[@]}"; do
  if ! jq -e --arg m "$m" '.agents.defaults.models | has($m)' "$CONFIG" >/dev/null; then
    MISSING+=("$m")
  fi
done

if [[ ${#MISSING[@]} -eq 0 ]]; then
  echo "✓ Allowlist already contains required models: ${REQUIRED_MODELS[*]}"
  exit 0
fi

BACKUP="${CONFIG}.bak-allowlist-$(date +%Y%m%d-%H%M%S)"
cp "$CONFIG" "$BACKUP"
echo "Backup written: $BACKUP"

# Build a jq expression that adds each missing model with an empty config object.
# Equivalent to: .agents.defaults.models += {"<m1>": {}, "<m2>": {}, ...}
JQ_ADDS=""
for m in "${MISSING[@]}"; do
  if [[ -n "$JQ_ADDS" ]]; then JQ_ADDS+=", "; fi
  JQ_ADDS+="\"$m\": {}"
done

TMP=$(mktemp)
jq ".agents.defaults.models += {${JQ_ADDS}}" "$CONFIG" > "$TMP"

# Sanity check: the patched file must still parse and contain all models
for m in "${REQUIRED_MODELS[@]}"; do
  if ! jq -e --arg m "$m" '.agents.defaults.models | has($m)' "$TMP" >/dev/null; then
    echo "ERROR: post-patch validation failed for $m" >&2
    rm -f "$TMP"
    exit 1
  fi
done

mv "$TMP" "$CONFIG"
echo "✓ Added to allowlist: ${MISSING[*]}"
echo
echo "⚠️  IMPORTANT: openclaw caches the allowlist at startup."
echo "    Restart the openclaw daemon so it picks up the new allowlist:"
echo
echo "    # Inside the host (outside the container):"
echo "    docker restart sanchocmo"
echo
echo "    Without a restart, cron preflight will still reject the new models."
