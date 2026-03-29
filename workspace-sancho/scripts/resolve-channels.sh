#!/bin/bash
# Resolve Discord channel IDs to guild IDs using the Discord bot token
# Usage: ./scripts/resolve-channels.sh
# Reads unresolved channels from session list, queries Discord API, updates cache

set -euo pipefail

OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
WORKSPACE="${OPENCLAW_WORKSPACE:-$OPENCLAW_HOME/workspace-sancho}"
CACHE="$WORKSPACE/scripts/.channel-guild-cache.json"
TOKEN=$(grep -o '"token":"[^"]*"' "$OPENCLAW_HOME/agents/sancho/agent.yaml" 2>/dev/null | head -1 | cut -d'"' -f4 || true)

# Try to get token from openclaw config
if [ -z "$TOKEN" ]; then
    TOKEN=$(python3 -c "
import yaml
with open('$OPENCLAW_HOME/config.yaml') as f:
    cfg = yaml.safe_load(f)
print(cfg.get('discord', {}).get('token', ''))
" 2>/dev/null || true)
fi

if [ -z "$TOKEN" ]; then
    echo "❌ No Discord token found"
    exit 1
fi

echo "🔍 Resolving unknown Discord channels..."

# Get unresolved channels
UNRESOLVED=$(python3 -c "
import json, subprocess
from pathlib import Path

cache = json.loads(Path('$CACHE').read_text())
result = subprocess.run(['openclaw', 'sessions', '--all-agents', '--json'], capture_output=True, text=True, timeout=30)
data = json.loads(result.stdout)
sessions = data if isinstance(data, list) else data.get('sessions', [])

channels = set()
for s in sessions:
    key = s.get('key', '')
    if ':discord:channel:' in key:
        ch = key.split(':discord:channel:')[-1]
        if ch not in cache and ch != 'heartbeat' and len(ch) > 15:
            channels.add(ch)

for ch in sorted(channels):
    print(ch)
")

TOTAL=$(echo "$UNRESOLVED" | wc -l | tr -d ' ')
RESOLVED=0
FAILED=0

echo "  📋 $TOTAL channels to resolve"

# Resolve each via Discord API
while IFS= read -r ch_id; do
    [ -z "$ch_id" ] && continue
    
    RESPONSE=$(curl -s -H "Authorization: Bot $TOKEN" "https://discord.com/api/v10/channels/$ch_id" 2>/dev/null || echo '{}')
    GUILD=$(echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('guild_id',''))" 2>/dev/null || true)
    
    if [ -n "$GUILD" ]; then
        # Update cache
        python3 -c "
import json
from pathlib import Path
cache = json.loads(Path('$CACHE').read_text())
cache['$ch_id'] = '$GUILD'
Path('$CACHE').write_text(json.dumps(cache, indent=2))
"
        RESOLVED=$((RESOLVED + 1))
    else
        FAILED=$((FAILED + 1))
    fi
    
    # Rate limit: 1 request per 100ms
    sleep 0.1
done <<< "$UNRESOLVED"

echo "  ✅ Resolved: $RESOLVED | ❌ Failed: $FAILED"
echo "  📁 Cache: $CACHE ($(python3 -c "import json; print(len(json.loads(open('$CACHE').read())))" ) entries)"
