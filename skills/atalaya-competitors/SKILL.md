---
name: atalaya-competitors
description: "Scan competitors across all channels (Meta Ads, Google Ads, blog, LinkedIn, Instagram, Twitter). Extract full content, identify patterns, generate adapted content ideas."
context_required:
- brand/{slug}/market-and-us/competitors/sources.json
- brand/{slug}/market-and-us/competitors/competitors.current.md
- brand/{slug}/brand-book/brand-voice/brand-voice.current.md
- brand/{slug}/go-to-market/ecps/ecps.current.md
context_writes:
- brand/{slug}/atalaya/competitors-scan/YYYY-MM-DD.json
- brand/{slug}/ideas.json
- brand/{slug}/recommendations.json
- brand/{slug}/operational/learnings.md
---

# Atalaya — Competitor Scan

> Scrapea competidores en todos sus canales. Extrae contenido COMPLETO. Genera ideas adaptadas.

## Workflow

### 1. Load Competitors
Read `brand/{slug}/market-and-us/competitors/sources.json` for the full list with URLs and social profiles.
Read `brand/{slug}/brand-book/brand-voice/brand-voice.current.md` and ECPs for idea adaptation.

### 2. Scrape Each Competitor

For each competitor in sources.json (direct + indirect + emerging), scrape available channels:

| Channel | Tool | Extract |
|---------|------|---------|
| Web/Blog | web_fetch on company URL + /blog | Full article text (2000 chars), title, date |
| LinkedIn | Apify: linkedin-posts-scraper | Full post text, reactions, comments, shares, format |
| Twitter/X | Apify: twitter-scraper or X API | Full tweet, engagement, threads |
| Instagram | Apify: instagram-scraper | Full caption, type, likes, comments |
| Meta Ads | Apify: facebook-ads-library-scraper | Full ad copy, headline, CTA, dates |
| Google Ads | Apify: web-scraper on adstransparency.google.com | Headlines, descriptions |

If a channel fails, log error and continue. Never block the entire run.

### 3. Compare with Last Run
Read most recent `brand/{slug}/atalaya/competitors-scan/YYYY-MM-DD.json`. Mark new content with `is_new: true`.

### 4. Generate Ideas
For each interesting new piece of content:
- Identify the pattern (hook, format, CTA, content pillar)
- Generate adapted idea in our brand voice
- Assign priority (high/medium/low)
- Recommend channels

### 5. Save
- `brand/{slug}/atalaya/competitors-scan/YYYY-MM-DD.json` — full report
- `brand/{slug}/ideas.json
- brand/{slug}/recommendations.json` — ideas pending approval
- Update `brand/{slug}/operational/learnings.md` with patterns

### 6. Report
Present results in chat: how many competitors scraped, new content found, top ideas generated.
