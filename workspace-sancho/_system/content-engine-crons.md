# Content Engine — Cron Definitions (Replicable)

> Motor comun para todos los clientes. Lo unico que cambia por cliente
> son los archivos en `brand/{slug}/content/configs/` y `content-pillars.md`.
> Aprobado: 2026-04-25

---

## Secuencia diaria

```
06:00  paa-monitor (solo lunes)
07:00  news-monitor + competitor-monitor + daily-pulse (paralelo)
07:30  insight-classifier (espera a que terminen los inputs)
08:00  insight-to-content-mapper (genera ideas con angles)
08:30  editorial-dispatch (selecciona + envia a Discord para approval)
```

Despues del dispatch, el flujo es humano-driven:
- Humano aprueba en Discord → link a MC UI
- Clarify + Draft + Edit + Approve → Metricool publica

## Cron 1: News Monitor

```yaml
id: content-news-monitor
schedule: "0 7 * * *"  # diario 7am
skill: news-monitor
input:
  configs: "brand/{slug}/content/configs/news-prompts/*.yml"
  pillars: "brand/{slug}/content/content-pillars.md"
output: "brand/{slug}/content/research-signals/{YYYY-MM-DD}-news.json"
tool: Brave Search API / Perplexity
notes: "Busca noticias relevantes por pillar usando los prompts configurados"
```

## Cron 2: PAA Monitor

```yaml
id: content-paa-monitor
schedule: "0 6 * * 1"  # lunes 6am
skill: paa-monitor
input:
  configs: "brand/{slug}/content/configs/paa-queries/*.yml"
output: "brand/{slug}/content/research-signals/{YYYY-MM-DD}-paa.json"
tool: DataforSEO People Also Ask API
notes: "Extrae preguntas reales que la audiencia hace. Semanal porque las PAA no cambian tan rapido."
```

## Cron 3: Competitor + Reference Creator Monitor

```yaml
id: content-competitor-monitor
schedule: "0 7 * * *"  # diario 7am
skill: thief-marketers (refactored)
input:
  competitors: "brand/{slug}/content/configs/competitors/*.yml"
  creators: "brand/{slug}/content/configs/reference-creators/*.yml"
output: "brand/{slug}/content/research-signals/{YYYY-MM-DD}-creators.json"
tool: LinkedIn scraper (TBD V2), RSS, API por plataforma
notes: "Top 5 contenidos mejor performando por competidor/creator en los ultimos 7 dias"
```

## Cron 4: Daily Pulse

```yaml
id: content-daily-pulse
schedule: "0 7 * * *"  # diario 7am
skill: daily-pulse
input:
  internal: "Slack channels, Notion (si configurado), transcripts recientes"
output: "brand/{slug}/content/research-signals/{YYYY-MM-DD}-pulse.json"
notes: "Inteligencia interna. Detecta temas emergentes de conversaciones del equipo."
```

## Cron 5: Classify Signals

```yaml
id: content-classify-signals
schedule: "30 7 * * *"  # diario 7:30am (espera a inputs)
skill: insight-classifier
input:
  signals: "brand/{slug}/content/research-signals/{YYYY-MM-DD}-*.json"
output: "Enriquece in-place con signal_type[] (aha-moment, conflict, contrarian, system, milestone, vulnerability, metric)"
notes: "Non-blocking enricher. Si falla, ideas siguen funcionando sin tags."
```

## Cron 6: Generate Ideas

```yaml
id: content-generate-ideas
schedule: "0 8 * * *"  # diario 8am
skill: insight-to-content-mapper (extended)
input:
  signals: "brand/{slug}/content/research-signals/{YYYY-MM-DD}-*.json"
  pillars: "brand/{slug}/content/content-pillars.md"
  brand_voice: "brand/{slug}/brand-book/brand-voice/brand-voice-current.md"
output: "brand/{slug}/content/idea-queue.json (append)"
notes: "Convierte signals clasificados en ideas con angle_draft. Cada idea lleva signal.summary + signal.url + signal.date + angle_draft + pov_confidence."
```

## Cron 7: Editorial Dispatch

```yaml
id: content-editorial-dispatch
schedule: "30 8 * * *"  # diario 8:30am
skill: content-calendar-planner (extended)
input:
  ideas: "brand/{slug}/content/idea-queue.json"
  cadence: "brand/{slug}/content/configs/cadence-config.yml"
output: "Mensaje en Discord con N (3-5) ideas candidatas + botones [Si][Mas tarde][No]"
selection_criteria:
  - "status = 'ready'"
  - "age <= 14 days (recency_score = exp(-age_days/5))"
  - "content_type matches slot del dia"
  - "ORDER BY recency_score DESC, pov_confidence DESC"
  - "LIMIT 3-5"
stale_policy: "Ideas > 14 dias → status = 'stale', archivadas automaticamente"
notes: "Dispatcha al Idea Approval Loop (Discord). Tras Si, link a MC UI."
```

## Cron 8: POV Bank Refresh (mensual)

```yaml
id: content-pov-bank-refresh
schedule: "0 9 1 * *"  # dia 1 del mes, 9am
skill: brand-voice
input:
  pov_bank: "Neon tables: pov_banks, pov_pillars, pov_clarify_patterns, pov_evidence_items"
  current_voice: "brand/{slug}/brand-book/brand-voice/brand-voice-current.md"
output: "Crea propuestas revisables en Neon; no modifica postura canonica sin aprobacion humana"
notes: "Cierra el feedback loop. Los patterns de Clarify viven en Neon y refinan el POV Bank mediante propuestas."
```

---

## Setup por cliente nuevo

Para activar el Content Engine en un cliente nuevo:

1. Ejecutar Proceso 1 (Strategy → Pillars → Setup Configs)
2. Los configs generados en `brand/{slug}/content/configs/` son las VARIABLES
3. Los 8 crons de arriba se activan usando los mismos IDs pero apuntando al `{slug}` del cliente
4. Cada cron lee sus configs del `brand/{slug}/content/configs/` del cliente

**Lo que hay que crear por cliente**:
- `content/content-pillars.md` (via skill content-pillars)
- `content/configs/*.yml` (via setup workshop o skill automatizado)
- `content/idea-queue.json` (vacio)
- POV Bank importado o creado en Neon

**Lo que NO hay que crear** (es comun):
- Skills (mismas para todos)
- Protocolos (mismos para todos)
- Cron definitions (mismas, solo cambia el slug)
- Folder structure (misma)

---

## Variables por cliente (resumen)

| Variable | Donde vive | Ejemplo Growth4U |
|----------|-----------|-------------------|
| Pillars | `content/content-pillars.md` | P1-P5 (Sistemas, Multi-Canal, Regulados, Anti-Agencia, IA) |
| News prompts | `content/configs/news-prompts/*.yml` | 5 archivos con queries por pillar |
| PAA queries | `content/configs/paa-queries/*.yml` | 5 archivos con preguntas seed |
| Keywords | `content/configs/keywords-seed/*.yml` | 5 archivos BOFU-first |
| Competitors | `content/configs/competitors/*.yml` | Snowball, Product Hackers, etc. |
| Reference creators | `content/configs/reference-creators/*.yml` | Elena Verna, Lenny, etc. |
| Cadence | `content/configs/cadence-config.yml` | LinkedIn 3-5x, X 3-5x, Blog 2x/mes, Newsletter 1x/sem |
| Canales activos | Dentro de cadence-config | linkedin, twitter, blog, newsletter |
| Perfiles | Dentro de cadence-config | Alfonso, Martin |
