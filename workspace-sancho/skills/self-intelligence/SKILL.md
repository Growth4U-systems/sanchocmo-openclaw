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
- brand/company-context.md
context_writes:
- brand/product-analysis.md
- brand/learnings.md
---

# Self-Intelligence (3-Lens Analysis)

> Analiza la percepción de tu propia marca a través de 3 lentes: cómo TE ves, cómo TE ven terceros, cómo TE ven clientes.

**Input**: company-context + URLs de la propia empresa
**Output**: Self-Intelligence Profile + Triangulation → `brand/{slug}/self-intelligence/current.md`

## References

| Archivo | Cuándo leer | Contenido |
|---------|------------|-----------|
| [prompt.md](references/prompt.md) | **SIEMPRE** — fuente de verdad del output | Pipeline 5 pasos, scrapers, análisis, output format |
| [checklist.md](references/checklist.md) | **Antes de entregar** — self-QA obligatorio | Ítems de verificación |
| [concepts.md](references/concepts.md) | Si necesitas lens conflict resolution, viability rules, edge cases | Definiciones y metodología |
| [schema.md](references/schema.md) | Si necesitas el schema campo por campo | Estructura datos self-intel profile |

---

## Flujo de Ejecución

### 0. Profile Discovery (~5 min)
- Encontrar TODAS las URLs: social, review platforms, app stores, website
- Para cada plataforma: URL, username/ID, status (active/dormant/not found)
- Ausencia = dato (marcar explícitamente "No presence")

### 1. Scraping (~15 min)
- 20 scrapers en 4 grupos (ver `references/prompt.md` para detalle)
- Group 1: Autopercepción (8 scrapers — website, social posts, LinkedIn)
- Group 2: Terceros (2 scrapers — SEO/SERP, news)
- Group 3: RRSS Comments (5 scrapers — comments por plataforma)
- Group 4: Reviews (5 scrapers — Trustpilot, G2, Capterra, stores)

### 2. Deep Research (~20 min)
- Deep Research: Market (industry overview, landscape, trends)
- Deep Research: Company (digital footprint, products, brand image, UVP)
- Lee `references/prompt.md` para los prompts

### 3. Lens Analysis (5 prompts secuenciales)
- Lens 1: Autopercepción (message + asset inventory)
- Lens 2: Terceros (SEO, media, industry position)
- Lens 3a: Consumidores RRSS (sentiment, themes, pain points)
- Lens 3b: Consumidores Reviews (ratings, pros/cons, migration)
- Synthesis: Triangulation table + confirmed strengths/weaknesses + gaps

### 4. Viability Checkpoint (automático)
- Si avg rating < 2.5/5, gaps severos promise-reality, o product gaps confirmados → WARNING
- Si no → PASS, continuar a dependent pillars

### 5. Self-QA + Guardar
- Checklist, versionado, `brand/{slug}/self-intelligence/current.md`

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
brand/{{slug}}/self-intelligence/
├── current.md      ← versión activa
├── v1.md, v2.md... ← versiones anteriores
├── history.json    ← log de versiones
└── qa-log.md       ← historial de QA
```

1. Identifica slug desde systemPrompt (`[CLIENTE: ... | slug: ...]`)
2. Si existe `current.md` → backup como `v{N+1}.md`, pide confirmación
3. Si no existe → crea carpeta + `current.md` + `v1.md` + `history.json`
4. Link: `https://sancho-cmo.taild48df2.ts.net/mc/docs/brand/{slug}/self-intelligence/current.md`
