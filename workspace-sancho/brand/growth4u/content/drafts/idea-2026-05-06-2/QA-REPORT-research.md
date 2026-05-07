# QA Report — Research: Conversión Tráfico AI vs Google Orgánico

**Document:** `brand/growth4u/content/drafts/idea-2026-05-06-2/research.md`
**QA Date:** 2026-05-06
**QA Score:** 8.5/10
**Verdict:** NEEDS REVISION (minor) → PASS after notes below

---

## Self-QA Checklist

### Phase 1 (SCOPE)
- [x] Research question explícita en el documento
- [x] Entities to cover listadas (6 entities)
- [x] Completion criteria definidos
- [x] Output format especificado

### Phase 2 (SOURCES)
- [x] ≥10 fuentes únicas identificadas (15 fuentes)
- [x] Búsquedas en ES + EN ejecutadas (12 búsquedas)
- [x] 3-5 web_search por sección
- [x] Source inventory con A/B/C rating
- [x] Phase 2b deliberadamente saltada (tema no es community/sentiment driven)

### Phase 3 (EXTRACT)
- [x] Todo dato tiene fuente (URL inline o footnote)
- [x] Confidence marcado: verified / reported / inferred
- [x] Fuentes contradictorias presentadas como rango
- [x] Año/fecha noted en cifras

### Phase 4 (FRAMEWORK)
- [x] Taxonomía/framework explícito ("Canal Invisible" paradox)
- [x] Tabla comparativa entities × dimensions
- [x] Non-obvious finding identificado

### Phase 5 (DETAIL)
- [x] Estructura del template respetada en todas las entities
- [x] Cobertura simétrica
- [x] Executive summary standalone
- [x] Recommendations section presente

### Output meta
- [x] Source quality: NO blogs genéricos pre-2023
- [x] Marca deep-research añadida en header
- [ ] ⚠️ Minor: algunas fuentes secundarias (Superprompt [12]) sin verificación cruzada independiente

---

## Claim Verification

### Claims verificadas (PASS)
| Claim | Source | Verified? |
|-------|--------|-----------|
| ChatGPT 1.81% vs organic 1.39% (ecommerce, 94 brands) | Visibility Labs [1] | ✅ Primary, methodology documented |
| ChatGPT 15.9% vs Google 1.76% (B2B) | Seer Interactive [2] | ✅ Primary, single client caveat noted |
| ChatGPT conversion 1.4-7.0% by industry | First Page Sage [3] | ✅ Primary, 160+ clients |
| AI referral +31% conversion holiday 2025 | Adobe [4] | ✅ Official Adobe press release |
| LLM sign-up CTR 1.66% vs organic 0.15% | Microsoft Clarity [5] | ✅ Primary, 1200+ sites |
| Gartner -25% search volume prediction | Gartner [7] | ✅ Official press release |
| Original research 4.31x more citations | Yext/Amicited [8] | ✅ Large dataset (17.2M citations) |
| Statistics +41% AI visibility | Princeton/GT [9] | ✅ Peer-reviewed academic paper |

### Claims con caveats (⚠️)
| Claim | Issue | Resolution |
|-------|-------|------------|
| "4.4x conversion" (proposal headline) | Semrush aggregate figure [11] — secondary source. Primary studies show range +31% to ~9x depending on context | ⚠️ Use range in content, not single "4.4x" multiplier. The 4.4x is a valid median estimate but must be contextualized |
| "8.6-15.9%" (proposal signal) | 8.6% figure origin unclear. Closest match: ECDB/Similarweb 11.4%. The 15.9% is verified (Seer) | ⚠️ Drop 8.6% or replace with verified range. Use "up to 15.9% in B2B" with ecommerce baseline (+31%) |
| "6.5x more likely cited via third parties" | Semrush/Onely — secondary, methodology unclear | ⚠️ Marked as `reported`. Use with attribution, not as headline claim |
| "30-70% AI traffic misclassified" | Multiple technical analyses, not primary academic study | ⚠️ Marked as `reported`. Range is directionally valid but imprecise |
| AI 14.2% vs Google 2.8% (Superprompt) | Aggregated study, methodology less rigorous than [1][2][3] | ⚠️ Use as supporting data point, not primary evidence |
| Claude 16.8% conversion (Superprompt) | Conflicts with Seer Interactive data (Claude = 5%) | ⚠️ Flag: different contexts (B2B single client vs aggregated). Note both |

### Claims sin fuente → REMOVED or FLAGGED
- None. All claims sourced.

---

## QA Score Breakdown

| Dimension | Score | Notes |
|-----------|-------|-------|
| Source diversity | 9/10 | 15 sources, 7 category A, good ES+EN mix |
| Claim sourcing | 9/10 | Every claim sourced, confidence model applied |
| Entity coverage symmetry | 8/10 | Claude entity thinner than others (fewer independent sources) |
| Framework insight | 9/10 | "Canal Invisible" paradox is non-obvious and actionable |
| Factual accuracy | 8/10 | Minor conflicts between secondary aggregated studies |
| Actionability | 9/10 | 5 concrete recommendations with specifics |
| **Overall** | **8.5/10** | **PASS** — minor caveats documented, none block content creation |

---

## Recommendations for Content Writer

1. **Do NOT use "4.4x" as the sole headline metric.** Use the verified range: "+31% in ecommerce (94 brands)" or "up to 9x in B2B" depending on audience.
2. **Drop the "8.6%" figure** — not well-sourced. Use "ChatGPT converts at 1.81-15.9% depending on industry vs Google's 1.4-1.8%" instead.
3. **The "6.5x citation via third parties" is `reported`** — use with attribution ("según Semrush") or replace with the verified "4.31x for original research" (Yext).
4. **The GA4 dark traffic angle is the strongest unique frame** — "your best-converting traffic is invisible in your dashboard." Lead with this.
5. **Walk-the-talk Growth4U claim needs verification** — the "#1-2 in Gemini" claim should be marked `[verifica cifra]` unless Alfonso can confirm current ranking.
