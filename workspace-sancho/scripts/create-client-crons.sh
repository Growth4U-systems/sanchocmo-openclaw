#!/usr/bin/env bash
# create-client-crons.sh — Create per-client cron jobs from client-config.json + cron-templates.json
#
# Usage: ./scripts/create-client-crons.sh <client-slug> [--dry-run]
#
# Reads brand/<slug>/client-config.json for enabled crons and schedules.
# Reads _system/cron-templates.json for prompt templates.
# Creates OpenClaw cron jobs via `openclaw cron add`.
#
# Examples:
#   ./scripts/create-client-crons.sh example           # Create all enabled crons
#   ./scripts/create-client-crons.sh example --dry-run  # Show what would be created
#   ./scripts/create-client-crons.sh example                   # Create for Example

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE="${SCRIPT_DIR}/.."
TEMPLATES="${WORKSPACE}/_system/cron-templates.json"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <client-slug> [--dry-run]" >&2
  exit 1
fi

SLUG="$1"
DRY_RUN="${2:-}"
SOURCES="${WORKSPACE}/brand/${SLUG}/client-config.json"

if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required but not installed" >&2
  exit 1
fi

if [[ ! -f "$SOURCES" ]]; then
  echo "ERROR: client-config.json not found at $SOURCES" >&2
  echo "Create it first: brand/${SLUG}/client-config.json" >&2
  exit 1
fi

if [[ ! -f "$TEMPLATES" ]]; then
  echo "ERROR: cron-templates.json not found at $TEMPLATES" >&2
  exit 1
fi

CLIENT_NAME=$(jq -r '.name' "$SOURCES")
echo "=== Creating crons for: ${CLIENT_NAME} (${SLUG}) ==="
echo ""

# Get list of cron types from client-config.json
CRON_TYPES=$(jq -r '.crons | keys[]' "$SOURCES")
CREATED=0
SKIPPED=0

for CRON_TYPE in $CRON_TYPES; do
  ENABLED=$(jq -r ".crons.${CRON_TYPE}.enabled" "$SOURCES")
  SCHEDULE=$(jq -r ".crons.${CRON_TYPE}.schedule" "$SOURCES")
  TZ=$(jq -r ".crons.${CRON_TYPE}.tz // \"Europe/Madrid\"" "$SOURCES")

  # Check if template exists
  HAS_TEMPLATE=$(jq -r "has(\"${CRON_TYPE}\")" "$TEMPLATES")
  if [[ "$HAS_TEMPLATE" != "true" ]]; then
    echo "⚠️  No template for '${CRON_TYPE}' — skipping"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  if [[ "$ENABLED" != "true" ]]; then
    echo "⏭️  ${CRON_TYPE} — disabled in client-config.json, skipping"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Build cron name
  CRON_NAME=$(jq -r ".${CRON_TYPE}.name_template" "$TEMPLATES" | sed "s/{NAME}/${CLIENT_NAME}/g")
  AGENT=$(jq -r ".${CRON_TYPE}.agent" "$TEMPLATES")
  MODEL=$(jq -r ".${CRON_TYPE}.model" "$TEMPLATES")

  # Build prompt with substitutions
  PROMPT=$(jq -r ".${CRON_TYPE}.prompt" "$TEMPLATES" | sed "s/{SLUG}/${SLUG}/g" | sed "s/{NAME}/${CLIENT_NAME}/g")

  # Check if cron already exists (by name)
  EXISTING=$(openclaw cron list 2>/dev/null | grep -c "${CRON_NAME}" || true)
  if [[ "$EXISTING" -gt 0 ]]; then
    echo "⏭️  ${CRON_TYPE} — '${CRON_NAME}' already exists, skipping"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  if [[ "$DRY_RUN" == "--dry-run" ]]; then
    echo "🔍 [DRY RUN] Would create:"
    echo "   Name: ${CRON_NAME}"
    echo "   Agent: ${AGENT}"
    echo "   Schedule: ${SCHEDULE} (${TZ})"
    echo "   Model: ${MODEL}"
    echo "   Prompt: ${PROMPT:0:100}..."
    echo ""
    CREATED=$((CREATED + 1))
    continue
  fi

  # Create the cron job
  echo "➕ Creating: ${CRON_NAME}"
  # Write prompt to temp file, pass via xargs to avoid shell escaping issues with long prompts
  TMPFILE=$(mktemp)
  printf '%s' "${PROMPT}" > "$TMPFILE"
  MSG=$(cat "$TMPFILE")
  openclaw cron add \
    --name "${CRON_NAME}" \
    --agent "${AGENT}" \
    --cron "${SCHEDULE}" \
    --tz "${TZ}" \
    --session isolated \
    --model "${MODEL}" \
    --message "$MSG" \
    2>&1 | head -5
  rm -f "$TMPFILE"

  CREATED=$((CREATED + 1))
  echo "   ✓ Created"
  echo ""
done

echo ""
if [[ "$DRY_RUN" == "--dry-run" ]]; then
  echo "=== DRY RUN: Would create ${CREATED}, skip ${SKIPPED} ==="
else
  echo "=== Done: ${CREATED} created, ${SKIPPED} skipped ==="
fi
