---
name: niche-discovery-100x
description: Score and discover niche segments.
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: '1'
  pillar: niche-discovery-100x
  layer: '3'
  depends_on: company-context, self-intelligence, competitor-intelligence, swot-analysis
context_required:
- brand/company-context.md
- brand/product-analysis.md
- brand/competitors.md
- brand/swot.md
- brand/customer-data.md
context_writes:
- brand/icp.md
- brand/ecps.md
- brand/learnings.md
---

# ICP & 100x Niche Discovery

> Find hyper-specific groups of people with specific problems that YOU can uniquely solve. Specificity pays — well-served niches pay more and churn less.

Two parallel tracks feed the same pipeline: Track 1 (Traditional ICP) provides the audience filter, Track 2 (100x Niches) provides the problem-level specificity. Together they produce ECPs (Early Customer Profiles) — the actual targets for all downstream marketing.

Heavy pillar. Depends on company-context, self-intelligence, competitor-intelligence, and SWOT being at least Lite-done. If existing customer data is available, that becomes the #1 input — real data always beats scraped assumptions.

---

## Execution: 5 Steps

### Step 1: Problem Scraping (~30-60 min)

Define keywords from market, product, and sector (drawn from earlier Foundation work). Scrape forums, communities, and review sites at scale.

**Primary sources:**
- Reddit (relevant subreddits)
- Quora (topic spaces)
- Twitter/X (keyword search)
- Review sites (G2, Capterra, Trustpilot, App Store)
- Support forums and community boards
- LinkedIn posts and comments

**Fallback sources** (when public conversations are scarce):
- LinkedIn signal mining (posts from ICP personas about their problems)
- Competitor review mining (what competitors' customers complain about)
- Industry Slack/Discord groups
- Conference content and speaker decks
- Sales team intelligence (if available)
- Targeted micro-interviews (5-10 people)

**All sources feed the same pipeline** — whether a problem comes from Reddit, LinkedIn, a sales call, or a micro-interview, it enters Step 2 identically.

**Target**: Collect 50+ raw problem statements. More is better — quantity enables pattern recognition.

### Step 2: Jobs-to-Be-Done Structuring (~20 min)

Structure EVERY collected problem into the JTBD framework:

| Field | Description | Example |
|-------|-------------|---------|
| **Problem** | What they're trying to solve | "Can't track which marketing channels actually drive revenue" |
| **Why** | Why it matters (underlying motivation) | "Wasting budget on channels that don't convert" |
| **Persona** | Who has this problem (role, context) | "B2B SaaS marketing manager, 10-50 employee company" |
| **Alternatives** | What they currently use/do instead | "Spreadsheets, gut feeling, last-click attribution in GA4" |

**Output**: Structured spreadsheet of 50+ JTBD-formatted problems, ready for filtering.

### Step 3: Triple Filter (SWOT + ICP + Product) (~30 min)

Every JTBD-structured problem passes through THREE filters. All three must pass for a problem to become an ECP candidate.

**Filter 1: SWOT Filter**
- Where OUR product is strong (Strengths from SWOT analysis)
- Where COMPETITORS are weak (Opportunities from SWOT analysis)
- Does this problem align with our strategic opportunities?
- Score: PASS (strong alignment), PARTIAL (some alignment), FAIL (no alignment)

**Filter 2: ICP Filter**
- Does the persona match our broad ICP (even if rough)?
- Can we actually REACH this persona through available channels?
- Is this the kind of customer we want long-term?
- Score: PASS, PARTIAL, FAIL

**Filter 3: Product Filter**
- Can our product ACTUALLY solve this problem today (or with minor effort)?
- How well does it solve it vs alternatives?
- Is this a core use case or a stretch?
- Score: PASS (solves well today), PARTIAL (minor gaps), FAIL (can't solve)

**Why all three:** SWOT shows strategic fit, Product shows execution fit, ICP shows audience fit. Missing one filter leads to:
- No SWOT filter → pursuing problems where competitors crush you
- No ICP filter → solving problems for people you can't reach
- No Product filter → promising what you can't deliver

**Output**: Filtered list — typically 15-25 problems that pass all three filters.

### Step 4: Niche Clustering → ECPs (~20 min)

Cluster the filtered problems into **Early Customer Profiles (ECPs)** / 100x Niches.

**Clustering criteria:**
- Same persona type (role, company size, industry)
- Same problem category (related pains)
- Same buying context (budget level, urgency)
- Reachable through same channels

**Each ECP captures:**
- Name (descriptive, memorable — e.g., "SaaS Marketing Manager drowning in data")
- Core JTBD (the primary problem, in their words)
- Persona snapshot (who, where, what context)
- Current alternatives (what they do today)
- Why WE win (our specific advantage for this niche)
- Estimated market size (addressable count)

**Target**: 3-7 ECPs. Fewer than 3 = too narrow or not enough data. More than 7 = not clustered enough.

### Step 5: ECP Scoring & Prioritization (~15 min)

Score each ECP on three dimensions:

| Dimension | What It Measures | Assessment Method |
|-----------|-----------------|-------------------|
| **Pain Score** (1-10) | How urgent/painful is this problem? | Frequency of complaints, willingness to pay, emotional intensity |
| **Reachability** (1-10) | How easy to find and reach these people? | Channel availability, community density, ad targeting precision |
| **Market Size** (1-10) | How big is this niche? | Estimated addressable population, revenue potential, growth trend |

**Reachability is typically the most important dimension** — even a painful problem in a large market is useless if you can't reach the people who have it.

**Visualization**: Bubble chart where:
- X-axis = Reachability (RIGHT = easier to reach)
- Y-axis = Pain Score
- Bubble size = Market Size
- Color = Product fit (green = strong, yellow = moderate)

**Prioritization output**: Ranked list of ECPs with scores + recommendation for which 1-3 to pursue first.

---

## If Existing Customer Data Exists

When the company already HAS customers, their real data is the #1 input:

1. Analyze CRM data, analytics, or founder knowledge
2. Identify top customer segment by LTV, engagement, or satisfaction
3. Note churn patterns — who leaves and why?
4. Use this data to VALIDATE the scraped problems (not replace them)

Real data always beats scraped assumptions. The 100x process enriches and extends customer data, it doesn't ignore it.

---

## Multi-Market Simplification

When a company operates across multiple countries, actively look for **cross-market ECPs** — niches that exist in multiple geographies with the same problem. Instead of separate Foundation stacks per country, identify ECPs that can be served with the same positioning across borders (adapting language and local regulations, but sharing strategy).

---

## Output: Niche Discovery Profile

See [references/niche-schema.md](references/niche-schema.md) for the complete field-by-field schema.

### Summary (always generated)

> **Nichos de [Company Name]:**
>
> **Problemas analizados**: [n] recopilados → [n] estructurados (JTBD) → [n] filtrados (Triple Filter)
> **ECPs identificados**: [n] nichos
>
> **Top 3 ECPs:**
> 1. [Name] — Pain [n]/10, Reach [n]/10, Size [n]/10
> 2. [Name] — Pain [n]/10, Reach [n]/10, Size [n]/10
> 3. [Name] — Pain [n]/10, Reach [n]/10, Size [n]/10
>
> **Recomendacion**: Empezar con [ECP #1] porque [1 sentence justification — typically highest reachability]

---

## Lite vs Deep Criteria

**Lite done** (minimum for downstream):
- 50+ problems scraped and JTBD-structured
- Triple Filter applied (SWOT + ICP + Product)
- 3-7 ECPs selected and scored
- Prioritization recommendation made

**Deep done** (comprehensive):
- All Lite criteria met
- 100+ problems scraped from 5+ source types
- Customer data integrated (if exists)
- TAM/SAM bottom-up per ECP
- Cross-market ECPs identified (if multi-market)
- Bubble chart visualization produced
- ECP validation plan designed (for next pillar)

---

## Cross-Pillar Data Flow

| Field | Consumed By |
|-------|-------------|
| Selected ECPs | positioning-messaging (per-niche positioning), content-workflow (audience targeting) |
| ECP JTBDs | content-workflow (topic generation), outreach-workflow (messaging) |
| Pain scores | phase-0-diagnostic (market fit signal), experiment design (hypothesis) |
| Reachability data | Phase 3 channel selection, outreach-workflow (where to find them) |
| Market size | budget-constraints (investment justification), Phase 3 scaling decisions |
| Current alternatives | positioning-messaging (competitive positioning), pricing-hooks (anchor pricing) |

---

## ECPs Are NOT Static

As new data comes in from Daily Pulse, validation tests, and sales calls, ECPs shift. Re-evaluate scoring periodically and suggest reprioritization:

"Basandome en tus ultimas 3 llamadas de ventas, el ECP #4 tiene mayor reachability de lo que pensabamos — considera subirlo en prioridad."

---

## Edge Cases

**Not enough public data (niche B2B):**
- Activate fallback sources: LinkedIn signal mining, competitor review mining, micro-interviews
- Even 25 structured problems can produce 3 viable ECPs
- "No hay muchas conversaciones publicas en este sector. Voy a minar LinkedIn y reviews de competidores para compensar."

**Too many problems (overwhelming):**
- Good problem to have. Increase Triple Filter strictness.
- Require all three filters = PASS (no PARTIALs allowed)

**All ECPs score similarly:**
- Break the tie with reachability. The easiest-to-reach ECP wins for initial testing.
- "Los 3 ECPs estan empatados. Recomiendo empezar por [X] porque es mas facil llegar a ellos via [channel]."

**Existing customer data contradicts scraped data:**
- Customer data wins. Always.
- Scraped data reveals POTENTIAL niches; customer data reveals PROVEN niches.
