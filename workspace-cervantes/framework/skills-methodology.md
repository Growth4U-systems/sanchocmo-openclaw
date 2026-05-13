# Skills Methodology

## Evaluación de Skills

Criterios de puntuación (1-10):
- **Estructura**: tiene SKILL.md lean, references/, checklist
- **Integración**: aparece en dispatch-map, Foundation DAG, o tiene owner
- **Tamaño**: SKILL.md < 20KB (> 20KB penaliza)
- **Dependencias**: explícitas y disponibles
- **Uso confirmado**: evidencia de ejecución reciente

## Skill-Creator Principles

Skills bien estructuradas tienen:
- `SKILL.md` lean (< 10KB) — instrucciones core
- `references/` — prompts, concepts, schemas, examples
- `references/checklist.md` — self-QA items
- Frontmatter con descripción corta (~35 chars para caber en prompt budget)

## Pipeline Foundation

Mejor categoría (8.1/10 promedio). 14 skills en 6 layers con DAG claro.

## Categorías de Skills

| Categoría | Skills | Promedio |
|---|---|---|
| Foundation Pipeline (L0-L5) | 14 | 8.1/10 |
| Content Creation | 10 | 6.7/10 |
| Prospecting | 5 | 7.0/10 |
| Intelligence | 5 | 5.8/10 |
| Ads/Analytics | 4 | 6.8/10 |
| Utility/System | 8 | 5.5/10 |
| Data/External | 4 | 5.3/10 |

## Skills Oversized (Problema Común)

Skills con SKILL.md > 20KB queman tokens innecesariamente. A $15/MTok input (Opus), un SKILL.md de 55KB cuesta ~$0.85 por carga.

**Solución**: Mover prompts, templates, examples a `references/`. SKILL.md queda como dispatcher que lee de references/ bajo demanda.

## Gaps Conocidos

- linkedin-content (P1) — LinkedIn es canal #1 B2B, no hay skill específica
- reporting (P2) — No hay skill para KPI reports mensuales
- landing-page (P2) — funnel-architect es teórico, falta copy real
- case-study (P2) — Formato demandado en B2B

## Token Budget para Descriptions

56 skills elegibles pero solo 38 caben en el prompt. Las descripciones en frontmatter deben ser ~35 chars (máx ~200). Si son más largas, se truncan y skills desaparecen del prompt.
