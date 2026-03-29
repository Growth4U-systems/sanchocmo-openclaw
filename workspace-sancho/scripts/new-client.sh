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
      echo "Prerequisito: cliente creó servidor desde https://discord.new/9nbefJmU7YKy"
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
mkdir -p "$BRAND_DIR"/{company-brief,market-and-us/{market,competitors,self,swot,summary,ope-canvas,sources},go-to-market/{ecps,positioning/shared,pricing,existing-customer-data,metrics-plan,ecp-validation},brand-identity/{voice-profile,visual-identity},brand-voice,strategic-plan,presentations,operational,_archive,projects}

# Foundation state v3.0 (6 secciones: fast-foundation, market-and-us, go-to-market, brand-identity, metrics-setup, strategic-plan)
cat > "$BRAND_DIR/foundation-state.json" << FJSON
{
  "version": "3.0",
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "sections": {
    "fast-foundation": {
      "status": "not-started",
      "layer": 0,
      "output_dir": "brand/$SLUG/company-brief/",
      "skill": "fast-foundation",
      "pillars": {
        "company-brief": {"status": "not-started", "output_file": "brand/$SLUG/company-brief/current.md", "skill": "fast-foundation"},
        "self-l1": {"status": "not-started", "output_file": "brand/$SLUG/market-and-us/self/current.md", "skill": "fast-foundation"},
        "market-l1": {"status": "not-started", "output_file": "brand/$SLUG/market-and-us/market/current.md", "skill": "fast-foundation"},
        "brand-voice-snapshot": {"status": "not-started", "output_file": "brand/$SLUG/brand-voice/current.md", "skill": "fast-foundation"},
        "niche-basic": {"status": "not-started", "output_file": "brand/$SLUG/go-to-market/ecps/current.md", "skill": "fast-foundation"}
      }
    },
    "company-brief": {
      "status": "not-started",
      "layer": 0,
      "output_dir": "brand/$SLUG/company-brief/",
      "pillars": {
        "company-context": {"status": "not-started", "layer": 0, "skill": "company-context"},
        "business-model": {"status": "not-started", "layer": 0, "skill": "business-model-audit"},
        "budget": {"status": "not-started", "layer": 0, "optional": true, "skill": "budget-assessment"}
      }
    },
    "market-and-us": {
      "status": "not-started",
      "layer": 1,
      "output_dir": "brand/$SLUG/market-and-us/",
      "pillars": {
        "market-analysis": {"status": "not-started", "layer": 1, "requires": ["fast-foundation"], "enriches_with": ["competitor-analysis", "self-analysis"], "skill": "market-intelligence"},
        "competitor-analysis": {"status": "not-started", "layer": 1, "requires": ["fast-foundation"], "enriches_with": ["market-analysis", "self-analysis"], "skill": "competitor-intelligence"},
        "self-analysis": {"status": "not-started", "layer": 1, "requires": ["fast-foundation"], "enriches_with": ["market-analysis", "competitor-analysis"], "skill": "self-intelligence"},
        "market-synthesis": {"status": "not-started", "layer": 2, "requires": ["market-analysis", "competitor-analysis", "self-analysis"], "skill": "market-synthesis"}
      }
    },
    "go-to-market": {
      "status": "not-started",
      "layer": 3,
      "output_dir": "brand/$SLUG/go-to-market/",
      "pillars": {
        "niche-discovery": {"status": "not-started", "layer": 3, "requires": ["market-synthesis"], "enriches_with": ["existing-customer-data"], "skill": "niche-discovery-100x"},
        "existing-customer-data": {"status": "not-started", "layer": 3, "requires": ["fast-foundation"], "optional": true, "skill": "existing-customer-data"},
        "positioning": {"status": "not-started", "layer": 4, "requires": ["niche-discovery"], "skill": "positioning-messaging"},
        "pricing": {"status": "not-started", "layer": 4, "requires": ["niche-discovery"], "enriches_with": ["positioning"], "skill": "pricing-strategy"},
        "ecp-validation": {"status": "not-started", "layer": 4, "requires": ["niche-discovery"], "optional": true, "skill": "ecp-validation"}
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
    },
    "metrics-setup": {
      "status": "not-started",
      "layer": 6,
      "skill": "metrics-setup",
      "requires": ["positioning", "pricing"],
      "pillars": {
        "metrics-setup": {"status": "not-started", "requires": ["positioning", "pricing"], "skill": "metrics-setup"}
      }
    },
    "strategic-plan": {
      "status": "not-started",
      "layer": 7,
      "skill": "strategic-plan",
      "requires": ["metrics-setup"],
      "output_file": "brand/$SLUG/strategic-plan/current.md"
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

# --- 1b. Crear proyectos core obligatorios ---
echo "📋 Creando proyectos core..."

# P00-Fast-Foundation
mkdir -p "$BRAND_DIR/projects/P00-Fast-Foundation-Fast-Foundation"
cat > "$BRAND_DIR/projects/P00-Fast-Foundation-Fast-Foundation/project.json" << PROJJSON
{
  "id": "P00-Fast-Foundation",
  "name": "Fast Foundation",
  "description": "Intake rápido (~30 min): URL → Company Brief + Self L1 + Market L1 + Brand Voice Snapshot + Niche Discovery básico. Suficiente para empezar a ejecutar canales básicos.",
  "approach": "El usuario introduce la URL de su web. El skill fast-foundation scrapea, pre-rellena 5 docs lite, y valida con el usuario. Si no hay URL, modo conversacional (6 preguntas).",
  "objective": {
    "description": "5 docs lite generados y validados",
    "metric": "docs_completed",
    "baseline": 0,
    "target": 5,
    "unit": " docs"
  },
  "origin": "onboarding",
  "phase": -1,
  "category": "foundation",
  "review_date": null,
  "status": "active"
}
PROJJSON

cat > "$BRAND_DIR/projects/P00-Fast-Foundation-Fast-Foundation/tasks.json" << TASKSJSON
[
  {
    "id": "P00-FF-T01",
    "name": "L0 — Company Context",
    "description": "Contexto completo de la empresa: qué hace, modelo de negocio, equipo, diferenciadores.",
    "deliverable": "company-brief/company-context.md",
    "done_criteria": "Documento generado y validado.",
    "depends_on": null,
    "owner": "Sancho",
    "status": "pending",
    "channel": "strategy",
    "type": "foundation",
    "skill": "company-context",
    "pillar": "company-context",
    "section": "company-brief"
  },
  {
    "id": "P00-FF-T02",
    "name": "L0 — Business Model Audit",
    "description": "Auditoría del modelo de negocio: revenue streams, pricing, unit economics.",
    "deliverable": "company-brief/business-model.md",
    "done_criteria": "Modelo documentado con métricas clave.",
    "depends_on": null,
    "owner": "Sancho",
    "status": "pending",
    "channel": "strategy",
    "type": "foundation",
    "skill": "business-model-audit",
    "pillar": "business-model",
    "section": "company-brief"
  },
  {
    "id": "P00-FF-T03",
    "name": "L1 — Niche Discovery 100x",
    "description": "Descubrimiento de nichos y ECPs básicos a partir del contexto de empresa.",
    "deliverable": "go-to-market/ecps/current.md con ECPs iniciales.",
    "done_criteria": "ECPs básicos identificados.",
    "depends_on": "P00-FF-T01",
    "owner": "Sancho",
    "status": "pending",
    "channel": "strategy",
    "type": "foundation",
    "skill": "niche-discovery-100x",
    "pillar": "niche-discovery",
    "section": "go-to-market"
  }
]
TASKSJSON

# P00-Full-Foundation
mkdir -p "$BRAND_DIR/projects/P00-Full-Foundation-Full-Foundation"
cat > "$BRAND_DIR/projects/P00-Full-Foundation-Full-Foundation/project.json" << PROJJSON2
{
  "id": "P00-Full-Foundation",
  "name": "Full Foundation",
  "description": "Foundation completa: research profundo de mercado, competencia, self-analysis, síntesis SWOT, positioning, pricing, brand voice y visual identity. Profundiza los docs lite de Fast Foundation.",
  "approach": "Tras Fast Foundation, cada skill lee su doc lite como hydration y profundiza: Market Intelligence (3+ fuentes), Competitor Intelligence (3 lenses), Self Intelligence (3 lenses), Market Synthesis (SWOT+Summary+OPE Canvas+Presentación), Niche Discovery (100+ empresas), Positioning (por ECP), Pricing, Brand Voice (full guide), Visual Identity.",
  "objective": {
    "description": "Foundation completa ejecutada",
    "metric": "pillars_completed",
    "baseline": 0,
    "target": 9,
    "unit": " pillars"
  },
  "origin": "onboarding",
  "phase": -1,
  "category": "foundation",
  "review_date": null,
  "status": "pending"
}
PROJJSON2

cat > "$BRAND_DIR/projects/P00-Full-Foundation-Full-Foundation/tasks.json" << TASKSJSON2
[
  {
    "id": "P00-FUL-T01",
    "name": "L2 — Market Intelligence",
    "description": "Research profundo del mercado: tamaño, tendencias, regulación, tecnología, comportamiento de compradores.",
    "deliverable": "market-and-us/market/current.md con análisis completo del mercado.",
    "done_criteria": "Análisis aprobado con datos verificables.",
    "depends_on": "P00-FF-T01",
    "owner": "Sancho",
    "status": "pending",
    "channel": "strategy",
    "type": "foundation",
    "skill": "market-intelligence",
    "pillar": "market-analysis",
    "section": "market-and-us"
  },
  {
    "id": "P00-FUL-T02",
    "name": "L2 — Competitor Intelligence",
    "description": "Mapear competidores principales con análisis 3-Lens.",
    "deliverable": "market-and-us/competitors/ con fichas y battle cards.",
    "done_criteria": "Mínimo 5 competidores mapeados.",
    "depends_on": "P00-FF-T01",
    "owner": "Sancho",
    "status": "pending",
    "channel": "strategy",
    "type": "foundation",
    "skill": "competitor-intelligence",
    "pillar": "competitor-analysis",
    "section": "market-and-us"
  },
  {
    "id": "P00-FUL-T03",
    "name": "L2 — Self Intelligence",
    "description": "Análisis interno: 3 lenses (autopercepción, terceros, consumidores).",
    "deliverable": "market-and-us/self/current.md",
    "done_criteria": "3 lenses completas. Assets únicos identificados.",
    "depends_on": "P00-FF-T01",
    "owner": "Sancho",
    "status": "pending",
    "channel": "strategy",
    "type": "foundation",
    "skill": "self-intelligence",
    "pillar": "self-analysis",
    "section": "market-and-us"
  },
  {
    "id": "P00-FUL-T04",
    "name": "L2 — SWOT",
    "description": "SWOT+TOWS con ICE prioritization + Market Summary + OPE Canvas.",
    "deliverable": "swot/current.md + summary/current.md + ope-canvas/current.md.",
    "done_criteria": "SWOT aprobado. Oportunidades y amenazas priorizadas.",
    "depends_on": "P00-FUL-T01,P00-FUL-T02,P00-FUL-T03",
    "owner": "Sancho",
    "status": "pending",
    "channel": "strategy",
    "type": "foundation",
    "skill": "swot-analysis",
    "pillar": "market-synthesis",
    "section": "market-and-us"
  },
  {
    "id": "P00-FUL-T05",
    "name": "L3 — Positioning & Messaging",
    "description": "Posicionamiento diferenciado, propuesta de valor y messaging framework por ECP.",
    "deliverable": "go-to-market/positioning/{ecp-slug}/current.md por ECP.",
    "done_criteria": "Posicionamiento aprobado. Mensajes diferenciados para cada ECP.",
    "depends_on": "P00-FUL-T04",
    "owner": "Sancho",
    "status": "pending",
    "channel": "strategy",
    "type": "foundation",
    "skill": "positioning-messaging",
    "pillar": "positioning",
    "section": "go-to-market"
  },
  {
    "id": "P00-FUL-T06",
    "name": "L4 — Pricing Strategy",
    "description": "Modelo de pricing, tiers, value metrics y hooks de conversión.",
    "deliverable": "go-to-market/pricing/current.md",
    "done_criteria": "Pricing aprobado. Tiers documentados.",
    "depends_on": "P00-FUL-T05",
    "owner": "Sancho",
    "status": "pending",
    "channel": "strategy",
    "type": "foundation",
    "skill": "pricing-strategy",
    "pillar": "pricing",
    "section": "go-to-market"
  },
  {
    "id": "P00-FUL-T07",
    "name": "L5 — Brand Voice",
    "description": "Full Voice Guide + AI Brand Kit + adaptación por ECP/canal.",
    "deliverable": "brand-voice/current.md",
    "done_criteria": "Voice guide aprobada. AI Brand Kit ready.",
    "depends_on": "P00-FUL-T05",
    "owner": "Sancho",
    "status": "pending",
    "channel": "strategy",
    "type": "foundation",
    "skill": "brand-voice",
    "pillar": "brand-voice",
    "section": "brand-identity"
  },
  {
    "id": "P00-FUL-T08",
    "name": "L5 — Visual Identity",
    "description": "Sistema visual: paleta, tipografía, logo guidelines, templates.",
    "deliverable": "brand-identity/visual-identity/current.md",
    "done_criteria": "Visual identity aprobada. Assets exportados.",
    "depends_on": "P00-FUL-T07",
    "owner": "Sancho",
    "status": "pending",
    "channel": "strategy",
    "type": "foundation",
    "skill": "visual-identity",
    "pillar": "visual-identity",
    "section": "brand-identity"
  }
]
TASKSJSON2

# P00-Metrics-Setup
mkdir -p "$BRAND_DIR/projects/P00-Metrics-Metrics-Setup"
cat > "$BRAND_DIR/projects/P00-Metrics-Metrics-Setup/project.json" << PROJJSON_MS
{
  "id": "P00-Metrics",
  "name": "Métricas y Conexiones",
  "description": "Definir plan de métricas, conectar herramientas de analytics/ads/CRM, y generar el dashboard de Mission Control.",
  "approach": "Clasificar el negocio por arquetipo (SaaS, Lead-to-Sale, etc.), definir KPIs por nivel, conectar integraciones (GA4, Meta Ads, CRM) vía Mission Control, y generar metrics-plan.json para el dashboard.",
  "objective": {
    "description": "Dashboard de métricas operativo con integraciones conectadas",
    "metric": "integrations_connected",
    "baseline": 0,
    "target": 3,
    "unit": " integrations"
  },
  "origin": "onboarding",
  "phase": -1,
  "category": "foundation",
  "review_date": null,
  "status": "pending"
}
PROJJSON_MS

cat > "$BRAND_DIR/projects/P00-Metrics-Metrics-Setup/tasks.json" << TASKSJSON_MS
{
  "project_id": "P00-Metrics",
  "tasks": [
    {
      "id": "P00-MET-T01",
      "name": "L6 — Acquisition Metrics Plan",
      "description": "Definir métricas clave de adquisición por canal: CPL, CAC, conversion rates, pipeline velocity.",
      "deliverable": "go-to-market/metrics-plan.md con KPIs por canal.",
      "done_criteria": "Métricas definidas y aprobadas. Tareas de conexión generadas automáticamente.",
      "depends_on": "P00-FUL-T08",
      "owner": "Sancho",
      "status": "pending",
      "channel": "intelligence",
      "type": "foundation",
      "skill": "metrics-setup",
      "pillar": "metrics-setup",
      "section": "metrics-setup"
    }
  ]
}
TASKSJSON_MS

# P00-Strategic-Plan
mkdir -p "$BRAND_DIR/projects/P00-Strategic-Plan-Strategic-Plan"
cat > "$BRAND_DIR/projects/P00-Strategic-Plan-Strategic-Plan/project.json" << PROJJSON3
{
  "id": "P00-Strategic-Plan",
  "name": "Strategic Plan",
  "description": "Creación y ejecución del plan estratégico completo: análisis SWOT, priorización de canales, roadmap de proyectos y KPIs.",
  "approach": "Tras Full Foundation, sintetizamos todo el contexto en un SWOT ejecutivo. Priorizamos canales (Outreach, Contenido, Partners, Ads) según ajuste al ICP y recursos. Creamos roadmap de proyectos con fases 0-3. Definimos métricas de éxito. Ejecutamos los proyectos del plan.",
  "objective": {
    "description": "Plan estratégico creado y proyectos en ejecución",
    "metric": "plan_status",
    "baseline": "not-started",
    "target": "executing",
    "unit": ""
  },
  "origin": "onboarding",
  "phase": -1,
  "category": "foundation",
  "review_date": null,
  "status": "pending"
}
PROJJSON3

cat > "$BRAND_DIR/projects/P00-Strategic-Plan-Strategic-Plan/tasks.json" << TASKSJSON3
[
  {
    "id": "P00-SP-T01",
    "name": "L7 — Crear Strategic Plan",
    "description": "Generar plan estratégico: SWOT ejecutivo, channel prioritization, roadmap de proyectos, KPIs.",
    "deliverable": "strategic-plan/current.md",
    "done_criteria": "Plan aprobado. Proyectos P01+ creados en Mission Control.",
    "depends_on": "P00-MET-T01",
    "owner": "Sancho",
    "status": "pending",
    "channel": "strategy",
    "type": "foundation",
    "skill": "strategic-plan",
    "pillar": "strategic-plan",
    "section": "strategic-plan"
  },
  {
    "id": "P00-SP-T02",
    "name": "Ejecutar Strategic Plan",
    "description": "Crear los proyectos P01+ del roadmap con tareas, skills y canales asignados.",
    "deliverable": "Proyectos P01+ creados en MC con tareas detalladas.",
    "done_criteria": "Proyectos creados y en ejecución.",
    "depends_on": "P00-SP-T01",
    "owner": "Sancho",
    "status": "pending",
    "channel": "strategy",
    "type": "execution",
    "skill": "strategic-plan"
  }
]
TASKSJSON3

# Registry
cat > "$BRAND_DIR/projects/registry.json" << REGJSON
{
  "projects": [
    {"id": "P00-Fast-Foundation", "slug": "Fast-Foundation", "name": "Fast Foundation (L0-L1)", "strategy": "Foundation — Layer 0-1", "status": "pending", "phase": -1, "category": "foundation"},
    {"id": "P00-Full-Foundation", "slug": "Full-Foundation", "name": "Full Foundation (L2-L5)", "strategy": "Foundation — Layer 2-5", "status": "pending", "phase": -1, "category": "foundation"},
    {"id": "P00-Metrics", "slug": "Metrics-Setup", "name": "Métricas y Conexiones", "strategy": "Foundation — Metrics Layer", "status": "pending", "phase": -1, "category": "foundation"},
    {"id": "P00-Strategic-Plan", "slug": "Strategic-Plan", "name": "Strategic Plan", "strategy": "Foundation — Strategic Planning", "status": "pending", "phase": -1, "category": "foundation"}
  ]
}
REGJSON

echo "   ✅ Proyectos core creados (P00-Fast-Foundation, P00-Full-Foundation, P00-Metrics-Setup, P00-Strategic-Plan)"

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

# --- 7. Aplicar restricciones de seguridad al guild ---
echo "🔒 Aplicando restricciones de seguridad..."
ALFONSO="1334604955687977042"
MARTIN="1402171221747040369"
PHILIPPE="1475772310614048858"

python3 -c "
import json

config_path = '$HOME/.openclaw/openclaw.json'
with open(config_path, 'r') as f:
    config = json.load(f)

guild = config['channels']['discord']['guilds'].get('$GUILD')
if guild:
    guild['tools'] = {'deny': ['gateway', 'exec', 'cron']}
    guild['toolsBySender'] = {
        '$ALFONSO': {'alsoAllow': ['gateway', 'exec', 'cron']},
        '$MARTIN': {'alsoAllow': ['gateway', 'exec', 'cron']},
        '$PHILIPPE': {'alsoAllow': ['gateway', 'exec', 'cron']}
    }
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    print('   ✅ tools.deny + admin overrides aplicados')
else:
    print('   ⚠️ Guild no encontrado en config — aplicar manualmente')
"

# --- 8. Gateway restart ---
echo "🔄 Restarting gateway..."
if command -v openclaw &>/dev/null; then
  openclaw gateway restart 2>/dev/null && echo "   ✅ Gateway reiniciado" || echo "   ⚠️ Gateway restart falló — reiniciar manualmente"
else
  echo "   ⚠️ openclaw CLI no encontrado — reiniciar gateway manualmente"
fi

# --- 9. Instrucciones ---
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Cliente '$NAME' onboarded!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📁 Brand dir:  $BRAND_DIR"
echo "🔗 Guild ID:   $GUILD"
echo ""
echo "🎯 El cliente puede empezar Foundation en #onboarding"
