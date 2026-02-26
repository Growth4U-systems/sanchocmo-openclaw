---
name: budget-constraints
description: Capture budget, timeline, team, tools.
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: '1'
  pillar: budget-constraints
  layer: '0'
context_required:
- brand/company-context.md
context_writes:
- brand/budget.md
- brand/learnings.md
---

# Budget & Constraints

> Map the money, the time, the people, and the tools. Every downstream decision is bounded by these constraints.

Run early — budget and capacity determine whether Foundation goes Lite or Deep, which channels are viable, and what can be executed in-house vs outsourced. This is a 15-30 minute conversation, not an audit.

---

## Execution: 3 Blocks

### Block 1: Budget Range (~5 min)

Capture how much the client can invest in marketing. Do NOT ask for exact numbers upfront — ranges are faster and less intimidating.

**Questions (adapt to context):**

1. "Cuanto invertis actualmente en marketing al mes? (incluye ads, herramientas, freelancers, todo)"
   - If zero: "Entendido. Cuanto estais dispuestos a invertir para empezar?"
   - If vague: "Dame un rango — menos de 1K, 1-5K, 5-15K, 15-50K, o mas de 50K al mes?"

2. "De ese presupuesto, cuanto va a publicidad pagada vs herramientas vs personas?"
   - Many clients don't know this split — that's OK, note it as "unstructured"

3. "Hay flexibilidad para aumentar si los resultados lo justifican? O es un techo fijo?"
   - This determines whether Sancho can propose scaling experiments

**Benchmark context to offer (if helpful):**
- B2B SaaS: 7-12% of revenue on marketing is standard
- Early-stage startups: higher % but lower absolute (invest to grow)
- 70/20/10 rule: 70% proven channels, 20% growth bets, 10% experiments

### Block 2: Time & People (~5 min)

Map who does what and how much time is available.

**Questions:**

1. "Quien se encarga del marketing actualmente? (equipo interno, freelancers, agencia, el fundador solo?)"

2. "Cuantas horas semanales puede dedicar tu equipo al marketing?"
   - Founder-only: typically 5-10h/week realistic
   - Small team: map hours per person
   - With agency: clarify what the agency handles vs internal

3. "Hay alguien que puede crear contenido? (escribir, disenar, grabar video)"
   - This determines content workflow feasibility in Phase 3

4. "Cual es el timeline? Necesitas resultados en semanas, meses, o estais construyendo a largo plazo?"
   - Short (<30 days): Foundation Lite + immediate execution
   - Medium (1-3 months): Foundation Deep + measured scaling
   - Long (3-6+ months): Full system build

### Block 3: Tool Stack (~5-10 min)

Inventory existing tools and identify gaps/overlaps.

**Ask:**
"Que herramientas usais para marketing? (analytics, email, CRM, social, ads, automatizacion, cualquier cosa)"

**Then categorize what they have:**

| Category | Examples | Gap Impact |
|----------|----------|------------|
| Analytics | GA4, Mixpanel, Amplitude | No analytics = Phase 2 blocker |
| CRM | HubSpot, Pipedrive, Salesforce | No CRM = manual follow-up risk |
| Email | Mailchimp, ActiveCampaign, Brevo | No email = nurturing gap |
| Social | Buffer, Hootsuite, native | Minor — can start native |
| Ads | Google Ads, Meta Ads Manager | Only needed if paid is a channel |
| Automation | Zapier, Make, n8n | Nice to have, not blocking |
| Content | Canva, Figma, WordPress | Depends on content strategy |
| SEO | Ahrefs, SEMrush, GSC | GSC is free and sufficient to start |

**Proactive overlap detection:**
If client has 3+ tools in the same category, flag: "Veo que usais [X] y [Y] para [category]. Suele haber solapamiento — quieres que analice si podeis consolidar?"

Industry data: companies typically have 40% tool overlap. A stack audit can save significant budget.

---

## Output: Budget Constraints Profile

See [references/constraints-schema.md](references/constraints-schema.md) for the complete field-by-field schema.

### Summary (always generated)

> **Recursos de [Company Name]:**
>
> **Presupuesto**: [range]/mes ([structured/unstructured], [fixed/flexible])
> **Equipo**: [who] dedicando [hours]h/semana
> **Timeline**: [short/medium/long] — resultados esperados en [timeframe]
> **Stack**: [n] herramientas, gaps en [categories], solapamiento en [categories]
>
> **Implicacion**: [1 sentence on what this means for the strategy]

Example implication: "Con 2K/mes y 10h/semana del fundador, priorizamos 1 canal organico (LinkedIn) + 1 landing page. Paid ads no es viable todavia."

---

## Lite vs Deep Criteria

**Lite done** (minimum for downstream):
- Budget range captured (monthly)
- Timeline expectation set
- Team hours/week estimated
- Existing tools listed

**Deep done** (comprehensive):
- All Lite criteria met
- Budget split by category (ads/tools/people)
- Tool overlap analysis completed
- Capability gaps identified (what they can't do today)
- Budget allocation recommendation per channel (informed by Phase 0 diagnostic)
- Flexibility / scaling conditions documented

---

## Cross-Pillar Data Flow

| Field | Consumed By |
|-------|-------------|
| Budget range | foundation-orchestrator (Lite vs Deep), channel selection in Phase 3 |
| Timeline | foundation-orchestrator (urgency), goal-setting in phase-0-diagnostic |
| Team hours + capabilities | content-workflow (who produces), outreach-workflow (who executes) |
| Tool stack | Phase 2 funnel builder (what's available), analytics-tracking skill |
| Gaps identified | Phase 2 recommendations, tool selection |
| Budget flexibility | experiment design (can we test paid?), scaling decisions |

---

## Edge Cases

**Zero budget:**
- Valid. Many startups bootstrap marketing.
- Focus on time-investment channels: content, community, partnerships, organic social
- "No hay presupuesto pero si tiempo? Perfecto — priorizamos canales organicos donde tu tiempo genera mas retorno."

**Huge budget, no team:**
- Common in funded startups. Budget without execution capacity = waste.
- Recommend: hire/outsource before spending on ads
- "Teneis presupuesto pero nadie para ejecutar. Antes de gastar en ads, necesitamos resolver quien lo hace."

**Client doesn't know their budget:**
- Anchor with benchmarks: "Empresas similares a la tuya invierten entre X-Y/mes. Te parece razonable?"
- Or work backwards: "Cuanto vale un cliente para vosotros? Con eso puedo calcular cuanto tiene sentido invertir."

**Tool stack is a mess (10+ tools, no integration):**
- Don't try to fix now — document and flag for Phase 2
- "Tienes muchas herramientas. En Phase 2 vamos a auditar cuales se solapan y cuales realmente necesitas."

---

## Conversation Design

**Tone:** Direct, no-judgment. Budget conversations can be uncomfortable — normalize every range.

**Never say:**
- "That's not enough" (every budget is a starting point)
- "You should be spending X" (prescriptive without context)

**Always say:**
- "Con [X amount], esto es lo que podemos hacer..." (frame possibilities, not limitations)
- "El presupuesto no determina el exito — la priorizacion si." (reframe)
