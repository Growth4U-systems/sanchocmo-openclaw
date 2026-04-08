# Niche Discovery v3 — Output Schema
<!-- v3.3 -->

## Progresión de Columnas

- **Phase 6** produce 14 columnas (incluye `Reason for Invalidation` y `Notes` — columnas de trabajo)
- **Phase 7b** añade 4 columnas: SWOT_Score, ICP_Score, Product_Score, Triple_Filter_Result
- **Phase 10** añade 7 columnas de scoring y **elimina** `Reason for Invalidation` y `Notes`
- **Tabla final**: 23 columnas (14 - 2 + 4 + 7 = 23)

## Final Output (`current.md` — Phase 10)

El entregable final NO es una tabla plana de 23 columnas. Es un **documento estructurado por Pain Clusters** con personas detalladas dentro de cada cluster.

### Estructura jerárquica:
```
current.md
├── Executive Summary (recomendación top 2-3)
├── Pain Clusters (5-10 grupos)
│   ├── Cluster A: [Nombre]
│   │   ├── Pain Cluster statement
│   │   ├── Persona 1 (The X) — JTBD + Hypothesis + Scoring
│   │   ├── Persona 2 (The Y) — JTBD + Hypothesis + Scoring
│   │   └── ...
│   ├── Cluster B: [Nombre]
│   └── ...
├── Overlap Map (personas que cruzan clusters)
├── Ranking Final (tabla ordenada por score)
├── Resumen Visual (tabla clusters)
├── Recomendación Estratégica
└── Fuentes
```

### Campos por Persona:
| Campo | Tipo | Descripción |
|-------|------|-------------|
| Nombre memorable | string | "The X" con contexto (ej: "The 3-Agency Veteran") |
| Frase en primera persona | string | Cita que define su dolor |
| Quién | string | ≥3 dimensiones: rol + etapa + tamaño + dolor + contexto |
| JTBD | string | "Cuando [Situación], quiero [Motivación], para poder [Resultado]" |
| Hypothesis | string | "Creemos que [NICHO] se siente frustrado por [PROBLEMA]..." (template completo) |
| Problemas | string | Refs al banco de problemas (#N) |
| Alternativas | string | Qué usan hoy |
| Dónde está | string | Canales, comunidades, eventos específicos |
| Trigger de compra | string | Momento exacto en que busca solución |
| Pain Score | 2-99 | Severidad del dolor |
| Reachability Score | 2-99 | Facilidad de alcance |
| Market Size (SAM) | number | Personas en país target |

### Campos por Pain Cluster:
| Campo | Tipo | Descripción |
|-------|------|-------------|
| Letra + emoji | string | 🔴 A, 🟠 B, etc. |
| Nombre memorable | string | 2-3 palabras (ej: "Channel Death") |
| Pain Cluster statement | string | Frase emocional compartida (max 15 palabras) |
| Por qué contratan | string | Fit producto-cluster |
| Personas | array | Lista de personas miembro |

## Intermediate File Formats

| Phase | File | Format |
|-------|------|--------|
| 2 | config.json | JSON: life_contexts[], product_words[], sources{} |
| 3 | urls.json | JSON array: {url, title, snippet, life_context, product_word, source_type} |
| 4 | docs/*.md | One markdown per scraped page + manifest.json |
| 5 | problems.md | Markdown table: Problem, Persona, Functional Cause, Emotional Load, Evidence, Alternatives, URLs |
| 6b | niches-raw/merged.md | Markdown table: 14 columns — personas específicas deduplicadas |
| 6c | niches-raw/clusters.md | Pain Clusters: 5-10 grupos por dolor compartido + personas miembro nombradas |
| 7 | niches-filtered.md | Same 14 columns + Valid/Reason updated |
| 7b | niches-triple.md | 14 columns + SWOT_Score, ICP_Score, Product_Score, Triple_Filter_Result |
| 8 | niches-confirmed.md | Same as 7b, user-edited |
| 9 | scored.md | Markdown sections per niche: Pain, Market Size, Reachability |
| 10 | current.md | Final 23-column table |
| 10 | final-table.csv | CSV export of current.md |

## Cross-Pillar Data Flow

| Data | Consumed By |
|------|-------------|
| Pain Clusters (grupos + statements + personas) | positioning-messaging (messaging por cluster), content-workflow (content pillars por cluster), channel-prioritization |
| Selected ECPs/Personas (name, JTBD, scores) | positioning-messaging, content-workflow |
| JTBD per ECP | content-workflow, outreach-workflow |
| Pain scores | phase-0-diagnostic, experiment design |
| Reachability + channels | channel-prioritization, outreach-sequence-builder |
| Market size | budget-constraints, scaling decisions |
| Current alternatives | positioning-messaging, pricing-hooks |
| Triple Filter results | ecp-validation (downstream) |

## Coverage Thresholds

- **Lite**: 50+ problems scraped, Triple Filter applied, 3-7 ECPs scored, top 3 recommended
- **Deep**: 500+ problems, 5+ source types, TAM/SAM per ECP, customer data integrated, multi-market analysis

## Valid Source Types

### B2C/SMB Sources (Forum Pipeline)
- `"reddit"` — Reddit posts and comments
- `"quora"` — Quora answers
- `"twitter"` — X/Twitter posts
- `"community-forum"` — Thematic forums (forocoches, rankia, etc.)
- `"g2-review"`, `"capterra-review"`, `"trustpilot-review"` — Review platforms
- `"app-store-review"` — App/Play Store reviews

### B2B Enterprise Sources
- `"case-study"` — Competitor website case studies
- `"job-posting"` — LinkedIn Jobs, Indeed, vertical boards
- `"earnings-call"` — Public company earnings transcripts
- `"conference-agenda"` — Industry conference session topics
- `"linkedin"` — LinkedIn posts and comments from ICP decision makers
- `"trade-publication"` — Vertical media editorial themes
- `"regulatory"` — New regulations creating mandatory problems
- `"expert-interview"` — Direct practitioner conversations
- `"micro-interview"` — Quick structured interviews with ICP members

### Foundation Harvest Sources
- `"competitor-intelligence-lens3"` — From existing competitor-intelligence pillar
- `"market-intelligence"` — From existing market-intelligence pillar
- `"self-intelligence-lens3"` — From existing self-intelligence pillar
