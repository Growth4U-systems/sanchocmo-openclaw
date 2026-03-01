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
├── niches.md             ← Phase 5 (filtered niches)
├── niches-confirmed.md   ← Phase 5b (user-confirmed niches for scoring)
├── scored.md             ← Phase 6 (scoring results)
└── final-table.md        ← Phase 7 (consolidated final table)
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

**Before executing ANY phase (2 through 7), you MUST:**

1. Tell the user what the next step will do
2. Show the parameters: model, estimated time, estimated cost, number of items to process
3. Ask: "¿Procedo con estos parámetros o quieres cambiar algo?"
4. The user can change: model, concurrency, temperature, or any other parameter
5. **Only execute after explicit approval** ("ok", "dale", "continúa", "perfecto")

**Time estimates by phase (approximate):**
- SERP Search: ~1 min per 500 searches (rate limited)
- Scraping: ~2 min per 500 URLs
- Extraction: ~3-5 sec/doc at concurrency 10 → ~1,000 docs ≈ 50 min
- Clean & Filter: 2-5 min (single LLM call)
- Scoring: 5-15 min (deep research per niche)
- Consolidation: 1-2 min (single LLM call)

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
> - Modelo: google/gemini-3.1-pro-preview
> - Concurrencia: 10
> - Tiempo estimado: ~{N/10 × 4 / 60} minutos (a {concurrency} en paralelo)
> - Costo estimado: ~${N × 0.04}
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
**Output saved to:** `{company_name}-nichos/problems.md`

## Phase 5: Clean & Filter

**Present to user before executing:**
> **Siguiente paso: Limpieza y filtrado**
> - Input: {N} problemas extraídos
> - Modelo: openai/gpt-4o-mini
> - Temperatura: 0.5
> - Tiempo estimado: 2-5 minutos
> - Costo estimado: ~$0.10
> - Output esperado: 30-50 nichos validados
>
> ¿Procedo con estos parámetros o quieres cambiar algo?

```bash
python3 {baseDir}/scripts/llm_step.py \
  --input {company_name}-nichos/problems.md \
  --output {company_name}-nichos/niches.md \
  --prompt-file {baseDir}/references/prompts-step2-clean-filter.md \
  --model openai/gpt-4o-mini \
  --temperature 0.5 \
  --var company={company_name} \
  --var industry={industry} \
  --var context_type={context_type}
```

Merges duplicates, validates viability, categorizes. Outputs 30-50 validated niches.
See [references/prompts-step2-clean-filter.md](references/prompts-step2-clean-filter.md) for prompt details.
**Output saved to:** `{company_name}-nichos/niches.md`

## Phase 5b: User Review of Niches (MANDATORY — do NOT skip)

**After Phase 5 completes, present the niches table to the user and ask them to review it before proceeding to Deep Research.**

Present like this:
> **Resultados del filtrado: {N} nichos identificados**
>
> [Show the full niches table from niches.md]
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
- **Only proceed to Phase 6 after explicit approval.**

## Phase 6: Scoring (Deep Research)

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

1. **SCOPE** (from prompts-step3-scoring.md):
   - Research question: "Viability analysis of niche: [Niche Name] in {industry} for {country}"
   - Data points: Pain Intensity (JTBD), Market Size (SAM), Reachability
   - Entities to cover: target persona, competitors, communities, channels

2. **Analysis framework** (see [references/prompts-step3-scoring.md](references/prompts-step3-scoring.md)):
   - **Pain Intensity (2-99)**: JTBD analysis — economic loss, opportunity cost, time loss, cognitive load, frequency
   - **Market Size**: SAM estimate using INE, Eurostat, Statista. Top-down + bottom-up. Confidence level.
   - **Reachability (2-99)**: Online communities, physical communities, content creators, keywords, competition/CAC

3. **Specific deliverables per niche:**
   - Pain Score + explanation (600-800 chars)
   - Market Size number + explanation with sources
   - Reachability Score + explanation with specific channels
   - Reachability Channels: exact subreddits, influencer handles, platforms, associations

4. **Save each niche's research** to `{company_name}-nichos/scored.md` (append format, one section per niche)

**NOTE:** This skill can also be combined with other skills as needed. If a niche requires competitor intelligence, use the `competitor-intelligence` skill. If it needs market data, use `market-intelligence`. The agent should use the best available skill for each research need.

**Output saved to:** `{company_name}-nichos/scored.md`

## Phase 7: Consolidate

**Present to user before executing:**
> **Siguiente paso: Consolidación final**
> - Inputs: nichos confirmados + scores del deep research
> - Modelo: openai/gpt-4o-mini
> - Temperatura: 0.3
> - Tiempo estimado: 1-2 minutos
> - Costo estimado: ~$0.05
> - Output: tabla final con 20+ columnas
>
> ¿Procedo o quieres cambiar algo?

```bash
python3 {baseDir}/scripts/llm_step.py \
  --input "{company_name}-nichos/niches-confirmed.md,{company_name}-nichos/scored.md" \
  --output {company_name}-nichos/final-table.md \
  --prompt-file {baseDir}/references/prompts-step4-consolidate.md \
  --model openai/gpt-4o-mini \
  --temperature 0.3
```

Merges confirmed niches + scoring into one final table with all 20+ columns.
See [references/prompts-step4-consolidate.md](references/prompts-step4-consolidate.md) for prompt details.
**Output saved to:** `{company_name}-nichos/final-table.md`

## Cost Summary

| Phase | Typical Cost |
|-------|-------------|
| SERP (2,400 searches) | $7 |
| Scraping (1,500 URLs) | $1.50 |
| Extraction (1,000 docs) | $40 |
| Clean & Filter | $0.10 |
| Scoring (Deep Research) | $2-5 |
| Consolidation | $0.05 |
| **Total** | **~$50-55** |

## Partial Runs

Not every run needs the full pipeline:

| Situation | Start At |
|-----------|----------|
| "I have forum data already" | Phase 4 (Extract) — put docs in `docs/` |
| "I have pain points" | Phase 5 (Clean) — format as `problems.md` |
| "Score these niches" | Phase 5b (Review) → Phase 6 (Score) |
| "Validate a specific niche" | Phase 6 (Score) — single niche in `niches-confirmed.md` |
