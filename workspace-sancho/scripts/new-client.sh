#!/usr/bin/env bash
set -euo pipefail

# new-client.sh — Onboarding de nuevo cliente SanchoCMO
# Prerequisito: cliente ya creó servidor Discord desde plantilla
# y añadió el bot via OAuth
#
# Uso: new-client.sh --slug "slug" --name "Nombre" --guild "GUILD_ID"

WORKSPACE="$HOME/.openclaw/workspace-sancho"
SUPABASE_URL="https://psapmujzxhaxraphddlv.supabase.co"
SKEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzYXBtdWp6eGhheHJhcGhkZGx2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTg5MDE1MSwiZXhwIjoyMDg3NDY2MTUxfQ.uDPfDOg23MfjtORZBXitIUpLNpTRR8ahMqjvJkmg6wE"

# --- Parse args ---
SLUG="" NAME="" GUILD=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug)  SLUG="$2"; shift 2 ;;
    --name)  NAME="$2"; shift 2 ;;
    --guild) GUILD="$2"; shift 2 ;;
    --help|-h)
      echo "Uso: new-client.sh --slug <slug> --name <nombre> --guild <guild_id>"
      echo ""
      echo "Prerequisito: cliente creó servidor desde https://discord.new/mnXBVkNQqFBk"
      echo "              y añadió bot desde https://discord.com/oauth2/authorize?client_id=1475635406610628769&permissions=8&integration_type=0&scope=bot"
      exit 0 ;;
    *) echo "❌ Argumento desconocido: $1"; exit 1 ;;
  esac
done

# --- Validación ---
if [[ -z "$SLUG" || -z "$NAME" || -z "$GUILD" ]]; then
  echo "❌ Faltan argumentos. Uso:"
  echo "   new-client.sh --slug nuevo-cliente --name 'Nuevo Cliente' --guild 123456789"
  exit 1
fi

if [[ ! "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "❌ Slug inválido '$SLUG'. Usa solo minúsculas, números y guiones."
  exit 1
fi

BRAND_DIR="$WORKSPACE/brand/$SLUG"
if [[ -d "$BRAND_DIR" ]]; then
  echo "❌ El cliente '$SLUG' ya existe en $BRAND_DIR"
  exit 1
fi

echo "🔨 Onboarding: $NAME (slug: $SLUG, guild: $GUILD)"

# --- 1. Crear estructura de archivos ---
echo "📁 Creando estructura..."
mkdir -p "$BRAND_DIR"/{company-brief,market-and-us/{market,competitors,self,swot,summary,ope-canvas,sources},go-to-market/{ecps,positioning/shared,pricing,existing-customer-data},brand-identity/{voice-profile,visual-identity},operational,_archive}

# Foundation state v2.0 (4 secciones, 12 pilares)
cat > "$BRAND_DIR/foundation-state.json" << FJSON
{
  "version": "2.0",
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "sections": {
    "company-brief": {
      "status": "not-started",
      "layer": 0,
      "output_dir": "brand/$SLUG/company-brief/",
      "approved_at": null,
      "skills": {
        "company-context": {"status": "not-started"},
        "business-model": {"status": "not-started"},
        "budget": {"status": "not-started"}
      }
    },
    "market-and-us": {
      "status": "not-started",
      "layer": 1,
      "output_dir": "brand/$SLUG/market-and-us/",
      "pillars": {
        "market-analysis": {"status": "not-started", "layer": 1, "requires": ["company-brief"], "enriches_with": ["competitor-analysis", "self-analysis"], "skill": "market-intelligence"},
        "competitor-analysis": {"status": "not-started", "layer": 1, "requires": ["company-brief"], "enriches_with": ["market-analysis", "self-analysis"], "output_files": [], "skill": "competitor-intelligence"},
        "self-analysis": {"status": "not-started", "layer": 1, "requires": ["company-brief"], "enriches_with": ["market-analysis", "competitor-analysis"], "skill": "self-intelligence"},
        "swot": {"status": "not-started", "layer": 2, "requires": ["market-analysis", "competitor-analysis", "self-analysis"], "skill": "swot-analysis"}
      },
      "syntheses": {
        "summary": {"status": "not-generated", "generated_by": "orchestrator", "requires": ["market-analysis", "competitor-analysis", "self-analysis"]},
        "ope-canvas": {"status": "not-generated", "generated_by": "orchestrator", "requires": ["market-analysis", "competitor-analysis", "self-analysis"]}
      }
    },
    "go-to-market": {
      "status": "not-started",
      "layer": 3,
      "output_dir": "brand/$SLUG/go-to-market/",
      "pillars": {
        "niche-discovery": {"status": "not-started", "layer": 3, "requires": ["swot"], "enriches_with": ["existing-customer-data"], "skill": "niche-discovery-100x"},
        "existing-customer-data": {"status": "not-started", "layer": 3, "requires": ["company-brief"], "optional": true, "skill": "existing-customer-data"},
        "positioning": {"status": "not-started", "layer": 4, "requires": ["niche-discovery"], "skill": "positioning-messaging"},
        "pricing": {"status": "not-started", "layer": 4, "requires": ["niche-discovery"], "enriches_with": ["positioning"], "skill": "pricing-strategy"},
        "metrics-plan": {"status": "not-started", "layer": 4, "requires": ["company-brief"], "enriches_with": ["niche-discovery"], "skill": "acquisition-metrics-plan"},
        "ecp-validation": {"status": "not-started", "layer": 4, "requires": ["niche-discovery"], "optional": true, "skill": "ecp-validation"}
      },
      "syntheses": {
        "messaging-summary": {"status": "not-generated", "generated_by": "orchestrator", "requires": ["positioning"]}
      }
    },
    "brand-identity": {
      "status": "not-started",
      "layer": 5,
      "output_dir": "brand/$SLUG/brand-identity/",
      "pillars": {
        "brand-voice": {"status": "not-started", "layer": 5, "requires": ["positioning"], "skill": "brand-voice"},
        "visual-identity": {"status": "not-started", "layer": 5, "requires": ["brand-voice"], "skill": "visual-identity"}
      }
    }
  }
}
FJSON

# Integrations (empty)
cat > "$BRAND_DIR/integrations.json" << IJSON
{
  "client": "$SLUG",
  "services": []
}
IJSON

echo "   ✅ Archivos creados"

# --- 2. Insertar en Supabase ---
echo "🗄️ Insertando en Supabase..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$SUPABASE_URL/rest/v1/clients" \
  -H "apikey: $SKEY" \
  -H "Authorization: Bearer $SKEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{\"slug\":\"$SLUG\",\"name\":\"$NAME\",\"discord_guild_id\":\"$GUILD\",\"phase\":0}")

if [[ "$HTTP_CODE" == "201" ]]; then
  echo "   ✅ Cliente insertado en Supabase"
else
  echo "   ⚠️ Supabase HTTP $HTTP_CODE (puede que ya exista)"
fi

# --- 3. Actualizar clients.json ---
echo "📋 Actualizando clients.json..."
CLIENTS_FILE="$WORKSPACE/clients.json"
python3 << PYJSON
import json
with open("$CLIENTS_FILE") as f:
    data = json.load(f)
# Check if already exists
slugs = [c["slug"] for c in data.get("clients", [])]
if "$SLUG" not in slugs:
    data.setdefault("clients", []).append({
        "slug": "$SLUG",
        "name": "$NAME",
        "discord_guild_id": "$GUILD",
        "phase": 0,
        "paths": {"brand": "brand/"},
        "supabase": {
            "url": "$SUPABASE_URL",
            "anon_key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzYXBtdWp6eGhheHJhcGhkZGx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4OTAxNTEsImV4cCI6MjA4NzQ2NjE1MX0.RxanIQCJtjGfCUL_X0MqPi2IdGkXOkmfaEAJZvQJblI"
        }
    })
    with open("$CLIENTS_FILE", "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("   ✅ clients.json actualizado")
else:
    print("   ⏭️ Ya existe en clients.json")
PYJSON

# --- 4. Actualizar clients.js (Mission Control) ---
echo "🖥️ Actualizando clients.js..."
CLIENTS_JS="$WORKSPACE/clients.js"
if grep -q "\"$SLUG\"" "$CLIENTS_JS"; then
  echo "   ⏭️ Ya existe en clients.js"
else
  # Insert new client entry before TEMPLATE comment
  NEW_ENTRY="  \"$SLUG\": {\n    name: \"$NAME\",\n    emoji: \"🏢\",\n    url: \"\",\n    discord_guild: \"$GUILD\",\n    supabase: {\n      url: \"https://psapmujzxhaxraphddlv.supabase.co\",\n      anon_key: \"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzYXBtdWp6eGhheHJhcGhkZGx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4OTAxNTEsImV4cCI6MjA4NzQ2NjE1MX0.RxanIQCJtjGfCUL_X0MqPi2IdGkXOkmfaEAJZvQJblI\",\n    },\n    workspace: \"~/.openclaw/workspace-sancho\",\n    phase: 0,\n  },"
  # Use python for safe text insertion
  python3 -c "
c = open('$CLIENTS_JS').read()
c = c.replace('  // === TEMPLATE:', '$NEW_ENTRY\n\n  // === TEMPLATE:')
open('$CLIENTS_JS','w').write(c)
"
  echo "   ✅ clients.js actualizado"
fi

# --- 5. Regenerar MC ---
echo "🔄 Regenerando Mission Control..."
python3 "$WORKSPACE/scripts/regenerate.py" 2>/dev/null
echo "   ✅ MC regenerado"

# --- 6. Auto-bind Discord channels + systemPrompts ---
echo "🔗 Auto-binding Discord channels + systemPrompts..."
AUTOBIND="$WORKSPACE/scripts/auto-bind.py"
if [[ -f "$AUTOBIND" ]]; then
  python3 "$AUTOBIND" "$GUILD" --name "$NAME" --slug "$SLUG" --apply
  echo "   ✅ Guild config + systemPrompts aplicados"
else
  echo "   ⚠️ auto-bind.py no encontrado — config manual necesario"
fi

# --- 7. Gateway restart ---
echo "🔄 Restarting gateway..."
if command -v openclaw &>/dev/null; then
  openclaw gateway restart 2>/dev/null && echo "   ✅ Gateway reiniciado" || echo "   ⚠️ Gateway restart falló — reiniciar manualmente"
else
  echo "   ⚠️ openclaw CLI no encontrado — reiniciar gateway manualmente"
fi

# --- 8. Instrucciones ---
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Cliente '$NAME' onboarded!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📁 Brand dir:  $BRAND_DIR"
echo "🔗 Guild ID:   $GUILD"
echo ""
echo "🎯 El cliente puede empezar Foundation en #onboarding"
