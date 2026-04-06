#!/bin/bash
# MC Smoke Test — validates Mission Control after changes
# Run: bash scripts/mc-smoke-test.sh
# Checks:
# 1. Brace balance in HTML
# 2. mc-server.js syntax
# 3. mc-data.js regeneration
# 4. Server starts and responds
# 5. API endpoints return valid JSON
# 6. No JS errors on page load (via console)

cd "$(dirname "$0")/.."
PASS=0
FAIL=0

ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "🔍 MC Smoke Test"
echo "================================"

# 1. Brace balance
echo ""
echo "1. Brace balance in mission-control.html"
BRACES=$(python3 -c "
import re
html = open('mission-control.html').read()
scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
big = [s for s in scripts if len(s) > 10000]
for s in big:
    o = s.count('{')
    c = s.count('}')
    if o != c: print(f'MISMATCH {o} vs {c}'); exit(1)
print('OK')
" 2>&1)
if [ "$BRACES" = "OK" ]; then ok "Braces balanced"; else fail "Braces: $BRACES"; fi

# 2. Server syntax
echo ""
echo "2. mc-server.js syntax"
if node -c scripts/mc-server.js 2>/dev/null; then ok "Syntax OK"; else fail "Syntax error"; fi

# 3. Regenerate
echo ""
echo "3. mc-data.js regeneration"
REGEN=$(python3 scripts/regenerate.py 2>&1)
if echo "$REGEN" | grep -q "Written to"; then ok "Regenerated"; else fail "Regenerate: $REGEN"; fi

# 4. Data validation
echo ""
echo "4. mc-data.js content"
DATA_CHECK=$(python3 -c "
import json, re
content = open('memory/mc/mc-data.js').read()
match = re.search(r'const MC_DATA = (\{.*\});', content, re.DOTALL)
data = json.loads(match.group(1))
clients = data['foundation']['clients']
issues = []
for slug, c in clients.items():
    if not c.get('sections'): issues.append(f'{slug}: no sections')
    # Only check projects/ideas for clients with 20+ pillars (mature clients)
    if c.get('total', 0) > 20:
        if not c.get('projects'): issues.append(f'{slug}: no projects (mature client)')
        if not c.get('ideas'): issues.append(f'{slug}: no ideas (mature client)')
if issues:
    print('ISSUES: ' + '; '.join(issues))
else:
    print('OK: ' + str(len(clients)) + ' clients with data')
" 2>&1)
if echo "$DATA_CHECK" | grep -q "^OK"; then ok "$DATA_CHECK"; else fail "$DATA_CHECK"; fi

# 5. Server responds
echo ""
echo "5. Server health"
# Check if running, start if not
if ! curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:18790/" 2>/dev/null | grep -q "200\|302\|403"; then
    echo "   Starting server..."
    nohup node scripts/mc-server.js > /tmp/mc-server.log 2>&1 &
    sleep 3
fi

ADMIN_TOKEN=$(python3 -c "
import json
c = json.load(open('clients.json'))
print(c.get('adminToken',''))
" 2>/dev/null)

if [ -z "$ADMIN_TOKEN" ]; then fail "No adminToken in clients.json"; else
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:18790/admin/$ADMIN_TOKEN/" 2>/dev/null)
    if [ "$STATUS" = "200" ]; then ok "Admin panel responds (200)"; else fail "Admin panel: HTTP $STATUS"; fi
fi

# 6. API endpoints
echo ""
echo "6. API endpoints"
SLUGS=$(python3 -c "
import json
c = json.load(open('clients.json'))
for cl in c.get('clients',[]):
    if cl.get('active',True): print(cl['slug'])
" 2>/dev/null | head -3)

for SLUG in $SLUGS; do
    # Projects API
    PROJ=$(curl -s "http://127.0.0.1:18790/admin/$ADMIN_TOKEN/api/projects/$SLUG" 2>/dev/null)
    if echo "$PROJ" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('ok')" 2>/dev/null; then
        ok "Projects API ($SLUG)"
    else
        fail "Projects API ($SLUG): $(echo $PROJ | head -c 100)"
    fi
    
    # Chat threads API
    CHAT=$(curl -s "http://127.0.0.1:18790/admin/$ADMIN_TOKEN/api/chat/threads?slug=$SLUG" 2>/dev/null)
    if echo "$CHAT" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('ok')" 2>/dev/null; then
        ok "Chat API ($SLUG)"
    else
        fail "Chat API ($SLUG)"
    fi
    break  # Only test first active client
done

# 7. PAGE_INIT registry completeness
echo ""
echo "7. Page registry"
PAGES_CHECK=$(python3 << 'PYEOF'
import re
html = open('mission-control.html').read()
page_ids = set(re.findall(r'id="page-([a-z-]+)"', html))
nav_pages = set(re.findall(r"showPage\(['\"]([a-z-]+)['\"]", html))
init_entries = set(re.findall(r"'([a-z-]+)'\s*:\s*\(\)\s*=>", html))
no_init_needed = {'agents', 'campaigns', 'data', 'tasks', 'apis', 'changelog', 'guide', 'skills'}
missing = (nav_pages - init_entries) - no_init_needed
if missing:
    print('MISSING_INIT: ' + ', '.join(sorted(missing)))
else:
    print('OK: ' + str(len(init_entries)) + ' pages with init')
PYEOF
)
if echo "$PAGES_CHECK" | grep -q "^OK"; then ok "$PAGES_CHECK"; else fail "$PAGES_CHECK"; fi

# Summary
echo ""
echo "================================"
echo "Results: $PASS passed, $FAIL failed"
if [ $FAIL -gt 0 ]; then echo "❌ SMOKE TEST FAILED"; exit 1; fi
echo "✅ ALL TESTS PASSED"
