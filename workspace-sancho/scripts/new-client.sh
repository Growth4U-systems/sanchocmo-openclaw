#!/usr/bin/env bash
set -euo pipefail

# new-client.sh — Onboarding de nuevo cliente SanchoCMO
# Prerequisito: cliente ya creó servidor Discord desde plantilla
# y añadió el bot via OAuth
#
# Uso: new-client.sh --slug "slug" --name "Nombre" --guild "GUILD_ID"

WORKSPACE="${OPENCLAW_WORKSPACE:-$HOME/.openclaw/workspace-sancho}"

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
      BOT_ID=$(python3 -c "import json; print(json.load(open('$WORKSPACE/_system/instance.json'))['discord']['bot_client_id'])" 2>/dev/null || echo "BOT_CLIENT_ID")
      echo "              y añadió bot desde https://discord.com/oauth2/authorize?client_id=${BOT_ID}&permissions=8&integration_type=0&scope=bot"
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

# --- Read bot_client_id from instance.json ---
INSTANCE_JSON="$WORKSPACE/_system/instance.json"
BOT_CLIENT_ID=$(python3 -c "import json; print(json.load(open('$INSTANCE_JSON'))['discord']['bot_client_id'])" 2>/dev/null || echo "UNKNOWN")
OAUTH_URL="https://discord.com/oauth2/authorize?client_id=${BOT_CLIENT_ID}&permissions=8&integration_type=0&scope=bot"

echo "🔨 Onboarding: $NAME (slug: $SLUG, guild: $GUILD)"

# --- 1. Crear estructura de archivos ---
echo "📁 Creando estructura..."
mkdir -p "$BRAND_DIR"/{company-context,business-model,budget,company-brief,market-and-us/{market,competitors,self,swot,summary,ope-canvas,sources},go-to-market/{ecps,positioning/shared,pricing,existing-customer-data,ecp-validation},brand-book/{brand-voice,visual-identity},presentations,strategic-plan,operational,_archive,projects,monitoring/weekly}

# --- 1b. Crear placeholders de documentos ---
echo "📄 Creando placeholders..."

cat > "$BRAND_DIR/company-context/current.md" << 'PLACEHOLDER'
<!-- mode: placeholder | status: not-started -->
# Company Context — {NOMBRE}

> STANDALONE (fuente de verdad). Lo escribe la skill `company-context`.

## Identidad
<!-- Nombre, tipo de empresa, sector, año fundación, equipo -->

## Diferenciadores
<!-- Qué hace diferente a esta empresa, assets únicos -->
PLACEHOLDER
sed -i "s/{NOMBRE}/$NAME/g" "$BRAND_DIR/company-context/current.md"

cat > "$BRAND_DIR/business-model/current.md" << 'PLACEHOLDER'
<!-- mode: placeholder | status: not-started -->
# Business Model — {NOMBRE}

> STANDALONE (fuente de verdad). Lo escribe la skill `business-model-audit`.

## Modelo de Negocio
<!-- Qué vende, a quién, cómo cobra, ticket medio, unit economics -->
PLACEHOLDER
sed -i "s/{NOMBRE}/$NAME/g" "$BRAND_DIR/business-model/current.md"

cat > "$BRAND_DIR/budget/current.md" << 'PLACEHOLDER'
<!-- mode: placeholder | status: not-started -->
# Budget & Resources — {NOMBRE}

> STANDALONE (fuente de verdad). Lo escribe la skill `budget-constraints`.

## Recursos y Budget
<!-- Equipo actual, herramientas, presupuesto marketing, restricciones -->
PLACEHOLDER
sed -i "s/{NOMBRE}/$NAME/g" "$BRAND_DIR/budget/current.md"

cat > "$BRAND_DIR/company-brief/current.md" << 'PLACEHOLDER'
<!-- auto-generated from: company-context/, business-model/, budget/ -->
<!-- DO NOT EDIT HERE — edits will be overwritten on next regeneration -->
<!-- mode: placeholder | status: not-started -->
# Company Brief — {NOMBRE}

> MERGE VIEW consolidado de los 3 standalones. No editar aquí.

## Company Identity
_pendiente — correr company-context_

## Business Model
_pendiente — correr business-model-audit_

## Budget & Resources
_pendiente — correr budget-constraints_
PLACEHOLDER
sed -i "s/{NOMBRE}/$NAME/g" "$BRAND_DIR/company-brief/current.md"

cat > "$BRAND_DIR/market-and-us/market/current.md" << 'PLACEHOLDER'
<!-- mode: placeholder | status: not-started -->
# Market Intelligence — {NOMBRE}

## Executive Narrative
<!-- Resumen ejecutivo del mercado -->

## Tamaño de Mercado
<!-- TAM, SAM, SOM con fuentes -->

## Tendencias
<!-- Tendencias clave del sector -->

## Regulación
<!-- Marco regulatorio relevante -->

## Segmentación
<!-- Segmentos de mercado y oportunidades -->
PLACEHOLDER
sed -i "s/{NOMBRE}/$NAME/g" "$BRAND_DIR/market-and-us/market/current.md"

cat > "$BRAND_DIR/market-and-us/self/current.md" << 'PLACEHOLDER'
<!-- mode: placeholder | status: not-started -->
# Self Intelligence — {NOMBRE}

## Lens 1: Autopercepción
<!-- Cómo se ve la empresa a sí misma -->

## Lens 2: Terceros
<!-- Cómo la ven partners, analistas, prensa -->

## Lens 3: Consumidores
<!-- Cómo la ven clientes actuales y potenciales -->

## Assets Únicos
<!-- Fortalezas y recursos diferenciadores -->

## Gaps
<!-- Debilidades y áreas de mejora -->
PLACEHOLDER
sed -i "s/{NOMBRE}/$NAME/g" "$BRAND_DIR/market-and-us/self/current.md"

cat > "$BRAND_DIR/market-and-us/swot/current.md" << 'PLACEHOLDER'
<!-- mode: placeholder | status: not-started -->
# SWOT Analysis — {NOMBRE}

## Strengths
<!-- Fortalezas internas -->

## Weaknesses
<!-- Debilidades internas -->

## Opportunities
<!-- Oportunidades externas -->

## Threats
<!-- Amenazas externas -->

## TOWS Matrix
<!-- Estrategias cruzadas SO, WO, ST, WT -->
PLACEHOLDER
sed -i "s/{NOMBRE}/$NAME/g" "$BRAND_DIR/market-and-us/swot/current.md"

cat > "$BRAND_DIR/market-and-us/summary/current.md" << 'PLACEHOLDER'
<!-- mode: placeholder | status: not-started -->
# Market Summary — {NOMBRE}

## Resumen Ejecutivo
<!-- Síntesis de Market + Competitors + Self -->

## Conclusiones Clave
<!-- Top insights para la estrategia -->
PLACEHOLDER
sed -i "s/{NOMBRE}/$NAME/g" "$BRAND_DIR/market-and-us/summary/current.md"

cat > "$BRAND_DIR/market-and-us/ope-canvas/current.md" << 'PLACEHOLDER'
<!-- mode: placeholder | status: not-started -->
# OPE Canvas — {NOMBRE}

## Oportunidad
<!-- Oportunidad principal identificada -->

## Problema
<!-- Problema que resuelve -->

## Ejecución
<!-- Cómo se ejecuta la solución -->
PLACEHOLDER
sed -i "s/{NOMBRE}/$NAME/g" "$BRAND_DIR/market-and-us/ope-canvas/current.md"

cat > "$BRAND_DIR/go-to-market/ecps/current.md" << 'PLACEHOLDER'
<!-- mode: placeholder | status: not-started -->
# Niche Discovery & ECPs — {NOMBRE}

## Nichos Identificados
<!-- Nichos de mercado con potencial -->

## ECPs (Exceptional Client Profiles)
<!-- Perfiles de cliente ideal con pain clusters -->
PLACEHOLDER
sed -i "s/{NOMBRE}/$NAME/g" "$BRAND_DIR/go-to-market/ecps/current.md"

cat > "$BRAND_DIR/go-to-market/positioning/shared/messaging-summary.md" << 'PLACEHOLDER'
<!-- mode: placeholder | status: not-started -->
# Positioning & Messaging — {NOMBRE}

## Posicionamiento
<!-- Declaración de posicionamiento -->

## Propuesta de Valor
<!-- Value proposition por ECP -->

## Mensajes Clave
<!-- Key messages diferenciadores -->
PLACEHOLDER
sed -i "s/{NOMBRE}/$NAME/g" "$BRAND_DIR/go-to-market/positioning/shared/messaging-summary.md"

cat > "$BRAND_DIR/go-to-market/pricing/current.md" << 'PLACEHOLDER'
<!-- mode: placeholder | status: not-started -->
# Pricing Strategy — {NOMBRE}

## Modelo de Pricing
<!-- Tipo de modelo, justificación -->

## Tiers
<!-- Niveles de servicio/producto -->

## Value Metrics
<!-- Métricas de valor para el cliente -->
PLACEHOLDER
sed -i "s/{NOMBRE}/$NAME/g" "$BRAND_DIR/go-to-market/pricing/current.md"

cat > "$BRAND_DIR/brand-book/brand-voice/current.md" << 'PLACEHOLDER'
<!-- mode: placeholder | status: not-started -->
# Brand Voice — {NOMBRE}

## Personalidad
<!-- Rasgos de personalidad de la marca -->

## Tono
<!-- Espectro de tono por contexto -->

## Vocabulario
<!-- Palabras a usar y evitar -->

## Ejemplos
<!-- Antes/después por canal -->
PLACEHOLDER
sed -i "s/{NOMBRE}/$NAME/g" "$BRAND_DIR/brand-book/brand-voice/current.md"

cat > "$BRAND_DIR/brand-book/visual-identity/current.md" << 'PLACEHOLDER'
<!-- mode: placeholder | status: not-started -->
# Visual Identity — {NOMBRE}

## Paleta de Colores
<!-- Colores primarios, secundarios, neutros -->

## Tipografía
<!-- Fuentes display y body -->

## Logo
<!-- Guidelines de uso del logo -->

## Templates
<!-- Plantillas de diseño -->
PLACEHOLDER
sed -i "s/{NOMBRE}/$NAME/g" "$BRAND_DIR/brand-book/visual-identity/current.md"

cat > "$BRAND_DIR/strategic-plan/current.md" << 'PLACEHOLDER'
<!-- mode: placeholder | status: not-started -->
# Strategic Plan — {NOMBRE}

## SWOT Ejecutivo
<!-- Resumen del SWOT para decisiones -->

## Priorización de Canales
<!-- Ranking de canales por ajuste al ICP -->

## Roadmap de Proyectos
<!-- P01-P08+ con fases y dependencias -->

## KPIs
<!-- Métricas de éxito del plan -->
PLACEHOLDER
sed -i "s/{NOMBRE}/$NAME/g" "$BRAND_DIR/strategic-plan/current.md"

echo "   ✅ Placeholders creados (12 documentos)"

# Foundation state v3.0
cat > "$BRAND_DIR/foundation-state.json" << FJSON
{
  "version": "3.0",
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "brand_summary": {
    "company_name": "",
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
        "company-brief": {"status": "not-started", "output_file": "brand/$SLUG/company-brief/current.md", "skill": "fast-foundation"},
        "self-l1": {"status": "not-started", "output_file": "brand/$SLUG/market-and-us/self/current.md", "skill": "fast-foundation"},
        "market-l1": {"status": "not-started", "output_file": "brand/$SLUG/market-and-us/market/current.md", "skill": "fast-foundation"},
        "brand-voice-snapshot": {"status": "not-started", "output_file": "brand/$SLUG/brand-book/brand-voice/current.md", "skill": "fast-foundation"},
        "niche-basic": {"status": "not-started", "output_file": "brand/$SLUG/go-to-market/ecps/current.md", "skill": "fast-foundation"}
      }
    },
    "company-brief": {
      "status": "not-started",
      "layer": 0,
      "output_dir": "brand/$SLUG/company-brief/",
      "pillars": {
        "company-context": {"status": "not-started", "skill": "company-context", "output_file": "brand/$SLUG/company-context/current.md"},
        "business-model": {"status": "not-started", "skill": "business-model-audit", "output_file": "brand/$SLUG/business-model/current.md"},
        "budget": {"status": "not-started", "skill": "budget-constraints", "output_file": "brand/$SLUG/budget/current.md"},
        "company-brief": {"status": "not-started", "skill": "fast-foundation", "output_file": "brand/$SLUG/company-brief/current.md", "note": "merge view auto-generated"}
      }
    },
    "market-and-us": {
      "status": "not-started",
      "layer": 1,
      "output_dir": "brand/$SLUG/market-and-us/",
      "pillars": {
        "market-analysis": {"status": "not-started", "layer": 1, "skill": "market-intelligence", "output_file": "brand/$SLUG/market-and-us/market/current.md"},
        "competitor-analysis": {"status": "not-started", "layer": 1, "skill": "competitor-intelligence"},
        "self-analysis": {"status": "not-started", "layer": 1, "skill": "self-intelligence", "output_file": "brand/$SLUG/market-and-us/self/current.md"},
        "market-synthesis": {"status": "not-started", "layer": 2, "skill": "market-synthesis"},
        "foundation-presentation": {"status": "not-started", "layer": 2, "skill": "market-synthesis", "output_file": "brand/$SLUG/presentations/foundation-report.html"}
      }
    },
    "go-to-market": {
      "status": "not-started",
      "layer": 3,
      "output_dir": "brand/$SLUG/go-to-market/",
      "pillars": {
        "niche-discovery": {"status": "not-started", "layer": 3, "skill": "niche-discovery-100x", "output_file": "brand/$SLUG/go-to-market/ecps/current.md"},
        "existing-customer-data": {"status": "not-started", "layer": 3, "optional": true, "skill": "existing-customer-data"},
        "positioning": {"status": "not-started", "layer": 4, "skill": "positioning-messaging", "output_file": "brand/$SLUG/go-to-market/positioning/shared/messaging-summary.md"},
        "pricing": {"status": "not-started", "layer": 4, "skill": "pricing-strategy", "output_file": "brand/$SLUG/go-to-market/pricing/current.md"},
        "ecp-validation": {"status": "not-started", "layer": 4, "optional": true, "skill": "ecp-validation"},
        "gtm-presentation": {"status": "not-started", "layer": 4, "skill": "gtm-presentation", "output_file": "brand/$SLUG/go-to-market/gtm-report.html"}
      }
    },
    "brand-book": {
      "status": "not-started",
      "layer": 5,
      "output_dir": "brand/$SLUG/brand-book/",
      "pillars": {
        "brand-voice": {"status": "not-started", "layer": 5, "skill": "brand-voice", "output_file": "brand/$SLUG/brand-book/brand-voice/current.md"},
        "visual-identity": {"status": "not-started", "layer": 5, "skill": "visual-identity", "output_file": "brand/$SLUG/brand-book/visual-identity/current.md"},
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
      "output_file": "brand/$SLUG/strategic-plan/current.md",
      "pillars": {
        "strategic-plan": {"status": "not-started", "skill": "strategic-plan", "output_file": "brand/$SLUG/strategic-plan/current.md"},
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
    "projects": {
      "dir": "projects/"
    },
    "presentations": {},
    "memory": null
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
mkdir -p "$BRAND_DIR/projects/P00-Fast-Foundation"
cat > "$BRAND_DIR/projects/P00-Fast-Foundation/project.json" << PROJJSON
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

cat > "$BRAND_DIR/projects/P00-Fast-Foundation/tasks.json" << TASKSJSON
[
  {
    "id": "P00-FF-T01",
    "name": "Ejecutar Fast Foundation",
    "description": "Intake rápido (~30 min) donde Sancho te hace preguntas sobre tu empresa y genera los documentos base: Company Context, Business Model y Niche Discovery con ECPs iniciales. Todo se ejecuta en una sola conversación en #onboarding.",
    "deliverable": "company-brief/company-context.md, company-brief/business-model.md, go-to-market/ecps/current.md",
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
TASKSJSON

# P00-Full-Foundation
mkdir -p "$BRAND_DIR/projects/P00-Full-Foundation"
cat > "$BRAND_DIR/projects/P00-Full-Foundation/project.json" << PROJJSON2
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

cat > "$BRAND_DIR/projects/P00-Full-Foundation/tasks.json" << TASKSJSON2
[
  {
    "id": "P00-FUL-T01",
    "name": "L1 — Market Intelligence",
    "description": "Research profundo del mercado: tamaño, tendencias, regulación, tecnología, comportamiento de compradores.",
    "deliverable": "market-and-us/market/current.md con análisis completo del mercado.",
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
    "deliverable": "market-and-us/self/current.md",
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
    "deliverable": "market-and-us/swot/current.md + market-and-us/summary/current.md + market-and-us/ope-canvas/current.md",
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
    "deliverable": "go-to-market/ecps/current.md con ECPs completos.",
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
    "deliverable": "go-to-market/positioning/{ecp-slug}/current.md por ECP.",
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
    "deliverable": "go-to-market/pricing/current.md",
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
    "deliverable": "brand-voice/current.md",
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
    "deliverable": "brand-identity/visual-identity/current.md",
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
TASKSJSON2

# P00-Metrics-Setup
mkdir -p "$BRAND_DIR/projects/P00-Metrics"
cat > "$BRAND_DIR/projects/P00-Metrics/project.json" << PROJJSON_MS
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

cat > "$BRAND_DIR/projects/P00-Metrics/tasks.json" << TASKSJSON_MS
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
        {"id": "gmail", "name": "Gmail", "icon": "📧", "status": "available", "config_hint": "Cuenta Gmail + labels a ignorar"},
        {"id": "outlook", "name": "Outlook / Microsoft 365", "icon": "📨", "status": "available", "config_hint": "Cuenta Outlook + carpetas a monitorizar"},
        {"id": "slack", "name": "Slack", "icon": "💬", "status": "available", "config_hint": "Bot token (xoxb-) + canales a monitorizar"},
        {"id": "teams", "name": "Microsoft Teams", "icon": "🟣", "status": "coming_soon", "config_hint": "Requiere app registrada en Azure AD"},
        {"id": "whatsapp", "name": "WhatsApp Business", "icon": "🟢", "status": "coming_soon", "config_hint": "API de WhatsApp Business"},
        {"id": "intercom", "name": "Intercom", "icon": "🔵", "status": "coming_soon", "config_hint": "API key de Intercom"},
        {"id": "zendesk", "name": "Zendesk", "icon": "🟠", "status": "coming_soon", "config_hint": "Subdomain + API token"}
      ],
      "notes": "Abre esta tarea y dile a Sancho qué herramientas de comunicación usa tu empresa. Él te guiará paso a paso para conectar cada una. Cuantas más fuentes conectes, más completo será tu Daily Pulse."
    }
  ]
}
TASKSJSON_MS

# P00-Strategic-Plan
mkdir -p "$BRAND_DIR/projects/P00-Strategic-Plan"
cat > "$BRAND_DIR/projects/P00-Strategic-Plan/project.json" << PROJJSON3
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

cat > "$BRAND_DIR/projects/P00-Strategic-Plan/tasks.json" << TASKSJSON3
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

# No registry.json — el filesystem (carpetas P{XX}-{slug}/ con project.json) es la fuente de verdad

echo "   ✅ Proyectos core creados (P00-Fast-Foundation, P00-Full-Foundation, P00-Metrics-Setup, P00-Strategic-Plan)"

# --- 1c. Crear client-config.json (config de crons por defecto) ---
echo "📋 Creando client-config.json..."
cat > "$BRAND_DIR/client-config.json" << SOURCESJSON
{
  "\$schema": "../../_system/sources.schema.json",
  "slug": "$SLUG",
  "name": "$NAME",
  "guild_id": "$GUILD",
  "language": "es",
  "channels": {},
  "crons": {
    "morning_metrics": {
      "enabled": true,
      "schedule": "30 8 * * *",
      "tz": "Europe/Madrid",
      "publish_channel": "intelligence"
    },
    "performance_analysis_weekly": {
      "enabled": true,
      "schedule": "0 11 * * 1",
      "tz": "Europe/Madrid",
      "publish_channel": "intelligence"
    }
  }
}
SOURCESJSON
echo "   ✅ client-config.json creado con crons por defecto"
echo "   ℹ️  Los channel IDs se rellenan en el paso 6 (auto-bind Discord)"

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
        "guild": "$GUILD",
        "active": True,
        "language": "es",
        "phase": 0,
        "paths": {"brand": "brand/"}
    })
    with open("$CLIENTS_FILE", "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("   ✅ clients.json actualizado")
else:
    print("   ⏭️ Ya existe en clients.json")
PYJSON

# --- 4. (Removido: clients.js ya no existe, MC usa clients.json directamente) ---

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

  # Update client-config.json with discovered channel IDs
  DISCORD_CHANNELS_FILE="$BRAND_DIR/discord-channels.json"
  if [[ -f "$DISCORD_CHANNELS_FILE" ]]; then
    python3 -c "
import json
with open('$DISCORD_CHANNELS_FILE') as f:
    dc = json.load(f)
with open('$BRAND_DIR/client-config.json') as f:
    sources = json.load(f)
sources['channels'] = dc.get('channels', {})
with open('$BRAND_DIR/client-config.json', 'w') as f:
    json.dump(sources, f, indent=2)
print('   ✅ client-config.json actualizado con channel IDs')
" 2>/dev/null || echo "   ⚠️ No se pudo actualizar client-config.json con channels"
  fi
else
  echo "   ⚠️ auto-bind.py no encontrado — config manual necesario"
fi

# --- 7. Aplicar restricciones de seguridad al guild ---
echo "🔒 Aplicando restricciones de seguridad..."
INSTANCE_JSON="$WORKSPACE/_system/instance.json"
ADMIN_USERS=$(python3 -c "import json; d=json.load(open('$INSTANCE_JSON')); print(' '.join(d['discord']['admin_users']))" 2>/dev/null)
ALFONSO=$(echo "$ADMIN_USERS" | cut -d' ' -f1)
MARTIN=$(echo "$ADMIN_USERS" | cut -d' ' -f2)
PHILIPPE=$(echo "$ADMIN_USERS" | cut -d' ' -f3)

python3 -c "
import json

config_path = '${OPENCLAW_HOME:-$HOME/.openclaw}/.openclaw/openclaw.json'
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
if openclaw gateway restart 2>/dev/null; then
  echo "   ✅ Gateway reiniciado"
else
  echo "   ⚠️ Gateway restart falló — ejecutar manualmente"
fi

# --- 8b. Crear crons recurrentes desde templates ---
echo "⏰ Creando crons recurrentes..."
CRON_SCRIPT="$WORKSPACE/scripts/create-client-crons.sh"
if [[ -f "$CRON_SCRIPT" ]]; then
  bash "$CRON_SCRIPT" "$SLUG" 2>&1 | sed 's/^/   /'
else
  echo "   ⚠️ create-client-crons.sh no encontrado — crear crons manualmente"
fi

# --- 9. Instrucciones ---
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Cliente '$NAME' onboarded!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📁 Brand dir:  $BRAND_DIR"
echo "🔗 Guild ID:   $GUILD"
echo "🤖 Bot ID:     $BOT_CLIENT_ID"
echo ""
echo "📌 Si el bot aún no está en el servidor, invítalo:"
echo "   $OAUTH_URL"
echo ""
echo "🎯 El cliente puede empezar Foundation en #onboarding"
