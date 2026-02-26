---
name: self-intelligence
description: "Analyzes the client's own digital presence using the 3-lens intelligence methodology: Autopercepcion (what they say), Percepcion de Terceros (what media/SEO say), and Percepcion del Consumidor (what customers say in RRSS + reviews). Same pipeline as competitor-intelligence but pointed inward. Foundation pillar (Layer 2), depends on company-context. Use when onboarding a new client, when foundation-orchestrator routes here, when user says audit our site, how do we look online, review our digital presence, what do our reviews say, brand perception, or self-analysis. Also triggers when self-intelligence status is empty in the Context Lake. Do NOT use for competitor analysis (use competitor-intelligence), new brand creation (use brand-voice), or technical SEO audit (use seo-audit skill)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: "2.0"
  system: SanchoCMO
  phase: "1"
  pillar: "self-intelligence"
  layer: "2"
  depends_on: "company-context"
---

# Self-Intelligence (3-Lens Analysis)

> Before you can improve positioning or messaging, know where you stand today. This is the baseline — the "before" picture.

Same 3-lens methodology as competitor-intelligence, pointed inward. The gap between how you see yourself and how the market sees you reveals what to fix before scaling. Skip entirely if the company is brand new with no track record.

**Shared methodology:** This skill uses the exact same pipeline as competitor-intelligence (Profile Discovery → Scraping → Deep Research → Lens Analysis → Synthesis). The only difference: the subject is the client's own company, and the Synthesis produces a Gap Analysis instead of a Battle Card.

---

## Pipeline Overview

```
Step 0: Profile Discovery          → Find all digital footprint URLs
Step 1: Scraping (20 scrapers)     → Collect raw data from all channels
Step 2: Deep Research (Gemini)     → Market context + Company radiography
Step 3: Lens Analysis (5 prompts)  → Autopercepción → Terceros → RRSS → Reviews → Síntesis
Step 4: Viability Checkpoint       → PASS or WARNING before continuing
```

---

## Step 0: Profile Discovery (~5 min)

Find and document ALL digital presence URLs. Check each platform systematically.

**Platforms to discover:**

| Category | Platforms |
|----------|----------|
| Social Media | Instagram, Facebook, LinkedIn, YouTube, TikTok, Twitter/X |
| Review Platforms | Trustpilot, G2, Capterra |
| App Stores | Apple App Store, Google Play Store |
| Website | Main domain, subdomains, blog |

**For each platform**: URL, username/ID, status (active/dormant/not found).

If a platform has no presence → mark explicitly as "No presence" (absence is data).

---

## Step 1: Scraping (~15 min)

Collect raw data from all discovered profiles. 20 scrapers organized in 4 groups:

### Group 1: Autopercepción (8 scrapers)

| Scraper | Source | What It Collects |
|---------|--------|-----------------|
| Deep Research | Gemini | Market + Company deep research (see Step 2) |
| Website Content | Client's website | Homepage, product pages, about, pricing, blog |
| Instagram Posts | Instagram profile | Posts, captions, hashtags, engagement |
| Facebook Posts | Facebook page | Posts, engagement, ad library |
| YouTube Videos | YouTube channel | Videos, titles, descriptions, view counts |
| TikTok Posts | TikTok profile | Videos, captions, engagement |
| LinkedIn Posts | LinkedIn page | Posts, articles, engagement |
| LinkedIn Insights | LinkedIn page | Company info, employee count, growth |

### Group 2: Percepción Terceros (2 scrapers)

| Scraper | Source | What It Collects |
|---------|--------|-----------------|
| SEO/SERP Data | Search engines | Organic keywords, rankings, domain authority |
| News Corpus | News/media sites | Press mentions, articles, interviews |

### Group 3: Percepción RRSS — Comments (5 scrapers)

| Scraper | Source | What It Collects |
|---------|--------|-----------------|
| Instagram Comments | Instagram | User comments on posts |
| Facebook Comments | Facebook | User comments on posts |
| YouTube Comments | YouTube | User comments on videos |
| TikTok Comments | TikTok | User comments on videos |
| LinkedIn Comments | LinkedIn | User comments on posts |

### Group 4: Percepción Reviews (5 scrapers)

| Scraper | Source | What It Collects |
|---------|--------|-----------------|
| Trustpilot Reviews | Trustpilot | Ratings, review text, dates |
| G2 Reviews | G2 Crowd | Ratings, pros/cons, company size |
| Capterra Reviews | Capterra | Ratings, pros/cons, reviewer profiles |
| Play Store Reviews | Google Play | Ratings, review text, version |
| App Store Reviews | Apple App Store | Ratings, review text, version |

**Scraper status per platform**: Configurado (URL found, ready) or Pendiente (no URL/profile found — skip).

---

## Step 2: Deep Research (~20 min)

Two Gemini Deep Research prompts provide market context and company radiography before the lens analysis.

1. **Deep Research: Market** — Industry overview, competitive landscape, customer segments, trends, opportunities.
2. **Deep Research: Company** — Digital footprint, products, brand image, tone, value prop, problem-solution mapping, ICPs, channels, strengths, weaknesses, "secret sauce."

See [references/deep-research-prompts.md](references/deep-research-prompts.md) for full prompts.

**For self-intelligence:** Use these with the client's own company and industry. The output feeds all subsequent lens analysis as context.

---

## Step 3: Lens Analysis (5 sequential prompts)

Each prompt builds on the previous. Run in order. See [references/lens-prompts.md](references/lens-prompts.md) for full prompts.

### Lens 1: Autopercepción (~10 min)

**Input**: Deep Research output + Group 1 scraped data (website, social posts, LinkedIn insights).

**Analyzes**:
1. **Message** - How company presents itself (core message, tone, positioning, cross-channel consistency, content themes)
2. **Asset Inventory** - What marketing assets exist (content count, social followers, email list, funnels, tools)

**Output**: Self-perception profile (value prop, differentiators, tone, consistency score) + Asset inventory.

#### Asset Inventory (Part of Lens 1)

**Collected from Group 1 scrapers + website analysis:**

**Content Assets:**
```
Content Inventory:
├─ Blog posts: {count} total, {frequency} publishing
├─ Social posts: {platform}: {count} posts, {frequency}
├─ YouTube videos: {count} videos, {total views}
├─ Podcast episodes: {count} (if applicable)
└─ Lead magnets: {list if detectable from website}
```

**Audience Assets:**
```
Reach Inventory:
├─ Instagram: {followers} followers, {avg engagement}
├─ Facebook: {followers} followers, {avg engagement}
├─ LinkedIn: {followers} followers, {employee count}
├─ YouTube: {subscribers} subs, {avg views/video}
├─ TikTok: {followers} followers
├─ Email list: {size if detectable or "unknown"}
└─ Website traffic: {estimate from SEO tools or "unknown"}
```

**Technical Assets:**
```
Stack Inventory:
├─ Analytics: {GA4, PostHog, etc. from website scrape}
├─ Email ESP: {Mailchimp, ConvertKit, etc. if detectable}
├─ CRM: {HubSpot, Salesforce, etc. if detectable}
├─ Social scheduler: {Buffer, Hootsuite, etc. if detectable}
└─ SEO tools: {detectable from website}
```

**SEO Authority:**
```
├─ Domain Authority: {score if available from SEO scraper}
├─ Indexed pages: {count from "site:domain.com"}
├─ Top keywords: {list from SEO scraper}
└─ Backlinks: {count if available}
```

**Existing Funnels:**
```
Funnel Inventory:
├─ Landing pages: {list URLs if detectable}
├─ Lead magnets: {list if found}
├─ Email sequences: {detectable from website/forms}
└─ Conversion paths: {mapped from website structure}
```

**Notes:**
- Mark "unknown" for data not detectable (don't assume)
- Mark "none detected" if searched but not found
- Source: Primarily from website scrape + social profile data
- This inventory informs: What to BUILD ON vs what to CREATE NEW

**Why in Lens 1:**
Asset Inventory is part of "What We Say" — not just the MESSAGE but also the VOLUME and DISTRIBUTION. It's our self-perception of our own marketing presence.

### Lens 2: Percepción de Terceros (~10 min)

**Input**: Deep Research output + Group 2 scraped data (SEO/SERP, news corpus).

**Analyzes**: How third parties (media, search engines, industry) perceive the company — SEO visibility, media coverage, industry recognition, external narrative vs self-perception.

**Output**: Third-party perception profile (SEO authority, media sentiment, industry position, narrative gaps).

### Lens 3a: Percepción del Consumidor — RRSS (~10 min)

**Input**: Deep Research output + Autopercepción output + Group 3 scraped data (social media comments).

**Analyzes**: What users say on social media — sentiment, recurring themes, pain points, competitor mentions, channel-by-channel analysis.

**Output**: Social consumer perception (sentiment, themes, pain points, comparisons).

### Lens 3b: Percepción del Consumidor — Reviews (~10 min)

**Input**: Deep Research output + Autopercepción output + Group 4 scraped data (review platforms).

**Analyzes**: What customers say in reviews — ratings by platform, trending sentiment, pros/cons, reviewer profiles, competitor migration patterns.

**Output**: Review consumer perception (ratings, strengths, weaknesses, reviewer profiles, competition mentioned).

### Synthesis (~15 min)

**Input**: ALL previous outputs (Deep Research + Autopercepción + Terceros + RRSS + Reviews).

**Analyzes**: Triangulation — does self-perception match reality? Where are the gaps? What's confirmed vs contradicted?

**Self-intelligence output** (differs from competitor-intelligence):
- **Triangulation table**: Aspect | Autopercepción | Terceros | Consumidores | Realidad
- **Confirmed strengths** (consistent across sources)
- **Confirmed weaknesses** (consistent across sources)
- **Perception vs reality gaps** (promise vs delivery)
- **Priority fixes** (what to address before scaling marketing)

Note: No Battle Card for self-intelligence (that's competitor-intelligence only).

---

## Viability Checkpoint (Automatic)

After Synthesis, check automatically:

**Trigger conditions:**
- Average review rating < 2.5/5 across platforms
- Major product gaps confirmed by multiple sources (Lens 3a + 3b)
- Promise-reality gaps are severe (Lens 1 claims X, Lens 3 says opposite)

**If triggered:**
> "Basándome en los datos, el producto tiene gaps significativos entre promesa y realidad. Recomiendo Pre-Product Marketing (audiencia, comunidad, waitlist) en vez de Foundation completa. ¿Quieres discutirlo?"

**If NOT triggered:** Proceed to dependent pillars.

---

## Lens Conflict Resolution

When lenses contradict each other:

| Priority | Lens | Rationale |
|----------|------|-----------|
| 1 (Highest) | Lens 3b: Reviews | Post-purchase truth. They used it and gave feedback. |
| 2 | Lens 3a: RRSS | Real-time consumer voice, less filtered. |
| 3 | Lens 2: Terceros | External, less biased than self-reporting. |
| 4 (Lowest) | Lens 1: Autopercepción | Inherently biased — aspirational positioning. |

**Key rule:** If Reviews (3b) contradict Autopercepción (1) → this IS the #1 problem. Gap between promise and experience = trust killer.

---

## Output: Self-Intelligence Profile

See [references/self-intel-schema.md](references/self-intel-schema.md) for full schema.

### Summary (always generated)

> **Auto-diagnóstico de [Company]:**
>
> | Aspecto | Autopercepción | Terceros | Consumidores | Realidad |
> |---------|---------------|----------|--------------|----------|
> | [aspect 1] | [claim] | [external view] | [customer view] | [truth] |
> | [aspect 2] | ... | ... | ... | ... |
>
> **Fortalezas confirmadas**: [list from multiple sources]
> **Debilidades confirmadas**: [list from multiple sources]
> **Gap principal**: [biggest disconnect]
> **Viability**: PASS / WARNING
> **Prioridad**: [what to fix first]

---

## Lite vs Deep Criteria

**Lite done** (minimum for downstream):
- Profile Discovery complete (all platforms checked)
- Deep Research: Company completed
- Autopercepción analysis done (website + top 2 social platforms)
- At least 1 of Percepción Terceros or Reviews completed
- Viability checkpoint passed
- Triangulation summary with top gaps

**Deep done** (comprehensive):
- All Lite plus:
- Deep Research: Market + Company both completed
- All 5 analysis prompts executed
- All available platforms scraped and analyzed
- Full triangulation table
- Customer quote library (10+)
- Sentiment trends over time
- Cross-channel consistency audit

---

## Cross-Pillar Data Flow

| Field | Consumed By |
|-------|-------------|
| Stated positioning (Lens 1) | positioning-messaging (current vs desired) |
| Customer pain points (Lens 3a+3b) | niche-discovery-100x, content-workflow |
| Tone profile | brand-voice |
| Consistency gaps | brand-voice (fix inconsistencies) |
| Review ratings + sentiment | phase-0-diagnostic, viability checkpoint |
| Media footprint | market-intel (awareness baseline) |
| Promise-reality gaps | positioning-messaging (honest messaging) |
| Viability status | foundation-orchestrator (routing) |
| Triangulation table | competitor-intelligence (comparison baseline) |

---

## Edge Cases

**Pre-launch (no track record):**
- Skip entirely. Mark "N/A — pre-launch." Foundation proceeds without baseline.

**No reviews exist:**
- Lens 3b = "insufficient data." Weight Lens 3a (RRSS) and Lens 2 higher.
- Flag: "Sin reviews = sin validación externa. Prioridad: generar reviews."

**Reviews overwhelmingly negative:**
- Viability checkpoint triggers. Do NOT proceed with full positioning.
- Recommend: fix product → collect new reviews → resume Foundation.

**Multiple products/brands:**
- Run separate self-intelligence per product if distinct positioning.
- Unified brand → analyze holistically, note per-product sentiment differences.

**Missing social platforms:**
- Mark as Pendiente in scraper inventory. Analyze what IS available.
- 50%+ platforms missing → flag as "Huella digital limitada — oportunidad de expansión."
