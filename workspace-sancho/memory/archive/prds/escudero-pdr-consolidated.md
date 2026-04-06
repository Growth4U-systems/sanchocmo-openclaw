# PDR — Sancho Execution Engine (Trust Engine)

**ID:** T-050
**Producto:** Sancho Execution Engine — SEO+GEO Intelligence & Content
**Versión:** 4.0 (limpia — feedback Alfonso aplicado)
**Fecha:** 2026-03-22
**Autor:** Philippe + Cervantes + Alfonso
**Sistema:** SanchoCMO — Post-Foundation Execution
**Estado:** En revisión
**Prioridad:** P0

> **Escudero es un proceso lineal** que se ejecuta una vez cuando lo lanzas.
> Recurrencia y bots van en sus propios PDRs separados.

---

## 1. Problema y Propuesta de Valor

### 1.1 Qué resuelve

Después de Foundation (quién eres, a quién sirves, cómo hablas), el cliente necesita:

1. **Saber dónde está** — Visión unificada SEO + GEO + Own Media
2. **Saber qué le falta** — Gaps donde competidores aparecen y él no
3. **Saber qué hacer** — Recomendaciones accionables con impacto esperado
4. **Ejecutar** — Contenido optimizado para Google e IAs

### 1.2 Ciclo

```
Trust Engine (audit) → Listas (contenido, medios, influencers) → Ejecución por canal
```

### 1.3 Relación con el resto del sistema

| Componente | Responsabilidad | Estado |
|---|---|---|
| Foundation | QUIÉN eres, A QUIÉN, CÓMO hablas | ✅ Existe |
| Strategic Plan | QUÉ canales, EN QUÉ orden | ✅ Existe |
| **Execution Engine (este PDR)** | **ANALIZAR + CREAR contenido** | En desarrollo |
| Idea Generation System | Recurrencia, intelligence, MC UI | Separado (otro hilo) |
| Bots de Engagement | IG/LI automation | Separado (otro hilo) |

---

## 2. Arquitectura

### 2.1 Integración con Sancho

Escudero es un backend Python que Sancho consume como herramienta. No tiene frontend propio para clientes.

```
┌─────────────────────────────────────────────────────┐
│  SANCHO (OpenClaw)                                  │
│  Skills ── Discord Bot ── Mission Control (HTML)    │
│       │                        │                    │
│    Execution skills        Resultados visibles      │
│    llaman Escudero API     en MC auto-regenerado    │
└───────┼────────────────────────┼────────────────────┘
        │                        │
        ▼                        │
┌─────────────────────────────────────────────────────┐
│  ESCUDERO API (Python 3.12, FastAPI, local)         │
│  Auth: API key interna                              │
│                                                     │
│  SEO Engines ── GEO Engines ── Content Engine       │
│  Domain Intel ── Own Media ── Recommendations       │
│  Influencer Discovery                               │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│  SQLITE (local dev) / PostgreSQL (prod)             │
│  26 tablas Escudero                                 │
└─────────────────────────────────────────────────────┘
```

### 2.2 Comunicación

- **Sancho → Escudero**: HTTP con API key interna. Skills de Sancho llaman endpoints.
- **Mission Control**: HTML auto-regenerado que muestra resultados. NO es Next.js.
- **Discord**: Resultados se muestran en hilos del cliente.

### 2.3 Deploy

- **Local dev** en Mac (actual). No Railway por ahora.
- **Prod** futuro: Docker container.

### 2.4 Estructura del código (existente, funcional)

```
backend/
├── app/
│   ├── config.py          # Settings (.env)
│   ├── database.py        # SQLAlchemy engine
│   ├── main.py            # FastAPI app
│   ├── models/            # 26 tablas
│   ├── engines/           # 46 archivos de lógica
│   │   ├── seo/           # SERP fetching, classification
│   │   ├── geo/           # LLM adapters, parsing
│   │   ├── domain/        # Domain classification
│   │   ├── intelligence/  # Gap analysis, scoring, recs
│   │   ├── content/       # Articles, keywords, covers, schemas
│   │   └── own_media/     # Blog, social, schema, tech
│   ├── api/v1/            # 65+ endpoints
│   └── tasks/             # Background tasks
```

---

## 3. Modelo de Datos

### 3.1 Tablas existentes (26) — todas funcionales

| # | Tabla | Descripción |
|---|---|---|
| 1 | `projects` | Proyecto/empresa. 1 Project = 1 Client de Sancho (mapeado a clients.json) |
| 2 | `brands` | Marca (is_client=True para el cliente, False para competidores) |
| 3 | `brand_domains` | Dominios adicionales de una marca |
| 4 | `niches` | Nicho de mercado con brief estratégico (A/B/C/D) |
| 5 | `niche_brands` | Join: competidores asignados a un nicho |
| 6 | `prompt_topics` | Categoría de prompts GEO |
| 7 | `prompts` | Prompt GEO individual |
| 8 | `serp_queries` | Keyword SERP |
| 9 | `serp_results` | Resultado individual de Google |
| 10 | `content_classifications` | Tipo de contenido detectado |
| 11 | `geo_runs` | Ejecución GEO multi-provider |
| 12 | `geo_responses` | Respuesta de un LLM (3 turns) |
| 13 | `brand_mentions` | Mención de marca en respuesta GEO |
| 14 | `source_citations` | URL citada por un LLM |
| 15 | `domains` | Catálogo de dominios clasificados |
| 16 | `exclusion_rules` | Reglas de exclusión por proyecto |
| 17 | `project_domains` | Dominio × Proyecto con priority_score |
| 18 | `gap_analyses` | Análisis de gaps GEO×SEO |
| 19 | `gap_items` | Gap individual |
| 20 | `action_briefs` | Acción recomendada para un gap |
| 21 | `influencer_results` | Influencer descubierto (YT/IG) |
| 22 | `site_audits` | Audit Lighthouse + health checks |
| 23 | `background_jobs` | Job async con progreso |
| 24 | `recommendations` | Recomendación priorizada |
| 25 | `content_briefs` | Brief + artículo generado + cover + schema |
| 26 | `own_media_audits` | Audit de medios propios |

> **Nota**: Escudero tiene su propia DB. Se mapea a Sancho via `clients.json` slug ↔ `project.slug`.
> Las tablas de bots (bot_accounts, bot_actions, bot_metrics) están en el PDR de Bots, NO aquí.

---

## 4. Requisitos Funcionales

> **Prerrequisito**: Foundation completa (company-context, ECPs, positioning, competitors, brand-voice).
> Escudero NO hace onboarding — Foundation ya lo maneja. Escudero consume datos de Foundation.

### RF-01: Import Foundation Data
- `POST /api/v1/projects/{id}/import-foundation`
- Mapea ECPs → Niches, positioning → brief, competitors → brands
- brand_voice → disponible para content generation
- **Verificación**: confirma que Foundation está completa antes de ejecutar

### RF-02: Análisis SEO (SERP Fetching)
- Busca keywords en Google via Serper.dev (ya integrado en Sancho)
- Guarda resultados con position, title, snippet, domain
- Content classification 3-tier: URL patterns → title keywords → LLM fallback
- Domain classification 3-tier: known domains → heuristics → LLM fallback

### RF-03: Análisis GEO (Multi-Provider LLM)
- 4 providers simultáneos (usa las APIs ya integradas en Sancho)
- Conversación 3-turn: Discovery → Why → Sources
- Parser: brand mentions (position, sentiment, context), citations (URLs)

### RF-04: SEO Site Audit
- Lighthouse via Google PSI API
- Core Web Vitals (LCP, TBT, CLS, FCP, Speed Index)
- 15 health checks (meta, sitemap, robots, canonical, SSL, structured data, mobile, alt tags)
- Issues con severity + fix steps + expected impact %

### RF-05: Own Media Audit
- 4 scanners: Blog, Social Discovery, Schema, Tech Detector
- Scoring: content (35%) + social (30%) + technical (35%)

### RF-06: Gap Analysis
- Cruza GEO citations × SEO SERPs
- Identifica URLs donde competidores aparecen y cliente no
- Opportunity scoring (0-100)

### RF-07: Recommendations
- 4 fuentes: audit issues, GEO enrichment, own media gaps, provider visibility
- Severity: critical/high/medium/low
- Expected impact basado en Princeton GEO benchmarks

### RF-08: Keyword Research
- LLM genera keywords por nicho (6 categorías: ranking, comparison, guide, solution, authority, discovery)
- DataForSEO enrichment: volume, CPC, KD
- Scoring: `0.2 + commercial×0.5 + kd_factor×0.3`

### RF-09: Article Generator (GEO-optimizado)
- 1500-2500 palabras con template GEO
- 10 tipos de artículo
- System prompt incluye brand_voice de Foundation
- Post-procesado: direct_answer, faq_items, title

### RF-10: Cover Image Generator
- 1200×630 PNG con Pillow (gradient + category badge + title + brand)

### RF-11: JSON-LD Schema Generator
- Article + FAQPage + Author Person (E-E-A-T)

### RF-12: Influencer/Partner Discovery
- YouTube: Data API v3 / SearchAPI.io
- Instagram: Google CSE + Apify scraper
- Relevance scoring + Influencer brief (LLM)

### RF-13: Foundation Import
- ECPs → Niches
- Positioning → niche.brief.A
- Target audience → niche.brief.C
- Competidores → NicheBrands
- brand_voice → system prompts

---

## 5. Integraciones Externas

> Las APIs de LLM (OpenAI, Anthropic, OpenRouter, etc.) y SERP (Serper, DataForSEO)
> ya están integradas en el sistema de Sancho. Escudero las consume via las keys del sistema.
> Ver configuración en la documentación de Sancho.

### APIs específicas de Escudero (no en Sancho base):

| API | Uso | Config |
|---|---|---|
| Google PSI | Lighthouse audit | `GOOGLE_AI_API_KEY` (gratis) |
| YouTube Data API v3 | Influencer discovery | `YOUTUBE_API_KEY` |
| Google CSE | IG profile discovery | `GOOGLE_CSE_KEY` + `GOOGLE_CSE_CX` |
| SearchAPI.io | YouTube search | `SEARCHAPI_KEY` |
| Apify | IG profile scraper | `APIFY_TOKEN` |

---

## 6. Integración con Sancho

### 6.1 Foundation Data Flow — REGLA P0

**Foundation es la fuente de verdad. Escudero NO genera lo que Foundation ya tiene.**

```
¿Cliente tiene Foundation completa?
  SÍ → POST /import-foundation → Escudero recibe datos
  NO → No se puede ejecutar Escudero a pleno
```

**Mapeo Foundation → Escudero:**

| Foundation doc | → Campo Escudero |
|---|---|
| company-context | → project (name, website, market, language) + brand |
| ECPs | → niches (name, brief) |
| positioning | → niche.brief.A |
| competitor-intelligence | → brands (is_client=False) + niche_brands |
| brand-voice | → system prompt del article generator |
| self-intelligence | → brand aliases, dominios |

### 6.2 Endpoints que Sancho skills llaman

| Acción | Endpoint | Output |
|---|---|---|
| Import Foundation | `POST /projects/{id}/import-foundation` | Project + Niches |
| SEO Audit | `POST /audit/run` | SiteAudit |
| Own Media Audit | `POST /own-media/run` | OwnMediaAudit |
| GEO Analysis | `POST /geo/runs` | GeoRun + Responses |
| Gap Analysis | `POST /analysis/gaps` | GapItems |
| Recommendations | `POST /recommendations/generate` | Recommendations |
| Keywords | `POST /content/suggest-keywords` | Keyword list |
| Article | `POST /content/briefs/{id}/generate-article` | Article + Cover + Schema |
| Influencers | `POST /influencers/search` | InfluencerResults |

---

## 7. Flujo Operativo

> **Escudero es un proceso lineal.** Se ejecuta una vez por lanzamiento.
> La recurrencia (crons, idea generation) se gestiona en otro sistema (ver hilo Idea Generation).

### Flujo: Trust Engine (ejecución única)

```
1. IMPORT
   → Sancho lee Foundation del cliente
   → POST /import-foundation → crea proyecto + niches + competitors

2. AUDIT (diagnóstico)
   → POST /audit/run → SEO health + Lighthouse
   → POST /own-media/run → blog, social, schemas, tech
   → POST /geo/runs → visibility en IAs (multi-provider, 3-turn)
   → POST /analysis/gaps → cruza SEO × GEO
   → POST /recommendations/generate → accionables priorizados

3. STRATEGY (análisis)
   → POST /content/suggest-keywords → keywords por nicho
   → Influencer discovery → SERP-based (YT + IG)
   → Influencer brief → LLM-generated

4. OUTPUT: 3 LISTAS
   ├── A) Ideas de contenido propio (keywords + gaps + recs)
   ├── B) Blogs/medios donde aparecer (gap analysis domains)
   └── C) Influencers/partners a contactar (influencer_results)

5. EJECUCIÓN (por canal, según Strategic Plan)
   → Blog: POST /content/briefs/{id}/generate-article
   → Social: content-atomizer (skill Sancho existente)
   → Outreach: partner-finder / outreach sequences
```

### Flujo: Content Generation

```
Keyword seleccionada (de lista A)
  → POST /content/briefs/add (crear brief)
  → Human review (aprobar brief)
  → POST /content/briefs/{id}/generate-article
    → Artículo (1500-2500 palabras, template GEO)
    → Cover image (1200×630 PNG)
    → JSON-LD schema (Article + FAQ + Author)
  → Human review (aprobar artículo)
  → Publicar / atomizar a social
```

---

## 8. Skills de Sancho

### Skills existentes que se adaptan

| Skill | Cambio |
|---|---|
| `seo-audit` | Wrapper → llama `POST /audit/run`, formatea resultado |
| `ai-seo` | Wrapper → llama `POST /geo/runs`, resume visibility |
| `content-atomizer` | Adaptar input para aceptar ContentBrief metadata |

### Skills nuevos necesarios

| Skill | Qué hace |
|---|---|
| `trust-engine` | Orquesta el flujo completo: import → audit → analysis → 3 listas |
| `instagram-content` | Contenido nativo IG (captions, carousels, reels) |
| `linkedin-content` | Contenido nativo LI (posts, articles, carousels) |
| `twitter-content` | Contenido nativo Twitter (threads, tweets) |
| `partner-finder` | Discovery + outreach sequences |

---

## 9. Workstreams y Prioridades

### Hilos de Desarrollo

| Hilo | Nombre | Status | Scope |
|---|---|---|---|
| 1 | Infra & Deploy | ✅ | Backend Python 3.12 local, API keys, DB |
| 2 | Audit (SEO+GEO+Own Media) | ✅ | Lighthouse, GEO multi-provider, Own Media, Gap, Recs |
| 3 | SEO Strategy | ✅ | Keywords, SERP, Volume/CPC, content gaps |
| 4 | GEO Strategy | ✅ | Prompts, visibility tracking, enrichment |
| 5 | Trust Engine | ⏳ | Customer journey audit → 3 listas |
| 6 | Blog Content | ✅ | Articles + cover + JSON-LD schema |
| 7 | Influencer/Partner Discovery | ✅ | SERP discovery + brief |
| 8 | Instagram Content | ⏳ | Skill contenido nativo IG |
| 9 | LinkedIn Content | ⏳ | Skill contenido nativo LI |
| 10 | Twitter Content | ⏳ | Skill contenido nativo TW |
| 11 | Outreach | ⏳ | Partners + medios |

> **Nota**: Idea Generation System y Bots de Engagement tienen sus propios PDRs en hilos separados.

### Brand Book en Execution

El Brand Book (brand_voice + positioning + ECPs) cruza TODA la ejecución:
- System prompt de TODOS los LLM calls incluye brand_voice + ECP target
- Sin Brand Book = contenido genérico. Con Brand Book = coherencia cross-platform.

### Reglas P0
- **Escudero es lineal** — se ejecuta una vez, produce resultados
- **Foundation es prerequisito** — sin Foundation completa no se ejecuta
- **Strategic Plan decide** — qué canales activar por cliente
- **Trust Engine genera listas, canales ejecutan** — separación clara
- **Human in the loop** — entre ideación y generación, entre generación y publicación
- **Brand Book obligatorio** — sin él no se genera contenido
- **Local dev** — sin Railway por ahora

---

## 10. Criterios de Aceptación

### CA-01: Foundation Import
- [ ] Importa ECPs como nichos correctamente
- [ ] Mapea positioning → brief.A, audience → brief.C
- [ ] Competidores → brands (is_client=False)

### CA-02: GEO Analysis
- [ ] ≥2 providers simultáneos
- [ ] 3-turn conversation
- [ ] Mentions con position + sentiment
- [ ] Citations (URLs)

### CA-03: SEO Analysis
- [ ] SERP results con position, title, snippet, domain
- [ ] Content classification ≥80% sin LLM

### CA-04: Site Audit
- [ ] Lighthouse scores (4 categorías)
- [ ] 15 health checks
- [ ] Issues con severity + fix steps + impact %

### CA-05: Own Media
- [ ] Blog detection + posting frequency
- [ ] ≥3 plataformas sociales
- [ ] Schemas JSON-LD
- [ ] CMS, analytics, CDN

### CA-06: Gap Analysis + Recommendations
- [ ] Cross-reference GEO + SEO correcto
- [ ] Recommendations con severity + impact %

### CA-07: Content Engine
- [ ] Artículos 1500-2500 palabras
- [ ] Respuesta directa blockquote
- [ ] Cover 1200×630
- [ ] JSON-LD Article + FAQPage + Author

### CA-08: Trust Engine (flujo completo)
- [ ] Import → Audit → Analysis → 3 listas generadas
- [ ] Ejecutable end-to-end con 1 cliente

---

## 11. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| API rate limits | Runs fallan | Retry con backoff, graceful degradation |
| LLM hallucinations | Competidores inventados | Prompts estrictos + verificación |
| Scraping failures (403) | Discovery incompleto | Fallback a LLM knowledge |
| Foundation incompleta | Resultados pobres | Gate check obligatorio |

---

## 12. Apéndice: Fórmulas

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
| Tono autoritativo | +5-15% |

---

## 13. Decisiones Tomadas

| # | Decisión | Resultado |
|---|---|---|
| D1 | Microservicio Python vs rewrite | **Python** — código funcional, no se toca |
| D2 | Frontend | **Mission Control HTML** auto-regenerado, NO Next.js |
| D3 | Escudero es lineal o recurrente | **Lineal** — se ejecuta una vez. Recurrencia en otro sistema |
| D4 | Bots | **PDR separado** — no en este documento |
| D5 | Idea Generation | **PDR separado** — no en este documento |
| D6 | Foundation data | **Si existe, importar.** Sin Foundation, no ejecutar |
| D7 | Deploy | **Local dev** por ahora |
| D8 | Social content | Blog → atomizer → social. Skills separados por plataforma |
