---
name: buscador-de-nichos-v2
description: "End-to-end niche discovery from real forum conversations. Mines Reddit, thematic forums, and community sites for customer pain points, then validates and scores each niche. Use when someone needs to find target markets, validate niches, discover customer segments, build an ICP, or answer 'who should I sell to'. Triggers on: find niches, discover market, ICP, target audience, customer segments, market research, niche discovery, who are my customers, find my customers, validate this niche, market opportunity, buscador de nichos."
---

# Buscador de Nichos v2

Discover profitable customer niches by mining thousands of real forum conversations for pain points, then scoring each niche for viability.

## Pipeline Overview

```
INTAKE → STRATEGY → SEARCH → SCRAPE → EXTRACT → CLEAN → SCORE → CONSOLIDATE
```

| Phase | Script | What It Does | API Required |
|-------|--------|-------------|--------------|
| 1. Strategy | (inline LLM call) | Generate search grid | OpenRouter |
| 2. SERP Search | `scripts/serp_search.py` | Search forums | Serper.dev |
| 3. Scrape | `scripts/scrape_urls.py` | Extract content | Firecrawl |
| 4. Extract | `scripts/extract_problems.py` | Find pain points | OpenRouter |
| 5. Clean & Filter | `scripts/llm_step.py` | Validate to 30-50 niches | OpenRouter |
| 6. Score | `scripts/llm_step.py` | Pain, Market Size, Reachability | OpenRouter |
| 7. Consolidate | `scripts/llm_step.py` | Final scored table | OpenRouter |

## Required API Keys

Set as environment variables before running:
- `SERPER_API_KEY` — from serper.dev (SERP searches)
- `FIRECRAWL_API_KEY` — from firecrawl.dev (web scraping)
- `OPENROUTER_API_KEY` — from openrouter.ai (LLM calls)

## Phase 1: Intake & Strategy

Collect from user:
- **company_name**: Company name
- **product**: What the product/service does (1-2 sentences)
- **industry**: Sector (e.g., "fintech", "HR tech")
- **target**: Target audience (e.g., "freelancers in Spain")
- **country**: Market country (e.g., "España")
- **context_type**: "B2B", "B2C", or "B2B y B2C"

Then generate the search strategy via LLM. Ask the LLM to produce:
- **10-15 life context words** — Semi-permanent situations (B2C: bebé, mudanza, jubilación; B2B: autónomo, startup, PYME)
- **8-12 product domain words** — Concrete nouns the product operates on (NOT adjectives like "eficiencia")
- **Forum sources** — Thematic + general forums + Reddit subreddits

See [references/thematic-forums.md](references/thematic-forums.md) for forum mapping by country and topic.

Save strategy as `config.json`:
```json
{
  "life_contexts": ["autónomo", "startup", "pyme"],
  "product_words": ["factura", "pagos", "cobros"],
  "sources": {
    "reddit_subreddits": ["r/spain", "r/autonomos"],
    "thematic_forums": ["rankia.com", "infoautonomos.com"],
    "general_forums": ["forocoches.com", "burbuja.info"]
  },
  "country": "es"
}
```

## Phase 2: SERP Search

```bash
python3 {baseDir}/scripts/serp_search.py \
  --config config.json \
  --output urls.json \
  --max-pages 3
```

Searches `site:forum "context" "word"` for every combination. Outputs deduplicated URL list.

Typical: 10 contexts × 10 words × 8 sources × 3 pages = 2,400 searches → ~1,500 unique URLs.
Cost: ~$7 per 2,400 searches.

## Phase 3: Scrape URLs

```bash
python3 {baseDir}/scripts/scrape_urls.py \
  --input urls.json \
  --output docs/
```

Uses Firecrawl for regular sites, Reddit JSON API for reddit.com URLs (bypasses 403).
Outputs one `.md` file per URL + `manifest.json`.
Cost: ~$0.001 per URL.

## Phase 4: Extract Problems

```bash
python3 {baseDir}/scripts/extract_problems.py \
  --docs-dir docs/ \
  --output problems.md \
  --model google/gemini-3.1-pro-preview \
  --concurrency 10 \
  --industry "fintech" \
  --product "payment processing for SMBs" \
  --target "freelancers and small businesses" \
  --context-type "B2B" \
  --company "Paymatico"
```

Processes all documents in parallel (10 concurrent). Each doc is checked for relevance then pain points are extracted into a structured table.

Typical: ~66% of documents yield extractable problems.
Cost: ~$0.04/doc with Gemini 3.1 Pro.

## Phase 5: Clean & Filter (Step 2)

```bash
python3 {baseDir}/scripts/llm_step.py \
  --input problems.md \
  --output niches.md \
  --prompt-file {baseDir}/references/prompts-step2-clean-filter.md \
  --model openai/gpt-4o-mini \
  --temperature 0.5 \
  --var company=Paymatico \
  --var industry=fintech \
  --var context_type=B2B
```

Merges duplicates, validates viability, categorizes. Outputs 30-50 validated niches.
See [references/prompts-step2-clean-filter.md](references/prompts-step2-clean-filter.md) for prompt details.

## Phase 6: Scoring (Step 3)

```bash
python3 {baseDir}/scripts/llm_step.py \
  --input niches.md \
  --output scored.md \
  --prompt-file {baseDir}/references/prompts-step3-scoring.md \
  --model google/gemini-2.5-pro-preview \
  --temperature 0.8 \
  --var industry=fintech \
  --var country=España
```

Deep research on each valid niche: Pain Score (2-99), Market Size (SAM), Reachability Score (2-99).
See [references/prompts-step3-scoring.md](references/prompts-step3-scoring.md) for prompt details.

## Phase 7: Consolidate (Step 4)

```bash
python3 {baseDir}/scripts/llm_step.py \
  --input "niches.md,scored.md" \
  --output final-table.md \
  --prompt-file {baseDir}/references/prompts-step4-consolidate.md \
  --model openai/gpt-4o-mini \
  --temperature 0.3
```

Merges filtered niches + scoring into one final table with all 20+ columns.
See [references/prompts-step4-consolidate.md](references/prompts-step4-consolidate.md) for prompt details.

## Cost Summary

| Phase | Typical Cost |
|-------|-------------|
| SERP (2,400 searches) | $7 |
| Scraping (1,500 URLs) | $1.50 |
| Extraction (1,000 docs) | $40 |
| Clean & Filter | $0.10 |
| Scoring | $2 |
| Consolidation | $0.05 |
| **Total** | **~$50** |

## Partial Runs

Not every run needs the full pipeline:

| Situation | Start At |
|-----------|----------|
| "I have forum data already" | Phase 4 (Extract) — put docs in `docs/` |
| "I have pain points" | Phase 5 (Clean) — format as `problems.md` |
| "Score these niches" | Phase 6 (Score) — format as `niches.md` |
| "Validate a specific niche" | Phase 6 (Score) — single niche in `niches.md` |
