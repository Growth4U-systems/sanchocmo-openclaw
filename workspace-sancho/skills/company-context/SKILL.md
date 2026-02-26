---
name: company-context
description: Capture company profile and goals.
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: '1'
  pillar: company-context
  layer: '0'
context_required: []
context_writes:
- brand/company-context.md
- brand/team.md
- brand/learnings.md
---

# Company Context

> Capture WHO the company is, WHAT they want, and WHY they exist. Bedrock for every downstream pillar. Strategy: **Infer → Validate → Complete**.

Run this first — every other pillar reads from the Company Context Profile. Never make the user feel like they're filling out a form. Extract as much as possible autonomously, present findings for validation, and only ask for what's truly missing.

---

## Execution: 3 Steps

### Step 1: Infer First (~5-15 min, autonomous)

Before asking a single question, scrape and analyze everything available.

**If URL exists:**
- Homepage: elevator pitch, product/service description, pricing model
- About page: founding story, mission, values, team size
- Product/features pages: what they sell, how it works
- Pricing page: model (subscription, one-time, freemium, custom), tiers, positioning
- Footer/legal: founding year, location, legal entity
- Meta tags + OG: how they describe themselves in 160 chars
- Blog/resources: content themes, publishing frequency, thought leadership areas

**If social profiles exist** (extracted from URL or provided):
- LinkedIn: company size, industry, tagline, recent posts tone
- Twitter/X: bio, follower count, posting frequency, engagement level
- Instagram: visual identity, content themes
- Other platforms: YouTube, TikTok, podcast presence

**If documents exist** (pitch deck, brand guide, previous strategy):
- Map every extracted fact to a specific field in the Context Profile
- Track source for each fact ("extracted from pitch deck, slide 4")

**If Notion/CRM data exists:**
- Pull existing meeting notes, proposals, deal context
- Check for previous analyses or strategy documents

**Output of Step 1:** Pre-filled Context Profile with source attribution per field. Coverage percentage calculated.

### Step 2: Validate and Correct (~5 min, collaborative)

Present the inferred profile to the user grouped, not field by field:

> "Esto es lo que he encontrado sobre tu empresa. Revisa y corrige lo que este mal:"
>
> **Nombre**: [inferred] ✅
> **Elevator pitch**: [extracted from homepage] ⚠️ (validar)
> **Producto/servicio**: [extracted] ⚠️
> **Modelo de negocio**: [inferred from pricing page] ⚠️
> **Mercados**: [inferred from legal/about] ⚠️
> **Fundacion**: [extracted] ✅
>
> Marca con ✅ lo correcto, corrige lo incorrecto.

Use checkmarks for high-confidence inferences, warnings for medium, and blanks for unknown.

### Step 3: Complete Gaps (~10-20 min, conversational)

After validation, ask ONLY for missing fields. Group by theme, max 3-4 at a time. Explain WHY each question matters.

**Question priority** (ask in this order, skip already-answered):

1. **The Core Three** (required for routing, if not yet inferred):
   - "Que haceis exactamente? En una frase." (elevator pitch)
   - "Que resultado quereis conseguir en los proximos 3-6 meses?" (goals)
   - "Que os diferencia de las alternativas?" (belief/differentiator)

2. **Business Model** (required for phase routing):
   - "Como ganais dinero? Modelo de revenue." (if not inferred from pricing page)
   - "B2B, B2C, o ambos?" (if ambiguous)
   - "Ticket medio y LTV estimado?" (if they have customers)

3. **Current State** (required for diagnostic scoring):
   - "Teneis web? Redes activas? Algun canal de marketing funcionando?"
   - "De donde vienen vuestros clientes hoy?" (acquisition channels)
   - "Cuantos clientes/leads teneis al mes?" (volume baseline)

4. **Aspirational** (nice to have, enriches downstream):
   - "Como os veis en 3 anos?" (vision)
   - "Que valores son innegociables para la marca?" (brand pillars)
   - "Hay algo que NO quereis hacer nunca en marketing?" (constraints)

**For each question, explain the "por que":**
> "Te pregunto esto porque determina si empezamos construyendo tu funnel o generando trafico. Sin saber de donde vienen tus clientes, no puedo priorizar."

---

## Output: Company Context Profile

The structured output that feeds all downstream pillars. See [references/context-profile-schema.md](references/context-profile-schema.md) for the complete field-by-field schema with data types, required levels, source priority, and downstream consumers.

### Profile Summary (always generated)

After completing the 3 steps, generate a narrative summary:

> **[Company Name] en 30 segundos:**
>
> [1 paragraph: what they do, who they serve, how they make money]
>
> [1 paragraph: current state — what's working, what's not]
>
> [1 paragraph: where they want to go, main constraint/challenge]

Store this summary as Tier 1 context (always loaded) for use by all other skills.

---

## Lite vs Deep Criteria

**Lite done** (minimum for downstream pillars to start):
- Core Three answered (what/want/believe)
- URL analyzed (if exists)
- Business model classified (B2B/B2C/hybrid + revenue model)
- At least 1 goal quantified or directional

**Deep done** (comprehensive):
- All Lite criteria met
- Business model fully classified with revenue streams
- Goals quantified with numbers (not just "grow")
- Vision documented (3-5 year)
- Brand values/pillars articulated
- Current acquisition channels mapped with rough volume
- Constraints and non-negotiables documented

---

## Cross-Pillar Data Flow

Data captured here flows to:

| Field | Consumed By |
|-------|-------------|
| Elevator pitch + product description | positioning-messaging, brand-voice, content-workflow |
| Business model + revenue | business-model-audit (enriches), pricing-hooks |
| Goals + timeline | foundation-orchestrator (Lite vs Deep decision), phase routing |
| Markets/geography | market-intelligence, competitor-intelligence |
| Current channels + volume | diagnostic scoring (Traffic + Revenue dimensions) |
| Values + constraints | brand-voice-quick, content-workflow (tone guardrails) |
| Vision | positioning-messaging (long-term narrative) |

---

## Edge Cases

**Pre-launch company (no URL, no customers):**
- Skip URL inference entirely
- Focus on Core Three + Business Model + Vision
- Mark coverage as "pre-launch" — downstream pillars adapt (e.g., customer-data auto-skips)

**Pivot or rebrand:**
- Capture BOTH old and new context
- Flag: "La empresa esta en transicion de [old] a [new]. Usar [new] para estrategia."
- Old context useful for competitor-intel and market-intel

**Multiple products/services:**
- Create one Context Profile per product if they're distinct (different ICP, different pricing)
- Create one unified profile if products share the same audience
- Ask: "Quieres que trabaje la estrategia para [Product A], [Product B], o el negocio completo?"

**Client already has existing strategy docs:**
- Extract and map to profile schema
- Do NOT discard — reference as "previous strategy" for evolution tracking
- Ask: "Quieres que parta de esta base o empezamos de cero?"

---

## Re-Entry Behavior

When returning to update company-context (e.g., after 3 months of execution):

1. Load existing profile
2. Highlight what might have changed: "Han pasado X semanas. Ha cambiado algo en [goals/product/team]?"
3. Focus on fields most likely to evolve: goals, channels, volume, team
4. Update profile and propagate changes to downstream pillars that consumed the changed fields

---

## Conversation Design

**Tone:** Confident, efficient, like a senior consultant who's done this 100 times. Not a form. Not a chatbot. A strategic conversation.

**Pacing:**
- Fast clients (experienced founders): 15-20 min total, validate + fill gaps in 1 round
- Detailed clients (first-time with marketing agency): 30-40 min, 2-3 rounds of questions
- Document-heavy clients: 10-15 min if good docs provided

**Never say:**
- "Please fill out this form"
- "I need you to answer these questions"
- "What is your company name?" (if you can find it)

**Always say:**
- "Esto es lo que ya se. Corrigeme si me equivoco."
- "Te pregunto esto porque..."
- "Con esto ya puedo empezar a trabajar en [next pillar]."
