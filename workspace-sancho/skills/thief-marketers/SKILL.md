---
name: thief-marketers
description: "Monitor competitors AND reference creators for top-performing content. Builds ideas with brand-aligned angles in a single pass and writes them directly to idea-queue.json. Reads two configs: competitors (rivals) and reference-creators (inspirational voices). Runs daily via cron."
context_required:
- brand/{slug}/content/configs/competitors/*.yml
- brand/{slug}/content/configs/reference-creators/*.yml
- brand/{slug}/content/content-pillars.md
- brand/{slug}/content/configs/cadence-config.yml
- brand/{slug}/content/pov-bank.json
- brand/{slug}/brand-book/brand-voice/brand-voice.current.md
context_writes:
- brand/{slug}/content/idea-queue.json
- brand/{slug}/content/research-signals/{date}-creators.json
---

# Thief Marketers — Competitor & Creator Content Monitor

> "Steal like an artist." Monitor what works for competitors and reference
> creators, then turn each high-performing piece into an idea with a
> brand-aligned angle in one pass.
>
> **Single-skill flow (no two-step):** previously this skill wrote raw
> signals to `research-signals/{date}-creators.json` and `idea-builder`
> turned them into ideas. That intermediate layer was never visualized
> and added a failure point. Now this skill discovers + analyzes + writes
> the idea end-to-end. The `research-signals` file is still written but
> only as an audit log — no other skill reads it.

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
- `content/configs/competitors/*.yml` — competitors with platform URLs
- `content/configs/reference-creators/*.yml` — creators with platform handles
- `content/content-pillars.md` — for pillar matching
- `content/configs/cadence-config.yml` — channel cadence
- `content/pov-bank.json` — `core_belief`, `we_say_yes_to`, `we_say_no_to`,
  `preferred_angles`, `evidence_we_cite` per pillar (used to build the angle)

### 2. For each competitor/creator, per platform

**LinkedIn:** scraper (Phantombuster / Bright Data) or `WebFetch` of public profile. Last 7 days posts, top 5 by engagement.
**X/Twitter:** X API or scraper. Last 7 days tweets/threads, top 5 by engagement.
**Blog/Newsletter:** RSS feed or `WebFetch`. Top 3 recent.
**Instagram:** Graph API or scraper (TBD V2). Top 5 last 7 days.

### 3. For each top piece that passes filters

Build a complete idea in one shot:

1. **Match to a pillar** — if it doesn't match, skip it.
2. **Pick `signal_type`** from: `milestone`, `aha-moment`, `contrarian`,
   `data-point`, `cautionary-tale`, `framework`, `proof-point`. A piece
   can have multiple types.
3. **Pick target channel** based on cadence + signal type.
4. **Pick `content_type`**: `Hot Take`, `Proof Post`, `Framework`,
   `Personal Story`, or `Listicle`.
5. **Score `pov_confidence`** (0.0–1.0):
   - +0.2 if cites concrete data/quote
   - +0.2 if author is in `evidence_we_cite` of the pillar
   - +0.15 if posted ≤7 days ago
   - +0.15 if `core_belief` aligns directly
   - −0.2 if speculative or weak evidence
6. **Write `angle_draft`** — the brand POV, **60–80 words**:
   - State the position from `core_belief` or `preferred_angles`
   - Reference data/numbers from the post when useful
   - End with a `Frame: '...'` tag
   - Do NOT prefix with "Nuestro POV:"
7. **Write `title`** — 40–90 chars scannable title.

### 4. Schema (one idea per top piece)

Append to `content/idea-queue.json`. **Before assigning `{n}`**, read the existing
file and find the highest `{n}` already used for today's date prefix
(`idea-{YYYY-MM-DD}-`). Start your numbering at `max + 1` so a second cron run on
the same day does not collide with earlier ideas. If no idea for today exists yet,
start at `1`.

```json
{
  "id": "idea-{YYYY-MM-DD}-{n}",
  "title": "<40-90 char scannable title>",
  "pillar_id": "P1",
  "content_type": "Hot Take",
  "target_channel": "linkedin",
  "signal": {
    "summary": "<FACTUAL summary of WHAT the post says — claims, data, quotes. 2-3 sentences. NEVER truncate, NEVER add '...'. NO interpretation, NO mention of own brand/client. Why-it-worked / what-WE-do-with-it goes in `angle_draft`, NOT here.>",
    "source": "<author name, e.g. 'Elena Verna'>",
    "source_type": "reference-creator",
    "platform": "linkedin",
    "url": "<post url>",
    "engagement": { "likes": 342, "comments": 47, "shares": 23 },
    "date": "<post date YYYY-MM-DD>"
  },
  "signal_type": ["contrarian", "data-point"],
  "angle_draft": "<60-80 word POV paragraph — brand interpretation, why-it-matters, and how WE respond go HERE.>",
  "pov_confidence": 0.85,
  "source_signals": ["creators-{YYYY-MM-DD}-{hash}"],
  "created_at": "<now ISO>",
  "status": "New"
}
```

### 5. Audit log (research-signals)

Also append the raw signal record to
`content/research-signals/{YYYY-MM-DD}-creators.json` (id, type,
pillar_id, title, factual summary, source, platform, url, engagement,
date, created_at). Audit only — no other skill reads it. Cite the id
in `idea.source_signals`.

## Rules

- **`signal.summary` is FACTUAL only.** What the post claims/shows —
  data, quotes, framework name. NEVER truncate. NEVER add `...`.
  NEVER mention the own brand/client. NEVER write "we could respond
  with…" or "for {brand} this means…". That goes in `angle_draft`.
- **`angle_draft` is the place for POV** — why it matters, how we
  respond, what frame we use, which pillar's `core_belief` it backs.
- **Match to a pillar.** If it doesn't fit any pillar, skip the post.
- **Max 15 ideas per day** total across competitors + creators. Curate.
- **Distinguish source_type** (`competitor` vs `reference-creator`) —
  competitor signals → counter/contrast tone; creator signals →
  learn/adapt tone.
- **Respect rate limits** — don't scrape aggressively.
- **Dedup across days** — if the same URL was already in yesterday's
  ideas, skip.
- **status is always `"New"`** for fresh ideas.

## Tool availability

Some platforms require paid tools. If not available:
- LinkedIn: `WebFetch` public profiles (limited but functional)
- X: `WebSearch` "site:x.com {handle}" (basic)
- Blog: RSS always works
- Instagram: skip if no API access (V2)

Never block the pipeline because a tool is unavailable. Partial data > no data.

## Frequency

Daily 7am (same time as news-monitor — runs in parallel, both write to
the same `idea-queue.json`).

## Related skills

- `atalaya-competitors` — full competitive scan (deeper, less frequent). This is the DAILY lightweight version focused on content signals.
- `news-monitor` — monitors news/publications. This skill monitors people/companies on social.
- `idea-builder` — DEPRECATED. The combine-signals-into-ideas job is now done inline by this skill (and by `news-monitor`).
