---
name: positioning-messaging
description: "Per-niche positioning and messaging playbook. Use when: crafting messaging for each ECP — what engages them, builds trust, makes them choose us. Runs AFTER niches selected (niche-discovery-100x). Produces per-ECP: deep research, mini competitor analysis, company analysis, value criteria scoring, asset mapping, benefit-proof pairing, objection neutralization, pain-activated messaging playbook (UVP + USPs) with optional A/B variants. Manages Tier 2 shared documents (Value Criteria, Assets) across niches. NOT for: general market research (use market-intelligence), competitor deep-dives (use competitor-intelligence), or brand voice definition (use brand-voice)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '5.0'
  system: SanchoCMO
  phase: '1'
  pillar: positioning-messaging
  layer: '4'
  depends_on: niche-discovery-100x, competitor-intelligence
  updated: '2026-03-06'
  changes: v5 — Shared Tier 2 docs (value-criteria.md + assets.md). Per-ECP lean docs start with JTBD. Value Criteria in ONE table with ECPs as links. Justification + Score Explanations organized BY CRITERIA (not by ECP). Incremental updates across ECPs.
context_required:
- brand/{slug}/company-brief/current.md
- brand/{slug}/market-and-us/competitor-*.md
- brand/{slug}/go-to-market/ecps.md
- brand/{slug}/go-to-market/ecps.md
context_writes:
- brand/{slug}/go-to-market/positioning/shared/value-criteria.md
- brand/{slug}/go-to-market/positioning/shared/assets.md
- brand/{slug}/go-to-market/positioning/shared/messaging-summary.md
- brand/{slug}/go-to-market/positioning/{ecp-slug}/current.md
---

# Positioning & Messaging (Per-Niche)

> Messaging exacto por niche: qué les engancha, qué genera confianza, qué les hace elegir. Un framework por ECP. Repetir pipeline completo para cada ECP seleccionado.

**Input**: ECPs (niche-discovery-100x) + competitor intelligence + self-intelligence + SWOT
**Output**:
- **Shared Tier 2**: `brand/{slug}/go-to-market/positioning/shared/value-criteria.md` + `assets.md`
- **Per-ECP**: `brand/{slug}/go-to-market/positioning/{ecp-slug}/current.md`

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
- **Extrae objeciones de conversión** del company-brief → `{{conversion_barriers}}` (barreras de compra del ECP: precio, miedos, objeciones)
- **Extrae restricciones legales** del company-brief → `{{legal_constraints}}` (qué NO se puede decir/nombrar en copy: fármacos, claims médicos, etc.)
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
- **TIER 2 CHECK**: revisar criteria existentes en `shared/value-criteria.md` antes de crear nuevos
- Genera criteria (funcional + emocional, 5 dimensiones), scoring 0-5 (Prompt 4)
- Clasifica: Red Ocean / No Market / Opportunity Zone
- **FORMATO OBLIGATORIO de `shared/value-criteria.md`:**
  - **UNA sola tabla consolidada**: # | Value Criteria | Imp. | G4U | Comp1 | Comp2 | ... | DIY | Nada | Zone | ECPs
  - **ECPs como links** a los docs per-ECP (ej: `[1](../ecp1-slug/current.md)`)
  - **Justification + Score Explanations organizadas POR CRITERIA** (no por ECP):
    - `### #N Value Criteria Name (Imp. X) — Zone`
    - Párrafo de **Justification**: qué significa este criteria y por qué importa (independiente de ECP)
    - **Scores**: explicación detallada de CADA score por competidor con evidencia y fuente
    - Si un score cambia por ECP, anotarlo INLINE (ej: "⚠️ En ECP 2 sube a 5 porque...")
  - **NUNCA agrupar explanations bajo epígrafes de ECP** — siempre bajo el criteria

### 5. Asset Mapping (~20 min)
- **TIER 2 CHECK**: revisar assets existentes en `shared/assets.md`
- Mapea assets → criteria, clasifica Qualifier vs Differentiator (Prompt 5)
- Actualiza `shared/assets.md` con nuevos assets + per-ECP connections

### 6. Benefit-Proof Pairing (~20 min)
- Para cada asset: competitive advantage + user benefit + proof específico (Prompt 6)
- Proofs variados (testimonial, screenshot, case study — no genéricos)

### 6.5. Objection Neutralization (~20 min) — NUEVO
- Lee `{{conversion_barriers}}` del company-brief
- Para CADA objeción/barrera: genera messaging que la neutralice (Prompt 6.5)
- Tabla: Objeción → Reframe → Mensaje neutralizador → Proof de soporte
- Si el brief no tiene objeciones documentadas → preguntar al usuario las 3 principales

### 7. Final Messaging Playbook (~30 min)
- **Framework Dolor → Diagnóstico → Puente** (mapea al pipeline):
  - **Dolor** = Value Criteria (Step 4): el pain point que el ECP experimenta
  - **Diagnóstico** = el insight que conecta dolor con solución (lo que el ECP no ha verbalizado)
  - **Puente** = Asset (Step 5): lo que tenemos que resuelve el problema
- **2 formatos por mensaje**: versión corta (ads, 1-2 líneas) + versión landing (párrafo story-driven)
- UVP + 4-5+ USPs + mensajes anti-objeción
- Cada fila → Value Criteria (dolor), hypothesis, objetivo, mensaje corto, mensaje largo

### 7.5. Messaging Summary Update (OBLIGATORIO)
- **TIER 2 CHECK**: leer `shared/messaging-summary.md` ANTES de añadir
- Añadir UVP de este ECP a la tabla de UVPs
- Revisar USPs: ¿alguno ya existe? → añadir ECP al existente. ¿Es nuevo? → añadir fila.
- Revisar Objeciones: ¿ya registrada? → añadir ECP. ¿Nueva? → añadir fila.
- Actualizar mensajes transversales si aplica
- Actualizar debilidades cross-ECP si este ECP las expone
- **NUNCA recrear desde cero** — siempre incremental
- **Opcional A/B**: si el cliente tiene tests planificados → generar 2-3 variantes por USP clave (Prompt 7)

### 8. Self-QA (OBLIGATORIO)
- Lee `references/checklist.md`, repite por cada ECP
- **0 ❌** antes de entregar
- **Verificación legal** (BLOQUEANTE): cruza TODO el output contra `{{legal_constraints}}`. Si algún claim, nombre de fármaco, o término restringido aparece → corregir ANTES de continuar.
- **Verificación de datos**: cada cifra/porcentaje/estadística tiene `[Fuente](url)` inline O está marcado como `~estimación sin fuente verificada`.
- Spot-check 5-10 URLs, cruza claims contra self-intel Lens 3
- Metadata: `<!-- Self-QA: PASS | fecha | items: X✅ Y⚠️ 0❌ | legal: PASS/FAIL -->`

### 9. Positioning DAG Review (OBLIGATORIO — Gate de calidad)
- Ejecuta el prompt de `references/positioning-dag-review.md` para CADA ECP
- Evalúa 6 dimensiones: Storytelling Coherence, Value Criteria Analysis, Assets Validation, Messaging Alignment, Orphan & Duplicate Detection, Summary & Recommendations
- **Si el score OVERALL < 5/5**: corregir los action items CRITICAL e IMPORTANT, y repetir la review
- **Solo cuando OVERALL = 5/5** se puede guardar el documento
- Este paso es el gate final — no se entrega nada sin pasarlo

### 10. Guardar con versionado
- Ruta: `brand/{slug}/go-to-market/positioning/current.md`
- Backup + versionado + history.json
- Link: `https://sancho-cmo.taild48df2.ts.net/mc/docs/brand/{slug}/go-to-market/positioning/current.md`

---

## Cross-Pillar Data Flow

| Dato | Lo consume |
|------|-----------|
| Messaging playbook (pain-activated) | Phase 2 landing pages, Phase 3 ad copy, social-content |
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
├── shared/
│   ├── value-criteria.md    ← Tier 2: todos los criteria + scoring + justification + explanations
│   ├── assets.md            ← Tier 2: todos los assets + justification + benefit + proof (global)
│   └── messaging-summary.md ← Tier 2: UVPs + USPs + objeciones + mensajes transversales (consolidado)
├── {ecp1-slug}/
│   ├── current.md          ← Per-ECP: JTBD + top criteria + top assets + messaging
│   ├── v1.md, v2.md...
│   └── history.json
├── {ecp2-slug}/
│   └── ...
└── ...
```

### Estructura del documento Per-ECP (`{ecp-slug}/current.md`)
1. **JTBD Synthesis** — tabla resumen (need, situation, motivation, outcome, JTBD, why, alternatives). SIN narrativa.
2. **Top Value Criteria para messaging** — selección de criteria (importance ≥ 7 + Opportunity Zone) con link a shared doc. Tabla: # | Criteria | Imp. | G4U | Avg comp. | Zone | Asset clave
3. **Assets relevantes** — selección de differentiators que anclan el messaging. Tabla con link a shared doc.
4. **Objection Neutralization** — tabla: Objeción | Tipo | Reframe | Mensaje | Formato
5. **Messaging Playbook** — UVP + USPs + anti-objeciones. Tabla: Cat. | Criteria | Asset | Versión Corta | Versión Landing (Dolor→Diagnóstico→Puente)
6. **Debilidades a resolver** — honestidad sobre gaps

### Reglas de formato
- **Per-ECP doc empieza por JTBD** — zero paja, zero deep research narrativo (eso es input, no output)
- **Shared docs se actualizan incrementalmente** — cada nuevo ECP revisa existentes, solo añade nuevos
- **Links bidireccionales** — shared doc apunta a ECPs, ECPs apuntan a shared
- **Cada mención de Value Criteria o Asset en per-ECP debe ser link** al anchor específico en el shared doc:
  - Value Criteria: `[#N](../shared/value-criteria.md#n-criteria-name)` (ej: `[#1](../shared/value-criteria.md#1-system-transferability)`)
  - Assets: `[AN](../shared/assets.md#an-asset-name)` (ej: `[A1](../shared/assets.md#a1-trust-engine-4-fases--exit-6-meses)`)
  - Aplica en tablas, messaging playbook, objection neutralization, y texto libre
- **Headers en shared docs deben ser anchor-friendly**: `### #N Criteria Name` y `### AN Asset Name`

1. Identifica slug desde systemPrompt
2. Si existe `current.md` → backup como `v{N+1}.md`
3. Si no existe → crea carpeta + archivos
4. Links: `https://sancho-cmo.taild48df2.ts.net/mc/docs/brand/{slug}/go-to-market/positioning/shared/value-criteria.md`
