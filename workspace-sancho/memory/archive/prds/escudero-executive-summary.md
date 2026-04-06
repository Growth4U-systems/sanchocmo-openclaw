# Respuesta al Repo — Escudero SEO+GEO Intelligence

---

## Estado actual del proyecto

### ¿Qué hay hecho?

**Backend Python — 100% funcional**
- 46 engines de lógica de negocio
- 19 tablas SQLAlchemy (SQLite dev / PostgreSQL prod)
- 65+ endpoints FastAPI
- 9 background tasks con polling real-time
- LLM adapters: OpenAI, Anthropic, Gemini, Perplexity (via OpenRouter)
- SERP: Serper.dev / SerpAPI
- Keywords: DataForSEO (volume, CPC, KD)
- Scraping: httpx + BeautifulSoup

**Frontend Next.js — 100% funcional**
- 30 páginas (App Router)
- Radix UI + Tailwind CSS
- API client completo con TypeScript interfaces
- Polling pattern para background jobs

**Código listo para correr:**
```bash
# Backend
cd backend
pip install -r requirements.txt
# Crear .env con OPENROUTER_API_KEY (mínimo)
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev  # puerto 3000
```

---

## Qué hace el sistema (resumen ejecutivo)

### Fase 1 — Diagnóstico
- **SEO Audit**: Lighthouse scores + Core Web Vitals + on-page health (meta tags, sitemap, canonical, SSL, structured data)
- **Own Media Audit**: inventario de blog, redes sociales, schemas JSON-LD, stack técnico. Scoring compuesto (content 35%, social 30%, technical 35%)
- **GEO Analysis**: envía prompts a 4 LLMs simultáneamente, analiza qué marcas mencionan, sentimiento, posición, y qué fuentes citan. Conversación 3-turn (discovery → why → sources)

### Fase 2 — Inteligencia
- **Gap Analysis**: cruza datos GEO (citaciones LLM) × SEO (SERPs) para encontrar donde competidores aparecen y el cliente no
- **Key Opportunity Scoring**: 5 dimensiones (SEO 25%, GEO 25%, Backlink 15%, Content Gap 15%, Competitive 20%) = score 0-100 por dominio
- **Domain Classification**: 3-tier (150+ known domains → pattern heuristics → LLM fallback)
- **Content Classification**: 3-tier (URL patterns → title keywords → LLM fallback)

### Fase 3 — Recomendaciones
- Agrega issues de 4 fuentes: audit técnico, GEO enrichment (Princeton research), own media gaps, provider visibility
- Cada recomendación tiene: severity, fix steps, expected impact %
- Basado en Princeton GEO research: citations +30-40%, stats +15-25%, expert quotes +10-20%, FAQ +10-15%

### Fase 4 — Acción
- **Content Engine**: genera artículos 1500-2500 palabras con template GEO (respuesta directa + FAQ + estadísticas)
- **10 tipos de artículo** con estructura y estilo específicos (ranking, comparison, guide, solution, authority, discovery, recommendation, trend, content_gap, influencer)
- **Cover images**: 1200×630 PNG con Pillow (gradient + category badge + title)
- **JSON-LD schemas**: Article + FAQPage + Author Person para GEO optimization
- **Keyword Recommender**: LLM genera keywords → DataForSEO valida volume/CPC/KD → scoring por oportunidad comercial

### Fase 5 — Discovery
- **Influencer Discovery**: YouTube (Data API v3) + Instagram (Google CSE + Apify)
- **Auto-onboarding**: URL → scrape → LLM extrae company info → sugiere nichos + competidores

---

## Integración con SanchoCMO

### Decisión arquitectónica
- **Microservicio Python** (no reescritura TS) — el código ya funciona
- Deploy: Docker container (Railway/Render/Fly.io)
- DB compartida: mismo PostgreSQL de Supabase
- Comunicación: SanchoCMO → HTTP → Escudero API

```
SanchoCMO (Next.js 15, Vercel)
         │
         │ HTTP con auth header
         ▼
Escudero API (Python, Docker)
         │
         ▼
PostgreSQL (Supabase) ← compartida
```

### Multi-tenant
- 1 Client (clients.json) = 1 Project (Escudero)
- Sancho crea el Project automáticamente al onboarding via `POST /quick-start`

### Flujo de contenido
```
Escudero genera artículo blog
  → Sancho skill "content-atomizer" lo convierte a social (IG/LinkedIn/Twitter)
  → Sancho skill "social-publisher" programa publicación
```

---

## Bots IG/LinkedIn

**Status: desde cero.** Solo existe el influencer discovery (encuentra perfiles, no interactúa).

### Propuesta
| Plataforma | Acciones | Rate limits |
|---|---|---|
| Instagram | Follow, Like, Comment, Story view | 60 follows/h, 20 comments/h |
| LinkedIn | Connection request, Like, Comment, Profile view | 20 connections/día, 15 comments/día |
| **Ambas** | **NO DMs — tasa de ban >90%** | |

### Anti-ban
- Warm-up 21 días (7 browsing + 7 al 20% + full)
- Residential proxies, sticky sessions
- Delays aleatorios (45-90s entre acciones)
- Horarios humanos (9:00-22:00, no fines de semana en LinkedIn)
- Pausa automática si success_rate < 70%

### Costo estimado: ~$149/mes por cliente
- Apify $49 + proxies $75 + VPS $20 + LLM comments $5

---

## Prioridad propuesta

```
1º  Validar audit engines con cliente real        → Ya funciona, solo probar
2º  Content engine + atomización social            → Ya genera artículos, falta social
3º  Dockerizar + conectar con SanchoCMO            → Infra
4º  Multi-client + onboarding automático           → Cuando haya >1 cliente
5º  Bots IG/LinkedIn                               → Último, más riesgo, necesita spec
```

---

## Documentación completa disponible

| Documento | Contenido | Tamaño |
|---|---|---|
| `PDR-Escudero-SanchoCMO.md` | Toda la lógica: 19 tablas, 15 RFs, 65+ endpoints, fórmulas de scoring | ~1200 líneas |
| `DECISIONES-ARQUITECTURA.md` | Respuestas a decisiones: infra, multi-tenant, social, bots | ~150 líneas |
| `SPEC-BOTS-IG-LINKEDIN.md` | Spec bots: acciones, rate limits, anti-ban, modelo de datos, costos | ~200 líneas |
| `FLUJOS-INTEGRACION.md` | 6 flujos detallados, mapa de skills, diagrama ecosistema | ~250 líneas |

---

## API Key mínimo para probar

Solo necesitas **1 key** para que funcione todo:

```env
OPENROUTER_API_KEY=sk-or-...
```

OpenRouter da acceso a OpenAI, Anthropic, Gemini y Perplexity con una sola key. El resto de APIs (Serper, DataForSEO, YouTube) son opcionales — el sistema degrada gracefully sin ellas.
