# Flujos de Integración — Escudero × SanchoCMO × Bots

---

## Flujo 1: Onboarding de nuevo cliente

```
Cliente se registra en SanchoCMO
         │
         ▼
Sancho skill "onboarding"
         │
         ├──► POST /api/v1/projects/quick-start {url: "https://cliente.com"}
         │         │
         │         ├── Scrape website → extract company_type, services
         │         ├── LLM sugiere 2-3 nichos + competidores
         │         └── Crea: Project + Brand(is_client) + Niches + NicheBrands
         │
         ├──► POST /api/v1/audit/run {project_id}
         │         └── Lighthouse + SEO Health → SiteAudit
         │
         ├──► POST /api/v1/own-media/run {project_id}
         │         └── Blog + Social + Schema + Tech → OwnMediaAudit
         │
         └──► POST /api/v1/recommendations/generate {project_id}
                   └── Agrega audit + GEO + own_media → Recommendations[]
                            │
                            ▼
                   Discord embed al cliente:
                   "Tu sitio tiene score X. Estas son tus 3 prioridades:"
```

**Tiempo total:** ~2-3 minutos (async, polling cada 3s)

---

## Flujo 2: Ciclo semanal de análisis

```
Cron semanal (lunes 9:00)
         │
         ├──► Para cada cliente activo:
         │
         │    POST /api/v1/geo/runs {project_id, niche_id, providers: ["openai","anthropic","gemini","perplexity"]}
         │         │
         │         ├── Envía prompts × providers (3 turns cada uno)
         │         ├── Parsea mentions + citations
         │         └── GeoRun completado
         │
         │    POST /api/v1/analysis/gaps/run {project_id}
         │         │
         │         ├── Cross-reference GEO citations × SERP results
         │         └── GapItems con opportunity_score
         │
         │    POST /api/v1/recommendations/generate {project_id}
         │         └── Regenera recommendations (borra open, crea nuevas)
         │
         └──► Discord digest:
              "Resumen semanal: X nuevos gaps, Y recomendaciones, visibilidad GEO: Z%"
```

---

## Flujo 3: Generación de contenido

```
Opción A — Desde web:
  Usuario va a /projects/[id]/niches/[slug]/contenido
         │
         ▼
  GET /content/keywords/{project_id}/{niche_slug}
         │  → LLM genera 80 keywords → DataForSEO valida volume/CPC/KD
         │  → Gap analysis keywords
         │  → SERP query keywords
         ▼
  Usuario selecciona keyword → POST /content/briefs
         │
         ▼
  POST /content/generate/{brief_id}
         │  → LLM genera artículo 1500-2500 palabras
         │  → Post-procesado: extract direct_answer + faq_items
         │  → Genera cover image (1200x630 PNG)
         │  → Genera JSON-LD schema (Article + FAQPage + Author)
         ▼
  Artículo listo en /articles/[briefId]
         │
         ▼
  Botón "Copiar HTML" / "Copiar JSON-LD" / "Descargar cover"


Opción B — Desde Sancho:
  Sancho skill "seo-content"
         │
         ├── Lee ContentBrief con status="recommended" + highest opportunity_score
         ├── POST /content/generate/{brief_id}
         ├── Espera completion (polling)
         └── Discord: "Artículo generado: [título]. Ver: [link]"
```

---

## Flujo 4: Atomización a social

```
Artículo generado en Escudero (ContentBrief.generated_content)
         │
         ▼
Sancho skill "content-atomizer" (NUEVO)
         │
         ├── Lee artículo completo
         ├── LLM genera variantes:
         │     ├── LinkedIn: 1 post largo (1300 chars) con hook + CTA
         │     ├── Instagram: 3 captions (150 chars) + 1 carrusel (10 slides)
         │     ├── Twitter/X: 5 tweets o 1 thread de 5
         │     └── Cada variante incluye hashtags relevantes del nicho
         │
         ▼
Sancho skill "social-publisher" (NUEVO)
         │
         ├── Programa publicación:
         │     ├── LinkedIn: martes/miércoles 9:00
         │     ├── Instagram: lunes/jueves 12:00
         │     ├── Twitter: diario 10:00/18:00
         │
         └── Publica via APIs:
               ├── LinkedIn: LinkedIn API (Pages + UGC Posts)
               ├── Instagram: Meta Graph API (Business accounts)
               └── Twitter: Twitter API v2
```

---

## Flujo 5: Bot engagement (post-discovery)

```
Escudero Influencer Discovery (ya existe)
         │
         ├── POST /influencers/discover {project_id, niche_id}
         │     ├── YouTube: Data API v3 + SearchAPI
         │     └── Instagram: Google CSE + Apify scraper
         │
         ▼
  influencer_results (DB)
  [profile_url, platform, subscribers, relevance_score]
         │
         ▼
Bot Scheduler (NUEVO — cron cada 6h)
         │
         ├── Filtra: relevance_score > 50, platform in (instagram, linkedin)
         ├── Crea secuencia de acciones por influencer:
         │
         │   Instagram (7 días):
         │     Día 1: View profile + Follow
         │     Día 2: Like 2 posts recientes
         │     Día 4: Like 1 post + View story
         │     Día 7: Comment en post relevante (LLM-generated)
         │
         │   LinkedIn (10 días):
         │     Día 1: View profile
         │     Día 2: Connection request (con nota personalizada)
         │     Día 5: Like 2 posts
         │     Día 8: Comment en post relevante (LLM-generated)
         │     Día 10: Like 1 post más
         │
         └── Inserta en bot_actions con scheduled_at
                  │
                  ▼
Bot Executor (Worker — cada 5 min)
         │
         ├── SELECT from bot_actions WHERE status='queued' AND scheduled_at <= now()
         ├── Para cada acción:
         │     ├── Check rate limits del account
         │     ├── Ejecutar con delay aleatorio (45-90s)
         │     ├── Log resultado (success/failed/rate_limited)
         │     └── Si falla 3 veces → pausar account 2h
         │
         └── Actualiza bot_metrics diarias
```

---

## Flujo 6: Dashboard unificado (SanchoCMO)

```
Cliente abre SanchoCMO dashboard
         │
         ├── Sección "SEO/GEO Intelligence" (datos de Escudero)
         │     ├── Scores: SEO Audit (Lighthouse), Own Media, GEO visibility
         │     ├── Top 5 recomendaciones (severity=critical/high)
         │     ├── Key Opportunities (top 10 dominios)
         │     └── Link: "Ver análisis completo →" (abre Escudero frontend)
         │
         ├── Sección "Contenido" (Escudero + Sancho)
         │     ├── Artículos generados (título, status, word_count)
         │     ├── Social posts programados (plataforma, fecha, status)
         │     └── Calendario editorial visual
         │
         ├── Sección "Engagement" (Bots — si activo)
         │     ├── Acciones hoy: follows, likes, comments
         │     ├── Follow-back rate últimos 7 días
         │     ├── Cuentas activas vs pausadas
         │     └── Próximas acciones programadas
         │
         └── Sección "Influencers" (Escudero)
               ├── Influencers descubiertos por nicho
               ├── Status de engagement (bot sequence progress)
               └── Collab briefs generados
```

---

## Mapa de skills Sancho (nuevos + existentes)

| Skill | Status | Qué hace | Usa Escudero? |
|---|---|---|---|
| `seo-content` | Existe | Genera contenido SEO | Sí — ContentBrief + article_generator |
| `social-content` | Existe | Genera posts sociales | No directamente |
| `onboarding` | Adaptar | Registra nuevo cliente | Sí — quick-start + audit + own-media |
| `content-atomizer` | **NUEVO** | Blog → social variants | Sí — lee generated_content |
| `social-publisher` | **NUEVO** | Programa + publica social | No — usa APIs de plataformas |
| `weekly-audit` | **NUEVO** | Cron: GEO run + gaps + recs | Sí — 3 endpoints |
| `bot-manager` | **NUEVO** | Gestiona cuentas bot | No — sistema independiente |

---

## Diagrama completo del ecosistema

```
┌─────────────────────────────────────────────────────┐
│                    SANCHOCMO                         │
│                                                      │
│  Better Auth ─── Dashboard ─── Polar.sh Credits     │
│       │              │              │                │
│       ▼              ▼              ▼                │
│  ┌────────┐   ┌───────────┐   ┌──────────┐         │
│  │ Skills │   │ Discord   │   │ Crons    │         │
│  │        │   │ Bot       │   │          │         │
│  └───┬────┘   └─────┬─────┘   └────┬─────┘         │
└──────┼──────────────┼──────────────┼────────────────┘
       │              │              │
       ▼              ▼              ▼
┌─────────────────────────────────────────────────────┐
│                 ESCUDERO API (Python)                 │
│                                                      │
│  SEO Engines ── GEO Engines ── Content Engine       │
│  Domain Intel ── Own Media ── Recommendations        │
│  Influencer Discovery                                │
│                                                      │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│              POSTGRESQL (Supabase)                    │
│                                                      │
│  19 tablas Escudero + tablas SanchoCMO + bot_*      │
│                                                      │
└─────────────────────────────────────────────────────┘
                      ▲
                      │
┌─────────────────────┴───────────────────────────────┐
│              BOT ENGINE (Docker/VPS)                  │
│                                                      │
│  Scheduler ── Executor ── Monitor                    │
│  Apify (IG) ── Playwright (LinkedIn)                │
│  Residential Proxies ── Session Manager              │
│                                                      │
└─────────────────────────────────────────────────────┘
```
