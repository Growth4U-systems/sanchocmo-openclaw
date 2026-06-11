---
name: atalaya
description: "Watchtower — Competitive intelligence and content inspiration. Monitors competitor channels (Meta Ads, Google Ads, blog, LinkedIn, Instagram, Twitter) and followed profiles to extract full content, identify patterns, and generate adapted content ideas. Weekly cron + manual scan from MC."
context_required:
- brand/{slug}/atalaya/config.json
- brand/{slug}/market-and-us/competitors/competitors-current.md
- brand/{slug}/company-brief/company-brief-current.md
- brand/{slug}/brand-voice/brand-voice-current.md
- brand/{slug}/go-to-market/ecps/ecps-current.md
context_writes:
- brand/{slug}/atalaya/YYYY-MM-DD.json
- brand/{slug}/atalaya/pending-ideas.json
- brand/{slug}/operational/learnings.md
---

# Atalaya — Competitive Intelligence & Content Inspiration

> Monitoriza competidores y perfiles. Extrae contenido completo. Genera ideas adaptadas.

Read ./brand/ per `_system/brand-memory.md`

---

## Core Job

1. Scrape competitor marketing activity across all configured channels
2. Scrape followed profiles (LinkedIn, Twitter, Instagram) for content inspiration
3. Extract FULL content (not summaries) — complete ad copy, full blog posts, entire social posts
4. Compare with previous run to detect NEW content
5. Generate content ideas adapted to OUR brand voice and positioning
6. Detect relevant contacts (authors, collaborators, influencers)

---

## Workflow (7 Steps)

### Step 0: Load Config
- Read `brand/{slug}/atalaya/config.json` for channels_to_monitor, followed_profiles, competitor_overrides
- Read `brand/{slug}/market-and-us/competitors/competitors-current.md` for competitor list
- For each competitor, read individual battle card for URLs and social profiles
- Read `brand/{slug}/brand-voice/brand-voice-current.md` and ECPs for adaptation context

### Step 1: Scrape Competitors (per channel)

For each competitor, scrape configured channels using **Apify actors** (primary) or X API:

| Channel | Tool | What to extract |
|---------|------|----------------|
| Meta Ads Library | **Apify: facebook-ads-library-scraper** | FULL ad copy, headline, CTA, dates, platforms, impressions |
| Google Ads Library | **Apify: web-scraper** on adstransparency.google.com | Headlines, descriptions, formats, dates |
| Blog | **Apify: web-scraper** or web_fetch per post | FULL article text (first 2000 chars), date, title, word count |
| LinkedIn (company) | **Apify: linkedin-posts-scraper** | Full post text, reactions, comments, shares, format |
| Instagram | **Apify: instagram-scraper** | Full caption, type (carousel/reel/image), likes, comments |
| Twitter/X | **X API** or **Apify: twitter-scraper** | Full tweet text, engagement, thread detection |

If an actor fails → log error + continue with next channel/competitor. Never block the entire run.

### Step 2: Scrape Followed Profiles

Separate from competitors — these are thought leaders, influencers, creators followed for inspiration:

- LinkedIn profiles → **Apify: linkedin-posts-scraper** with profile URL
- Twitter handles → **X API** or **Apify: twitter-scraper**
- Instagram handles → **Apify: instagram-scraper**
- Extract last 30 posts with FULL content

### Step 3: Compare with Last Run

- Read most recent JSON from `brand/{slug}/atalaya/` directory
- Compute delta: new content vs previous, removed ads, pricing changes
- Mark each piece with `is_new: true/false`

### Step 4: Generate Report

- Compile ALL scraped content into structured report
- Organized by: competitor → channel → content pieces (with full text)
- Followed profiles in separate section
- Include comparison with last run

### Step 5: Generate Ideas & Detect Contacts

- **Ideas**: For each interesting piece of new content → generate adapted idea:
  - Apply our brand voice
  - Identify the pattern (hook type, format, CTA strategy, content pillar)
  - Assign priority (high/medium/low) based on engagement signals
  - Recommend execution channels
- **Contacts**: People detected (authors, collaborators, influencers mentioned)
- Save to `pending-ideas.json` for review in MC before going to Idea Bank

### Step 6: Save

- `brand/{slug}/atalaya/YYYY-MM-DD.json` (full report — schema: `_system/schemas/atalaya.schema.json`)
- `brand/{slug}/atalaya/pending-ideas.json` (ideas pending approval)
- Update `brand/{slug}/operational/learnings.md` with cross-competitor patterns
- Run `python3 ~/.openclaw/workspace-sancho/scripts/regenerate.py`

### Step 7: Publish

- **Mission Control**: Primary destination. Data in filesystem → MC reads via API. Appears in Activity (tag: atalaya) and Atalaya Overview (pending ideas with badge).
- **Discord**: NOT default. Only if client explicitly configures `publish_channel` in client-config.json.

---

## Ethical Boundaries

- ✅ Analyze public content and strategy patterns
- ✅ Adapt formats and angles to our brand
- ❌ Copy text verbatim
- ❌ Impersonate competitors
- ❌ Access private/gated content without permission

---

## Tools Required

**Primary (Apify MCP Server):**
- `facebook-ads-library-scraper` — Meta Ads
- `web-scraper` — Google Ads Transparency + blogs
- `linkedin-posts-scraper` — LinkedIn company pages + individual profiles
- `instagram-scraper` — Instagram
- `twitter-scraper` — Twitter/X (alternative to X API)

**Alternative:**
- X API — for Twitter, may give better results than scraper

**If Apify not configured:** Report that Apify is required. Do not attempt partial fallback with web_search.

---

## References

| File | Content |
|------|---------|
| `references/apify-actors-guide.md` | Apify actors for each platform |
| `references/workflow.md` | Detailed synthesis framework, output format |
| `references/ad-analysis-patterns.md` | Facebook Ads analysis patterns |
| `references/content-calendar-analysis.md` | Social content extraction patterns |
| `references/platforms-guide.md` | Where to find each type of content |
| `references/integration.md` | Prerequisites, tools, frequency |

---

## Frequency

- **Automatic**: Weekly cron (Wednesday 08:00 Madrid) — configured in recurring tasks
- **Manual**: "Lanzar scan" button in MC Atalaya Overview
- **Compare**: with last run to detect changes
- **Alert**: if competitor launches new campaign or changes pricing

---

## MC Integration

- **Atalaya page** in Mission Control: Overview (scan + ideas), Competidores (channels), Perfiles (CRUD)
- **Chat threads** per tab:
  - Overview → `atalaya:{slug}`
  - Competidores → `{slug}:competitor-analysis` (Foundation thread)
  - Perfiles LinkedIn → `atalaya:linkedin:{slug}`
  - Perfiles Twitter → `atalaya:twitter:{slug}`
  - Perfiles Instagram → `atalaya:instagram:{slug}`
- **Ideas flow**: pending-ideas.json → approve in MC → Idea Bank (ideas.json)
- **Activity**: scans appear with tag `atalaya`, filterable
