# PDR — Trust Engine (Execution Engine)

**ID:** T-050
**Producto:** Trust Engine — SEO+GEO Intelligence & Execution
**Versión:** 5.0 (arquitectura nativa OpenClaw — sin backend Python)
**Fecha:** 2026-03-24
**Autor:** Alfonso + Cervantes
**Sistema:** SanchoCMO — Post-Foundation Execution
**Estado:** En desarrollo
**Prioridad:** P0

> **Trust Engine es un proceso lineal** que se ejecuta una vez por lanzamiento.
> Recurrencia, bots e Idea Generation van en PDRs separados.

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
| **Trust Engine (este PDR)** | **ANALIZAR + RECOMENDAR + EJECUTAR** | 🔨 En desarrollo |
| Idea Generation System | Recurrencia, intelligence | Separado |
| Bots de Engagement | IG/LI automation | Separado |

---

## 2. Arquitectura

### 2.1 Cambio fundamental vs v4

**v4**: Backend Python (FastAPI + SQLAlchemy + 26 tablas) como microservicio separado.
**v5**: Todo nativo en OpenClaw — skills + exec + LLM + JSON files. Sin backend.

**Por qué el cambio:**
- Las APIs externas se llaman igual con `exec` (curl) que con Python requests
- El análisis lo hace el LLM directamente — no necesitamos engines Python intermedios
- La persistencia con JSON files cubre el caso de uso (resultados de audits, no queries complejas)
- Un solo sistema que mantener en vez de dos
- Mission Control ya lee archivos del workspace — no necesita API intermediaria

### 2.2 Arquitectura v5

```
┌─────────────────────────────────────────────────────────────┐
│  SANCHO (OpenClaw)                                          │
│                                                             │
│  Skills (trust-engine-*)                                    │
│    ├── exec (curl): Google PSI, Serper, DataForSEO, YT API │
│    ├── web_fetch: scraping ligero de sites                  │
│    ├── LLM: análisis, clasificación, generación             │
│    ├── sessions_spawn: trabajo paralelo                     │
│    └── write: resultados → JSON files                       │
│                                                             │
│  Persistencia: brand/{slug}/trust-engine/*.json             │
│                                                             │
│  Mission Control (HTML)                                     │
│    ├── Lee JSON files del workspace                         │
│    ├── Renderiza dashboards por módulo                      │
│    ├── Botones que disparan skills via Discord/MC           │
│    └── Edición inline de resultados                         │
│                                                             │
│  Discord                                                    │
│    └── Notificaciones + resultados resumidos en hilos       │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Persistencia: JSON Files

Cada módulo guarda su output en `brand/{slug}/trust-engine/`:

```
brand/{slug}/trust-engine/
├── config.json              # Config del proyecto (website, language, niches, competitors)
├── seo-audit.json           # Lighthouse + health checks
├── own-media-audit.json     # Blog, social, schemas, tech
├── geo-analysis.json        # Multi-provider visibility + mentions + citations
├── serp-analysis.json       # SERP results por keyword
├── gap-analysis.json        # Cruces SEO × GEO
├── recommendations.json     # Accionables priorizados
├── keywords.json            # Keywords con volume, CPC, KD, score
├── influencers.json         # Partners/influencers descubiertos
├── content-briefs.json      # Briefs + artículos generados
└── run-state.json           # Estado de ejecución (qué módulos se han corrido)
```

**Formato estándar de cada JSON:**
```json
{
  "module": "seo-audit",
  "version": 1,
  "created_at": "2026-03-24T19:30:00Z",
  "updated_at": "2026-03-24T19:30:00Z",
  "status": "completed|running|error|pending",
  "data": { ... },
  "metadata": {
    "duration_seconds": 45,
    "apis_called": ["google-psi"],
    "errors": []
  }
}
```

### 2.4 ¿Por qué no SQL?

| Necesidad | JSON files | SQL |
|---|---|---|
| Guardar resultados de audit | ✅ | ✅ |
| Leer desde MC (HTML) | ✅ Directo | ❌ Necesita API |
| Editar resultados | ✅ edit tool | ✅ UPDATE |
| Queries complejas cross-module | ⚠️ LLM lee múltiples JSONs | ✅ JOINs |
| Histórico de runs | ✅ Versionado (v1, v2...) | ✅ Timestamps |
| Multi-cliente | ✅ Cada slug tiene su carpeta | ✅ project_id FK |

**Trade-off aceptado**: No tenemos JOINs SQL, pero el LLM puede leer y cruzar JSONs sin problema para el volumen de datos que manejamos (1 cliente = ~10 archivos JSON).

### 2.5 Deploy

- **Local** en Mac (actual). Sin containers, sin Railway.
- **Prod futuro**: el workspace de Sancho se sincroniza. MC se sirve por Tailscale.

---

## 3. Modelo de Datos (JSON Schemas)

### 3.1 config.json — Proyecto

```json
{
  "project": {
    "slug": "hospital-capilar",
    "name": "Hospital Capilar",
    "website": "https://hospitalcapilar.com",
    "language": "es",
    "market": "España",
    "foundation_imported_at": "2026-03-24T10:00:00Z"
  },
  "brand": {
    "name": "Hospital Capilar",
    "aliases": ["HC", "Hospital Capilar Madrid"],
    "domains": ["hospitalcapilar.com", "hospitalcapilar.es"]
  },
  "niches": [
    {
      "id": "n1",
      "name": "Trasplante capilar España",
      "brief": {
        "A": "Posicionamiento del nicho",
        "B": "Competidores clave",
        "C": "Audiencia target",
        "D": "Diferenciadores"
      }
    }
  ],
  "competitors": [
    {
      "name": "Clínica X",
      "domain": "clinicax.com",
      "niches": ["n1"]
    }
  ]
}
```

### 3.2 seo-audit.json — Site Audit

```json
{
  "lighthouse": {
    "performance": 72,
    "accessibility": 89,
    "best_practices": 91,
    "seo": 85,
    "core_web_vitals": {
      "lcp": { "value": 2.8, "unit": "s", "rating": "needs-improvement" },
      "tbt": { "value": 180, "unit": "ms", "rating": "good" },
      "cls": { "value": 0.12, "unit": "", "rating": "needs-improvement" },
      "fcp": { "value": 1.4, "unit": "s", "rating": "good" },
      "speed_index": { "value": 3.2, "unit": "s", "rating": "needs-improvement" }
    }
  },
  "health_checks": [
    {
      "id": "hc-01",
      "name": "Meta Title",
      "status": "pass|fail|warning",
      "details": "Title found: 55 chars",
      "severity": "critical|high|medium|low",
      "fix": "Reducir a <60 chars",
      "impact_pct": 5
    }
  ],
  "issues": [
    {
      "id": "issue-01",
      "source": "lighthouse|health-check",
      "severity": "critical|high|medium|low",
      "title": "LCP > 2.5s",
      "description": "Largest Contentful Paint es 2.8s, por encima del umbral de 2.5s",
      "fix_steps": ["Optimizar imágenes hero", "Implementar lazy loading"],
      "expected_impact_pct": 15
    }
  ],
  "score": 78
}
```

### 3.3 own-media-audit.json

```json
{
  "blog": {
    "detected": true,
    "url": "https://example.com/blog",
    "post_count_estimated": 45,
    "frequency": "2-3/month",
    "last_post_date": "2026-03-15",
    "categories": ["trasplante", "cuidado capilar"],
    "avg_word_count": 800,
    "has_structured_data": false
  },
  "social": {
    "platforms": [
      {
        "platform": "instagram",
        "url": "https://instagram.com/example",
        "followers": null,
        "posting_frequency": "daily",
        "bio_optimized": true
      }
    ]
  },
  "schemas": {
    "found": ["Organization", "LocalBusiness"],
    "missing_recommended": ["Article", "FAQPage", "MedicalBusiness"],
    "errors": []
  },
  "tech": {
    "cms": "WordPress",
    "analytics": ["GA4"],
    "cdn": "Cloudflare",
    "ssl": true,
    "mobile_responsive": true,
    "page_speed_tool": "none"
  },
  "scores": {
    "content": 65,
    "social": 70,
    "technical": 75,
    "overall": 70
  }
}
```

### 3.4 geo-analysis.json

```json
{
  "runs": [
    {
      "id": "geo-run-001",
      "niche_id": "n1",
      "prompt": "¿Cuáles son las mejores clínicas de trasplante capilar en España?",
      "topic": "ranking",
      "providers": {
        "chatgpt": {
          "model": "gpt-4o",
          "turns": [
            { "turn": 1, "type": "discovery", "response": "..." },
            { "turn": 2, "type": "why", "response": "..." },
            { "turn": 3, "type": "sources", "response": "..." }
          ],
          "mentions": [
            {
              "brand": "Hospital Capilar",
              "is_client": true,
              "position": 1,
              "sentiment": "positive",
              "context": "Mencionado como líder en España"
            }
          ],
          "citations": [
            { "url": "https://example.com/article", "domain": "example.com" }
          ]
        },
        "gemini": { "..." : "..." },
        "claude": { "..." : "..." },
        "perplexity": { "..." : "..." }
      }
    }
  ],
  "summary": {
    "client_visibility": {
      "mentioned_in_pct": 75,
      "avg_position": 2.3,
      "sentiment_breakdown": { "positive": 80, "neutral": 15, "negative": 5 }
    },
    "top_cited_domains": [
      { "domain": "example.com", "count": 12, "type": "media" }
    ],
    "competitor_visibility": [
      { "brand": "Clínica X", "mentioned_in_pct": 60, "avg_position": 3.1 }
    ]
  }
}
```

### 3.5 serp-analysis.json

```json
{
  "queries": [
    {
      "keyword": "trasplante capilar españa",
      "volume": 2400,
      "cpc": 3.50,
      "kd": 45,
      "results": [
        {
          "position": 1,
          "title": "...",
          "url": "https://...",
          "domain": "...",
          "snippet": "...",
          "content_type": "guide|comparison|review|directory|service|news",
          "domain_type": "competitor|media|directory|forum|own"
        }
      ]
    }
  ]
}
```

### 3.6 gap-analysis.json

```json
{
  "gaps": [
    {
      "id": "gap-001",
      "type": "geo_only|serp_only|both",
      "domain": "example.com",
      "url": "https://example.com/best-clinics",
      "title": "Las 10 mejores clínicas...",
      "competitors_present": ["Clínica X", "Clínica Y"],
      "client_present": false,
      "opportunity_score": 85,
      "recommended_action": "Contactar para inclusión / Guest post",
      "niche": "n1"
    }
  ],
  "summary": {
    "total_gaps": 34,
    "high_opportunity": 8,
    "by_type": { "geo_only": 12, "serp_only": 15, "both": 7 }
  }
}
```

### 3.7 recommendations.json

```json
{
  "recommendations": [
    {
      "id": "rec-001",
      "source": "seo-audit|geo-analysis|own-media|gap-analysis",
      "severity": "critical|high|medium|low",
      "category": "technical|content|visibility|outreach",
      "title": "Implementar FAQ Schema en páginas de servicio",
      "description": "Las páginas de servicio no tienen FAQ JSON-LD...",
      "fix_steps": ["Crear FAQ section", "Implementar JSON-LD"],
      "expected_impact_pct": 15,
      "effort": "low|medium|high",
      "priority_score": 88,
      "status": "pending|in-progress|done|dismissed",
      "edited_by_human": false
    }
  ]
}
```

### 3.8 keywords.json

```json
{
  "keywords": [
    {
      "id": "kw-001",
      "keyword": "mejor clínica trasplante capilar madrid",
      "niche_id": "n1",
      "category": "ranking|comparison|guide|solution|authority|discovery",
      "volume": 1200,
      "cpc": 4.20,
      "kd": 38,
      "opportunity_score": 0.72,
      "current_position": null,
      "status": "suggested|approved|rejected|content-created",
      "content_brief_id": null
    }
  ]
}
```

### 3.9 influencers.json

```json
{
  "influencers": [
    {
      "id": "inf-001",
      "name": "Dr. García",
      "platform": "youtube|instagram",
      "url": "https://youtube.com/@drgarcia",
      "subscribers": 50000,
      "relevance_score": 85,
      "niche_id": "n1",
      "brief": "Dermatólogo con canal enfocado en...",
      "contact_status": "discovered|contacted|responded|partner",
      "edited_by_human": false
    }
  ]
}
```

### 3.10 run-state.json — Estado de ejecución

```json
{
  "project_slug": "hospital-capilar",
  "started_at": "2026-03-24T10:00:00Z",
  "modules": {
    "foundation-import": { "status": "completed", "completed_at": "...", "version": 1 },
    "seo-audit":         { "status": "completed", "completed_at": "...", "version": 1 },
    "own-media-audit":   { "status": "running",   "started_at": "..." },
    "geo-analysis":      { "status": "pending" },
    "serp-analysis":     { "status": "pending" },
    "gap-analysis":      { "status": "pending",   "depends_on": ["geo-analysis", "serp-analysis"] },
    "recommendations":   { "status": "pending",   "depends_on": ["seo-audit", "own-media-audit", "geo-analysis", "gap-analysis"] },
    "keywords":          { "status": "pending",   "depends_on": ["serp-analysis"] },
    "influencers":       { "status": "pending" }
  },
  "auto_chain": false
}
```

**`auto_chain`**: si es `true`, al completar un módulo se lanza automáticamente el siguiente que tenga sus dependencias cumplidas. Si es `false` (default), el usuario lanza cada módulo manualmente desde MC.

---

## 4. Requisitos Funcionales

> **Prerrequisito**: Foundation completa (company-context, ECPs, positioning, competitors, brand-voice).
> Trust Engine NO hace onboarding — Foundation ya lo maneja.

### RF-01: Foundation Import
- Lee Foundation docs del cliente en `brand/{slug}/`
- Genera `trust-engine/config.json` con proyecto, marca, niches, competidores
- **Gate check**: verifica que Foundation está completa antes de importar
- **Mapeo**: company-context → project + brand, ECPs → niches, competitor-intelligence → competitors, positioning → niche briefs

### RF-02: SEO Site Audit
- Llama Google PageSpeed Insights API via `exec` (curl)
- Extrae Lighthouse scores + Core Web Vitals
- Ejecuta 15 health checks via `web_fetch` del site:
  - Meta title/description (length, presence)
  - Sitemap.xml (exists, valid)
  - Robots.txt (exists, not blocking)
  - Canonical tags
  - SSL certificate
  - Structured data (JSON-LD)
  - Mobile responsiveness
  - Alt tags en imágenes
  - H1 hierarchy
  - Internal linking
  - 404 pages
  - Page speed (from Lighthouse)
  - Open Graph tags
  - Hreflang (si multi-idioma)
  - Core Web Vitals thresholds
- Genera issues con severity + fix steps + expected impact %
- Output: `trust-engine/seo-audit.json`

### RF-03: Own Media Audit
- 4 scanners:
  - **Blog**: `web_fetch` del /blog, detecta frecuencia, categorías, word count
  - **Social**: busca perfiles en IG, LinkedIn, Twitter, YouTube, TikTok via `web_fetch` + `exec` (Google CSE)
  - **Schema**: `web_fetch` del HTML, parsea JSON-LD existente
  - **Tech**: detecta CMS, analytics, CDN, SSL via headers + HTML
- Scoring: content (35%) + social (30%) + technical (35%)
- Output: `trust-engine/own-media-audit.json`

### RF-04: GEO Analysis (Multi-Provider)
- Genera prompts por nicho (6 categorías: ranking, comparison, guide, solution, authority, discovery)
- Ejecuta contra ≥2 providers (ChatGPT, Gemini, Claude, Perplexity) via `sessions_spawn` paralelo
- Conversación 3-turn por prompt:
  - Turn 1 (Discovery): pregunta directa
  - Turn 2 (Why): "¿Por qué recomiendas X?"
  - Turn 3 (Sources): "¿Qué fuentes consultarías?"
- Parsea: brand mentions (position, sentiment, context) + citations (URLs)
- Output: `trust-engine/geo-analysis.json`

### RF-05: SERP Analysis
- Keywords generadas por LLM (basadas en niches + Foundation)
- Busca en Google via Serper.dev (`exec` curl)
- Clasifica resultados:
  - Content type: guide, comparison, review, directory, service, news
  - Domain type: competitor, media, directory, forum, own
- Classification 3-tier: URL patterns → title keywords → LLM fallback
- Output: `trust-engine/serp-analysis.json`

### RF-06: Gap Analysis
- Cruza GEO citations × SERP results
- Identifica dominios/URLs donde competidores aparecen y cliente no
- Opportunity scoring: `min(30, n_competitors×10) + source_bonus + content_bonus + domain_bonus`
- Tipos: geo_only, serp_only, both
- Output: `trust-engine/gap-analysis.json`
- **Depende de**: RF-04 (GEO) + RF-05 (SERP)

### RF-07: Recommendations Engine
- Agrega issues de 4 fuentes:
  - SEO audit issues
  - GEO visibility gaps
  - Own media gaps
  - Gap analysis opportunities
- LLM prioriza por: severity × impact × effort
- Severity: critical/high/medium/low
- Expected impact basado en Princeton GEO benchmarks
- Output: `trust-engine/recommendations.json`
- **Depende de**: RF-02 + RF-03 + RF-04 + RF-06

### RF-08: Keyword Research
- LLM genera keywords por nicho (6 categorías)
- DataForSEO enrichment via `exec` (curl): volume, CPC, KD
- Opportunity score: `0.2 + commercial×0.5 + kd_factor×0.3`
- Output: `trust-engine/keywords.json`
- **Depende de**: RF-05 (SERP para no duplicar)

### RF-09: Influencer/Partner Discovery
- YouTube: Data API v3 via `exec` (curl) — busca canales por nicho keywords
- Instagram: Google CSE via `exec` — busca perfiles site:instagram.com
- Relevance scoring (LLM)
- Influencer brief generado por LLM
- Output: `trust-engine/influencers.json`

### RF-10: Content Brief + Article Generator
- Input: keyword aprobada (status=approved en keywords.json)
- LLM genera brief: title, outline, target_word_count, template_type, SEO directives
- LLM genera artículo (1500-2500 palabras) con template GEO:
  - Direct answer blockquote
  - FAQ section
  - Citations inline
  - Brand voice de Foundation
- JSON-LD schema: Article + FAQPage + Author (E-E-A-T)
- Output: `trust-engine/content-briefs.json` (array de briefs con artículos)
- **Human approval required** entre brief → article y article → publish

---

## 5. Integraciones Externas

### APIs que Sancho ya tiene (sistema base):

| API | Uso en Trust Engine |
|---|---|
| Serper.dev | SERP fetching (RF-05) |
| OpenAI / Anthropic / Google | GEO Analysis providers (RF-04) + Content (RF-10) |
| DataForSEO | Keyword enrichment: volume, CPC, KD (RF-08) |

### APIs adicionales necesarias:

| API | Uso | Coste | Configuración |
|---|---|---|---|
| Google PSI | Lighthouse audit (RF-02) | Gratis | `GOOGLE_PSI_API_KEY` (o usa la existente de Google) |
| YouTube Data API v3 | Influencer discovery (RF-09) | Gratis (10K requests/día) | `YOUTUBE_API_KEY` |
| Google CSE | IG profile discovery (RF-09) | Gratis (100/día) o $5/1000 | `GOOGLE_CSE_KEY` + `GOOGLE_CSE_CX` |

### APIs opcionales (mejoran calidad pero no bloquean):

| API | Uso | Sin ella... |
|---|---|---|
| SearchAPI.io | YouTube search alternativo | Se usa YouTube Data API directamente |
| Apify | IG profile scraper profundo | Se usa Google CSE (menos datos) |

### Integraciones del cliente (conecta via MC):

| Integración | Qué aporta | Obligatoria |
|---|---|---|
| Google Search Console | Keywords reales, posiciones actuales, CTR | ❌ Recomendada |
| GA4 | Tráfico, conversiones, bounce rate | ❌ Recomendada |
| Redes sociales (IG/LI/TW) | Métricas de engagement | ❌ Opcional |

> **Nota**: Trust Engine funciona SIN integraciones del cliente. Con ellas los datos son más ricos, pero el audit base se ejecuta solo con la URL del site.

---

## 6. Mission Control UI

### 6.1 Nueva sección: Trust Engine

MC muestra una nueva tab "Trust Engine" para cada cliente. Lee los JSON files de `brand/{slug}/trust-engine/`.

### 6.2 Layout

```
┌─────────────────────────────────────────────────┐
│  TRUST ENGINE — Hospital Capilar                │
│                                                 │
│  [Estado general: 4/9 módulos completados]      │
│                                                 │
│  ┌──────────────┐  ┌──────────────┐             │
│  │ Foundation    │  │ SEO Audit    │             │
│  │ ✅ Imported   │  │ ✅ Score: 78  │             │
│  │ [Ver]        │  │ [Ver] [Rerun]│             │
│  └──────────────┘  └──────────────┘             │
│                                                 │
│  ┌──────────────┐  ┌──────────────┐             │
│  │ Own Media    │  │ GEO Analysis │             │
│  │ ⏳ Running... │  │ ⬚ Pending    │             │
│  │              │  │ [Lanzar]     │             │
│  └──────────────┘  └──────────────┘             │
│                                                 │
│  ┌──────────────┐  ┌──────────────┐             │
│  │ SERP         │  │ Gaps         │             │
│  │ ⬚ Pending    │  │ 🔒 Necesita   │             │
│  │ [Lanzar]     │  │ GEO + SERP   │             │
│  └──────────────┘  └──────────────┘             │
│                                                 │
│  ┌──────────────┐  ┌──────────────┐             │
│  │ Recs         │  │ Keywords     │             │
│  │ 🔒 Necesita   │  │ ⬚ Pending    │             │
│  │ 4 módulos    │  │ [Lanzar]     │             │
│  └──────────────┘  └──────────────┘             │
│                                                 │
│  ┌──────────────┐                               │
│  │ Influencers  │                               │
│  │ ⬚ Pending    │                               │
│  │ [Lanzar]     │                               │
│  └──────────────┘                               │
└─────────────────────────────────────────────────┘
```

### 6.3 Estados de módulo

| Estado | Icono | Significado |
|---|---|---|
| `pending` | ⬚ | No ejecutado, sin dependencias bloqueantes |
| `locked` | 🔒 | Dependencias no cumplidas |
| `running` | ⏳ | En ejecución |
| `completed` | ✅ | Finalizado con resultado |
| `error` | ❌ | Falló — se puede reintentar |

### 6.4 Detalle de cada módulo

Al hacer click en "Ver" un módulo completado, MC muestra:
- **Resumen visual** (scores, métricas clave)
- **Tabla de datos** (issues, keywords, gaps, etc.)
- **Edición inline**: el usuario puede cambiar severity, status, dismissar items
- **Botón "Guardar cambios"**: actualiza el JSON file
- **Botón "Rerun"**: vuelve a ejecutar el módulo

### 6.5 Botón de ejecución

Al hacer click en "Lanzar" o "Rerun":
1. MC envía un mensaje a Discord (hilo del cliente o canal interno) que Sancho intercepta
2. Sancho ejecuta el skill correspondiente
3. El skill actualiza el JSON file + `run-state.json`
4. MC recarga y muestra los resultados

**Alternativa (más simple para v1):** el botón en MC muestra instrucciones de qué comando escribir en Discord. Sancho lo ejecuta. Resultado aparece en MC automáticamente porque lee los JSON files.

---

## 7. Skills de Sancho

### 7.1 Skill principal: `trust-engine`

Orquesta el flujo completo o módulos individuales.

**Triggers:**
- "Lanza Trust Engine para [cliente]"
- "Ejecuta SEO audit de [cliente]"
- "Trust Engine: GEO analysis"
- Botón en MC

**Subcomandos:**
| Comando | Qué hace |
|---|---|
| `trust-engine init [slug]` | Foundation import → config.json |
| `trust-engine seo-audit [slug]` | Ejecuta RF-02 |
| `trust-engine own-media [slug]` | Ejecuta RF-03 |
| `trust-engine geo [slug]` | Ejecuta RF-04 |
| `trust-engine serp [slug]` | Ejecuta RF-05 |
| `trust-engine gaps [slug]` | Ejecuta RF-06 (verifica dependencias) |
| `trust-engine recs [slug]` | Ejecuta RF-07 (verifica dependencias) |
| `trust-engine keywords [slug]` | Ejecuta RF-08 |
| `trust-engine influencers [slug]` | Ejecuta RF-09 |
| `trust-engine content [slug] [keyword-id]` | Ejecuta RF-10 |
| `trust-engine status [slug]` | Muestra run-state.json |
| `trust-engine full [slug]` | Ejecuta todo en secuencia respetando dependencias |

### 7.2 Skills existentes que se adaptan

| Skill actual | Cambio |
|---|---|
| `seo-audit` | Se mantiene standalone pero también puede ser invocado por trust-engine |
| `ai-seo` | Se mantiene standalone; trust-engine usa su propia lógica GEO más profunda |
| `content-atomizer` | Input adaptado para aceptar content-briefs.json items |

### 7.3 Trabajo paralelo

Para módulos independientes (ej: SEO audit + Own Media + GEO en paralelo):
- `sessions_spawn` para cada módulo
- Cada sub-agent escribe su JSON file
- El orquestador (trust-engine skill) monitorea `run-state.json`

---

## 8. Flujo Operativo

### 8.1 Flujo completo (ejecución única)

```
FASE 1: SETUP
  └── Foundation Import → config.json

FASE 2: AUDIT (paralelo donde sea posible)
  ├── SEO Site Audit → seo-audit.json
  ├── Own Media Audit → own-media-audit.json
  └── GEO Analysis → geo-analysis.json (más lento — multi-provider × multi-prompt)

FASE 3: ANALYSIS (depende de Fase 2)
  ├── SERP Analysis → serp-analysis.json
  ├── Gap Analysis → gap-analysis.json (depende de GEO + SERP)
  └── Recommendations → recommendations.json (depende de todo lo anterior)

FASE 4: STRATEGY
  ├── Keyword Research → keywords.json
  └── Influencer Discovery → influencers.json

FASE 5: OUTPUT → 3 LISTAS
  ├── A) Ideas de contenido propio (keywords + gaps + recs)
  ├── B) Blogs/medios donde aparecer (gap domains)
  └── C) Influencers/partners a contactar

FASE 6: EJECUCIÓN (manual, por módulo)
  └── Content Generation → content-briefs.json (human approval entre brief y artículo)
```

### 8.2 Dependency Graph

```
foundation-import
  ├── seo-audit
  ├── own-media-audit
  ├── geo-analysis
  │     └── gap-analysis ←── serp-analysis
  │           └── recommendations ←── seo-audit + own-media-audit
  ├── keywords ←── serp-analysis
  └── influencers
```

### 8.3 Ejecución manual vs auto-chain

- **Default (v1)**: manual. El usuario lanza cada módulo desde MC o Discord.
- **auto-chain** (futuro): al completar un módulo, se lanza el siguiente automáticamente si sus dependencias están cumplidas.

---

## 9. Reglas P0

1. **Foundation es prerequisito** — sin Foundation completa, Trust Engine no ejecuta
2. **Trust Engine es lineal** — se ejecuta una vez por lanzamiento
3. **Human in the loop** — resultados editables antes de la siguiente fase
4. **Dependency gate check** — un módulo no se ejecuta si sus dependencias no están completadas
5. **Brand Book obligatorio para contenido** — sin brand_voice no se genera artículos
6. **JSON files como fuente de verdad** — MC lee, skills escriben
7. **Multicliente por diseño** — cada `brand/{slug}/trust-engine/` es independiente
8. **APIs del sistema** — el cliente NO necesita dar API keys para el audit base
9. **Resultados editables** — el usuario puede modificar severity, status, scores antes de la siguiente fase
10. **Idempotente** — rerun de un módulo sobreescribe el JSON (con versión incrementada)

---

## 10. Criterios de Aceptación

### CA-01: Foundation Import
- [ ] Lee Foundation docs y genera config.json correcto
- [ ] Gate check: rechaza si Foundation incompleta
- [ ] Mapeo ECPs → niches, competitors → competitors, positioning → briefs

### CA-02: SEO Audit
- [ ] Lighthouse scores (4 categorías) via Google PSI
- [ ] Core Web Vitals (5 métricas) con rating
- [ ] ≥10 health checks ejecutados
- [ ] Issues con severity + fix steps + impact %
- [ ] Output: seo-audit.json válido

### CA-03: Own Media
- [ ] Blog detection + frecuencia
- [ ] ≥3 plataformas sociales buscadas
- [ ] Schemas JSON-LD detectados
- [ ] CMS + analytics + CDN detectados
- [ ] Scoring 3-axis (content, social, technical)

### CA-04: GEO Analysis
- [ ] ≥2 providers ejecutados
- [ ] 3-turn conversation por prompt
- [ ] Brand mentions con position + sentiment
- [ ] Citations con URLs
- [ ] Summary con visibility % y comparativa competidores

### CA-05: SERP Analysis
- [ ] Keywords buscadas en Google via Serper
- [ ] Results con position, title, snippet, domain
- [ ] Content classification (6 tipos)
- [ ] Domain classification (5 tipos)

### CA-06: Gap Analysis
- [ ] Cross-reference GEO × SERP correcto
- [ ] Opportunity scoring
- [ ] Gaps tipificados (geo_only, serp_only, both)

### CA-07: Recommendations
- [ ] Agrega issues de 4 fuentes
- [ ] Severity + impact + effort
- [ ] Priority score calculado
- [ ] Status editable

### CA-08: Keywords
- [ ] Keywords generadas por nicho
- [ ] Volume + CPC + KD (DataForSEO)
- [ ] Opportunity score calculado
- [ ] Status editable (suggested → approved → rejected)

### CA-09: Influencers
- [ ] YouTube + Instagram discovery
- [ ] Relevance scoring
- [ ] Brief generado por LLM

### CA-10: MC UI
- [ ] Sección Trust Engine visible en MC
- [ ] Módulos con estados correctos (pending/locked/running/completed/error)
- [ ] Dependency gate visual (🔒 para locked)
- [ ] Detalle de cada módulo con datos del JSON
- [ ] Edición inline funcional
- [ ] Botón lanzar/rerun funcional

### CA-11: End-to-End
- [ ] Flujo completo ejecutable con 1 cliente real
- [ ] Todos los JSONs generados y legibles en MC
- [ ] Resultados coherentes cross-módulo

---

## 11. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| API rate limits (Serper, PSI) | Módulos fallan | Retry con backoff + fallback |
| LLM hallucinations en GEO | Competidores inventados | Prompts estrictos + cross-check con SERP data |
| web_fetch blocked (403/captcha) | Own Media incompleto | Fallback a LLM knowledge + manual input |
| JSON files crecen mucho | MC lento | Limitar resultados por módulo + paginación |
| Foundation incompleta | Trust Engine degradado | Gate check estricto en RF-01 |
| GEO analysis lento (multi-provider × multi-prompt) | UX pobre | sessions_spawn paralelo + progress updates |

---

## 12. Apéndice: Fórmulas

### Keyword Opportunity Score
```
kd_factor = (100 - kd) / 100
commercial = min(1.0, (volume × max(cpc, 0.1)) / 5000)
score = 0.2 + commercial × 0.5 + kd_factor × 0.3
```

### Gap Opportunity Score
```
score = min(30, n_competitors×10) + (25 if geo+serp else 15 if geo else 10) + content_bonus + domain_bonus
```

### Own Media Scoring
```
overall = content × 0.35 + social × 0.30 + technical × 0.35
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

| # | Decisión | Resultado | Contexto |
|---|---|---|---|
| D1 | Backend Python vs OpenClaw nativo | **OpenClaw nativo** | v4 proponía FastAPI. v5 elimina el backend: skills + exec + LLM hacen todo |
| D2 | SQL vs JSON files | **JSON files** | Para el volumen de datos (1 cliente = ~10 files), JSON es suficiente y MC lo lee directo |
| D3 | Frontend | **Mission Control HTML** — nueva sección Trust Engine | Consistente con el resto del sistema |
| D4 | Trust Engine lineal o recurrente | **Lineal** — ejecución única. Recurrencia en Idea Generation (PDR separado) |
| D5 | Bots de engagement | **PDR separado** — fuera de scope |
| D6 | Social content generation | **PDR separado** — fuera de scope (blog → atomizer → social) |
| D7 | Foundation data | **Prerequisito obligatorio** — gate check en init |
| D8 | Deploy | **Local** en Mac. Workspace se sincroniza |
| D9 | Ejecución | **Manual por módulo** (v1). Auto-chain como feature futura |
| D10 | Edición de resultados | **Inline en MC** — actualiza JSON files directamente |
| D11 | APIs del cliente | **Opcionales** — Trust Engine funciona con solo la URL del site |

---

## 14. Plan de Build

### Fase 1: Core (semana 1)
1. Skill `trust-engine` (orquestador + subcomandos)
2. RF-01: Foundation Import → config.json
3. RF-02: SEO Site Audit → seo-audit.json
4. MC: sección Trust Engine con dashboard de módulos

### Fase 2: Audit completo (semana 2)
5. RF-03: Own Media Audit → own-media-audit.json
6. RF-04: GEO Analysis → geo-analysis.json
7. RF-05: SERP Analysis → serp-analysis.json
8. MC: detalle de cada módulo con datos

### Fase 3: Analysis (semana 3)
9. RF-06: Gap Analysis → gap-analysis.json
10. RF-07: Recommendations → recommendations.json
11. MC: edición inline + botones rerun

### Fase 4: Strategy (semana 4)
12. RF-08: Keywords → keywords.json
13. RF-09: Influencers → influencers.json
14. RF-10: Content Brief + Article → content-briefs.json
15. MC: flujo completo end-to-end

### Test: primer cliente real
16. Ejecutar Trust Engine completo con Hospital Capilar
17. Validar resultados, ajustar, documentar
