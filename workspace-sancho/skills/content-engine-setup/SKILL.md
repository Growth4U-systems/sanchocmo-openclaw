---
name: content-engine-setup
description: "Populates Content Engine config files with client-specific data. The infrastructure (folders, YAML templates, cron jobs) already exists — this skill only FILLS IN the client-editable fields. Reads content-pillars.md + Foundation to derive values. Does NOT create structure."
context_required:
- brand/{slug}/content/content-pillars.md
- brand/{slug}/company-brief/company-brief.current.md
- brand/{slug}/go-to-market/ecps/ecps.current.md
- brand/{slug}/market-and-us/competitors/sources.json
- brand/{slug}/brand-book/brand-voice/brand-voice.current.md
context_writes:
- brand/{slug}/content/configs/news-prompts/*.yml
- brand/{slug}/content/configs/paa-queries/*.yml
- brand/{slug}/content/configs/keywords-seed/*.yml
- brand/{slug}/content/configs/competitors/all-pillars.yml
- brand/{slug}/content/configs/reference-creators/all-pillars.yml
- brand/{slug}/content/configs/cadence-config.yml
---

# Content Engine Setup — Populate Configs

> The infrastructure is ALREADY created by `scripts/content-engine-setup.js`.
> This skill only FILLS IN the client-specific data.
> It does NOT create folders, files, or cron jobs.

## What already exists (DO NOT recreate)

```
brand/{slug}/content/
├── configs/
│   ├── news-prompts/P1.yml ... P5.yml    ← FILL these
│   ├── paa-queries/P1.yml ... P5.yml     ← FILL these
│   ├── keywords-seed/P1.yml ... P5.yml   ← FILL these
│   ├── competitors/all-pillars.yml       ← FILL this
│   ├── reference-creators/all-pillars.yml ← FILL this
│   └── cadence-config.yml                ← FILL this
├── content-pillars.md                    ← READ this (input)
├── idea-queue.json                       ← DO NOT touch
└── clarify-history.json                  ← DO NOT touch
```

## Workflow

### 1. Read inputs

- `content-pillars.md` — the 3-5 pillars with names, pain_origin, expertise, related_topics
- `company-brief` — sector, business model
- `ecps` — ICP clusters (for audience context)
- `competitors/sources.json` — competitor list with URLs + social profiles
- `brand-voice` — tone (for content type decisions)

### 2. For EACH pillar, populate per-pillar configs

#### news-prompts/{pillar_id}.yml
ONLY modify these fields:
- `pillar_name`: from content-pillars.md
- `prompts`: 4-6 WebSearch queries relevant to this pillar's topics
- `sector_filters`: 2-3 sector terms from company-brief
- `language`: [es, en] (or client-specific)

DO NOT modify: `pillar_id`, structure, comments.

#### paa-queries/{pillar_id}.yml
ONLY modify:
- `pillar_name`: from content-pillars.md
- `queries`: 5-8 seed queries that real people would ask about this pillar

#### keywords-seed/{pillar_id}.yml
ONLY modify:
- `pillar_name`: from content-pillars.md
- `keywords_seed`: 5-8 keywords for SEO targeting. BOFU-first ordering.
- `language`: [es, en]

### 3. Populate competitors config

Read `competitors/sources.json` from Foundation.
Write to `configs/competitors/all-pillars.yml`:

ONLY modify:
- `competitors.direct[]`: name, slug, tier, web, linkedin_company, founder (from sources.json)
- `competitors.indirect[]`: name, slug (from sources.json)
- `pillars_relevant`: assign each competitor to 1-3 pillars based on their positioning

DO NOT modify: structure, monitoring section.

### 4. Populate reference-creators config

WebSearch for thought leaders in the client's sector.
Write to `configs/reference-creators/all-pillars.yml`:

For each creator:
- `name`: full name
- `platforms`: { linkedin, newsletter, blog, twitter, youtube } — URLs
- `focus`: 1-line description of their content focus
- `pillars_relevant`: which pillars they're relevant to

Target: 8-12 creators.

### 5. Populate cadence config

Workshop with human. Ask:
1. What channels are active? (LinkedIn, X, Blog, Newsletter, Instagram, TikTok)
2. How many posts per week per channel?
3. Who are the publishing profiles? (names + handles)
4. What are the best posting times?
5. What content types per channel?
6. What's gated vs ungated?

Write to `configs/cadence-config.yml`.

ONLY modify:
- `channels.*`: active, frequency, best_days, best_times, profiles, gating, content_types

DO NOT modify: `client_id`, `business_model`, `batch_workflow`, `rules`.

### 6. Confirm with human

Present a summary of ALL populated configs.
Human reviews in the MC UI (tab "Inputs").
Each config is editable via the visual forms.

## Rules

- **NEVER create files** — they already exist. Only write to existing paths.
- **NEVER modify structure** — keep the YAML keys as they are. Only change values.
- **Ask the human** for cadence decisions — don't assume posting frequency.
- **Use Foundation data** for competitors and sector — don't invent.
- **BOFU-first** for keywords — decision stage keywords before awareness.
