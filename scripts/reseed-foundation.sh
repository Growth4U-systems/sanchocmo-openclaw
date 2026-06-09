#!/usr/bin/env bash
#
# reseed-foundation.sh — Reinstala el scaffolding canónico de Foundation
# en un cliente existente, archivando el estado actual.
#
# Extraído de new-client.sh (la sección que crea proyectos core +
# foundation-state.json v3). NO toca Supabase, Discord, ni nada externo.
# Sólo escribe en disco bajo $WORKSPACE/brand/$SLUG/.
#
# Uso:
#   reseed-foundation.sh --slug innatica --name "Innatica"
#   reseed-foundation.sh --slug innatica --name "Innatica" --dry-run
#
# Variables:
#   WORKSPACE  ruta a workspace-sancho (default: $HOME/.openclaw/workspace-sancho
#                                       o $OPENCLAW_WORKSPACE si está seteado)
#
# Qué hace:
#   1. Archiva en brand/$SLUG/_archive/pre-reseed-<TS>/:
#        - foundation-state.json (si existe)
#        - todos los proyectos en projects/ excepto los que matchean canónico
#        - directorios de contenido custom (company-brief, market-and-us,
#          brand-identity, go-to-market, operational, brand-book) si existen
#        - foundation-tasks.md y similares sueltos en projects/
#   2. Preserva intactos: chat/, _sources/, costs.json, monitoring/,
#      metrics/, idea-generation/, client-config.json, integrations.json
#   3. Instala canónico (sobrescribe si choca):
#        - projects/P00-Fast-Foundation/{project,tasks}.json
#        - projects/P00-Full-Foundation/{project,tasks}.json
#        - projects/P00-Metrics/{project,tasks}.json
#        - projects/P00-Strategic-Plan/{project,tasks}.json
#        - foundation-state.json (v3 con todos los pilares not-started)
#
# Salida: imprime checkpoint por paso. Exit 0 = ok.
#
set -euo pipefail

WORKSPACE="${OPENCLAW_WORKSPACE:-$HOME/.openclaw/workspace-sancho}"
SLUG=""
NAME=""
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug)    SLUG="$2"; shift 2 ;;
    --name)    NAME="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --help|-h)
      sed -n '2,40p' "$0"
      exit 0 ;;
    *) echo "❌ Argumento desconocido: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$SLUG" || -z "$NAME" ]]; then
  echo "❌ Faltan argumentos. Uso: reseed-foundation.sh --slug <slug> --name <nombre> [--dry-run]" >&2
  exit 1
fi

if [[ ! "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "❌ Slug inválido '$SLUG'. Sólo minúsculas, números, guiones." >&2
  exit 1
fi

BRAND_DIR="$WORKSPACE/brand/$SLUG"
if [[ ! -d "$BRAND_DIR" ]]; then
  echo "❌ El cliente '$SLUG' no existe en $BRAND_DIR" >&2
  echo "   (Para crear un cliente nuevo usá new-client.sh)" >&2
  exit 1
fi

TS=$(date -u +%Y%m%dT%H%M%SZ)
ARCHIVE_DIR="$BRAND_DIR/_archive/pre-reseed-$TS"

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "  [dry-run] $*"
  else
    eval "$@"
  fi
}

echo "🔧 Reseed Foundation: $NAME (slug=$SLUG)"
echo "   workspace: $WORKSPACE"
echo "   archive:   $ARCHIVE_DIR"
[[ "$DRY_RUN" == "1" ]] && echo "   ### DRY RUN — no changes will be written ###"

# --- 1. Archivar estado actual ---
echo ""
echo "📦 [1/3] Archivando estado actual..."
run "mkdir -p '$ARCHIVE_DIR/projects'"

# Foundation state
if [[ -f "$BRAND_DIR/foundation-state.json" ]]; then
  run "cp -a '$BRAND_DIR/foundation-state.json' '$ARCHIVE_DIR/foundation-state.json.before-reseed'"
  echo "  ✓ foundation-state.json → archive"
fi
if [[ -f "$BRAND_DIR/foundation-state.json.bak" ]]; then
  run "cp -a '$BRAND_DIR/foundation-state.json.bak' '$ARCHIVE_DIR/foundation-state.json.bak.before-reseed' && rm '$BRAND_DIR/foundation-state.json.bak'"
fi

# Projects: archivar TODO lo que esté actualmente en projects/ (los canónicos
# se reinstalan después; los custom y legacy se preservan en _archive).
if [[ -d "$BRAND_DIR/projects" ]]; then
  shopt -s nullglob
  for p in "$BRAND_DIR/projects"/*; do
    base=$(basename "$p")
    # Sólo archivar (no borrar lo que ya está dentro de _archive/)
    if [[ "$base" == "_archive_"* ]]; then
      continue
    fi
    run "mv '$p' '$ARCHIVE_DIR/projects/'"
    echo "  ✓ projects/$base → archive"
  done
  shopt -u nullglob
fi

# Directorios de contenido custom: archivar si existen (Philippe re-genera)
# Estos los crean las skills durante Foundation, por eso los movemos
# completos: si quedó contenido custom de un intento previo, va a _archive.
for d in company-brief market-and-us brand-identity brand-book brand-voice go-to-market operational presentations strategic-plan business-model budget company-context; do
  if [[ -d "$BRAND_DIR/$d" ]]; then
    run "mv '$BRAND_DIR/$d' '$ARCHIVE_DIR/$d'"
    echo "  ✓ $d/ → archive"
  fi
done

echo "  → archivo: $ARCHIVE_DIR"

# --- 2. Crear estructura de carpetas vacías (mismo árbol que new-client.sh) ---
echo ""
echo "📁 [2/3] Recreando estructura de carpetas vacías..."
run "mkdir -p '$BRAND_DIR'/{company-context,business-model,budget,company-brief,market-and-us/{market,competitors,self,swot,summary,ope-canvas,sources},go-to-market/{ecps,positioning/shared,pricing,existing-customer-data,ecp-validation},brand-book/{brand-voice,visual-identity},presentations,strategic-plan,operational,projects}"

# --- 3. Escribir templates canónicos ---
echo ""
echo "🏗️ [3/3] Escribiendo templates canónicos..."

if [[ "$DRY_RUN" == "1" ]]; then
  echo "  [dry-run] foundation-state.json + 4 proyectos (Fast/Full/Metrics/Strategic-Plan)"
  echo ""
  echo "✓ Reseed dry-run complete."
  exit 0
fi

NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Foundation state v3
cat > "$BRAND_DIR/foundation-state.json" << FJSON
{
  "version": "3.0",
  "started_at": "$NOW",
  "updated_at": "$NOW",
  "brand_summary": {
    "company_name": "$NAME",
    "sector": "",
    "description": "",
    "north_star": "",
    "icps": [],
    "competitors": [],
    "positioning": ""
  },
  "sections": {
    "fast-foundation": {
      "status": "not-started",
      "layer": 0,
      "skill": "fast-foundation",
      "pillars": {
        "company-brief": {"status": "not-started", "output_file": "brand/$SLUG/company-brief/company-brief.current.md", "skill": "fast-foundation"},
        "self-l1": {"status": "not-started", "output_file": "brand/$SLUG/market-and-us/self/self.current.md", "skill": "fast-foundation"},
        "market-l1": {"status": "not-started", "output_file": "brand/$SLUG/market-and-us/market/market.current.md", "skill": "fast-foundation"},
        "brand-voice-snapshot": {"status": "not-started", "output_file": "brand/$SLUG/brand-book/brand-voice/brand-voice.current.md", "skill": "fast-foundation"},
        "niche-basic": {"status": "not-started", "output_file": "brand/$SLUG/go-to-market/ecps/ecps.current.md", "skill": "fast-foundation"}
      }
    },
    "company-brief": {
      "status": "not-started",
      "layer": 0,
      "output_dir": "brand/$SLUG/company-brief/",
      "pillars": {
        "company-context": {"status": "not-started", "skill": "company-context", "output_file": "brand/$SLUG/company-context/company-context.current.md"},
        "business-model": {"status": "not-started", "skill": "business-model-audit", "output_file": "brand/$SLUG/business-model/business-model.current.md"},
        "budget": {"status": "not-started", "skill": "budget-constraints", "output_file": "brand/$SLUG/budget/budget.current.md"},
        "company-brief": {"status": "not-started", "skill": "fast-foundation", "output_file": "brand/$SLUG/company-brief/company-brief.current.md", "note": "merge view auto-generated"}
      }
    },
    "market-and-us": {
      "status": "not-started",
      "layer": 1,
      "output_dir": "brand/$SLUG/market-and-us/",
      "pillars": {
        "market-analysis": {"status": "not-started", "layer": 1, "skill": "market-intelligence", "output_file": "brand/$SLUG/market-and-us/market/market.current.md"},
        "competitor-analysis": {"status": "not-started", "layer": 1, "skill": "competitor-intelligence"},
        "self-analysis": {"status": "not-started", "layer": 1, "skill": "self-intelligence", "output_file": "brand/$SLUG/market-and-us/self/self.current.md"},
        "market-synthesis": {"status": "not-started", "layer": 2, "skill": "market-synthesis"},
        "foundation-presentation": {"status": "not-started", "layer": 2, "skill": "market-synthesis", "output_file": "brand/$SLUG/presentations/foundation-report.html"}
      }
    },
    "go-to-market": {
      "status": "not-started",
      "layer": 3,
      "output_dir": "brand/$SLUG/go-to-market/",
      "pillars": {
        "niche-discovery": {"status": "not-started", "layer": 3, "skill": "niche-discovery-100x", "output_file": "brand/$SLUG/go-to-market/ecps/ecps.current.md"},
        "existing-customer-data": {"status": "not-started", "layer": 3, "optional": true, "skill": "existing-customer-data"},
        "positioning": {"status": "not-started", "layer": 4, "skill": "positioning-messaging", "output_file": "brand/$SLUG/go-to-market/positioning/shared/messaging-summary.md"},
        "pricing": {"status": "not-started", "layer": 4, "skill": "pricing-strategy", "output_file": "brand/$SLUG/go-to-market/pricing/pricing.current.md"},
        "ecp-validation": {"status": "not-started", "layer": 4, "optional": true, "skill": "ecp-validation"},
        "gtm-presentation": {"status": "not-started", "layer": 4, "skill": "gtm-presentation", "output_file": "brand/$SLUG/go-to-market/gtm-report.html"}
      }
    },
    "brand-book": {
      "status": "not-started",
      "layer": 5,
      "output_dir": "brand/$SLUG/brand-book/",
      "pillars": {
        "brand-voice": {"status": "not-started", "layer": 5, "skill": "brand-voice", "output_file": "brand/$SLUG/brand-book/brand-voice/brand-voice.current.md"},
        "visual-identity": {"status": "not-started", "layer": 5, "skill": "visual-identity", "output_file": "brand/$SLUG/brand-book/visual-identity/visual-identity.current.md"},
        "brand-report": {"status": "not-started", "layer": 5, "optional": true, "skill": "brand-report", "output_file": "brand/$SLUG/brand-book/brand-report.html"}
      }
    },
    "metrics-setup": {
      "status": "not-started",
      "layer": 6,
      "pillars": {
        "metrics-setup": {"status": "not-started", "skill": "metrics-setup", "output_file": "brand/$SLUG/go-to-market/metrics-plan.md"}
      }
    },
    "strategic-plan": {
      "status": "not-started",
      "layer": 7,
      "output_file": "brand/$SLUG/strategic-plan/strategic-plan.current.md",
      "pillars": {
        "strategic-plan": {"status": "not-started", "skill": "strategic-plan", "output_file": "brand/$SLUG/strategic-plan/strategic-plan.current.md"},
        "strategic-presentation": {"status": "not-started", "skill": "strategic-plan", "output_file": "brand/$SLUG/strategic-plan/strategic-presentation.html"}
      }
    }
  },
  "file_index": {
    "competitors": {},
    "integrations": "integrations.json",
    "metrics": {},
    "brand_assets": {},
    "operational": {},
    "projects": {"dir": "projects/"},
    "presentations": {},
    "memory": null
  }
}
FJSON
echo "  ✓ foundation-state.json (v3.0, todos los pilares not-started)"

# P00-Fast-Foundation
mkdir -p "$BRAND_DIR/projects/P00-Fast-Foundation"
cat > "$BRAND_DIR/projects/P00-Fast-Foundation/project.json" << 'PROJJSON_FF'
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
PROJJSON_FF

cat > "$BRAND_DIR/projects/P00-Fast-Foundation/tasks.json" << 'TASKSJSON_FF'
[
  {
    "id": "P00-FF-T01",
    "name": "Ejecutar Fast Foundation",
    "description": "Intake rápido (~30 min) donde Sancho te hace preguntas sobre tu empresa y genera los documentos base: Company Context, Business Model y Niche Discovery con ECPs iniciales. Todo se ejecuta en una sola conversación en #onboarding.",
    "deliverable": "company-brief/company-context.md, company-brief/business-model.md, go-to-market/ecps/ecps.current.md",
    "done_criteria": "Los 3 documentos lite generados y validados por el cliente.",
    "depends_on": null,
    "owner": "Sancho",
    "status": "pending",
    "channel": "onboarding",
    "type": "foundation",
    "skill": "fast-foundation",
    "pillars": ["company-context", "business-model", "niche-discovery"],
    "sections": ["company-brief", "go-to-market"]
  }
]
TASKSJSON_FF
echo "  ✓ projects/P00-Fast-Foundation/ (1 task)"

# P00-Full-Foundation
mkdir -p "$BRAND_DIR/projects/P00-Full-Foundation"
cat > "$BRAND_DIR/projects/P00-Full-Foundation/project.json" << 'PROJJSON_FUL'
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
PROJJSON_FUL

cat > "$BRAND_DIR/projects/P00-Full-Foundation/tasks.json" << 'TASKSJSON_FUL'
[
  {
    "id": "P00-FUL-T01",
    "name": "L1 — Market Intelligence",
    "description": "Research profundo del mercado: tamaño, tendencias, regulación, tecnología, comportamiento de compradores.",
    "deliverable": "market-and-us/market/market.current.md con análisis completo del mercado.",
    "done_criteria": "Análisis aprobado con datos verificables.",
    "depends_on": null,
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
    "name": "L1 — Competitor Intelligence",
    "description": "Mapear competidores principales con análisis 3-Lens.",
    "deliverable": "market-and-us/competitors/ con fichas y battle cards.",
    "done_criteria": "Mínimo 5 competidores mapeados.",
    "depends_on": null,
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
    "name": "L1 — Self Intelligence",
    "description": "Análisis interno: 3 lenses (autopercepción, terceros, consumidores).",
    "deliverable": "market-and-us/self/self.current.md",
    "done_criteria": "3 lenses completas. Assets únicos identificados.",
    "depends_on": null,
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
    "name": "L2 — Market Summary",
    "description": "Síntesis de todo el research: SWOT+TOWS con ICE prioritization, Market Summary ejecutivo, OPE Canvas y presentación de resultados.",
    "deliverable": "market-and-us/swot/swot.current.md + market-and-us/summary/summary.current.md + market-and-us/ope-canvas/ope-canvas.current.md",
    "done_criteria": "Summary aprobado. SWOT con oportunidades y amenazas priorizadas. Presentación lista.",
    "depends_on": "P00-FUL-T01,P00-FUL-T02,P00-FUL-T03",
    "owner": "Sancho",
    "status": "pending",
    "channel": "strategy",
    "type": "foundation",
    "skill": "market-summary",
    "pillar": "market-synthesis",
    "section": "market-and-us"
  },
  {
    "id": "P00-FUL-T05",
    "name": "L3 — Niche Discovery 100x",
    "description": "Research profundo de nichos: análisis de 100+ empresas, segmentación avanzada, ECPs detallados con pain points, triggers y objeciones.",
    "deliverable": "go-to-market/ecps/ecps.current.md con ECPs completos.",
    "done_criteria": "ECPs profundos documentados con datos verificables. Nichos priorizados por TAM y fit.",
    "depends_on": "P00-FUL-T04",
    "owner": "Sancho",
    "status": "pending",
    "channel": "strategy",
    "type": "foundation",
    "skill": "niche-discovery-100x",
    "pillar": "niche-discovery",
    "section": "go-to-market"
  },
  {
    "id": "P00-FUL-T06",
    "name": "L4 — Positioning & Messaging",
    "description": "Posicionamiento diferenciado, propuesta de valor y messaging framework por ECP.",
    "deliverable": "go-to-market/positioning/{ecp-slug}/{ecp-slug}.current.md por ECP.",
    "done_criteria": "Posicionamiento aprobado. Mensajes diferenciados para cada ECP.",
    "depends_on": "P00-FUL-T05",
    "owner": "Sancho",
    "status": "pending",
    "channel": "strategy",
    "type": "foundation",
    "skill": "positioning-messaging",
    "pillar": "positioning",
    "section": "go-to-market"
  },
  {
    "id": "P00-FUL-T07",
    "name": "L4 — Pricing Strategy",
    "description": "Modelo de pricing, tiers, value metrics y hooks de conversión.",
    "deliverable": "go-to-market/pricing/pricing.current.md",
    "done_criteria": "Pricing aprobado. Tiers documentados.",
    "depends_on": "P00-FUL-T06",
    "owner": "Sancho",
    "status": "pending",
    "channel": "strategy",
    "type": "foundation",
    "skill": "pricing-strategy",
    "pillar": "pricing",
    "section": "go-to-market"
  },
  {
    "id": "P00-FUL-T08",
    "name": "L5 — Brand Voice",
    "description": "Full Voice Guide + AI Brand Kit + adaptación por ECP/canal.",
    "deliverable": "brand-voice/brand-voice.current.md",
    "done_criteria": "Voice guide aprobada. AI Brand Kit ready.",
    "depends_on": "P00-FUL-T06",
    "owner": "Sancho",
    "status": "pending",
    "channel": "strategy",
    "type": "foundation",
    "skill": "brand-voice",
    "pillar": "brand-voice",
    "section": "brand-identity"
  },
  {
    "id": "P00-FUL-T09",
    "name": "L5 — Visual Identity",
    "description": "Sistema visual: paleta, tipografía, logo guidelines, templates.",
    "deliverable": "brand-identity/visual-identity/visual-identity.current.md",
    "done_criteria": "Visual identity aprobada. Assets exportados.",
    "depends_on": "P00-FUL-T08",
    "owner": "Sancho",
    "status": "pending",
    "channel": "strategy",
    "type": "foundation",
    "skill": "visual-identity",
    "pillar": "visual-identity",
    "section": "brand-identity"
  }
]
TASKSJSON_FUL
echo "  ✓ projects/P00-Full-Foundation/ (9 tasks)"

# P00-Metrics
mkdir -p "$BRAND_DIR/projects/P00-Metrics"
cat > "$BRAND_DIR/projects/P00-Metrics/project.json" << 'PROJJSON_MET'
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
PROJJSON_MET

cat > "$BRAND_DIR/projects/P00-Metrics/tasks.json" << 'TASKSJSON_MET'
{
  "project_id": "P00-Metrics",
  "tasks": [
    {
      "id": "P00-MET-T01",
      "name": "L6 — Acquisition Metrics Plan",
      "description": "Definir métricas clave de adquisición por canal: CPL, CAC, conversion rates, pipeline velocity.",
      "deliverable": "go-to-market/metrics-plan.md con KPIs por canal.",
      "done_criteria": "Métricas definidas y aprobadas. Tareas de conexión generadas automáticamente.",
      "depends_on": "P00-FUL-T09",
      "owner": "Sancho",
      "status": "pending",
      "channel": "intelligence",
      "type": "foundation",
      "skill": "metrics-setup",
      "pillar": "metrics-setup",
      "section": "metrics-setup"
    },
    {
      "id": "P00-MET-T08",
      "name": "Conectar reuniones (Meeting Intelligence)",
      "description": "Comparte una carpeta de Google Drive con tus notas o grabaciones de reuniones. Sancho extraerá decisiones, acciones e insights automáticamente después de cada reunión.",
      "deliverable": "Meeting Intelligence configurado y ejecutando automáticamente.",
      "done_criteria": "google_drive_folder_id configurado y Meeting Intelligence ejecutado con al menos 1 reunión.",
      "depends_on": null,
      "owner": "Usuario",
      "status": "todo",
      "channel": "intelligence",
      "type": "integration",
      "skill": "meeting-intelligence",
      "notes": "1) Crea o identifica una carpeta en Google Drive con tus notas de reuniones. 2) Comparte la carpeta con el agente. 3) Sancho configurará Meeting Intelligence automáticamente. Corre L-V a las 18h."
    },
    {
      "id": "P00-MET-T09",
      "name": "Configurar preparación de reuniones (Call Prep)",
      "description": "Si tienes un CRM con calendario de reuniones (GHL, HubSpot, etc.), Sancho puede preparar briefings automáticos antes de cada llamada con un lead.",
      "deliverable": "Call Prep configurado y generando briefings.",
      "done_criteria": "Call Prep ejecutado con al menos 1 briefing generado.",
      "depends_on": null,
      "owner": "Usuario",
      "status": "todo",
      "channel": "intelligence",
      "type": "integration",
      "skill": "sales-call-prep",
      "notes": "Requiere: acceso a tu calendario + CRM con datos de leads. Dile a Sancho qué CRM usas y él configurará la integración."
    },
    {
      "id": "P00-MET-T10",
      "name": "Conectar comunicaciones internas",
      "description": "Sancho funciona mejor cuanto más contexto tiene de tu negocio. Al conectar tus canales de comunicación (email, Slack, etc.), puede leer tus conversaciones con clientes, propuestas, decisiones internas y oportunidades — y usar todo eso para darte recomendaciones más relevantes, priorizar mejor tu trabajo, y generar un Daily Pulse cada mañana con lo más importante del día anterior.",
      "deliverable": "Al menos 1 canal de comunicación conectado y Daily Pulse ejecutando.",
      "done_criteria": "Daily Pulse ejecutado con al menos 1 fuente conectada.",
      "depends_on": null,
      "owner": "Usuario",
      "status": "todo",
      "channel": "insights",
      "type": "integration",
      "skill": "daily-pulse",
      "connectors": [
        {"id": "gmail", "name": "Gmail", "icon": "email", "status": "available", "config_hint": "Cuenta Gmail + labels a ignorar"},
        {"id": "outlook", "name": "Outlook / Microsoft 365", "icon": "mail", "status": "available", "config_hint": "Cuenta Outlook + carpetas a monitorizar"},
        {"id": "slack", "name": "Slack", "icon": "chat", "status": "available", "config_hint": "Bot token (xoxb-) + canales a monitorizar"},
        {"id": "teams", "name": "Microsoft Teams", "icon": "teams", "status": "coming_soon", "config_hint": "Requiere app registrada en Azure AD"},
        {"id": "whatsapp", "name": "WhatsApp Business", "icon": "wa", "status": "coming_soon", "config_hint": "API de WhatsApp Business"},
        {"id": "intercom", "name": "Intercom", "icon": "ic", "status": "coming_soon", "config_hint": "API key de Intercom"},
        {"id": "zendesk", "name": "Zendesk", "icon": "zd", "status": "coming_soon", "config_hint": "Subdomain + API token"}
      ],
      "notes": "Abre esta tarea y dile a Sancho qué herramientas de comunicación usa tu empresa. Él te guiará paso a paso para conectar cada una. Cuantas más fuentes conectes, más completo será tu Daily Pulse."
    }
  ]
}
TASKSJSON_MET
echo "  ✓ projects/P00-Metrics/ (4 tasks)"

# P00-Strategic-Plan
mkdir -p "$BRAND_DIR/projects/P00-Strategic-Plan"
cat > "$BRAND_DIR/projects/P00-Strategic-Plan/project.json" << 'PROJJSON_SP'
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
PROJJSON_SP

cat > "$BRAND_DIR/projects/P00-Strategic-Plan/tasks.json" << 'TASKSJSON_SP'
[
  {
    "id": "P00-SP-T01",
    "name": "L7 — Crear Strategic Plan",
    "description": "Generar plan estratégico: SWOT ejecutivo, channel prioritization, roadmap de proyectos, KPIs.",
    "deliverable": "strategic-plan/strategic-plan.current.md",
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
TASKSJSON_SP
echo "  ✓ projects/P00-Strategic-Plan/ (2 tasks)"

echo ""
echo "✅ Reseed Foundation completo para $NAME (slug=$SLUG)"
echo "   Archive: $ARCHIVE_DIR"
echo "   Proyectos canónicos: P00-Fast-Foundation, P00-Full-Foundation, P00-Metrics, P00-Strategic-Plan"
echo "   Foundation state: v3.0, 7 secciones, todos los pilares not-started"
echo ""
echo "   Próximo paso: reiniciar el contenedor de la app para que tome el estado nuevo."
