# Decisiones Arquitectónicas — Escudero × SanchoCMO

**Fecha:** 2026-03-17

---

## 1. ¿Microservicio Python o reescritura TypeScript?

**Decisión: Microservicio Python.**

- El código Python ya funciona: 46 engines, 19 tablas, 65+ endpoints, 9 task files
- Reescribir a TS = 6-8 semanas sin valor nuevo, solo riesgo de bugs
- Deploy: Docker container en Railway/Render/Fly.io
- NO Supabase Edge Functions (no sirven para SQLAlchemy + scraping + Pillow)
- DB compartida: ambos apuntan al mismo PostgreSQL de Supabase (PortableUUID → UUID nativo, PortableJSON → JSONB nativo)

```
SanchoCMO (Next.js 15, Vercel) ──HTTP──► Escudero API (Python, Docker) ──► PostgreSQL (Supabase)
```

---

## 2. ¿Cómo se conecta con Sancho (el agente)?

| Flujo | Quién triggerea | Dónde viven resultados | Notificación |
|---|---|---|---|
| Onboarding | Sancho via `/quick-start` al dar de alta cliente | DB compartida + Discord summary | Discord embed con scores |
| SEO/GEO Audit | Cron semanal (Sancho skill) | DB + web dashboard | Discord alert si score baja |
| Recommendations | Auto-generadas post-audit | Web dashboard | Discord digest diario/semanal |
| Article generation | Usuario en web O Sancho skill `seo-content` | DB + web | Discord link al artículo |

Las recomendaciones SÍ alimentan skills existentes:
- `category=content_strategy` → skill `seo-content`
- `category=geo_content` → skill `seo-content` con contexto GEO
- El campo `skill_context` en ContentBrief ya está diseñado para esto

---

## 3. ¿Multi-tenant cómo?

**Decisión: 1 Client (clients.json) = 1 Project (Escudero)**

| clients.json | Escudero |
|---|---|
| `slug` | `project.slug` |
| `guild_id` | No aplica (web only) |
| `supabase_*` | Mismo PostgreSQL |
| `website` | `project.website` |
| `niches[]` | Auto-generados por onboarding |

**Quién crea el Project**: Sancho automáticamente:
1. Cliente se registra en SanchoCMO (Better Auth)
2. Sancho skill `onboarding` → `POST /api/v1/projects/quick-start` con URL
3. Escudero crea Project + Brand + Niches + Competitors
4. Se devuelve `project_id` → se guarda en clients.json o tabla SanchoCMO

---

## 4. ¿Contenido social (IG/LinkedIn/Twitter)?

**Decisión: Escudero genera blog → Sancho atomiza a social.**

- Escudero genera el blog article (RF-11) — ya funciona
- Nuevo skill en Sancho `content-atomizer` que toma el article y genera:
  - 1 post LinkedIn (carrusel o texto largo)
  - 3-5 posts Instagram (caption + hook)
  - 3-5 tweets/threads
- NO crear módulo social dentro de Escudero — es intelligence + content, la distribución es de Sancho

```
Escudero genera artículo → ContentBrief.generated_content
  → Sancho skill "content-atomizer" lee el artículo
  → Genera variantes por plataforma
  → Sancho skill "social-publisher" programa publicación
```

---

## 5. ¿Bots IG/LinkedIn?

**Decisión: Proyecto independiente, necesita spec antes de codear.**

| Decisión | Recomendación |
|---|---|
| Acciones | LinkedIn: connection requests + comments. IG: follow + like + comment. NO DMs (ban rate altísimo) |
| Infra | Apify actors para IG. LinkedIn: PhantomBuster o Playwright custom |
| Rate limits | LinkedIn: max 20 connections/día, 50 likes/día. IG: max 60 follows/hora, 30 comments/hora |
| Integración | Independiente de Escudero. Sancho orquesta via skills |
| Anti-ban | Residential proxies, delays aleatorios, warm-up period, sesiones persistentes |

NO integrarlo en Escudero. Es proyecto separado con su propia infra.

---

## 6. Estado real del código

### Backend Python — FUNCIONAL ✅
- 46 engine files, 19 tablas, 65+ endpoints, 9 tasks
- Path: `/backend/app/`
- Run: `conda activate seogeo && uvicorn app.main:app --reload --port 8000`

### Frontend Next.js — FUNCIONAL ✅
- 30 páginas, componentes, API client completo
- Path: `/frontend/src/`
- Run: `npm run dev` (puerto 3000, necesita backend en 8000)

### Bots IG/LinkedIn — DESDE CERO ❌
- Solo existe: `apify_token` en config, `InfluencerResult` model, influencer discovery engine
- Descubrir influencers ≠ automatizar interacciones

---

## 7. Prioridad y Workstreams

```
1º  Audit (WS-2)      → Ya funciona, validar + conectar con Sancho
2º  Content (WS-3)     → Ya genera artículos, falta atomizar a social
3º  Infra (WS-1)       → Dockerizar + Drizzle cuando se integre con SanchoCMO
4º  Multi-client (WS-5) → Cuando haya >1 cliente real
5º  Bots (WS-4)        → Último, requiere spec + infra de proxies
```

| # | Workstream | Prioridad | Primera acción |
|---|---|---|---|
| WS-1 | Infra + DB | P0 | Drizzle schemas, dockerizar Escudero API |
| WS-2 | Audit Engine | P0 | Validar engines contra PostgreSQL real, crear cron en Sancho |
| WS-3 | Content + Social | P1 | Crear skill `content-atomizer` en Sancho |
| WS-4 | Bots IG/LI | P2 | Escribir spec de acciones + rate limits antes de codear |
| WS-5 | Multi-cliente | P1 | Mapear clients.json → Projects, skill onboarding automático |

WS-1 y WS-2 van en paralelo. WS-3 y WS-5 arrancan cuando WS-1 esté listo. WS-4 es independiente y puede esperar.
