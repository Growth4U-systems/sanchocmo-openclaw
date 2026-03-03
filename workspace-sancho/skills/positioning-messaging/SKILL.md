---
name: positioning-messaging
description: "Per-niche positioning and messaging playbook. Use when: crafting messaging for each ECP — what engages them, builds trust, makes them choose us. Runs AFTER niches selected (niche-discovery-100x). Produces per-ECP: deep research, mini competitor analysis, company analysis, value criteria scoring, asset mapping, benefit-proof pairing, bilingual messaging playbook (UVP + USPs). Manages Tier 2 shared documents (Value Criteria, Assets) across niches. NOT for: general market research (use market-intelligence), competitor deep-dives (use competitor-intelligence), or brand voice definition (use brand-voice)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '3.0'
  system: SanchoCMO
  phase: '1'
  pillar: positioning-messaging
  layer: '4'
  depends_on: niche-discovery-100x, competitor-intelligence
  updated: '2026-02-27'
  changes: v3 — Restructured per skill-creator principles. SKILL.md lean (~130 lines). Concepts/prompts in references.
context_required:
- brand/{slug}/company-brief/current.md
- brand/{slug}/market-and-us/competitor-*.md
- brand/{slug}/go-to-market/ecps.md
- brand/{slug}/go-to-market/ecps.md
context_writes:
- brand/{slug}/go-to-market/positioning-{ecp-slug}.md
---

# Positioning & Messaging (Per-Niche)

> Messaging exacto por niche: qué les engancha, qué genera confianza, qué les hace elegir. Un framework por ECP. Repetir pipeline completo para cada ECP seleccionado.

**Input**: ECPs (niche-discovery-100x) + competitor intelligence + self-intelligence + SWOT
**Output**: Messaging Playbook per ECP → `brand/{slug}/positioning/current.md`

## References

| Archivo | Cuándo leer | Contenido |
|---------|------------|-----------|
| [hydration.md](references/hydration.md) | **SIEMPRE** — Step 0 obligatorio | Mapeo de campos upstream → esta skill |
| [prompt.md](references/prompt.md) | **SIEMPRE** — fuente de verdad | 6 prompts detallados (Steps 2-7) |
| [checklist.md](references/checklist.md) | **Antes de entregar** — self-QA | Ítems por step y por ECP |
| [concepts.md](references/concepts.md) | Si necesitas template vars, Tier 2 rules, criteria | Variables, metodología, edge cases |
| [schema.md](references/schema.md) | Si necesitas el schema de campos | Tier 2 DBs + per-niche structure |
| [positioning-dag-review.md](references/positioning-dag-review.md) | **Step 9** — Gate de calidad obligatorio | QA review de 6 dimensiones por ECP |

---

## Flujo de Ejecución (7 Steps, POR CADA ECP)

### 0. Context Hydration (OBLIGATORIO — antes de cualquier pregunta)
- Lee `_system/context-hydration-protocol.md` para el patrón genérico
- Lee `references/hydration.md` para el mapeo específico de esta skill
- Lee TODOS los docs en `context_required`
- Pre-rellena campos según hydration_map
- Presenta datos heredados al usuario: "De [fuente] ya tengo X. ¿Correcto?"
- Solo pregunta campos listados en "Campos genuinamente nuevos"

### 1. Niche Deep Research (~20 min)
- Deep research enfocado en el ECP específico (NOT general market)
- Usa `{{ecp_name}}`, `{{ecp_persona}}`, `{{problem_core}}`
- Output: documento de referencia para Steps 2-7

### 2. Mini Competitor Analysis (~30 min)
- Analiza cómo competidores sirven ESTE ECP (ver `references/prompt.md` — Prompt 2)
- 4 categorías de competidores, features relevantes, fricción operacional + emocional

### 3. Own Company Analysis (~20 min)
- Cómo NUESTRO producto resuelve el problema del niche (Prompt 3)
- Overview + In-depth functional review para el ECP

### 4. Value Criteria + Competitive Scoring (~30 min)
- **TIER 2 CHECK**: revisar criteria existentes antes de crear nuevos (ver `references/concepts.md`)
- Genera criteria (funcional + emocional, 5 dimensiones), scoring 0-5 (Prompt 4)
- Clasifica: Red Ocean / No Market / Opportunity Zone

### 5. Asset Mapping (~20 min)
- **TIER 2 CHECK**: revisar assets existentes
- Mapea assets → criteria, clasifica Qualifier vs Differentiator (Prompt 5)

### 6. Benefit-Proof Pairing (~20 min)
- Para cada asset: competitive advantage + user benefit + proof específico (Prompt 6)
- Proofs variados (testimonial, screenshot, case study — no genéricos)

### 7. Final Messaging Playbook (~30 min)
- UVP + 4-5+ USPs, bilingual (EN + ES), marketing-ready copy (Prompt 7)
- Cada fila → Value Criterion, hypothesis, objective, message EN/ES

### 8. Self-QA (OBLIGATORIO)
- Lee `references/checklist.md`, repite por cada ECP
- **0 ❌** antes de entregar
- Spot-check 5-10 URLs, cruza claims contra self-intel Lens 3
- Metadata: `<!-- Self-QA: PASS | fecha | items: X✅ Y⚠️ 0❌ -->`

### 9. Positioning DAG Review (OBLIGATORIO — Gate de calidad)
- Ejecuta el prompt de `references/positioning-dag-review.md` para CADA ECP
- Evalúa 6 dimensiones: Storytelling Coherence, Value Criteria Analysis, Assets Validation, Messaging Alignment, Orphan & Duplicate Detection, Summary & Recommendations
- **Si el score OVERALL < 5/5**: corregir los action items CRITICAL e IMPORTANT, y repetir la review
- **Solo cuando OVERALL = 5/5** se puede guardar el documento
- Este paso es el gate final — no se entrega nada sin pasarlo

### 10. Guardar con versionado
- Ruta: `brand/{slug}/positioning/current.md`
- Backup + versionado + history.json
- Link: `https://sancho-cmo.taild48df2.ts.net/mc/docs/brand/{slug}/positioning/current.md`

---

## Cross-Pillar Data Flow

| Dato | Lo consume |
|------|-----------|
| Messaging playbook (bilingual) | Phase 2 landing pages, Phase 3 ad copy, social-content |
| Value criteria + scoring map | pricing-hooks, competitor-alternatives page |
| Opportunity Zones | content-workflow, Phase 3 SEO topics |
| Asset-benefit-proof table | landing-pages (trust signals), email-sequence (proof points) |
| Differentiators vs Qualifiers | brand-voice (emphasis), sales enablement |
| UVP/USP per niche | All outbound messaging |

---

## 🔬 Profundizar con Deep Research

Al entregar, añade:

```
📊 **¿Quieres profundizar?**
→ Escribe **"profundizar"** para continuar.
```

---

## 📁 Almacenamiento (OBLIGATORIO)

```
brand/{{slug}}/positioning/
├── current.md      ← versión activa
├── v1.md, v2.md... ← versiones anteriores
├── history.json    ← log de versiones
└── qa-log.md       ← historial de QA
```

1. Identifica slug desde systemPrompt
2. Si existe `current.md` → backup como `v{N+1}.md`
3. Si no existe → crea carpeta + `current.md` + `v1.md` + `history.json`
4. Link: `https://sancho-cmo.taild48df2.ts.net/mc/docs/brand/{slug}/positioning/current.md`
