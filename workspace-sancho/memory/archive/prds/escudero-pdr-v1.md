# PDR — Escudero SEO+GEO Intelligence Platform

**Producto:** Escudero — SEO+GEO Intelligence & Content Engine
**Versión:** 1.0
**Fecha:** 2026-03-17
**Autor:** Equipo Escudero
**Destino de integración:** SanchoCMO (Next.js 15 + Drizzle + PostgreSQL + Better Auth)
**Estado:** Completo — 6 fases implementadas

---

## 1. Problema / Contexto

### 1.1 ¿Qué resuelve Escudero?

Las empresas necesitan visibilidad tanto en buscadores tradicionales (Google) como en motores de IA generativa (ChatGPT, Perplexity, Claude, Gemini). Actualmente:

1. **No saben dónde están** — No tienen una visión unificada de su presencia en SEO + GEO (Generative Engine Optimization).
2. **No saben qué les falta** — No detectan gaps donde competidores aparecen y ellos no (ni en SERPs ni en respuestas de IA).
3. **No saben qué hacer** — No reciben recomendaciones accionables con pasos concretos y impacto esperado.
4. **No pueden actuar** — No tienen un motor de contenido que genere artículos optimizados para ambos canales.
5. **No conocen sus propios activos** — No inventarían su blog, redes sociales, schemas, ni stack técnico.

### 1.2 Propuesta de valor

Escudero es una plataforma end-to-end que cubre el ciclo completo:

```
Diagnóstico → Plan → Acción → Medición
```

- **Diagnóstico**: SEO Audit (Lighthouse + health check) + Own Media Audit (blog, social, schema, tech)
- **Plan**: GEO Analysis (multi-provider LLM) + Gap Analysis (SEO×GEO cross-reference) + Recommendations
- **Acción**: Content Engine (artículos GEO-optimizados + cover images + JSON-LD schemas)
- **Medición**: Key Opportunity Scoring (5 dimensiones) + Domain Intelligence

### 1.3 Contexto técnico actual

| Componente | Tecnología |
|---|---|
| Backend | Python 3.11+, FastAPI 0.115, async SQLAlchemy 2.0 |
| Base de datos | SQLite (dev) / PostgreSQL (prod) — dual-compatible |
| Frontend | Next.js 14.2, React 18, TypeScript, Tailwind CSS 3.4 |
| UI Components | Radix UI (Dialog, Dropdown, Select, Tabs, Tooltip, Progress) |
| LLM Access | OpenRouter (preferred), OpenAI, Anthropic, Google GenAI directo |
| SERP | Serper.dev (preferred) o SerpAPI |
| Keyword Data | DataForSEO (volume, CPC, KD) |
| Task Runner | Inline (thread + new event loop) para dev; Celery + Redis para prod |
| Python env | Conda `seogeo` |

### 1.4 Sistema destino — SanchoCMO

| Componente | Tecnología |
|---|---|
| Framework | Next.js 15 (App Router) |
| ORM | Drizzle ORM |
| DB | PostgreSQL (Supabase) |
| Auth | Better Auth |
| Monetización | Polar.sh credits |
| Vector DB | Qdrant |
| UI | shadcn/ui + Tailwind v4 |
| Design | Comic-style (parchment theme) |

**Implicación**: La integración requiere migrar la lógica del backend Python a API routes de Next.js o mantener el backend Python como microservicio. La base de datos PostgreSQL es compatible directamente (los tipos `PortableUUID`/`PortableJSON` ya soportan PostgreSQL nativo).

---

## 2. Arquitectura del Sistema

### 2.1 Estructura de directorios

```
backend/
├── app/
│   ├── config.py                    # Settings con pydantic-settings (.env)
│   ├── database.py                  # SQLAlchemy engine + session + migrations
│   ├── main.py                      # FastAPI app + CORS + lifespan
│   ├── models/                      # 15 archivos, 19 tablas SQLAlchemy
│   │   ├── compat.py                # PortableUUID, PortableJSON, PortableArray
│   │   ├── project.py               # Project, Brand, BrandDomain
│   │   ├── niche.py                 # Niche, NicheBrand
│   │   ├── prompt.py                # PromptTopic, Prompt
│   │   ├── seo.py                   # SerpQuery, SerpResult, ContentClassification
│   │   ├── geo.py                   # GeoRun, GeoResponse, BrandMention, SourceCitation
│   │   ├── domain.py                # Domain, ExclusionRule, ProjectDomain
│   │   ├── analysis.py              # GapAnalysis, GapItem, ActionBrief
│   │   ├── influencer.py            # InfluencerResult
│   │   ├── audit.py                 # SiteAudit
│   │   ├── job.py                   # BackgroundJob
│   │   ├── recommendation.py        # Recommendation
│   │   ├── content.py               # ContentBrief
│   │   └── own_media.py             # OwnMediaAudit
│   ├── engines/                     # Business logic (46 archivos)
│   │   ├── seo/                     # SERP fetching, content classification, health checks
│   │   ├── geo/                     # LLM adapters, response parsing, aggregation
│   │   ├── domain/                  # Domain classification (rules + LLM)
│   │   ├── intelligence/            # Gap analysis, scoring, recommendations, onboarding
│   │   ├── content/                 # Article generation, keyword suggestion, covers, schemas
│   │   └── own_media/               # Blog scanner, social discovery, schema scanner, tech detector
│   ├── api/v1/                      # 16 archivos de endpoints FastAPI
│   ├── tasks/                       # 9 archivos de background tasks
│   └── schemas/                     # Pydantic request/response schemas
frontend/
├── src/
│   ├── app/                         # 30 pages (Next.js App Router)
│   ├── components/                  # AppSidebar, UI components
│   └── lib/api.ts                   # API client con todas las interfaces
```

### 2.2 Diagrama de flujo del sistema

```
┌──────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js 14)                      │
│                                                                    │
│  Quick Start → New Project → Setup → Niches → Analysis → Action   │
│  ┌──────┐ ┌─────┐ ┌──────┐ ┌─────┐ ┌──────┐ ┌─────────────────┐ │
│  │Audit │ │ Own │ │ GEO  │ │Gaps │ │Recs  │ │ Content Engine  │ │
│  │Page  │ │Media│ │Runs  │ │Page │ │Page  │ │ Articles+Covers │ │
│  └──┬───┘ └──┬──┘ └──┬───┘ └──┬──┘ └──┬───┘ └────────┬────────┘ │
└─────┼────────┼───────┼────────┼───────┼──────────────┼──────────┘
      │        │       │        │       │              │
      ▼        ▼       ▼        ▼       ▼              ▼
┌──────────────────────────────────────────────────────────────────┐
│                     BACKEND API (FastAPI)                          │
│  /api/v1/audit  /own-media  /geo  /analysis  /recommendations     │
│  /api/v1/content  /seo  /domains  /projects  /niches  /prompts    │
│  /api/v1/influencers  /sancho  /briefs  /influencer-brief         │
└────────────────────────────┬─────────────────────────────────────┘
                             │
      ┌──────────────────────┼──────────────────────┐
      ▼                      ▼                      ▼
┌───────────┐  ┌──────────────────────┐  ┌──────────────────┐
│  ENGINES  │  │   EXTERNAL APIS      │  │   DATABASE        │
│           │  │                      │  │                   │
│ SEO       │  │ Google PSI (free)    │  │ SQLite (dev)      │
│ GEO       │  │ Serper/SerpAPI       │  │ PostgreSQL (prod) │
│ Domain    │  │ DataForSEO           │  │                   │
│ Intel     │  │ OpenRouter (LLMs)    │  │ 19 tables         │
│ Content   │  │ YouTube Data API v3  │  │                   │
│ Own Media │  │ Google CSE           │  │                   │
│           │  │ Apify (Instagram)    │  │                   │
└───────────┘  └──────────────────────┘  └──────────────────┘
```

### 2.3 Compatibilidad de tipos SQLite ↔ PostgreSQL

El sistema usa 3 tipos portables definidos en `models/compat.py`:

| Tipo portable | SQLite | PostgreSQL |
|---|---|---|
| `PortableUUID` | `String(36)` | `UUID` nativo |
| `PortableJSON` | `JSON` | `JSONB` |
| `PortableArray` | `JSON` (list) | `ARRAY` nativo |

Esto permite desarrollo local con SQLite y producción con PostgreSQL sin cambiar modelos.

### 2.4 Background Tasks — `dispatch_inline()`

Para desarrollo local sin Redis, el sistema usa un patrón de ejecución inline:

1. Se crea un `BackgroundJob` en la DB con status `"pending"`
2. `dispatch_inline()` lanza un **thread** Python con su propio **event loop** y **session factory** independiente
3. El thread ejecuta el coroutine de la tarea, actualizando `step_info` y `progress` en la DB
4. El frontend hace **polling cada 3 segundos** via `GET /geo/jobs/{job_id}/status` para mostrar progreso
5. Al completar, el job se marca `"completed"` con `completed_at`

En producción con Redis: se usa Celery con las mismas funciones async.

---

## 3. Modelo de Datos Completo

### 3.1 Tabla: `projects`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | Identificador único |
| `name` | String(255) | Nombre del proyecto/empresa |
| `slug` | String(255) UNIQUE | Slug URL-safe |
| `description` | String, nullable | Descripción libre |
| `website` | String(512), nullable | URL del sitio web |
| `market` | String(50), default="es" | Mercado objetivo (es, us, uk, de, fr...) |
| `language` | String(10), default="es" | Idioma del contenido |
| `created_at` | DateTime | Fecha de creación |
| `updated_at` | DateTime | Última modificación |

**Relaciones**: `brands[]`, `prompt_topics[]`, `niches[]`

### 3.2 Tabla: `brands`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `project_id` | FK → projects | |
| `name` | String(255) | Nombre de la marca |
| `domain` | String(512), nullable | Dominio web principal |
| `is_client` | Boolean, default=False | True = marca del cliente; False = competidor |
| `aliases` | PortableArray, nullable | Nombres alternativos para detección |
| `company_type` | String(255), nullable | Tipo de empresa (extraído por LLM) |
| `service_description` | Text, nullable | Descripción de servicios |
| `target_market` | String(255), nullable | Mercado objetivo |
| `about_summary` | Text, nullable | Resumen de la empresa |
| `analyzed_at` | DateTime, nullable | Fecha del último análisis LLM |
| `created_at` | DateTime | |

**Relaciones**: `brand_domains[]`, `project`

### 3.3 Tabla: `brand_domains`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `brand_id` | FK → brands | |
| `domain` | String(512) | Dominio adicional de la marca |
| `is_primary` | Boolean, default=False | |

### 3.4 Tabla: `niches`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `project_id` | FK → projects | |
| `name` | String(255) | Nombre del nicho |
| `slug` | String(255) | Slug URL-safe |
| `description` | Text, nullable | |
| `brief` | PortableJSON, nullable | `{A: contexto_marca, B: objetivos, C: audiencia, D: mensajes_clave}` |
| `sort_order` | Integer, default=0 | |
| `created_at` | DateTime | |

**Relaciones**: `niche_brands[]`, `project`

### 3.5 Tabla: `niche_brands` (Join table)

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `niche_id` | FK → niches | |
| `brand_id` | FK → brands | Competidor asignado a este nicho |

### 3.6 Tabla: `prompt_topics`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `project_id` | FK → projects | |
| `name` | String(255) | Nombre del topic (ej: "Discovery", "Comparison") |
| `slug` | String(255) | |
| `description` | Text, nullable | |
| `sort_order` | Integer | |

**Relaciones**: `prompts[]`

### 3.7 Tabla: `prompts`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `topic_id` | FK → prompt_topics | |
| `project_id` | FK → projects | |
| `niche_id` | FK → niches, nullable | Nicho al que pertenece |
| `text` | Text | Texto del prompt GEO |
| `language` | String(10), default="es" | |
| `is_active` | Boolean, default=True | |
| `sort_order` | Integer | |
| `created_at`, `updated_at` | DateTime | |

### 3.8 Tabla: `serp_queries`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `project_id` | FK → projects | |
| `keyword` | String(512) | Keyword de búsqueda |
| `language` | String(10), default="es" | |
| `location` | String(100), default="Spain" | |
| `niche` | String(255), nullable | Slug del nicho |
| `last_fetched_at` | DateTime, nullable | |
| `created_at` | DateTime | |

**Relaciones**: `results[]` (SerpResult)

### 3.9 Tabla: `serp_results`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `query_id` | FK → serp_queries | |
| `url` | String(2048) | URL del resultado |
| `domain` | String(512), nullable | Dominio extraído |
| `title` | Text, nullable | Título del resultado |
| `snippet` | Text, nullable | Snippet de Google |
| `position` | Integer | Posición 1-10+ |
| `result_type` | String(50), nullable | organic, featured_snippet, etc. |
| `fetched_at` | DateTime | |

**Relaciones**: `classification` (ContentClassification, 1:1)

### 3.10 Tabla: `content_classifications`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `serp_result_id` | FK → serp_results, UNIQUE | |
| `content_type` | String(20) | review, ranking, solution, news, forum, other |
| `confidence` | Float, nullable | 0.0-1.0 |
| `classified_by` | String(20), default="auto" | url_pattern, title_keyword, llm, manual |
| `classified_at` | DateTime | |

### 3.11 Tabla: `geo_runs`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `project_id` | FK → projects | |
| `niche_id` | FK → niches, nullable | |
| `name` | String(255), nullable | |
| `status` | String(20), default="pending" | pending, running, completed, failed |
| `providers` | PortableArray | ["openai", "anthropic", "gemini", "perplexity"] |
| `total_prompts` | Integer | |
| `completed_prompts` | Integer | |
| `started_at`, `completed_at`, `created_at` | DateTime | |

**Relaciones**: `responses[]` (GeoResponse)

### 3.12 Tabla: `geo_responses`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `run_id` | FK → geo_runs | |
| `prompt_id` | FK → prompts | |
| `provider` | String(20) | openai, anthropic, gemini, perplexity |
| `raw_response` | Text | Respuesta completa del LLM |
| `model_used` | String(100), nullable | ID del modelo (ej: gpt-4o, claude-sonnet-4.5) |
| `tokens_used` | Integer, nullable | |
| `latency_ms` | Integer, nullable | |
| `turn` | Integer, default=1 | 1=discovery, 2=why, 3=sources |
| `created_at` | DateTime | |

**Relaciones**: `mentions[]`, `citations[]`

### 3.13 Tabla: `brand_mentions`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `response_id` | FK → geo_responses | |
| `brand_id` | FK → brands | |
| `mention_text` | Text | Texto exacto de la mención |
| `position` | Integer, nullable | Orden de aparición (1-based) |
| `sentiment` | String(20), nullable | positive, neutral, negative |
| `sentiment_score` | Float, nullable | -1.0 a 1.0 |
| `is_recommended` | Boolean, default=False | Si el LLM lo recomienda explícitamente |
| `context` | Text, nullable | Oración completa que rodea la mención |

### 3.14 Tabla: `source_citations`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `response_id` | FK → geo_responses | |
| `url` | String(2048) | URL citada por el LLM |
| `domain` | String(512), nullable | |
| `title` | Text, nullable | Título del enlace (si es markdown link) |
| `position` | Integer, nullable | |
| `brand_id` | FK → brands, nullable | Si la URL pertenece a una marca conocida |
| `created_at` | DateTime | |

### 3.15 Tabla: `domains`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `domain` | String(512), UNIQUE | Dominio normalizado (sin www.) |
| `display_name` | String(255), nullable | Nombre legible |
| `domain_type` | String(20), nullable | editorial, corporate, ugc, competitor, reference, institutional, aggregator |
| `accepts_sponsored` | Boolean, nullable | Si acepta contenido patrocinado |
| `monthly_traffic_estimate` | Integer, nullable | |
| `domain_authority` | Integer, nullable | 0-100 |
| `country` | String(10), nullable | |
| `language` | String(10), nullable | |
| `notes` | Text, nullable | |
| `classified_by` | String(20), default="auto" | known_list, pattern, llm, manual |
| `classified_at`, `created_at`, `updated_at` | DateTime | |

### 3.16 Tabla: `exclusion_rules`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `project_id` | FK → projects | |
| `rule_name` | String(255) | |
| `description` | Text, nullable | |
| `rule_type` | String(50) | domain_exact, domain_pattern, content_type |
| `rule_value` | PortableJSON | Valor de la regla (ej: `{"domains": ["n26.com"]}`) |
| `is_active` | Boolean, default=True | |
| `created_at` | DateTime | |

### 3.17 Tabla: `project_domains`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `project_id` | FK → projects | |
| `domain_id` | FK → domains | |
| `niche` | String(255), nullable | |
| `is_excluded` | Boolean, default=False | |
| `priority_score` | Float, nullable | |
| `notes` | Text, nullable | |

### 3.18 Tablas: `gap_analyses`, `gap_items`, `action_briefs`

**`gap_analyses`**:

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `project_id` | FK → projects | |
| `niche_id` | FK → niches, nullable | |
| `niche_slug` | String(255), nullable | |
| `geo_run_id` | FK → geo_runs, nullable | |
| `analysis_type` | String(20) | full, geo_only, seo_only |
| `status` | String(20) | pending, completed |
| `results` | PortableJSON, nullable | Resumen agregado |
| `created_at`, `completed_at` | DateTime | |

**`gap_items`**:

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `analysis_id` | FK → gap_analyses | |
| `url` | String(2048) | URL donde hay un gap |
| `domain` | String(512), nullable | |
| `competitor_brands` | PortableJSON, nullable | `{brands: {name: count}}` |
| `client_present` | Boolean | Si el cliente aparece aquí |
| `found_in_geo` | Boolean | Encontrado en citaciones de LLM |
| `found_in_serp` | Boolean | Encontrado en Google SERPs |
| `content_type` | String(20), nullable | |
| `domain_type` | String(20), nullable | |
| `opportunity_score` | Float, nullable | 0-100 |
| `keyword` | String(512), nullable | |
| `niche` | String(255), nullable | |

**`action_briefs`**:

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `project_id` | FK → projects | |
| `gap_item_id` | FK → gap_items, nullable | |
| `target_url`, `target_domain` | String | |
| `recommended_content_type` | String(20), nullable | |
| `recommended_keyword` | String(512), nullable | |
| `recommended_approach` | Text, nullable | |
| `priority` | String(10), default="medium" | |
| `status` | String(20), default="pending" | |

### 3.19 Tabla: `influencer_results`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `project_id` | FK → projects | |
| `niche_id` | FK → niches, nullable | |
| `niche_slug` | String(255), nullable | |
| `job_id` | FK → background_jobs, nullable | |
| `platform` | String(20) | youtube, instagram |
| `handle` | String(255), nullable | @username |
| `display_name` | String(512), nullable | |
| `profile_url` | String(2048) | URL del perfil |
| `source_url` | String(2048), nullable | URL SERP que lo encontró |
| `subscribers` | Integer, nullable | |
| `snippet` | Text, nullable | |
| `recommendation_reason` | Text, nullable | |
| `relevance_score` | Float, nullable | 0-100 |
| `search_query` | String(512), nullable | |
| `created_at` | DateTime | |

### 3.20 Tabla: `site_audits`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `project_id` | FK → projects | |
| `url` | String(500) | URL auditada |
| `status` | String(20), default="pending" | |
| `lighthouse_scores` | PortableJSON, nullable | `{performance, accessibility, best_practices, seo}` (0-100) |
| `core_web_vitals` | PortableJSON, nullable | `{lcp, tbt, cls, fcp, si}` |
| `seo_health` | PortableJSON, nullable | `{meta_title, meta_description, mobile_friendly, has_sitemap, has_canonical, has_structured_data, ...}` |
| `issues` | PortableJSON, nullable | `[{title, type, severity, description, fix_steps, expected_impact}]` |
| `raw_data` | PortableJSON, nullable | Full PSI API response |
| `created_at`, `completed_at` | DateTime | |

### 3.21 Tabla: `background_jobs`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `celery_task_id` | String(255), nullable | |
| `project_id` | FK → projects, nullable | |
| `job_type` | String(50) | geo_run, seo_fetch, analysis, audit, influencer_discovery, onboarding, own_media |
| `status` | String(20), default="pending" | pending, running, completed, failed |
| `progress` | Float, default=0.0 | 0.0 a 1.0 |
| `result` | PortableJSON, nullable | Datos de resultado |
| `step_info` | PortableJSON, nullable | `{step: "scanning_blog", detail: "..."}` |
| `error` | Text, nullable | |
| `created_at`, `started_at`, `completed_at` | DateTime | |

### 3.22 Tabla: `recommendations`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `project_id` | FK → projects | |
| `niche_id` | FK → niches, nullable | |
| `category` | String(30) | technical_seo, geo_content, content_strategy, competitive |
| `severity` | String(20) | critical, high, medium, low |
| `title` | String(255) | Título de la recomendación |
| `description` | Text | Descripción detallada |
| `fix_overview` | Text, nullable | Resumen de la solución (markdown) |
| `fix_steps` | PortableJSON, nullable | `[{step, title, description, code_example?}]` |
| `expected_impact_pct` | Integer, nullable | 0-100, impacto esperado |
| `source` | String(30) | audit, geo_analysis, gap_analysis, content_analysis, own_media, geo_provider |
| `source_id` | PortableUUID, nullable | ID del registro fuente |
| `status` | String(20), default="open" | open, in_progress, resolved, dismissed |
| `created_at`, `resolved_at` | DateTime | |

### 3.23 Tabla: `content_briefs`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `project_id` | FK → projects | |
| `niche` | String(255) | Slug del nicho |
| `keyword` | String(512) | Keyword objetivo del artículo |
| `category` | String(50), default="guide" | ranking, comparison, guide, solution, authority, discovery, recommendation, trend, content_gap, influencer |
| `source` | String(50), default="manual" | gap_analysis, serp_data, geo_citation, manual, brief_llm |
| `recommendation_type` | String(20), default="keyword" | keyword, prompt |
| `geo_prompt_id` | FK → prompts, nullable | |
| `suggested_skill` | String(50), nullable | copywriting, content-strategy |
| `skill_context` | Text, nullable | |
| `buyer_stage` | String(30), nullable | awareness, consideration, decision, implementation |
| `generated_content` | Text, nullable | Contenido generado por el LLM |
| `opportunity_score` | Float, nullable | |
| `competitor_coverage` | PortableJSON, nullable | `{brand: count}` |
| `search_volume` | Integer, nullable | Volumen mensual |
| `cpc` | Float, nullable | Cost-per-click USD |
| `ev` | Integer, nullable | Estimated monthly visits |
| `kd` | Integer, nullable | Keyword difficulty 0-100 |
| `competitor_position` | Integer, nullable | |
| `prompt_text` | Text, nullable | |
| `title` | String(512), nullable | Título generado |
| `outline` | PortableJSON, nullable | `{sections: [{h2, points[], keyword_hint}]}` |
| `meta_description` | Text, nullable | |
| `target_word_count` | Integer, nullable | |
| `target_domain` | String(512), nullable | |
| `target_domain_rationale` | Text, nullable | |
| `provider` | String(50), nullable | |
| `model_used` | String(100), nullable | |
| `tokens_used` | Integer, nullable | |
| `direct_answer` | Text, nullable | Blockquote "Respuesta directa" |
| `faq_items` | PortableJSON, nullable | `[{question, answer}]` |
| `author_name` | String(200), nullable | |
| `author_credentials` | Text, nullable | E-E-A-T credentials |
| `author_schema` | PortableJSON, nullable | JSON-LD Person schema |
| `cover_image_url` | String(500), nullable | |
| `cta_config` | PortableJSON, nullable | `{type, text, url, placement[]}` |
| `seo_slug` | String(300), nullable | |
| `status` | String(20), default="recommended" | recommended, selected, briefed, generating, generated, approved |
| `created_at` | DateTime | |

### 3.24 Tabla: `own_media_audits`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | PortableUUID PK | |
| `project_id` | FK → projects | |
| `url` | String(500) | URL escaneada |
| `status` | String(20), default="pending" | |
| `blog_inventory` | PortableJSON, nullable | `{has_blog, blog_url, post_count, last_post_date, avg_word_count, posting_frequency, categories[], sample_posts[]}` |
| `social_profiles` | PortableJSON, nullable | `{linkedin: {found, url, ...}, twitter: {...}, instagram: {...}, youtube: {...}, facebook: {...}, tiktok: {...}}` |
| `schema_inventory` | PortableJSON, nullable | `{types_found[], missing_critical[], has_author_eeat, has_social_same_as, schemas[]}` |
| `tech_stack` | PortableJSON, nullable | `{cms, framework, cdn, tag_manager, hosting, analytics[], all_detections[]}` |
| `domain_metrics` | PortableJSON, nullable | |
| `youtube_data` | PortableJSON, nullable | |
| `overall_score` | Float, nullable | 0-100 (weighted: content=0.35, social=0.30, technical=0.35) |
| `content_score` | Float, nullable | 0-100 |
| `social_score` | Float, nullable | 0-100 |
| `technical_score` | Float, nullable | 0-100 |
| `created_at`, `completed_at` | DateTime | |

---

## 4. Requisitos Funcionales

### RF-01: Onboarding Automático

**Qué hace**: Dado un URL de empresa, analiza automáticamente el sitio web y sugiere nichos de mercado con competidores.

**Flujo**:
1. Usuario introduce URL en Quick Start
2. `domain_analyzer.py` → scrape HTML → extrae texto (title, meta, H1, body hasta 3000 chars)
3. Si scraping falla (403, timeout) → fallback a LLM knowledge (`_KNOWLEDGE_PROMPT`)
4. LLM (Gemini 2.5 Flash via OpenRouter) extrae: `company_type`, `services[]`, `target_market`, `summary`
5. `auto_onboarding.py` → LLM genera niches con competidores (`_NICHE_PROMPT`)
6. Se crea Project + Brand (is_client=True) + Niches + NicheBrands + Competitors

**Modelos LLM**: `google/gemini-2.5-flash` via OpenRouter
**Costo**: ~$0.003 por onboarding

**Endpoint**: `POST /projects/quick-start`
**Input**: `{url, market?, language?}`
**Output**: `{project_id, company_name, niches[]}`

### RF-02: Configuración de Nichos

**Qué hace**: Permite configurar cada nicho con un brief estratégico y asignar competidores.

**Brief structure** (JSON en `niche.brief`):
- `A` — Contexto de Marca: qué es el producto/servicio
- `B` — Objetivos del nicho: qué se quiere lograr
- `C` — Audiencia target: quién busca esto
- `D` — Mensajes clave: qué comunicar

**Endpoints**:
- `GET /projects/{id}/niches` — Listar nichos
- `GET /projects/{id}/niches/{slug}` — Detalle con competidores
- `POST /projects/{id}/niches` — Crear nicho
- `PUT /projects/{id}/niches/{slug}` — Actualizar (incluye brief)
- `POST /projects/{id}/niches/{slug}/competitors` — Asignar competidores
- `DELETE /projects/{id}/niches/{slug}/competitors/{brand_id}` — Quitar competidor

### RF-03: Análisis SEO (SERP Fetching)

**Qué hace**: Busca keywords en Google (via Serper/SerpAPI), guarda resultados, clasifica contenido y dominios.

**Flujo**:
1. `POST /seo/fetch` → crea SerpQuery + BackgroundJob
2. `seo_tasks.py` → llama Serper API con keyword + location
3. Para cada resultado orgánico: guarda SerpResult (url, domain, title, snippet, position)
4. `content_classifier.py` clasifica cada resultado:
   - **Tier 1**: URL patterns (regex) — ~60% accuracy, free
   - **Tier 2**: Title keywords — ~20% accuracy, free
   - **Tier 3**: LLM fallback — ~20% restante, ~$0.002/query
5. `domain/classifier.py` clasifica cada dominio:
   - **Rules engine**: 150+ known domains (editorial, corporate, ugc, institutional, aggregator, competitor)
   - **Pattern heuristics**: `blog.`, `.gob.es`, `forum.`, `wikipedia.`
   - **LLM fallback**: para dominios desconocidos

**Content types**: review, ranking, solution, news, forum, other
**Domain types**: editorial, corporate, ugc, competitor, reference, institutional, aggregator

**Exclusión automática**: `BANK_NEOBANK_FINTECH_DOMAINS` — 30+ dominios de bancos/neobancos/fintech se marcan como `is_excluded_fintech=True`

### RF-04: Análisis GEO (Multi-Provider LLM)

**Qué hace**: Envía prompts a múltiples LLMs y analiza qué marcas mencionan, con qué sentimiento, y qué fuentes citan.

**Providers soportados**:
| Provider | Modelo (via OpenRouter) | Modelo directo |
|---|---|---|
| OpenAI | `openai/gpt-4o` | `gpt-4o` |
| Anthropic | `anthropic/claude-sonnet-4.5` | `claude-sonnet-4-5-20250929` |
| Gemini | `google/gemini-2.5-flash` | Gemini API |
| Perplexity | `perplexity/sonar-pro` | Perplexity API |

**Conversación 3-turn** (3 turnos por prompt×provider):
- **Turn 1 (Discovery)**: Prompt original → Respuesta del LLM
- **Turn 2 (Why)**: "¿Por qué recomiendas X? ¿Qué criterios usaste?"
- **Turn 3 (Sources)**: "¿Qué fuentes o URLs respaldan tu respuesta?"

**Response Parser** (`response_parser.py`):
1. **Brand mentions**: búsqueda regex de cada brand name en el texto
   - Position: orden de aparición (1-based)
   - Sentiment: positive/neutral/negative (via signal words scoring)
   - Sentiment score: -1.0 a 1.0
   - Is recommended: detecta "recomend", "best option", "top pick"
   - Context: oración completa que rodea la mención
2. **Citations**: extrae URLs de 3 fuentes:
   - Native citations (Perplexity)
   - Markdown links `[title](url)`
   - Bare URLs via regex

**Signal words**:
- Positive: recomend, excelente, líder, mejor, destaca, ideal, top, great, outstanding
- Negative: problema, limitad, desventaja, caro, peor, critic, drawback, issue, poor

**Flujo**:
1. `POST /geo/runs` → crea GeoRun + BackgroundJob
2. `geo_tasks.py` → para cada prompt × provider:
   - Turn 1: envía prompt al LLM
   - Parsea respuesta → BrandMention[] + SourceCitation[]
   - Turn 2: pregunta "por qué" → parsea
   - Turn 3: pregunta "fuentes" → parsea
3. Actualiza progress incrementalmente

**Endpoints**:
- `POST /geo/runs` — Iniciar GEO run
- `GET /geo/runs/{run_id}` — Estado del run
- `GET /geo/runs/{run_id}/responses` — Respuestas con mentions + citations
- `GET /geo/jobs/{job_id}/status` — Polling de progreso

### RF-05: Gap Analysis

**Qué hace**: Cruza datos de GEO (LLM citations) + SEO (SERP results) para encontrar URLs/dominios donde competidores aparecen pero el cliente no.

**Algoritmo** (`gap_analyzer.py`):
1. Construye `url_map`: para cada URL encontrada, registra qué marcas aparecen
2. Marca `found_in_geo=True` si fue citada por un LLM
3. Marca `found_in_serp=True` si aparece en SERPs
4. Identifica GAPs: URLs donde `competitor_present=True` AND `client_present=False`
5. Scoring de oportunidad (0-100):
   - Competitor presence: +10 por competidor (max 30)
   - Source diversity: +25 si ambos GEO+SEO, +15 solo GEO, +10 solo SEO
   - Content type: ranking=+20, review=+15, solution=+10
   - Domain type: editorial=+15, ugc=+5

### RF-06: Key Opportunity Scoring

**Qué hace**: Puntúa cada dominio con 5 dimensiones para responder "¿en qué medios debo estar?"

**Dimensiones y pesos**:

| Dimensión | Peso | Qué mide |
|---|---|---|
| SEO Potential | 0.25 | ¿Rankea para keywords relevantes? (SERP appearances, avg position, keyword diversity, content types) |
| GEO Influence | 0.25 | ¿Los LLMs lo citan? (citation count, provider diversity, brands mentioned, cross-validation) |
| Backlink Value | 0.15 | ¿Vale la pena un backlink? (DA, traffic, domain type, accepts sponsored) |
| Content Gap | 0.15 | ¿Hay oportunidades de contenido? (content types, niches, keywords, sponsored) |
| Competitive Density | 0.20 | ¿Cuántos competidores están aquí? (competitor count, SEO+GEO presence, domain type) |

**Score final**: `KOS = seo×0.25 + geo×0.25 + backlink×0.15 + content_gap×0.15 + competitive×0.20`

**Priority**:
- Critical: KOS ≥ 70 OR 20x potential (seo≥40 AND geo≥30 AND backlink≥40 AND competitive≥40)
- High: KOS ≥ 50
- Medium: KOS ≥ 30
- Low: KOS < 30

**Acciones recomendadas**: pitch_inclusion, request_review, pitch_guest_post, content_collaboration, community_engagement, strategic_partnership, backlink_outreach, general_outreach

### RF-07: SEO Site Audit

**Qué hace**: Auditoría técnica SEO de un sitio web usando Google PageSpeed Insights API + scraping.

**Componente 1 — Lighthouse** (`lighthouse.py`):
- API: Google PageSpeed Insights v5 (gratuito, rate limited ~25 req/100s)
- Strategy: mobile
- Categories: PERFORMANCE, ACCESSIBILITY, BEST_PRACTICES, SEO
- Core Web Vitals: LCP, TBT, CLS, FCP, Speed Index
- Retry: 2 reintentos con backoff exponencial en 429

**Componente 2 — Health Checker** (`health_checker.py`):
- Scrape HTML con httpx + BeautifulSoup
- Checks: meta_title (+ length), meta_description (+ length), mobile_friendly (viewport), image_alt_missing, internal/external_links, h1_count, has_canonical, has_robots_txt, has_sitemap, has_ssl, has_structured_data

**Componente 3 — Issue Generator** (`audit_recommender.py`):
- Genera issues con severity + fix_steps + expected_impact basándose en los health checks
- Ejemplo: "Missing sitemap.xml" → severity=high, impact="+15-20% crawlability"

**Endpoint**: `POST /audit/run` → `GET /audit/project/{project_id}`

### RF-08: Own Media Audit

**Qué hace**: Inventaría los activos digitales del cliente: blog, redes sociales, schemas JSON-LD, stack técnico.

**4 scanners** (ejecutados en paralelo con `asyncio.gather`):

**Blog Scanner** (`blog_scanner.py`):
- Prueba paths: `/blog`, `/blog/`, `/articulos`, `/recursos`, `/news`, `/noticias`, `/insights`, `/magazine`
- Si encuentra blog: parsea sitemap filtrando URLs de blog, o scrape index (max 50 links)
- Para cada post (sample de 10): title, date, word_count, categories
- Calcula: posting_frequency (none/inactive/sporadic/monthly/weekly)

**Social Discovery** (`social_discovery.py`):
- Scrape home page → busca links a: linkedin.com, twitter.com/x.com, instagram.com, youtube.com, facebook.com, tiktok.com
- Busca en `<head>`: meta tags og:see_also, schema.org sameAs
- YouTube: si tiene `youtube_api_key` → YouTube Data API v3 (subscribers, video_count, last_upload)

**Schema Scanner** (`schema_scanner.py`):
- Extrae `<script type="application/ld+json">` de homepage + 2 inner pages
- Clasifica schemas: Organization, WebSite, Article, FAQ, HowTo, Product, BreadcrumbList, Person
- Detecta schemas CRÍTICOS faltantes: FAQPage, HowTo, Person, Article
- Verifica E-E-A-T: ¿tiene jobTitle/credentials? ¿tiene sameAs?

**Tech Detector** (`tech_detector.py`):
- Headers: X-Powered-By, Server, X-Generator
- HTML patterns: wp-content (WordPress), cdn.shopify.com (Shopify), squarespace, wix, webflow
- Analytics: gtag/GA-/G- (GA4), GTM-, Hotjar, Mixpanel, Plausible
- CDN: cf-ray (Cloudflare), CloudFront, Vercel, Netlify
- Framework: __NEXT_DATA__ (Next.js), __NUXT__ (Nuxt), gatsby

**Scoring**:
- `content_score` = has_blog(30) + post_count(5-20) + recency(5-20) + avg_words(4-15) + categories(5-15)
- `social_score` = 16.7 por plataforma encontrada (max 100)
- `technical_score` = schemas(30) + E-E-A-T(10) + sameAs(10) + CMS(15) + analytics(15) + CDN(10) + tag_manager(10)
- `overall_score` = content×0.35 + social×0.30 + technical×0.35

### RF-09: Recommendation Engine

**Qué hace**: Genera recomendaciones priorizadas de 4 fuentes, con severity, fix steps y expected impact.

**Source 1 — Audit Issues**:
- Convierte issues del SiteAudit en Recommendations
- Categories: technical_seo
- Severities: critical, high, medium, low

**Source 2 — GEO Enrichment** (Princeton GEO research):
- No structured data → "Añadir Organization + Article + FAQ schema" (impact +40%)
- Always → "Citar fuentes autoritativas" (impact +30-40%)
- Always → "Citas de expertos" (impact +10-20%)
- Always → "Tono autoritativo" (impact +5-15%)

**Source 3 — Own Media Gaps**:
- No blog → "Crear blog GEO-optimizado" (impact 40%, severity critical)
- Blog inactivo → "Reactivar blog" (impact 25%, severity high)
- Artículos cortos (<800 palabras) → "Ampliar artículos" (impact 15%, severity medium)
- Missing LinkedIn/YouTube → "Crear perfil" (impact 10-15%, severity high)
- Missing FAQPage schema → "Añadir FAQ JSON-LD" (impact 12%, severity high)
- Missing Author/Person → "Añadir Author E-E-A-T" (impact 8%, severity high)
- Missing sameAs → "Vincular redes sociales" (impact 5%, severity medium)

**Source 4 — GEO Provider Gaps**:
- Providers donde el cliente aparece en <30% de respuestas → severity high, impact 20%

### RF-10: Content Keyword Recommender

**Qué hace**: Recomienda keywords para crear contenido, usando 3 fuentes priorizadas.

**Source 1 — Brief LLM** (Primary):
1. Lee el niche brief → genera 80 keywords via LLM
2. Enriquece con DataForSEO (volume, CPC)
3. Obtiene Keyword Difficulty via DataForSEO bulk
4. Scoring: `0.2 + commercial×0.5 + kd_factor×0.3`
   - `commercial = min(1.0, (volume × max(cpc, 0.1)) / 5000)`
   - `kd_factor = (100 - kd) / 100`
5. Filtra: no comparativos, no jargon B2B, no competitor brand names

**Source 2 — Gap Analysis** (Secondary):
- Keywords de GapItems donde `client_present=False`
- Score = opportunity_score del gap item

**Source 3 — SERP Queries** (Tertiary, fallback):
- Keywords de SerpQuery configurados para el nicho
- Score base = 0.4

**Category detection** (regex):
- `comparison` patterns → SKIP (se filtran)
- `jargon` patterns → SKIP (B2B terms)
- `trust` patterns → "authority"
- `ranking` patterns → "ranking"
- `guide` patterns → "guide"
- `solution` patterns → "solution"
- Default → "guide"

**Competitor filter**: Construye regex dinámico con los nombres de marcas competidoras. Multi-word names match como frase; single-word names (≥4 chars) usan word boundaries.

### RF-11: Article Generator (GEO-optimizado)

**Qué hace**: Genera artículos de blog de 1500-2500 palabras optimizados para SEO y GEO.

**Template GEO** (mandatorio en cada artículo):
```markdown
# {H1 — Keyword principal}

> **Respuesta directa:** {2-3 frases que responden la query directamente}

{Intro con estadística + contexto}

## {Secciones H2/H3 con datos, citas, tablas}

## Preguntas Frecuentes
### {FAQ 1}
{Respuesta optimizada para featured snippets, 40-60 palabras}
```

**10 tipos de artículo** con estructura y estilo específicos:
| Tipo | Formato | Estilo |
|---|---|---|
| ranking | Top N list | Objetivo, factual, pros/contras |
| comparison | X vs Y | Equilibrado, casos de uso |
| guide | Paso a paso | Educativo, accionable |
| solution | Problema → Solución | PAS framework |
| authority | Thought leadership | Experto, opinión propia |
| discovery | ¿Qué es X? | Informativo, neutral |
| recommendation | Recomendación personalizada | Empático, por perfil |
| trend | Tendencias | Actual, dinámico |
| content_gap | Pilar/cluster | Exhaustivo, referencia |
| influencer | Validación social | Citas múltiples, credibilidad |

**Post-procesado**:
1. `_extract_direct_answer()` — Parsea `> **Respuesta directa:**` blockquote
2. `_extract_faq_items()` — Parsea `## Preguntas Frecuentes` → `[{question, answer}]`
3. Extrae title del primer `# H1`
4. Cuenta words

**System prompt** incluye: market, language, brand context, target audience, key messages + instrucciones GEO (respuesta directa, 2+ estadísticas, tablas, FAQ 3-5)

**LLM priority**: Anthropic (Claude Sonnet 4.5) → OpenAI → OpenRouter

### RF-12: Cover Image Generator

**Qué hace**: Genera imágenes de portada 1200×630 (Open Graph standard) con Pillow.

**Elementos**:
- Gradient background (configurable, default: #1a1a2e → #16213e)
- Category badge (pill con color por categoría, 10 colores definidos)
- Title word-wrapped (max 4 líneas, 35 chars/línea, fuente 44px bold)
- Decorative elements (líneas diagonales sutiles + círculo accent)
- Bottom bar con brand name
- Color accent line por categoría

**Category colors**:
| Category | Color | Label |
|---|---|---|
| ranking | #e74c3c | RANKING |
| comparison | #3498db | COMPARATIVA |
| guide | #2ecc71 | GUÍA |
| solution | #e67e22 | SOLUCIÓN |
| authority | #9b59b6 | AUTORIDAD |
| discovery | #1abc9c | DESCUBRIMIENTO |
| recommendation | #f39c12 | RECOMENDACIÓN |
| trend | #e91e63 | TENDENCIA |
| content_gap | #00bcd4 | CONTENIDO |
| influencer | #ff5722 | INFLUENCER |

**Output**: PNG bytes (optimizado), guardado en `/backend/static/covers/`

### RF-13: JSON-LD Schema Generator

**Qué hace**: Genera schemas Article + FAQPage + Author Person para GEO optimization.

**Output structure**:
```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "...",
      "author": {"@type": "Person", "name": "...", "jobTitle": "...", "sameAs": [...]},
      "datePublished": "...",
      "dateModified": "...",
      "wordCount": 1800,
      "image": "cover_url"
    },
    {
      "@type": "FAQPage",
      "mainEntity": [{"@type": "Question", "name": "...", "acceptedAnswer": {"@type": "Answer", "text": "..."}}]
    }
  ]
}
```

### RF-14: Influencer Discovery

**Qué hace**: Descubre influencers en YouTube e Instagram relevantes para un nicho.

**YouTube Discovery**:
1. Genera queries de búsqueda basadas en niche + keywords
2. Busca via YouTube Data API v3 o SearchAPI.io
3. Extrae: channel URL, display_name, subscribers, video_count

**Instagram Discovery**:
1. Busca via Google CSE (restricto a instagram.com)
2. Enriquece con Apify Instagram Profile Scraper (followers, bio)

**Output**: `InfluencerResult` con platform, handle, profile_url, subscribers, relevance_score

### RF-15: Domain Intelligence (Análisis de Marca)

**Qué hace**: Analiza un dominio/empresa via scraping + LLM para extraer business intelligence.

**Flujo**:
1. Scrape homepage: title, meta description, H1s, body text (max 3000 chars)
2. Si scraping falla (403, timeout) → fallback a LLM knowledge
3. LLM (Gemini 2.5 Flash) extrae:
   - `company_type`: tipo genérico (ej: "Agencia de growth marketing")
   - `services[]`: lista de servicios
   - `target_market`: quién son sus clientes
   - `summary`: 1-2 frases

**Detección B2B context**: Si el cliente es un proveedor PARA un sector (no un actor DENTRO del sector), el sistema lo detecta y ajusta los prompts de keywords para generar queries desde la perspectiva del comprador, no del consumidor final.

---

## 5. API Endpoints Completos

### 5.1 Projects (`/api/v1/projects`)

| Method | Path | Descripción |
|---|---|---|
| GET | `/projects` | Listar proyectos |
| POST | `/projects` | Crear proyecto |
| GET | `/projects/{id}` | Detalle con brands |
| PUT | `/projects/{id}` | Actualizar |
| DELETE | `/projects/{id}` | Eliminar |
| POST | `/projects/{id}/brands` | Crear brand |
| GET | `/projects/{id}/brands` | Listar brands |
| PUT | `/projects/{id}/brands/{bid}` | Actualizar brand |
| DELETE | `/projects/{id}/brands/{bid}` | Eliminar brand |
| POST | `/projects/{id}/brands/{bid}/analyze` | Analizar dominio con LLM |
| POST | `/projects/quick-start` | Auto-onboarding |
| POST | `/projects/describe-website` | Describir website con LLM |

### 5.2 Niches (`/api/v1/projects/{id}/niches`)

| Method | Path | Descripción |
|---|---|---|
| GET | `/niches` | Listar nichos del proyecto |
| POST | `/niches` | Crear nicho |
| GET | `/niches/{slug}` | Detalle con competidores |
| PUT | `/niches/{slug}` | Actualizar (incluye brief) |
| DELETE | `/niches/{slug}` | Eliminar |
| POST | `/niches/{slug}/competitors` | Asignar competidor |
| DELETE | `/niches/{slug}/competitors/{brand_id}` | Quitar competidor |

### 5.3 Prompts (`/api/v1/prompts`)

| Method | Path | Descripción |
|---|---|---|
| GET | `/prompts/topics/{project_id}` | Listar topics |
| POST | `/prompts/topics` | Crear topic |
| GET | `/prompts/topic/{topic_id}` | Prompts de un topic |
| POST | `/prompts` | Crear prompt |
| PUT | `/prompts/{id}` | Actualizar prompt |
| DELETE | `/prompts/{id}` | Eliminar |
| POST | `/prompts/generate` | Auto-generar prompts |

### 5.4 SEO (`/api/v1/seo`)

| Method | Path | Descripción |
|---|---|---|
| POST | `/seo/fetch` | Fetch SERP results |
| GET | `/seo/queries/{project_id}` | Listar queries |
| GET | `/seo/results/{query_id}` | Resultados SERP |
| POST | `/seo/classify/{result_id}` | Clasificar manualmente |

### 5.5 GEO (`/api/v1/geo`)

| Method | Path | Descripción |
|---|---|---|
| POST | `/geo/runs` | Iniciar GEO run |
| GET | `/geo/runs/{run_id}` | Estado del run |
| GET | `/geo/runs/{run_id}/responses` | Respuestas con mentions + citations |
| GET | `/geo/runs/project/{project_id}` | Runs del proyecto |
| GET | `/geo/jobs/{job_id}/status` | Polling de progreso |
| GET | `/geo/providers` | Providers disponibles |

### 5.6 Domains (`/api/v1/domains`)

| Method | Path | Descripción |
|---|---|---|
| GET | `/domains` | Catálogo de dominios |
| GET | `/domains/{domain}` | Detalle de dominio |
| PUT | `/domains/{id}` | Actualizar tipo/clasificación |
| GET | `/domains/project/{project_id}` | Dominios del proyecto |
| POST | `/domains/classify` | Clasificar dominio |
| POST | `/domains/exclusion-rules` | Crear regla de exclusión |
| GET | `/domains/exclusion-rules/{project_id}` | Reglas del proyecto |

### 5.7 Analysis (`/api/v1/analysis`)

| Method | Path | Descripción |
|---|---|---|
| POST | `/analysis/gaps/run` | Ejecutar gap analysis |
| GET | `/analysis/gaps/{project_id}` | Gap analysis results |
| GET | `/analysis/gaps/{project_id}/items` | Gap items |
| GET | `/analysis/key-opportunities/{project_id}` | Key Opportunity scoring |

### 5.8 Content (`/api/v1/content`)

| Method | Path | Descripción |
|---|---|---|
| GET | `/content/keywords/{project_id}/{niche_slug}` | Keyword recommendations |
| POST | `/content/keywords/suggest` | Suggest new keywords (LLM) |
| POST | `/content/briefs` | Crear content brief |
| GET | `/content/briefs/{project_id}` | Listar briefs |
| GET | `/content/briefs/{brief_id}` | Detalle de brief |
| PUT | `/content/briefs/{brief_id}` | Actualizar brief |
| POST | `/content/generate/{brief_id}` | Generar artículo |
| POST | `/content/briefs/{brief_id}/cover` | Generar cover image |
| POST | `/content/briefs/{brief_id}/schema` | Generar JSON-LD |

### 5.9 Audit (`/api/v1/audit`)

| Method | Path | Descripción |
|---|---|---|
| POST | `/audit/run` | Ejecutar site audit |
| GET | `/audit/project/{project_id}` | Último audit completado |
| GET | `/audit/{audit_id}` | Audit específico |

### 5.10 Recommendations (`/api/v1/recommendations`)

| Method | Path | Descripción |
|---|---|---|
| POST | `/recommendations/generate` | Generar recomendaciones |
| GET | `/recommendations/project/{project_id}` | Listar recomendaciones |
| PUT | `/recommendations/{id}/status` | Cambiar status |

### 5.11 Own Media (`/api/v1/own-media`)

| Method | Path | Descripción |
|---|---|---|
| POST | `/own-media/run` | Ejecutar own media audit |
| GET | `/own-media/project/{project_id}` | Último audit |
| GET | `/own-media/{audit_id}` | Audit específico |
| GET | `/own-media/project/{project_id}/history` | Historial |

### 5.12 Influencers (`/api/v1/influencers`)

| Method | Path | Descripción |
|---|---|---|
| POST | `/influencers/discover` | Descubrir influencers |
| GET | `/influencers/project/{project_id}` | Resultados |
| GET | `/influencers/niche/{niche_id}` | Por nicho |

### 5.13 Sancho Integration (`/api/v1/sancho`)

| Method | Path | Descripción |
|---|---|---|
| GET | `/sancho/export/{project_id}` | Exportar todo el proyecto en formato SanchoCMO |

---

## 6. Integraciones Externas

### 6.1 APIs de LLM

| API | Uso | Costo aprox |
|---|---|---|
| **OpenRouter** (preferred) | Acceso unificado a todos los LLMs con 1 key | Variable por modelo |
| OpenAI (directo) | GPT-4o para GEO analysis, content classification | ~$0.002-0.01/query |
| Anthropic (directo) | Claude Sonnet 4.5 para article generation | ~$0.003-0.01/query |
| Google GenAI (directo) | Gemini para domain analysis, onboarding | ~$0.001/query |
| Perplexity (via OpenRouter) | GEO analysis con citations nativas | ~$0.005/query |

### 6.2 APIs de SERP y Datos

| API | Uso | Configuración |
|---|---|---|
| **Serper.dev** (preferred) | SERP results de Google | `serper_api_key` |
| SerpAPI | SERP results (alternativa) | `serpapi_key` |
| **DataForSEO** | Keyword volume, CPC, Keyword Difficulty | `dataforseo_login` + `dataforseo_password` |
| **Google PSI** | Lighthouse audit (gratuito) | `google_ai_api_key` (opcional, para rate limit) |

### 6.3 APIs de Social/Influencer

| API | Uso | Configuración |
|---|---|---|
| **YouTube Data API v3** | Subscribers, video count, channel info | `youtube_api_key` |
| **Google CSE** | Descubrimiento Instagram profiles | `google_cse_key` + `google_cse_cx` |
| **SearchAPI.io** | YouTube search con subscriber counts | `searchapi_key` |
| **Apify** | Instagram profile scraper (followers) | `apify_token` |

### 6.4 Configuración completa (.env)

```env
# Database
DATABASE_URL=sqlite+aiosqlite:///seogeo.db
DATABASE_URL_SYNC=sqlite:///seogeo.db

# Redis (vacío = inline tasks)
REDIS_URL=

# LLM — uno de estos es suficiente
OPENROUTER_API_KEY=sk-or-...     # Recomendado: acceso a todos los LLMs
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AIza...

# SERP
SERP_PROVIDER=serper              # "serper" o "serpapi"
SERPER_API_KEY=...
SERPAPI_KEY=...

# Keywords
DATAFORSEO_LOGIN=...
DATAFORSEO_PASSWORD=...

# Social Discovery
YOUTUBE_API_KEY=AIza...
GOOGLE_CSE_KEY=AIza...
GOOGLE_CSE_CX=017576...
SEARCHAPI_KEY=...
APIFY_TOKEN=apify_api_...

# Rate Limits (RPM)
OPENAI_RPM=60
ANTHROPIC_RPM=50
GEMINI_RPM=60
PERPLEXITY_RPM=50
SERP_RPM=100

# App
SECRET_KEY=change-me
CORS_ORIGINS=http://localhost:3000
```

---

## 7. Frontend — Páginas y Flujo de Usuario

### 7.1 Mapa de rutas (30 páginas)

```
/                                         → Landing / project list
/quick-start                              → Auto-onboarding flow
/projects/new                             → Manual project creation
/projects/[id]                            → Project dashboard
/projects/[id]/edit                       → Edit project settings
/projects/[id]/setup                      → Configure project (brands, website)
/projects/[id]/niches                     → Niche list
/projects/[id]/niches/[slug]              → Niche detail
/projects/[id]/niches/[slug]/configure    → Niche config (brief + competitors)
/projects/[id]/niches/[slug]/brief        → Niche brief editor
/projects/[id]/niches/[slug]/analyze      → Trigger SEO+GEO analysis
/projects/[id]/niches/[slug]/results      → Analysis results
/projects/[id]/niches/[slug]/contenido    → Content recommendations for niche
/projects/[id]/niches/[slug]/dominar      → "Dominar" view (key opportunities)
/projects/[id]/niches/[slug]/dominar/preview → Preview dominar data
/projects/[id]/niches/[slug]/dominar/generate → Generate dominar report
/projects/[id]/niches/[slug]/influencers  → Influencer results
/projects/[id]/niches/[slug]/influencers/brief → Influencer collab brief
/projects/[id]/prompts                    → Prompt management
/projects/[id]/seo                        → SERP queries + results
/projects/[id]/geo                        → GEO runs + responses
/projects/[id]/domains                    → Domain catalog
/projects/[id]/gaps                       → Gap analysis
/projects/[id]/key-opportunities          → Key Opportunity scoring
/projects/[id]/briefs                     → Content briefs list
/projects/[id]/articles                   → Generated articles list
/projects/[id]/articles/[briefId]         → Article detail (content + cover + schema)
/projects/[id]/audit                      → SEO site audit
/projects/[id]/own-media                  → Own Media audit
/projects/[id]/recommendations            → Prioritized recommendations
```

### 7.2 Sidebar Navigation

```
📋 Projects
  └─ [Project Name]
      ├─ 🏠 Dashboard
      ├─ ⚙️ Setup
      ├─ 📊 Niches (con sub-rutas)
      ├─ 💬 Prompts
      ├─ 🔍 SEO
      ├─ 🤖 GEO
      ├─ 🌐 Domains
      ├─ 📈 Gaps
      ├─ 🎯 Key Opportunities
      ├─ 📝 Content Briefs
      ├─ 📄 Articles
      ├─ 👥 Influencers
      ├─ 🔍 SEO Audit
      ├─ 🌍 Own Media
      ├─ 🤖 AI CMO (recommendations)
      └─ ⚙️ Edit Project
```

### 7.3 Polling Pattern

Todas las páginas que disparan background tasks usan el mismo patrón:
1. `POST /endpoint/run` → recibe `{job_id}`
2. `setInterval(3000)` → `GET /geo/jobs/{job_id}/status`
3. Muestra `step_info.step` + `progress` en UI
4. Cuando `status === "completed"` → `clearInterval` + fetch resultados
5. Si `status === "failed"` → muestra `error`

### 7.4 Componentes reutilizados

| Componente | Archivo | Uso |
|---|---|---|
| `ScoreCircle` | audit/page.tsx, own-media/page.tsx | Círculos de score 0-100 con color |
| `HealthCheck` | audit/page.tsx | Checklist ✓/✗ |
| `AppSidebar` | components/AppSidebar.tsx | Navegación lateral |
| `MarkdownContent` | articles/[briefId]/page.tsx | Render markdown con blockquote GEO |

---

## 8. Pasos de Implementación para Integración con SanchoCMO

### Paso 1: Migración de Base de Datos

1. Crear tablas Drizzle equivalentes a las 19 tablas SQLAlchemy
2. Los tipos `PortableUUID` → `uuid()` nativo de Drizzle/PostgreSQL
3. Los tipos `PortableJSON` → `jsonb()` nativo
4. Los tipos `PortableArray` → `text().array()` o `jsonb()` según caso
5. Crear relaciones con Drizzle's `relations()` helper

### Paso 2: Migración de Engines

**Opción A — Microservicio Python** (recomendado para MVP):
- Mantener el backend Python como servicio separado
- SanchoCMO hace fetch a `http://escudero-api:8000/api/v1/...`
- Añadir autenticación con Better Auth tokens

**Opción B — Reescritura TypeScript**:
- Reescribir engines en TypeScript/Next.js API routes
- LLM calls: usar Vercel AI SDK o OpenAI/Anthropic SDKs nativos
- Web scraping: usar Cheerio (equivalente a BeautifulSoup)
- Background tasks: usar Vercel Cron + Inngest/Trigger.dev

### Paso 3: Integración de Auth

- Cada Project se asocia a un `user_id` de Better Auth
- Los endpoints requieren auth token
- RBAC: owner, editor, viewer por proyecto

### Paso 4: Monetización (Polar.sh Credits)

| Acción | Créditos |
|---|---|
| Quick Start (onboarding) | 5 créditos |
| GEO Run (por prompt×provider) | 1 crédito |
| Article Generation | 10 créditos |
| SEO Audit | 3 créditos |
| Own Media Audit | 2 créditos |
| Keyword Suggestions (batch 80) | 5 créditos |
| Influencer Discovery | 5 créditos |

### Paso 5: Migración de Frontend

- Adaptar componentes a shadcn/ui + Tailwind v4
- Mantener misma estructura de rutas (App Router compatible)
- Aplicar design system "comic/parchment" de SanchoCMO
- Integrar Qdrant para vector search de contenido generado

---

## 9. Criterios de Aceptación

### CA-01: Onboarding
- [ ] Dado un URL, el sistema extrae company_type, services, target_market en <10s
- [ ] Sugiere 2-3 nichos con 3-5 competidores reales por nicho
- [ ] Crea proyecto completo con todas las relaciones en DB

### CA-02: GEO Analysis
- [ ] Envía prompts a ≥2 providers simultáneamente
- [ ] Detecta brand mentions con position + sentiment correcto
- [ ] Extrae citations (URLs) de markdown links y bare URLs
- [ ] Conversación 3-turn funciona (discovery → why → sources)
- [ ] Polling muestra progreso en tiempo real

### CA-03: SEO Analysis
- [ ] Fetches SERP results con position, title, snippet, domain
- [ ] Content classification ≥80% sin LLM (tiers 1+2)
- [ ] Domain classification cubre ≥70% con rules engine

### CA-04: Gap Analysis
- [ ] Cross-reference GEO + SEO identifica gaps correctamente
- [ ] Gap scoring prioriza: ranking articles > review > solution
- [ ] Editorial domains con múltiples competidores = score alto

### CA-05: Site Audit
- [ ] Lighthouse scores (performance, accessibility, SEO, best practices)
- [ ] Health checks (sitemap, robots, canonical, meta tags, SSL, structured data)
- [ ] Issues generados con severity + fix steps

### CA-06: Own Media
- [ ] Detecta blog y calcula posting frequency
- [ ] Descubre ≥3 plataformas sociales (si existen)
- [ ] Detecta schemas JSON-LD presentes y faltantes
- [ ] Detecta CMS, analytics, CDN, framework

### CA-07: Recommendations
- [ ] Agrega issues de ≥3 fuentes (audit, GEO, own media)
- [ ] Severities correctas (critical > high > medium > low)
- [ ] Expected impact basado en Princeton GEO research

### CA-08: Content Engine
- [ ] Genera artículos 1500-2500 palabras
- [ ] Incluye "Respuesta directa" blockquote al inicio
- [ ] Incluye FAQ section con 3-5 preguntas
- [ ] Post-procesado extrae direct_answer y faq_items correctamente
- [ ] Cover image 1200×630 con título y categoría
- [ ] JSON-LD schema con Article + FAQPage + Author

### CA-09: Key Opportunity Scoring
- [ ] 5 dimensiones calculadas correctamente
- [ ] Priority assignment: critical ≥70, high ≥50, medium ≥30
- [ ] 20x potential detection funciona
- [ ] Recommended actions basadas en content types + scores

---

## 10. Riesgos

| Riesgo | Impacto | Probabilidad | Mitigación |
|---|---|---|---|
| **API rate limits** (OpenRouter, Serper, PSI) | Audits/GEO runs fallan | Media | Retry con backoff, graceful degradation (PSI returns None scores) |
| **LLM hallucinations** en onboarding | Company_type incorrecto, competidores inventados | Alta | Verificación manual + "no inventes" en prompts |
| **Scraping failures** (403, Cloudflare) | Blog/social discovery incompleto | Alta | Fallback a LLM knowledge, HEAD+GET retry, timeout handling |
| **DataForSEO costs** escalando | Presupuesto API | Media | Batch queries, caching, tier de créditos en SanchoCMO |
| **SQLite → PostgreSQL migration** | Data types incompatibles | Baja | PortableUUID/JSON/Array ya manejan ambos; testeado |
| **Pillow dependency** en serverless | Cover generation falla | Media | Pre-build Docker layer con Pillow, o usar Cloudinary API |
| **Context window limits** | Article generation truncada | Baja | max_tokens=6000, Sonnet 4.5 tiene 200k context |
| **Competitor filter false positives** | Keywords legítimas filtradas | Media | Word boundary matching, min 4 chars for single-word brands |

---

## 11. Estimación

| Fase | Componente | Esfuerzo |
|---|---|---|
| **Migración DB** | 19 tablas → Drizzle schemas | 2-3 días |
| **Auth integration** | Better Auth + project ownership | 1-2 días |
| **API proxy/migration** | Microservicio Python ó reescritura TS | 3-5 días (proxy) / 2-3 semanas (rewrite) |
| **Frontend adaptation** | 30 páginas → shadcn/ui + parchment theme | 5-7 días |
| **Credit system** | Polar.sh integration por acción | 2-3 días |
| **Vector search** | Qdrant integration para content/articles | 2-3 días |
| **Testing E2E** | Full flow: onboarding → audit → GEO → content | 3-5 días |
| **Total estimado** | | **3-5 semanas** (proxy) / **6-8 semanas** (rewrite) |

---

## 12. Apéndice: Fórmulas y Constantes

### A.1 Sentiment Scoring

```python
pos = count(POSITIVE_SIGNALS in context)
neg = count(NEGATIVE_SIGNALS in context)

if pos > neg:
    score = min(1.0, 0.5 + 0.15 × (pos - neg))   # → "positive"
elif neg > pos:
    score = max(-1.0, -0.5 - 0.15 × (neg - pos))  # → "negative"
else:
    score = 0.0                                      # → "neutral"
```

### A.2 Keyword Opportunity Score

```python
kd_factor = (100 - kd) / 100       # kd = keyword difficulty 0-100
commercial = min(1.0, (volume × max(cpc, 0.1)) / 5000)
score = 0.2 + commercial × 0.5 + kd_factor × 0.3
```

### A.3 Gap Opportunity Score

```python
score = 0
score += min(30, n_competitors × 10)
score += 25 if (geo AND serp) else (15 if geo else 10)
score += {ranking: 20, review: 15, solution: 10}.get(content_type, 0)
score += {editorial: 15, ugc: 5}.get(domain_type, 0)
score = min(100, score)
```

### A.4 Key Opportunity Score (KOS)

```python
KOS = seo × 0.25 + geo × 0.25 + backlink × 0.15 + content_gap × 0.15 + competitive × 0.20

# SEO Score (0-100)
seo = serp_appearances(10-30) + avg_position(5-30) + keyword_diversity(10-25) + content_type_bonus(0-25)

# GEO Score (0-100)
geo = citation_count(15-40) + provider_diversity(10-30) + brands_mentioned(10-20) + cross_validation(0-10)

# Backlink Score (0-100)
backlink = DA(10-40) + traffic_log(10-30) + domain_type(5-20) + sponsored(0-10) + proxy_signals(0-45)

# Content Gap Score (0-100)
content_gap = content_types(0-60) + niche_diversity(10-20) + keyword_count(0-20) + sponsored(0-10)

# Competitive Density (0-100)
competitive = competitor_count(20-50) + cross_channel(0-25) + domain_type(0-15)
```

### A.5 Own Media Scoring

```python
content_score = has_blog(30) + post_count(5-20) + recency(5-20) + word_count(4-15) + categories(5-15)
social_score = 16.7 × platforms_found  # max 100 (6 platforms)
technical_score = schemas(30) + eeat(10) + sameAs(10) + cms(15) + analytics(15) + cdn(10) + tag_manager(10)
overall = content × 0.35 + social × 0.30 + technical × 0.35
```

### A.6 Princeton GEO Research Benchmarks

| Técnica | Uplift en visibility |
|---|---|
| Citar fuentes autoritativas (.gov, .edu, alto DR) | +30-40% |
| Añadir estadísticas concretas con fuente | +15-25% |
| Citas de expertos con blockquote + autor | +10-20% |
| FAQ JSON-LD schema | +10-15% |
| Author schema con E-E-A-T | +5-10% |
| Tono autoritativo (sin hedging words) | +5-15% |

---

*Documento generado el 2026-03-17. Versión 1.0.*
