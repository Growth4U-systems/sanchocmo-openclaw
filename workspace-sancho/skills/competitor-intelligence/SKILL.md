---
name: competitor-intelligence
description: Competitor battle cards and landscape.
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: '1'
  pillar: competitor-intelligence
  layer: '2'
  depends_on: company-context
context_required:
- brand/company-context.md
- brand/positioning.md
context_writes:
- brand/competitors.md
- brand/learnings.md
---

# Competitor Intelligence (3-Lens Analysis)

> Know your competitors as well as they know themselves — and better, through their customers' eyes. This is strategic intelligence, not a feature comparison spreadsheet.

Same 3-lens methodology as self-intelligence, pointed outward. Applied to EACH competitor independently. The gap between what competitors claim and what their customers actually say reveals positioning opportunities.

**Shared pipeline:** Profile Discovery → Scraping → Deep Research → Lens Analysis → Battle Card. Identical to self-intelligence except: (1) subject is a competitor, (2) output is a Battle Card instead of a Gap Analysis, (3) repeated for each competitor.

---

## Entry: Three Modes

Before researching from scratch, establish what already exists:

**Mode 1: "I'll tell you"**
User provides competitor intel (names, URLs, observations). Sancho validates, enriches, and fills gaps with research.

**Mode 2: "Research on your own"**
Sancho does full 3-lens research independently. Discovers competitors via search, review sites, and market analysis.

**Mode 3: "Here are some instructions"**
User gives partial guidance (e.g., top 3 names + some observations). Sancho fills the rest.

**In ALL modes:**
1. Check existing data first (Notion, meeting transcripts, Google Drive docs, previous analysis)
2. Present initial findings: "Based on what I've found, here are your competitors. Validate or correct."
3. Research only AFTER establishing the starting list

---

## Pipeline Overview

```
Step 0: Competitor Discovery          → Identify + categorize all competitors
Step 1: Profile Discovery (per comp)  → Find all digital footprint URLs
Step 2: Scraping (per comp)           → Collect raw data from all channels
Step 3: Deep Research (per comp)      → Gemini/web research for context
Step 4: Lens Analysis (per comp)      → Autopercepción → Terceros → Reviews
Step 5: Battle Card (per comp)        → Synthesize into actionable card
Step 6: Competitive Landscape Map     → Cross-competitor synthesis
```

---

## Step 0: Competitor Discovery (~15 min)

Identify and categorize ALL competitors into tiers.

**Discovery sources:**
- User knowledge (Mode 1 or 3)
- Search engines (branded + category keywords)
- Review sites (G2, Capterra, Trustpilot — "alternatives to X")
- App stores (category search)
- Industry reports and rankings
- Self-intelligence Lens 3 (competitor mentions in our reviews)

**Categorize each competitor:**

| Category | Description | How Many | Research Depth |
|----------|-------------|----------|----------------|
| **Direct** | Same product, same market, same audience | 3-5 | Full 3-lens |
| **Indirect** | Different product, same problem (alternatives) | 2-3 | Lens 1 only |
| **Emerging** | New entrants, adjacent players | 1-2 | Monitor only |

**Monitoring tier assignment:**

| Tier | Who | Monitoring Frequency |
|------|-----|---------------------|
| **Tier A** | Top 3 direct competitors | Weekly |
| **Tier B** | 4-10 direct competitors | Monthly |
| **Tier C** | Indirect + emerging | Quarterly |

**Output**: Competitor list with categories, tiers, and URLs — ready for per-competitor deep dive.

---

## Steps 1-4: Per-Competitor Deep Dive

**Repeat for EACH direct competitor.** Indirect competitors get Lens 1 only.

### Step 1: Profile Discovery (~5 min per competitor)

Same platform checklist as self-intelligence:

| Category | Platforms |
|----------|----------|
| Social Media | Instagram, Facebook, LinkedIn, YouTube, TikTok, Twitter/X |
| Review Platforms | Trustpilot, G2, Capterra |
| App Stores | Apple App Store, Google Play Store |
| Website | Main domain, subdomains, blog |
| Paid Ads | Facebook Ads Library, Google Ads Library |

For each: URL, username, status (active/dormant/not found). Paid Ads Library is ADDED here vs self-intelligence — critical for understanding competitor acquisition strategy.

### Step 2: Scraping (~15 min per competitor)

Collect raw data organized by lens:

**Lens 1 sources (Autopercepción — what THEY say):**
- Homepage + product pages (positioning, features, pricing)
- Support/help documentation
- Social media posts (all platforms)
- Paid ads (FB Ads Library + Google Ads Library)
- Blog/content strategy

**Lens 2 sources (Terceros — what OTHERS say):**
- YouTube/Instagram influencers mentioning them
- Articles and reviews written about them
- News/press coverage
- Backlink profile and SEO visibility

**Lens 3 sources (Consumidor — what CUSTOMERS say):**
- Review platforms (Trustpilot, G2, Capterra, App Store, Play Store)
- Social media comments and replies
- Forum mentions (Reddit, Quora, community boards)

### Step 3: Deep Research (~10 min per competitor)

Use Gemini Deep Research or equivalent for:
- Company background (founding, funding, team size, trajectory)
- Product evolution (major launches, pivots, feature additions)
- Growth model (how do they acquire customers? PLG? Sales-led? Content?)
- Public financial data (if available: ARR, user count, funding rounds)

### Step 4: Lens Analysis (3 analyses per competitor)

See [references/competitor-analysis-prompts.md](references/competitor-analysis-prompts.md) for the full analysis prompts.

**Lens 1: Autopercepción**
- What is their stated value proposition?
- How do they position themselves? (keywords, claims, comparisons)
- What audience are they targeting? (implied by messaging)
- What's their pricing model and strategy?
- What features do they emphasize? What do they hide?
- What's their content strategy? (topics, frequency, channels)
- What paid ads are they running? (messaging, targeting, offers)

**Lens 2: Percepción de Terceros**
- How do influencers/media describe them?
- What's their SEO visibility? (DA, top keywords, ranking strength)
- What narrative does the press use?
- Is external perception aligned with their self-messaging?

**Lens 3: Percepción del Consumidor**
- Overall sentiment across review platforms (positive/neutral/negative/mixed)
- Top 3-5 things customers love (specific features/aspects)
- Top 3-5 things customers complain about (specific pain points)
- What competitor do customers mention migrating FROM/TO?
- What problems are customers asking them to solve that they DON'T?

---

## Step 5: Battle Card (per competitor)

Synthesize all 3 lenses into a single-page actionable Battle Card.

See [references/competitor-schema.md](references/competitor-schema.md) for the complete field specification.

### Battle Card Format

```
## Battle Card: [Competitor Name]
**Tier**: [A/B/C] | **Type**: [Direct/Indirect/Emerging] | **Updated**: [date]

### Quick Profile
- Founded: [year] | HQ: [location] | Team: [size]
- Funding: [total raised or revenue if known]
- Growth model: [PLG/Sales-led/Content/Paid/Community]

### Their Positioning (Lens 1)
**Claim**: "[Their stated value proposition]"
**Target audience**: [Who they say they serve]
**Key features**: [Top 3-5 features they emphasize]
**Pricing**: [Model + tiers summary]

### External Perception (Lens 2)
**Media narrative**: [How press/influencers describe them]
**SEO strength**: DA [X], ranks for [top keywords]
**Recognition**: [Awards, rankings, notable coverage]

### Customer Reality (Lens 3)
**Rating**: [Weighted avg across platforms]
**Love**: [Top 3 customer-praised aspects]
**Hate**: [Top 3 customer-complained aspects]
**Unmet needs**: [What customers want that they don't deliver]

### Lens Conflicts
[Where Lens 1 claims ≠ Lens 3 reality — these are vulnerabilities]

### How to Beat Them
**Their weakness, our strength**: [Specific areas where we win]
**Positioning angle**: [How to differentiate against them]
**What NOT to compete on**: [Areas where they're genuinely stronger]
**Sales talking points**: [3-5 specific things to say when prospect mentions them]

### Monitoring Triggers
[What changes would require us to re-analyze this competitor]
```

---

## Step 6: Competitive Landscape Map

After all Battle Cards are complete, synthesize cross-competitor patterns.

**Landscape Map contents:**

1. **Competitor Overview Table**: All competitors on one page (name, type, tier, positioning, pricing, rating, key strength, key weakness)

2. **Positioning Map**: 2x2 matrix showing where each competitor sits
   - Axis options (choose most relevant for the market):
   - Price vs Feature richness
   - Enterprise vs SMB focus
   - Specialist vs Generalist
   - Technical vs Simple

3. **Feature Heatmap**: Matrix of key features × competitors. Green (strong), yellow (exists), red (missing). Shows white space opportunities.

4. **Growth Model Analysis**: How each competitor acquires customers — PLG vs Sales vs Content vs Paid. Reveals which channels are crowded and which have opportunity.

5. **Pricing Landscape**: Summary of all competitor pricing models + where our pricing sits.

6. **Opportunity Summary**: Cross-competitor patterns that reveal:
   - What EVERYONE says but nobody delivers well (Lens 1 vs 3 gaps across competitors)
   - Features nobody offers that customers want (unmet needs from all Lens 3 data)
   - Positioning angles nobody is using
   - Channels nobody is exploiting

---

## Lens Conflict Resolution

When lenses produce conflicting signals, apply this hierarchy:

| Priority | Lens | Rationale |
|----------|------|-----------|
| **1 (Highest)** | Lens 3: Customer Reviews | Behavior > opinions. What customers actually do and say is ground truth. |
| **2** | Lens 2: What Others Say | External validation from third parties has less bias than self-reporting. |
| **3 (Lowest)** | Lens 1: What They Say | Inherently biased — marketing copy, aspirational positioning, curated image. |

**Conflict rules:**
- Lens 3 contradicts Lens 1 → Lens 3 wins. Flag as **positioning vulnerability** (they promise what they don't deliver).
- Lens 2 contradicts Lens 1 → Lens 2 likely more accurate. Investigate why self-perception differs.
- Lens 3 contradicts Lens 2 → Check sample size. Hundreds of reviews > a single influencer review.
- **Exception**: Proprietary claims (roadmap, pricing decisions, internal strategy) — only Lens 1 has data. Mark as INTERNAL.

---

## Lite vs Deep Criteria

**Lite done** (minimum for downstream):
- 3+ direct competitors identified with all 3 lenses complete
- 2+ indirect alternatives identified (Lens 1 at minimum)
- Battle Card produced per direct competitor
- Growth model noted for each competitor
- Monitoring tiers assigned

**Deep done** (comprehensive):
- All Lite criteria met
- 5+ direct competitors fully analyzed
- Indirect + emerging competitors catalogued
- Competitive Landscape Map produced (table + positioning map + feature heatmap)
- Pricing landscape complete
- Opportunity summary with cross-competitor patterns
- Monitoring system configured with triggers

---

## Cross-Pillar Data Flow

| Field | Consumed By |
|-------|-------------|
| Battle Cards | swot-analysis (Opportunities + Threats), positioning-messaging (competitor context) |
| Growth models | business-model-audit (validate own model choice), Phase 3 channel selection |
| Competitor pricing | pricing-hooks (anchor pricing, competitive pricing strategy) |
| Lens 3 customer complaints | niche-discovery-100x (problem validation), positioning-messaging (opportunity zones) |
| Feature heatmap | positioning-messaging (value criteria), content-workflow (comparison content) |
| Positioning gaps | brand-voice (how to differentiate voice), content-workflow (own the white space) |
| Unmet needs (cross-competitor) | niche-discovery-100x (problem sourcing), product feedback |
| Competitive Landscape Map | Phase 2 competitor-alternatives pages, sales enablement |

---

## Edge Cases

**Very crowded market (20+ competitors):**
- Don't analyze all 20. Select top 5 direct + 3 indirect based on overlap with target ECPs.
- "Hay 20+ competidores. Me centro en los 5 que más se solapan con tus ECPs target."

**No clear competitors (new category):**
- Shift to indirect alternatives and "do nothing" analysis.
- Every problem has a current solution — even if it's Excel, manual processes, or ignoring the problem.
- "No hay competidores directos. Analizo las alternativas indirectas: qué hace tu ICP HOY para resolver el problema."

**Competitor is much larger (FAANG/BigCo feature):**
- Focus on THEIR weaknesses in the specific niche, not their overall strength.
- "Google tiene un producto competidor, pero su review data muestra que usuarios de [niche] se quejan de [specific weakness]."

**Competitor data is scarce (stealth/private company):**
- Use whatever data IS available. Lens 3 may be empty.
- Document gaps explicitly: "Lens 3 no disponible — no hay reviews públicas. Confidence: Low."
- Suggest validation methods: "Recomiendo hablar con 3-5 usuarios de [competitor] para compensar la falta de datos públicos."

**Competitor landscape changes rapidly:**
- Flag monitoring tier and triggers.
- "Este mercado se mueve rápido. Configuro alertas semanales para [Tier A competitors] y revisión mensual del landscape completo."

**Self-intelligence reveals we ARE the weakest player:**
- Don't hide it. Positioning-messaging will find angles even for underdogs.
- "En el análisis comparativo, somos el player más débil en [criteria]. Pero tenemos oportunidades en [untapped criteria]."
