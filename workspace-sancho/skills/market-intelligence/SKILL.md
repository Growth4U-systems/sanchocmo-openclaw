---
name: market-intelligence
description: 'Market analysis: TAM, trends, segments.'
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '2.0'
  system: SanchoCMO
  phase: '1'
  pillar: market-intelligence
  layer: '2'
  depends_on: company-context
  updated: '2026-02-19'
  changes: Removed SAM/SOM (moved to niche-discovery), added Gemini Deep Research
    automation, TAM-only focus
context_required:
- brand/company-context.md
- brand/competitors.md
context_writes:
- brand/market.md
- brand/learnings.md
---

# Market Intelligence

> Understand the playing field before you play. Market intelligence tells you HOW BIG the total prize is (TAM), WHO regulates it, WHAT segments exist, and WHERE it's going.

Uses **Google Gemini Deep Research** to produce comprehensive market analysis automatically.

**Critical**: Calculates TAM (total market) only. SAM/SOM come later in niche-discovery once strategy is defined.

---

## How This Skill Works

**Automated research** via Google Gemini Deep Research with structured prompt.

**Input**: Company context (industry/vertical from company-context)
**Process**: Execute Gemini Deep Research prompt → Generates 15-25 page report
**Output**: 5-part market intelligence report

### What It Produces

1. **Market Overview**: TAM, segments available, geography, maturity
2. **Competitive Intelligence**: Players, market share, strategies, social benchmarking
3. **Customer Segmentation**: 3-5 detailed personas
4. **Trends & Future**: Tech, behavior, regulatory, platforms (with time horizons)
5. **Strategic Opportunities**: Gaps, growth opportunities, prioritized recommendations

**Research prompt**: See [gemini-deep-research-prompt.md](references/gemini-deep-research-prompt.md)

---

## Step 1: Sector Identification (~10 min)

Classify the market the company operates in. Often companies span multiple sectors — identify ALL relevant ones.

**Classify at 3 levels:**

| Level | Description | Example |
|-------|-------------|---------|
| **Industry** | Broad sector | Financial Services |
| **Vertical** | Specific sub-sector | Fintech → Personal Finance |
| **Niche** | Specific segment | Crypto custody for B2B |

**Multi-sector companies:** If the company operates across sectors (e.g., "We're fintech but also education"), identify primary and secondary sectors. The primary sector gets the full deep dive; secondary sectors get Lite treatment.

**Adjacent markets:** Note markets the company COULD expand into based on product capabilities. These feed Phase 3 scaling decisions.

---

## Step 2: Market Sizing (~30 min)

Three-tier sizing: TAM → SAM → SOM. Use bottom-up whenever possible.

### TAM (Total Addressable Market)
The TOTAL revenue opportunity if the company captured 100% of the market.

**Methods (in order of reliability):**
1. **Bottom-up**: Count total potential customers × average revenue per customer
2. **Top-down**: Industry reports → filter to relevant segment
3. **Value theory**: Total spending on the problem being solved (even with non-product solutions)

### SAM (Serviceable Available Market)
The portion of TAM that the company can actually REACH given current product, pricing, and geography.

**Filters to apply:**
- Geographic constraint (countries/regions the company can serve)
- Product constraint (what the product ACTUALLY solves today)
- Pricing constraint (who can AFFORD the product)
- Channel constraint (who can be reached through available channels)

### SOM (Serviceable Obtainable Market)
Realistic capture over 1-3 years given competition, resources, and execution speed.

**Factors:**
- Current market share (if known)
- Competitor strength (from competitor-intelligence)
- Growth rate of the company
- Budget and resource constraints (from budget-constraints)

### Market Sizing Output

```
## Market Sizing — [Company]

**Industry**: [sector identification]
**Geography**: [target market(s)]

| Tier | Size | Method | Confidence |
|------|------|--------|------------|
| TAM  | €[X]B / [Y]M users | [method used] | [High/Medium/Low] |
| SAM  | €[X]M / [Y]K users | [filters applied] | [confidence] |
| SOM  | €[X]M / [Y]K users (1-3yr) | [assumptions] | [confidence] |

**Key assumptions**: [list critical assumptions]
**Data sources**: [list sources]
```

---

## Step 3: Market Characteristics (~20 min)

Classify the market across key dimensions:

### Market Type

| Dimension | Options | Why It Matters |
|-----------|---------|----------------|
| **B2B / B2C / B2B2C** | Single or mixed | Sales cycle, channels, pricing |
| **Regulated / Unregulated** | Yes/Partial/No | Compliance burden, barriers to entry |
| **Fragmented / Consolidated** | Many small vs few large | Competitive dynamics |
| **Market maturity** | Emerging / Growing / Mature / Declining | Strategy implications |
| **Buyer type** | Technical / Business / Consumer | Messaging, channels |
| **Sales cycle** | Self-serve / Short (days) / Medium (weeks) / Long (months) | Funnel design |
| **Switching cost** | Low / Medium / High | Retention dynamics, competitive strategy |

### Market Maturity Assessment

| Stage | Characteristics | Strategy Implication |
|-------|----------------|---------------------|
| **Emerging** | Few players, undefined categories, educating market | Category creation, thought leadership, be first |
| **Growing** | Market expanding, new entrants, category defined | Differentiation, speed to market, capture share |
| **Mature** | Established players, slowing growth, price competition | Niche down, innovate on experience, retention focus |
| **Declining** | Shrinking demand, consolidation, tech disruption | Pivot, harvest, or disrupt with new approach |

---

## Step 4: Regulatory Landscape (~20 min)

Map ALL relevant laws and regulations. Critical for regulated industries (fintech, health, education, real estate). Even "unregulated" sectors have data privacy, consumer protection, and advertising rules.

### Regulatory Scan

| Category | Examples | Check For |
|----------|----------|-----------|
| **Industry-specific** | MiCA, PSD2 (fintech), HIPAA (health), MiFID II (investment) | Licensing, compliance requirements, operational constraints |
| **Data privacy** | GDPR, CCPA, LGPD | Data handling, consent, storage, cross-border transfer |
| **Consumer protection** | EU Consumer Rights Directive, FTC rules | Claims, refund policies, advertising restrictions |
| **Advertising** | CAP Code, FTC Guidelines, platform-specific rules | What you can/can't say in marketing |
| **Tax/fiscal** | VAT rules, digital services taxes | Impact on pricing and margins |
| **Emerging** | AI Act, DSA, DMA (EU) | Future compliance requirements |

### Regulatory Impact Assessment

For each relevant regulation:
```
{
  regulation: string,          // Name + jurisdiction
  status: enum (active, pending, proposed),
  impact_level: enum (high, medium, low),
  affects: string[],           // Which business areas
  compliance_status: enum (compliant, in_progress, not_started, unknown),
  deadline: string,            // If pending/proposed
  marketing_restrictions: string[] // What you can't say/do in marketing
}
```

**Marketing-specific restrictions** are especially important: many regulations limit advertising claims (health benefits, financial returns, data usage, testimonials). Flag these explicitly for content creation downstream.

---

## Step 5: Trend Analysis (~20 min)

Identify 5-10 trends actively reshaping this market. Focus on trends that CREATE OPPORTUNITY or THREAT for the company.

### Trend Categories

| Type | What to Look For | Impact |
|------|-----------------|--------|
| **Technology** | AI/ML, blockchain, API economy, no-code | New capabilities, disruption risk |
| **Consumer behavior** | Shifting preferences, new channels, generational change | Demand patterns |
| **Regulatory** | New laws, deregulation, cross-border harmonization | Compliance, opportunity |
| **Economic** | Interest rates, funding climate, currency, inflation | Budget, pricing pressure |
| **Competitive** | Consolidation, new entrants, category creation | Market dynamics |
| **Societal** | Sustainability, privacy awareness, remote work | Messaging, positioning |

### Per-Trend Format

```
{
  trend: string,               // Short description
  category: string,            // From categories above
  direction: enum (accelerating, stable, decelerating),
  time_horizon: enum (now, 6_months, 1_year, 3_years),
  opportunity_or_threat: enum (opportunity, threat, both),
  impact_on_us: string,        // How this specifically affects the company
  recommended_action: string   // What to do about it
}
```

---

## Step 6: Market Profile Synthesis

Combine all steps into an actionable market profile.

### Summary (always generated)

> **Mercado de [Company Name]:**
>
> **Sector**: [Industry → Vertical → Niche]
> **Tamaño**: TAM €[X] / SAM €[Y] / SOM €[Z]
> **Madurez**: [stage] — [1-sentence implication]
> **Regulación**: [High/Medium/Low] — [key regulation]
>
> **Top 3 tendencias**:
> 1. [Trend] — [opportunity/threat] — [recommended action]
> 2. [Trend] — [opportunity/threat] — [recommended action]
> 3. [Trend] — [opportunity/threat] — [recommended action]

---

## Ongoing Monitoring

After the initial deep dive, market intelligence enters monitoring mode:

| Market Type | Monitoring Frequency | Focus |
|-------------|---------------------|-------|
| Regulated (fintech, health) | Bi-weekly | Regulatory changes, compliance deadlines |
| Non-regulated | Monthly | New trends, market size updates |
| All markets | Always | New competitor detection, market shifts |

**Signal-over-noise filter**: Only surface changes that are:
- **Critical**: New regulations, market size shifts, major industry events
- **Pattern-revealing**: Consistent trend direction over multiple data points
- **Actionable**: Should change something in strategy or execution

---

## Lite vs Deep Criteria

**Lite done** (minimum for downstream):
- Sector identified (industry + vertical + niche)
- TAM/SAM estimated (even rough)
- Market maturity assessed
- Regulatory landscape mapped (key regulations listed)
- 3+ current trends noted with direction

**Deep done** (comprehensive):
- All Lite criteria met
- TAM/SAM/SOM with bottom-up calculation
- Full market characteristics classified (all dimensions)
- Complete regulatory scan with impact assessment
- 5-10 trends with time horizon and recommended actions
- Adjacent markets identified
- Geographic expansion analysis (if multi-market)
- Monitoring cadence configured

---

## Cross-Pillar Data Flow

| Field | Consumed By |
|-------|-------------|
| TAM/SAM/SOM | budget-constraints (investment justification), niche-discovery-100x (market size per ECP) |
| Market maturity | Phase 0 diagnostic (strategy context), positioning-messaging (market narrative) |
| Regulatory landscape | company-context (compliance requirements), content-workflow (messaging restrictions), paid-ads (advertising rules) |
| Trends (opportunities) | swot-analysis (Opportunities quadrant), Phase 3 channel strategy |
| Trends (threats) | swot-analysis (Threats quadrant), risk assessment |
| Market characteristics | business-model-audit (validate model), pricing-hooks (pricing context) |
| Adjacent markets | Phase 3 scaling decisions, niche-discovery-100x (expansion ECPs) |
| Competitive dynamics | competitor-intelligence (context), positioning-messaging (landscape) |

---

## Edge Cases

**Market is too new to size:**
- Use comparable markets as proxy. "No hay datos de [market] pero el mercado comparable de [X] creció a [Y] en 3 años."
- Document assumptions explicitly and flag low confidence.

**Company operates in multiple markets:**
- Primary market gets full deep dive. Secondary markets get Lite.
- Look for cross-market synergies: same customers, same problems, same channels.

**Heavily regulated market (fintech, health):**
- Regulatory landscape becomes the LARGEST section.
- Map each regulation to specific marketing restrictions.
- "En fintech, MiCA prohibe hacer claims sobre rendimientos futuros. Esto afecta directamente a tu copy de landing page."

**Market data is conflicting (different sources, different numbers):**
- Present the range, not a single number.
- "TAM estimado entre €500M (según [source A]) y €1.2B (según [source B]). La diferencia se debe a [reason]."
- Use the more conservative estimate for SOM calculation.

**Market is declining but company is growing:**
- The company may be taking share from incumbents or creating a new sub-segment.
- "El mercado general está en declive, pero tu segmento específico está creciendo. Esto sugiere que estás creando una nueva categoría."
