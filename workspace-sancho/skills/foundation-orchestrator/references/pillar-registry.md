# Pillar Registry

Complete specification for all 16 Foundation pillars. Each entry: dependencies, done criteria (Lite and Deep), skip condition, work type, and which skill to invoke.

---

## LAYER 0 — ALWAYS-FIRST

### 1. company-context
- **Dependencies**: none
- **Work type**: input (user provides, Sancho structures)
- **Skip**: never (always required)
- **Lite done**: Core questions answered (what they do, what they want, what they believe) + URL analyzed if exists
- **Deep done**: Lite + business model classified + goals quantified + vision documented
- **Invokes**: `company-context` skill (or inline if simple)

### 2. brand-voice-quick
- **Dependencies**: none
- **Work type**: creative (Sancho extracts from URL/content, user validates)
- **Skip**: never
- **Lite done**: 3 adjectives + tone spectrum (formal/casual) + 1 example per content type
- **Deep done**: Lite criteria only (full refinement happens in brand-voice-full, Layer 5)
- **Invokes**: inline (quick extraction, no dedicated skill needed)

### 3. budget-constraints
- **Dependencies**: none
- **Work type**: input (user provides)
- **Skip**: never
- **Lite done**: Budget range (monthly) + timeline expectation + team hours/week + existing tools listed
- **Deep done**: Lite + tool overlap analysis + capability gap assessment + budget allocation by channel
- **Invokes**: `budget-constraints` skill (or inline)

---

## LAYER 1 — PARALLEL

### 4. business-model
- **Dependencies**: Layer 0 complete
- **Work type**: input + research (user input + competitor growth model comparison)
- **Skip**: never
- **Lite done**: B2B/B2C classified + revenue model identified + current funnel mapped (even if "nothing")
- **Deep done**: Lite + PLG/MLG assessment + competitor growth model comparison + acquisition funnel detailed
- **Invokes**: `business-model-audit` skill

### 5. company-profile
- **Dependencies**: Layer 0 complete
- **Work type**: input + research (Sancho scrapes social profiles, user fills gaps)
- **Skip**: never
- **Lite done**: Social profiles linked + team listed with roles
- **Deep done**: Lite + capability gaps identified + team social links mapped + activity level per platform
- **Invokes**: inline

### 6. self-intelligence
- **Dependencies**: Layer 0 complete
- **Work type**: research (Sancho does 90% — scrapes web, reviews, social)
- **Skip**: if brand new with no track record
- **Lite done**: Lens 1 (what we say) for homepage + top 2 social platforms
- **Deep done**: All 3 lenses for: homepage, top 2 social, top 2 review platforms. Viability checkpoint passed.
- **Post-completion**: triggers VIABILITY CHECKPOINT
- **Invokes**: `self-intelligence` skill

### 7. customer-data
- **Dependencies**: Layer 0 complete
- **Work type**: input + analysis (user provides CRM access, Sancho analyzes)
- **Skip**: if pre-launch with no customers
- **Lite done**: Best available data analyzed + top customer segment identified
- **Deep done**: Lite + customer clustering by behavior/value + churn patterns + LTV analysis + best customer profile
- **Invokes**: inline or `customer-data-analysis` skill

### 8. marketing-assets
- **Dependencies**: Layer 0 complete
- **Work type**: research + input (Sancho audits web/social, user provides internal data)
- **Skip**: if brand new (no existing assets)
- **Lite done**: Content inventory (count) + social follower counts + existing tools listed
- **Deep done**: Lite + DA score + email list size/engagement + existing funnels mapped + lead magnets inventoried
- **Invokes**: inline

### 9. competitor-intel
- **Dependencies**: Layer 0 complete
- **Work type**: research (Sancho does 90%)
- **Skip**: never
- **Lite done**: Top 3 direct competitors named + Lens 1 (what they say about themselves) per competitor
- **Deep done**: 3+ direct competitors with all 3 lenses + 2+ indirect alternatives + growth model per competitor
- **Invokes**: `competitor-intelligence` skill (3-lens analysis)

### 10. market-intel
- **Dependencies**: Layer 0 complete
- **Work type**: research (Sancho does 90%)
- **Skip**: never
- **Lite done**: Sector identified + basic TAM/SAM estimated
- **Deep done**: Lite + regulatory landscape mapped + 3+ current trends + growth rate + market characteristics (fragmented vs consolidated)
- **Invokes**: `market-intelligence` skill

---

## LAYER 2 — SYNTHESIS

### 11. swot-tows
- **Dependencies**: self-intelligence (lite_done) + competitor-intel (lite_done) + market-intel (lite_done)
- **Work type**: analysis (Sancho proposes, user validates)
- **Skip**: never
- **Lite done**: 4-quadrant SWOT populated from actual intelligence (not assumptions)
- **Deep done**: Lite + 2+ strategies per TOWS quadrant (SO, ST, WO, WT) + marketing-focused scope with product/sales flags
- **Invokes**: `swot-analysis` skill

---

## LAYER 3 — DISCOVERY

### 12. icp-100x-niches
- **Dependencies**: swot-tows (lite_done) + customer-data (lite_done OR skipped)
- **Work type**: research + analysis (Sancho scrapes problems, user validates filters)
- **Skip**: never
- **Lite done**: Rough ICP from founder intuition or existing data + 3-5 ECP candidates identified
- **Deep done**: 50+ problems scraped and JTBD-structured + Triple Filter applied + 3-7 ECPs scored (Pain x Reachability x Market Size)
- **Invokes**: `niche-discovery-100x` skill

---

## LAYER 4 — ACTIVATION

### 13. ecp-validation
- **Dependencies**: icp-100x-niches (lite_done)
- **Work type**: analysis + research (Sancho designs tests, user executes some)
- **Skip**: if timeline is very short (validate through execution instead)
- **Lite done**: At least 1 validation method designed per top ECP
- **Deep done**: 1+ validation method attempted per top ECP + minimum 5 outreach/content tests with measured response
- **Invokes**: `ecp-validation` skill

### 14. positioning-messaging
- **Dependencies**: icp-100x-niches (lite_done) + competitor-intel (lite_done)
- **Work type**: analysis + creative (Sancho proposes, user decides)
- **Skip**: never
- **Lite done**: Basic messaging for top ECP (enough for first LP or outreach)
- **Deep done**: Per-niche: value criteria ranked, competitor scoring, 3+ assets mapped with proof, messaging framework
- **Invokes**: `positioning-messaging` skill

### 15. pricing-hooks
- **Dependencies**: icp-100x-niches (lite_done) + competitor-intel (lite_done)
- **Work type**: analysis + creative (Sancho proposes, user decides)
- **Skip**: if pricing is fixed/non-negotiable
- **Lite done**: Current pricing documented + 1 hook per top ECP
- **Deep done**: Competitor pricing compared + pricing strategy recommendation + 3+ hooks per top niche with proof
- **Invokes**: `pricing-strategy` skill (Corey Haines #2)

---

## LAYER 5 — REFINEMENT

### 16. brand-voice-full
- **Dependencies**: positioning-messaging (lite_done) + icp-100x-niches (lite_done)
- **Work type**: creative (Sancho drafts, user refines)
- **Skip**: if not producing content yet (defer until Phase 3)
- **Lite done**: N/A (this pillar only has Deep)
- **Deep done**: Complete voice guide with do/don't word lists + visual identity system + examples across all content types
- **Invokes**: `brand-voice` skill (Corey Haines enhanced)

---

## Quick Reference: Unblocking Impact

Pillars sorted by how many downstream pillars they unlock:

| Pillar | Unlocks | Downstream count |
|--------|---------|-----------------|
| self-intelligence | swot → icp → ecp + positioning + pricing + brand-voice | 6 |
| competitor-intel | swot → icp → ecp + positioning + pricing + brand-voice | 6 |
| market-intel | swot → icp → ecp + positioning + pricing + brand-voice | 6 |
| customer-data | icp → ecp + positioning + pricing + brand-voice | 5 |
| swot-tows | icp → ecp + positioning + pricing + brand-voice | 5 |
| icp-100x-niches | ecp + positioning + pricing + brand-voice | 4 |
| company-context | all Layer 1+ (required for everything) | 13 |
| budget-constraints | all Layer 1+ (required for everything) | 13 |
| brand-voice-quick | all Layer 1+ (required for everything) | 13 |

Layer 0 pillars have the highest raw count but are typically fast to complete. Among Layer 1 pillars, self-intelligence + competitor-intel + market-intel are the trio that unlocks the most value.
