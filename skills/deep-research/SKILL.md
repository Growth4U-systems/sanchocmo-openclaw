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
  updated: '2026-05-09'
  changes: 'v3.1 — Output rewrite: final deliverable is a narrative analytical document (not a process/source dump). Added raw/ folder for all downloaded data. Phase 5 now produces prose-first analysis. Templates restructured for readability.'
context_required:
  - Research question + stakeholder + scope (asked via AskUserQuestion if missing)
context_writes:
  - 01-business/clients/{client}/research/{topic}-analysis.md
  - 01-business/clients/{client}/research/{topic}-raw/  # All downloaded sources, extracts, notes
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

0. **⛔ Fail loud si la búsqueda no funciona (SAN-238)** — si `web_search` / `WebSearch` / Firecrawl está caído o devuelve errores, NO inventes fuentes, NO escribas un `research.md` plausible de memoria, y NO falsees el marcador `<!-- … | fuentes: N | búsquedas: M -->`. POSTEA **`⛔ web_search no disponible — no se pudo hacer research, no entrego nada fabricado. Reintenta o revisa el conector.`** y PARA. Es la regla 22 de `workspace-sancho/PROTOCOLS.md` ("opera el sistema, no narres": fallo explícito, nunca un entregable hecho a mano). La pipeline lo verifica server-side: la research gate (`assertResearchReady`, `src/lib/data/content-tasks.ts`) bloquea la transición `→ clarify-needed`/`→ drafting` con **422** salvo que existan los 3 artefactos (`research.md`, `QA-REPORT-research.md`, `brand/{slug}/intelligence/research-log.json`) y `research.md` tenga suficientes **URLs reales** — cuenta enlaces `http(s)://` de verdad, NO el marcador auto-reportado. Un research fabricado se rechaza, no se acepta en silencio.
1. **QA es obligatorio (Phase 6)** — invocar `qa-bot` al documento generado, antes de entregar. No hay deep-research sin QA.
2. **Cero claims sin fuente** — toda afirmación numérica/factual cita fuente verificada (URL visitada, NO inventada).
3. **Mínimo 10 fuentes únicas** + ≥2 fuentes por entidad (≥1 oficial).
4. **Búsquedas en ES + EN** — 3-5 `web_search` por sección.
5. **Estructura simétrica** — cada entidad recibe el mismo template (no asymmetric coverage).
6. **Confidence model** — marcar cada dato como `verified` (oficial) / `reported` (secundario) / `inferred` (deducido).
7. **Stopping criteria** — definido en Phase 1 (`SCOPE`). Sin él, la investigación nunca termina.
8. **El output final es un DOCUMENTO ANALÍTICO, no un log de proceso** — El lector debe entender el tema leyendo el documento. Nada de listar pasos seguidos, búsquedas realizadas, ni inventario de fuentes como contenido principal. Las fuentes van al final como referencias. El cuerpo es PROSA ANALÍTICA: contexto, hallazgos, análisis, implicaciones, recomendaciones.
9. **Carpeta raw/ obligatoria** — Cada research tiene una carpeta `{topic}-raw/` donde se guardan: extractos de fuentes, datos brutos, notas de extracción, social pulse output. El documento final se nutre de esta carpeta pero NO la expone al lector.

## Output Location

| Caso | Ruta |
|------|------|
| Documento final | `01-business/clients/{client}/research/{topic}-analysis.md` |
| **Carpeta raw data** | `01-business/clients/{client}/research/{topic}-raw/` |
| Profundización Foundation | `brand/{slug}/{pilar}/{pilar}.current.md` (backup `{pilar}.current.md` → `v{N+1}.md`) |
| QA report | mismo directorio, prefijo `QA-REPORT-` |
| Research log | `brand/{slug}/intelligence/research-log.json` |

### Contenido de `{topic}-raw/`

| Archivo | Contenido |
|---------|-----------|
| `sources-inventory.md` | Inventario de fuentes con ratings A/B/C |
| `extracts/` | Extractos literales de cada fuente (1 archivo por fuente) |
| `social-pulse.md` | Output de last30days (si se ejecutó Phase 2b) |
| `scope.md` | Brief de scope definido en Phase 1 |
| `framework-notes.md` | Notas de taxonomía/framework (Phase 4 working notes) |

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
