#!/usr/bin/env bash
# for-each-client.sh — Iterate over active clients in clients.json
# Usage: ./scripts/for-each-client.sh <command>
#
# The command receives these env vars per client:
#   CLIENT_SLUG, CLIENT_NAME, CLIENT_GUILD, CLIENT_WORKSPACE, CLIENT_BRAND, CLIENT_CAMPAIGNS
#
# Example:
#   ./scripts/for-each-client.sh 'echo "Processing $CLIENT_NAME ($CLIENT_SLUG)"'
#   ./scripts/for-each-client.sh ./scripts/daily-pulse.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLIENTS_JSON="${SCRIPT_DIR}/../clients.json"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <command>" >&2
  exit 1
fi

CMD="$*"

if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required but not installed" >&2
  exit 1
fi

if [[ ! -f "$CLIENTS_JSON" ]]; then
  echo "ERROR: clients.json not found at $CLIENTS_JSON" >&2
  exit 1
fi

TOTAL=$(jq '[.clients[] | select(.active == true)] | length' "$CLIENTS_JSON")
echo "=== for-each-client: $TOTAL active client(s) ==="
echo "=== Command: $CMD ==="
echo ""

FAILED=0
IDX=0

for row in $(jq -r '.clients[] | select(.active == true) | @base64' "$CLIENTS_JSON"); do
  _jq() { echo "$row" | base64 --decode | jq -r "$1"; }

  export CLIENT_SLUG=$(_jq '.slug')
  export CLIENT_NAME=$(_jq '.name')
  export CLIENT_GUILD=$(_jq '.guild')
  export CLIENT_WORKSPACE=$(_jq '.workspace')
  export CLIENT_BRAND=$(_jq '.paths.brand // "brand/"')
  export CLIENT_CAMPAIGNS=$(_jq '.paths.campaigns // "campaigns/"')

  IDX=$((IDX + 1))
  echo "--- [$IDX/$TOTAL] $CLIENT_NAME ($CLIENT_SLUG) ---"
  START=$(date +%s)

  set +e
  eval "$CMD"
  RC=$?
  set -e

  ELAPSED=$(( $(date +%s) - START ))

  if [[ $RC -ne 0 ]]; then
    echo "  ✗ FAILED (exit $RC) after ${ELAPSED}s"
    FAILED=$((FAILED + 1))
  else
    echo "  ✓ OK (${ELAPSED}s)"
  fi
  echo ""
done

echo "=== Done: $((TOTAL - FAILED))/$TOTAL succeeded ==="
[[ $FAILED -eq 0 ]] && exit 0 || exit 1
