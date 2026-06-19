---
name: paa-monitor
description: "People Also Ask monitor. Extracts real questions audiences ask per content pillar. Runs weekly. Separate from keyword-research: PAA finds QUESTIONS for content ideas, keyword-research finds KEYWORDS for SEO targeting."
context_required:
- brand/{slug}/content/configs/paa-queries/*.yml
- brand/{slug}/content/content-pillars.md
- brand/{slug}/content/pov-bank.json
context_writes:
- brand/{slug}/content/research-signals/{date}-paa.json
- brand/{slug}/content/idea-queue.json
- brand/{slug}/recurring-tasks/content-paa-monitor/{date}.json
---

# PAA Monitor

> Extracts People Also Ask questions per content pillar.
> Runs weekly (Monday 6am). Questions = content idea source.

## Tool

**Fuente primaria: WebSearch (gratis).** Por cada seed query, busca People Also
Ask + related searches + autocomplete y quedate con las preguntas REALES que
aparecen. Es la fuente por defecto (alineado con subscription-first) y es
suficiente; nunca bloquees por falta de datos de pago.

- **DataforSEO (opcional, si está conectado):** la familia
  `serp_google_organic_live_advanced` devuelve los items
  `people_also_ask_element` ya estructurados (más limpio que WebSearch). Úsalo
  para ENRIQUECER si está disponible (auth en `_system/api-catalog.json`; el MCP
  gestiona credenciales — no las leas en el código). Si no está, sigue con
  WebSearch sin problema.
- **Calidad > cantidad:** quedate solo con preguntas reales y bien formadas;
  descarta ruido. La deduplicación agresiva (abajo) protege la señal.

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
- Usa WebSearch como fuente primaria: busca el seed query junto con "People Also
  Ask", "preguntas frecuentes", related searches y autocomplete.
- Extrae solo preguntas reales y bien formadas que aparezcan en los resultados;
  descarta headings, sugerencias ambiguas, frases incompletas y ruido.
- Si DataForSEO esta conectado, puedes enriquecer con
  `serp_google_organic_live_advanced` y sus `people_also_ask_element`, pero no
  bloquees ni marques fallo por falta de DataForSEO.
- Agrupa por `pillar_id` usando el seed query del config y el encaje semantico
  con `content-pillars.md`.

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

Downstream consumers filter with selectors over `pillar_id`, so a grouped
shape (`{ "P1": [...] }`) silently breaks them. Keep it flat.

Don't run `jq` (or `cat`, `ls`, `grep`) on the file as a self-check. The
cron's shell cwd is `~/.openclaw`, not `workspace-sancho/`, so a relative
path like `brand/<slug>/...` won't resolve and the run will be marked as
failed even though the write succeeded. Use the file-read tool if you need
to inspect what you just wrote.

Deduplicate against previous weeks (same question = skip).

### 5. Create content ideas (close the loop)

Questions are only useful once they become Ideas — previously this step did not
exist, so PAA questions never reached the queue. After writing the audit, pick the
highest-value questions (dedupe against `content/idea-queue.json`; cap **8 ideas
per run**; prefer clear pillar fit + clear intent) and **append** a complete blog
Idea per question to `content/idea-queue.json` (flat array, append-only,
verify-after-write):

```json
{
  "id": "idea-{date}-paa-{hash}",
  "title": "<the question, 40-90 chars>",
  "pillar_id": "P{N}",
  "content_type": "FAQ",
  "target_channel": "blog",
  "signal": { "summary": "La gente busca: '<question>'. <why it matters for the pillar>", "source": "paa", "date": "{date}" },
  "source_signals": ["paa-{date}-{hash}"],
  "angle_draft": "<60-80 words: how the brand answers it from its POV (read pov-bank.json for the pillar); end with Frame: '...'>",
  "pov_confidence": 0.6,
  "created_at": "<ISO>",
  "status": "New"
}
```

The `source_signals: ["paa-…"]` lights up the **PAA** filter in the Ideas tab and
lets the idea flow approve → draft. Skip trivial or already-covered questions.

## Rules

- **Deduplicate aggressively** — PAA questions repeat week to week. Only add NEW questions.
- **Keep the exact wording** — the value is how REAL people phrase the question.
- **No volume filtering** — that's keyword-research's job. Here we want all questions.
- **Group by pillar** — each question must be assigned to a pillar_id.
- **Max 20 new questions per pillar per week** — cap to avoid noise.

## Error handling

If WebSearch fails (and DataforSEO isn't connected either), report the error in
`recurring-tasks/content-paa-monitor/{date}.json` with `status: "failed"`,
`questions_added: 0`, `ideas_created: 0`, and skip the week. Keep questions
real and well-formed — discard noise so dedup stays clean. Questions evolve
slowly; missing one week is fine.
