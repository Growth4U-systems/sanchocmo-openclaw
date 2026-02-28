#!/bin/bash
# Verify SOUL.md cleanup — run from terminal
# Usage: bash ~/.openclaw/workspace-sancho/scripts/verify-soul-cleanup.sh

echo "🔄 Step 1: Restarting gateway..."
openclaw gateway restart
sleep 5

echo ""
echo "✅ Gateway restarted. Now waiting 10s for Discord reconnect..."
sleep 10

echo ""
echo "📊 Step 2: Checking status..."
openclaw status 2>&1 | grep -E "Gateway|Discord"

echo ""
echo "📝 Step 3: Verification checklist"
echo ""
echo "Now go to Discord and do these tests:"
echo ""
echo "1️⃣  In EACH test channel, type /new first to reset the session"
echo ""
echo "2️⃣  Test 1 — #content: Write 'Genera un calendario editorial'"
echo "   ✅ Expected: Sancho creates a thread, responds INSIDE it"
echo "   ❌ Fail if: Sancho responds directly in channel"
echo ""
echo "3️⃣  Test 2 — #brand: Write 'Muéstrame el positioning'"  
echo "   ✅ Expected: URL like https://sancho-cmo.taild48df2.ts.net/mc/docs/brand/..."
echo "   ❌ Fail if: filesystem path like brand/hospital-capilar/positioning/current.md"
echo ""
echo "4️⃣  Test 3 — #onboarding: Write 'Ejecuta visual-identity'"
echo "   ✅ Expected: ⛔ Block — brand-voice not approved yet"
echo "   ❌ Fail if: Sancho starts executing without checking dependencies"
echo ""
echo "5️⃣  Test 4 — #content: Write 'Escribe un artículo SEO sobre trasplante capilar FUE'"
echo "   ✅ Expected: Sancho spawns Escudero with persona redactor"
echo "   ❌ Fail if: Sancho writes the full article itself (wastes Opus tokens)"
echo ""
echo "6️⃣  Test 5 — Any channel: Check message count in threads"
echo "   ✅ Expected: Max 2 messages per thread (start + result)"
echo "   ❌ Fail if: intermediate messages like 'Voy a leerlo...', 'Tengo los datos...'"
echo ""
echo "📋 Report results to Cervantes in webchat."
