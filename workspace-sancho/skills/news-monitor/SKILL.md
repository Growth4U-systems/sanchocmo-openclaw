---
name: news-monitor
description: "Multi-tenant prompt-driven news monitor. Searches for relevant news per content pillar using configured prompts. Runs daily via cron. Outputs research signals that feed the Content Engine idea pipeline."
context_required:
- brand/{slug}/content/configs/news-prompts/*.yml
- brand/{slug}/content/content-pillars.md
context_writes:
- brand/{slug}/content/research-signals/{date}-news.json
---

# News Monitor

> Searches for relevant news and trends per content pillar.
> Runs daily 7am via cron. Multi-tenant: reads prompts from client configs.

## Tool

Primary: **Brave Search API** (`WebSearch`)
Fallback: **Perplexity API** or `WebFetch` to curated RSS feeds.

## Workflow

### 1. Read configs
- Load all `content/configs/news-prompts/*.yml` for this client
- Load `content/content-pillars.md` for pillar context

### 2. Search per pillar
For each pillar config:
- Execute each search prompt (3-6 prompts per pillar)
- Filter by `sector_filters` and `language`
- Exclude sources in `exclude_sources`
- Deduplicate by URL

### 3. Extract signals
For each result, extract:
```json
{
  "id": "news-{date}-{hash}",
  "type": "news",
  "pillar_id": "P1",
  "title": "Article title",
  "summary": "2-3 sentence summary of why this is relevant to the pillar",
  "source": "Publication name",
  "url": "https://...",
  "date": "2026-04-25",
  "relevance_score": 0.85,
  "created_at": "2026-04-25T07:00:00Z"
}
```

### 4. Write output
Append to `content/research-signals/{YYYY-MM-DD}-news.json`.
If file exists (re-run), merge and deduplicate by URL.

## Rules

- **Max 10 signals per pillar per day.** Quality over quantity.
- **Summary must explain WHY it's relevant** to the pillar, not just what the article says.
- **Relevance score**: 0.0-1.0 based on how directly it relates to the pillar's pain_origin + expertise.
- **Skip**: press releases, product launches with no insight, listicles without substance.
- **Language**: respect the `language` config. If `[es, en]`, search in both and keep both.
- **Dedup across days**: if the same story was already in yesterday's signals, skip it.

## Error handling

If Brave Search API fails:
1. Try Perplexity as fallback
2. If both fail, write empty array + log error
3. Never block the pipeline — other crons continue regardless
