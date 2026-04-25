---
name: paa-monitor
description: "People Also Ask monitor. Extracts real questions audiences ask per content pillar. Runs weekly. Separate from keyword-research: PAA finds QUESTIONS for content ideas, keyword-research finds KEYWORDS for SEO targeting."
context_required:
- brand/{slug}/content/configs/paa-queries/*.yml
- brand/{slug}/content/content-pillars.md
context_writes:
- brand/{slug}/content/research-signals/{date}-paa.json
---

# PAA Monitor

> Extracts People Also Ask questions per content pillar.
> Runs weekly (Monday 6am). Questions = content idea source.

## Tool

Primary: **DataforSEO** People Also Ask endpoint.
Fallback: **WebSearch** with "site:google.com" PAA extraction, or manual
`WebFetch` of Google SERP.

## Why separate from keyword-research?

| This skill (paa-monitor) | keyword-research |
|--------------------------|------------------|
| Finds QUESTIONS people ask | Finds KEYWORDS with volume/difficulty |
| Source of content IDEAS | Source of SEO TARGETING |
| "What should I write about?" | "What keyword should I optimize for?" |
| Weekly (questions evolve slowly) | On-demand (when writing blog SEO) |

## Workflow

### 1. Read configs
- Load `content/configs/paa-queries/*.yml` for this client
- Each config has seed queries per pillar

### 2. Query per pillar
For each query in the config:
- Hit DataforSEO PAA endpoint (or fallback)
- Extract all "People Also Ask" questions
- Group by pillar_id

### 3. Extract signals
```json
{
  "id": "paa-{date}-{hash}",
  "type": "paa",
  "pillar_id": "P1",
  "question": "Como crear un sistema de growth para mi startup?",
  "seed_query": "sistema growth startup",
  "search_volume_hint": null,
  "language": "es",
  "created_at": "2026-04-28T06:00:00Z"
}
```

### 4. Write output
Write to `content/research-signals/{YYYY-MM-DD}-paa.json`.
Deduplicate against previous weeks (same question = skip).

## Rules

- **Deduplicate aggressively** — PAA questions repeat week to week. Only add NEW questions.
- **Keep the exact wording** — the value is how REAL people phrase the question.
- **No volume filtering** — that's keyword-research's job. Here we want all questions.
- **Group by pillar** — each question must be assigned to a pillar_id.
- **Max 20 new questions per pillar per week** — cap to avoid noise.

## Error handling

If DataforSEO fails, try WebSearch fallback. If both fail, skip this week
(questions don't change fast — missing one week is OK).
