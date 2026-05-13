# QA Report — Fintechs Europeas y Remesas LatAm

**Document:** `fintech-remesas-latam-analysis.md`
**Date:** 2026-05-09
**Mode:** Self-QA (qa-bot skipped per test run instructions)

---

## Self-QA Checklist

### Phase 1 (SCOPE)
- [x] Research question explícita en el documento
- [x] Entities to cover listadas (Revolut, N26, Wise)
- [x] Completion criteria definidos
- [x] Output format especificado

### Phase 2 (SOURCES)
- [x] ≥ 10 fuentes únicas identificadas (12 fuentes)
- [x] Búsquedas en ES + EN ejecutadas (7 búsquedas, ambos idiomas)
- [⚠️] 3-5 web_search por sección — Justificación: scoped a 5-7 fuentes por test run; secciones alimentadas por múltiples fuentes cruzadas
- [x] Source inventory con A/B/C rating
- [x] Phase 2b deliberadamente saltada (research de mercado/estrategia, no topic trending con dimensión social)

### Phase 3 (EXTRACT)
- [x] Todo dato tiene fuente (URL inline o footnote)
- [⚠️] Confidence marcado: la mayoría de datos son "verified" o "reported"; se usa formato [N] inline en lugar de etiquetas explícitas de confianza por legibilidad
- [x] Fuentes contradictorias: el dato de $170B (Dialogue) vs $174B (NovoBrief) vs $161B (IDB) se resuelve diferenciando: $161B es 2024 (IDB), $170B~$174B es 2025 (diferentes fuentes/metodologías)
- [x] Año/fecha noted en cifras

### Phase 4 (FRAMEWORK)
- [x] Taxonomía/framework explícito (3 modelos de entrada)
- [x] Tabla comparativa entities × dimensions
- [x] Non-obvious finding identificado (corredor Europa→Sudamérica > US→Sudamérica)

### Phase 5 (DETAIL)
- [x] Estructura del template respetada
- [x] Cobertura simétrica (3 entidades, ~3-4 párrafos cada una + implicaciones)
- [x] Executive summary standalone
- [x] Recommendations section presente (6 recomendaciones)

### Output meta
- [x] Source quality: No blogs genéricos, no pre-2023 (excepto datos históricos contextuales)
- [x] Documento es prosa analítica, NO log de proceso
- [x] NO contiene: lista de búsquedas, narración de pasos, inventario de fuentes como contenido principal
- [x] Raw data folder completa

## Quality Standards Compliance

| Standard | Required | Actual | Status |
|----------|----------|--------|--------|
| Sources per entity | ≥ 2 | 3-4 per entity | ✅ |
| Total unique sources | ≥ 10 | 12 | ✅ (adjusted to 5-7 primary per test scope) |
| Searches per section | 3-5 (ES+EN) | 7 total | ⚠️ (reduced per test scope) |
| Claims without source | 0 | 0 | ✅ |
| Conflicting data | Noted | Yes ($170B vs $174B vs $161B) | ✅ |
| Data freshness | Year noted | Yes | ✅ |
| Entity symmetry | Same template | Yes | ✅ |

## Potential Issues / Limitations

1. **Wise revenue regional breakdown** — Statista reports "majority" from Europe but exact LatAm figure is behind paywall. Used "Europe generates majority" language. Confidence: reported.
2. **N26 valuation** — Marked as "est." (~$3B) since exact current figure not publicly confirmed.
3. **36.2% Europe figure for South American remittances** — Sourced from IDB data cited by Inswitch LinkedIn article; would benefit from cross-validation with primary IDB source.
4. **Cash pickup data points** — Stated Wise doesn't offer cash pickup based on IdealRemit guide; confirmed by Wise's own product page not listing it, but formal confirmation from Wise IR would strengthen.

## Self-QA Score: 7.5/10

**Verdict: NEEDS REVISION (minor)**

Score reflects: strong analytical narrative, solid source coverage for test scope, symmetric entity treatment, non-obvious findings identified. Deductions for: reduced search volume (per test instructions), some estimated figures without cross-validation, qa-bot verification skipped.

**If this were production:** Would run qa-bot for independent claim verification, add 3-5 more searches to cross-validate the Europe→Sudamérica 36.2% figure, and get exact Wise LatAm volume data from annual report.
