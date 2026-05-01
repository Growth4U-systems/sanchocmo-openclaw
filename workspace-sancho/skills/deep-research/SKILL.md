---
name: deep-research
description: "Multi-source research in 7 mandatory phases (SCOPE → SOURCES → EXTRACT → FRAMEWORK → DETAIL → QA → DELIVER) with structured output, entity-level breakdowns, and mandatory qa-bot verification. Use when user says 'deep research', 'investiga [topic]', 'research [topic] for [client]', 'análisis de mercado', 'competitive analysis', 'benchmark [topic]', 'profundizar', 'investigar más', or needs a comprehensive market/product/regulatory investigation. Each entity gets the same template (no asymmetric coverage). Minimum 10 unique sources, 3-5 web_search per section in Spanish AND English, every claim sourced. Optional Phase 2b social pulse via last30days for community/recency dimensions. NOT for: quick factual lookups (use WebSearch directly), or content generation (use seo-content / social-writer / newsletter)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '3.0'
  system: SanchoCMO
  phase: any
  pillar: transversal
  layer: any
  depends_on:
    - qa-bot
  optional_deps:
    - last30days
  updated: '2026-05-01'
  changes: 'v3 — Restored 7-phase workflow from v1 source of truth. Restructured per skill-creator (lean SKILL.md + references). v2 ''profundizador-only'' mode dropped (was a regression).'
context_required:
  - Research question + stakeholder + scope (asked via AskUserQuestion if missing)
context_writes:
  - 01-business/clients/{client}/research/{topic}-analysis.md
  - 01-business/clients/{client}/research/QA-REPORT-{topic}-analysis.md
  - brand/{slug}/intelligence/research-log.json
---

# Deep Research

> Multi-source structured investigation in 7 mandatory phases. From vague question to verified, sourced report.

## When to Use

- Market analysis for a client (banks, competitors, regulations)
- Product benchmarking (pricing, features, models)
- Regulatory / legal landscape research
- Technology landscape evaluation
- Any research that will be shared with a client or stakeholder
- Profundización de documento Foundation existente (mismo proceso, output reemplaza el `.md` base)

## NOT for

- Quick factual lookups → use `WebSearch` directly
- Content generation → use `seo-content`, `social-writer`, `newsletter`

## Workflow Overview

```
SCOPE → SOURCES → EXTRACT → FRAMEWORK → DETAIL → QA → DELIVER
  1        2         3          4          5       6      7
```

Each phase produces an artifact. **Never skip a phase.** Output of each feeds the next.

## References

| Archivo | Cuándo leer | Contenido |
|---------|------------|-----------|
| [phases.md](references/phases.md) | **SIEMPRE** — fuente de verdad del workflow | Las 7 fases en detalle: inputs, process, rules, outputs |
| [templates.md](references/templates.md) | Phase 5 (DETAIL) | Document structure + per-entity template |
| [quality.md](references/quality.md) | Phase 6 (QA) y antes de entregar | Quality standards + QA verdict thresholds + self-QA checklist |
| [sources.md](references/sources.md) | Phase 2 (SOURCES) | Categorías 1-5 + A/B/C rating + reglas de priorización |

## Mandatory Rules

1. **QA es obligatorio (Phase 6)** — invocar `qa-bot` al documento generado, antes de entregar. No hay deep-research sin QA.
2. **Cero claims sin fuente** — toda afirmación numérica/factual cita fuente verificada (URL visitada, NO inventada).
3. **Mínimo 10 fuentes únicas** + ≥2 fuentes por entidad (≥1 oficial).
4. **Búsquedas en ES + EN** — 3-5 `web_search` por sección.
5. **Estructura simétrica** — cada entidad recibe el mismo template (no asymmetric coverage).
6. **Confidence model** — marcar cada dato como `verified` (oficial) / `reported` (secundario) / `inferred` (deducido).
7. **Stopping criteria** — definido en Phase 1 (`SCOPE`). Sin él, la investigación nunca termina.

## Output Location

| Caso | Ruta |
|------|------|
| Cliente / stakeholder | `01-business/clients/{client}/research/{topic}-analysis.md` |
| Profundización Foundation | `brand/{slug}/{pilar}/current.md` (backup `current.md` → `v{N+1}.md`) |
| QA report | mismo directorio, prefijo `QA-REPORT-` |
| Research log | `brand/{slug}/intelligence/research-log.json` |

## Comunicación durante ejecución

1. **Inicio**: "🔬 Lanzando deep-research sobre `{topic}`. 7 fases, ~10-15 min."
2. **Progreso por fase**: "📊 Phase {N} ({nombre})... {detalle breve}"
3. **Pre-QA**: "🔍 Invocando qa-bot para verificar claims..."
4. **Final**: "✅ Deep-research completado. {N} fuentes verificadas, QA score {X}/10. Output: `{path}`"

## Handoff al usuario

Al terminar, presentar:
1. Executive summary (inline en chat)
2. Key non-obvious finding
3. QA confidence score
4. Rutas a los archivos guardados
