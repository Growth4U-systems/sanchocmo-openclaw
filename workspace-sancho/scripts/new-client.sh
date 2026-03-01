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
mkdir -p "$BRAND_DIR"/{intelligence/meetings,daily-pulse,_archive}

# Foundation state (15 pilares, todos not-started)
cat > "$BRAND_DIR/foundation-state.json" << FJSON
{
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "pillars": {
    "company-context": {"status": "not-started"},
    "business-model": {"status": "not-started"},
    "budget": {"status": "not-started"},
    "self-intelligence": {"status": "not-started"},
    "ope-canvas": {"status": "not-started"},
    "market": {"status": "not-started"},
    "competitors": {"status": "not-started"},
    "swot-analysis": {"status": "not-started"},
    "niche-discovery-100x": {"status": "not-started"},
    "ecp-validation": {"status": "not-started"},
    "existing-customer-data": {"status": "not-started"},
    "positioning": {"status": "not-started"},
    "pricing": {"status": "not-started"},
    "brand-voice": {"status": "not-started"},
    "visual-identity": {"status": "not-started"}
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

# --- 6. Instrucciones ---
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Cliente '$NAME' onboarded!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📁 Brand dir:  $BRAND_DIR"
echo "🔗 Guild ID:   $GUILD"
echo ""
echo "⚠️  PENDIENTE (manual por ahora):"
echo "1. Añadir guild + channel bindings a openclaw.json"
echo "   (canal IDs del nuevo servidor Discord)"
echo "2. Añadir systemPrompts con [CLIENTE: $NAME | slug: $SLUG]"
echo "3. openclaw gateway restart"
echo "4. Regenerar MC: python3 $WORKSPACE/scripts/regenerate.py"
echo ""
echo "🎯 El cliente puede empezar Foundation en #onboarding"
