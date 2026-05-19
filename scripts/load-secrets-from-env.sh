#!/usr/bin/env bash
# Bulk-populate GitHub Environment secrets from a local .env snapshot.
#
# Used by operators to seed (or re-seed) a GitHub Environment with the
# values currently sitting on a VPS's ~/.openclaw/.env. Pairs with
# scripts/upsert-env.py — once secrets are in GitHub, deploys will
# apply them to the VPS automatically.
#
# Usage:
#   scripts/load-secrets-from-env.sh --env <env-name> --from <path> [flags]
#
# Flags:
#   --env <name>          Target GitHub Environment (e.g. staging, production)
#   --from <path>         Source .env file
#   --confirm             Actually upload (default is dry-run)
#   --include K1,K2,...   Only upload these keys (comma-separated)
#   --exclude K1,K2,...   Skip these keys (comma-separated)
#   --help                Show this help and exit
#
# Security:
#   - Values are passed to `gh secret set` via stdin (not --body), so they
#     never appear in `ps` output or shell history.
#   - Default is dry-run. You MUST pass --confirm to upload.
#   - Empty values are skipped (same logic as scripts/upsert-env.py).
#
# Examples:
#   # See what would be uploaded (no changes):
#   scripts/load-secrets-from-env.sh --env staging --from /tmp/staging.env.snapshot
#
#   # Upload all keys from the snapshot to the staging Environment:
#   scripts/load-secrets-from-env.sh --env staging --from /tmp/staging.env.snapshot --confirm
#
#   # Upload only two specific keys:
#   scripts/load-secrets-from-env.sh --env staging --from /tmp/staging.env.snapshot \
#     --include ANTHROPIC_API_KEY,OPENAI_API_KEY --confirm

set -euo pipefail

ENV_NAME=""
ENV_FILE=""
CONFIRM=0
INCLUDE_LIST=""
EXCLUDE_LIST=""

usage() {
  sed -n '2,36p' "$0"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)     ENV_NAME="${2:?--env requires a value}"; shift 2 ;;
    --from)    ENV_FILE="${2:?--from requires a value}"; shift 2 ;;
    --confirm) CONFIRM=1; shift ;;
    --include) INCLUDE_LIST="${2:?--include requires a value}"; shift 2 ;;
    --exclude) EXCLUDE_LIST="${2:?--exclude requires a value}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

[[ -z "$ENV_NAME" ]] && { echo "error: --env required" >&2; exit 1; }
[[ -z "$ENV_FILE" ]] && { echo "error: --from required" >&2; exit 1; }
[[ ! -f "$ENV_FILE" ]] && { echo "error: file not found: $ENV_FILE" >&2; exit 1; }

command -v gh >/dev/null || { echo "error: gh CLI not installed" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "error: gh not authenticated; run 'gh auth login'" >&2; exit 1; }

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null) || {
  echo "error: could not determine repo from cwd; run from inside the repo" >&2
  exit 1
}

# Initialize with =() so `${#X[@]}` works under `set -u` even when empty.
declare -A INCLUDE_SET=()
declare -A EXCLUDE_SET=()
if [[ -n "$INCLUDE_LIST" ]]; then
  IFS=',' read -r -a _arr <<< "$INCLUDE_LIST"
  for k in "${_arr[@]}"; do INCLUDE_SET[$k]=1; done
fi
if [[ -n "$EXCLUDE_LIST" ]]; then
  IFS=',' read -r -a _arr <<< "$EXCLUDE_LIST"
  for k in "${_arr[@]}"; do EXCLUDE_SET[$k]=1; done
fi

echo "Target: GitHub Environment '$ENV_NAME' in $REPO"
echo "Source: $ENV_FILE"
if [[ $CONFIRM -eq 1 ]]; then
  echo "Mode:   EXECUTE (uploading)"
else
  echo "Mode:   DRY-RUN (no changes)"
fi
echo

COUNT_LOADED=0
COUNT_SKIPPED_EMPTY=0
COUNT_SKIPPED_FILTER=0
COUNT_SKIPPED_FORMAT=0

while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// }" ]] && continue

  if [[ ! "$line" =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]]; then
    COUNT_SKIPPED_FORMAT=$((COUNT_SKIPPED_FORMAT + 1))
    continue
  fi

  KEY="${BASH_REMATCH[1]}"
  VALUE="${BASH_REMATCH[2]}"

  if [[ ${#INCLUDE_SET[@]} -gt 0 && -z "${INCLUDE_SET[$KEY]:-}" ]]; then
    COUNT_SKIPPED_FILTER=$((COUNT_SKIPPED_FILTER + 1))
    continue
  fi
  if [[ -n "${EXCLUDE_SET[$KEY]:-}" ]]; then
    COUNT_SKIPPED_FILTER=$((COUNT_SKIPPED_FILTER + 1))
    continue
  fi

  if [[ -z "$VALUE" ]]; then
    COUNT_SKIPPED_EMPTY=$((COUNT_SKIPPED_EMPTY + 1))
    continue
  fi

  if [[ $CONFIRM -eq 1 ]]; then
    printf '%s' "$VALUE" | gh secret set "$KEY" --env "$ENV_NAME" >/dev/null || {
      echo "  ✗ Failed to set $KEY" >&2
      exit 1
    }
    echo "  ✓ Set $KEY (${#VALUE} chars)"
  else
    echo "  · $KEY (would set; ${#VALUE} chars)"
  fi
  COUNT_LOADED=$((COUNT_LOADED + 1))
done < "$ENV_FILE"

echo
echo "Summary:"
if [[ $CONFIRM -eq 1 ]]; then
  echo "  Uploaded:               $COUNT_LOADED"
else
  echo "  Would upload:           $COUNT_LOADED"
fi
echo "  Skipped (empty values): $COUNT_SKIPPED_EMPTY"
[[ $COUNT_SKIPPED_FILTER -gt 0 ]] && echo "  Skipped (filter):       $COUNT_SKIPPED_FILTER"
[[ $COUNT_SKIPPED_FORMAT -gt 0 ]] && echo "  Skipped (bad format):   $COUNT_SKIPPED_FORMAT"

if [[ $CONFIRM -eq 0 && $COUNT_LOADED -gt 0 ]]; then
  echo
  echo "Dry run — no changes made. Re-run with --confirm to actually upload."
fi
