---
name: swot-analysis
description: SWOT from internal + competitive data.
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '2.0'
  system: SanchoCMO
  phase: '1'
  pillar: swot-analysis
  layer: '3'
  depends_on: self-intelligence, competitor-intelligence, market-intelligence
  updated: '2026-02-19'
  changes: Automated with CoT prompt (Alfonso's production version), ICE prioritization,
    consulting-grade output
context_required:
- brand/product-analysis.md
- brand/competitors.md
- brand/market.md
context_writes:
- brand/swot.md
- brand/learnings.md
---

# SWOT Analysis & TOWS Strategies

> Evidence-based SWOT + TOWS Matrix + ICE prioritization = Consulting-grade strategic plan

Uses structured Chain of Thought (CoT) prompt to generate exhaustive SWOT analysis with prioritized action plan.

**Zero hallucinations**: Every entry backed by evidence from upstream intelligence pillars (self, competitor, market). TOWS Matrix (Heinz Weihrich) derives SO/ST/WO/WT cross-strategies. ICE scoring prioritizes execution.

**Output**: Executive summary + 4-quadrant SWOT + TOWS strategies (12-16 total) + Prioritized action plan (3 phases)

**Prompt**: See [swot-prompt.md](references/swot-prompt.md)

---

## Input Requirements

Before starting, verify these pillars are at least Lite-done:

| Pillar | Required Data | Feeds Into |
|--------|--------------|------------|
| **self-intelligence** | Confirmed strengths, confirmed weaknesses, perception-reality gaps, viability status | S and W quadrants |
| **competitor-intelligence** | Battle Cards, vulnerabilities, unmet needs, opportunity summary | O quadrant |
| **market-intelligence** | Market maturity, trends, regulatory landscape, TAM/SAM | O and T quadrants |

If any upstream pillar is missing, flag it:
"No puedo construir un SWOT robusto sin [missing pillar]. Quieres que proceda con lo que tengo (baja confianza) o completamos [pillar] primero?"

---

## Pipeline Overview

```
Step 1: Evidence Collection     → Pull confirmed data from upstream pillars
Step 2: SWOT Population         → Place evidence in correct quadrant
Step 3: SWOT Validation         → Review with user, challenge assumptions
Step 4: TOWS Matrix             → Cross-strategies (SO, ST, WO, WT)
Step 5: Strategy Prioritization → ICE-score strategies for execution order
```

---

## Step 1: Evidence Collection (~10 min)

Pull structured data from each upstream pillar. No inventing — only use what has been confirmed.

### From Self-Intelligence:

**For Strengths (S):**
- `confirmed_strengths` — Multi-source confirmed capabilities
- `top_pros` (Lens 3 reviews) — What customers actually praise
- Features/capabilities rated highly across lenses
- Unique assets that competitors lack

**For Weaknesses (W):**
- `confirmed_weaknesses` — Multi-source confirmed gaps
- `top_cons` (Lens 3 reviews) — What customers complain about
- `perception_reality_gaps` — Where promises exceed delivery
- `priority_fixes` — Known issues from triangulation

### From Competitor Intelligence:

**For Opportunities (O):**
- `cross_competitor_patterns.universal_claim_reality_gaps` — What everyone claims but nobody delivers
- `cross_competitor_patterns.aggregate_unmet_needs` — What customers want, nobody offers
- `cross_competitor_patterns.unused_positioning_angles` — Angles nobody is exploiting
- `cross_competitor_patterns.unexploited_channels` — Channels nobody is using
- `vulnerabilities` per competitor — Their weaknesses we can exploit

### From Market Intelligence:

**For Opportunities (O):**
- `trends` where `opportunity_or_threat = opportunity` — Market tailwinds
- `adjacent_markets` — Expansion potential
- Regulatory changes creating new opportunities

**For Threats (T):**
- `trends` where `opportunity_or_threat = threat` — Market headwinds
- Strong competitors in dominant positions (from Battle Cards)
- Regulatory constraints (from regulatory landscape)
- Market maturity signals (consolidation, declining demand)
- Economic factors (funding climate, pricing pressure)

---

## Step 2: SWOT Population (~15 min)

Place each evidence item in the correct quadrant. Rules:

### Quadrant Rules

| Quadrant | Source | Rule |
|----------|--------|------|
| **Strengths** | INTERNAL + CONFIRMED | Must be confirmed by Lens 3 (customer data) or multi-lens. NOT just what the company claims. |
| **Weaknesses** | INTERNAL + CONFIRMED | Must be backed by evidence (bad reviews, gaps, failed metrics). NOT hypothetical. |
| **Opportunities** | EXTERNAL | Market or competitive factors we can exploit. NOT internal capabilities. |
| **Threats** | EXTERNAL | Market or competitive factors that endanger us. NOT internal weaknesses. |

**Common mistakes to avoid:**
- Don't put "our product is innovative" in Strengths unless customers confirm it
- Don't confuse internal weaknesses with external threats
- Don't list generic opportunities ("growing market") without specifics
- Don't duplicate: if something is both a strength and an opportunity, decide which quadrant fits better

### Quality Bar

Each SWOT entry must have:
1. **Statement**: Clear, specific observation (not vague)
2. **Evidence**: Where this data comes from (which lens, which competitor, which trend)
3. **Impact level**: High / Medium / Low

**Bad entry**: "We have a good product" (vague, no evidence)
**Good entry**: "Customer review avg 4.6/5 across 200+ reviews, consistently praised for onboarding speed (self-intel Lens 3)" (specific, sourced)

### SWOT Table Format

```
## SWOT — [Company Name]

### Strengths (Internal, Positive)
| # | Statement | Evidence Source | Impact |
|---|-----------|---------------|--------|
| S1 | [specific strength] | [lens/source] | High |
| S2 | [specific strength] | [lens/source] | Medium |
| ... | | | |

### Weaknesses (Internal, Negative)
| # | Statement | Evidence Source | Impact |
|---|-----------|---------------|--------|
| W1 | [specific weakness] | [lens/source] | High |
| ... | | | |

### Opportunities (External, Positive)
| # | Statement | Evidence Source | Impact |
|---|-----------|---------------|--------|
| O1 | [specific opportunity] | [competitor/market source] | High |
| ... | | | |

### Threats (External, Negative)
| # | Statement | Evidence Source | Impact |
|---|-----------|---------------|--------|
| T1 | [specific threat] | [competitor/market source] | High |
| ... | | | |
```

---

## Step 3: SWOT Validation (~10 min)

Present the SWOT to the user for review. Ask:

1. "¿Ves algo que falte? ¿Alguna fortaleza o debilidad que yo no haya captado?"
2. "¿Estás de acuerdo con los niveles de impacto?"
3. "¿Hay algún item que está en el cuadrante incorrecto?"

Adjust based on feedback before proceeding to TOWS.

---

## Step 4: TOWS Matrix (~30 min)

The TOWS matrix (Heinz Weihrich) crosses SWOT quadrants to produce 4 types of strategies:

### TOWS Strategy Types

| Strategy | Cross | Logic | Question |
|----------|-------|-------|----------|
| **SO** (Maxi-Maxi) | Strengths × Opportunities | Leverage strengths to capture opportunities | "How can we USE [strength] to EXPLOIT [opportunity]?" |
| **ST** (Maxi-Mini) | Strengths × Threats | Use strengths to defend against threats | "How can we USE [strength] to NEUTRALIZE [threat]?" |
| **WO** (Mini-Maxi) | Weaknesses × Opportunities | Fix weaknesses to unlock opportunities | "How can we FIX [weakness] to CAPTURE [opportunity]?" |
| **WT** (Mini-Mini) | Weaknesses × Threats | Minimize weaknesses to avoid threats | "How can we REDUCE [weakness] to AVOID [threat]?" |

### TOWS Matrix Format

```
## TOWS Matrix — [Company Name]

### SO Strategies (Strengths × Opportunities) — ATTACK
| # | Strategy | S Used | O Targeted | Expected Impact |
|---|----------|--------|-----------|----------------|
| SO1 | [specific strategy] | S1, S3 | O2 | [what happens if we do this] |
| SO2 | [specific strategy] | S2 | O1, O4 | [expected impact] |

### ST Strategies (Strengths × Threats) — DEFEND
| # | Strategy | S Used | T Defended | Expected Impact |
|---|----------|--------|-----------|----------------|
| ST1 | [specific strategy] | S1 | T1 | [what happens if we do this] |

### WO Strategies (Weaknesses × Opportunities) — TRANSFORM
| # | Strategy | W Fixed | O Unlocked | Expected Impact |
|---|----------|---------|-----------|----------------|
| WO1 | [specific strategy] | W2 | O1 | [what happens if we do this] |

### WT Strategies (Weaknesses × Threats) — SURVIVE
| # | Strategy | W Reduced | T Avoided | Expected Impact |
|---|----------|-----------|----------|----------------|
| WT1 | [specific strategy] | W1 | T2 | [what happens if we do this] |
```

### Strategy Quality Rules

Each TOWS strategy must be:
- **Specific**: Not "improve marketing" but "Launch LinkedIn thought leadership targeting [ECP 1] pain point [specific pain]"
- **Actionable**: Can be turned into a task or experiment within 1-2 weeks
- **Connected**: Explicitly references which S/W/O/T items it addresses
- **Measurable**: Has an expected outcome that can be verified

**Minimum**: 2 strategies per TOWS quadrant (8 total). **Ideal**: 3-4 per quadrant (12-16 total).

---

## Step 5: Strategy Prioritization (~15 min)

Score each TOWS strategy using ICE framework:

| Dimension | What It Measures | Scale |
|-----------|-----------------|-------|
| **Impact** | How much does this move the needle? | 1-10 |
| **Confidence** | How sure are we it will work? | 1-10 |
| **Ease** | How easy/fast to implement? | 1-10 |
| **ICE Score** | (I + C + E) / 3 | 1-10 |

### Prioritization Output

```
## Prioritized Strategies — [Company Name]

| Rank | Strategy | Type | ICE | I | C | E | Recommended Action |
|------|----------|------|-----|---|---|---|--------------------|
| 1 | [SO1] | SO | 8.3 | 9 | 8 | 8 | [first action step] |
| 2 | [WO2] | WO | 7.7 | 8 | 7 | 8 | [first action step] |
| 3 | [ST1] | ST | 7.3 | 9 | 7 | 6 | [first action step] |
| ... | | | | | | | |

**Top 3 immediate actions:**
1. [Strategy + first concrete step + timeline]
2. [Strategy + first concrete step + timeline]
3. [Strategy + first concrete step + timeline]
```

---

## Summary (always generated)

> **SWOT de [Company Name]:**
>
> **Fortaleza #1**: [strongest confirmed strength]
> **Debilidad #1**: [biggest confirmed weakness]
> **Oportunidad #1**: [biggest opportunity]
> **Amenaza #1**: [biggest threat]
>
> **Top 3 estrategias TOWS** (por ICE score):
> 1. [SO/ST/WO/WT]: [strategy summary] (ICE: [score])
> 2. [type]: [strategy summary] (ICE: [score])
> 3. [type]: [strategy summary] (ICE: [score])

---

## Lite vs Deep Criteria

**Lite done** (minimum for downstream):
- 4-quadrant SWOT populated from actual intelligence (not assumptions)
- Each entry has evidence source
- At least 2 strategies per TOWS quadrant (8 total)
- Top 3 strategies identified

**Deep done** (comprehensive):
- All Lite criteria met
- 5+ entries per SWOT quadrant with impact levels
- 3-4 strategies per TOWS quadrant (12-16 total)
- All strategies ICE-scored and ranked
- Top 3 immediate actions with concrete steps
- User has validated the SWOT
- Cross-references to specific upstream data points

---

## Cross-Pillar Data Flow

| Field | Consumed By |
|-------|-------------|
| SWOT quadrants | niche-discovery-100x (Triple Filter uses SWOT), Phase 0 diagnostic |
| SO strategies | Phase 3 content/outreach workflow (attack vectors) |
| ST strategies | Risk management, competitive response planning |
| WO strategies | Product roadmap, capability building priorities |
| WT strategies | Contingency planning, defensive positioning |
| Prioritized strategies (top 3) | Phase 2 funnel design, Phase 3 scaling decisions |
| Evidence-backed strengths | positioning-messaging (real assets), brand-voice (emphasis) |
| Evidence-backed weaknesses | Messaging guardrails (what NOT to claim) |

---

## Edge Cases

**Upstream pillars have low confidence data:**
- Proceed but flag confidence level on each SWOT entry.
- "SWOT basado en datos de baja confianza en [pillar]. Las estrategias derivadas deben considerarse hipótesis a validar."

**Company has no clear strengths (pre-launch or struggling):**
- Look for POTENTIAL strengths: team expertise, unique approach, speed, niche focus.
- Frame as "early-stage strengths": "No tienes datos de clientes todavía, pero tu enfoque en [niche] es una fortaleza de posicionamiento."

**SWOT looks the same as competitor's:**
- Dig deeper into Lens 3 data. Customer perception differences always exist.
- "Tu SWOT se parece mucho al de [competitor]. La diferenciación está en los detalles de Lens 3."

**Too many items per quadrant:**
- Prioritize by impact. Top 5-7 per quadrant is ideal.
- "Hay 15 oportunidades identificadas. Me centro en las 7 de mayor impacto para el TOWS."

**User disagrees with a SWOT entry:**
- User knowledge wins for internal factors (S, W). Check evidence for external factors (O, T).
- "Entendido — quito [entry] de Fortalezas. ¿Hay algo que lo reemplace o lo dejamos con menos entries?"
