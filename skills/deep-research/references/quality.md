# Deep Research — Quality Standards & Self-QA

Used in Phase 6 (QA) and before delivering in Phase 7.

---

## Quality Standards (mínimos)

| Standard | Minimum |
|----------|---------|
| Sources per entity | ≥ 2 (at least 1 official) |
| Total unique sources | ≥ 10 |
| Web searches per section | 3-5 (en ES + EN) |
| QA confidence score | ≥ 8/10 before delivery |
| Claims without source | 0 (all sourced or flagged) |
| Conflicting data | Noted with both versions |
| Data freshness | Year noted for all metrics |
| Entity coverage symmetry | Same template applied to ALL entities |

---

## QA Verdict Thresholds (Phase 6)

| Score | Verdict | Action |
|-------|---------|--------|
| ≥ 9/10 | **PASS** | Proceed to Phase 7 (DELIVER) |
| 7 - 8.9/10 | **NEEDS REVISION** | Fix flagged issues, re-run QA on fixes only |
| < 7/10 | **MAJOR ISSUES** | Rework affected sections, full QA re-run |

**Rule:** Fix ALL errors and discrepancies before delivering. For UNVERIFIABLE claims: either find a source, mark explicitly as "no public data available", or remove the claim.

---

## Self-QA Checklist (antes de invocar qa-bot)

Para cada ítem: ✅ | ⚠️ (justificado) | ❌ (seguir trabajando).
**Solo invocar `qa-bot` con 0 ❌.**

### Phase 1 (SCOPE)
- [ ] Research question explícita en el documento
- [ ] Entities to cover listadas
- [ ] Completion criteria definidos ("complete means…")
- [ ] Output format especificado

### Phase 2 (SOURCES)
- [ ] ≥ 10 fuentes únicas identificadas
- [ ] Búsquedas en ES + EN ejecutadas
- [ ] 3-5 web_search por sección
- [ ] Source inventory con A/B/C rating
- [ ] Phase 2b activada o deliberadamente saltada (con razón)

### Phase 3 (EXTRACT)
- [ ] Todo dato tiene fuente (URL inline o footnote)
- [ ] Confidence marcado: verified / reported / inferred
- [ ] Fuentes contradictorias presentadas como rango
- [ ] Año/fecha noted en cifras

### Phase 4 (FRAMEWORK)
- [ ] Taxonomía/framework explícito
- [ ] Tabla comparativa entities × dimensions
- [ ] Non-obvious finding identificado

### Phase 5 (DETAIL)
- [ ] Estructura del template ([templates.md](templates.md)) respetada en todas las entities
- [ ] Cobertura simétrica (ningún entity con menos detalle que otro)
- [ ] Executive summary standalone
- [ ] Recommendations section presente

### Output meta
- [ ] Source quality: NO blogs genéricos, NO pre-2023, NO Wikipedia (excepto puente a primary)
- [ ] Coherencia con otros brand files (si Foundation)
- [ ] Marca `<!-- deep-research: YYYY-MM-DD | fuentes: N | búsquedas: M -->` añadida (si Foundation)
- [ ] Backup `{pilar}.current.md` → `v{N+1}.md` (si Foundation)

---

## Source Quality Rules

**Aceptado:**
- Consultoras (Statista, IBISWorld, Grand View Research, McKinsey, Deloitte)
- Prensa especializada (sector-specific)
- Publicaciones oficiales (INE, Eurostat, Census Bureau, BLS)
- SEC filings, earnings calls, investor presentations
- Artículos académicos (Google Scholar)

**NO aceptado:**
- Blogs genéricos sin fecha
- Fuentes pre-2023 (excepto datos históricos relevantes)
- Wikipedia (excepto como puente a primary sources)
- Listicles SEO sin firma
- Press releases sin verificación independiente

Ver [sources.md](sources.md) para categorías 1-5 + A/B/C rating.
