#!/usr/bin/env bash
# healthcheck.sh — Verifica todos los servicios del sistema SanchoCMO
# Exit 0 = todo OK, exit 1 = algún fallo
set -uo pipefail

STATE_FILE="$HOME/.openclaw/workspace-cervantes/memory/healthcheck-state.json"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TMPFILE=$(mktemp)
FAIL_COUNT=0
FAIL_DETAILS=""

# Initialize JSON
echo '{}' > "$TMPFILE"

check() {
  local name="$1" cmd="$2" expect="$3"
  local output status_str error_str
  if output=$(eval "$cmd" 2>&1); then
    if [ -n "$expect" ] && ! echo "$output" | grep -qi "$expect"; then
      status_str="fail"
      error_str="Expected '$expect' not found"
      FAIL_COUNT=$((FAIL_COUNT + 1))
      FAIL_DETAILS="${FAIL_DETAILS}\n- ${name}: ${error_str}"
    else
      status_str="ok"
      error_str=""
    fi
  else
    status_str="fail"
    error_str="Command failed"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAIL_DETAILS="${FAIL_DETAILS}\n- ${name}: ${error_str}"
  fi
  
  python3 -c "
import json
with open('$TMPFILE') as f: d=json.load(f)
d['$name']={'status':'$status_str','error':'$error_str','checkedAt':'$NOW'}
with open('$TMPFILE','w') as f: json.dump(d,f)
"
}

# --- Checks ---
check "gateway"          "openclaw gateway status 2>&1"    "running"
check "mission_control"  "curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:18790/" "200"
check "tailscale"        "tailscale status 2>&1 | head -5" ""
check "google_workspace" "gog gmail search '*' -p 2>&1 | head -1" ""

# --- Write state ---
OVERALL="ok"
[ "$FAIL_COUNT" -gt 0 ] && OVERALL="fail"

python3 -c "
import json
with open('$TMPFILE') as f: services=json.load(f)
state={'lastRun':'$NOW','overall':'$OVERALL','failureCount':$FAIL_COUNT,'services':services}
with open('$STATE_FILE','w') as f: json.dump(state,f,indent=2)
print(json.dumps(state,indent=2))
"

rm -f "$TMPFILE"

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo -e "\nFAILURES:$FAIL_DETAILS"
  exit 1
else
  echo -e "\nALL_OK"
  exit 0
fi
