---
name: thief-marketers
description: "Monitor competitors AND reference creators for top-performing content. Extracts 'what's working for others' as research signals for the Content Engine. Reads TWO configs: competitors (business rivals) and reference-creators (inspirational voices). Outputs research signals, not full briefs."
context_required:
- brand/{slug}/content/configs/competitors/*.yml
- brand/{slug}/content/configs/reference-creators/*.yml
- brand/{slug}/content/content-pillars.md
- brand/{slug}/brand-book/brand-voice/brand-voice.current.md
context_writes:
- brand/{slug}/content/research-signals/{date}-creators.json
---

# Thief Marketers — Competitor & Creator Content Monitor

> "Steal like an artist." Monitor what works for competitors and
> reference creators. Extract signals, not content.

## Two sources, one output

| Source | Config file | What we extract | Why |
|--------|-----------|----------------|-----|
| **Competitors** | `content/configs/competitors/*.yml` | Their top-performing content | Know what the market responds to |
| **Reference Creators** | `content/configs/reference-creators/*.yml` | Their best content | Learn from the best voices in the space |

**Competitors** are business rivals (Snowball, Product Hackers, etc.)
**Reference Creators** are inspirational voices (Elena Verna, Lenny, Hormozi, etc.)
Different relationship, same extraction process.

## Workflow

### 1. Load configs
- Read `content/configs/competitors/*.yml` — list of competitors with platform URLs
- Read `content/configs/reference-creators/*.yml` — list of creators with platform handles
- Read `content/content-pillars.md` — for pillar matching

### 2. For each competitor/creator, per platform

**LinkedIn:**
- Tool: LinkedIn scraper (Phantombuster, Bright Data) or `WebFetch` of public profile
- Extract: last 7 days posts, engagement metrics (likes, comments, shares)
- Select: top 5 by engagement

**X/Twitter:**
- Tool: X API or scraper
- Extract: last 7 days tweets/threads, engagement
- Select: top 5 by engagement

**Blog/Newsletter:**
- Tool: RSS feed parser or `WebFetch`
- Extract: recent articles, shares count if available
- Select: top 3 recent

**Instagram:**
- Tool: Graph API or scraper (TBD V2)
- Extract: last 7 days posts/reels, engagement
- Select: top 5

### 3. For each top content piece, extract signal

```json
{
  "id": "creators-{date}-{hash}",
  "type": "creator",
  "pillar_id": "P1",
  "title": "Post title or first line",
  "summary": "What the post is about and WHY it performed well (2-3 sentences)",
  "source": "Elena Verna",
  "source_type": "reference-creator",
  "platform": "linkedin",
  "url": "https://linkedin.com/posts/...",
  "engagement": {
    "likes": 342,
    "comments": 47,
    "shares": 23
  },
  "date": "2026-04-24",
  "why_it_worked": "Contrarian take on PLG with real data from her advisory portfolio. Hook was provocative ('PLG is dead for 95% of companies').",
  "angle_for_us": "We could respond with our Trust Engine data — growth systems work for the 95% PLG doesn't serve.",
  "created_at": "2026-04-25T07:00:00Z"
}
```

### 4. Match to pillars
Each signal must be assigned a `pillar_id` based on topic relevance.
If it doesn't match any pillar, skip it (not relevant to our content strategy).

### 5. Write output
Write to `brand/{slug}/content/research-signals/{YYYY-MM-DD}-creators.json`.

## Rules

- **Extract the WHY, not just the WHAT.** "This post got 342 likes" is useless.
  "This post got 342 likes because the hook was contrarian + data-backed" is useful.
- **Always include `angle_for_us`** — how could WE use this signal?
- **Max 15 signals per day** — curate, don't dump.
- **Distinguish competitor vs reference-creator** in `source_type` — the relationship matters for tone (competitors: respond/counter; creators: learn/adapt).
- **Respect rate limits** — don't scrape too aggressively.
- **Dedup across days** — if the same post was already captured yesterday, skip.

## Tool availability

Some platforms require paid tools (Phantombuster, Bright Data). If not available:
- LinkedIn: `WebFetch` public profiles (limited but functional)
- X: `WebSearch` "site:x.com {handle}" (basic)
- Blog: RSS always works
- Instagram: skip if no API access (add in V2)

Never block the pipeline because a tool is unavailable. Partial data > no data.

## Frequency

Daily 7am (same time as news-monitor and daily-pulse — runs in parallel).

## Related Skills

- `atalaya-competitors` — full competitive scan (deeper, less frequent). This skill is the DAILY lightweight version focused on content signals.
- `news-monitor` — monitors news/publications (external). This skill monitors people/companies (social).
- `insight-classifier` — classifies the signals this skill produces.
