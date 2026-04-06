# Onboarding Playbook — SanchoCMO

> De cero a decision informada en 30-45 minutos.

---

## New Client Mode

### Step 1: Infer-First Data Pump (5 min)

Antes de preguntar NADA, extraer todo lo disponible:

**From URL:** Product/service description, pricing, business model indicators, positioning claims, brand voice (tone from copy), tech stack (analytics, CRM), social media links, team size estimate, SEO baseline (DA, indexed pages), app store listings.

**From Notion/CRM:** Client docs existentes, meeting notes, proposals sent, task history, customer data.

**From Documents:** Pitch deck → positioning/team/traction. Brand guide → voice/colors/tone. Product docs → features/roadmap. Customer data → ICP insights.

### Step 2: Coverage Report + Validation (5 min)

Mostrar al usuario QUE se infirió con porcentajes por área:
- Company Context (% completado, fuentes usadas)
- Product Analysis (% completado)
- Competitors (% completado)
- Customer Data (% completado)
- Budget & Resources (% completado)

**Overall:** X% auto-filled | Y% necesito preguntarte

Validacion: "¿Esto es correcto? Corrige lo que esté mal antes de seguir."

### Step 3: 3 Preguntas Estrategicas (5 min)

**EXACTAMENTE 3.** No mas. Nunca menos.

**Pregunta 1: EL NEGOCIO** (si no esta 100% claro)
"Describe tu negocio en una frase." Ej: "SaaS de email marketing para ecommerce"

**Pregunta 2: LA META AHORA**
"¿Qué necesitas lograr en los próximos 30 días?"
- LANZAR PRODUCTO → Phase 1 Deep + Phase 2
- GENERAR LEADS → Phase 1 Lite + Phase 2
- ESCALAR → Phase 1 Lite + Phase 3
- ARREGLAR LO QUE NO FUNCIONA → Phase 0

**Pregunta 3: RECURSOS**
"¿Qué tienes listo ya?" (checklist: website con tráfico, clientes activos, casos de éxito, equipo marketing, budget ads, CRM, content marketing activo, herramientas conectadas)

### Step 4: Foundation Blitz (15-20 min paralelo)

3 pillars criticos en PARALELO:

**Task 1: company-context** (10 min)
- Input: Inferred data + Question 1 + Question 3
- Execute: company-context skill
- Output: company-context.json (name, industry, business_model, stage, what_they_do/want/believe)

**Task 2: self-intelligence Lens 1** (15 min)
- Input: company-context.json + Product URL + App Store links
- Execute: self-intelligence skill (Lens 1 ONLY)
- Output: product-analysis.json (avg_review_score, review_count, key_strengths, key_complaints, feature_gaps, viability_score)

**Task 3: competitor-intel Lens 1** (15 min)
- Input: company-context.json + Industry/business model
- Execute: competitor-intelligence skill (Lens 1 ONLY)
- Output: competitors.json (top_3_competitors, their_positioning, differentiation_opportunities)

### Step 5: Viability Checkpoint (automatico)

```python
def viability_checkpoint(product_analysis, competitors):
    score = 0
    flags = []

    # Product Score
    if product_analysis.avg_review_score >= 4.0:
        score += 3
    elif product_analysis.avg_review_score >= 3.0:
        score += 1
        flags.append("Product reviews mediocres (< 4.0)")
    else:
        flags.append("RED FLAG: Reviews bajas (< 3.0)")

    # Review Volume
    if product_analysis.review_count >= 100:
        score += 2
    elif product_analysis.review_count >= 20:
        score += 1
    else:
        flags.append("Pocas reviews (validacion limitada)")

    # Differentiation
    if competitors.differentiation_opportunity:
        score += 3
    else:
        flags.append("No clear differentiation vs competitors")

    # Feature Gaps
    if len(product_analysis.feature_gaps) == 0:
        score += 2
    elif len(product_analysis.feature_gaps) <= 2:
        score += 1
        flags.append(f"Feature gaps: {product_analysis.feature_gaps}")
    else:
        flags.append(f"Major feature gaps: {product_analysis.feature_gaps}")

    # Verdict
    if score >= 7:
        return "VIABLE", "Proceed to Phase 1"
    elif score >= 4:
        return "VIABLE (con warnings)", "Proceed, address flags"
    else:
        return "PRODUCT ISSUES", "Fix product OR Pre-Product path"
```

### Step 6: Phase Decision

```
if viability_score < 4:
    → Pre-Product path (audience while product improves)

elif meta == "LANZAR":
    → Phase 1 Deep (16 pillars, ~1 semana) → Phase 2 (Trust Engine)

elif meta == "LEADS":
    → Phase 1 Lite (7 pillars, ~1 dia) → Phase 2 (Funnel)

elif meta == "ESCALAR":
    → Phase 1 Lite (7 pillars, ~1 dia) → Phase 3 (Growth Loops)

elif meta == "ARREGLAR":
    → Phase 0 Diagnostic (~2-3 horas)
```

Presentar recomendacion con opciones:
1. Aceptar path recomendado
2. Cambiar a Foundation Deep/Lite
3. Skip Foundation e ir directo a Phase 2/3

### Step 7: Route to Orchestrator

- Foundation Lite/Deep → `foundation-orchestrator` skill
- Phase 2 → Trust Engine orchestrator
- Phase 3 → Scale orchestrator
- Phase 0 → Diagnostic flow

**Gate conditions:**
- Phase 1 → Phase 2: Minimum 7 pillars (Lite) o 16 (Deep)
- Phase 2 → Phase 3: Can answer "If I send 1,000 people here, how many convert?"
- Any phase → earlier phase: When Aprende reveals gaps

---

## Returning Client Mode

### Step 1: Context Lake Scan

Read Context Lake state:
- Tier 1 (Constitution): company-context, icp, ecps, positioning, voice-profile
- Tier 2 (Strategic): product-analysis, competitors, market, swot, pricing, business-model, team, assets, budget, customer-data
- Tier 3 (Transitory): meeting-notes, daily-pulse-updates
- Campaigns: active campaigns

### Step 2: Status Board

Mostrar: Phase actual, dia, Foundation progress (Lite pillars X/7, Deep pillars X/16), assets creados, ultima actividad.

### Step 3: Stale Data Detection

```
for file in context_lake.all_files:
    days_old = today - file.last_updated
    if days_old > 90:  → STALE, recomendar refresh
    elif days_old > 30: → AGING, considerar refresh
```

### Step 4: Gap Analysis (Proactivo)

Identificar gaps con mayor impacto:
- Foundation gaps: pillars faltantes que desbloquean otros
- Asset gaps: segun meta del usuario (LEADS sin email sequences, LANZAR sin caso de exito)
- Sort by impact/time ratio
- Presentar top suggestion con: que falta, consecuencias, beneficios, tiempo estimado
