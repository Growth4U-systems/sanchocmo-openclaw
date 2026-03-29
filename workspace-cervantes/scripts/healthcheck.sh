#!/usr/bin/env bash
# healthcheck.sh — Verifica TODOS los servicios via MC endpoint + extras
# Llama al endpoint de MC (que ya tiene lógica rica para 23 servicios)
# y añade checks extra que MC no cubre (tailscale, cron_scheduler).
#
# Exit 0 = todo OK o fallos sin cambio (debounced — no alert)
# Exit 1 = NUEVO fallo detectado (ok→fail — ALERT)
# Exit 2 = servicio recuperado (fail→ok — informational)
set -uo pipefail

OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
export SANCHO_STATE="$OPENCLAW_HOME/workspace-sancho/memory/healthcheck-state.json"
export CERVANTES_STATE="$OPENCLAW_HOME/workspace-cervantes/memory/healthcheck-state.json"
export API_HEALTH_FILE="$OPENCLAW_HOME/workspace-sancho/_system/api-health.json"
export NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

mkdir -p "$(dirname "$SANCHO_STATE")" "$(dirname "$CERVANTES_STATE")"

MC_URL="http://127.0.0.1:18790/mc/api/health-check?service=all"

# Step 1: Call MC health check endpoint (checks all 23 services + saves api-health.json)
MC_RESULT=$(curl -s --max-time 120 "$MC_URL" 2>&1)
MC_EXIT=$?

if [ $MC_EXIT -ne 0 ] || echo "$MC_RESULT" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; [ $? -ne 0 ] 2>/dev/null; then
  # MC endpoint failed — fall back to reading existing api-health.json
  if [ -f "$API_HEALTH_FILE" ]; then
    MC_RESULT=$(cat "$API_HEALTH_FILE")
  else
    MC_RESULT='{"services":{}}'
  fi
fi

# Step 1b: Infrastructure checks (nginx + Docker on VPS, Tailscale on local dev)
# Detect environment: if tailscale is available, we're on local dev
if command -v tailscale &> /dev/null; then
  # --- Local dev: Tailscale Funnel watchdog ---
  FUNNEL_STATUS=$(tailscale funnel status 2>&1)
  if echo "$FUNNEL_STATUS" | grep -q "tailnet only"; then
    echo "$(date): Funnel down — re-enabling..."
    tailscale serve reset 2>/dev/null
    tailscale funnel --bg --set-path / http://127.0.0.1:18789 2>/dev/null
    tailscale funnel --bg --set-path /mc http://127.0.0.1:18790 2>/dev/null
    echo "$(date): Funnel re-enabled"
  else
    echo "$(date): Funnel OK"
  fi

  # Tailscale service check
  if tailscale status &> /dev/null; then
    INFRA_STATUS="ok"
    INFRA_DETAIL="tailscale status OK"
  else
    INFRA_STATUS="error"
    INFRA_DETAIL="tailscale status failed"
  fi
else
  # --- VPS: nginx + Docker checks ---
  INFRA_STATUS="ok"
  INFRA_DETAIL=""
  INFRA_ERRORS=""

  # Check nginx
  if command -v systemctl &> /dev/null && systemctl is-active --quiet nginx; then
    INFRA_DETAIL="nginx: active"
  else
    INFRA_STATUS="error"
    INFRA_ERRORS="nginx not running"
  fi

  # Check Docker container
  CONTAINER_STATE=$(docker inspect --format='{{.State.Status}}' sanchocmo 2>/dev/null || echo "not-found")
  if [ "$CONTAINER_STATE" = "running" ]; then
    INFRA_DETAIL="$INFRA_DETAIL, container: running"
  else
    INFRA_STATUS="error"
    INFRA_ERRORS="$INFRA_ERRORS, container: $CONTAINER_STATE"
  fi

  if [ "$INFRA_STATUS" = "error" ]; then
    INFRA_DETAIL="$INFRA_ERRORS"
  fi
fi

# Step 2: Run extra checks that MC doesn't cover
EXTRA_CHECKS=$(python3 -c "
import json
d = {}
d['infrastructure'] = {
    'status': '$INFRA_STATUS',
    'lastCheck': '$NOW',
    'details': {'note': '$INFRA_DETAIL'}
}
print(json.dumps(d))
")

# Step 3: Merge MC results + extras, apply debounce, write state
python3 -c "
import json, sys, os

now = os.environ['NOW']
sancho_state = os.environ['SANCHO_STATE']
cervantes_state = os.environ['CERVANTES_STATE']
api_health_file = os.environ['API_HEALTH_FILE']

# Parse MC result
try:
    mc = json.loads('''$MC_RESULT''')
except:
    mc = {'services': {}}

# MC endpoint returns {checked:[], results:{}, lastCheck:''} or raw api-health format
mc_services = mc.get('results', mc.get('services', {}))

# Parse extra checks
extras = json.loads('''$EXTRA_CHECKS''')

# Merge: all MC services + extras
all_services = {}
for svc_id, svc_data in mc_services.items():
    all_services[svc_id] = {
        'status': svc_data.get('status', 'unknown'),
        'lastCheck': svc_data.get('lastCheck', now),
        'details': svc_data.get('details', {}),
        'error': svc_data.get('details', {}).get('error', '')
    }
for svc_id, svc_data in extras.items():
    all_services[svc_id] = {
        'status': svc_data.get('status', 'unknown'),
        'lastCheck': svc_data.get('lastCheck', now),
        'details': svc_data.get('details', {}),
        'error': svc_data.get('details', {}).get('error', '')
    }

# Count failures (excluding not-configured — those aren't failures)
fail_count = sum(1 for s in all_services.values() if s['status'] == 'error')
total = sum(1 for s in all_services.values() if s['status'] != 'not-configured')
ok_count = sum(1 for s in all_services.values() if s['status'] == 'ok')

# Load previous state for debounce
prev_services = {}
for sf in [sancho_state, cervantes_state]:
    if os.path.exists(sf):
        try:
            with open(sf) as f:
                prev = json.load(f)
            prev_services = prev.get('services', {})
            break
        except:
            pass

# Debounce: classify changes
new_failures = []
recoveries = []
ongoing_failures = []

for svc_id, svc_data in all_services.items():
    prev_status = prev_services.get(svc_id, {}).get('status', 'unknown')
    curr_status = svc_data['status']
    # Skip not-configured services
    if curr_status == 'not-configured':
        continue
    if curr_status == 'error' and prev_status != 'error':
        new_failures.append(svc_id)
    elif curr_status == 'error' and prev_status == 'error':
        ongoing_failures.append(svc_id)
    elif curr_status == 'ok' and prev_status == 'error':
        recoveries.append(svc_id)

state_changed = len(new_failures) > 0 or len(recoveries) > 0
overall = 'fail' if fail_count > 0 else 'ok'

# Build state
state = {
    'status': overall,
    'last_run': now,
    'summary': f'{ok_count}/{total} ok, {fail_count} errors',
    'failureCount': fail_count,
    'services': all_services,
    'debounce': {
        'newFailures': new_failures,
        'recoveries': recoveries,
        'ongoingFailures': ongoing_failures,
        'stateChanged': state_changed
    }
}

# Write healthcheck state to BOTH workspaces
for sf in [sancho_state, cervantes_state]:
    os.makedirs(os.path.dirname(sf), exist_ok=True)
    with open(sf, 'w') as f:
        json.dump(state, f, indent=2)

# Also update api-health.json with extras (MC already wrote its services)
try:
    with open(api_health_file) as f:
        api_health = json.load(f)
except:
    api_health = {'lastCheck': None, 'services': {}}

for svc_id, svc_data in extras.items():
    api_health['services'][svc_id] = {
        'status': svc_data['status'],
        'lastCheck': svc_data['lastCheck'],
        'details': svc_data.get('details', {})
    }
api_health['lastCheck'] = now

with open(api_health_file, 'w') as f:
    json.dump(api_health, f, indent=2)

print(json.dumps(state, indent=2))

# Exit codes
if new_failures:
    print(f'\nNEW_FAILURES: {new_failures}')
    sys.exit(1)
elif recoveries:
    print(f'\nRECOVERED: {recoveries}')
    sys.exit(2)
elif ongoing_failures:
    print(f'\nONGOING_FAILURES (debounced): {ongoing_failures}')
    sys.exit(0)
else:
    print(f'\nALL_OK ({ok_count}/{total})')
    sys.exit(0)
"

EXIT_CODE=$?
exit $EXIT_CODE
