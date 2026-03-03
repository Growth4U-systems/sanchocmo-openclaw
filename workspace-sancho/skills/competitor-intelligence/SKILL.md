---
name: competitor-intelligence
description: "3-Lens competitor analysis: Autopercepción, Terceros, Consumidores. Use when: researching competitors, building battle cards, mapping competitive landscape. Discovers competitors, profiles each (scraping + deep research), runs 3-lens analysis, produces battle cards and landscape map. NOT for: self-analysis (use self-intelligence), market sizing (use market-intelligence)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '4.0'
  system: SanchoCMO
  phase: '1'
  pillar: competitor-intelligence
  layer: '2'
  depends_on: company-context
  updated: '2026-02-27'
  changes: v4 — Restructured per skill-creator principles.
context_required:
- brand/{slug}/company-brief/current.md
- brand/{slug}/go-to-market/positioning-*.md
context_writes:
- brand/{slug}/market-and-us/competitor-{nombre}.md
- brand/{slug}/operational/learnings.md
---

# Competitor Intelligence (3-Lens Analysis)

> Analiza competidores a través de 3 lentes: lo que ELLOS dicen, lo que OTROS dicen, lo que CLIENTES dicen.

**Input**: company-context + URLs/nombres de competidores (o discovery autónomo)
**Output**: Battle Cards + Landscape Map → `brand/{slug}/competitors/current.md`

## References

| Archivo | Cuándo leer | Contenido |
|---------|------------|-----------|
| [hydration.md](references/hydration.md) | **SIEMPRE** — Step 0 obligatorio | Mapeo de campos upstream → esta skill |
| [prompt.md](references/prompt.md) | **SIEMPRE** — fuente de verdad del output | Pipeline 6 pasos, battle card format, landscape map |
| [checklist.md](references/checklist.md) | **Antes de entregar** — self-QA obligatorio | Ítems de verificación |
| [concepts.md](references/concepts.md) | Si necesitas lens conflict resolution, categorías, edge cases | Definiciones y metodología 3-lens |
| [schema.md](references/schema.md) | Si necesitas el schema campo por campo | Estructura datos battle card |

---

## Entry Modes

| Mode | Descripción |
|------|------------|
| **"I'll tell you"** | Usuario da intel. Sancho valida, enriquece, llena gaps |
| **"Research on your own"** | Sancho hace full 3-lens research independiente |
| **"Here are some instructions"** | Usuario da guía parcial. Sancho completa |

En TODOS los modos: check datos existentes primero, presenta hallazgos iniciales, investiga después.

---

## Flujo de Ejecución

### 0. Context Hydration (OBLIGATORIO — antes de cualquier pregunta)
- Lee `_system/context-hydration-protocol.md` para el patrón genérico
- Lee `references/hydration.md` para el mapeo específico de esta skill
- Lee TODOS los docs en `context_required`
- Pre-rellena campos según hydration_map
- Presenta datos heredados al usuario: "De [fuente] ya tengo X. ¿Correcto?"
- Solo pregunta campos listados en "Campos genuinamente nuevos"

### 0. Competitor Discovery + VALIDACIÓN CON USUARIO (~15 min)
- Identificar y categorizar: Direct (3-5, full 3-lens), Indirect (2-3, Lens 1 only), Emerging (1-2, monitor)
- Asignar monitoring tiers: A (weekly), B (monthly), C (quarterly)
- **OBLIGATORIO: Presentar la lista CON DOMINIOS Y REDES al usuario ANTES de continuar.**
- Para cada competidor identificado, buscar: dominio web, Instagram, Facebook, LinkedIn, Trustpilot, Google Maps.
- Presentar así:

```
He identificado estos competidores para analizar:

🔴 Directos (análisis completo 3 lentes):
  1. **[Nombre]** — [por qué]
     🌐 [dominio.com] · 📸 IG: @[handle] · 📘 FB: [page] · ⭐ Trustpilot: [url]
  2. ...

🟡 Indirectos (análisis parcial):
  1. **[Nombre]** — [por qué]
     🌐 [dominio.com] · 📸 IG: @[handle]

🟢 Emergentes (solo monitorización):
  1. **[Nombre]** — [por qué]
     🌐 [dominio.com]

¿Están bien estos competidores y sus URLs?
¿Quieres añadir, quitar o corregir alguno?
```

- **ESPERAR respuesta del usuario antes de continuar.**
- Si el usuario corrige un dominio/handle → actualizar antes de scrapear.
- Si el usuario añade competidores → buscar sus URLs también.
- Solo cuando el usuario confirme ("ok", "perfecto", "adelante") → continuar al paso 1.
- Guardar la lista confirmada en `brand/{slug}/competitors/sources.json` para reusar.

### 1. Profile Discovery (~5 min/competitor)
- Encontrar todas las URLs: social, review platforms, app stores, website, paid ads library

### 2. Scraping con Apify (~15 min/competitor)

**OBLIGATORIO usar Apify para scraping real.** No uses solo web_search/web_fetch — necesitamos datos estructurados.

**Herramientas Apify a usar:**
- `apify/web-scraper` — Scrape homepage, product pages, blog de cada competidor
- `apify/instagram-scraper` — Posts, followers, engagement rate
- `apify/google-search-scraper` — Visibility SEO, resultados SERP
- `apify/trustpilot-scraper` — Reviews y ratings (Lens 3)
- `apify/facebook-ads-scraper` — Ads activos en FB Ads Library

**Por cada competidor, ejecutar:**

```
Lens 1 (Autopercepción):
  → Apify web-scraper: homepage + /pricing + /about + /blog (últimos 10 posts)
  → Apify instagram-scraper: últimos 20 posts + bio + followers
  → Apify facebook-ads-scraper: ads activos

Lens 2 (Terceros):
  → DataForSEO SERP API: keywords principales del competidor + rankings
  → DataForSEO Backlinks API: perfil de backlinks, DA, referring domains
  → DataForSEO Keywords Data: keywords por las que rankea el competidor
  → Apify google-search-scraper: "[competidor] reviews", "[competidor] vs"
  → web_search: noticias, press releases, artículos recientes

Lens 3 (Consumidores):
  → Apify trustpilot-scraper: últimas 50 reviews
  → web_search: "[competidor] opiniones", "[competidor] experiencia"
  → web_search: Reddit/foros sobre el competidor
```

Lee el skill `apify` para la sintaxis exacta de cada actor. Si un scraper falla, documenta qué falló y usa web_fetch como fallback.

**DataForSEO API** (para Lens 2 — SEO):
- Auth: Basic auth con `$DATAFORSEO_LOGIN` : `$DATAFORSEO_PASSWORD`
- Base URL: `https://api.dataforseo.com/v3`
- Endpoints clave:
  - `/serp/google/organic/live` — SERP results por keyword
  - `/backlinks/summary/live` — DA, backlinks, referring domains por dominio
  - `/keywords_data/google_ads/keywords_for_site/live` — keywords de un dominio
  - `/on_page/summary` — análisis on-page de un dominio
- Siempre pasar `location_code: 2724` (España) y `language_code: "es"`
- Balance actual: ~$35 — usar con moderación (1-3 queries por competidor)

### 3. Deep Research (~10 min/competitor)
- Background, product evolution, growth model, financials públicos

### 4. Lens Analysis (~30 min/competitor)
- Lee `references/prompt.md` para los prompts completos de análisis
- Lens 1: Autopercepción (value prop, positioning, pricing, content strategy, paid ads)
- Lens 2: Terceros (SEO visibility, media coverage, external narrative)
- Lens 3: Consumidores (sentiment, love/hate, unmet needs, migration patterns)

### 5. Battle Card (por competitor)
- Sintetizar 3 lentes en tarjeta accionable de 1 página
- Incluir "How to Beat Them" y monitoring triggers

### 6. Competitive Landscape Map
- Overview table + Positioning map 2x2 + Feature heatmap
- Growth model analysis + Pricing landscape
- Opportunity summary (cross-competitor patterns)

### 7. Self-QA + Guardar
- Checklist, versionado, `brand/{slug}/competitors/current.md`

---

## Cross-Pillar Data Flow

| Dato | Lo consume |
|------|-----------|
| Battle Cards | swot-analysis (O + T), positioning-messaging |
| Growth models | business-model-audit, Phase 3 channel selection |
| Competitor pricing | pricing-hooks |
| Lens 3 complaints | niche-discovery-100x, positioning-messaging |
| Feature heatmap | positioning-messaging, content-workflow |
| Positioning gaps | brand-voice, content-workflow |
| Unmet needs | niche-discovery-100x, product feedback |
| Landscape Map | Phase 2 competitor pages, sales enablement |

---

## Profundizar con Deep Research

Al entregar, añade bloque de profundización estándar.
