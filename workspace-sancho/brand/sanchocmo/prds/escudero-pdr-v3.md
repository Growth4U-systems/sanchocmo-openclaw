# PDR Consolidado — Sancho Execution Engine (SEO/GEO/Content)

**ID:** T-050
**Producto:** Sancho Execution Engine — SEO+GEO Intelligence & Content
**Versión:** 3.0 (estructura aprobada por Alfonso 2026-03-22)
**Fecha:** 2026-03-22
**Autor:** Philippe + Cervantes + Alfonso
**Sistema:** SanchoCMO — Post-Foundation Execution
**Estado:** Estructura aprobada — en desarrollo
**Prioridad:** P0 (post-Foundation execution)

> **Naming**: No hay "Escudero" como producto separado. Es el motor de ejecución de Sancho.
> Foundation = diagnóstico. Execution Engine = acción. Strategy Plan = planificación.

---

## 0. Índice

1. [Problema y Propuesta de Valor](#1-problema-y-propuesta-de-valor)
2. [Arquitectura](#2-arquitectura)
3. [Modelo de Datos](#3-modelo-de-datos)
4. [Requisitos Funcionales](#4-requisitos-funcionales)
5. [Integraciones Externas](#5-integraciones-externas)
6. [Integración con SanchoCMO](#6-integración-con-sanchocmo)
7. [Flujos Operativos](#7-flujos-operativos)
8. [Bots IG + LinkedIn](#8-bots-ig--linkedin)
9. [Skills de Sancho — Mapa](#9-skills-de-sancho--mapa)
10. [Workstreams y Prioridades](#10-workstreams-y-prioridades)
11. [Criterios de Aceptación](#11-criterios-de-aceptación)
12. [Riesgos](#12-riesgos)
13. [Estimación](#13-estimación)
14. [Apéndice: Fórmulas](#14-apéndice-fórmulas)
15. [Decisiones Tomadas](#15-decisiones-tomadas)
16. [Pendiente Alfonso](#16-pendiente-alfonso)

---

## 1. Problema y Propuesta de Valor

### 1.1 Qué resuelve

Las empresas necesitan visibilidad en buscadores tradicionales (Google) Y en motores de IA generativa (ChatGPT, Perplexity, Claude, Gemini). Actualmente:

1. **No saben dónde están** — Sin visión unificada SEO + GEO
2. **No saben qué les falta** — No detectan gaps donde competidores aparecen y ellos no
3. **No saben qué hacer** — Sin recomendaciones accionables con impacto esperado
4. **No pueden actuar** — Sin motor de contenido optimizado para ambos canales
5. **No conocen sus activos** — Sin inventario de blog, redes, schemas, stack técnico

### 1.2 Ciclo completo

```
Diagnóstico → Plan → Acción → Distribución → Engagement → Medición
     │           │        │          │              │           │
  SEO Audit   GEO     Content   Atomizer      Bots IG/LI   KOS Score
  Own Media   Gaps    Engine    Social Pub                  Tracking
              Recs    Keywords
```

### 1.3 Diferencia con Strategy Plan (post-Foundation)

| Strategy Plan | Escudero |
|---|---|
| Planificación de canales, presupuesto, roadmap | Ejecución táctica: audit → contenido → distribución |
| Define QUÉ hacer | Ejecuta CÓMO hacerlo |
| Output: plan de marketing | Output: artículos, posts, engagement, datos |

El Strategy Plan alimenta prioridades → Escudero ejecuta.

---

## 2. Arquitectura

### 2.1 Decisión: Microservicio Python

El código Python ya funciona (46 engines, 19 tablas, 65+ endpoints). **NO se reescribe a TypeScript.**

```
┌─────────────────────────────────────────────────────┐
│  SANCHOCMO (Next.js 15, Vercel)                     │
│  Better Auth ── Dashboard ── Polar.sh Credits       │
│       │              │             │                │
│    Skills        Discord Bot     Crons              │
└───────┼──────────────┼──────────────┼───────────────┘
        │              │              │
        ▼              ▼              ▼
┌─────────────────────────────────────────────────────┐
│  ESCUDERO API (Python 3.11, FastAPI, Docker)        │
│  Auth: API key interna (ESCUDERO_API_KEY)           │
│                                                     │
│  SEO Engines ── GEO Engines ── Content Engine       │
│  Domain Intel ── Own Media ── Recommendations       │
│  Influencer Discovery                               │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│  POSTGRESQL (Supabase) — DB compartida              │
│  19 tablas Escudero + tablas SanchoCMO + bot_*      │
└─────────────────────────────────────────────────────┘
                      ▲
                      │
┌─────────────────────┴───────────────────────────────┐
│  BOT ENGINE (Docker/VPS separado) — P2              │
│  Scheduler ── Executor ── Monitor                   │
│  Apify (IG) ── Playwright (LinkedIn)                │
│  Residential Proxies ── Session Manager             │
└─────────────────────────────────────────────────────┘
```

### 2.2 Comunicación

- **Next.js → Escudero**: HTTP con `Authorization: Bearer <ESCUDERO_API_KEY>`. Usuario nunca habla directo con Escudero.
- **Sancho (agente) → Escudero**: Mismo API key, desde skills.
- **Better Auth tokens NO se pasan al Python** — Next.js valida auth del usuario y habla con Escudero como servicio interno.

### 2.3 Deploy

- **Escudero API**: Docker container en Railway (pendiente Alfonso)
- **DB**: PostgreSQL de Supabase (connection string con SSL)
- **Frontend Escudero**: Solo para dev/admin, NO se expone a clientes

### 2.4 Estructura del código (existente, funcional)

```
backend/
├── app/
│   ├── config.py          # Settings (.env)
│   ├── database.py        # SQLAlchemy engine + migrations
│   ├── main.py            # FastAPI app + CORS
│   ├── models/            # 15 archivos, 19 tablas
│   │   └── compat.py      # PortableUUID→UUID, PortableJSON→JSONB, PortableArray→ARRAY
│   ├── engines/           # 46 archivos de lógica de negocio
│   │   ├── seo/           # SERP fetching, content classification
│   │   ├── geo/           # LLM adapters, response parsing
│   │   ├── domain/        # Domain classification (rules + LLM)
│   │   ├── intelligence/  # Gap analysis, scoring, recommendations
│   │   ├── content/       # Article gen, keywords, covers, schemas
│   │   └── own_media/     # Blog, social, schema, tech scanners
│   ├── api/v1/            # 16 archivos, 65+ endpoints
│   ├── tasks/             # 9 background task files
│   └── schemas/           # Pydantic request/response

frontend/                  # Next.js 14, 30 páginas (solo dev/admin)
```

### 2.5 Background Tasks

- **Dev**: `dispatch_inline()` — thread Python con event loop independiente
- **Prod**: Celery + Redis
- **Polling**: Frontend cada 3s via `GET /geo/jobs/{job_id}/status`
- Jobs trackean `progress` (0.0-1.0) y `step_info` (step name + detail)

---

## 3. Modelo de Datos

### 3.1 Tablas existentes (19) — todas funcionales

| # | Tabla | Descripción | Relaciones clave |
|---|---|---|---|
| 1 | `projects` | Proyecto/empresa. 1 Project = 1 Client de Sancho | → brands, niches, prompt_topics |
| 2 | `brands` | Marca (is_client=True para el cliente, False para competidores) | → project, brand_domains |
| 3 | `brand_domains` | Dominios adicionales de una marca | → brand |
| 4 | `niches` | Nicho de mercado con brief estratégico (A/B/C/D) | → project, niche_brands |
| 5 | `niche_brands` | Join: competidores asignados a un nicho | → niche, brand |
| 6 | `prompt_topics` | Categoría de prompts GEO (Discovery, Comparison...) | → project, prompts |
| 7 | `prompts` | Prompt GEO individual | → topic, project, niche |
| 8 | `serp_queries` | Keyword de búsqueda SERP | → project, results |
| 9 | `serp_results` | Resultado individual de Google (url, position, snippet) | → query, classification |
| 10 | `content_classifications` | Tipo de contenido (review, ranking, solution...) | → serp_result (1:1) |
| 11 | `geo_runs` | Ejecución GEO multi-provider | → project, niche, responses |
| 12 | `geo_responses` | Respuesta de un LLM (3 turns) | → run, prompt, mentions, citations |
| 13 | `brand_mentions` | Mención de marca en respuesta GEO | → response, brand |
| 14 | `source_citations` | URL citada por un LLM | → response, brand? |
| 15 | `domains` | Catálogo de dominios clasificados | UNIQUE(domain) |
| 16 | `exclusion_rules` | Reglas de exclusión por proyecto | → project |
| 17 | `project_domains` | Dominio × Proyecto con priority_score | → project, domain |
| 18 | `gap_analyses` | Análisis de gaps GEO×SEO | → project, niche, geo_run |
| 19 | `gap_items` | Gap individual (URL donde cliente no aparece) | → analysis |
| 20 | `action_briefs` | Acción recomendada para un gap | → project, gap_item |
| 21 | `influencer_results` | Influencer descubierto (YT/IG) | → project, niche |
| 22 | `site_audits` | Audit Lighthouse + health checks | → project |
| 23 | `background_jobs` | Job async con progreso | → project |
| 24 | `recommendations` | Recomendación priorizada | → project, niche |
| 25 | `content_briefs` | Brief + artículo generado + cover + schema | → project |
| 26 | `own_media_audits` | Audit de medios propios (blog, social, schema, tech) | → project |

> Nota: el PDR original dice 19 tablas pero el modelo tiene 26. Los tipos portables (PortableUUID→UUID, PortableJSON→JSONB, PortableArray→ARRAY) ya soportan PostgreSQL nativo.

### 3.2 Tablas nuevas para bots (P2)

| # | Tabla | Descripción |
|---|---|---|
| 27 | `bot_accounts` | Cuenta de bot (platform, session_data, proxy_config, status) |
| 28 | `bot_actions` | Acción en queue (follow, like, comment, scheduled_at, result) |
| 29 | `bot_metrics` | Métricas diarias (follows_sent, follows_back, success_rate) |

---

## 4. Requisitos Funcionales

### RF-01: Onboarding Automático
- Input: URL de empresa
- Scrape HTML → LLM (Gemini 2.5 Flash) extrae company_type, services, target_market
- Fallback a LLM knowledge si scraping falla
- Auto-genera 2-3 nichos con competidores
- **Nuevo**: Si el cliente tiene Foundation data → importar ECPs como nichos (`POST /projects/{id}/import-foundation`)
- Costo: ~$0.003 por onboarding

### RF-02: Configuración de Nichos
- Brief estratégico: A (contexto marca), B (objetivos), C (audiencia), D (mensajes clave)
- Asignar competidores por nicho
- **Nuevo**: Brief se alimenta de Foundation (positioning → A, target audience → C)

### RF-03: Análisis SEO (SERP Fetching)
- Busca keywords en Google via Serper.dev (o SerpAPI fallback)
- Guarda SerpResults con position, title, snippet, domain
- Content classification 3-tier: URL patterns (60%) → title keywords (20%) → LLM fallback (20%)
- Domain classification 3-tier: 150+ known domains → pattern heuristics → LLM fallback

### RF-04: Análisis GEO (Multi-Provider LLM)
- **Reemplaza skill `ai-seo` de Sancho**
- 4 providers simultáneos: OpenAI (GPT-4o), Anthropic (Claude Sonnet 4.5), Gemini (2.5 Flash), Perplexity (Sonar Pro)
- Conversación 3-turn: Discovery → Why → Sources
- Parser extrae: brand mentions (position, sentiment, context), citations (URLs)
- Sentiment scoring con signal words (positive/negative/neutral, -1.0 a 1.0)

### RF-05: Gap Analysis
- Cruza GEO citations × SEO SERPs
- Identifica URLs donde competidores aparecen y cliente no
- Opportunity scoring (0-100): competitor presence + source diversity + content type + domain type

### RF-06: Key Opportunity Scoring (KOS)
- 5 dimensiones: SEO (25%), GEO (25%), Backlink (15%), Content Gap (15%), Competitive (20%)
- Priority: Critical ≥70, High ≥50, Medium ≥30, Low <30
- Acciones recomendadas: pitch_inclusion, guest_post, content_collaboration, etc.

### RF-07: SEO Site Audit
- **Reemplaza skill `seo-audit` de Sancho**
- Lighthouse via Google PSI API (performance, accessibility, SEO, best practices)
- Core Web Vitals (LCP, TBT, CLS, FCP, Speed Index)
- 15 health checks (meta tags, sitemap, robots, canonical, SSL, structured data, mobile, alt tags, links)
- Issue generator con severity + fix steps + expected impact %

### RF-08: Own Media Audit
- 4 scanners en paralelo (asyncio.gather):
  - **Blog Scanner**: paths (/blog, /articulos, /recursos...), posting frequency, word count
  - **Social Discovery**: links en homepage + meta tags → LinkedIn, Twitter, IG, YouTube, FB, TikTok
  - **Schema Scanner**: JSON-LD extraction, critical missing schemas, E-E-A-T check
  - **Tech Detector**: CMS, analytics, CDN, framework detection
- Scoring compuesto: content (35%) + social (30%) + technical (35%)

### RF-09: Recommendation Engine
- 4 fuentes: audit issues, GEO enrichment (Princeton research), own media gaps, provider visibility
- Severity: critical/high/medium/low
- Expected impact basado en Princeton GEO benchmarks (+30-40% citations, +15-25% stats, etc.)

### RF-10: Content Keyword Recommender
- 3 fuentes priorizadas: Brief LLM (80 keywords) → Gap Analysis keywords → SERP queries
- DataForSEO validation: volume, CPC, Keyword Difficulty
- Scoring: `0.2 + commercial×0.5 + kd_factor×0.3`
- Filtros: no comparativos, no jargon B2B, no competitor brand names

### RF-11: Article Generator (GEO-optimizado)
- 1500-2500 palabras con template GEO: respuesta directa + FAQ + estadísticas
- 10 tipos de artículo (ranking, comparison, guide, solution, authority, discovery, recommendation, trend, content_gap, influencer)
- Post-procesado: extract direct_answer, faq_items, title, word count
- LLM priority: Anthropic (Claude Sonnet 4.5) → OpenAI → OpenRouter
- **Nuevo**: System prompt incluye brand_voice de Foundation (si existe)

### RF-12: Cover Image Generator
- 1200×630 PNG con Pillow (gradient + category badge + title + brand name)
- 10 category colors definidos

### RF-13: JSON-LD Schema Generator
- Article + FAQPage + Author Person (E-E-A-T)

### RF-14: Influencer Discovery
- YouTube: Data API v3 / SearchAPI.io
- Instagram: Google CSE + Apify scraper
- Output alimenta Bot Scheduler (P2)

### RF-15: Domain Intelligence
- Scrape + LLM → company_type, services, target_market, summary
- Detección B2B context: ajusta prompts para perspectiva del comprador

### RF-16: Foundation Import (NUEVO)
- `POST /api/v1/projects/{id}/import-foundation`
- Mapea ECPs → Niches, positioning → niche.brief.A, target audience → niche.brief.C
- Competidores de Foundation → NicheBrands
- brand_voice → disponible para article generator system prompt

---

## 5. Integraciones Externas

### 5.1 APIs de LLM
| API | Uso | Config |
|---|---|---|
| **OpenRouter** (preferred) | Acceso unificado | `OPENROUTER_API_KEY` |
| OpenAI | GEO analysis, classification | `OPENAI_API_KEY` |
| Anthropic | Article generation | `ANTHROPIC_API_KEY` |
| Google GenAI | Domain analysis, onboarding | `GOOGLE_AI_API_KEY` |
| Perplexity | GEO con citations nativas | via OpenRouter |

### 5.2 APIs de SERP y Datos
| API | Uso | Config |
|---|---|---|
| **Serper.dev** | SERP results | `SERPER_API_KEY` |
| SerpAPI | Alternativa SERP | `SERPAPI_KEY` |
| **DataForSEO** | Volume, CPC, KD | `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` |
| Google PSI | Lighthouse (gratis) | `GOOGLE_AI_API_KEY` (opcional) |

### 5.3 APIs Social/Influencer
| API | Uso | Config |
|---|---|---|
| YouTube Data API v3 | Channel info | `YOUTUBE_API_KEY` |
| Google CSE | IG profile discovery | `GOOGLE_CSE_KEY` + `GOOGLE_CSE_CX` |
| SearchAPI.io | YouTube search | `SEARCHAPI_KEY` |
| Apify | IG profile scraper | `APIFY_TOKEN` |

### 5.4 Mínimo para funcionar
```env
OPENROUTER_API_KEY=sk-or-...   # Único obligatorio — acceso a todos los LLMs
DATABASE_URL=postgresql+asyncpg://...supabase.co:5432/postgres?sslmode=require
```

Todo lo demás es opcional — el sistema degrada gracefully.

### 5.5 Integraciones que necesita cada cliente

| Integración | Obligatoria? | Quién la pone |
|---|---|---|
| OpenRouter API key | Sí | Sancho (sistema) |
| PostgreSQL (Supabase) | Sí | Sancho (sistema) |
| Serper.dev | Recomendada | Sancho (sistema) |
| DataForSEO | Recomendada | Sancho (sistema) |
| Google PSI | Opcional (gratis) | Sancho (sistema) |
| YouTube API | Opcional | Sancho (sistema) |
| Apify | Opcional (para IG discovery) | Sancho (sistema) |
| LinkedIn API | V2 (social publishing) | Cliente (via Mission Control) |
| Meta Graph API | V2 (social publishing) | Cliente (via Mission Control) |
| Twitter API v2 | V2 (social publishing) | Cliente (via Mission Control) |
| Bot proxies | P2 (bots) | Sancho (sistema) |

**Conclusión**: Para MVP, el cliente NO necesita conectar nada. Todo es infraestructura de Sancho.

---

## 6. Integración con SanchoCMO

### 6.1 Multi-tenant

| clients.json | Escudero |
|---|---|
| `slug` | `project.slug` |
| `website` | `project.website` |
| `guild` | No aplica (web only) |
| `phase` | Determina si hay Foundation data |

**1 Client = 1 Project.** Sancho crea el Project automáticamente al onboarding.

### 6.2 Foundation Data Flow — REGLA P0

**Foundation es la fuente de verdad. Escudero NO genera datos propios si Foundation los tiene.**

Foundation alimenta el QUIÉN y el QUÉ. Escudero descubre el DÓNDE y genera el CÓMO.

```
¿Cliente tiene Foundation (phase ≥ 2)?
  │
  ├── SÍ → POST /projects/{id}/import-foundation
  │         Foundation es OBLIGATORIO como input. Escudero NO genera alternativas.
  │
  └── NO → Foundation incompleta = Escudero NO puede ejecutar a pleno.
            Mínimo: company-context + niche-discovery-100x + competitor-intelligence
            Sin estos: POST /quick-start como fallback degradado (menos preciso)
```

**Mapeo completo Foundation → Escudero:**

| Foundation doc | → Campo Escudero | Uso |
|---|---|---|
| `company-context/current.md` | → `project` (name, website, market, language) + `brand` (is_client, company_type, services) | Proyecto base |
| `niche-discovery-100x/current.md` (ECPs) | → `niches` (name, brief.B objectives, brief.C audience, brief.D messaging) | Nichos y targeting |
| `positioning-messaging/current.md` | → `niche.brief.A` (contexto marca) | Posicionamiento en prompts |
| `competitor-intelligence/current.md` | → `brands` (is_client=False) + `niche_brands` | Competidores para gap analysis |
| `brand-voice/current.md` | → System prompt del article generator + comment templates | Tono de contenido |
| `market-intelligence/current.md` | → Keywords seed, contexto para prompts GEO | Research base |
| `self-intelligence/current.md` | → Brand aliases, dominios, servicios | Detección de menciones |
| `business-model-audit/current.md` | → Detección B2B context | Ajusta keyword generation |

**Lo que Escudero genera SIN Foundation (datos nuevos):**
- SERP results (Serper API)
- GEO responses (queries a LLMs)
- Lighthouse scores (PSI API)
- Own Media scan (blog, social, schema, tech)
- Gap analysis (cruce GEO×SEO)
- KOS scoring
- Articles, covers, schemas

### 6.3 Quién triggerea qué

| Flujo | Trigger | Endpoint Escudero | Output |
|---|---|---|---|
| Onboarding | Sancho skill | `POST /quick-start` | Project + Niches |
| SEO Audit | Sancho cron (semanal) | `POST /audit/run` | SiteAudit |
| Own Media Audit | Sancho cron (semanal) | `POST /own-media/run` | OwnMediaAudit |
| GEO Analysis | Sancho cron (semanal) | `POST /geo/runs` | GeoRun + Responses |
| Gap Analysis | Auto post-GEO | `POST /analysis/gaps/run` | GapItems |
| Recommendations | Auto post-audit | `POST /recommendations/generate` | Recommendations |
| Keywords | Sancho skill / web | `GET /content/keywords/{project}/{niche}` | Keyword list |
| Article | Sancho skill / web | `POST /content/generate/{brief_id}` | Article + Cover + Schema |
| Influencer | Sancho skill | `POST /influencers/discover` | InfluencerResults |

### 6.4 Crons en Sancho (no en Escudero)

Sancho orquesta, Escudero ejecuta. Los crons viven en el sistema de crons de Sancho (OpenClaw):

| Cron | Frecuencia | Qué hace |
|---|---|---|
| `escudero-weekly-audit` | Lunes 9:00 | Para cada cliente activo: audit + own-media + GEO run + gaps + recommendations |
| `escudero-content-digest` | Viernes 10:00 | Resume artículos generados + recommendations pendientes → Discord |

---

## 7. Flujos Operativos

### Flujo 1: Onboarding de nuevo cliente (~2-3 min)

```
Cliente se registra en SanchoCMO
  → Sancho skill "escudero-onboarding"
    → POST /quick-start {url} (o /import-foundation si tiene Foundation)
    → POST /audit/run {project_id}
    → POST /own-media/run {project_id}
    → POST /recommendations/generate {project_id}
  → Discord embed: "Score X. Top 3 prioridades: ..."
```

### Flujo 2: Ciclo semanal de análisis

```
Cron lunes 9:00
  → Para cada cliente activo:
    → POST /geo/runs (4 providers × N prompts × 3 turns)
    → POST /analysis/gaps/run
    → POST /recommendations/generate
  → Discord digest: "X nuevos gaps, Y recomendaciones, GEO visibility Z%"
```

### Flujo 3: Generación de contenido

```
Opción A — Web: usuario selecciona keyword → genera artículo
Opción B — Sancho: skill lee top ContentBrief por opportunity_score → genera
  → Article (1500-2500 words, GEO template)
  → Cover image (1200×630 PNG)
  → JSON-LD schema (Article + FAQPage + Author)
```

### Flujo 4: Atomización a social

```
Artículo generado en Escudero
  → Sancho skill "content-atomizer" (v7.0 existente, adaptado)
    → Input: generated_content + metadata (keyword, category, buyer_stage)
    → Output: LinkedIn post + IG captions + Twitter posts/threads
  → MVP: humano publica manualmente
  → V2: APIs directas (LinkedIn API, Meta Graph API, Twitter API v2)
```

### Flujo 5: Bot engagement (P2)

```
Escudero Influencer Discovery → influencer_results
  → Bot Scheduler (cron cada 6h): filtra relevance_score > 50
  → Crea secuencia por plataforma:

  Instagram (7 días):
    Día 1: View profile + Follow
    Día 2: Like 2 posts
    Día 4: Like 1 + View story
    Día 7: Comment (LLM-generated)

  LinkedIn (10 días):
    Día 1: View profile
    Día 2: Connection request (nota personalizada)
    Día 5: Like 2 posts
    Día 8: Comment (LLM-generated)
    Día 10: Like 1 post

  → Bot Executor (cada 5 min): ejecuta con delays aleatorios
  → Bot Monitor: pausa si success_rate < 70%
```

### Flujo 6: Dashboard SanchoCMO

```
Cliente abre dashboard:
  ├── SEO/GEO Intelligence (datos Escudero)
  │   ├── Scores: Lighthouse, Own Media, GEO visibility
  │   ├── Top 5 recomendaciones (critical/high)
  │   └── Key Opportunities (top 10 dominios)
  ├── Contenido (Escudero + Sancho)
  │   ├── Artículos generados
  │   ├── Social posts (cuando V2)
  │   └── Calendario editorial
  └── Engagement (P2, si bots activos)
      ├── Acciones hoy
      ├── Follow-back rate
      └── Cuentas activas/pausadas
```

---

## 8. Bots IG + LinkedIn

**Status: desde cero. Prioridad P2.**

### 8.1 Acciones permitidas

| Plataforma | Acción | Rate limit | Riesgo |
|---|---|---|---|
| Instagram | Follow | 60/h, 200/día | Medio |
| Instagram | Like | 60/h, 300/día | Bajo |
| Instagram | Comment (LLM) | 20/h, 100/día | Alto |
| Instagram | Story view | 100/h | Bajo |
| Instagram | Unfollow | 60/h (7-14 días post-follow) | Medio |
| LinkedIn | Connection request | 20/día, 100/semana | Medio |
| LinkedIn | Like | 50/día | Bajo |
| LinkedIn | Comment (LLM) | 15/día | Medio-Alto |
| LinkedIn | Profile view | 80/día | Bajo |
| **Ambas** | **DMs** | **PROHIBIDO** | **Ban >90%** |

### 8.2 Anti-ban

| Medida | Detalle |
|---|---|
| Warm-up | 7 días browsing → 7 días al 20% → full a día 21 |
| Delays | Base × (1 ± 0.3). Mínimo 45s entre acciones |
| Horarios | 9:00-22:00 local. No fines de semana para LinkedIn |
| Proxies | Residential, mismo país, sticky 30min |
| Pausas | 3 fallos seguidos → 2h. success_rate <70% → 24h |
| Unfollow | Nunca mismo día. 7-14 días post-follow. Max 50% follows/día |

### 8.3 Comment generation (LLM)

```
System: "Genera comentario natural para {platform}. 1-2 frases, max 150 chars.
Tono genuino, NO promocional. Max 1 emoji. NO links. Idioma: {language}."
```

### 8.4 Infra

- IG: Apify actors
- LinkedIn: Playwright custom + residential proxy
- VPS separado del microservicio Escudero

### 8.5 Costo: ~$149/mes por cliente → Precio al cliente: $249-299/mes (add-on)

---

## 9. Skills de Sancho — Mapa

### 9.1 Skills existentes que se adaptan

| Skill | Acción | Cambio |
|---|---|---|
| `seo-audit` | Se vuelve **wrapper** de Escudero RF-07 | Llama `POST /audit/run`, formatea resultado para Discord |
| `ai-seo` | Se vuelve **wrapper** de Escudero RF-04 | Llama `POST /geo/runs`, resume en Discord |
| `seo-content` | Se adapta para consumir **ContentBrief** de Escudero | Lee brief con top opportunity_score, genera via Escudero |
| `content-atomizer` | Se adapta el **input** | Acepta ContentBrief metadata (keyword, category, buyer_stage) además de URLs/texto |
| `social-content` | Complementa atomizer output | Sin cambios |

### 9.2 Skills nuevos

| Skill | Prioridad | Qué hace |
|---|---|---|
| `execution-onboarding` | P0 | Llama quick-start (o import-foundation) + audit + own-media + recommendations |
| `execution-weekly-audit` | P0 | Cron: GEO run + gaps + recommendations para cada cliente |
| `execution-content-digest` | P1 | Cron: resumen semanal de artículos + recommendations |
| `social-publisher` | P1 (V2) | Publica en IG/LI/Twitter via APIs directas |
| `bot-manager` | P2 | Gestiona cuentas bot, pausa/resume, métricas |

---

## 10. Workstreams y Prioridades (Hilos)

> **v3.0** — Estructura aprobada por Alfonso (2026-03-22)
> Cambios: Trust Engine como audit central, Idea Generation como sistema de intelligence
> con MC UI + tareas recurrentes configurables, bots dentro de canales (hilos de ejecución
> separados), outreach en canal propio por tipo (partners, venta directa).

### Flujo Maestro

```
FOUNDATION → STRATEGIC PLAN → EXECUTION ENGINE
                                    │
                    ┌───────────────┼───────────────┐
                    ↓               ↓               ↓
              TRUST ENGINE    IDEA GENERATION    CANALES
              (audit único)   (intelligence      (ejecución
               → 3 listas      recurrente)        por canal)
```

### A) Trust Engine (Audit — ejecuta 1 vez, repite periódicamente)

Analiza customer journey del cliente. Genera 3 listas:
1. **Ideas de contenido propio** → se ejecutan en canal Blog/IG/LI/TW
2. **Blogs/medios donde aparecer** → se ejecutan en canal Outreach
3. **Influencers/partners a contactar** → se ejecutan en canal Partners

Las listas viven en el documento del proyecto Trust Engine.
La ejecución va a cada canal correspondiente.

### B) Idea Generation (Intelligence — cron recurrente configurable)

Sistema cross-canal de generación de ideas. NO es solo "content ideas":
- Busca ideas según la estrategia activa (SEO, paid ads, outreach, todo)
- Tiene su propia DB (`idea_bank`) + lista visible en Mission Control
- Human review: aprobar/rechazar ideas desde MC
- Las ideas aprobadas van al canal correspondiente

**Mission Control — Sección "Tareas Recurrentes":**
- Lista de tareas activas con toggles activar/pausar
- Prompts/queries editables por tarea
- Frecuencia configurable (cada X horas/días)
- Historial de ejecuciones + ideas generadas
- Auto-sugerencia: al terminar un proceso → "¿Quieres que esto sea recurrente?"

### C) Canales de Ejecución

Cada canal tiene sus hilos de ejecución. Engagement (bots) = hilo propio dentro del canal.

```
Blog
  └── Hilo: Creación contenido SEO+GEO

Instagram
  ├── Hilo: Contenido (posts, carousels, reels, stories)
  └── Hilo: Engagement (bot: follow, like, comment — recurrente)

LinkedIn
  ├── Hilo: Contenido (posts, articles, carousels)
  └── Hilo: Engagement (bot: connections, likes, comments — recurrente)

Twitter
  └── Hilo: Contenido (tweets, threads)

Partners
  └── Hilo: Outreach partners/influencers

Outreach (venta directa)
  └── Hilo: Outreach B2B / cold outreach
```

---

### Hilos de Desarrollo (PDR)

| Hilo | Nombre | Prioridad | Status | Scope |
|---|---|---|---|---|
| **1** | 🏗️ Infra & Deploy | P0 | ✅ | Backend Python 3.12 local, API keys, DB |
| **2** | 🔍 Audit (SEO+GEO+Own Media) | P0 | ✅ | Lighthouse, GEO multi-provider, Own Media, Gap, Recs |
| **3** | 🔑 SEO Strategy | P1 | ✅ | Keywords, SERP, Volume/CPC, content gaps |
| **4** | 🤖 GEO Strategy | P1 | ✅ | Prompts, visibility tracking, enrichment |
| **5** | 🔍 Trust Engine | P1 | ⏳ | Customer journey audit → 3 listas |
| **6** | 💡 Idea Generation | P1 | ⏳ | Intelligence recurrente + MC UI + idea_bank |
| **7** | ✍️ Blog Content | P1 | ✅ | Articles + cover + JSON-LD schema |
| **8** | 📱 Instagram (contenido + engagement) | P1 | ⏳ | Skills content + bot en mismo canal |
| **9** | 💼 LinkedIn (contenido + engagement) | P1 | ⏳ | Skills content + bot en mismo canal |
| **10** | 🐦 Twitter | P2 | ⏳ | Content skill |
| **11** | 🎯 Influencer/Partner Discovery | P1 | ✅ | SERP discovery + brief + outreach |
| **12** | 📨 Outreach | P1 | ⏳ | Partners + venta directa en canales separados |

### Modelo de Datos Nuevos

```sql
-- Tareas recurrentes (configurable desde MC)
recurring_tasks
  ├── id UUID PK
  ├── project_id FK → projects
  ├── name VARCHAR
  ├── task_type VARCHAR (trust_engine, idea_gen, audit, engagement...)
  ├── config JSONB (prompts, queries, parámetros editables)
  ├── schedule VARCHAR (cron expression o intervalo)
  ├── status VARCHAR (active, paused)
  ├── last_run_at TIMESTAMP
  ├── next_run_at TIMESTAMP
  └── created_at TIMESTAMP

-- Banco de ideas (cross-canal)
idea_bank
  ├── id UUID PK
  ├── project_id FK → projects
  ├── task_id FK → recurring_tasks (nullable, qué tarea la generó)
  ├── type VARCHAR (content, outreach, partner, ad, seo, geo...)
  ├── title VARCHAR
  ├── description TEXT
  ├── source VARCHAR (trust_engine, paa, trending, signal, manual...)
  ├── target_channel VARCHAR (blog, instagram, linkedin, twitter, outreach, partners)
  ├── status VARCHAR (new, approved, rejected, executed)
  ├── priority_score FLOAT
  ├── approved_at TIMESTAMP
  ├── approved_by VARCHAR
  └── created_at TIMESTAMP
```

### Skills mapa (actualizado v3.0)

| Skill | Hilo | Status | Descripción |
|---|---|---|---|
| `seo-audit` | Foundation | ✅ | Audit técnico. Se queda en Foundation |
| `keyword-research` | 3 | ✅ | Engine Python + DataForSEO |
| `seo-content-strategy` | 3 | ✅ | Top 10 analysis → gaps → contenido superior |
| `trust-engine` | 5 | ⏳ | Customer journey audit → 3 listas |
| `idea-generation` | 6 | ⏳ | Intelligence recurrente cross-canal |
| `content-generation` | 7 | ✅ | Blog articles SEO+GEO optimized |
| `instagram-content` | 8 | ⏳ | Contenido nativo IG |
| `instagram-engagement` | 8 | ⏳ | Bot IG (follow/like/comment) |
| `linkedin-content` | 9 | ⏳ | Contenido nativo LI |
| `linkedin-engagement` | 9 | ⏳ | Bot LI (connections/likes/comments) |
| `twitter-content` | 10 | ⏳ | Contenido nativo Twitter |
| `partner-finder` | 11/12 | ⏳ | Discovery + outreach |
| `outreach-sequences` | 12 | ⏳ | Secuencias outreach por canal |

### Brand Book en Execution

El Brand Book (brand_voice + positioning + ECPs) cruza TODA la ejecución:
- System prompt de TODOS los LLM calls incluye brand_voice + ECP target
- Cada pieza de contenido (blog, social, comments, outreach) suena a la marca
- Sin Brand Book = contenido genérico. Con Brand Book = coherencia cross-platform.

### Reglas P0
- **Strategic Plan es gatekeeper** — decide qué canales activar por cliente
- **Trust Engine genera listas, canales las ejecutan** — separación clara
- **Idea Generation es intelligence, no content** — cross-canal, con su propia DB
- **Bots van dentro de canales** — hilos de ejecución separados para engagement
- **Human in the loop** — entre ideación y generación, entre generación y publicación
- **Foundation es fuente de verdad** — Execution Engine consume, no regenera
- **Local dev** — sin Railway por ahora
- **Brand Book obligatorio** — sin él no se genera contenido

---

## 11. Criterios de Aceptación

### CA-01: Onboarding
- [ ] URL → extrae company_type, services, target_market en <10s
- [ ] Sugiere 2-3 nichos con 3-5 competidores reales
- [ ] Si tiene Foundation → importa ECPs como nichos correctamente

### CA-02: GEO Analysis
- [ ] Envía prompts a ≥2 providers simultáneamente
- [ ] 3-turn conversation funciona
- [ ] Detecta mentions con position + sentiment
- [ ] Extrae citations (URLs) de markdown links y bare URLs

### CA-03: SEO Analysis
- [ ] SERP results con position, title, snippet, domain
- [ ] Content classification ≥80% sin LLM
- [ ] Domain classification ≥70% con rules engine

### CA-04: Gap Analysis
- [ ] Cross-reference GEO + SEO correcto
- [ ] Scoring: ranking > review > solution

### CA-05: Site Audit
- [ ] Lighthouse scores (4 categorías)
- [ ] 15 health checks
- [ ] Issues con severity + fix steps + impact %

### CA-06: Own Media
- [ ] Blog detection + posting frequency
- [ ] ≥3 plataformas sociales (si existen)
- [ ] Schemas JSON-LD presentes y faltantes
- [ ] CMS, analytics, CDN, framework

### CA-07: Recommendations
- [ ] Agrega ≥3 fuentes
- [ ] Severities correctas
- [ ] Impact basado en Princeton research

### CA-08: Content Engine
- [ ] Artículos 1500-2500 palabras
- [ ] Respuesta directa blockquote
- [ ] FAQ 3-5 preguntas
- [ ] Cover 1200×630
- [ ] JSON-LD Article + FAQPage + Author

### CA-09: KOS
- [ ] 5 dimensiones correctas
- [ ] Priority thresholds (70/50/30)
- [ ] Recommended actions

### CA-10: Content Atomizer Integration
- [ ] Acepta ContentBrief como input
- [ ] Genera LinkedIn + IG + Twitter variants
- [ ] Usa brand_voice si disponible

### CA-11: Crons Sancho
- [ ] Weekly audit ejecuta para cada cliente activo
- [ ] Notifica por Discord con resumen

---

## 12. Riesgos

| Riesgo | Impacto | Prob. | Mitigación |
|---|---|---|---|
| API rate limits (OpenRouter, Serper, PSI) | Runs fallan | Media | Retry con backoff, graceful degradation |
| LLM hallucinations en onboarding | Competidores inventados | Alta | "No inventes" en prompts + verificación manual |
| Scraping failures (403, Cloudflare) | Discovery incompleto | Alta | Fallback a LLM knowledge, HEAD+GET retry |
| DataForSEO costs escalando | Budget | Media | Batch queries, caching, créditos |
| Pillow en serverless | Cover generation falla | Media | Docker layer pre-built |
| Bot bans (P2) | Cuentas bloqueadas | Alta | Warm-up 21 días, rate limits conservadores, pausa automática |
| Railway cold starts | Latencia primer request | Baja | Keep-alive ping o plan paid |

---

## 13. Estimación

| Fase | Componente | Esfuerzo |
|---|---|---|
| **WS-1** Infra | Dockerfile + Railway + env config | 1-2 días |
| **WS-1** Infra | Drizzle schemas (mirror de SQLAlchemy) | 2-3 días |
| **WS-2** Audit | Validar engines con PostgreSQL real | 1-2 días |
| **WS-2** Audit | Skills wrapper (seo-audit, ai-seo) | 1 día |
| **WS-2** Audit | Cron weekly-audit en Sancho | 1 día |
| **WS-3** Content | Adaptar content-atomizer input | 1 día |
| **WS-3** Content | Skill escudero-onboarding | 1 día |
| **WS-5** Multi-client | Endpoint import-foundation | 1-2 días |
| **WS-5** Multi-client | clients.json → Projects sync | 1 día |
| **WS-4** Bots | Spec + aprobación | 1-2 días |
| **WS-4** Bots | Implementación IG bot | 3-5 días |
| **WS-4** Bots | Implementación LinkedIn bot | 3-5 días |
| Testing E2E | Full flow por cliente | 3-5 días |
| **Total** | | **~3-4 semanas** |

---

## 14. Apéndice: Fórmulas

### Sentiment Scoring
```python
pos = count(POSITIVE_SIGNALS in context)
neg = count(NEGATIVE_SIGNALS in context)
score = min(1.0, 0.5 + 0.15*(pos-neg)) if pos>neg else max(-1.0, -0.5 - 0.15*(neg-pos)) if neg>pos else 0.0
```

### Keyword Opportunity Score
```python
kd_factor = (100 - kd) / 100
commercial = min(1.0, (volume * max(cpc, 0.1)) / 5000)
score = 0.2 + commercial * 0.5 + kd_factor * 0.3
```

### Gap Opportunity Score
```python
score = min(30, n_competitors*10) + (25 if geo+serp else 15 if geo else 10) + content_bonus + domain_bonus
```

### Key Opportunity Score (KOS)
```python
KOS = seo*0.25 + geo*0.25 + backlink*0.15 + content_gap*0.15 + competitive*0.20
```

### Own Media Scoring
```python
overall = content*0.35 + social*0.30 + technical*0.35
```

### Princeton GEO Benchmarks
| Técnica | Uplift |
|---|---|
| Citar fuentes autoritativas | +30-40% |
| Estadísticas con fuente | +15-25% |
| Citas de expertos (blockquote) | +10-20% |
| FAQ JSON-LD | +10-15% |
| Author E-E-A-T schema | +5-10% |
| Tono autoritativo | +5-15% |

---

## 15. Decisiones Tomadas

| # | Decisión | Resultado |
|---|---|---|
| D1 | Microservicio Python vs rewrite TS | **Python** — código funcional, no se toca |
| D2 | Auth SanchoCMO ↔ Escudero | **API key interna**, Next.js valida usuario |
| D3 | Multi-tenant | **1 Client = 1 Project**, Sancho crea automáticamente |
| D4 | Contenido social | **Escudero genera blog → content-atomizer adapta → manual MVP → APIs V2** |
| D5 | Bots IG/LinkedIn | **Proyecto independiente**, P2, infra separada |
| D6 | Crons | **En Sancho** (no en Docker de Escudero) |
| D7 | Foundation data | **Si existe, importar** (ECPs→Niches, positioning→brief, brand_voice→prompts) |
| D8 | seo-audit / ai-seo | **Escudero reemplaza**, skills se vuelven wrappers |
| D9 | content-atomizer | **Adaptar** input, no reemplazar (v7.0 es superior) |
| D10 | Social publishing | **Manual para MVP**, APIs directas en V2 |
| D11 | Secuencia bots | **Flujos detallados**: 7 días IG, 10 días LinkedIn |
| D12 | Costo bots | **Al cliente**: $249-299/mes add-on |

---

## 16. Pendiente Alfonso

| # | Tema | Opciones | Recomendación |
|---|---|---|---|
| **PA-1** | Deploy microservicio | Railway / Render / Fly.io | Railway ($5/mo, deploy desde GitHub) |
| **PA-2** | Acceso al repo | GitHub link / zip / subir al workspace | Necesario para WS-1 |
| **PA-3** | Validación WS-4 (bots) | Aprobar spec + presupuesto proxies | $149/mo costo, $249-299/mo al cliente |

---

*PDR consolidado generado el 2026-03-17. Versión 2.0.*
*Fuentes: 6 documentos de Philippe + análisis Cervantes.*
