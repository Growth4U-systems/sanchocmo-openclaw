#!/bin/bash
# setup-bindings.sh — Auto-configure Discord routing bindings
# Reads clients.json + instance.json to bind guilds to agents.
# Idempotent: skips bindings that already exist.
set -euo pipefail

OPENCLAW_ROOT="${OPENCLAW_HOME:-/root/.openclaw}"
INSTANCE_JSON="$OPENCLAW_ROOT/config/instance.json"
CLIENTS_JSON="$OPENCLAW_ROOT/config/clients.json"

echo "=== Configuring Discord routing bindings ==="

# Check required files
if [ ! -f "$INSTANCE_JSON" ]; then
  echo "  ERROR: $INSTANCE_JSON not found. Cannot configure bindings."
  exit 1
fi

if [ ! -f "$CLIENTS_JSON" ]; then
  echo "  WARNING: $CLIENTS_JSON not found. Skipping client bindings."
fi

# Get existing bindings
EXISTING_BINDINGS=$(openclaw agents bindings --json 2>/dev/null || echo '{"bindings":[]}')

# Get infra guild from instance.json → bind to cervantes
INFRA_GUILD=$(python3 -c "
import json
with open('$INSTANCE_JSON') as f:
    data = json.load(f)
print(data.get('discord', {}).get('infra_guild', ''))
" 2>/dev/null)

if [ -n "$INFRA_GUILD" ]; then
  if echo "$EXISTING_BINDINGS" | grep -q "$INFRA_GUILD"; then
    echo "  ✓ Infra guild ($INFRA_GUILD) already bound"
  else
    echo "  + Binding infra guild ($INFRA_GUILD) → cervantes"
    openclaw agents bind --agent cervantes --bind "discord:$INFRA_GUILD" 2>/dev/null || \
      echo "    WARNING: Failed to bind infra guild"
  fi
fi

# Get client guilds from clients.json → bind to sancho
if [ -f "$CLIENTS_JSON" ]; then
  CLIENT_GUILDS=$(python3 -c "
import json
with open('$CLIENTS_JSON') as f:
    data = json.load(f)
for client in data.get('clients', []):
    guild = client.get('guild', '')
    if guild and client.get('active', True):
        print(f\"{guild}|{client.get('slug', 'unknown')}\")
" 2>/dev/null)

  while IFS='|' read -r GUILD SLUG; do
    [ -z "$GUILD" ] && continue
    if echo "$EXISTING_BINDINGS" | grep -q "$GUILD"; then
      echo "  ✓ Client $SLUG ($GUILD) already bound"
    else
      echo "  + Binding client $SLUG ($GUILD) → sancho"
      openclaw agents bind --agent sancho --bind "discord:$GUILD" 2>/dev/null || \
        echo "    WARNING: Failed to bind client $SLUG"
    fi
  done <<< "$CLIENT_GUILDS"
fi

echo ""
echo "=== Binding configuration complete ==="
openclaw agents bindings 2>/dev/null || true
