---
name: news-monitor
description: "Multi-tenant prompt-driven news monitor. Searches news per content pillar, builds ideas with brand-aligned angles in a single pass, and writes them directly to idea-queue.json. Runs daily via cron."
context_required:
- brand/{slug}/content/configs/news-prompts/*.yml
- brand/{slug}/content/content-pillars.md
- brand/{slug}/content/configs/cadence-config.yml
- brand/{slug}/content/pov-bank.json
context_writes:
- brand/{slug}/content/idea-queue.json
- brand/{slug}/content/research-signals/{date}-news.json
---

# News Monitor

> Searches for relevant news per content pillar AND turns them into actionable
> ideas with brand-aligned angles, in one pass. Runs daily 7am via cron.
>
> **Single-skill flow (no two-step):** the legacy split was
> `news-monitor` → `research-signals` → `idea-builder` → `idea-queue.json`.
> That intermediate layer was never visualized and added a failure point.
> Now `news-monitor` does discover + analyze + write the idea, end-to-end.
> `research-signals/{date}-news.json` is still written but **only as an
> audit log of what the cron found that day** — no other skill reads it.

## Tool

Primary: **Brave Search API** (`WebSearch`)
Fallback: **Perplexity API** or `WebFetch` to curated RSS feeds.

## Workflow

### 1. Read configs
- `content/configs/news-prompts/*.yml` — search prompts per pillar
- `content/content-pillars.md` — pillar definitions
- `content/configs/cadence-config.yml` — channel cadence (linkedin/twitter/blog/newsletter)
- `content/pov-bank.json` — `core_belief`, `we_say_yes_to`, `we_say_no_to`,
  `preferred_angles`, `evidence_we_cite` per pillar (used to build the angle)

### 2. Search per pillar
For each pillar config:
- Execute each search prompt (3-6 prompts per pillar)
- Filter by `sector_filters` and `language`
- Exclude sources in `exclude_sources`
- Deduplicate by URL

### 3. For each result that passes filters

Build a complete idea in one shot:

1. **Classify** the news. Pick `signal_type` from: `milestone`, `aha-moment`,
   `contrarian`, `data-point`, `cautionary-tale`, `framework`, `proof-point`.
   A signal can have multiple types.
2. **Pick target channel** based on cadence + signal type:
   - hard data + framework → `blog` or `newsletter`
   - conflict / contrarian → `linkedin` or `twitter`
   - personal story → `linkedin`
3. **Pick `content_type`**: `Hot Take`, `Proof Post`, `Framework`,
   `Personal Story`, or `Listicle`.
4. **Score `pov_confidence`** (0.0–1.0):
   - +0.2 if signal cites concrete data/quote
   - +0.2 if source is in `evidence_we_cite` of the pillar
   - +0.15 if signal is recent (≤7 days)
   - +0.15 if `core_belief` aligns directly
   - −0.2 if speculative or weak evidence
5. **Write `angle_draft`** — the brand POV on this signal, **60–80 words**:
   - State the position taken from `pov_belief` or `preferred_angles`
   - Reference data from the article when useful
   - End with a `Frame: '...'` tag (the angle name from `pov-bank`)
   - Do NOT prefix with "Nuestro POV:" — the UI adds the header
6. **Write `title`** — one-line scannable title, 40–90 chars, no "Nuestro POV:" prefix.

### 4. Schema (one idea per news result)

#### 4.0 CRITICAL — File contract for `idea-queue.json`

> **Read this before you write a single byte. Violating this section has wiped 100+ ideas in past runs.**

- **Shape is a bare JSON array `[...]`.** Never `{ "ideas": [...] }`. Never `{ ... }`. The dashboard reads `idea-queue.json` directly and crashes if it sees an object at the top level.
- **You APPEND. You do NOT overwrite.** The existing array contains all ideas ever produced for this brand (often 100+). Your output is a small set of new ideas merged INTO that array. The final file must contain `existing_ideas + your_new_ideas`.
- **If you cannot parse the existing file as an array, STOP and write nothing.** Do not "fix" it by writing a fresh array. Log the failure to `recurring-tasks/content-news-monitor/{date}.json` with `status: "error"` and exit. Overwriting a malformed queue is worse than skipping the run — a wrong write destroys real ideas.
- **Concretely, the write is this sequence (pseudocode):**
  ```
  existing = json.load("content/idea-queue.json")
  assert isinstance(existing, list)        # abort run if not an array
  new_ideas = [ ... ]                       # what you built this run
  for idea in new_ideas:
      assert idea["id"] not in {e["id"] for e in existing}   # no id collisions
  json.dump(existing + new_ideas, "content/idea-queue.json", indent=2)
  ```
- **Verify after writing.** Re-read the file and assert `isinstance(parsed, list) and len(parsed) >= len(existing) + len(new_ideas)`. If the assertion fails, restore from the pre-write copy and log `status: "error"`. **Do this verification in Python (re-read + assert) — do NOT eyeball the queue with an ad-hoc `jq` one-liner.** A failed shell/tool command marks the *entire* cron run as `error` in Mission Control even when the ideas were written correctly. If you do reach for `jq`, mind operator precedence: `jq 'length, .[-8:] | map(...)'` pipes the *number* from `length` into `map` and dies with `Cannot iterate over number`; the correct form is `jq 'length, (.[-8:] | map(...))'`.

Append to `content/idea-queue.json` following the contract above. **Before assigning `{n}`**, read the existing
file and find the highest `{n}` already used for today's date prefix
(`idea-{YYYY-MM-DD}-`). Start your numbering at `max + 1` so a second cron run on
the same day does not collide with earlier ideas. If no idea for today exists yet,
start at `1`.

```json
{
  "id": "idea-{YYYY-MM-DD}-{n}",
  "title": "<40-90 char scannable title>",
  "pillar_id": "P3",
  "content_type": "Hot Take",
  "target_channel": "linkedin",
  "signal": {
    "summary": "<FACTUAL summary of what the article reports — data, quotes, findings. 2-3 sentences. NEVER truncate, NEVER add '...'. NO interpretation, NO mention of own brand/client (e.g. {brand}, P{N}, ICPs, internal product names).>",
    "source": "<publication name>",
    "url": "<article url>",
    "date": "<article date YYYY-MM-DD>"
  },
  "signal_type": ["contrarian", "data-point"],
  "angle_draft": "<60-80 word POV paragraph — brand interpretation goes HERE, not in summary. Without 'Nuestro POV:' prefix.>",
  "pov_confidence": 0.85,
  "source_signals": ["news-{YYYY-MM-DD}-{hash}"],
  "created_at": "<now ISO>",
  "status": "New"
}
```

### 5. Audit log (research-signals)

Also append to `content/research-signals/{YYYY-MM-DD}-news.json` with the
raw signal record (id, type, pillar_id, title, summary, source, url, date,
relevance_score, created_at). This is **only for debugging/history** —
no other skill reads it. Cite this id in `idea.source_signals` so the idea
traces back to the cron run.

## Rules

- **Max 10 ideas per pillar per day.** Quality over quantity.
- **`signal.summary` is FACTUAL only.** What the article reports — data,
  quotes, findings. NEVER truncate. NEVER add `...`. NEVER mention the
  own brand/client name. NEVER write "Para {brand}, esto valida...",
  "munición directa para P{N}", or similar interpretive phrases.
  Brand interpretation belongs in `angle_draft`, not here.
- **`angle_draft` is the place for POV.** That's where the brand voice,
  pillar mapping, and `pov-bank` references live.
- **Relevance threshold**: only build an idea if the news clearly hits
  one of the pillars and `pov_confidence ≥ 0.5`. Otherwise skip.
- **Skip**: press releases, product launches with no insight, listicles
  without substance, generic "best practices" articles.
- **Language**: respect the `language` config. If `[es, en]`, search in
  both and keep both.
- **Dedup across days**: if the same URL was already in yesterday's
  ideas (check by URL match), skip it.
- **status is always `"New"`** for fresh ideas. The user approves later
  via UI/Slack/Discord, which moves it to `"Approved"` and triggers the
  draft-generation pipeline.

## Error handling

If Brave Search API fails:
1. Try Perplexity as fallback
2. If both fail, write empty `[]` to the audit log and skip the
   `idea-queue.json` write for this run
3. Never block the pipeline — other crons continue regardless
