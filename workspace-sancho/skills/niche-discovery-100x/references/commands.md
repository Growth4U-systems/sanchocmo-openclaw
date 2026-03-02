# Niche Discovery v3 — Script Commands

All scripts in `scripts/`. Replace `{baseDir}` with this skill's root path, `{slug}` with client slug.

## Phase 3: SERP Search

```bash
python3 {baseDir}/scripts/serp_search.py \
  --config brand/{slug}/niche-discovery/config.json \
  --output brand/{slug}/niche-discovery/urls.json \
  --max-pages 3
```

Time: ~1 min per 500 searches. Cost: ~$0.003/search.

## Phase 4: Scrape URLs

```bash
python3 {baseDir}/scripts/scrape_urls.py \
  --input brand/{slug}/niche-discovery/urls.json \
  --output brand/{slug}/niche-discovery/docs/
```

Firecrawl for regular sites, Reddit JSON API for reddit.com. Time: ~2 min per 500 URLs. Cost: ~$0.001/URL.

## Phase 5: Extract Problems

```bash
python3 {baseDir}/scripts/extract_problems.py \
  --docs-dir brand/{slug}/niche-discovery/docs/ \
  --output brand/{slug}/niche-discovery/problems.md \
  --model google/gemini-3.1-pro-preview \
  --concurrency 10 \
  --industry "{industry}" \
  --product "{product}" \
  --target "{target}" \
  --context-type "{context_type}" \
  --company "{company_name}"
```

Time: ~3-5 sec/doc at concurrency 10. Cost: ~$0.012/doc (Gemini 3.1 Pro).

## Phase 6a: Chunk Processing (Sonnet 4)

Split problems.md into 5 equal chunks, then:

```bash
python3 {baseDir}/scripts/llm_step.py \
  --input brand/{slug}/niche-discovery/problems-chunk-{N}.md \
  --output brand/{slug}/niche-discovery/niches-raw/chunk-{N}.md \
  --prompt-file {baseDir}/references/prompts-phase6a-chunk.md \
  --model anthropic/claude-sonnet-4 \
  --temperature 0.3 --max-tokens 16000 \
  --var company={company_name} --var industry={industry} --var context_type={context_type}
```

## Phase 6b: Merge & Dedup (Opus 4.6)

```bash
python3 {baseDir}/scripts/llm_step.py \
  --input brand/{slug}/niche-discovery/niches-raw/chunk-1.md,...,chunk-5.md \
  --output brand/{slug}/niche-discovery/niches-raw/merged.md \
  --prompt-file {baseDir}/references/prompts-phase6b-merge.md \
  --model anthropic/claude-opus-4 \
  --temperature 0.2 --max-tokens 16000
```

Max ~35-40 niches per call to stay under 32K output token cap.

If `finish_reason: length` → run supplement pass: extract existing Niche_IDs, ask Opus for ONLY uncovered niches, merge.

## Phase 7: Quality Filter

```bash
python3 {baseDir}/scripts/llm_step.py \
  --input brand/{slug}/niche-discovery/niches-raw/merged.md \
  --output brand/{slug}/niche-discovery/niches-filtered.md \
  --prompt-file {baseDir}/references/prompts-phase7-quality-filter.md \
  --model anthropic/claude-opus-4 \
  --temperature 0.1 \
  --var company={company_name}
```

Expected: 30-40% filtered out.

## Phase 10: Consolidate

```bash
python3 {baseDir}/scripts/llm_step.py \
  --input "brand/{slug}/niche-discovery/niches-confirmed.md,brand/{slug}/niche-discovery/scored.md" \
  --output brand/{slug}/niche-discovery/current.md \
  --prompt-file {baseDir}/references/prompts-phase10-consolidate.md \
  --model anthropic/claude-opus-4 \
  --temperature 0.3
```

## Phase 10b: CSV Export

```bash
python3 {baseDir}/scripts/export_csv.py \
  --input brand/{slug}/niche-discovery/current.md \
  --output brand/{slug}/niche-discovery/final-table.csv
```
