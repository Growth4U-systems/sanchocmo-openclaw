---
name: trust-engine
description: "Trust Engine: analyzes client's SEO, GEO (AI visibility), and Own Media. Produces gaps, recommendations, keywords, and influencer lists. Use when: 'run trust engine', 'trust engine seo-audit', 'trust engine init', 'analiza mi SEO', 'analiza mi GEO', 'qué me falta', 'dónde estoy', 'trust engine status', 'ejecuta trust engine'. Subcommands: init, seo-audit, own-media, geo, serp, gaps, recs, keywords, influencers, status, full. NOT for: content creation (use content skills), Foundation (use foundation-orchestrator), bot engagement (separate system)."
metadata:
  author: Alfonso + Cervantes
  version: '5.0'
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

# Trust Engine v5 — Native OpenClaw Architecture

> No backend Python. No FastAPI. Todo nativo: skills + exec (curl) + LLM + JSON files.
> MC lee los JSON files directamente. Cada módulo es independiente con dependency gates.

---

## Architecture Overview

```
Sancho Skill (this)
  → exec (curl APIs) + web_fetch + LLM analysis
  → Writes to brand/{slug}/trust-engine/*.json
  → MC reads JSONs and renders dashboard with buttons
  → User launches modules from MC or Discord
```

**Persistence**: `brand/{slug}/trust-engine/` — one JSON per module + config + run-state.
**No database**. No SQL. JSON files only.

---

## Subcommand Routing

Parse the user's message to determine which subcommand to run:

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
| `trust-engine status {slug}` | → Show run-state.json |
| `trust-engine full {slug}` | → Run all in sequence |

If no subcommand specified, show status + suggest next action.
If no slug specified, detect from current Discord guild via clients.json.

---

## Step 0: Common — Resolve Slug & Gate Check

```
1. Resolve slug:
   - If slug provided in command → use it
   - If in client guild → read clients.json, match guild to slug
   - If ambiguous → ask user

2. Foundation gate check:
   Read these files (ALL must exist, otherwise STOP):
   - brand/{slug}/company-brief/current.md
   - brand/{slug}/go-to-market/ecps/current.md
   - brand/{slug}/go-to-market/positioning/current.md  
   - brand/{slug}/market-and-us/competitors/current.md
   If any missing → respond: "❌ Foundation incompleta. Falta: {list}. Ejecuta Foundation primero."

3. Create trust-engine dir if needed:
   exec: mkdir -p brand/{slug}/trust-engine

4. Load or create run-state.json:
   Read brand/{slug}/trust-engine/run-state.json
   If not exists → create with all modules "pending" (see template below)
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

### Dependency Gate

Before running a module, check run-state.json:
- If the module has `depends_on`, ALL dependencies must have status `"completed"`
- If not → respond: "🔒 {module} requiere: {missing_deps}. Ejecútalos primero."

After completing a module, update run-state.json:
```json
{ "status": "completed", "completed_at": "2026-03-24T19:30:00Z", "version": 1 }
```

---

## Step 1: Foundation Import (`trust-engine init {slug}`)

**Purpose**: Read Foundation docs and create config.json for Trust Engine.

```
1. Read Foundation docs:
   - brand/{slug}/company-brief/current.md → extract: name, website, market, language, services
   - brand/{slug}/go-to-market/ecps/current.md → extract: niche names, target audiences
   - brand/{slug}/go-to-market/positioning/current.md → extract: positioning per ECP
   - brand/{slug}/market-and-us/competitors/current.md → extract: competitor names, domains
   - brand/{slug}/market-and-us/self/current.md → extract: brand aliases, own domains
   - brand/{slug}/brand-identity/voice/current.md (if exists) → note for content generation

2. Generate config.json using LLM:
   Prompt: "Based on these Foundation documents, create a Trust Engine config JSON with:
   - project: slug, name, website, language, market
   - brand: name, aliases, domains
   - niches: array of {id, name, brief with A/B/C/D}
   - competitors: array of {name, domain, niches}
   Follow this schema exactly: [paste schema from PDR v5 section 3.1]"

3. Write brand/{slug}/trust-engine/config.json

4. Update run-state.json: foundation-import → completed

5. Output: "✅ Foundation importada. {N} niches, {N} competidores. Config: brand/{slug}/trust-engine/config.json"
```

---

## Step 2: SEO Site Audit (`trust-engine seo-audit {slug}`)

**Purpose**: Lighthouse scores + health checks via Google PSI API + web_fetch.

**Prerequisite**: foundation-import completed (need website URL from config.json).

```
1. Read config.json → get website URL

2. Lighthouse via Google PSI API:
   exec: curl -s "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url={website}&strategy=mobile&category=performance&category=accessibility&category=best-practices&category=seo&key={GOOGLE_API_KEY}"
   
   Parse response:
   - lighthouseResult.categories.performance.score × 100
   - lighthouseResult.categories.accessibility.score × 100
   - lighthouseResult.categories.best-practices.score × 100
   - lighthouseResult.categories.seo.score × 100
   - lighthouseResult.audits['largest-contentful-paint'].numericValue (ms → s)
   - lighthouseResult.audits['total-blocking-time'].numericValue
   - lighthouseResult.audits['cumulative-layout-shift'].numericValue
   - lighthouseResult.audits['first-contentful-paint'].numericValue (ms → s)
   - lighthouseResult.audits['speed-index'].numericValue (ms → s)

   Rate CWV: good (<2.5s LCP, <200ms TBT, <0.1 CLS), needs-improvement, poor

   NOTE: If no GOOGLE_API_KEY available, the PSI API works without a key but with lower rate limits.
   Try without key first: curl -s "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url={website}&strategy=mobile&category=performance&category=accessibility&category=best-practices&category=seo"

3. Health Checks via web_fetch:
   Fetch the homepage HTML and check:
   
   HC-01: Meta Title — exists, length 30-60 chars
   HC-02: Meta Description — exists, length 120-160 chars
   HC-03: H1 Tag — exactly 1 H1 on the page
   HC-04: Open Graph Tags — og:title, og:description, og:image present
   HC-05: Canonical Tag — <link rel="canonical"> present
   HC-06: SSL — URL starts with https://
   HC-07: Mobile Viewport — <meta name="viewport"> present
   HC-08: Language Tag — <html lang="..."> present
   
   Fetch /sitemap.xml:
   HC-09: Sitemap — exists, returns XML
   
   Fetch /robots.txt:
   HC-10: Robots.txt — exists, doesn't block important paths
   
   Check via Lighthouse data:
   HC-11: Core Web Vitals — all three pass thresholds
   HC-12: Image Alt Tags — from lighthouse audit data
   HC-13: Structured Data — ⚠️ web_fetch can't reliably detect JS-injected JSON-LD.
          Use browser tool if available: document.querySelectorAll('script[type="application/ld+json"]')
          Or note as "requires manual verification"
   HC-14: Internal Links — check for reasonable internal linking
   HC-15: Hreflang — check if multi-language site has hreflang tags

4. Generate issues using LLM:
   Prompt: "Based on these Lighthouse scores and health check results, generate a list of issues with:
   - id, source (lighthouse|health-check), severity (critical|high|medium|low)
   - title, description, fix_steps (array), expected_impact_pct (number)
   Prioritize by impact. Use Princeton GEO benchmarks for impact estimates."

5. Calculate overall score: average of Lighthouse SEO + weighted health check pass rate

6. Write brand/{slug}/trust-engine/seo-audit.json following schema:
   {
     "module": "seo-audit",
     "version": 1,
     "created_at": "{ISO datetime}",
     "updated_at": "{ISO datetime}",
     "status": "completed",
     "data": {
       "lighthouse": { performance, accessibility, best_practices, seo, core_web_vitals },
       "health_checks": [ { id, name, status, details, severity, fix, impact_pct } ],
       "issues": [ { id, source, severity, title, description, fix_steps, expected_impact_pct } ],
       "score": {overall}
     },
     "metadata": { "duration_seconds": ..., "apis_called": ["google-psi"], "errors": [] }
   }

7. Update run-state.json: seo-audit → completed

8. Output summary: "✅ SEO Audit completado. Score: {score}/100. {N} issues ({critical} critical, {high} high)."
```

---

## Step 3: Own Media Audit (`trust-engine own-media {slug}`)

**Purpose**: Scan blog, social profiles, schemas, and tech stack.

**Prerequisite**: foundation-import completed.

```
1. Read config.json → get website, brand name, social hints from Foundation

2. Blog Scanner:
   - web_fetch: {website}/blog (or /blog/, /noticias/, /articles/)
   - Detect: exists, estimated post count, frequency, last post date, categories
   - If 404 → try common paths: /blog, /noticias, /news, /insights, /recursos
   - Check average word count of 2-3 recent posts

3. Social Discovery:
   For each platform, search via web_fetch or exec:
   - Instagram: web_fetch "https://www.google.com/search?q=site:instagram.com+{brand_name}" — extract profile URL
   - LinkedIn: web_fetch "https://www.google.com/search?q=site:linkedin.com/company+{brand_name}" — extract company URL
   - Twitter/X: web_fetch "https://www.google.com/search?q=site:twitter.com+{brand_name}+OR+site:x.com+{brand_name}"
   - YouTube: web_fetch "https://www.google.com/search?q=site:youtube.com+{brand_name}+channel"
   - TikTok: web_fetch "https://www.google.com/search?q=site:tiktok.com+@{brand_name}"
   - Facebook: web_fetch "https://www.google.com/search?q=site:facebook.com+{brand_name}"
   
   For each found: note URL, estimate posting frequency from page content

4. Schema Scanner:
   - web_fetch the homepage HTML
   - Search for <script type="application/ld+json"> blocks
   - ⚠️ If web_fetch strips scripts, use browser tool: 
     browser action=act kind=evaluate fn="JSON.stringify([...document.querySelectorAll('script[type=\"application/ld+json\"]')].map(s=>JSON.parse(s.textContent)))"
   - List found schemas, note missing recommended ones based on business type

5. Tech Detector:
   - From HTML headers and content, detect:
   - CMS: WordPress (wp-content), Shopify, Wix, Squarespace, custom
   - Analytics: GA4 (gtag), Mixpanel, Hotjar, Clarity
   - CDN: Cloudflare (cf-ray header), AWS CloudFront, Fastly
   - SSL: check https
   - Mobile responsive: viewport meta tag

6. Calculate scores:
   - Content (35%): blog exists (20), frequency (30), post quality (20), categories (15), freshness (15)
   - Social (30%): platforms found (40), posting frequency (30), profile optimization (30)
   - Technical (35%): SSL (15), mobile (15), CMS modern (15), analytics (20), CDN (15), schemas (20)
   - Overall = content × 0.35 + social × 0.30 + technical × 0.35

7. Write brand/{slug}/trust-engine/own-media-audit.json

8. Update run-state.json: own-media-audit → completed

9. Output: "✅ Own Media completado. Score: {overall}/100. Blog: {status}. Social: {N} platforms."
```

---

## Step 4: GEO Analysis (`trust-engine geo {slug}`)

**Purpose**: Test AI visibility across multiple LLM providers.

**Prerequisite**: foundation-import completed.

```
1. Read config.json → get niches, brand name, competitors

2. Generate prompts (6 per niche, using LLM):
   Categories:
   - ranking: "¿Cuáles son las mejores {niche} en {market}?"
   - comparison: "Compara las principales {niche} en {market}"
   - guide: "Guía para elegir {niche} en {market}"
   - solution: "Necesito {problem from ECP}, ¿qué opciones tengo?"
   - authority: "¿Quién es líder en {niche}?"
   - discovery: "Busco {service} en {location}, ¿qué me recomiendas?"

3. For each prompt, run 3-turn conversation with ≥2 providers:
   Use sessions_spawn to parallelize providers.
   
   Providers (use what's available in the system):
   - OpenAI (ChatGPT): use web_search or exec with OpenAI API
   - Google (Gemini): use web_search (which uses Gemini)
   - Anthropic (Claude): use sessions_spawn with a prompt
   - Perplexity: if API key available, exec curl to Perplexity API
   
   3-turn conversation per prompt per provider:
   Turn 1 (Discovery): Ask the prompt directly
   Turn 2 (Why): "¿Por qué recomiendas esas opciones? ¿Qué criterios usas?"
   Turn 3 (Sources): "¿Qué fuentes consultarías para verificar esta información?"

4. Parse responses (using LLM):
   For each response, extract:
   - Brand mentions: [{brand, is_client, position (1-indexed), sentiment (positive/neutral/negative), context}]
   - Citations: [{url, domain}]
   
   Prompt: "Analyze this AI response. Extract all brand mentions with their position (1st=1, 2nd=2...), 
   sentiment, and any URLs cited. The client brand is '{brand_name}'. Known competitors: {competitors}.
   Return JSON: { mentions: [...], citations: [...] }"

5. Calculate summary:
   - client_visibility: % of prompts where client brand was mentioned
   - avg_position: average position when mentioned
   - sentiment_breakdown: % positive/neutral/negative
   - top_cited_domains: domains most frequently cited across all responses
   - competitor_visibility: same metrics per competitor

6. Write brand/{slug}/trust-engine/geo-analysis.json

7. Update run-state.json: geo-analysis → completed

8. Output: "✅ GEO Analysis completado. Visibility: {pct}%. Avg position: {pos}. Mentioned by {N}/{total} providers."
```

---

## Step 5: SERP Analysis (`trust-engine serp {slug}`)

**Purpose**: Analyze Google search results for target keywords.

**Prerequisite**: foundation-import completed.

```
1. Read config.json → get niches, competitors, market

2. Generate keywords (using LLM):
   Based on niches and ECPs, generate 15-30 target keywords across categories:
   - ranking: "mejor {service} {location}"
   - comparison: "{brand} vs {competitor}", "comparativa {service}"
   - guide: "cómo elegir {service}", "guía {service}"
   - solution: "{problem} solución", "tratamiento para {problem}"
   - authority: "{service} expertos", "líder en {service}"
   - discovery: "{service} cerca de mí", "{service} {city}"

3. Search each keyword via Serper.dev:
   exec: curl -s -X POST "https://google.serper.dev/search" \
     -H "X-API-KEY: $SERPER_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"q": "{keyword}", "gl": "{country_code}", "hl": "{language}", "num": 10}'
   
   Parse: organic results with position, title, link, snippet, domain

4. Classify results (using LLM for batches):
   - Content type: guide, comparison, review, directory, service, news, forum, video
   - Domain type: competitor, media, directory, forum, own, other
   
   Classification heuristics (try before LLM):
   - URL contains /vs/ or /compare → comparison
   - Domain is yelp/tripadvisor/trustpilot → directory
   - Domain matches competitor list → competitor
   - Domain matches client → own
   - URL contains /blog/ or /guide/ → guide

5. Write brand/{slug}/trust-engine/serp-analysis.json

6. Update run-state.json: serp-analysis → completed

7. Output: "✅ SERP Analysis completado. {N} keywords analyzed. Client in top 10: {N}/{total}."
```

---

## Step 6: Gap Analysis (`trust-engine gaps {slug}`)

**Purpose**: Cross-reference GEO citations with SERP results to find gaps.

**Dependencies**: geo-analysis + serp-analysis must be completed.

```
1. Read geo-analysis.json → extract all citations (URLs + domains)
2. Read serp-analysis.json → extract all SERP results (URLs + domains)

3. Find gaps (using LLM):
   - Domains where competitors appear in SERP but client doesn't
   - URLs cited by AI providers where client is NOT mentioned
   - Cross-reference: URLs that appear in BOTH GEO citations and SERP results = high opportunity
   
   For each gap:
   - type: geo_only (only in AI citations), serp_only (only in Google), both (in both)
   - competitors_present: which competitors appear there
   - opportunity_score: min(30, n_competitors×10) + (25 if both, 15 if geo_only, 10 if serp_only) + bonuses

4. Write brand/{slug}/trust-engine/gap-analysis.json

5. Update run-state.json: gap-analysis → completed

6. Output: "✅ Gap Analysis completado. {total} gaps found ({high_opp} high opportunity)."
```

---

## Step 7: Recommendations (`trust-engine recs {slug}`)

**Purpose**: Aggregate all findings into prioritized recommendations.

**Dependencies**: seo-audit + own-media-audit + geo-analysis + gap-analysis must be completed.

```
1. Read all completed module JSONs:
   - seo-audit.json → issues
   - own-media-audit.json → gaps in social, blog, tech
   - geo-analysis.json → visibility gaps per provider
   - gap-analysis.json → opportunities

2. Generate recommendations (using LLM):
   Prompt: "Based on these audit results, generate prioritized recommendations.
   Each recommendation must have: id, source, severity, category, title, description,
   fix_steps, expected_impact_pct, effort (low/medium/high), priority_score.
   
   Use Princeton GEO benchmarks for impact:
   - Citing authoritative sources: +30-40%
   - Statistics with sources: +15-25%
   - Expert quotes (blockquote): +10-20%
   - FAQ JSON-LD: +10-15%
   - Authoritative tone: +5-15%
   
   Priority score = severity_weight × impact × (1/effort)
   Severity weights: critical=4, high=3, medium=2, low=1"

3. Write brand/{slug}/trust-engine/recommendations.json

4. Update run-state.json: recommendations → completed

5. Output: "✅ Recommendations generadas. {N} total ({critical} critical, {high} high). Top 3: {list}."
```

---

## Step 8: Keyword Research (`trust-engine keywords {slug}`)

**Purpose**: Deep keyword research with volume/CPC/KD data.

**Dependencies**: serp-analysis (to avoid duplicates).

```
1. Read config.json → niches
2. Read serp-analysis.json → already-analyzed keywords

3. Generate expanded keyword list (using LLM):
   For each niche, generate 20-40 keywords across 6 categories.
   Exclude keywords already in serp-analysis.

4. Enrich with DataForSEO (if API key available):
   exec: curl -s -X POST "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live" \
     -H "Authorization: Basic $DATAFORSEO_AUTH" \
     -H "Content-Type: application/json" \
     -d '[{"keywords": [...], "location_code": 2724, "language_code": "es"}]'
   
   Extract: search_volume, cpc, competition (kd)
   
   If no DataForSEO key → use LLM estimates with disclaimer

5. Calculate opportunity score:
   kd_factor = (100 - kd) / 100
   commercial = min(1.0, (volume × max(cpc, 0.1)) / 5000)
   score = 0.2 + commercial × 0.5 + kd_factor × 0.3

6. Write brand/{slug}/trust-engine/keywords.json

7. Update run-state.json: keywords → completed

8. Output: "✅ Keywords generadas. {N} total. Top 5 by opportunity: {list}."
```

---

## Step 9: Influencer Discovery (`trust-engine influencers {slug}`)

**Purpose**: Find relevant influencers/partners on YouTube and Instagram.

**Prerequisite**: foundation-import completed.

```
1. Read config.json → niches, market, language

2. YouTube Discovery:
   For each niche, search YouTube:
   exec: curl -s "https://www.googleapis.com/youtube/v3/search?part=snippet&q={niche_keyword}&type=channel&maxResults=10&key=$YOUTUBE_API_KEY"
   
   If no YouTube API key → use web_search as fallback:
   web_search: "site:youtube.com {niche} {market} channel"

3. Instagram Discovery:
   For each niche, search via Google:
   web_search: "site:instagram.com {niche} {market} influencer"
   
   Or via Google CSE if available:
   exec: curl -s "https://www.googleapis.com/customsearch/v1?q={niche}+{market}&cx=$GOOGLE_CSE_CX&key=$GOOGLE_CSE_KEY&siteSearch=instagram.com"

4. Score and brief (using LLM):
   For each found profile, generate:
   - relevance_score (0-100)
   - brief describing why they're relevant
   - suggested collaboration type

5. Write brand/{slug}/trust-engine/influencers.json

6. Update run-state.json: influencers → completed

7. Output: "✅ Influencers descubiertos. {N} total ({yt} YouTube, {ig} Instagram)."
```

---

## Step 10: Content Generation (`trust-engine content {slug} {keyword-id}`)

**Purpose**: Generate article for an approved keyword.

**Prerequisite**: keywords.json must exist, keyword must be status=approved.

```
1. Read keywords.json → find keyword by id
2. Read config.json → brand voice, niches
3. Read brand-voice (if exists) → tone, vocabulary

4. Generate brief (using LLM):
   Title, outline, target word count, template type, SEO directives

5. Show brief to user → wait for approval

6. Generate article (using LLM):
   - 1500-2500 words
   - Include direct answer blockquote at top
   - FAQ section (3-5 questions)
   - Citations inline with [Source](url) format
   - Brand voice applied
   - GEO-optimized structure

7. Generate JSON-LD schema:
   - Article schema
   - FAQPage schema
   - Author Person schema (E-E-A-T)

8. Write to content-briefs.json (append)

9. Update keyword status in keywords.json → "content-created"

10. Output: article in thread for review
```

---

## `trust-engine status {slug}`

```
Read brand/{slug}/trust-engine/run-state.json
Display status of each module with emoji:
  ⬚ pending | 🔒 locked (deps not met) | ⏳ running | ✅ completed | ❌ error

Show which modules can be run next (pending + deps met).
Show MC link for visual dashboard.
```

---

## `trust-engine full {slug}`

```
Run all modules in optimal sequence:
1. init (if not completed)
2. Parallel: seo-audit + own-media-audit + geo-analysis
3. serp-analysis
4. gap-analysis (needs geo + serp)
5. recommendations (needs all audits + gaps)
6. keywords (needs serp)
7. influencers

Use sessions_spawn for parallel modules in step 2.
After each module, update progress in Discord thread.
```

---

## Output Format Reference

All JSON files follow the PDR v5 schemas. See brand/sanchocmo/prds/escudero-pdr-v5.md sections 3.1-3.10 for full schemas.

## Self-QA Checklist

- [ ] Foundation gate check passed
- [ ] run-state.json updated after each module
- [ ] Dependency gates enforced
- [ ] JSON files follow standard format (module, version, created_at, status, data, metadata)
- [ ] MC link provided in output (using mcToken from clients.json)
- [ ] No backend Python calls — all native OpenClaw
- [ ] Progress updates in Discord thread (max 2 messages: start + result)
