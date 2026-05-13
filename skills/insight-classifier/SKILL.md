---
name: insight-classifier
description: "Classify research signals into 7 signal types for content ideation. Enriches items from research-signals with signal_type tags to enable diverse idea generation and pattern detection. Optional enricher — if it fails, ideas still work without tags."
context_required:
- brand/{slug}/content/content-pillars.md
context_writes:
- brand/{slug}/content/research-signals/*.json (enriches in place)
---

# Insight Classifier

> Classifies research signal items into 7 signal types to enable diverse
> content ideation. Formerly `content-miner` — renamed for clarity.

## 7 Signal Types

| Type | What it means | Content angle it enables |
|------|--------------|------------------------|
| `aha-moment` | Surprising insight, counterintuitive data | "Did you know..." / eye-opener posts |
| `conflict` | Debate, disagreement, tension in the industry | Hot takes, opinion pieces |
| `contrarian` | Goes against conventional wisdom | "Everyone says X. They're wrong." |
| `system` | Framework, process, methodology | Step-by-step threads, playbooks |
| `milestone` | Achievement, growth metric, before/after | Proof posts, case studies |
| `vulnerability` | Honest failure, lesson learned, transparency | Personal narrative posts |
| `metric` | Data point, benchmark, statistic | Data-driven content |

## Input

Items from `brand/{slug}/content/research-signals/YYYY-MM-DD-{type}.json`.
Each item has at minimum:
- `summary` or `title`
- `source` (where it came from)
- `url` (if applicable)
- `date`

Sources: news-monitor, paa-monitor, thief-marketers, daily-pulse,
meeting-intelligence.

## Process

1. Read all unclassified items (items without `signal_type` field)
2. For each item, analyze the summary/content
3. Assign one or more `signal_type[]` values
4. Optionally detect patterns:
   - 3+ items of same type on same topic this week = trend candidate
   - Mix of conflict + contrarian on same topic = hot debate
5. Write enriched items back to the same file

## Output

Same items, enriched with:
```json
{
  "signal_type": ["contrarian", "conflict"],
  "pattern_flags": ["trending_topic"],
  "classified_at": "2026-04-25T08:00:00Z"
}
```

## Why This Matters

Without tagging, all ideas look the same in the Idea Queue. With tags:
- Calendar can diversify (not all "metrics", not all "aha")
- Day-of-week preferences (Monday value → `system`; Tuesday hot-take → `contrarian`)
- Pattern detection (3 conflict-signals this week = trending opinion piece)

## Rules

- **Non-blocking.** If classification fails, items pass through untagged.
  The rest of the pipeline works without tags.
- **Multiple types allowed.** An item can be both `metric` and `milestone`.
- **Don't invent types.** Only the 7 above. If something doesn't fit, skip it.
- **Batch processing.** Classify all new items in one pass, not one by one.
