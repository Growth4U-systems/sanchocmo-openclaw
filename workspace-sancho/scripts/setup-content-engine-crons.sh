#!/usr/bin/env bash
# setup-content-engine-crons.sh — Register Content Engine crons for a client.
#
# Reads _system/content-engine-cron-jobs.json (the canonical Content Engine
# cron template), substitutes {SLUG} and {NAME}, and creates each cron via
# `openclaw cron add`. Idempotent: skips crons that already exist.
#
# Mirror of create-client-crons.sh, but for Content Engine specifically.
# Invoked as the last step of the content-engine-setup skill.
#
# Usage:
#   ./scripts/setup-content-engine-crons.sh <client-slug> [--dry-run]
#
# Examples:
#   ./scripts/setup-content-engine-crons.sh growth4u
#   ./scripts/setup-content-engine-crons.sh example --dry-run

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE="${SCRIPT_DIR}/.."
TEMPLATE="${WORKSPACE}/_system/content-engine-cron-jobs.json"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <client-slug> [--dry-run]" >&2
  exit 1
fi

SLUG="$1"
DRY_RUN="${2:-}"
CONFIG="${WORKSPACE}/brand/${SLUG}/client-config.json"

if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required but not installed" >&2
  exit 1
fi

if [[ ! -d "${WORKSPACE}/brand/${SLUG}" ]]; then
  echo "ERROR: brand directory not found at ${WORKSPACE}/brand/${SLUG}" >&2
  exit 1
fi

if [[ ! -f "$CONFIG" ]]; then
  echo "ERROR: client-config.json not found at $CONFIG" >&2
  echo "Create the client from Mission Control first, then run Foundation." >&2
  exit 1
fi

if [[ ! -f "$TEMPLATE" ]]; then
  echo "ERROR: content-engine-cron-jobs.json not found at $TEMPLATE" >&2
  exit 1
fi

CLIENT_NAME=$(jq -r '.name' "$CONFIG")
if [[ -z "$CLIENT_NAME" || "$CLIENT_NAME" == "null" ]]; then
  echo "ERROR: .name missing from $CONFIG" >&2
  exit 1
fi

echo "=== Content Engine crons for: ${CLIENT_NAME} (${SLUG}) ==="
echo ""

NUM_JOBS=$(jq '.jobs | length' "$TEMPLATE")
CREATED=0
SKIPPED=0
ERRORS=0

# Existing crons live in OpenClaw's runtime state. Newer versions store
# them under ${OPENCLAW_HOME}/.openclaw/cron/jobs.json (nested); older
# versions used ${OPENCLAW_HOME}/cron/jobs.json (flat). Try nested first
# so we still detect duplicates even when the legacy symlink bridge is
# missing — otherwise the script reports "would create" for every job
# and `cron add` later fails or silently produces duplicates.
# We read jobs.json directly (rather than `openclaw cron list`) for exact
# name matching, since the CLI truncates long names with "...".
OPENCLAW_HOME_DIR="${OPENCLAW_HOME:-$HOME/.openclaw}"
JOBS_FILE=""
for candidate in \
    "${OPENCLAW_HOME_DIR}/.openclaw/cron/jobs.json" \
    "${OPENCLAW_HOME_DIR}/cron/jobs.json"; do
  if [[ -f "$candidate" ]]; then
    JOBS_FILE="$candidate"
    break
  fi
done
EXISTING_NAMES_FILE=$(mktemp)
if [[ -n "$JOBS_FILE" && -f "$JOBS_FILE" ]]; then
  # Handle either schema: top-level array, or { "jobs": [...] }, or { "jobs": {id: job} }
  jq -r '
    if type == "array" then .[]
    elif (.jobs | type) == "array" then .jobs[]
    elif (.jobs | type) == "object" then .jobs | to_entries[] | .value
    else empty
    end
    | .name // empty
  ' "$JOBS_FILE" > "$EXISTING_NAMES_FILE"
fi

for i in $(seq 0 $((NUM_JOBS - 1))); do
  RAW_NAME=$(jq -r ".jobs[$i].name" "$TEMPLATE")
  CRON_NAME="${RAW_NAME//\{NAME\}/$CLIENT_NAME}"
  CRON_NAME="${CRON_NAME//\{SLUG\}/$SLUG}"

  AGENT=$(jq -r ".jobs[$i].agentId" "$TEMPLATE")
  SCHEDULE=$(jq -r ".jobs[$i].schedule.expr" "$TEMPLATE")
  TZ=$(jq -r ".jobs[$i].schedule.tz" "$TEMPLATE")
  MODEL=$(jq -r ".jobs[$i].payload.model" "$TEMPLATE")

  RAW_MSG=$(jq -r ".jobs[$i].payload.message" "$TEMPLATE")
  PROMPT="${RAW_MSG//\{NAME\}/$CLIENT_NAME}"
  PROMPT="${PROMPT//\{SLUG\}/$SLUG}"

  # Skip if a cron with this exact name already exists (exact line match)
  if grep -Fxq "$CRON_NAME" "$EXISTING_NAMES_FILE"; then
    echo "⏭️  '${CRON_NAME}' — already exists, skipping"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  if [[ "$DRY_RUN" == "--dry-run" ]]; then
    echo "🔍 [DRY RUN] Would create:"
    echo "   Name: ${CRON_NAME}"
    echo "   Agent: ${AGENT}"
    echo "   Schedule: ${SCHEDULE} (${TZ})"
    echo "   Model: ${MODEL}"
    echo "   Prompt (first 120 chars): ${PROMPT:0:120}…"
    echo ""
    CREATED=$((CREATED + 1))
    continue
  fi

  echo "➕ Creating: ${CRON_NAME}"
  TMPFILE=$(mktemp)
  printf '%s' "$PROMPT" > "$TMPFILE"
  # --no-deliver matches the template's delivery.mode: "none". Without it,
  # `cron add` defaults to channel=last, which fails when the agent's last
  # chat is on mc-chat (cron logs "Delivering to mc-chat requires target"
  # even though the agent's work succeeded). Content Engine crons report
  # their results by writing to recurring-tasks/*.json — they do not need
  # cron-level delivery.
  if openclaw cron add \
      --name "$CRON_NAME" \
      --agent "$AGENT" \
      --cron "$SCHEDULE" \
      --tz "$TZ" \
      --session isolated \
      --model "$MODEL" \
      --no-deliver \
      --message "$(cat "$TMPFILE")" \
      2>&1 | head -5; then
    CREATED=$((CREATED + 1))
    echo "   ✓ Created"
  else
    ERRORS=$((ERRORS + 1))
    echo "   ✗ Failed"
  fi
  rm -f "$TMPFILE"
  echo ""
done

rm -f "$EXISTING_NAMES_FILE"

echo ""
if [[ "$DRY_RUN" == "--dry-run" ]]; then
  echo "=== DRY RUN: would create ${CREATED}, would skip ${SKIPPED} ==="
else
  echo "=== Done: ${CREATED} created, ${SKIPPED} skipped, ${ERRORS} errors ==="
  if [[ "$ERRORS" -gt 0 ]]; then
    exit 1
  fi
fi
