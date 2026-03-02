---
name: niche-discovery-100x
description: "ICP & 100x Niche Discovery: scrape problems, structure as JTBD, triple-filter (SWOT + ICP + Product), cluster into ECPs, score and prioritize. Use when: identifying target customer niches after SWOT and competitor analysis are done. Pipeline: Problem Scraping (50+) → JTBD Structuring → Triple Filter → Niche Clustering → ECP Scoring & Prioritization. Produces 3-7 scored ECPs with bubble chart. NOT for: validating ECPs (use ecp-validation), positioning per niche (use positioning-messaging)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '2.0'
  system: SanchoCMO
  phase: '1'
  pillar: niche-discovery-100x
  layer: '3'
  depends_on: company-context, self-intelligence, competitor-intelligence, swot-analysis
  updated: '2026-02-27'
  changes: v2 — Restructured per skill-creator principles. SKILL.md lean.
context_required:
- brand/company-context.md
- brand/product-analysis.md
- brand/competitors.md
- brand/swot.md
- brand/customer-data.md
context_writes:
- brand/icp.md
- brand/ecps.md
- brand/learnings.md
---

# ICP & 100x Niche Discovery

> Descubre nichos de alto potencial donde tu producto gana. Problemas reales → filtrados → agrupados en ECPs priorizados.

**Input**: company-context, self-intelligence, competitors, SWOT
**Output**: 3-7 ECPs scored → `brand/{slug}/niche-discovery/current.md`

## References

| Archivo | Cuándo leer | Contenido |
|---------|------------|-----------|
| [prompt.md](references/prompt.md) | **SIEMPRE** — fuente de verdad | Los 5 pasos detallados, fuentes de scraping, templates |
| [checklist.md](references/checklist.md) | **Antes de entregar** — self-QA | Ítems de verificación |
| [concepts.md](references/concepts.md) | Si necesitas Triple Filter rules, scoring methodology | Definiciones y metodología |
| [schema.md](references/schema.md) | Si necesitas el schema del output | Campos y tipos del Niche Discovery Profile |

---

## Flujo de Ejecución

### 1. Problem Scraping (~30-60 min)
- Keywords desde market, product, sector (upstream pillars)
- Fuentes: Reddit, Quora, Twitter/X, G2, Capterra, Trustpilot, App Store, forums
- Fallback: LinkedIn signal mining, competitor review mining, micro-interviews
- **Target: 50+ raw problem statements**

### 2. JTBD Structuring (~20 min)
- Cada problema → Problem | Why | Persona | Alternatives
- Output: spreadsheet de 50+ problemas JTBD-formatted

### 3. Triple Filter (~30 min)
- **SWOT Filter**: ¿nuestras fortalezas? ¿debilidades competidores?
- **ICP Filter**: ¿podemos LLEGAR a esta persona?
- **Product Filter**: ¿podemos RESOLVER este problema HOY?
- Los 3 deben pasar (PASS). Output: 15-25 problemas filtrados.

### 4. Niche Clustering → ECPs (~20 min)
- Agrupar problemas filtrados por persona + categoría + contexto de compra
- Cada ECP: nombre, JTBD core, persona snapshot, alternativas, por qué ganamos, market size
- **Target: 3-7 ECPs**

### 5. ECP Scoring & Prioritización (~15 min)
- Pain Score (1-10), Reachability (1-10), Market Size (1-10)
- **Reachability es típicamente el más importante**
- Bubble chart: X=Reachability, Y=Pain, Size=Market, Color=Product fit
- Ranked list con recomendación de top 1-3

---

## Cross-Pillar Data Flow

| Dato | Lo consume |
|------|-----------|
| ECPs seleccionados | positioning-messaging, content-workflow |
| JTBD por ECP | content-workflow, outreach-workflow |
| Pain scores | phase-0-diagnostic, experiment design |
| Reachability | Phase 3 channel selection, outreach |
| Market size | budget-constraints, Phase 3 scaling |
| Alternativas actuales | positioning-messaging, pricing-hooks |

---

## 🔬 Profundizar con Deep Research

Al entregar, añade:

```
📊 **¿Quieres profundizar?**
Puedo lanzar deep-research para ampliar con más fuentes y validación cruzada.
→ Escribe **"profundizar"** para continuar.
```

---

## ✅ Self-QA (OBLIGATORIO antes de entregar)

1. Lee `references/checklist.md`
2. Revisa CADA ítem contra tu documento
3. Si hay ❌ → investiga más. Repite hasta 0 ❌.
4. Spot-check 5-10 URLs con `web_fetch`
5. Añade metadata: `<!-- Self-QA: PASS | fecha | items: X✅ Y⚠️ 0❌ -->`

---

## 📁 Almacenamiento (OBLIGATORIO)

```
brand/{{slug}}/niche-discovery/
├── current.md      ← versión activa
├── v1.md, v2.md... ← versiones anteriores
├── history.json    ← log de versiones
└── qa-log.md       ← historial de QA
```

1. Identifica slug desde systemPrompt
2. Si existe `current.md` → backup como `v{N+1}.md`, pide confirmación
3. Si no existe → crea carpeta + `current.md` + `v1.md` + `history.json`
4. Link: `https://sancho-cmo.taild48df2.ts.net/mc/docs/brand/{slug}/niche-discovery/current.md`
