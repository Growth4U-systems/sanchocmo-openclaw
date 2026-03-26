---
name: trust-engine
description: "Trust Engine: analyzes client's SEO, GEO (AI visibility), and Own Media. Produces gaps, recommendations, keywords, and influencer lists. Use when: 'run trust engine', 'trust engine seo-audit', 'trust engine init', 'analiza mi SEO', 'analiza mi GEO', 'qué me falta', 'dónde estoy', 'trust engine status', 'ejecuta trust engine'. Subcommands: init, seo-audit, own-media, geo, serp, gaps, recs, keywords, influencers, status, full. NOT for: content creation (use content skills), Foundation (use foundation-orchestrator), bot engagement (separate system)."
metadata:
  author: Alfonso + Cervantes
  version: '6.0'
  system: SanchoCMO
  phase: Execution
  depends_on: foundation-orchestrator
  context_required:
    - brand/{slug}/company-brief/current.md
    - brand/{slug}/go-to-market/ecps/current.md
    - brand/{slug}/go-to-market/positioning/current.md
    - brand/{slug}/market-and-us/competitors/current.md
    - brand/{slug}/market-and-us/self/current.md
  context_writes:
    - brand/{slug}/trust-engine/config.json
    - brand/{slug}/trust-engine/run-state.json
    - brand/{slug}/trust-engine/seo-audit.json
    - brand/{slug}/trust-engine/own-media-audit.json
    - brand/{slug}/trust-engine/geo-analysis.json
    - brand/{slug}/trust-engine/serp-analysis.json
    - brand/{slug}/trust-engine/gap-analysis.json
    - brand/{slug}/trust-engine/recommendations.json
    - brand/{slug}/trust-engine/keywords.json
    - brand/{slug}/trust-engine/influencers.json
    - brand/{slug}/trust-engine/content-briefs.json
---

# Trust Engine v6 — Specification with Quality Gates

> v6 changes: Mandatory minimums, quality gates, fallback chains, DataForSEO mandatory.
> Every module has a QUALITY GATE section. If the gate fails, the module CANNOT be marked "completed".
> The agent MUST NOT skip quality gates to save time.

---

## Architecture

```
Agent reads SKILL.md
  → exec (curl APIs) + web_fetch + web_search + browser + LLM
  → Writes JSON to brand/{slug}/trust-engine/
  → MC reads JSONs → renders dashboard
```

**Persistence**: `brand/{slug}/trust-engine/` — one JSON per module.
**Delegatable**: Each module can run as sessions_spawn to Escudero.

---

## API Credentials (Auto-Detect)

Before each module, check available APIs:

```bash
# Run this check and store results in memory for the session
echo "SERPER: $([ -n "$SERPER_API_KEY" ] && echo 'YES' || echo 'NO')"
echo "DATAFORSEO: $([ -n "$DATAFORSEO_LOGIN" ] && echo 'YES' || echo 'NO')"
echo "YOUTUBE: $([ -n "$YOUTUBE_API_KEY" ] && echo 'YES' || echo 'NO')"
echo "GOOGLE_CSE: $([ -n "$GOOGLE_CSE_KEY" ] && echo 'YES' || echo 'NO')"
echo "APIFY: $([ -n "$APIFY_TOKEN" ] && echo 'YES' || echo 'NO')"
echo "GOOGLE_API: $([ -n "$GOOGLE_API_KEY" ] && echo 'YES' || echo 'NO')"
```

Use detected APIs. Do NOT treat available APIs as optional — if the key exists, USE IT.

---

## Subcommand Routing

| Pattern | Subcommand |
|---|---|
| `trust-engine init {slug}` | → Step 1: Foundation Import |
| `trust-engine seo-audit {slug}` | → Step 2: SEO Site Audit |
| `trust-engine own-media {slug}` | → Step 3: Own Media Audit |
| `trust-engine geo {slug}` | → Step 4: GEO Analysis |
| `trust-engine serp {slug}` | → Step 5: SERP Analysis |
| `trust-engine gaps {slug}` | → Step 6: Gap Analysis |
| `trust-engine recs {slug}` | → Step 7: Recommendations |
| `trust-engine keywords {slug}` | → Step 8: Keyword Research |
| `trust-engine influencers {slug}` | → Step 9: Influencer Discovery |
| `trust-engine content {slug} {kw-id}` | → Step 10: Content Generation |
| `trust-engine status {slug}` | → Show run-state |
| `trust-engine full {slug}` | → Run all in sequence |

---

## Step 0: Common — Resolve Slug & Gate Check

```
1. Resolve slug from command or guild (via clients.json)
2. Gate check: ALL of these must exist:
   - brand/{slug}/company-brief/current.md
   - brand/{slug}/go-to-market/ecps/current.md
   - brand/{slug}/go-to-market/positioning/current.md
   - brand/{slug}/market-and-us/competitors/current.md
   If any missing → STOP with "❌ Foundation incompleta."
3. mkdir -p brand/{slug}/trust-engine
4. Load/create run-state.json (template below)
5. Check API credentials (see above)
```

### run-state.json Template

```json
{
  "project_slug": "{slug}",
  "started_at": null,
  "modules": {
    "foundation-import": { "status": "pending" },
    "seo-audit":         { "status": "pending" },
    "own-media-audit":   { "status": "pending" },
    "geo-analysis":      { "status": "pending" },
    "serp-analysis":     { "status": "pending" },
    "gap-analysis":      { "status": "pending", "depends_on": ["geo-analysis", "serp-analysis"] },
    "recommendations":   { "status": "pending", "depends_on": ["seo-audit", "own-media-audit", "geo-analysis", "gap-analysis"] },
    "keywords":          { "status": "pending", "depends_on": ["serp-analysis"] },
    "influencers":       { "status": "pending" }
  }
}
```

---

## Step 1: Foundation Import (`init`)

Read Foundation docs → create config.json.

```
Read ALL of:
  - brand/{slug}/company-brief/current.md
  - brand/{slug}/go-to-market/ecps/current.md
  - brand/{slug}/go-to-market/positioning/current.md
  - brand/{slug}/market-and-us/competitors/current.md
  - brand/{slug}/market-and-us/self/current.md
  - brand/{slug}/brand-identity/voice/current.md (if exists)

Extract and write config.json:
{
  "project": { "slug", "name", "website", "language", "market", "country_code" },
  "brand": { "name", "aliases", "domains" },
  "niches": [{ "id": "n1", "name", "brief" }],
  "competitors": [{ "name", "domain", "niches" }]
}
```

### QUALITY GATE — init
- ✅ config.json written
- ✅ ≥1 niche extracted
- ✅ ≥1 competitor extracted
- ✅ website URL present and valid (starts with https://)

---

## Step 2: SEO Site Audit (`seo-audit`)

**Depends on**: init completed.

### 2.1 Lighthouse Scores

Fallback chain (try in order, use first success):

```
ATTEMPT 1: Google PSI with API key (if $GOOGLE_API_KEY exists)
  curl -s "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url={website}&strategy=mobile&category=performance&category=accessibility&category=best-practices&category=seo&key=$GOOGLE_API_KEY"

ATTEMPT 2: Google PSI without API key
  curl -s "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url={website}&strategy=mobile&category=performance&category=accessibility&category=best-practices&category=seo"

ATTEMPT 3: If both fail with 429, wait 60 seconds and retry ONCE

ATTEMPT 4: If still 429, use browser tool to run Lighthouse:
  browser action=navigate url="https://pagespeed.web.dev/analysis?url={website}"
  Wait for results (up to 60s)
  browser action=snapshot → extract scores

ATTEMPT 5: If all fail, set lighthouse scores to null with error message.
  DO NOT fake or estimate scores. Mark as "lighthouse_unavailable" in the JSON.
```

Parse successful response:
- categories.{performance|accessibility|best-practices|seo}.score × 100
- audits.{largest-contentful-paint|total-blocking-time|cumulative-layout-shift|first-contentful-paint|speed-index}.numericValue

### 2.2 Health Checks (MANDATORY — these always work)

Run ALL 15 checks. No skipping.

```bash
# HC-01 to HC-08: Parse homepage HTML
web_fetch({website}) → store as $HTML

HC-01: Meta Title — exists + length 30-60 chars
HC-02: Meta Description — exists + length 120-160 chars
HC-03: H1 Count — exactly 1
HC-04: Open Graph — og:title + og:description + og:image
HC-05: Canonical Tag — <link rel="canonical">
HC-06: SSL — URL redirects to https
HC-07: Mobile Viewport — <meta name="viewport">
HC-08: Language Tag — <html lang="...">

# HC-09: Sitemap
exec: curl -s -o /dev/null -w "%{http_code}" {website}/sitemap.xml
→ pass if 200

# HC-10: Robots.txt
exec: curl -s {website}/robots.txt
→ pass if exists + doesn't block /

# HC-11: Core Web Vitals — from Lighthouse data (if available)
# HC-12: Image Alt Tags — from Lighthouse audit (if available)
# HC-13: Structured Data — use browser tool:
browser action=act kind=evaluate fn="JSON.stringify([...document.querySelectorAll('script[type=\"application/ld+json\"]')].map(s=>{try{return JSON.parse(s.textContent)}catch(e){return null}}).filter(Boolean))"
→ List schema types found

# HC-14: Internal Links — count links in HTML pointing to same domain
# HC-15: Hreflang — check <link rel="alternate" hreflang="...">
```

### 2.3 Server Timing

```bash
curl -s -o /dev/null -w "ttfb:%{time_starttransfer}\ntotal:%{time_total}\nsize:%{size_download}" {website}
```

### 2.4 Issue Generation

Use LLM to generate issues from ALL collected data. Each issue:
```json
{ "id", "source", "severity": "critical|high|medium|low", "title", "description", "fix_steps": [], "expected_impact_pct" }
```

### 2.5 Score Calculation

```
If Lighthouse available:
  score = (lighthouse_seo × 0.4 + health_check_pass_rate × 100 × 0.4 + lighthouse_performance × 0.2)
If Lighthouse unavailable:
  score = health_check_pass_rate × 100
  Note: "Score basado solo en health checks — Lighthouse no disponible"
```

### QUALITY GATE — seo-audit
- ✅ ≥13 of 15 health checks executed (HC-11/12 may fail if no Lighthouse)
- ✅ Server timing measured
- ✅ Lighthouse attempted (even if failed — must have tried)
- ✅ ≥3 issues generated
- ✅ Score calculated with methodology noted
- ❌ FAIL if only Lighthouse attempted but no health checks
- ❌ FAIL if score is estimated/guessed without actual data

---

## Step 3: Own Media Audit (`own-media`)

**Depends on**: init completed.

### 3.1 Blog Scanner (MANDATORY)

```
1. Try these URLs in order until one returns 200:
   {website}/blog, {website}/blog/, {website}/noticias, {website}/articles, {website}/recursos
   
2. If found:
   - web_fetch the blog index page
   - Count visible articles/posts
   - Extract last 3 post titles + dates (estimate freshness)
   - web_fetch 1 full blog post → measure word count
   - Estimate posting frequency from dates
   
3. If NOT found: note blog_exists: false
```

### 3.2 Social Discovery (MANDATORY — check ALL 6 platforms)

For each platform, you MUST actually find the real profile URL. Do NOT just confirm "they have Instagram."

```
FOR EACH platform in [instagram, linkedin, youtube, tiktok, twitter/x, facebook]:

  Step A: Find profile URL
    - First check homepage HTML for social links: grep for platform domain in $HTML
    - If not found: web_search "{brand_name} {platform}"
    
  Step B: Get real metrics (use best available method)
    PREFERRED: If $APIFY_TOKEN exists → use Apify actors:
      Instagram: apify/instagram-profile-scraper
      YouTube: apify/youtube-channel-scraper
      TikTok: apify/tiktok-profile-scraper
    
    FALLBACK: web_fetch the profile page → extract visible metrics
    
    MINIMUM FALLBACK: web_search "{brand_name} {platform} followers" → extract from search snippets
    
  Step C: Record for each platform:
    - url: actual profile URL
    - followers: real number (not "unknown")
    - posts_count: if available
    - posting_frequency: estimated from visible content
    - last_post_date: if visible
    - engagement_rate: if calculable
    - verified: boolean
```

### 3.3 Schema Scanner

```
Use browser tool to extract JSON-LD:
browser action=act kind=evaluate fn="JSON.stringify([...document.querySelectorAll('script[type=\"application/ld+json\"]')].map(s=>{try{return JSON.parse(s.textContent)}catch(e){return null}}).filter(Boolean))"

List all schema types found.
Note missing recommended schemas based on business type:
  - Medical: MedicalBusiness, Physician, MedicalProcedure
  - E-commerce: Product, Offer, AggregateRating
  - Service: LocalBusiness, Service, FAQPage
  - All: Organization, WebSite, BreadcrumbList
```

### 3.4 Tech Detection

```
From HTML headers (curl -I) and content:
  - CMS: WordPress (wp-content/wp-includes), Shopify, Wix, etc.
  - Analytics: GA4 (gtag/G-), Mixpanel, Hotjar, Clarity
  - CDN: Cloudflare (cf-ray), AWS (x-amz), Fastly
  - Tag Manager: GTM (googletagmanager.com/gtm.js)
```

### 3.5 Scoring

```
content_score (35%):
  blog_exists: 20pts | frequency ≥2/month: 30pts | word_count ≥800: 20pts | categories: 15pts | fresh (<30 days): 15pts

social_score (30%):
  per_platform_found: 40pts/6 | per_platform_active: 30pts/6 | profile_optimized: 30pts/6

technical_score (35%):
  SSL: 15pts | mobile: 15pts | CMS: 15pts | analytics: 20pts | CDN: 15pts | schemas: 20pts

overall = content × 0.35 + social × 0.30 + technical × 0.35
```

### QUALITY GATE — own-media
- ✅ Blog checked (exists or confirmed missing)
- ✅ ALL 6 social platforms checked (each has url or "not_found")
- ✅ ≥4 of 6 platforms have real follower counts (not "unknown" or null)
- ✅ Schema scan executed via browser tool (not guessed from HTML)
- ✅ Tech stack detected (at minimum: CMS + analytics)
- ✅ Score calculated with breakdown
- ❌ FAIL if social section just says "confirmed profile exists" without metrics
- ❌ FAIL if <4 platforms checked

---

## Step 4: GEO Analysis (`geo`)

**Depends on**: init completed.

### MANDATORY MINIMUMS
- **≥4 prompts per niche** (6 categories, pick best 4 minimum)
- **≥2 providers** (use web_search for Gemini + at least 1 more)
- **≥3 niches** (or all niches if <3)
- **Total minimum: 12 prompt-provider combinations** (e.g., 4 prompts × 3 niches, but can do more providers per prompt)

### 4.1 Prompt Generation

For EACH niche in config.json, generate prompts in these categories:

```
ranking:    "¿Cuáles son las mejores {niche_service} en {market}?"
comparison: "Compara {niche_service} en {market}: opciones y precios"
solution:   "Tengo {ECP_problem}. ¿Qué opciones tengo en {market}?"
discovery:  "Busco {specific_service} en {city}, ¿qué me recomiendas?"
authority:  "¿Quién es el mejor especialista en {niche} en {market}?"
guide:      "Guía completa para {niche_action} en {market}"
```

Minimum 4 per niche. Store ALL generated prompts before querying.

### 4.2 Query Execution

```
FOR EACH prompt:
  
  Provider 1 — Gemini (via web_search):
    web_search(prompt)
    → Extract: body text + citations
  
  Provider 2 — Choose ONE of:
    A) If ChatGPT API available ($OPENAI_API_KEY):
       exec: curl -s "https://api.openai.com/v1/chat/completions" with prompt
    B) If Claude available:
       sessions_spawn with task=prompt (subagent, run mode, short timeout)
    C) If Perplexity available ($PERPLEXITY_API_KEY):
       exec: curl -s "https://api.perplexity.ai/chat/completions" with prompt
    D) Fallback: Re-run web_search with slightly rephrased prompt

  For EACH response, parse:
    - All brand mentions (brand name, position 1-indexed, sentiment, context quote)
    - All cited URLs/domains
    - Whether client was mentioned, and HOW (what was said about them)
```

### 4.3 Analysis

```
Calculate per-brand:
  - mention_rate: % of runs where brand appeared in body text
  - avg_position: average position when mentioned
  - sentiment: positive/neutral/negative breakdown
  - mentioned_as: what topics/contexts the brand is associated with

Calculate per-niche:
  - which brands dominate
  - which brands are invisible
  - what domains are cited most

Cross-niche:
  - client_visibility_overall: % across all runs
  - competitor_comparison: table of visibility rates
```

### QUALITY GATE — geo
- ✅ ≥12 prompt-provider runs executed (tracked with counter)
- ✅ ≥2 different providers used
- ✅ ≥3 niches covered (or all if <3)
- ✅ Each run has parsed brand mentions (not just raw text dumped)
- ✅ Summary includes client_visibility percentage with actual denominator
- ✅ Summary includes competitor comparison (≥3 competitors tracked)
- ✅ Each run includes cited domains list
- ❌ FAIL if <8 prompt-provider runs
- ❌ FAIL if only 1 provider used
- ❌ FAIL if no parsed brand mentions (just raw text)

---

## Step 5: SERP Analysis (`serp`)

**Depends on**: init completed.

### MANDATORY: Use Serper.dev API ($SERPER_API_KEY)

### 5.1 Keyword Generation

```
FOR EACH niche (minimum 3):
  Generate 8-10 keywords across categories:
    ranking:    "mejor {service} {location}" (2 variants)
    solution:   "{problem} tratamiento/solución" (2 variants)  
    comparison: "{brand} vs {competitor}", "{service} precio" (2 variants)
    discovery:  "{service} {city}", "dónde {service}" (1-2 variants)
    guide:      "cómo {action}", "guía {service}" (1-2 variants)

TOTAL MINIMUM: 25 keywords. Can go up to 50 for thorough analysis.
```

### 5.2 SERP Fetching

```bash
# For EACH keyword, fetch top 10 results:
FOR keyword IN keywords:
  curl -s -X POST "https://google.serper.dev/search" \
    -H "X-API-KEY: $SERPER_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"q": "{keyword}", "gl": "{country_code}", "hl": "{language}", "num": 10}'
  
  Parse: organic[].{position, title, link, snippet}
  Extract domain from link
  Check if client domain appears → record position
  Check if competitor domains appear → record positions
  
  # Rate limit: 1 second between requests
  sleep 1
DONE
```

### 5.3 Classification

For each result, classify:
- content_type: guide | comparison | review | directory | service | news | forum | video
- domain_type: competitor | media | directory | forum | own | medical_authority | other

Use heuristics first (competitor domain list, known directories), LLM for ambiguous.

### 5.4 Volume Enrichment

```
IF $DATAFORSEO_LOGIN exists:
  # Batch all keywords (max 100 per request)
  AUTH=$(echo -n "$DATAFORSEO_LOGIN:$DATAFORSEO_PASSWORD" | base64)
  curl -s -X POST "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live" \
    -H "Authorization: Basic $AUTH" \
    -H "Content-Type: application/json" \
    -d '[{"keywords": [...all keywords...], "location_code": {location_code}, "language_code": "{lang}"}]'
  
  Parse: search_volume, cpc, competition
  
  THIS IS MANDATORY IF CREDENTIALS EXIST. NOT OPTIONAL.
ELSE:
  Note: "DataForSEO no configurado — volumen no disponible. Pide al equipo configurarlo."
```

### QUALITY GATE — serp
- ✅ ≥25 keywords searched
- ✅ ALL keywords have SERP results (top 10 positions)
- ✅ Client position identified for each keyword (position number or "not_in_top_10")
- ✅ ≥3 competitor positions tracked
- ✅ If DataForSEO credentials exist → ALL keywords enriched with volume/CPC
- ✅ Summary includes: total keywords, client_in_top3, client_in_top10, client_invisible
- ✅ Summary includes top invisible high-volume keywords
- ❌ FAIL if <15 keywords searched
- ❌ FAIL if DataForSEO exists but not used
- ❌ FAIL if no summary statistics

---

## Step 6: Gap Analysis (`gaps`)

**Depends on**: geo-analysis + serp-analysis completed.

```
1. Read geo-analysis.json → all cited domains
2. Read serp-analysis.json → all SERP domains

3. Cross-reference:
   FOR EACH domain that appears in either:
     in_geo = appears in GEO citations
     in_serp = appears in SERP results
     competitors_present = which competitors rank/appear on this domain
     client_present = does client appear here?
     
     IF client NOT present AND competitors ARE present:
       → This is a GAP
       
     gap_type:
       "geo+serp" = appears in both → HIGH PRIORITY
       "geo_only" = only in AI citations → MEDIUM (AI-focused)
       "serp_only" = only in Google → MEDIUM (SEO-focused)
     
     opportunity_score = base_by_type + competitor_count_bonus + volume_bonus

4. Generate actionable gap entries:
   Each gap needs: domain, url (if specific), gap_type, competitors_present, 
   opportunity_score, action (what to do: guest post, directory listing, create content, PR)
```

### QUALITY GATE — gaps
- ✅ Both geo-analysis.json and serp-analysis.json read
- ✅ ≥5 gaps identified (if fewer exist, explain why)
- ✅ Each gap has opportunity_score + actionable recommendation
- ✅ Gaps sorted by opportunity score
- ❌ FAIL if gaps are just a copy of competitor domains without cross-referencing

---

## Step 7: Recommendations (`recs`)

**Depends on**: seo-audit + own-media-audit + geo-analysis + gap-analysis completed.

```
1. Read ALL audit JSONs
2. Aggregate all findings into unified recommendation list

Each recommendation:
{
  "id": "rec-001",
  "source": "seo-audit|own-media|geo|gaps",
  "severity": "critical|high|medium|low",
  "category": "content|technical|social|partnerships|geo-optimization",
  "title": "short action title",
  "description": "why this matters + data backing",
  "fix_steps": ["step 1", "step 2"],
  "expected_impact_pct": 25,
  "effort": "low|medium|high",
  "priority_score": calculated,
  "data_source": "what specific data point triggered this"
}

Priority score = severity_weight × impact × (1/effort_weight)
  severity: critical=4, high=3, medium=2, low=1
  effort: low=1, medium=2, high=3

Princeton GEO benchmarks for impact estimation:
  - Citing authoritative sources: +30-40%
  - Statistics with sources: +15-25%
  - Expert quotes (blockquote): +10-20%
  - FAQ JSON-LD: +10-15%
  - Authoritative tone: +5-15%
```

### QUALITY GATE — recs
- ✅ ≥8 recommendations generated
- ✅ Each has data_source referencing specific finding from an audit
- ✅ Sorted by priority_score
- ✅ Mix of categories (not all same type)
- ❌ FAIL if recommendations are generic without linking to specific audit data

---

## Step 8: Keyword Research (`keywords`)

**Depends on**: serp-analysis completed.

### 8.1 Keyword Expansion

```
Read serp-analysis.json → get already-analyzed keywords.
Read config.json → niches, competitors.

FOR EACH niche:
  Use LLM to generate 15-20 ADDITIONAL keywords (beyond SERP set):
    - Long-tail variations of top keywords
    - Question-format keywords ("¿cómo...?", "¿dónde...?")
    - Comparison keywords ("{brand} vs {competitor}")
    - Commercial intent keywords ("{service} precio", "{service} opiniones")
    - Problem-aware keywords ("{symptom} solución")

TOTAL MINIMUM: 40 new keywords + SERP keywords = ≥65 total keyword database
```

### 8.2 Volume Enrichment (MANDATORY if DataForSEO available)

```
IF $DATAFORSEO_LOGIN exists:
  Batch all NEW keywords to DataForSEO (max 100/request, split if needed):
  
  AUTH=$(echo -n "$DATAFORSEO_LOGIN:$DATAFORSEO_PASSWORD" | base64)
  curl -s -X POST "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live" \
    -H "Authorization: Basic $AUTH" \
    -H "Content-Type: application/json" \
    -d '[{"keywords": [...], "location_code": {code}, "language_code": "{lang}"}]'

  Parse: search_volume, cpc, competition
```

### 8.3 Opportunity Scoring

```
FOR EACH keyword:
  IF volume data available:
    kd_factor = 1.0 if competition=LOW, 0.6 if MEDIUM, 0.3 if HIGH
    commercial = min(1.0, (volume × max(cpc, 0.1)) / 5000)
    score = 0.2 + commercial × 0.5 + kd_factor × 0.3
  ELSE:
    score = LLM estimate (0-1) with note "estimated, no volume data"
```

### QUALITY GATE — keywords
- ✅ ≥50 total keywords in database (SERP + new)
- ✅ If DataForSEO available → ≥90% of keywords have volume data
- ✅ Each keyword has: niche_id, category, opportunity_score
- ✅ Keywords sorted by opportunity_score
- ✅ Top 10 keywords highlighted with rationale
- ❌ FAIL if <30 total keywords
- ❌ FAIL if DataForSEO exists but keywords lack volume data

---

## Step 9: Influencer/Partner Discovery (`influencers`)

**Depends on**: init completed.

### 9.1 Discovery Methods

```
FOR EACH niche:

  YouTube Discovery:
    IF $YOUTUBE_API_KEY exists:
      curl -s "https://www.googleapis.com/youtube/v3/search?part=snippet,statistics&q={niche}+{market}&type=channel&maxResults=10&key=$YOUTUBE_API_KEY"
    ELSE:
      web_search "site:youtube.com {niche} {market} canal español" (3 searches per niche)
      web_fetch each found channel → extract subscriber count from page
  
  Instagram Discovery:
    IF $APIFY_TOKEN exists:
      Use Instagram search actor
    ELSE:
      web_search "{niche} {market} instagram influencer" (2 searches per niche)
      web_search "{niche} instagram españa seguidores" (1 search per niche)
  
  Media/Blog Discovery:
    web_search "{niche} blog españa" (1 search per niche)
    web_search "{niche} revista digital españa" (1 search per niche)
  
  Directory/Authority Discovery:
    web_search "directorio {service} {market}" (1 search per niche)

MINIMUM: 8 web_search queries for discovery
```

### 9.2 Profile Enrichment

```
FOR EACH discovered profile/site:
  - Get actual metrics (subscribers, followers, DA if possible)
  - Classify type: influencer | media | directory | community | review_platform
  - Score relevance (0-100) based on:
    niche_match (40%), audience_size (20%), engagement (20%), content_quality (20%)
  - Write brief: why relevant + suggested collaboration type
```

### QUALITY GATE — influencers
- ✅ ≥10 influencers/partners discovered
- ✅ Mix of types (not all same type)
- ✅ ≥3 have real metrics (subscribers/followers)
- ✅ Each has relevance_score + brief + suggested collaboration
- ✅ ≥8 discovery searches executed
- ❌ FAIL if just listing domains from SERP results (those are gaps, not influencer discovery)
- ❌ FAIL if <5 entries

---

## Step 10: Content Generation (`content`)

```
1. Read keywords.json → find keyword by id (must be status=approved)
2. Read config.json + brand voice
3. Generate brief → show to user → wait for approval
4. Generate article: 1500-2500 words, FAQ, JSON-LD, GEO-optimized
5. Append to content-briefs.json
6. Update keyword status → "content-created"
```

---

## `status` Command

```
Read run-state.json
Display each module:
  ⬚ pending | 🔒 locked (deps not met) | ⏳ running | ✅ completed | ❌ error
Show quality gate results for completed modules
Show MC link
```

---

## `full` Command — Run All

```
Sequence:
1. init (if not completed)
2. PARALLEL: seo-audit + own-media + geo (via sessions_spawn if available)
3. serp (after init)
4. gaps (after geo + serp)
5. recs (after all audits + gaps)
6. keywords (after serp)
7. influencers (after init)

Progress updates in Discord: after each module completes.
Format: "🔄 Trust Engine ({N}/9): {module} ✅ — {summary}"
```

---

## Output Format

All JSON files follow standard format:
```json
{
  "module": "{module_name}",
  "version": 1,
  "created_at": "ISO datetime",
  "updated_at": "ISO datetime",
  "status": "completed",
  "data": { ... module-specific ... },
  "metadata": { "duration_seconds", "apis_called": [], "errors": [] }
}
```

---

## Self-QA Checklist (run BEFORE marking any module completed)

- [ ] Quality gate for this module PASSES (check all ✅ items)
- [ ] run-state.json updated
- [ ] JSON follows standard format
- [ ] No invented/estimated data where real data was available
- [ ] All available APIs were used (not treated as optional)
- [ ] MC link provided in output
- [ ] No more than 3 tool calls without a progress update to user

<!-- Self-QA: v6.0 | 2026-03-25 -->
