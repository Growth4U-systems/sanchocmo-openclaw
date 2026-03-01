---
name: buscador-de-nichos-v2
description: "End-to-end niche discovery from real forum conversations. Mines Reddit, thematic forums, and community sites for customer pain points, then validates and scores each niche. Use when someone needs to find target markets, validate niches, discover customer segments, build an ICP, or answer 'who should I sell to'. Triggers on: find niches, discover market, ICP, target audience, customer segments, market research, niche discovery, who are my customers, find my customers, validate this niche, market opportunity, buscador de nichos."
---

# Buscador de Nichos v2

Discover profitable customer niches by mining thousands of real forum conversations for pain points, then scoring each niche for viability.

## Pipeline Overview

```
INTAKE → STRATEGY → SEARCH → SCRAPE → EXTRACT → GROUP → FILTER → REVIEW → SCORE → CONSOLIDATE
```

| Phase | What It Does | Model | API Required |
|-------|-------------|-------|--------------|
| 1. Strategy | Generate search grid | OpenRouter | OpenRouter |
| 2. SERP Search | Search forums | — | Serper.dev |
| 3. Scrape | Extract content | — | Firecrawl |
| 4. Extract | Find pain points per doc | Gemini 3.1 Pro | OpenRouter |
| 5. Group | Chunk + merge into niches | Sonnet 4 + Opus 4.6 | OpenRouter |
| 6. Quality Filter | Filter generic/small/irrelevant | Opus 4.6 | OpenRouter |
| 7. User Review | User confirms niches | — | — |
| 8. Score | Deep Research per niche | Deep Research Pro | OpenRouter |
| 9. Consolidate | Final scored table | Opus 4.6 | OpenRouter |

## Script Location

All scripts are in this skill's `scripts/` directory. When running commands, replace `{baseDir}` with the absolute path to this skill's root folder (the folder containing this SKILL.md file).

## Required API Keys

Set as environment variables before running:
- `SERPER_API_KEY` — from serper.dev (SERP searches)
- `FIRECRAWL_API_KEY` — from firecrawl.dev (web scraping)
- `OPENROUTER_API_KEY` — from openrouter.ai (LLM calls)

## GLOBAL RULE: Save Every Output as a File

**Every phase output MUST be saved as a file in the workspace** so the user can access it from Mission Control at any time. Use this naming convention:

```
{company_name}-nichos/
├── config.json           ← Phase 1 (strategy)
├── urls.json             ← Phase 2 (SERP results)
├── docs/                 ← Phase 3 (scraped documents)
├── problems.md           ← Phase 4 (extracted problems)
├── niches-raw/           ← Phase 5 (chunk outputs)
│   ├── chunk-1.md
│   ├── chunk-2.md
│   └── merged.md
├── niches-filtered.md    ← Phase 6 (filtered niches)
├── niches-confirmed.md   ← Phase 7 (user-confirmed)
├── scored.md             ← Phase 8 (scoring results)
├── final-table.md        ← Phase 9 (consolidated final table)
└── final-table.csv       ← Phase 9 (CSV export)
```

## Phase 1: Intake

Collect from user:
- **company_name**: Company name
- **product**: What the product/service does (1-2 sentences)
- **industry**: Sector (e.g., "fintech", "HR tech")
- **target**: Target audience (e.g., "freelancers in Spain")
- **country**: Market country (e.g., "España")
- **context_type**: "B2B", "B2C", or "B2B y B2C"

## Phase 1b: Strategy Generation

Generate the search strategy via LLM. Ask the LLM to produce:
- **10-15 life context words** — Semi-permanent situations (B2C: bebé, mudanza, jubilación; B2B: autónomo, startup, PYME)
- **8-12 product domain words** — Concrete nouns the product operates on (NOT adjectives like "eficiencia")
- **Forum sources** — Thematic + general forums + Reddit subreddits

See [references/thematic-forums.md](references/thematic-forums.md) for forum mapping by country and topic.

## Phase 1c: User Approval (MANDATORY — do NOT skip)

Present the generated strategy to the user in three clear sections and wait for explicit approval before continuing.

**Present like this:**

### Palabras de contexto de vida (life contexts)
> autónomo, startup, pyme, freelance, ...

### Palabras de dominio de producto (product words)
> factura, pagos, cobros, impuestos, ...

### Fuentes (foros y subreddits)
> **Reddit**: r/spain, r/autonomos, ...
> **Foros temáticos**: rankia.com, infoautonomos.com, ...
> **Foros generales**: forocoches.com, burbuja.info, ...

**Then ask the user:**
"¿Quieres modificar algo antes de continuar? Puedes:"
1. Agregar o quitar palabras de contexto
2. Agregar o quitar palabras de producto
3. Agregar foros específicos que conozcas
4. Pedirme que busque más foros relevantes usando deep research
5. Aprobar y continuar

**IMPORTANT behaviors:**
- If the user asks to "find more forums" or "search for forums": use deep research (web search) to discover additional thematic forums, communities, and subreddits relevant to the industry/country/target. Present the new findings and ask for approval again.
- If the user provides specific forums: add them to the appropriate category (thematic, general, or reddit).
- If the user modifies words: update the lists and present the updated version for confirmation.
- **Only proceed to Phase 2 after the user explicitly approves** (e.g., "ok", "aprobado", "dale", "continúa", "perfecto").

Once approved, save strategy as `config.json`:
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

## GLOBAL RULE: Checkpoint Before Every Phase

**Before executing ANY phase (2 through 9), you MUST:**

1. Tell the user what the next step will do
2. Show the parameters: model, estimated time, estimated cost, number of items to process
3. Ask: "¿Procedo con estos parámetros o quieres cambiar algo?"
4. The user can change: model, concurrency, temperature, or any other parameter
5. **Only execute after explicit approval** ("ok", "dale", "continúa", "perfecto")

**Time estimates by phase (approximate):**
- SERP Search: ~1 min per 500 searches (rate limited)
- Scraping: ~2 min per 500 URLs
- Extraction: ~3-5 sec/doc at concurrency 10 → ~1,000 docs ≈ 50 min
- Grouping: ~10-15 min (5 Sonnet chunks + 2-3 Opus merges)
- Quality Filter: ~2-3 min (single Opus pass)
- Scoring: 10-30 min (Deep Research per niche)
- Consolidation: 2-5 min (single Opus call)

---

## Phase 2: SERP Search

**Present to user before executing:**
> **Siguiente paso: Búsqueda SERP**
> - Combinaciones: {N contexts} × {N words} × {N sources} × 3 páginas = ~{total} búsquedas
> - Tiempo estimado: ~{total/500} minutos
> - Costo estimado: ~${total × 0.003}
> - API: Serper.dev
>
> ¿Procedo o quieres ajustar algo?

```bash
python3 {baseDir}/scripts/serp_search.py \
  --config config.json \
  --output urls.json \
  --max-pages 3
```

Searches `site:forum "context" "word"` for every combination. Outputs deduplicated URL list.

## Phase 3: Scrape URLs

**Present to user before executing:**
> **Siguiente paso: Scraping de URLs**
> - URLs a scrapear: {N} URLs únicas encontradas
> - Tiempo estimado: ~{N/500 × 2} minutos
> - Costo estimado: ~${N × 0.001}
> - API: Firecrawl + Reddit JSON
>
> ¿Procedo o quieres ajustar algo?

```bash
python3 {baseDir}/scripts/scrape_urls.py \
  --input urls.json \
  --output docs/
```

Uses Firecrawl for regular sites, Reddit JSON API for reddit.com URLs (bypasses 403).
Outputs one `.md` file per URL + `manifest.json`.

## Phase 4: Extract Problems

**Present to user before executing:**
> **Siguiente paso: Extracción de problemas**
> - Documentos a procesar: {N} docs
> - Modelo: google/gemini-3.1-pro-preview (best price/quality for extraction — tested vs Opus, equal or better results with improved prompt)
> - Concurrencia: 10
> - Tiempo estimado: ~{N/10 × 4 / 60} minutos (a {concurrency} en paralelo)
> - Costo estimado: ~${N × 0.012} (Gemini 3.1 Pro: $2/$12 per M tokens)
>
> ¿Procedo con estos parámetros o quieres cambiar el modelo, la concurrencia, u otro parámetro?

```bash
python3 {baseDir}/scripts/extract_problems.py \
  --docs-dir {company_name}-nichos/docs/ \
  --output {company_name}-nichos/problems.md \
  --model google/gemini-3.1-pro-preview \
  --concurrency 10 \
  --industry "{industry}" \
  --product "{product}" \
  --target "{target}" \
  --context-type "{context_type}" \
  --company "{company_name}"
```

Processes all documents in parallel. Each doc is checked for relevance then pain points are extracted into a structured table.

**Model selection note:** We tested Gemini 3.1 Pro vs Opus 4.6 for extraction and found Gemini 3.1 Pro with an improved prompt produces equal or better results at 1/6th the cost ($2/$12 vs $15/$75 per M tokens).

**Output saved to:** `{company_name}-nichos/problems.md`

## Phase 5: Group into Niches (Chunked Approach)

**IMPORTANT**: This phase uses a multi-pass approach because the output can easily exceed model token limits (Opus has a 32K output token hard cap on OpenRouter).

**Present to user before executing:**
> **Siguiente paso: Agrupación de nichos**
> - Input: {N} problemas extraídos
> - Método: Chunked — dividir en 5 chunks, procesar con Sonnet 4, luego merge con Opus 4.6
> - Pass 1: 5 chunks × Sonnet 4 (~$0.50 por chunk)
> - Pass 2: Opus 4.6 merge + dedup (~$3-5)
> - Pass 2b: Opus 4.6 supplement (si truncado) (~$2-3)
> - Tiempo estimado: ~10-15 minutos
> - Costo estimado: ~$8-12
> - Output esperado: 80-150 nichos agrupados
>
> ¿Procedo con estos parámetros o quieres cambiar algo?

### Step 5a: Chunk Processing (Sonnet 4)

Split the problems table into 5 equal chunks (~400 rows each for 2,000 problems). Process each chunk independently with Sonnet 4.

```bash
python3 {baseDir}/scripts/llm_step.py \
  --input {company_name}-nichos/problems-chunk-{N}.md \
  --output {company_name}-nichos/niches-raw/chunk-{N}.md \
  --prompt-file {baseDir}/references/prompts-step5a-chunk.md \
  --model anthropic/claude-sonnet-4 \
  --temperature 0.3 \
  --max-tokens 16000 \
  --var company={company_name} \
  --var industry={industry} \
  --var context_type={context_type}
```

Each chunk produces ~60-100 niches. Save each as `niches-raw/chunk-{N}.md`.

### Step 5b: Merge & Dedup (Opus 4.6)

Merge all chunk outputs into one table, deduplicating niches that appear across chunks.

**CRITICAL**: Limit each Opus call to ~35-40 output niches to stay well under the 32K output token cap. If more than 40 niches are expected, use multiple merge passes.

```bash
python3 {baseDir}/scripts/llm_step.py \
  --input {company_name}-nichos/niches-raw/chunk-1.md,...,chunk-5.md \
  --output {company_name}-nichos/niches-raw/merged.md \
  --prompt-file {baseDir}/references/prompts-step5b-merge.md \
  --model anthropic/claude-opus-4 \
  --temperature 0.2 \
  --max-tokens 16000
```

### Step 5c: Supplement Pass (if truncated)

If the merge output has `finish_reason: length` (hit 32K cap), run a supplementary pass:
1. Extract all Niche_IDs from the merged output
2. Send them to Opus with instructions to find ONLY niches NOT already covered
3. Merge the supplement with the main output

This ensures no niches are lost to truncation.

**Output saved to:** `{company_name}-nichos/niches-raw/merged.md`

## Phase 6: Quality Filter

**This is a dedicated filtering step that ensures only high-quality, specific, commercially viable niches proceed to scoring.**

**Present to user before executing:**
> **Siguiente paso: Filtro de calidad**
> - Input: {N} nichos agrupados
> - Modelo: anthropic/claude-opus-4
> - Criterios de filtro: genéricos, demasiado pequeños, no relevantes, duplicados de segmento
> - Tiempo estimado: 2-3 minutos
> - Costo estimado: ~$2-4
> - Output esperado: 50-100 nichos validados (30-40% descarte típico)
>
> ¿Procedo o quieres ajustar los criterios de filtro?

**Filter criteria (send to Opus):**

1. **TOO GENERIC**: Broad complaint (e.g., "high bank fees") without a specific business segment. A valid niche must define WHO (business type/vertical) + WHAT specific problem.
2. **TOO SMALL**: Individual autónomos/freelancers with minimal payment volume. Target must be businesses with meaningful transaction volumes.
3. **NOT PRODUCT-RELEVANT**: Problem isn't related to the company's core product domain.
4. **CONSUMER PROBLEM**: Personal complaints, not business operations.
5. **DUPLICATE SEGMENT**: Same business type as another niche — consolidate into the stronger one.

**Key principle**: A NICHE is defined by WHO has the problem (business segment), not by WHAT the problem is. Multiple problems from the same business segment = one niche with multiple pain points.

```bash
python3 {baseDir}/scripts/llm_step.py \
  --input {company_name}-nichos/niches-raw/merged.md \
  --output {company_name}-nichos/niches-filtered.md \
  --prompt-file {baseDir}/references/prompts-step6-filter.md \
  --model anthropic/claude-opus-4 \
  --temperature 0.1 \
  --var company={company_name}
```

**Output saved to:** `{company_name}-nichos/niches-filtered.md`

## Phase 7: User Review of Niches (MANDATORY — do NOT skip)

**After Phase 6 completes, present the filtered niches table to the user and ask them to review it before proceeding to Deep Research.**

Present like this:
> **Resultados del filtrado: {N} nichos identificados**
>
> [Show the full niches table from niches-filtered.md]
>
> **Antes de pasar al Deep Research (scoring), necesito que confirmes:**
> 1. ¿Quieres mantener todos estos nichos o eliminar algunos?
> 2. ¿Quieres agregar algún nicho que no esté en la lista?
> 3. ¿Quieres modificar la descripción de algún nicho?
> 4. ¿Quieres cambiar la columna "Valid" de alguno (TRUE/FALSE)?
>
> Edita la tabla o dime qué cambios hacer. Solo los nichos marcados como **Valid = TRUE** pasarán al Deep Research.

**IMPORTANT behaviors:**
- If the user wants to remove niches: set Valid = FALSE for those rows.
- If the user wants to add niches: add new rows with Valid = TRUE.
- If the user modifies descriptions: update the table accordingly.
- After all edits, present the final version and ask for confirmation.
- **Save the confirmed version as `{company_name}-nichos/niches-confirmed.md`**
- **Only proceed to Phase 8 after explicit approval.**

## Phase 8: Scoring (Deep Research)

**This phase uses the `deep-research` skill to analyze each confirmed niche in depth. Do NOT use `llm_step.py` for this phase — invoke the deep-research skill instead.**

**Present to user before executing:**
> **Siguiente paso: Deep Research y Scoring**
> - Nichos a investigar: {N} nichos confirmados (Valid = TRUE)
> - Método: Skill `deep-research` (búsqueda web multi-fuente + verificación QA)
> - Métricas por nicho: Pain Score (2-99), Market Size (SAM), Reachability Score (2-99)
> - Tiempo estimado: 10-30 minutos (investigación profunda por cada nicho)
> - Costo estimado: variable según fuentes consultadas
>
> ¿Procedo con estos parámetros o quieres cambiar algo?

**Process: invoke `deep-research` skill for EACH confirmed niche with this scope:**

For each niche in `niches-confirmed.md` where Valid = TRUE:

1. **SCOPE** (from prompts-step8-scoring.md):
   - Research question: "Viability analysis of niche: [Niche Name] in {industry} for {country}"
   - Data points: Pain Intensity (JTBD), Market Size (SAM), Reachability
   - Entities to cover: target persona, competitors, communities, channels

2. **Analysis framework** (see [references/prompts-step8-scoring.md](references/prompts-step8-scoring.md)):
   - **Pain Intensity (2-99)**: JTBD analysis — economic loss, opportunity cost, time loss, cognitive load, frequency
   - **Market Size**: SAM estimate using INE, Eurostat, Statista. Top-down + bottom-up. Confidence level.
   - **Reachability (2-99)**: Online communities, physical communities, content creators, keywords, competition/CAC

3. **Specific deliverables per niche:**
   - Pain Score + explanation (600-800 chars)
   - Market Size number + explanation with sources
   - Reachability Score + explanation with specific channels
   - Reachability Channels: exact subreddits, influencer handles, platforms, associations

4. **Save each niche's research** to `{company_name}-nichos/scored.md` (append format, one section per niche)

**Output saved to:** `{company_name}-nichos/scored.md`

## Phase 9: Consolidate

**Present to user before executing:**
> **Siguiente paso: Consolidación final**
> - Inputs: nichos confirmados + scores del deep research
> - Modelo: anthropic/claude-opus-4 (Opus 4.6 — best for final quality)
> - Temperatura: 0.3
> - Tiempo estimado: 2-5 minutos
> - Costo estimado: ~$1-2
> - Output: tabla final con 21+ columnas + CSV export
>
> ¿Procedo o quieres cambiar algo?

```bash
python3 {baseDir}/scripts/llm_step.py \
  --input "{company_name}-nichos/niches-confirmed.md,{company_name}-nichos/scored.md" \
  --output {company_name}-nichos/final-table.md \
  --prompt-file {baseDir}/references/prompts-step9-consolidate.md \
  --model anthropic/claude-opus-4 \
  --temperature 0.3
```

Merges confirmed niches + scoring into one final table with all 21+ columns.

**Also export as CSV** for easy import into Google Sheets:
```bash
python3 {baseDir}/scripts/export_csv.py \
  --input {company_name}-nichos/final-table.md \
  --output {company_name}-nichos/final-table.csv
```

**Output saved to:** `{company_name}-nichos/final-table.md` and `final-table.csv`

## Cost Summary

Based on actual pipeline runs (e.g., Paymatico with 4,717 docs → 96 validated niches):

| Phase | Typical Cost |
|-------|-------------|
| SERP (2,400 searches) | $7 |
| Scraping (1,500 URLs) | $1.50 |
| Extraction (2,700 docs, Gemini 3.1 Pro) | $12 |
| Grouping (5 Sonnet chunks + 2 Opus merges) | $10 |
| Quality Filter (1 Opus pass) | $4 |
| Scoring (Deep Research, ~50-100 niches) | $5-10 |
| Consolidation (1 Opus call) | $2 |
| **Total** | **~$40-45** |

## Partial Runs

Not every run needs the full pipeline:

| Situation | Start At |
|-----------|----------|
| "I have forum data already" | Phase 4 (Extract) — put docs in `docs/` |
| "I have pain points" | Phase 5 (Group) — format as `problems.md` |
| "I have grouped niches" | Phase 6 (Filter) — format as `niches-raw/merged.md` |
| "Score these niches" | Phase 7 (Review) → Phase 8 (Score) |
| "Validate a specific niche" | Phase 8 (Score) — single niche in `niches-confirmed.md` |

## Key Learnings (from actual runs)

1. **Opus 32K output cap**: OpenRouter enforces a hard 32K output token limit on Opus regardless of `max_tokens` setting. Always chunk outputs to stay under ~15K tokens per call.
2. **Gemini 3.1 Pro for extraction**: With an improved prompt, Gemini 3.1 Pro matches Opus quality at 1/6th cost for pain point extraction.
3. **Niche = WHO, not WHAT**: The quality filter must enforce that each niche defines a business segment (who), not just a problem (what). Multiple problems from the same segment should be consolidated.
4. **Chunked merge pattern**: Split → Sonnet chunks → Opus merge → Opus supplement (if truncated). This handles any volume of input problems.
5. **Translation**: Final output should be in English for analysis quality, with a separate Spanish translation for client-facing deliverables using Gemini Flash.
