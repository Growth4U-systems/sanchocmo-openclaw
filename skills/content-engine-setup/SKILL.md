---
name: content-engine-setup
description: "Populates Content Engine config files with client-specific data and writes a narrative setup.md explaining what was set up and which crons consume it. The infrastructure (folders, YAML templates, cron jobs) already exists — this skill only FILLS IN the client-editable fields and DOCUMENTS what was done."
context_required:
- brand/{slug}/content/content-pillars.md
- brand/{slug}/content/pov-bank.json
- brand/{slug}/company-brief/company-brief.current.md
- brand/{slug}/go-to-market/ecps/ecps.current.md
- brand/{slug}/market-and-us/competitors/sources.json
- brand/{slug}/brand-voice/brand-voice.current.md
context_writes:
- brand/{slug}/content/configs/news-prompts/*.yml
- brand/{slug}/content/configs/paa-queries/*.yml
- brand/{slug}/content/configs/keywords-seed/*.yml
- brand/{slug}/market-and-us/competitors/sources.json
- brand/{slug}/content/configs/cadence-config.yml
- brand/{slug}/content/configs/dispatch-channel.yml
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

### 4b. Configure dispatch channel (transport + canal)

Workshop con el humano para decidir DÓNDE recibirá el Editorial Dispatch:

1. Llama a `GET /api/integrations/communication-options?slug={slug}` para obtener la lista de transports `connected` (Slack, Discord, futuros) y sus canales disponibles.
2. Si NO hay transports conectados:
   - Pídele al humano que conecte uno desde MC UI → Settings → 🔌 APIs → 💬 Comunicación.
   - Cuando esté conectado, vuelve a esta tarea.
3. Si hay UN solo transport con canales:
   - Pregunta: "Slack está conectado a workspace `{ws}`. ¿En qué canal quieres recibir el Editorial Dispatch? Aquí van los canales disponibles: 1. #content (C09P1E99A79) 2. #marketing 3. #general… Responde con número o nombre."
4. Si hay VARIOS transports:
   - Pregunta primero "¿Slack o Discord?" (lista los `connected`).
   - Después pregunta el canal del transport elegido.
5. Escribe la decisión en `brand/{slug}/content/configs/dispatch-channel.yml`:
   ```yaml
   transport: slack    # o discord
   channel_id: C09P1E99A79
   channel_name: "#content"
   configured_at: "{ISO now}"
   configured_by: "{nombre del humano}"
   ```
6. Recordatorio al humano: "Slack requiere que el bot esté invitado al canal con `/invite @SanchoCMO`. Verifica antes de la primera ejecución del dispatch a las 8:30am."

DO NOT touch: integrations.json (la conexión y el token viven en Settings → APIs, no aquí).

### 4c. Visual & Carousel setup (auto-detect → ask only what's missing)

El Content Engine ahora también renderiza carruseles (LinkedIn 9-slide PDF, Instagram, etc.). Ese rendering necesita 4 piezas: paleta primary/accent, logo PNG, footer text/handle, y el provider de generación de imagen por defecto. La regla: **lee primero `brand-book/visual-identity/`, pregunta SOLO lo que falte**.

Persistencia única: `brand/{slug}/content/config.json` (no en `configs/`). Ese archivo guarda solo overrides — los valores que el brand-book ya cubre se quedan donde están y MC los resuelve en runtime vía `getEffectiveContentConfig`.

#### 1. Auto-detect lectura

Lee `brand/{slug}/brand-book/visual-identity/design-tokens.json` y reporta al chat lo que se detectó, p.ej.:

> Detectado del brand-book: **Growth4U** · primary `#032149` (navy) · accent `#0faec1` (teal) · heading `Manrope` · body `Roboto`.
> Logo PNG: ✓ presente en `brand-book/visual-identity/logo-light.png`.

Comprueba físicamente:
- `test -f brand/{slug}/brand-book/visual-identity/logo-light.png` → ¿existe el archivo?
- `cat brand/{slug}/brand-book/visual-identity/design-tokens.json | jq '.logo.missing'` → ¿está marcado como missing registered?

Tres estados posibles:

| Estado | Condición | Qué hacer |
|---|---|---|
| `present` | archivo existe | reportar ✓, NO preguntar |
| `missing-registered` | `logo.missing === true` en design-tokens.json | reportar como "registrado sin logo (cliente sin marca)", NO preguntar |
| `pending` | ni archivo ni flag | bloquear y pedir al usuario que lance la skill `visual-identity` antes de seguir — esa skill es la que coloca el logo, no esta |

#### 2. Pregunta SOLO lo que el upstream no resuelve

Usa AskUserQuestion (no chat plano). El logo NO se pregunta aquí — es responsabilidad de `visual-identity`. Si el estado es `pending`, dile al usuario:

> "Falta el intake de visual-identity. Lanza la skill `visual-identity` (Step -1: Brand Assets Intake) antes de seguir con content-engine-setup. Esa skill coloca el logo en `brand-book/visual-identity/logo-light.png` o lo marca como `missing: true` si el cliente no tiene. Cuando esté hecho, reanuda este setup."

Y para. NO improvises preguntando al usuario por el logo — duplica trabajo y el override que pongas aquí queda fuera del brand-book.

**Q: Footer text / handle** — siempre (no hay equivalente en design-tokens):
- (a) `@{slug}` · default
- (b) `@{slug} · {Brand Name}` · más explícito
- (c) Otro · texto libre

**Q: Image-gen default** — solo si hay ≥1 provider configurado:
- "Cuando generes imágenes, ¿prefieres elegir cada vez o fijar un provider?"
  - (a) Preguntar cada vez
  - (b) Usar siempre {primer provider configurado}
  - (c) Otro provider · listar los configurados

#### 3. Persiste

Escribe a `brand/{slug}/content/config.json` (PATCH vía endpoint o crea/edita el archivo directo):

```json
{
  "image_generation": {
    "mode": "ask" | "fixed",
    "provider": "nanobanana" | "replicate" | "fal" | null,
    "model": null
  },
  "carousel": {
    "logo_url": null,
    "footer_text": "@growth4u · Growth Systems",
    "primary_color": null,
    "accent_color": null,
    "enabled_templates": null
  }
}
```

`logo_url: null` siempre — el logo lo gestiona la skill `visual-identity` directamente sobre el brand-book. Si esta skill alguna vez lo override-a, está duplicando responsabilidad.

`null` en colores/typography significa "el brand-book ya lo tiene, no sobrescribir". DO NOT escribir colores ni typography aquí si ya están en design-tokens.json.

#### 4. Reportar al setup.md

Añade al narrative `setup.md` (Step 5) una sección:

```markdown
## Visual & Carousel

**Detectado del brand-book**:
- Primary: `#032149` (navy) · Accent: `#0faec1` (teal)
- Heading: Manrope · Body: Roboto
- Logo: ✓ presente en `brand-book/visual-identity/logo-light.png`

**Llenado en setup**:
- Footer text: `@growth4u · Growth Systems`
- Image-gen default: Nano Banana (Gemini)
```

Si el logo está marcado `missing: true`:

```
- Logo: registrado como missing (cliente sin logo, se usará wordmark de texto)
```

Si `pending` cuando entraste a esta sección, no debiste haber llegado aquí — el bloqueo del paso 2 te debió haber parado.

> **Nota**: la creación de la task `Visual Templates` en P14 NO es responsabilidad
> de esta skill. Esa task nace con el proyecto Content Engine (definida en
> el template de `create-project.ts`, `T07`). Si la brand es legacy (P14
> creado antes de que T07 existiese, p.ej. growth4u), Mission Control la
> añade retroactivamente vía `POST /api/content-engine/templates/ensure-task`
> al pulsar el CTA del empty state del panel de carrusel. Esta skill no
> tiene que tocarla.

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
| 📰 [News Monitor]({MC_BASE}/dashboard/{slug}/system?cron=News+Monitor) | 7am L-V | `news-prompts/*.yml` + `pov-bank.json` + `content-pillars.md` + `cadence-config.yml` | `idea-queue.json` (con angle_draft) + `research-signals/{date}-news.json` (audit log) |
| 🕵️ [Competitor Monitor]({MC_BASE}/dashboard/{slug}/system?cron=Competitor+Monitor) | 7am L-V | `sources.json` + `pov-bank.json` + `content-pillars.md` + `cadence-config.yml` | `idea-queue.json` (con angle_draft) + `research-signals/{date}-creators.json` (audit log) |
| 🔑 [Keyword Research]({MC_BASE}/dashboard/{slug}/system?cron=Keyword+Research) | semanal | `keywords-seed/*.yml` | `research-signals/{date}-keywords.json` |
| ❓ [PAA Monitor]({MC_BASE}/dashboard/{slug}/system?cron=PAA+Monitor) | semanal lunes 6am | `paa-queries/*.yml` | `research-signals/{date}-paa.json` |
| 📬 [Editorial Dispatch]({MC_BASE}/dashboard/{slug}/system?cron=Editorial+Dispatch) | 8:30 L-V | `idea-queue.json` + `cadence-config.yml` | Discord/Slack del cliente |
| 🔍 [Idea Dedupe Audit]({MC_BASE}/dashboard/{slug}/system?cron=Idea+Dedupe+Audit) | lunes 9am | `idea-queue.json` (últimos 7d) | `recurring-tasks/content-dedupe-audit/{date}.json` (solo reporte, no modifica) |
| 🎯 POV Bank Refresh | 1 del mes 9am | `clarify-history.json` (último mes) | `pov-bank.json` (refinado, versionado) |

**Nota arquitectura**: News Monitor y Competitor Monitor escriben ideas con `angle_draft` directamente en `idea-queue.json` (flujo unificado). Los archivos en `research-signals/` son log auditable, no input intermedio. La antigua skill `idea-builder` está deprecada.

## Cómo iterar

- Para regenerar TODOS los configs: pídeselo a Sancho en este chat ("regenera el setup")
- Para editar un config concreto sin regenerar: MC UI → Inputs → sección que toque
- Para añadir/quitar profiles a vigilar: MC UI → Inputs → 🕵️ Perfiles a monitorizar
- Para ajustar la cadencia: MC UI → Inputs → ⏰ Cadencia
```

Sustituye `{MC_BASE}` por la URL real del MC del cliente (típicamente `https://localhost:3000` en dev, o la URL de producción del cliente).

### 6. Register Content Engine crons

Como ÚLTIMO paso técnico antes de cerrar con el humano, registra los 5 crones de Content Engine para este cliente. Sin esto, los configs están en disco pero el motor no arranca mañana.

Ejecuta:

```bash
bash ~/.openclaw/workspace-sancho/scripts/setup-content-engine-crons.sh {slug}
```

El script:
- Lee la plantilla canónica `_system/content-engine-cron-jobs.json`
- Sustituye `{SLUG}` y `{NAME}` por los valores del cliente
- Registra cada cron vía `openclaw cron add` (los 5: News Monitor, Competitor Monitor, Editorial Dispatch, PAA Monitor, Idea Dedupe Audit)
- Es idempotente: si un cron ya existe (por nombre exacto), lo skipea
- Devuelve exit 1 si algún `openclaw cron add` falla

Si el script termina con errores:
- NO marques esta skill como completed
- Reporta los crones que sí se crearon y los que fallaron
- Indica al humano qué hacer (ej. ejecutar el script a mano)

Si exit 0:
- Continúa al paso 7 (confirm with human)

### 7. Confirm with human

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
