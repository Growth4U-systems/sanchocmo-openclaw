# Keyword Research — Self-QA Checklist

> El agente DEBE revisar este checklist ANTES de entregar el documento.
> Para cada ítem: ✅ completado | ⚠️ no disponible (con justificación) | ❌ pendiente (seguir investigando)
> Solo se entrega cuando todo es ✅ o ⚠️. Si hay algún ❌, volver a investigar.

---

## Iteration Check

- [ ] **keyword-plan.md existente** verificado (Refresh mode vs Full Research mode)
- [ ] **Si Refresh**: summary presentado, opción elegida, diff mostrado antes de overwrite

## Brand Memory Integration

- [ ] **positioning.md** cargado (o marcado "not found")
- [ ] **audience.md / ecps.md** cargado (o marcado "not found")
- [ ] **competitors.md** cargado (o marcado "not found")
- [ ] **Context loading** mostrado al usuario

## Phase 1: Seed Generation

- [ ] **20-30 seed keywords** generados
- [ ] **5 categorías cubiertas** (Direct, Problem, Outcome, Category, Brand-aligned)
- [ ] **Seeds alineados con positioning** (si positioning.md cargado)

## Phase 2: Expand (6 Circles)

- [ ] **Circle 1** (What You Sell) expandido
- [ ] **Circle 2** (Problems You Solve) expandido
- [ ] **Circle 3** (Outcomes You Deliver) expandido
- [ ] **Circle 4** (Your Unique Positioning) expandido — usando positioning.md si disponible
- [ ] **Circle 5** (Adjacent Topics) expandido — usando audience.md si disponible
- [ ] **Circle 6** (Entities to Associate With) expandido
- [ ] **100-200 keywords** en lista expandida
- [ ] **Question + Modifier + Comparison patterns** aplicados

## Phase 3: Web Search Validation

- [ ] **Autocomplete mining** ejecutado (keyword + a-z, how to, best, why, vs, for)
- [ ] **PAA questions** capturadas (por cada pillar keyword)
- [ ] **SERP analysis** realizado (top 5-10 resultados por keyword prioritario)
- [ ] **Competitor content analysis** ejecutado (site: searches, gaps identificados)
- [ ] **Research summary** presentado (discoveries, new keywords added)
- [ ] **Si web search no disponible**: degradación graceful con "ESTIMATED" flag

## Phase 4: Cluster

- [ ] **5-10 pillars** identificados con hub-and-spoke
- [ ] **Keywords agrupados** por semantic similarity + search intent
- [ ] **Pillar keyword** identificado por grupo (el más amplio)
- [ ] **PAA questions** mapeadas a clusters
- [ ] **Competitor coverage** anotada por cluster

## Phase 5: Pillar Validation (CRÍTICO)

- [ ] **Search Volume Test** por pillar (>1K monthly searches cross-cluster)
- [ ] **Product vs Market Test** por pillar (market-centric, no product-centric)
- [ ] **Competitive Reality Test** por pillar (path realista a page 1)
- [ ] **Proprietary Advantage Test** por pillar (datos/expertise únicos)
- [ ] **Pillars que fallan 2+ tests** demoted o removed
- [ ] **Validation output** documentado por pillar (PASS/FAIL + evidence)

## Phase 6: Prioritize

- [ ] **Business Value** scored (High/Medium/Low) por cluster
- [ ] **Opportunity** scored (High/Medium/Low) con SERP evidence
- [ ] **Speed to Win** scored (Fast/Medium/Long)
- [ ] **Priority Matrix** aplicada (DO FIRST → BACKLOG)

## Phase 7: Map to Content

- [ ] **Content type** asignado por cluster (Pillar Guide, How-To, Comparison, etc.)
- [ ] **Intent matching** realizado (Informational/Commercial/Transactional → content approach + CTA)
- [ ] **Content Calendar** generado (Tier 1-4, 90 días)
- [ ] **PAA-driven outlines** creados (PAA → H2s)

## Phase 8: Content Brief Generation

- [ ] **Briefs generados** para todos los Tier 1 + Quick Wins
- [ ] **Cada brief tiene**: target keyword, secondary keywords, intent, content type, SERP snapshot, PAA, outline, angle, differentiation, internal links, CTA, priority
- [ ] **Naming convention** correcta (lowercase-kebab-case.md)
- [ ] **Briefs guardados** en `./campaigns/content-plan/`

## Output

- [ ] **keyword-plan.md guardado** en `./brand/keyword-plan.md`
- [ ] **assets.md actualizado** con entries de briefs
- [ ] **Chain to /seo-content** ofrecido
- [ ] **Formatted output** presentado (pillars, opportunities, calendar, briefs)

## Almacenamiento

- [ ] **Slug identificado** correctamente
- [ ] **Guardado en** `brand/{{slug}}/keyword-plan/` (o `./brand/keyword-plan.md`)
- [ ] **Content briefs** en `./campaigns/content-plan/`

## META (calidad)

- [ ] **Cada keyword tiene data source** (autocomplete, PAA, SERP, competitor gap)
- [ ] **0 keywords inventados** — todos validados con search data (o marcados ~ ESTIMATED)
- [ ] **SERP evidence** respalda cada pillar validation
- [ ] **5-10 SERPs verificados** manualmente (spot-check)
- [ ] **Coherencia con brand files** (positioning alinea angle, no dicta topics)
- [ ] **Plan es accionable** ("start here" claro, briefs listos para escribir)
- [ ] **No es "500 keywords, good luck"** — es estrategia priorizada

---

## Flujo de uso

```
1. Agente ejecuta Phases 1-8
2. Al terminar, lee este checklist
3. Marca cada ítem:
   - ✅ = completado
   - ⚠️ = no aplica o unavailable (con razón)
   - ❌ = falta — completar
4. Si hay ❌ → completar antes de entregar
5. Spot-check: verificar 5-10 SERPs manualmente
6. SOLO ENTONCES guardar y entregar al usuario
```

**No se entrega ningún documento con ❌ pendientes.**
