# Competitor Intelligence — Prompt (Fuente de verdad del output)

---

## Pipeline completo

```
Step 0: Competitor Discovery          → Identify + categorize
Step 1: Profile Discovery (per comp)  → Find all digital footprint URLs
Step 2: Scraping (per comp)           → Collect raw data by lens
Step 3: Deep Research (per comp)      → Context via Gemini/web research
Step 4: Lens Analysis (per comp)      → Autopercepción → Terceros → Reviews
Step 5: Battle Card (per comp)        → Synthesize into actionable card
Step 6: Competitive Landscape Map     → Cross-competitor synthesis
```

---

## Step 0: Competitor Discovery

**Discovery sources:** User knowledge, search engines, review sites ("alternatives to X"), app stores, industry reports.

**Categorización:**

| Category | Description | Research Depth |
|----------|-------------|----------------|
| **Direct** | Same product, same market | Full 3-lens (3-5 competitors) |
| **Indirect** | Different product, same problem | Lens 1 only (2-3) |
| **Emerging** | New entrants, adjacent | Monitor only (1-2) |

**Monitoring tiers:** Tier A (top 3 direct) = weekly | Tier B (4-10 direct) = monthly | Tier C (indirect + emerging) = quarterly

---

## Steps 1-4: Per-Competitor Deep Dive

### Step 1: Profile Discovery
Platforms: Instagram, Facebook, LinkedIn, YouTube, TikTok, Twitter/X, Trustpilot, G2, Capterra, App Stores, Website + subdomains + blog, **Paid Ads** (FB Ads Library, Google Ads Library).

### Step 2: Scraping (APIFY OBLIGATORIO)

**Usar Apify actors para scraping real — no solo web_search.**

**Lens 1 (Autopercepción):**
- `apify/web-scraper` → Homepage, /pricing, /about, /blog (10 últimos posts)
- `apify/instagram-scraper` → Últimos 20 posts + bio + métricas
- `apify/facebook-ads-scraper` → Ads activos en FB Ads Library
- Fallback: `web_fetch` si un actor falla

**Lens 2 (Terceros):**
- `apify/google-search-scraper` → "[nombre] reviews", "[nombre] vs [competidor]"
- `web_search` → noticias, press, artículos recientes
- `web_fetch` → backlink profile (via Ahrefs free, Moz free)

**Lens 3 (Consumidores):**
- `apify/trustpilot-scraper` → Últimas 50 reviews + rating
- `web_search` → "[nombre] opiniones", Reddit, foros
- `web_fetch` → Threads relevantes de Reddit/foros

### Step 3: Deep Research
Company background, product evolution, growth model, public financials.

### Step 4: Lens Analysis

**Lens 1 — Autopercepción:**
- Value proposition stated
- Positioning (keywords, claims, comparisons)
- Target audience implied
- Pricing model and strategy
- Features emphasized vs hidden
- Content strategy (topics, frequency, channels)
- Paid ads (messaging, targeting, offers)

**Lens 2 — Percepción de Terceros:**
- Influencer/media description
- SEO visibility (DA, top keywords, ranking strength)
- Press narrative
- External ≠ self-messaging alignment?

**Lens 3 — Percepción del Consumidor:**
- Overall sentiment (positive/neutral/negative/mixed)
- Top 3-5 loved aspects
- Top 3-5 complained aspects
- Migration from/to patterns
- Unmet needs (problems they ask to solve but competitor doesn't)

---

## Step 5: Battle Card Format

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
**Key features**: [Top 3-5 emphasized]
**Pricing**: [Model + tiers summary]

### External Perception (Lens 2)
**Media narrative**: [How press/influencers describe them]
**SEO strength**: DA [X], ranks for [top keywords]
**Recognition**: [Awards, rankings, notable coverage]

### Customer Reality (Lens 3)
**Rating**: [Weighted avg across platforms]
**Love**: [Top 3]
**Hate**: [Top 3]
**Unmet needs**: [What customers want but don't get]

### Lens Conflicts
[Where Lens 1 claims ≠ Lens 3 reality — vulnerabilities]

### How to Beat Them
**Their weakness, our strength**: [specific areas]
**Positioning angle**: [how to differentiate]
**What NOT to compete on**: [where they're genuinely stronger]
**Sales talking points**: [3-5 specific points]

### Monitoring Triggers
[What changes would require re-analysis]
```

---

## Step 6: Competitive Landscape Map

1. **Overview Table**: All competitors (name, type, tier, positioning, pricing, rating, strength, weakness)
2. **Positioning Map**: 2x2 matrix (axes: Price/Features, Enterprise/SMB, Specialist/Generalist)
3. **Feature Heatmap**: Features × competitors (green/yellow/red). White space = opportunities.
4. **Growth Model Analysis**: How each acquires customers
5. **Pricing Landscape**: All pricing models compared
6. **Opportunity Summary**:
   - What EVERYONE says but nobody delivers well
   - Features nobody offers that customers want
   - Positioning angles nobody uses
   - Channels nobody exploits
