---
name: competitor-intelligence
description: "3-Lens competitor analysis: Autopercepción, Terceros, Consumidores. Use when: researching competitors, building battle cards, mapping competitive landscape. Discovers competitors, profiles each (scraping + deep research), runs 3-lens analysis, produces battle cards and landscape map. NOT for: self-analysis (use self-intelligence), market sizing (use market-intelligence)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '5.0'
  system: SanchoCMO
  phase: '1'
  pillar: competitor-intelligence
  layer: '2'
  depends_on: company-context
  updated: '2026-03-20'
  changes: v5.0 — Refactor to orchestrator pattern. SKILL.md is short and forces read() of each reference before execution. Detail moved to references/. Scraping guide extracted. Checklist is now a hard GATE.
context_required:
- brand/{slug}/company-brief/company-brief.current.md
- brand/{slug}/go-to-market/positioning/*/*.current.md
context_writes:
- brand/{slug}/market-and-us/competitors/competitors.current.md
- brand/{slug}/market-and-us/competitors/{nombre}/{nombre}.current.md
- brand/{slug}/operational/learnings.md
---

# Competitor Intelligence (3-Lens Analysis)

> Analiza competidores a través de 3 lentes: lo que ELLOS dicen, lo que OTROS dicen, lo que CLIENTES dicen.

**Input**: company-context + URLs/nombres de competidores (o discovery autónomo)
**Output**:
- Roll-up (landscape + lista): `brand/{slug}/market-and-us/competitors/competitors.current.md`
- Deep-dive 3-lens por competidor: `brand/{slug}/market-and-us/competitors/{nombre}/{nombre}.current.md`

El roll-up se **genera/sintetiza** desde los subdirs — no editar a mano.

---

## ⚠️ REGLA CARDINAL: LEER ANTES DE EJECUTAR

Cada step referencia un archivo en `references/`. **DEBES hacer `read()` de ese archivo ANTES de ejecutar el step.** No asumas que "ya sabes" — el reference es la fuente de verdad. Si no haces el `read()`, el step está incompleto.

---

## References (leer bajo demanda, NO todos al inicio)

| Archivo | Cuándo leer |
|---------|------------|
| `references/hydration.md` | Step 0 — antes de cualquier pregunta |
| `_system/skills/scraping-preflight.md` | Step 0 — antes del primer scraper (detección providers + matriz + pedir conectar) |
| `references/scraping-guide.md` | Steps 1, 1.5, 2 — plataformas a descubrir + routing por matriz |
| `references/prompt.md` | Steps 4, 5, 6 — formato de output y storytelling |
| `references/schema.md` | Steps 5, 6 — estructura campo por campo |
| `references/concepts.md` | Step 4 — si hay conflictos entre lentes |
| `references/checklist.md` | Step 7 — GATE obligatorio antes de entregar |

---

## Entry Modes

| Mode | Descripción |
|------|------------|
| **"I'll tell you"** | Usuario da intel. Valida, enriquece, llena gaps |
| **"Research on your own"** | Full 3-lens research independiente |
| **"Here are some instructions"** | Usuario da guía parcial. Completa |

En TODOS los modos: check datos existentes primero, presenta hallazgos iniciales, investiga después.

---

## Flujo de Ejecución

### Step 0: Context Hydration + Scraping Preflight + Competitor Discovery
1. `read("references/hydration.md")` — mapeo de campos upstream
2. `read("_system/skills/context-hydration-protocol.md")` — patrón genérico
3. `read("_system/skills/scraping-preflight.md")` y **ejecútalo** — detecta providers conectados (scrapecreators MCP, DataForSEO MCP, smart-scrape, Apify/Firecrawl si hay key), muestra el capability report, y enruta el scraping por la matriz. Si falta una capability material, pide conectarla. NO declares actores que no estén conectados.
4. Lee TODOS los docs en `context_required`
5. Presenta datos heredados: "De [fuente] ya tengo X. ¿Correcto?"
6. Descubrir competidores: Direct (3-5), Indirect (2-3), Emerging (1-2)
7. Presentar lista CON DOMINIOS Y REDES al usuario. Formato:
   - 🔴 Directos: nombre + por qué + 🌐 dominio · 📸 IG · 📘 FB · ⭐ Trustpilot
   - 🟡 Indirectos: nombre + por qué + 🌐 dominio
   - 🟢 Emergentes: nombre + por qué
8. **ESPERAR confirmación del usuario antes de continuar**
9. Guardar lista en `brand/{slug}/competitors/sources.json`

### Step 1: Profile Discovery (~5 min/competidor)
1. `read("references/scraping-guide.md")` — lista completa de plataformas
2. Buscar URLs de cada competidor: social, reviews, app stores, web, ads library
3. Documentar cada URL con status (active/dormant/not found)

### Step 1.5: Primary Source Verification (OBLIGATORIO)
1. Si no lo leíste en Step 1: `read("references/scraping-guide.md")`
2. Para CADA competidor directo, ejecutar `web_fetch` en:
   - Homepage → posicionamiento real (tagline, value prop)
   - /pricing (o variantes: /plans, /prices, /precios) → pricing real
   - /features o /product o /services → features reales
3. Documentar resultado por competidor: ✅ URL + dato o ⚠️ no disponible
4. **Fuente primaria (web del competidor) > fuente secundaria SIEMPRE**
5. **NO continuar al Step 2 hasta completar verificación de TODOS los directos**

### Step 2: Scraping (~15 min/competidor) — vía matriz del preflight
1. Si no lo leíste en Steps 1/1.5: `read("references/scraping-guide.md")`
2. Enrutar cada necesidad por la **matriz de `scraping-preflight.md`** (usa el provider conectado, no actores hardcodeados):
   - **Lens 1** (qué ELLOS dicen): web (home/pricing/about/blog) → `smart-scrape`; IG/TikTok/LinkedIn → scrapecreators MCP; ads (FB/Google) → scrapecreators (`facebook_adLibrary_*`, `google_company_ads`)
   - **Lens 2** (qué OTROS dicen): SERP/keywords/rankings/backlinks → DataForSEO MCP; noticias/menciones → web_search
   - **Lens 3** (qué CLIENTES dicen): reviews (Trustpilot/G2/Capterra) → smart-scrape/WebFetch (o Apify actor si hay key); Reddit/foros → scrapecreators (`reddit_*`) + web_search
3. Si el provider preferido falla → documentar error + caer al fallback de la matriz
4. **NUNCA marcar ✅ si usaste fallback — marcar ⚠️ con provider real + justificación**

### Step 3: Deep Research (~10 min/competidor) — vía `/deep-research` (Hamete)
- Por cada competidor directo, invoca el skill **`/deep-research`** con un brief de "Company radiography": background, fundación/funding/equipo, product evolution, growth model, financials públicos (las dimensiones de Quick Profile en `references/competitor-analysis-prompts.md`). Devuelve documento con fuentes + qa-bot.
- ⚠️ NO existe "Gemini Deep Research" — el research es competencia de Hamete vía `/deep-research`.

### Step 4: Lens Analysis (~30 min/competidor)
1. `read("references/prompt.md")` — reglas de storytelling y formato
2. Si hay conflictos entre lentes: `read("references/concepts.md")` — resolución
3. Empezar con Executive Narrative (1 página, narrativa pura)
4. Analizar por lente:
   - Lens 1: value prop, positioning, pricing, features, content, ads
   - Lens 2: SEO visibility, media, narrative externa
   - Lens 3: sentiment, love/hate, unmet needs, migration patterns

### Step 5: Battle Cards
1. Si no lo leíste en Step 4: `read("references/prompt.md")` — formato battle card
2. `read("references/schema.md")` — campos obligatorios
3. Por cada competidor directo, generar:
   - Apertura narrativa → Ficha estructurada → Slide KPIs → "So what?" → How to Beat Them
4. Incluir monitoring triggers por competidor

### Step 6: Competitive Landscape Map
1. Si no lo leíste en Steps 4-5: `read("references/prompt.md")` — formato landscape
2. Generar con storytelling completo (contexto + datos + interpretación por componente):
   - Overview table + Positioning map 2x2 + Feature heatmap
   - Growth model analysis + Pricing landscape
   - Cross-Competitor Opportunities (síntesis narrativa final)
   - Cierre: "En este panorama, nuestra mejor jugada es..."

### Step 7: Self-QA GATE + Guardar (OBLIGATORIO — NO ENTREGAR SIN ESTO)
1. `read("references/checklist.md")` — cargar checklist completo
2. Revisar CADA ítem del checklist contra el output generado:
   - ✅ = completado con evidencia (run IDs, URLs, datos)
   - ⚠️ = investigado pero no disponible (con razón específica)
   - ❌ = falta — VOLVER A INVESTIGAR
3. **Si hay algún ❌ → NO entregar. Volver al step correspondiente.**
4. Solo cuando 0 ❌ → guardar roll-up en `brand/{slug}/market-and-us/competitors/competitors.current.md` y deep-dives en `brand/{slug}/market-and-us/competitors/{nombre}/{nombre}.current.md`
5. Versionar según `_system/foundation/versioning-protocol.md`
6. Incluir oferta de deep-research al entregar

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
