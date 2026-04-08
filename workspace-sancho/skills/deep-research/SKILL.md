---
name: deep-research
description: "Universal deep research profundizer: enriches any Foundation document with verified sources, cross-validated data, and granular detail. Use when: user says 'profundizar', 'deep-research', 'más detalle', 'investigar más', or 'ampliar' after any Foundation skill has generated a document. Accepts any .md document as input, investigates section by section with 10+ verified sources, preserves original structure as drop-in replacement. Minimum 3-5 web_search per section, in Spanish AND English. NOT for: generating documents from scratch (use the specific skill), or quick summaries (just answer directly)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '2.0'
  system: SanchoCMO
  phase: any
  pillar: transversal
  layer: any
  depends_on: null
  updated: '2026-02-27'
  changes: v2 — Restructured per skill-creator principles. SKILL.md lean (~100 lines). References created.
context_required:
- El documento base a profundizar (ruta .md)
context_writes:
- brand/{slug}/ — documento profundizado reemplaza original
- brand/{slug}/intelligence/research-log.json
---

# Deep Research — Profundizador Universal

> Acepta cualquier documento Foundation como input. Lo investiga en profundidad con fuentes verificadas. Devuelve el mismo formato, enriquecido.

**Input**: Ruta del .md generado por cualquier skill
**Output**: Mismo documento enriquecido → reemplaza original en `brand/{slug}/`

## References

| Archivo | Cuándo leer | Contenido |
|---------|------------|-----------|
| [prompt.md](references/prompt.md) | **SIEMPRE** — fuente de verdad | Proceso de investigación 3 fases + quality bar + versionado |
| [checklist.md](references/checklist.md) | **Antes de entregar** — self-QA | Ítems de verificación |
| [concepts.md](references/concepts.md) | Si necesitas source priority, citation format, edge cases | Metodología y reglas |

---

## Flujo de Ejecución

### 1. Comunicar inicio
- "🔬 Lanzando deep-research sobre `{documento}`. 3-5 minutos..."

### 2. Analizar documento base
- Lee completo, identifica secciones, lista datos sin fuente, identifica gaps

### 3. Investigar (ver `references/prompt.md`)
- **Fase 1**: Análisis del documento (~1 min)
- **Fase 2**: Investigación profunda (~3-5 min) — 3-5 `web_search` por sección, ES + EN
- **Fase 3**: Síntesis y escritura (~2 min) — preservar estructura, añadir datos + fuentes

### 4. Quality checks
- Mínimo 10 fuentes verificadas
- Solo URLs visitadas (NUNCA inventar)
- Citación inline + sección ## Fuentes al final
- Sin fuente → `⚠️ Estimación sin fuente verificada`

### 5. Self-QA (OBLIGATORIO)
- Lee `references/checklist.md`
- **0 ❌** antes de entregar

### 6. Guardar
- Backup `current.md` → `v{N+1}.md`
- Sobreescribe `current.md` con versión profundizada
- Marca: `<!-- deep-research: YYYY-MM-DD | fuentes: N | búsquedas: M -->`
- Log en `brand/{slug}/intelligence/research-log.json`
- Actualiza `history.json`

### 7. Comunicar resultado
- "✅ Deep-research completado. {N} fuentes, {M} secciones ampliadas."
- Link: `https://sancho-cmo.taild48df2.ts.net/mc/docs/brand/{slug}/{pilar}/current.md`

---

## 📁 Almacenamiento (OBLIGATORIO)

Deep-research SIEMPRE guarda en la carpeta del pilar que profundiza:

1. El documento base ya está en `brand/{slug}/{pilar}/current.md`
2. Backup → `v{N+1}.md`
3. Escribe versión profundizada en `current.md`
4. Actualiza `history.json`
5. NUNCA archivo suelto — SIEMPRE dentro de la carpeta del pilar
