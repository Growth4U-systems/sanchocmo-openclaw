---
name: niche-discovery-100x
description: "End-to-end niche discovery from real forum conversations. Mines Reddit, thematic forums, and community sites for customer pain points via automated pipeline (Serper + Firecrawl + LLM extraction), then validates with Triple Filter (SWOT + ICP + Product) and scores each niche with Deep Research. Use when: identifying target customer niches, validating niches, discovering customer segments, building an ICP, or answering 'who should I sell to'. Triggers on: find niches, discover market, ICP, target audience, customer segments, market research, niche discovery, buscador de nichos, who are my customers, validate this niche, market opportunity. Pipeline: Strategy → SERP → Scrape → Extract → Group → Quality Filter → Triple Filter → User Review → Score → Consolidate. Requires Foundation pillars: company-context, self-intelligence, competitor-intelligence, swot-analysis."
---

# ICP & 100x Niche Discovery v3

> Mine thousands of real forum conversations for pain points, validate against Foundation data, score each niche with Deep Research.

**Depends on**: company-context, self-intelligence, competitor-intelligence, swot-analysis
**Produces**: `brand/{slug}/niche-discovery/current.md` + `final-table.csv`

## Pipeline

```
INTAKE → STRATEGY → SERP → SCRAPE → EXTRACT → GROUP → QUALITY FILTER → TRIPLE FILTER → REVIEW → SCORE → CONSOLIDATE
```

| Phase | What | Cost |
|-------|------|------|
| 1. Intake | Read Foundation context | $0 |
| 2. Strategy | Generate search grid + user approval | ~$0.50 |
| 3. SERP | Search forums (Serper.dev) | ~$7 |
| 4. Scrape | Extract content (Firecrawl + Reddit JSON) | ~$1.50 |
| 5. Extract | Pain points per doc (Gemini 3.1 Pro) | ~$12 |
| 6. Group | Chunk + merge into niches (Sonnet + Opus) | ~$10 |
| 7. Quality Filter | Filter generic/small/irrelevant (Opus) | ~$4 |
| 7b. Triple Filter | Validate vs SWOT + ICP + Product (agent) | $0 |
| 8. User Review | User confirms niches | $0 |
| 9. Score | Deep Research per niche | ~$5-10 |
| 10. Consolidate | Final scored table + CSV (Opus) | ~$2 |
| **Total** | | **~$40-50** |

## Required API Keys (env vars)

`SERPER_API_KEY`, `FIRECRAWL_API_KEY`, `OPENROUTER_API_KEY`

## Global Rules

1. **Save every output as a file** — see [schema.md](references/schema.md) for file structure and column definitions
2. **Checkpoint before every phase (3-10)**: show params (model, time, cost, items), ask user approval, only execute after explicit "ok"

## Script Commands

All bash commands with exact parameters: **read [commands.md](references/commands.md)**

---

## Phase 1: Intake (Foundation Context)

Auto-read from Foundation — do NOT ask what we already have.

1. Identify client slug from systemPrompt
2. Read: `brand/{slug}/company-context/current.md`, `self-intelligence/current.md`, `competitor-intelligence/current.md`, `swot-analysis/current.md`, `existing-customer-data/current.md` (if exists)
3. Extract: company_name, product, industry, target, country, context_type (B2B/B2C/Both)
4. If critical pillar missing → inform user, suggest completing Foundation first

## Phase 2: Strategy Generation

Generate search strategy using Foundation context:
- **10-15 life context words** — semi-permanent situations (B2C: bebé, mudanza; B2B: autónomo, startup)
- **8-12 product domain words** — concrete nouns (NOT adjectives like "eficiencia")
- **Forum sources** — read [thematic-forums.md](references/thematic-forums.md) for country/topic mapping

### Phase 2b: User Approval (MANDATORY)

Present strategy in 3 sections (life contexts, product words, forum sources). User can modify, add forums via deep research, or approve. **Only proceed after explicit approval.** Save as `config.json`.

## Phase 3: SERP Search

Run `serp_search.py` — see [commands.md](references/commands.md). Searches `site:forum "context" "word"` for all combinations. Output: deduplicated `urls.json`.

## Phase 4: Scrape URLs

Run `scrape_urls.py` — see [commands.md](references/commands.md). Firecrawl for regular sites, Reddit JSON API for reddit.com. Output: `docs/` folder with markdown files.

## Phase 5: Extract Problems

Run `extract_problems.py` — see [commands.md](references/commands.md). Parallel extraction with Gemini 3.1 Pro (matches Opus quality at 1/6th cost). Output: `problems.md`.

## Phase 6: Group into Niches (Chunked)

Handles volume beyond Opus 32K output token cap. Read [prompts-phase6a-chunk.md](references/prompts-phase6a-chunk.md) and [prompts-phase6b-merge.md](references/prompts-phase6b-merge.md).

1. **6a**: Split problems into 5 chunks → process each with Sonnet 4 (~40-80 niches per chunk)
2. **6b**: Merge all chunks with Opus → deduplicate (max 35-40 niches per call)
3. **6c**: If merge truncated (`finish_reason: length`) → supplement pass for missed niches

Output: `niches-raw/merged.md`

## Phase 7: Quality Filter

Apply 5 generic filter criteria using [prompts-phase7-quality-filter.md](references/prompts-phase7-quality-filter.md):

1. **TOO GENERIC** — broad complaint, no specific business segment
2. **TOO SMALL** — minimal transaction volume
3. **NOT PRODUCT-RELEVANT** — outside product domain
4. **CONSUMER PROBLEM** — personal, not business
5. **DUPLICATE SEGMENT** — same business type as another niche

Key principle: **Niche = WHO** (business segment), not WHAT (problem). Expected: 30-40% filtered. Output: `niches-filtered.md`.

## Phase 7b: Triple Filter (Foundation Validation)

Validates against real Foundation data. Read [prompts-phase7b-triple.md](references/prompts-phase7b-triple.md) and [concepts.md](references/concepts.md) for detailed filter rules.

For each niche (Valid=TRUE), evaluate against Foundation files:

| Filter | Reads | Evaluates |
|--------|-------|-----------|
| SWOT | swot-analysis/current.md | Alignment with Strengths, exploits competitor Weaknesses? |
| ICP | existing-customer-data/current.md | Can we REACH this persona? Long-term fit? |
| Product | self-intelligence/current.md | Can we SOLVE this TODAY? Better than alternatives? |

Each scored PASS / PARTIAL / FAIL. All 3 must be PASS or PARTIAL to proceed. Output: `niches-triple.md`.

## Phase 8: User Review (MANDATORY)

Present triple-filtered table. User can: remove niches, add niches, modify descriptions. Only Valid=TRUE niches proceed to scoring. **Save as `niches-confirmed.md` after explicit approval.**

## Phase 9: Scoring (Deep Research)

Invoke `deep-research` skill for EACH confirmed niche. Read [prompts-phase9-scoring.md](references/prompts-phase9-scoring.md) for framework.

Per niche:
- **Pain Intensity (2-99)**: JTBD — economic loss, opportunity cost, time loss, cognitive load, frequency
- **Market Size**: SAM estimate (INE, Eurostat, Statista). Top-down + bottom-up. Confidence level.
- **Reachability (2-99)**: Communities, creators, keywords, competition/CAC, specific channels

Output: `scored.md` (append format, one section per niche).

## Phase 10: Consolidate

Run `llm_step.py` with [prompts-phase10-consolidate.md](references/prompts-phase10-consolidate.md) — see [commands.md](references/commands.md). Merges confirmed niches + scores into final 23-column table. Export CSV with `export_csv.py`.

Output: `current.md` + `final-table.csv`. See [schema.md](references/schema.md) for full column spec.

---

## Partial Runs

| Situation | Start At |
|-----------|----------|
| Have forum data | Phase 5 — put docs in `docs/` |
| Have pain points | Phase 6 — format as `problems.md` |
| Have grouped niches | Phase 7 — format as `niches-raw/merged.md` |
| Score these niches | Phase 8 → 9 |
| Validate one niche | Phase 9 — single niche in `niches-confirmed.md` |

## After Delivery

Offer: *"¿Quieres profundizar en algún nicho? → deep-research [nombre]"*

## Self-QA (OBLIGATORIO)

Read [checklist.md](references/checklist.md). Check every item. No delivery with pending ❌. Add: `<!-- Self-QA: PASS | fecha | items: X✅ Y⚠️ 0❌ -->`

## Almacenamiento

Standard versioning in `brand/{slug}/niche-discovery/`: `current.md` + `v{N}.md` + `history.json` + `qa-log.md`. Link: `https://sancho-cmo.taild48df2.ts.net/mc/docs/brand/{slug}/niche-discovery/current.md`
