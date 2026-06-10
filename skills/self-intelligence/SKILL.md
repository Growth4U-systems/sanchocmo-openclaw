---
name: self-intelligence
description: "Own brand perception analysis via 3-lens framework (Autopercepción, Terceros, Consumidores). Use when: analyzing client's own brand — digital footprint, content audit, customer perception, viability check. Pipeline: Profile Discovery → Scraping → Deep Research → 5 Lens Analyses → Viability Checkpoint. NOT for: competitor analysis (use competitor-intelligence), market sizing (use market-intelligence)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '4.0'
  system: SanchoCMO
  phase: '1'
  pillar: self-intelligence
  layer: '2'
  depends_on: company-context
  updated: '2026-02-27'
  changes: v4 — Restructured per skill-creator principles.
context_required:
- brand/{slug}/company-brief/company-brief.current.md
# Lite fallbacks (read-only, treat as preliminary seed, not as final truth):
- brand/{slug}/company-brief/lite.md            # merge view fallback (always lite today)
- brand/{slug}/market-and-us/self/lite.md       # own seed from fast-foundation (hydration only)
context_writes:
- brand/{slug}/market-and-us/self/self.current.md
- brand/{slug}/operational/learnings.md
---

# Self-Intelligence (3-Lens Analysis)

> Analiza la percepción de tu propia marca a través de 3 lentes: cómo TE ves, cómo TE ven terceros, cómo TE ven clientes.

**Input**: company-context + URLs de la propia empresa
**Output**: Self-Intelligence Profile + Triangulation → `brand/{slug}/market-and-us/self/self.current.md`

## References

| Archivo | Cuándo leer | Contenido |
|---------|------------|-----------|
| [hydration.md](references/hydration.md) | **SIEMPRE** — Step 0 obligatorio | Mapeo de campos upstream → esta skill |
| `_system/skills/scraping-preflight.md` | **SIEMPRE** — Step 0, antes del primer scraper | Detección de providers conectados + matriz de routing + pedir conectar |
| [prompt.md](references/prompt.md) | **SIEMPRE** — fuente de verdad del output | Pipeline 5 pasos, scrapers, análisis, output format |
| [checklist.md](references/checklist.md) | **Antes de entregar** — self-QA obligatorio | Ítems de verificación |
| [concepts.md](references/concepts.md) | Si necesitas lens conflict resolution, viability rules, edge cases | Definiciones y metodología |
| [schema.md](references/schema.md) | Si necesitas el schema campo por campo | Estructura datos self-intel profile |

---

## Flujo de Ejecución

### 0. Context Hydration + Scraping Preflight (OBLIGATORIO — antes de cualquier pregunta)
- Lee `_system/skills/context-hydration-protocol.md` para el patrón genérico
- Lee `references/hydration.md` para el mapeo específico de esta skill
- Lee TODOS los docs en `context_required`
- Pre-rellena campos según hydration_map
- Presenta datos heredados al usuario: "De [fuente] ya tengo X. ¿Correcto?"
- Solo pregunta campos listados en "Campos genuinamente nuevos"
- **Lee `_system/skills/scraping-preflight.md` y ejecútalo**: detecta providers conectados, muestra el capability report, y enruta el scraping por la matriz. NO declares herramientas que no estén conectadas; si falta una capability material, pide conectarla.

### 0. Profile Discovery (~5 min)
- Encontrar TODAS las URLs: social, review platforms, app stores, website
- Para cada plataforma: URL, username/ID, status (active/dormant/not found)
- Ausencia = dato (marcar explícitamente "No presence")

### 1. Scraping (~15 min) — vía matriz del preflight
- 4 grupos de datos (ver `references/prompt.md` para el detalle de qué capturar por grupo):
  - Group 1: Autopercepción — website + social posts + LinkedIn
  - Group 2: Terceros — SEO/SERP + news
  - Group 3: RRSS Comments — comments por plataforma
  - Group 4: Reviews — Trustpilot, G2, Capterra, app stores
- **Enruta cada grupo por la matriz de `scraping-preflight.md`** (web → smart-scrape; social → scrapecreators; SEO/SERP → DataForSEO; reviews → smart-scrape/Apify). NO uses actores hardcodeados: usa el provider conectado que indique el preflight.
- Marca provider + evidencia por cada fuente; si caes a fallback, márcalo ⚠️.

### 2. Deep Research (~10 min) — vía `/deep-research` (Hamete)
- Invoca el skill **`/deep-research`** con el prompt **Company** de `references/deep-research-prompts.md` (digital footprint, products, brand image, UVP). Devuelve documento con fuentes + qa-bot.
- ⚠️ NO existe "Gemini Deep Research" en este runtime — el research es competencia de Hamete vía `/deep-research`.
- ⚠️ NO incluir market research — eso pertenece a market-intelligence

### 3. Lens Analysis (5 prompts secuenciales — STORYTELLING OBLIGATORIO)
- **EMPIEZA con Executive Narrative** — 1 página, narrativa pura, historia completa del descubrimiento
- **CADA LENS**: Apertura narrativa → Análisis → Interpretación ("so what?") → Implicación
- **TRANSICIONES**: Párrafo puente entre lentes que conecta el análisis
- **TONO**: Presentación al CEO, no auditoría técnica
- Lens 1: Autopercepción (message + asset inventory)
- Lens 2: Terceros (SEO, media, industry position)
- Lens 3a: Consumidores RRSS (sentiment, themes, pain points)
- Lens 3b: Consumidores Reviews (ratings, pros/cons, migration)
- Synthesis: Triangulation table + confirmed strengths/weaknesses + gaps
- **CIERRE FINAL**: Párrafo conclusivo que sintetiza las 3 perspectivas

### 4. Viability Checkpoint (automático)
- Si avg rating < 2.5/5, gaps severos promise-reality, o product gaps confirmados → WARNING
- Si no → PASS, continuar a dependent pillars

### 5. Self-QA + Guardar
- Checklist, versionado, `brand/{slug}/market-and-us/self/self.current.md`

---

## Cross-Pillar Data Flow

| Dato | Lo consume |
|------|-----------|
| Stated positioning (Lens 1) | positioning-messaging (current vs desired) |
| Customer pain points (Lens 3) | niche-discovery-100x, content-workflow |
| Tone profile | brand-voice |
| Consistency gaps | brand-voice (fix inconsistencies) |
| Review ratings + sentiment | phase-0-diagnostic, viability checkpoint |
| Promise-reality gaps | positioning-messaging (honest messaging) |
| Viability status | foundation-orchestrator (routing) |
| Triangulation table | competitor-intelligence (comparison baseline) |
| Asset Inventory | Phase 2 funnel builder, content-workflow |

---

## 🔬 Profundizar con Deep Research

Al entregar, añade:

```
📊 **¿Quieres profundizar?**
Puedo lanzar deep-research para ampliar con más fuentes y validación cruzada.
→ Escribe **"profundizar"** para continuar.
```

Si el usuario dice "profundizar": relee el documento, haz 10-20 búsquedas adicionales enfocadas en los gaps, actualiza el documento.

---

## ✅ Self-QA (OBLIGATORIO antes de entregar)

1. Lee `references/checklist.md`
2. Revisa CADA ítem contra tu documento
3. Si hay ❌ → investiga más. Repite hasta 0 ❌.
4. Spot-check 5-10 URLs con `web_fetch`
5. Cruza cifras contra brand files (company-context)
6. Añade metadata: `<!-- Self-QA: PASS | fecha | items: X✅ Y⚠️ 0❌ -->`

---

## 📁 Almacenamiento (OBLIGATORIO)

```
brand/{{slug}}/market-and-us/self/
├── self.current.md      ← versión activa
├── v1.md, v2.md... ← versiones anteriores
├── history.json    ← log de versiones
└── qa-log.md       ← historial de QA
```

1. Identifica slug desde systemPrompt (`[CLIENTE: ... | slug: ...]`)
2. Si existe `self.current.md` → backup como `v{N+1}.md`, pide confirmación
3. Si no existe → crea carpeta + `self.current.md` + `v1.md` + `history.json`
4. Link: `<MC_BASE>/docs/brand/{slug}/market-and-us/self/self.current.md`
