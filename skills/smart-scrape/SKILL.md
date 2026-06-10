---
name: smart-scrape
description: "Intelligent multi-tier web scraping with automatic fallback. Use when scraping websites, extracting web content, crawling pages, fetching URL content for analysis, or when web_fetch returns empty/broken content. Also use when the user mentions 'scrape', 'crawl', 'extract from website', 'get content from URL', 'fetch page', 'web data', or when you need to read a webpage that has JavaScript rendering, anti-bot protection, or dynamic content. This skill automatically escalates through scraping tiers: native fetch → Jina AI → Cloudflare Browser Rendering → Firecrawl → Apify."
---

# Smart Scrape — Cascading Web Extraction

Extract web content reliably using a 5-tier fallback system. Each tier adds capability and cost. Always start at the lowest tier that could work and escalate only on failure.

## Tier Architecture

```
Tier 1 → web_fetch (native)         — Free, instant, static HTML
Tier 2 → Jina AI Reader             — Free (10M tokens), JS/SPA rendering
Tier 3 → Cloudflare Browser Rendering — ~$10/mes, multi-page crawl, AI extraction
Tier 4 → Firecrawl                   — $16-83/mes, stealth proxies, autonomous agent
Tier 5 → Apify                       — $29+/mes, protected platforms (LinkedIn, Maps)
```

## Decision Flow

### Step 1: Classify the task

Before scraping, determine what you need:

| Need | Start at |
|------|----------|
| Single page, likely static (blog, docs, news) | Tier 1 |
| Single page, likely SPA/JS-heavy (React, Angular app) | Tier 2 |
| Multiple pages from same domain | Tier 3 |
| Site known to block bots aggressively | Tier 4 |
| Protected platform (LinkedIn, Google Maps, Instagram) | Tier 5 |

### Step 2: Execute with fallback

Try the selected tier. If it fails (empty content, blocked, error), escalate to the next tier. Document which tier succeeded for future reference.

**Failure signals to escalate:**
- Empty or near-empty content (< 100 chars of useful text)
- HTML with only `<script>` tags and no rendered content
- 403/429/503 HTTP errors
- CAPTCHA or challenge page detected
- Content clearly incomplete (navigation only, no main content)

## Tier Details

### Tier 1 — Native Fetch (`web_fetch`)

The default. Use the `web_fetch` tool directly.

```
web_fetch(url="https://example.com", extractMode="markdown", maxChars=50000)
```

**Strengths:** Free, fast, no setup, good for static sites
**Weaknesses:** No JS rendering, no anti-bot bypass, single page only
**Escalate when:** Content is empty, JS-only, or blocked

### Tier 2 — Jina AI Reader

Prepend `r.jina.ai/` to the URL. Use via `web_fetch`.

```
web_fetch(url="https://r.jina.ai/https://example.com", extractMode="markdown")
```

**Strengths:** Free (10M tokens/key), renders JS/SPAs, clean markdown output, image captioning
**Weaknesses:** Single page only, respects robots.txt, no anti-bot bypass
**Rate limits:** 20 req/min without key, 200 req/min with key

**For search results (alternative to web_search for some cases):**
```
web_fetch(url="https://s.jina.ai/?q=your+search+query", extractMode="markdown")
```

**Escalate when:** Content still empty, need multi-page crawl, or bot-blocked

### Tier 3 — Cloudflare Browser Rendering

REST API with real Chromium. Requires CF account + API token.

**Check if configured:**
```bash
# API token should be in environment or secrets
echo $CLOUDFLARE_API_TOKEN
echo $CLOUDFLARE_ACCOUNT_ID
```

**Single page — Markdown:**
```bash
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/browser-rendering/markdown" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

**Single page — Structured JSON with AI:**
```bash
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/browser-rendering/json" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/pricing",
    "prompt": "Extract pricing plans with name, price, and features",
    "response_format": {
      "type": "json_schema",
      "schema": {
        "type": "object",
        "properties": {
          "plans": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "name": {"type": "string"},
                "price": {"type": "string"},
                "features": {"type": "array", "items": {"type": "string"}}
              }
            }
          }
        }
      }
    }
  }'
```

**Multi-page crawl (async):**
```bash
# 1. Start crawl
JOB=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/browser-rendering/crawl" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "maxPages": 50,
    "maxDepth": 3
  }' | jq -r '.result')

# 2. Poll for results
curl -s "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/browser-rendering/crawl/${JOB}" \
  -H "Authorization: Bearer ${CF_API_TOKEN}"
```

**Pricing:** Free tier = 10 min/day, 5 crawls/day. Paid = $5/mes base + $0.09/h extra.
**Strengths:** Real Chromium, multi-page crawl, AI extraction, incremental crawling
**Weaknesses:** Identifies as bot, respects robots.txt, no proxy rotation, async for crawls
**Escalate when:** Blocked by anti-bot, need stealth

### Tier 4 — Firecrawl

API-first scraping with stealth proxies and AI agent.

**Check if configured:**
```bash
echo $FIRECRAWL_API_KEY
```

**Single page scrape:**
```bash
curl -s -X POST "https://api.firecrawl.dev/v1/scrape" \
  -H "Authorization: Bearer ${FIRECRAWL_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "formats": ["markdown"]}'
```

**Crawl site:**
```bash
curl -s -X POST "https://api.firecrawl.dev/v1/crawl" \
  -H "Authorization: Bearer ${FIRECRAWL_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "limit": 50}'
```

**AI Extract (structured data):**
```bash
curl -s -X POST "https://api.firecrawl.dev/v1/extract" \
  -H "Authorization: Bearer ${FIRECRAWL_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "urls": ["https://example.com/pricing"],
    "prompt": "Extract all pricing plans",
    "schema": { ... }
  }'
```

**Autonomous Agent (research):**
```bash
curl -s -X POST "https://api.firecrawl.dev/v1/agent" \
  -H "Authorization: Bearer ${FIRECRAWL_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Find all competitors of [company] and their pricing"}'
```

**Pricing:** Free = 500 credits/mes. Hobby = $16/mes (3K). Standard = $83/mes (100K). Extract is separate ($89+/mes).
**Strengths:** Stealth proxies, AI agent, bypasses many anti-bot systems
**Weaknesses:** Expensive, dual pricing (scrape + extract), credits don't roll over
**Escalate when:** Need platform-specific scraper (LinkedIn, Maps)

### Tier 5 — Apify

Full platform with 10,000+ pre-built Actors. Read the `apify` skill for detailed usage.

**When to use:** LinkedIn profiles/companies, Google Maps/Places, Instagram, TikTok, Amazon, or any platform with heavy anti-bot + login requirements.

**Pricing:** Starter = $29/mes. Proxies extra ($7-8/GB residential).

## Integration with SanchoCMO Skills

This skill supports these workflows:

| Workflow | Typical tier | Notes |
|----------|-------------|-------|
| `competitor-intelligence` — crawl competitor sites | Tier 1-3 | Most competitor sites are standard |
| `company-context` — scrape client website | Tier 1-2 | Usually static enough |
| `deep-research` — multi-source research | Tier 2-3 | Jina for individual, CF for crawl |
| `seo-audit` — crawl client site structure | Tier 3 | Need multi-page + metadata |
| `contact-enrichment` — LinkedIn/social | Tier 5 | Apify Actors |

## Sibling providers (social + SEO)

smart-scrape cubre **páginas web genéricas**. Para datos de plataforma usa los MCP conectados (no reinventes con tiers):

- **scrapecreators MCP** (`mcp__scrapecreators__*`) → social (Instagram, TikTok, LinkedIn, YouTube, Reddit, Twitter/X, Threads, Pinterest), Facebook/Google Ads Library.
- **DataForSEO MCP** (`mcp__dataforseo__*`) → SERP, keywords, rankings, backlinks, on-page, visibilidad LLM.

La selección de provider para una skill de intelligence la gobierna `_system/skills/scraping-preflight.md` (matriz necesidad→provider). smart-scrape es el provider "web" de esa matriz.

## Setup Checklist

Before using Tiers 3-5, ensure API keys are configured:

- [ ] **Jina AI**: Get free API key at `https://jina.ai/reader/` (optional, works without key at lower rate)
- [ ] **Cloudflare**: Create API token at `https://dash.cloudflare.com/` → Workers → Browser Rendering
- [ ] **Firecrawl**: Get API key at `https://firecrawl.dev/`
- [ ] **Apify**: Already configured (see `apify` skill)

Store keys securely — never in chat. Use environment variables or secrets manager.

## Logging

When a scrape succeeds, mentally note which tier worked for that domain. This builds intuition for future requests from the same site. Common patterns:
- News sites, blogs, docs → Tier 1 almost always works
- SaaS marketing pages → Tier 1-2
- React/Angular apps → Tier 2+
- Sites behind Cloudflare protection → Tier 4
- Social platforms → Tier 5
