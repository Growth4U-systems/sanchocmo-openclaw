# learnings.md - Weekly Insights & Patterns

> Síntesis semanal: 9-16 marzo 2026

---

## 🔄 Patterns Confirmed This Week (9-16 Mar)

### 1. Treatment-First Positioning Works for HC
- **Pattern**: 6 ECPs validados + equipo validó "mercado brutal" para nicho mujeres
- **Insight**: El posicionamiento treatment-first ocupa el cuadrante vacío vs competencia (cirugía)
- **Action**: Validar siempre quadrante vacío antes de confirmar ECPs

### 2. API System Self-Service = Escala Sin Fricción
- **Pattern**: 30+ APIs en MC, Growth4U GA4+GSC conectados sin pedir credenciales
- **Insight**: System Service Account + MC links eliminan la fricción de credenciales
- **Action**: Verificar APIs mínimas como gate antes de Phase 2

### 3. Morning Metrics CRON Necesitaaislamiento
- **Pattern**: Cron fixed de 3 mensajes-spam a 1 hilo estructurado
- **Insight**: session=isolated + Sonnet/Opus (no Minimax) para seguir threading patterns
- **Action**: CRONs siempre isolated, nunca main session

### 4. Kanban + Projects UI > Discord Threads Separados
- **Pattern**: UI con drag-drop, Discord channel mapping, mobile dropdowns
- **Insight**: Interfaz centralizada es más usable que threads dispersos
- **Action**: Build task threads en Discord SOLO para alta visibilidad/urgencia

### 5. Connect-API Skill Reduce Paso
- **Pattern**: "conecta facebook ads" → link directo MC sin pasos
- **Insight**: Lenguaje natural + mapping automático = adopción
- **Action**: Extender skill para más APIs y sinónimos

---

### Patterns Previos (sigue vigente)

- Onboarding Mega-Sessions Work (Paymatico 9h)
- Methodology Iteration Cycles Shortening (Alfonso edits skills directly)
- Deliverables Need Anchor Linking
- Visual Identity Before Positioning?
- Presentation Templates = High-Value Add

---

## 📉 What Changed (9-16 Mar)

| Area | Before | After |
|------|--------|-------|
| HC Positioning | Cirugía como core | Treatment-first (vacío de mercado) |
| Quiz Pricing | ¿Multi-price? | €25/€50/€100/€195 en 3 flujos paralelos |
| API Connection | Credenciales por chat | Self-service MC con System SA |
| Metrics Delivery | Canal directo | Hilo estructurado (summary → thread → datos) |
| Project Mgmt | JSON manual | UI Kanban + Projects en MC |
| Ley SARA | No mentioned | CRT/HRT (no PRP/dutasteride) |

---

## 🎯 What to Do Different (from this week)

1. **Proponer "snapshot VI"** aunque positioning incompleto
2. **Verificar APIs mínimas** como gate antes de Phase 2
3. **CRON modelo**: siempre isolated + Sonnet/Opus (no Minimax)
4. **Anclar links** en todos los deliverables
5. **Skill evolution**: documentar cambios en learnings.md no solo commits

---

## 🔧 Operational Issues (Noted)

- Google Workspace: STILL DOWN since Feb 27
- GHL adapter: 422 error (API v2 format)
- Ley SARA: pendiente crear `_references/ley-sara.md`
- HC pending: `competitors/current.md`, `self/current.md` v1.1, `pricing/current.md`

## 🔄 Patterns Confirmed This Week (16-22 Mar)

### 1. API Crisis Monitoring Required
- **Pattern**: Claude API access turn-off email (Mar 18) triggered urgent review
- **Insight**: System needs proactive monitoring for API access/credits
- **Action**: Add API status check to daily heartbeat or create monitoring cron

### 2. Security Alerts Don't Stop Operations
- **Pattern**: Supabase security vulnerability detected (Mar 17), but system continued
- **Insight**: Alerts appear but don't automatically halt operations
- **Action**: Review Supabase alerts during weekly synthesis, escalate if critical

### 3. Weekend Quiet Hours Effective
- **Pattern**: Sat/Sun consistently show low activity (3-5 unread emails, no meetings)
- **Insight**: Weekend pattern is predictable - use for maintenance/updates
- **Action**: Schedule system updates for weekends when possible

### 4. Client Demos Continue
- **Pattern**: Demo with Guido Lonetti (Mar 17), various client syncs
- **Insight**: Demo pipeline active - track conversion
- **Action**: Log demos in client activity, track follow-up

### 5. Multiple Weekly Cycles Converging
- **Pattern**: G4U Weekly, Weekly sistemas, Weekly Fellow<>G4U, Weekly Projects Philippe
- **Insight**: Internal cadence stabilizing - 4-5 recurring weekly meetings
- **Action**: Document weekly cadence in memory for pattern recognition

---

## 🔄 Patterns Confirmed This Week (23-30 Mar)

### 1. Treatment Keyword Gap = Biggest HC Opportunity
- **Pattern**: Trust Engine v2 confirmed HC #1 for surgery keywords, but 0/12 treatment keywords in top 10
- **Insight**: >4,000 monthly searches invisible. Competitors (IMD, Insparya, Pedro Jaén) own this space entirely
- **Action**: Treatment content strategy is the #1 priority — SEO + GEO for treatment terms

### 2. Depth Over Speed — Alfonso Expectation
- **Pattern**: Trust Engine v1 was shallow, Alfonso immediately flagged it. v2 with real data (DataForSEO, Serper) passed
- **Insight**: Quick-and-dirty outputs get rejected. Real data enrichment is non-negotiable
- **Action**: Always use real APIs (DataForSEO, Serper, PSI) for analysis — never synthetic/estimated data

### 3. GEO (Generative Engine Optimization) as New Frontier
- **Pattern**: HC appears in AI answers for cirugía & diagnóstico, but 0/2 treatment queries
- **Insight**: AI search (ChatGPT, Perplexity, Gemini) is a new visibility channel — and HC is missing in treatments there too
- **Action**: Expand GEO analysis (30 prompts × 4 providers) and create GEO-optimized content

### 4. HC Social Presence is Strong but Underlevered
- **Pattern**: IG 133K, YT 40K, TikTok 55K, LinkedIn 7.8K — massive audience, but not converting to treatment awareness
- **Insight**: Social can amplify treatment content — the audience is there, the content isn't
- **Action**: Social content strategy focused on treatment topics (not just surgery showcases)

### 5. Weekend Quiet Pattern Continues
- **Pattern**: Mar 20-22 consistently low activity (newsletters only, no client urgency)
- **Insight**: Weekends are predictable downtime — good for batch analysis/updates
- **Action**: Keep maintenance/heavy analysis on weekends

---

## 📉 What Changed (23-30 Mar)

| Area | Before | After |
|------|--------|-------|
| HC Visibility Data | Qualitative estimates | Quantified: 20 keywords with volume/CPC/position via DataForSEO + Serper |
| Treatment Gap | Suspected | Confirmed: 0/12 treatment keywords in top 10, >4K monthly invisible searches |
| GEO Visibility | Unknown | Mapped: HC present in surgery AI answers, absent in treatment AI answers |
| Trust Engine | Shallow v1 | Data-enriched v2 with 9/9 modules, real API data |
| Social Audit | Not done | Completed: 4 platforms mapped with follower counts |

---

## 🎯 What to Do Different (from this week)

1. **Treatment content first** — SEO articles targeting top missing keywords (alopecia androgenética tratamiento 1300/mo, PRP capilar precio 720/mo)
2. **GEO strategy** — Expand AI search analysis, create content optimized for AI snippets
3. **Social → Treatment pivot** — Use 133K IG + 55K TikTok audience to amplify treatment content
4. **Always enrich with real data** — Never deliver analysis without API-backed data
5. **PSI rate limit workaround** — Need alternative to Google PSI for site speed audits (429 errors)

---

## 🔧 Operational Issues (Noted)

- Google PSI API: rate limited (429) — need CrUX API key or alternative
- GEO still limited: 4 prompts × 1 provider (target: 30 × 4)
- Pending: execution plan for treatment visibility improvement

*Last updated: 2026-03-30*
