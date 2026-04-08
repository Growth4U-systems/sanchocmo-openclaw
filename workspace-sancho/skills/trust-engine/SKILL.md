---
name: trust-engine
description: "Trust Engine: analyzes client's SEO, GEO (AI visibility), and Own Media. Produces gaps, recommendations, keywords, and influencer lists. Use when: 'run trust engine', 'trust engine seo-audit', 'trust engine init', 'analiza mi SEO', 'analiza mi GEO', 'qué me falta', 'dónde estoy', 'trust engine status', 'ejecuta trust engine'. Subcommands: init, seo-audit, own-media, geo, serp, gaps, recs, keywords, influencers, status, full. NOT for: content creation (use content skills), Foundation (use foundation-orchestrator), bot engagement (separate system)."
metadata:
  author: Alfonso + Cervantes
  version: '7.0'
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

# Trust Engine v7 — Specification with Quality Gates + Paymatico Learnings

> v7 changes: Subniches (L#1,2,8), density gaps (L#3), domain taxonomy (L#4), URLs not domains (L#5),
> GEO+SERP composite score (L#6), job recovery (L#7), 3-tier filtering (L#9), competitor auto-keywords (L#11),
> market filter (L#12). Based on 12 learnings from Paymatico pilot.
> See `references/paymatico-learnings.md` for full mapping.
> Every module has a QUALITY GATE section. If the gate fails, the module CANNOT be marked "completed".

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

### Dependency Gates & Job Recovery (Learning #7)

Before running a module:
- If it has `depends_on`, ALL dependencies must have `status: "completed"`
- If not → "🔒 {module} requiere: {missing_deps}"

After completing a module:
- Set `status: "completed"`, `completed_at`, `version`

**Job Recovery (Learning #7):**
- On startup of ANY module: check for orphaned "running" status (>15min) → auto-mark "failed"
- On `trust-engine full`: if module fails, continue with next independent module
- Partial retry: if SERP had 50% done, only re-query remaining keywords

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
  "niches": [{
    "id": "n1",
    "name": "Niche name",
    "brief": "A/B/C/D brief",
    "subniches": [
      { "id": "n1-s1", "name": "Subnicho vertical", "priority": "high|medium|low", "keywords_seed": ["kw1", "kw2"], "known_media": ["medio1.com"] }
    ]
  }],
  "competitors": [{ "name", "domain", "niches", "threat_level": "high|medium|low" }],
  "market_filter": {
    "country": "ES",
    "language": "es",
    "exclude_domains_pattern": ["forbes.com", "techcrunch.com"],
    "prioritize_tlds": [".es"]
  }
}
```

**Subniches (CRITICAL — Learnings #1, #2, #8):**
- Each niche MUST have ≥1 subnicho. If the Foundation doesn't list them explicitly, infer from ECPs.
- Example: niche "Franquicias" → subniches "Gimnasios", "Belleza", "Restauración"
- Subniches drive keyword generation AND GEO prompt generation. Without them, results miss entire verticals.

**Competitors (Learning #11):**
- Extract ALL competitors from Foundation. Store domain + threat level.
- These auto-generate keywords in Step 8: `{client} vs {competitor}`, `alternativas a {competitor}`, `{competitor} opiniones`
- Competitor domains auto-exclude from media/influencer lists.

**Market Filter (Learning #12):**
- Set country + language from Foundation.
- Auto-exclude international English-language domains for ES/LATAM markets.
- Prioritize country TLDs (.es for Spain, .mx for Mexico, etc.)

**Context Import (Learning #10):**
- Also read: `brand/{slug}/meeting-notes/` (if exists) — extract client-specific data (real customer names, revenue, objections)
- Also read: `brand/{slug}/go-to-market/niche-discovery/current.md` (if exists) — contains pain clusters with real user quotes

### QUALITY GATE — init
- ✅ config.json written
- ✅ ≥1 niche extracted WITH ≥1 subnicho each
- ✅ ≥1 competitor extracted with domain
- ✅ website URL present and valid (starts with https://)
- ✅ market_filter configured (country + language)
- ❌ FAIL if niches have 0 subniches (infer from ECPs if needed)

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
- **≥7 prompts per niche** (7 categories × subniches)
- **≥2 providers** (use web_search for Gemini + at least 1 more)
- **≥ ALL niches** (not a subset)
- **Total minimum: 14 prompt-provider combinations per niche** (7 prompts × 2 providers)
- **Subnicho coverage: each subnicho MUST have ≥2 prompts** (Learning #2)

### 4.1 Prompt Generation (Learning #1, #2, #8)

**Formula: `{objective} × {subnicho} × {value_proposition}` = prompt**

For EACH niche AND EACH subnicho in config.json, generate prompts in 7 categories:

```
discovery:      "Busco {subnicho_service} en {market}, ¿qué me recomiendas?"
recommendation: "Recomiéndame {solution} para {subnicho_specific_problem} en {market}"
comparison:     "Compara {subnicho_solutions} en {market}: opciones y precios"
alternatives:   "Alternativas a {known_solution} para {subnicho} en {market}"
problem:        "Tengo {subnicho_ECP_problem}. ¿Qué opciones tengo?"
authority:      "¿Quién es líder/experto en {subnicho} en {market}?"
content_gap:    "Guía completa para {subnicho_action} en {market}"
```

**CRITICAL**: Generic niche prompts miss entire verticals. 
Example: "plataforma de pagos para franquicias" → 0 fitness media.
But: "plataforma para centralizar cobros recurrentes de cadena de gimnasios con 20+ centros" → 15 new media (Palco23, CMDSport, etc.)

Minimum 7 per niche (more if multiple subniches). Store ALL generated prompts before querying.

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

### 4.4 Output Format (Learning #5)

Each GEO run must capture:
- **Cited URLs** (not just domains): the specific article/page URLs from citations
- **Brand mentions with context quote**: exact text where brand is mentioned
- **Domain classification**: tag each cited domain (editorial, directory, competitor, etc.)

### QUALITY GATE — geo
- ✅ ≥14 prompt-provider runs per niche (7 prompts × 2 providers)
- ✅ ≥2 different providers used
- ✅ ALL niches covered
- ✅ ALL subniches have ≥2 dedicated prompts
- ✅ Each run has parsed brand mentions (not just raw text dumped)
- ✅ Each run captures cited URLs (not just domains) — Learning #5
- ✅ Summary includes client_visibility percentage with actual denominator
- ✅ Summary includes competitor comparison (≥3 competitors tracked)
- ✅ Summary includes per-subnicho visibility breakdown
- ❌ FAIL if <8 prompt-provider runs total
- ❌ FAIL if only 1 provider used
- ❌ FAIL if any subnicho has 0 prompts
- ❌ FAIL if citations only have domains without URLs

---

## Step 5: SERP Analysis (`serp`)

**Depends on**: init completed.

### MANDATORY: Use Serper.dev API ($SERPER_API_KEY)

### 5.1 Keyword Generation (Learnings #1, #8, #11)

```
FOR EACH niche:
  FOR EACH subnicho:
    Generate 6-8 keywords crossing subnicho with categories:
      ranking:    "mejor {subnicho_service} {location}" (2 variants)
      solution:   "{subnicho_problem} solución" (2 variants)
      comparison: "{subnicho_service} precio/opiniones" (1-2 variants)
      discovery:  "{subnicho_service} {city}" (1 variant)
      guide:      "cómo {subnicho_action}" (1 variant)

  FOR EACH competitor (Learning #11):
    Auto-generate:
      "{client} vs {competitor}"           (if threat_level high/medium)
      "alternativas a {competitor}"         (if threat_level high/medium)
      "{competitor} opiniones"              (if threat_level high)

TOTAL MINIMUM: 30 keywords. Target 50+ for thorough analysis.
```

**CRITICAL (Learning #1):** Generic niche keywords miss subnicho verticals entirely.
Example: "software pagos franquicias" → 0 fitness results.
But: "software gestión cobros cadena gimnasios" → 15 new media.

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

### 5.5 SERP Output Format (Learnings #5, #6)

Each SERP result must capture:
- **Full URLs** (not just domains) — the specific article/page URL
- **Article title** from SERP snippet — for outreach context
- **Domain classification** — tagged via taxonomy (Learning #4)

### QUALITY GATE — serp
- ✅ ≥30 keywords searched (across all subniches)
- ✅ ALL subniches have ≥3 keywords searched
- ✅ ALL keywords have SERP results (top 10 positions with URLs)
- ✅ Client position identified for each keyword (position number or "not_in_top_10")
- ✅ ≥3 competitor positions tracked
- ✅ Competitor auto-keywords included (vs, alternativas) — Learning #11
- ✅ If DataForSEO credentials exist → ALL keywords enriched with volume/CPC
- ✅ Results include full URLs with article titles (not just domains) — Learning #5
- ✅ Summary includes: total keywords, client_in_top3, client_in_top10, client_invisible
- ✅ Summary includes top invisible high-volume keywords
- ✅ Summary includes per-subnicho breakdown
- ❌ FAIL if <15 keywords searched
- ❌ FAIL if DataForSEO exists but not used
- ❌ FAIL if no summary statistics
- ❌ FAIL if any subnicho has 0 keywords searched

---

## Step 6: Gap Analysis (`gaps`)

**Depends on**: geo-analysis + serp-analysis completed.

```
1. Read geo-analysis.json → all cited URLs + domains + mention counts
2. Read serp-analysis.json → all SERP URLs + domains
3. Read config.json → competitor domains (for exclusion + comparison)
4. Load domain taxonomy: _system/domain-taxonomy.json (if exists) — shared classification across clients

5. TWO MODES of gap detection (Learning #3):

   MODE A — Presence Gaps (original):
   FOR EACH domain/URL:
     IF client NOT present AND competitors ARE present → PRESENCE GAP

   MODE B — Density Gaps (NEW — Learning #3):
   FOR EACH domain where client IS present:
     client_mentions = count of client mentions in this domain
     max_competitor_mentions = max(competitor mentions in this domain)
     IF max_competitor_mentions > client_mentions × 3 → DENSITY GAP
     (competitor has 15 mentions, client has 1 = gap of intensity)

   MODE C — Type Gaps (NEW — Learning #3):
   FOR EACH domain where client is mentioned:
     mention_type = "list_mention" | "dedicated_article" | "comparison" | "review"
     IF client only has list_mentions but competitor has dedicated_articles → TYPE GAP

6. Cross-reference GEO + SERP (Learning #6):
   gap_type:
     "geo+serp" = appears in both → HIGH PRIORITY (most valuable media)
     "geo_only" = only in AI citations → MEDIUM (AI visibility)
     "serp_only" = only in Google → MEDIUM (SEO)

7. Score compuesto (Learning #6):
   score = (GEO_citations × 2) + (SERP_appearances × 1.5) + (num_AI_providers × 3) + type_bonus
   type_bonus: geo+serp = 25, geo_only = 15, serp_only = 10

8. Domain Classification (Learning #4):
   Classify each domain as:
   - editorial: prensa, revista (Expansión, CincoDías) → Action: artículo, entrevista, nota de prensa
   - portal_sectorial: vertical media (CMDSport, Palco23) → Action: guest post, publirreportaje
   - directorio_software: (Capterra, Appvizer) → Action: crear perfil + recoger reseñas
   - comparador: (Rankia, HelpMyCash) → Action: solicitar inclusión en ranking
   - asociacion: (AEFI, ASSET) → Action: membresía, informes, eventos
   - competitor: ALWAYS EXCLUDE
   - empresa_consultora: EXCLUDE (not a media)
   - red_social: EXCLUDE from media list
   - medio_internacional_otro_idioma: EXCLUDE if market_filter doesn't match (Learning #12)
   
   Save to _system/domain-taxonomy.json for cross-client reuse (Learning #4)

9. Generate gap entries with URLs (Learning #5):
   Each gap needs:
   - domain + specific_urls (article URLs, not just domain)
   - url_title (article title for outreach context)
   - gap_type (presence|density|type)
   - gap_source (geo+serp|geo_only|serp_only)
   - domain_classification (from taxonomy)
   - competitors_present + their mention counts
   - opportunity_score
   - suggested_action (based on domain classification)
   - suggested_collaboration_type (artículo|guest post|perfil|inclusión|membresía)
```

### QUALITY GATE — gaps
- ✅ Both geo-analysis.json and serp-analysis.json read
- ✅ ALL THREE gap modes executed (presence + density + type)
- ✅ ≥5 gaps identified across all modes (if fewer, explain why with data)
- ✅ Each gap has specific URLs, not just domains (Learning #5)
- ✅ Each gap has domain classification (Learning #4)
- ✅ Each gap has suggested_action based on classification
- ✅ Competitor domains excluded from gap list
- ✅ International/wrong-language domains excluded (Learning #12)
- ✅ Gaps sorted by opportunity score
- ❌ FAIL if gap analysis returns 0 without checking density mode
- ❌ FAIL if gaps only have domains without URLs
- ❌ FAIL if competitor domains appear in media recommendations

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

### 7.2 Media Recommendations Output (Learnings #4, #5, #9)

For media/partnership recommendations specifically, output THREE tiers (Learning #9):

```
TIER 1 — Raw: All domains from GEO + SERP (for reference)
TIER 2 — Filtered: Only actionable media (no competitors, no social, no consultoras)
TIER 3 — Accionable: With URLs, collaboration type, contact suggestions, outreach template type

Each Tier 3 entry must include:
  - domain + specific article URLs
  - domain_type (editorial|portal_sectorial|directorio|comparador|asociacion)
  - suggested_collaboration: artículo | guest post | perfil + reseñas | inclusión en ranking | membresía
  - outreach_template_type: press_pitch | guest_post_pitch | directory_listing | association_inquiry
  - GEO+SERP badges: "Citado por 4 IAs", "Top 5 Google", "Dual GEO+SERP" (Learning #6)
  - per_subnicho: which subniches this media covers
```

### QUALITY GATE — recs
- ✅ ≥8 recommendations generated
- ✅ Each has data_source referencing specific finding from an audit
- ✅ Sorted by priority_score
- ✅ Mix of categories (not all same type)
- ✅ Media recs have 3-tier output (raw → filtered → accionable) — Learning #9
- ✅ Media recs have URLs not just domains — Learning #5
- ✅ No competitor domains in media recommendations — Learning #4
- ✅ No international wrong-language domains — Learning #12
- ❌ FAIL if recommendations are generic without linking to specific audit data
- ❌ FAIL if media recs only have domains without URLs and collaboration types

---

## Step 8: Keyword Research (`keywords`)

**Depends on**: serp-analysis completed.

### 8.1 Keyword Expansion (Learnings #1, #8, #11)

```
Read serp-analysis.json → get already-analyzed keywords.
Read config.json → niches, subniches, competitors.

LAYER 1 — Subnicho Expansion:
FOR EACH niche:
  FOR EACH subnicho:
    Generate 10-15 ADDITIONAL keywords:
      - Long-tail with subnicho specificity
      - Question-format: "¿cómo {subnicho_action}?", "¿dónde {subnicho_service}?"
      - Commercial intent: "{subnicho_service} precio", "{subnicho_service} opiniones"
      - Problem-aware: "{subnicho_symptom} solución"

LAYER 2 — Competitor Keywords (Learning #11):
FOR EACH competitor in config.json:
  Auto-generate (NO LLM needed, deterministic):
    "{client_name} vs {competitor_name}"                    (all competitors)
    "alternativas a {competitor_name}"                       (threat high/medium)
    "{competitor_name} opiniones"                            (threat high)
    "{competitor_name} vs {other_competitor}"                (threat high, generates comparison content opportunities)
  
  NOTE: These competitor keywords often have LOW volume in DataForSEO but HIGH conversion intent.
  Do NOT exclude them for low volume.

LAYER 3 — Discovery from GEO:
  Read geo-analysis.json → extract competitor names mentioned by AIs that are NOT in config.json
  Suggest adding them to competitor table + generate their keywords

TOTAL MINIMUM: 50 new keywords + SERP keywords = ≥80 total keyword database
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
- ✅ ≥80 total keywords in database (SERP + subnicho + competitor)
- ✅ If DataForSEO available → ≥90% of keywords have volume data
- ✅ Each keyword has: niche_id, subnicho_id, category, opportunity_score
- ✅ ALL subniches have ≥5 dedicated keywords
- ✅ ALL high/medium-threat competitors have vs/alternativas keywords (Learning #11)
- ✅ Keywords sorted by opportunity_score
- ✅ Top 10 keywords highlighted with rationale
- ✅ Competitor keywords included even if low volume (high conversion intent)
- ❌ FAIL if <40 total keywords
- ❌ FAIL if DataForSEO exists but keywords lack volume data
- ❌ FAIL if any subnicho has 0 keywords

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

### 9.3 Classification & Filtering (Learning #4, #9, #12)

Apply 3-tier filtering (Learning #9):
```
TIER 1 — Raw: All discovered profiles/sites
TIER 2 — Filtered: Remove competitors, social platforms, wrong-market, consultoras
TIER 3 — Accionable: With contact info, collaboration type, outreach approach

Classification (Learning #4):
  editorial | portal_sectorial | directorio | comparador | asociacion | influencer_individual | community
  
  ALWAYS EXCLUDE: competitor domains, empresa/consultora, red_social (as target), wrong-market media
```

### QUALITY GATE — influencers
- ✅ ≥10 influencers/partners discovered (Tier 3, after filtering)
- ✅ Mix of types (editorial + portal + directorio + individual minimum)
- ✅ ≥3 have real metrics (subscribers/followers/DA)
- ✅ Each has relevance_score + brief + suggested_collaboration_type
- ✅ Each has specific URLs (articles they've published on topic) — Learning #5
- ✅ ≥8 discovery searches executed per niche
- ✅ No competitor domains in list — Learning #4
- ✅ No wrong-market/language domains — Learning #12
- ✅ 3-tier output provided (raw count + filtered count + accionable list) — Learning #9
- ❌ FAIL if just listing domains from SERP results (those are gaps, not influencer discovery)
- ❌ FAIL if <5 Tier 3 entries
- ❌ FAIL if competitor domains appear in recommendations

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
