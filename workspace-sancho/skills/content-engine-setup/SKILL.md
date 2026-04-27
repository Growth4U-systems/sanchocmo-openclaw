---
name: content-engine-setup
description: "Populates Content Engine config files with client-specific data and writes a narrative setup.md explaining what was set up and which crons consume it. The infrastructure (folders, YAML templates, cron jobs) already exists — this skill only FILLS IN the client-editable fields and DOCUMENTS what was done."
context_required:
- brand/{slug}/content/content-pillars.md
- brand/{slug}/content/pov-bank.json
- brand/{slug}/company-brief/company-brief.current.md
- brand/{slug}/go-to-market/ecps/ecps.current.md
- brand/{slug}/market-and-us/competitors/sources.json
- brand/{slug}/brand-book/brand-voice/brand-voice.current.md
context_writes:
- brand/{slug}/content/configs/news-prompts/*.yml
- brand/{slug}/content/configs/paa-queries/*.yml
- brand/{slug}/content/configs/keywords-seed/*.yml
- brand/{slug}/market-and-us/competitors/sources.json
- brand/{slug}/content/configs/cadence-config.yml
- brand/{slug}/content/configs/setup.md
---

# Content Engine Setup — Populate Configs + Write Narrative Doc

> The infrastructure (folders, YAML templates, cron jobs) is already created.
> This skill only FILLS IN client-specific data and writes a narrative
> document explaining the decisions.
>
> The doc (`setup.md`) is the deliverable for the human — short, in plain
> language, with links to each cron that consumes the configs. It is NOT
> a dump of the YAMLs (those are already visible in MC UI → Inputs).

## ⚠️ Prerequisite check (ANTES de ejecutar)

Esta skill se ejecuta **EL ÚLTIMO** del setup. Solo debe correr si los 3 anteriores están completed:

1. Lee `brand/{slug}/projects/P14-Content-Engine/tasks.json`
2. Verifica que existen y están `status: completed`:
   - La task con `skill: "content-strategy"` (P14-T01)
   - La task con `skill: "content-pillars"` (P14-T02)
   - **La task con `skill: "pov-bank-builder"` (P14-T04) ← imprescindible**
3. Si alguna NO está completed:
   - **NO ejecutes la skill**
   - Responde al humano:
     > "❌ Pre-requisito no cumplido: la task **{taskId} ({skill})** está en `status: {status}`. El setup de configs depende de tener strategy + pillars + POV Bank aprobados, porque cada config se afina en función del POV (ej: el news prompt prioriza fuentes que cita evidence_we_cite del pillar). Completa la task pendiente y vuelve."
   - Termina sin escribir nada
4. Si los 3 están completed → continúa con el workflow abajo

**Por qué este orden**: News prompts, perfiles a vigilar, keywords, y cadencia se afinan mejor cuando ya conoces el POV per pillar. Si configuras los inputs sin POV, los signals que llegan son genéricos y los angle_drafts del idea-builder serán débiles.

## What already exists (DO NOT recreate)

```
brand/{slug}/content/
├── configs/
│   ├── news-prompts/P1.yml ... P{N}.yml    ← FILL these
│   ├── paa-queries/P1.yml ... P{N}.yml     ← FILL these
│   ├── keywords-seed/P1.yml ... P{N}.yml   ← FILL these
│   ├── cadence-config.yml                  ← FILL this
│   └── setup.md                            ← WRITE this (narrative)
├── content-pillars.md                      ← READ (input)
├── idea-queue.json                         ← DO NOT touch
└── clarify-history.json                    ← DO NOT touch

brand/{slug}/market-and-us/competitors/
└── sources.json (schema v2)                ← FILL profiles[] here
```

## Output schema reminders

### sources.json (schema v2 — single flat list)

The legacy `competitors.{direct,indirect}` + nested founders + separate
`reference-creators/all-pillars.yml` were unified into one `profiles[]`
array. Schema:

```json
{
  "version": 2,
  "profiles": [
    {
      "id": "snowball",
      "type": "company",
      "name": "Snowball",
      "tier": "A",
      "platforms": { "web": "...", "linkedin": "...", "twitter": "...", "instagram": "...", "youtube": "...", "newsletter": "...", "podcast": "...", "blog": "..." },
      "pillars_relevant": ["P1","P2"]
    },
    {
      "id": "snowball__pau-gallinat",
      "type": "person",
      "name": "Pau Gallinat",
      "parent_company_id": "snowball",
      "role": "CEO & Founder",
      "platforms": { "linkedin": "...", "twitter": "..." },
      "pillars_relevant": ["P1"]
    },
    {
      "id": "creator__amanda-natividad",
      "type": "person",
      "name": "Amanda Natividad",
      "role": "Zero-click content, VOI over ROI",
      "platforms": { "linkedin": "..." },
      "pillars_relevant": ["P2","P5"]
    }
  ],
  "updated_at": "..."
}
```

- `type: "company"` for competitor companies
- `type: "person"` for founders (with `parent_company_id`) AND for industry voices ("voces del sector") with no parent
- `pillars_relevant` lives on every profile

### news-prompts/{pillar_id}.yml — single dynamic prompt (NOT array)

```yaml
pillar_id: P1
pillar_name: "..."
prompt: >
  What are the 5 most interesting and relevant news stories from the last 48 hours
  covering {topics specific to this pillar} for {sector}? For each give the
  headline, source, date, a 2-sentence summary, and the URL.
sector: "..."
language: [es, en]
```

The runtime substitutes nothing — the prompt is sent verbatim to Brave/Perplexity.

### paa-queries/{pillar_id}.yml — single dynamic prompt (NOT array)

```yaml
pillar_id: P1
pillar_name: "..."
prompt: >
  Extract People Also Ask questions from Google for queries about {pillar topics}.
  Use DataforSEO API. Return the top 10 questions real users are asking, grouped
  by sub-topic.
language: [es, en]
```

### keywords-seed/{pillar_id}.yml — array of seed keywords

```yaml
pillar_id: P1
pillar_name: "..."
keywords_seed: ["...", "...", "..."]
target: blog_seo_bofu_first
language: [es, en]
```

### cadence-config.yml — channels + frequency + profiles

Editable via MC UI → Inputs → Cadencia. Same shape as before:
`channels.{linkedin,twitter,blog,newsletter}.{active, frequency, best_days, best_times, profiles, gating, content_types}`.

## Workflow

### 1. Read inputs

- `content-pillars.md` — names, pain_origin, expertise, related_topics
- `company-brief` — sector, business model
- `ecps` — ICP clusters
- `sources.json` — existing profiles (may be empty for new brands)
- `brand-voice` — tone

### 2. For EACH pillar, populate per-pillar configs

For each `P{n}.yml` in news-prompts/, paa-queries/, keywords-seed/:
- Set `pillar_name` from content-pillars.md
- For news: write a SINGLE rich `prompt` (not an array of prompts) covering the pillar's topics + sector context
- For PAA: write a SINGLE `prompt` describing the DataforSEO query for that pillar
- For keywords: 5-8 BOFU-first seeds in `keywords_seed[]`

DO NOT touch: `pillar_id`, file structure.

### 3. Populate sources.json (profiles)

- Read `market-and-us/competitors/sources.json`
- Use schema v2 (`{ version: 2, profiles: [...] }`)
- Add competitor companies as `type: "company"`
- For each company's known founders, add `type: "person"` with `parent_company_id`
- Add industry voices/thought leaders as `type: "person"` with no parent
- Assign `pillars_relevant` to every profile (1-3 pillars per profile)
- DO NOT use the legacy `competitors.direct/indirect` shape — that file format has been deprecated

### 4. Populate cadence config

Workshop with human. Ask:
1. Active channels (LinkedIn, X/Twitter, Blog, Newsletter, …)
2. Frequency per channel
3. Publishing profiles (names + handles + posts/week)
4. Best days + times
5. Gating (ungated / gated_top_funnel / gated_bottom_funnel)
6. Content types per channel

Write to `cadence-config.yml`. Preserve top-level keys not in the form
(`batch_workflow`, `rules`).

### 5. Write the narrative `setup.md` (THE DELIVERABLE)

Path: `brand/{slug}/content/configs/setup.md`

This is the human-facing document. Keep it short and explanatory.
Structure:

```markdown
# Content Engine Setup — {Client Name}

_Última actualización: YYYY-MM-DD por content-engine-setup_

## Por qué hicimos esto

{2-3 frases explicando que el Content Engine necesita configs por pillar
para que los crones puedan ejecutarse: monitorear noticias, sacar PAA,
investigar keywords, vigilar competidores y planificar la cadencia
editorial.}

## Decisiones por pillar

### P1 — {Nombre del pillar}
- **Por qué este pillar**: {1 frase del pain_origin / expertise}
- **News prompt**: {qué tipo de noticias buscamos para este pillar}
- **PAA**: {qué preguntas extraemos de Google}
- **Keywords**: {breve mención de los 2-3 más importantes}
- **Pillars asignados a profiles**: X profiles vigilados para este pillar

### P2 — ... (idem)

## Profiles a monitorizar

- {N} empresas competidoras
- {M} founders
- {K} voces del sector
- Asignación a pillars: {breve resumen}

Ver lista completa en MC UI → Inputs → 🕵️ Perfiles a monitorizar.

## Cadencia editorial

- **LinkedIn**: {frecuencia}, mejores días {L,M,X,J}, {N} perfiles
- **Twitter**: {frecuencia}, ...
- **Blog**: {frecuencia}, ...
- **Newsletter**: {frecuencia}, ...

Ver y editar en MC UI → Inputs → ⏰ Cadencia.

## Crones conectados (qué consume cada config)

| Cron | Cuándo | Lee | Escribe |
|------|--------|-----|---------|
| 📰 [News Monitor]({MC_BASE}/dashboard/{slug}/system?cron=News+Monitor) | 7am L-V | `news-prompts/*.yml` | `research-signals/{date}-news.json` |
| 🕵️ [Competitor Monitor]({MC_BASE}/dashboard/{slug}/system?cron=Competitor+Monitor) | 7am L-V | `sources.json` (profiles) | `research-signals/{date}-creators.json` |
| 🔑 [Keyword Research]({MC_BASE}/dashboard/{slug}/system?cron=Keyword+Research) | semanal | `keywords-seed/*.yml` | `research-signals/{date}-keywords.json` |
| ❓ [PAA Monitor]({MC_BASE}/dashboard/{slug}/system?cron=PAA+Monitor) | semanal lunes 6am | `paa-queries/*.yml` | `research-signals/{date}-paa.json` |
| 🧠 [Classify + Ideas]({MC_BASE}/dashboard/{slug}/system?cron=Classify+%2B+Ideas) | 7:30 L-V | `research-signals/*.json` + **`pov-bank.json`** + `content-pillars.md` + `cadence-config.yml` | `idea-queue.json` (con angle_draft = 1 párrafo POV) |
| 📬 [Editorial Dispatch]({MC_BASE}/dashboard/{slug}/system?cron=Editorial+Dispatch) | 8:30 L-V | `idea-queue.json` + `cadence-config.yml` | Discord/Slack del cliente |
| 🎯 POV Bank Refresh | 1 del mes 9am | `clarify-history.json` (último mes) | `pov-bank.json` (refinado, versionado) |

## Cómo iterar

- Para regenerar TODOS los configs: pídeselo a Sancho en este chat ("regenera el setup")
- Para editar un config concreto sin regenerar: MC UI → Inputs → sección que toque
- Para añadir/quitar profiles a vigilar: MC UI → Inputs → 🕵️ Perfiles a monitorizar
- Para ajustar la cadencia: MC UI → Inputs → ⏰ Cadencia
```

Sustituye `{MC_BASE}` por la URL real del MC del cliente (típicamente `https://localhost:3000` en dev, o la URL de producción del cliente).

### 6. Confirm with human

Tras escribir todos los archivos:
1. Resume los cambios en 3-5 líneas
2. Da el path al `setup.md` para que el humano lo abra desde MC UI → Inputs → ⚙️ Setup configs por pillar → 📄 Ver doc
3. Recuerda que cada config es editable independientemente desde la UI:
   - 📰 News Prompts, ❓ PAA, 🔑 Keywords, 🕵️ Perfiles, ⏰ Cadencia, **🎯 POV Bank**
4. Recuerda que el POV Bank ya estaba poblado antes de este setup (precondition), pero puede refrescarse manualmente desde su sección o esperar al cron mensual POV Bank Refresh.

## Rules

- **NEVER create files** que ya existen — solo escribe a paths que estén en `context_writes`
- **NEVER modify structure** — mantén las claves YAML, solo cambia valores
- **Use schema v2** para sources.json — NO uses la estructura legacy `competitors.direct/indirect`
- **News + PAA usan `prompt: >` (string)**, no `prompts: []` ni `queries: []`
- **Ask the human** para decisiones de cadencia — no asumas frecuencias
- **Use Foundation data** para competidores y sector — no inventes
- **BOFU-first** para keywords — decision-stage antes que awareness
- **Setup.md es corto y narrativo** — no copies los YAMLs ahí dentro
