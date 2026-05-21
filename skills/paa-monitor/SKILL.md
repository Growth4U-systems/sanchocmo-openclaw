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

**DataforSEO SERP API** — Google Organic Live Advanced endpoint. Devuelve
los items `people_also_ask_element` ya estructurados (preguntas reales que
Google muestra), sin necesidad de scraping.

- MCP tool name: busca un tool DataforSEO de la familia
  `serp_google_organic_live_advanced` (o equivalente que exponga PAA en la
  respuesta). Si la cuenta solo tiene SERP regular, usa la respuesta SERP
  estandar y filtra los items con `type == "people_also_ask_element"`.
- Auth: credenciales ya configuradas en `_system/api-catalog.json`
  (LOGIN + PASSWORD en `auth-profiles.json`). El MCP server gestiona la
  autenticacion automaticamente; no leas las credenciales en el codigo.
- NO uses `WebSearch` ni `WebFetch` como fallback. Si DataforSEO falla,
  reporta el error en el resumen y skip esa semana — no scrapees.

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
For each seed query in the config:
- Llama al MCP tool de DataforSEO SERP Google Organic Live Advanced con
  `keyword: <seed>`, `location_code: 2724` (Spain) o el adecuado, y
  `language_code: es`.
- Recorre `tasks[0].result[0].items` y filtra los que tengan
  `type == "people_also_ask_element"`. Cada uno trae un array de
  preguntas con `title`, `xpath`, `expanded_element`. Quedate con `title`.
- Agrupa por pillar_id usando el seed query del config.

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
Write to `content/research-signals/{YYYY-MM-DD}-paa.json` as a **flat top-level
JSON array** (never an object grouped by pillar). Each element has the shape
shown in step 3. If nothing was extracted for a pillar, omit it — do not
write placeholders. If nothing was extracted at all, write `[]`.

Downstream consumers count with `jq '[.[] | select(.pillar_id == "PX")] | length'`
— a grouped-by-pillar shape breaks the filter.

Deduplicate against previous weeks (same question = skip).

## Rules

- **Deduplicate aggressively** — PAA questions repeat week to week. Only add NEW questions.
- **Keep the exact wording** — the value is how REAL people phrase the question.
- **No volume filtering** — that's keyword-research's job. Here we want all questions.
- **Group by pillar** — each question must be assigned to a pillar_id.
- **Max 20 new questions per pillar per week** — cap to avoid noise.

## Error handling

If DataforSEO fails (auth, rate limit, missing scope), reporta el error
en `recurring-tasks/content-paa-monitor/{date}.json` con
`status: "failed"` y skip esa semana. NO uses WebSearch ni WebFetch como
fallback — las preguntas extraidas asi son ruido y rompen la deduplicacion.
Las preguntas no cambian rapido; perder una semana esta bien.
