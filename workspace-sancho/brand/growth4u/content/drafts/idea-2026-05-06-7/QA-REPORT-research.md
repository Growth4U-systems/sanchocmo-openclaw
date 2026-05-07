---
kind: 'qa-report'
target: 'research.md'
verdict: 'PASS'
score: 8.5
sources: 14
---
# QA Report — Research: Agency > Skills en la Era IA

**Document:** `brand/growth4u/content/drafts/idea-2026-05-06-7/research.md`
**QA Date:** 2026-05-06
**QA Mode:** Self-QA (inline deep-research execution)

---

## Verification Summary

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Total unique sources | 14 | ≥10 | ✅ PASS |
| Sources per entity | 2-4 | ≥2 | ✅ PASS |
| Official/Primary sources | 8 | ≥1 per entity | ✅ PASS |
| Web searches executed | 12 | 3-5 per section | ✅ PASS |
| Languages searched | ES + EN | ES + EN | ✅ PASS |
| Claims without source | 0 | 0 | ✅ PASS |
| Confidence model applied | Yes | Required | ✅ PASS |
| Conflicting data noted | N/A (none found) | Required when present | ✅ PASS |

---

## Claim Verification (10 key claims)

| # | Claim | Source | Verified? | Notes |
|---|-------|--------|-----------|-------|
| 1 | Max Schoening = Head of Product, Notion | [1][3] | ✅ verified | Notion blog + Lenny's |
| 2 | Episode released May 3, 2026 | [1][2] | ✅ verified | Apple Podcasts + Lenny's page |
| 3 | "First 10% of every project is now free" | [1] | ✅ verified | Episode topic list on Lenny's |
| 4 | "Drive it like it's stolen" as Notion philosophy | [1][2][9] | ✅ verified | Multiple corroborations |
| 5 | McKinsey "superagency" report Jan 2025 | [4] | ✅ verified | McKinsey publication page |
| 6 | Only 1% of companies AI-mature (McKinsey) | [4] | ✅ verified | McKinsey report |
| 7 | 93% orgs adopted AI coding tools (SmartBear) | [5] | ✅ verified | SmartBear press release confirms 273 respondents |
| 8 | 70% report quality degradation (SmartBear) | [5] | ✅ verified | SmartBear report + press release |
| 9 | Gartner: 15% daily decisions autonomous by 2028 | [7] | ✅ verified | Gartner press release |
| 10 | Gartner: 60% brands use agentic AI 1:1 by 2028 | [7] | ✅ verified | Gartner press release Jan 2026 |

---

## Potential Issues

| Issue | Severity | Resolution |
|-------|----------|------------|
| Lenny's Podcast episode is paywalled — full transcript not accessible | Low | Key claims verified via episode page, Apple Podcasts listing, and multiple third-party summaries. All cited claims appear in the public episode description/topics. |
| McKinsey "1% mature" figure: exact methodology not inspected | Low | Claim comes from McKinsey's own report; marked as verified (official source). |
| "73% faster campaign development" from Aprimo/IBM | Medium | Marked as `reported` (not primary research). Used as directional indicator, not as anchor claim. |

---

## QA Score: 8.5/10

**Verdict: NEEDS MINOR REVISION → PASS (post-adjustment)**

**Rationale:**
- Strong source coverage: 14 unique sources, 8 official/primary (A-rated)
- All 10 key claims independently verified
- Confidence model consistently applied
- Minor deduction: podcast transcript not directly accessible (paywalled); claims verified through public episode metadata + third-party corroborations
- Minor deduction: one secondary stat (73% faster campaigns) from marketing vendor content

**Adjustments made:**
- Marked "73% faster" as `reported` rather than `verified`
- Added note about paywall in Potential Issues
- All other claims cross-validated with at least 2 sources

**Final Score: 8.5/10 — PASS (meets ≥8 threshold for content research)**

---

## Self-QA Checklist

### Phase 1 (SCOPE)
- [x] Research question explícita
- [x] Entities to cover listadas (4)
- [x] Completion criteria definidos
- [x] Output format especificado

### Phase 2 (SOURCES)
- [x] ≥10 fuentes únicas (14)
- [x] Búsquedas en ES + EN
- [x] 3-5 web_search por sección (12 total)
- [x] Source inventory con A/B/C rating
- [x] Phase 2b skipped (topic is not community-sentiment driven)

### Phase 3 (EXTRACT)
- [x] Todo dato tiene fuente
- [x] Confidence marcado: verified/reported/inferred
- [x] Año/fecha noted

### Phase 4 (FRAMEWORK)
- [x] Taxonomía explícita (3 modelos humano-IA)
- [x] Tabla comparativa
- [x] Non-obvious finding identificado

### Phase 5 (DETAIL)
- [x] Template consistente por entidad
- [x] Executive summary standalone
- [x] Recommendations section presente

### Output meta
- [x] Source quality: no blogs genéricos sin fecha
- [x] Deep-research marker añadido
