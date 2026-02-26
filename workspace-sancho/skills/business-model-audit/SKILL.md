---
name: business-model-audit
description: Classify business model and growth motion.
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.1'
  system: SanchoCMO
  phase: '1'
  pillar: business-model-audit
  layer: '1'
  depends_on: company-context
context_required:
- brand/company-context.md
- brand/competitors.md
context_writes:
- brand/business-model.md
- brand/learnings.md
---

# Business Model & Growth Model

> Understand HOW the company acquires and monetizes customers. The business model determines which growth levers exist — choose the wrong motion and you burn cash.

Depends on company-context (needs elevator_pitch, product_type, b2b_b2c at minimum). Run before self-intelligence, competitor-intel, and niche discovery. This is a 20-30 minute analysis combining user input with competitor observation.

**Unknown handling:** Many clients won't know their unit economics, conversion rates, or even revenue model details. When a question gets "no sé": log it as a **Discovery Task** (what to find out, how, and who owns it). Never block progress on unknowns — capture what IS known, flag what ISN'T, and move forward.

---

## Execution: 3 Steps

### Step 1: Classify the Model (~10 min)

Determine the business model archetype. Start with what company-context already captured, then go deeper.

**Questions (adapt — skip what's already known):**

1. "Como generais ingresos? (suscripcion, transaccion por uso, comision de marketplace, freemium, pago unico?)"
   - Many companies have hybrid models — capture the primary + secondary
   - If unknown → Discovery Task: "Clarificar modelo de ingresos con finance/founder"

2. "Cual es vuestro ticket medio? Y el lifetime value estimado de un cliente?"
   - If unknown: "Cuantos meses se queda un cliente medio? Cuanto paga al mes?"
   - If still unknown → Discovery Task: "Calcular LTV desde datos de facturacion o CRM"
   - Calculate when data exists: LTV = ARPA × Gross Margin / Churn Rate

3. "Que porcentaje de vuestros ingresos viene de expansion (upsell/cross-sell) vs nuevos clientes?"
   - If unknown → Discovery Task: "Analizar revenue expansion vs new en los ultimos 6 meses"

**Revenue model archetypes and marketing implications:**

See [references/model-schema.md](references/model-schema.md) for sector-specific benchmarks, and [references/revenue-models-deep.md](references/revenue-models-deep.md) for detailed strategy per model.

| Model | Key Metric | Natural Motion | Primary Channel | Warning Sign |
|-------|-----------|----------------|-----------------|-------------|
| Subscription (ACV < 5K) | Activation rate, free-to-paid | PLG pure | SEO + directories + trials | Payback > 12mo at this ACV |
| Subscription (ACV 5-50K) | PQL rate, trial-to-paid | PLG-to-Sales hybrid | Content + LinkedIn + demos | CAC > 30% of ACV |
| Subscription (ACV 50K+) | Pipeline coverage, win rate | Sales-Led + ABM | Events + analysts + exec outreach | Sales cycle > 9mo without enterprise deal |
| Transaction/Pay-per-use | First transaction rate, repeat rate | Performance + embedded | SEM transactional + API docs | Measuring CAC vs 1st txn (use cohort LTV) |
| Marketplace | Liquidity ratio, supply density | Supply-first + demand SEM | Outbound (supply) + SEO (demand) | Paid demand before liquidity threshold |
| Freemium | Free-to-paid %, time-to-activation | PLG activation + viral | SEO volume + virality built-in | High signups low activation = product gap |
| Usage-based | NRR, expansion revenue | Land-and-expand + DevRel | Developer content + community | NRR < 100% = shrinking revenue base |
| Hybrid (subscription + usage) | NDR, upsell rate | Segmented: SMB=PLG, ENT=ABM | By segment | Floor too low = unprofitable acquisition |

**FinTech-specific additions:**
- Regulatory marketing constraints (MiFID II, CNMV crypto rules, GDPR restrictions on targeting)
- Trust signals as table stakes (licenses, certifications, volume processed)
- Compliance review adds 2-4 weeks to any new campaign
- LinkedIn + sector events + PR = primary channels (not social ads)

### Step 2: Map the Growth Motion (~10 min)

Determine whether the company is (or should be) PLG, MLG, or Sales-Led.

**Two inputs:**
1. **What the client thinks** — ask directly about growth assumptions
2. **What competitors do** — analyze from competitor intelligence (if available) or infer from pricing pages

**Questions:**

1. "El cliente puede empezar a usar el producto solo, sin hablar con nadie? (self-serve signup?)"
   - Yes → PLG candidate. No → Sales-led or MLG.

2. "Donde viene la mayoria de vuestros clientes hoy? (boca a boca, Google, ads, equipo de ventas, partnerships?)"
   - Map the current acquisition sources, even if informal
   - If unknown → Discovery Task: "Instalar atribucion basica (UTMs + GA4) para trackear origen"

3. "El foco deberia ser generar leads para el equipo de ventas, o que la gente se registre directamente?"
   - This reveals the client's mental model — sometimes misaligned with their actual model

**Growth motion classification:**

| Signal | PLG | MLG | Sales-Led |
|--------|-----|-----|-----------|
| Pricing visible | Yes, self-serve | Yes + "talk to sales" for enterprise | Hidden / "contact us" |
| Trial/free tier | Yes | Lead magnet / gated content | Demo only |
| ACV | < 5K EUR/year | 5-50K EUR/year | > 50K EUR/year |
| Decision maker | Individual user | Manager / Ops | C-suite / committee |
| Sales cycle | Days-weeks | Weeks-months | Months-quarters |
| Best channels | SEO, directories, viral | Content, LinkedIn, webinars | ABM, events, analysts, exec outreach |
| Content type | Templates, tools, tutorials | Case studies, ROI calculators | Business cases, compliance docs, references |

**Comparison reveals opportunities:**
- All competitors do the same thing → either match (table stakes) or differentiate (blue ocean)
- No competitor does X → untapped opportunity or graveyard
- Competitor uses PLG but client is Sales-led → test hybrid motion?

### Step 3: Map Current Funnel (~10 min)

Document what exists TODAY, even if it's "nothing."

**Funnel mapping questions:**

1. "Describime el camino que hace alguien desde que os descubre hasta que paga. Paso a paso."
   - Capture every step, however informal

2. "Donde se caen mas personas en ese proceso?"
   - Identifies the bottleneck — this feeds phase-0-diagnostic
   - If unknown → Discovery Task: "Configurar funnel tracking en analytics para identificar bottleneck"

3. "Teneis datos de conversion en cada paso? (analytics, CRM, hojas de calculo, intuicion?)"
   - If no data: note as "unmeasured" — Phase 2 will fix this

**Funnel template (fill what's known):**

```
[Traffic Source] → [Landing/Homepage] → [Signup/Lead Form] → [Activation] → [Conversion] → [Retention]
                    ↓                    ↓                     ↓              ↓              ↓
                    [visits/mo]          [leads/mo]            [activated]    [customers]    [retained]
                    [conversion %]       [conversion %]        [conversion %] [conversion %] [churn %]
```

Mark each step: **measured** / **estimated** / **unknown** (→ Discovery Task).

---

## Discovery Tasks

When client doesn't know an answer, create a structured Discovery Task:

| Unknown | Discovery Task | Owner | Method | Priority |
|---------|---------------|-------|--------|----------|
| Revenue model details | Clarify with finance/founder | Client | Interview | High — blocks classification |
| Unit economics (LTV, CAC) | Extract from billing + CRM data | Client + Sancho | Data analysis | Medium — doesn't block Lite |
| Conversion rates | Install funnel tracking | Client | GA4 + CRM setup | Medium — Phase 2 will cover |
| Traffic sources | Set up UTM attribution | Client | GA4 UTMs | Medium — needed for channel strategy |
| Expansion revenue | Analyze upsell data from last 6mo | Client | Billing data | Low — enriches Deep only |
| Competitor motions | Research competitor funnels | Sancho | Web analysis | Low — Sancho does autonomously |

Discovery Tasks are stored in the Context Lake and surfaced to the client as actionable next steps.

---

## Output: Business Model Profile

See [references/model-schema.md](references/model-schema.md) for the complete field-by-field schema with sector benchmarks.

### Summary (always generated)

> **Modelo de [Company Name]:**
>
> **Tipo**: [B2B/B2C/Hybrid] — [revenue model] — ACV [amount or "unknown → Discovery Task"]
> **Motion**: [PLG/MLG/Sales-led/Hybrid] — actualmente [current primary source]
> **Funnel**: [n steps mapped], bottleneck en [step] ([conversion %] o unmeasured)
> **Unit Economics**: LTV [amount], CAC [amount], Payback [months] (o "sin datos → Discovery Task")
> **Sector benchmark**: CAC [sector avg], LTV:CAC target [ratio], Payback target [months]
>
> **Discovery Tasks**: [n] datos pendientes de averiguar
> **Implicacion**: [1 sentence on what this means for growth strategy]

---

## Lite vs Deep Criteria

**Lite done** (minimum for downstream):
- B2B/B2C classified
- Revenue model identified
- Current acquisition source(s) listed
- PLG/MLG/Sales-led assessment made
- Discovery Tasks logged for unknowns

**Deep done** (comprehensive):
- All Lite criteria met
- Unit economics calculated (LTV, CAC, payback) or Discovery Tasks assigned
- Full funnel mapped with conversion rates per step (measured or estimated)
- Sector benchmarks compared (see references/model-schema.md)
- Growth motion comparison vs top 3 competitors
- Expansion revenue assessed (NRR or upsell %)
- Model-motion fit validated (no mismatches)

---

## Cross-Pillar Data Flow

| Field | Consumed By |
|-------|-------------|
| B2B/B2C + revenue model | All downstream — channel selection, content type, funnel design |
| PLG/MLG/Sales-led | Phase 2 funnel architecture, Phase 3 channel strategy |
| Current funnel + bottleneck | phase-0-diagnostic (scoring), Phase 2 (fix priority) |
| Unit economics | budget-constraints (is CAC sustainable?), experiment design (ROI thresholds) |
| Competitor growth motions | positioning-messaging (differentiation), channel strategy |
| Expansion revenue data | Phase 3 retention workflows, pricing-hooks |
| Discovery Tasks | Client action items, Phase 2 analytics setup |

---

## Edge Cases

**Pre-revenue company:**
- Valid. Map the intended model and assumptions.
- Benchmark against sector averages from references.
- "No teneis ingresos todavia — perfecto. Mapeemos el modelo que teneis en mente y lo validamos con datos de competidores similares."

**Multiple revenue models:**
- Common in marketplaces and platforms. Capture primary (>60% revenue) + secondary.
- "Teneis varios modelos. Cual genera la mayor parte de los ingresos hoy?"

**No funnel exists:**
- Document as: "Funnel: none. Acquisition: informal/word-of-mouth."
- This is actually useful data — means Phase 2 starts from zero.

**Client thinks they're PLG but they're not:**
- If ACV > 10K and no self-serve signup → they're MLG or Sales-led regardless of belief.
- "Vuestro ticket y proceso de compra sugieren un modelo de ventas asistidas. PLG es viable si reducis la barrera de entrada — quieres explorar eso?"

**FinTech client:**
- Apply FinTech-specific channel constraints (regulatory approval, compliance review timelines).
- Trust signals are table stakes, not differentiators.
- Use FinTech benchmarks from references (not generic SaaS).
