---
name: positioning-messaging
description: Define positioning and core messaging.
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '2.0'
  system: SanchoCMO
  phase: '1'
  pillar: positioning-messaging
  layer: '4'
  depends_on: niche-discovery-100x, competitor-intelligence
context_required:
- brand/company-context.md
- brand/competitors.md
- brand/icp.md
- brand/ecps.md
context_writes:
- brand/positioning.md
- brand/learnings.md
---

# Positioning & Messaging (Per-Niche)

> Craft the exact messaging each niche needs to hear — what engages them, what builds trust, what makes them choose us. One positioning framework per ECP, not one generic pitch.

Highest-dependency pillar in Foundation. Requires ECPs (from niche-discovery-100x), competitor intelligence (3-lens), self-intelligence, and SWOT. Run AFTER niches are selected and prioritized. Repeat the full 7-step pipeline for each selected ECP, starting with highest-priority.

---

## Template Variables

These 18 variables are set at project level and injected into all prompts. See [references/positioning-prompts.md](references/positioning-prompts.md) for the full prompts.

| Variable | Description | Example |
|----------|-------------|---------|
| `{{ecp_name}}` | Early Customer Profile Name | "Autonomous Saver" |
| `{{ecp_persona}}` | Persona description | "Young professional, 25-35, saving for luxury" |
| `{{problem_core}}` | JTBD statement: "When I <PAIN>, I want to <SOLUTION>" | "When I want to save for a trip, I want automatic rules" |
| `{{ecp_need}}` | Need explanation | "Automate savings toward specific goals" |
| `{{ECP_why_features}}` | Why they'd use the product | "Round-ups, goal tracking, automated transfers" |
| `{{competitors_type_A/B/C/D}}` | 4 competitor categories (no specific brands) | "Banking App", "fintech", "sharing expenses apps", "Spreadsheet" |
| `{{competitors_examples_A/B/C/D}}` | Examples of each type | "BBVA, Santander", "Revolut, N26", "Tricount, Splitwise", "Google Sheets, Excel" |
| `{{client_name}}` | Company name | "Monzo" |
| `{{country}}` | Target country | "Spain" |
| `{{industry}}` | Industry | "Fintech, Banking apps" |
| `{{doc_deep_research}}` | Reference to deep research document | "Deep Research - Autonomous Savers" |
| `{{Name_doc_nichos}}` | Niche document name | "ECP (100xniches)- Monzo BB.docx" |

---

## Execution: 7 Steps (Per Niche)

### Step 1: Niche Deep Research (~20 min)

Deep research focused on the specific niche's problems and needs. NOT the general market research (that's self-intelligence) — this is targeted at the ECP's world.

**Process:**
1. Use `{{ecp_name}}`, `{{ecp_persona}}`, `{{problem_core}}` to define the research scope
2. Research the specific problem space: how people experience it, existing solutions, unmet needs
3. Document findings in `{{doc_deep_research}}` — this feeds ALL subsequent steps

**Output**: Deep research document used as reference input for Steps 2-7.

### Step 2: Mini Competitor Analysis for Niche (~30 min)

Targeted competitive analysis of how competitors serve THIS specific ECP. Different from global competitor-intelligence — focused on the niche problem.

**Process:**
1. Start from global Competitor Intelligence (3-lens research already done)
2. Analyze 4 competitor categories: `{{competitors_type_A}}` through `{{competitor_type_D}}`
3. For each competitor: product overview, relevant features for the ECP, how features work, how they address operational AND emotional friction
4. Use `{{doc_deep_research}}` as supporting reference

**Key distinction**: Analyze both **operational friction** (visibility, automation, segmentation) AND **emotional friction** (motivation, pressure, satisfaction of progress).

See [references/positioning-prompts.md](references/positioning-prompts.md) — Prompt 2 for the full analysis prompt.

**Output**: Per-niche competitor map with feature-level analysis.

### Step 3: Own Company Analysis for Niche (~20 min)

How OUR product solves this niche's problem. Two parts:

1. **General Company Overview** — history, business model, UVP, main features
2. **In-Depth Functional Review for ECP** — features supporting `{{ECP_why_features}}`, end-to-end user flow, how each feature reduces friction

Focus strictly on the company; exclude competitor analysis. Uses `{{doc_deep_research}}` for market alignment.

See [references/positioning-prompts.md](references/positioning-prompts.md) — Prompt 3 for the full analysis prompt.

**Output**: Company analysis document focused on niche problem-solving.

### Step 4: Value Criteria Discovery + Competitive Scoring (~30 min)

**CRITICAL: Value Criteria is a Tier 2 document.** Before creating new criteria, check existing criteria from other niches. Reuse what applies, add only what's new. No duplicates across niches.

**Process:**
1. Generate evaluation criteria blending functional (pricing, UX, integrations, security) AND emotional (trust, empowerment, control, peace of mind)
2. Cover 5 dimensions: Compliance & Reliability, Operational Efficiency, Financial Intelligence, Ecosystem Connectivity, Emotional Drivers
3. Naming: short Noun Phrases (2-5 words), no codes, no sentences, same level of abstraction
4. Score every competitor + "Do Nothing" on 0-5 scale
5. Classify each criterion:
   - **Red Ocean** (avg 4-5): High competition, needs well-satisfied
   - **No Market** (avg 0-1): Low customer value or untapped
   - **Opportunity Zone** (avg 2-3): Key opportunity for differentiation

See [references/positioning-prompts.md](references/positioning-prompts.md) — Prompt 4 for the full prompt.

**Output**:
1. Value criteria table with relevance and justification
2. Competitive Positioning Map (full scoring table with Analysis & Opportunity column)
3. Top 3-5 Opportunity Zones summary

### Step 5: Asset Mapping (~20 min)

**CRITICAL: Asset list is also Tier 2.** Before creating new assets, review assets from other niches. Update or reuse existing ones.

**Process:**
1. Map ALL company assets: features, team abilities, skills, knowledge, technology, location
2. Categorize each as **Qualifier** (market standard, must-have) or **Differentiator** (unique, build business around)
3. Connect each asset to a Value Criterion from Step 4

**Differentiator rules:**
- Avoid vague words ("empower", "elevate", "level up") — be specific
- Niche down in early stages — focus on 1-2 segments to create scalable processes

See [references/positioning-prompts.md](references/positioning-prompts.md) — Prompt 5 for the full prompt.

**Output**: Asset table with columns: Asset | Value Criteria | Category (Qualifier/Differentiator) | Justification.

### Step 6: Benefit-Proof Pairing (~20 min)

For each asset from Step 5, define:
- **Competitive advantage**: What the company gains over competitors
- **User benefit**: What the user actually gets (why they'd care)
- **Proof**: How to demonstrate this to the customer — specific and actionable

**Proof types** (be specific, not generic):
- Testimonials with quotes
- App screenshots showing the feature
- Tutorials demonstrating the flow
- Advertisements with specific messaging
- Cost-comparative tables
- Transparency reports
- Case studies with named companies

Each proof must include the **specific message to display**, adapted to the ECP.

See [references/positioning-prompts.md](references/positioning-prompts.md) — Prompt 6 for the full prompt.

**Output**: Proof table with columns: Unique Asset | Competitive Advantage | Benefit for User | Proof.

### Step 7: Final Positioning & Messaging Playbook (~30 min)

Using the proof table from Step 6, build the definitive messaging playbook.

**Process:**
1. Extract UVP (core value promise) and USPs (product differentiators) from evidence
2. Create bilingual messaging table with marketing-ready copy
3. Apply copywriting principles: clarity, empathy, actionability
4. Each message row = distinct strategic emphasis (automation, fairness, transparency, speed, etc.)
5. Align each row with a Value Criterion from Step 4

**Output format**: Messaging table with columns:

| Message Category | Hypothesis (Why it will work) | Value Criteria | Objective | Final Message (EN) | Final Message (ES) |

**Messaging rules:**
- 1 row for UVP Core Promise
- 4-5+ rows for different USPs, each with unique positioning
- Short, sharp, emotionally intelligent copy
- Benefit-driven over feature-driven
- Pain points and solutions obvious within 1 sentence
- Connect every message to the ECP

See [references/positioning-prompts.md](references/positioning-prompts.md) — Prompt 7 for the full prompt.

---

## Tier 2 Document Management

Four Tier 2 documents are managed across niches:

| Document | Scope | Rule |
|----------|-------|------|
| **Value Criteria** | Shared across all niches | Check existing list before creating. Add new criteria only if not covered. Never duplicate. |
| **Assets** | Shared across all niches | Check existing assets before creating. Same asset may connect to different criteria per niche. |
| **Niche Profiles** | One per ECP | Created per niche, references shared criteria and assets |
| **Messaging Playbooks** | One per ECP | Created per niche, references shared criteria |

**These 4 documents form related databases** — Value Criteria links to Assets, Assets link to Niches, Messaging links to Value Criteria.

**When processing a NEW niche:**
1. Load existing Value Criteria list → check for matches → add only new ones
2. Load existing Asset list → check for matches → add new connections, not duplicate assets
3. Create new Niche Profile referencing existing + new criteria/assets
4. Create new Messaging Playbook referencing criteria

---

## Output: Positioning Document (Per Niche)

See [references/positioning-schema.md](references/positioning-schema.md) for the complete field-by-field schema.

### Summary (always generated, per niche)

> **Posicionamiento para [ECP Name]:**
>
> **Opportunity Zones**: [top 3 criteria where we differentiate]
> **Diferenciadores clave**: [Differentiator assets, not Qualifiers]
> **UVP**: "[core value promise in 1 sentence]"
>
> **Messaging preview** (top 3 messages):
> 1. [EN] "..." / [ES] "..."
> 2. [EN] "..." / [ES] "..."
> 3. [EN] "..." / [ES] "..."

---

## Lite vs Deep Criteria

**Lite done** (minimum for downstream, per niche):
- Steps 1-4 complete (research + competitor + company + value criteria scored)
- 3+ assets mapped to criteria
- Messaging table with UVP + 3 USPs

**Deep done** (comprehensive, per niche):
- All 7 steps complete
- Full competitive scoring map with all categories
- Complete asset inventory with Qualifier/Differentiator classification
- Full proof table with specific messages and evidence
- Complete bilingual messaging playbook
- Tier 2 documents updated and cross-referenced

---

## Cross-Pillar Data Flow

| Field | Consumed By |
|-------|-------------|
| Messaging playbook (bilingual) | Phase 2 landing pages, Phase 3 ad copy, social-content |
| Value criteria + scoring map | pricing-hooks (anchor pricing), competitor-alternatives page |
| Opportunity Zones | content-workflow (own the white space), Phase 3 SEO topics |
| Asset-benefit-proof table | landing-pages (trust signals), email-sequence (proof points) |
| Differentiators vs Qualifiers | brand-voice (what to emphasize), sales enablement |
| UVP/USP per niche | All outbound messaging, ad copy, content strategy |

---

## Edge Cases

**No proof exists for key claims:**
- Flag it clearly. Do not create messaging around unproven claims.
- "No tenemos datos que respalden [claim]. Opciones: (1) generar pruebas primero, (2) cambiar el mensaje, (3) usar un proof type mas debil temporalmente."

**All competitors say the same thing:**
- Look for Reframe opportunities — criteria in the Opportunity Zone that nobody talks about.
- "Todos los competidores dicen lo mismo. Busco un angulo que nadie esta usando pero que importa a los clientes."

**Client wants to position on a weakness:**
- Redirect with Lens 3 data (customer reviews from self-intelligence).
- "Los reviews no mencionan [claimed strength]. Los datos sugieren posicionar en [actual strength]."

**Single ECP:**
- Valid — especially for early-stage. Run the full 7 steps for that single niche.

**Multi-language markets:**
- Core positioning stays the same. Messaging adapts.
- Value criteria and proof are universal. Headlines and tone are localized.
- The bilingual messaging table (EN/ES) handles the most common case.

**Existing Tier 2 documents cover everything:**
- Skip creating new criteria/assets. Just create the niche-specific messaging playbook using existing data.
- "Los value criteria existentes cubren este nicho. Creo solo el playbook de messaging."
