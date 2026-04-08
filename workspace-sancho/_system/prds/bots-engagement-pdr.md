# PDR — Bots de Engagement (Instagram + LinkedIn)

**ID:** T-060
**Producto:** Bots de Engagement Automatizado — IG + LI
**Versión:** 2.1
**Fecha:** 2026-03-25
**Autor:** Cervantes
**Sistema:** SanchoCMO — Post-Foundation Execution
**Estado:** Arquitectura aprobada por Alfonso (2026-03-22)
**Prioridad:** P2 (separado del Execution Engine core)

> **v2.0 cambios**: Arquitectura simplificada. Sin VPS, sin DB, sin agente nuevo.
> Todo en OpenClaw: skills + crons + Apify API + JSON state. Costo ~$10-20/mo.
> **v2.1 cambios**: Apify actors confirmados (IG + LI). Sección Mission Control añadida.
> MC UI como hito separado, en paralelo con skills.

---

## 0. Índice

1. [Problema y Propuesta de Valor](#1-problema-y-propuesta-de-valor)
2. [Arquitectura](#2-arquitectura)
3. [Estado y Datos (JSON)](#3-estado-y-datos-json)
4. [Acciones por Plataforma](#4-acciones-por-plataforma)
5. [Secuencias de Engagement](#5-secuencias-de-engagement)
6. [Comment Generation (LLM)](#6-comment-generation-llm)
7. [Anti-Ban Strategy](#7-anti-ban-strategy)
8. [Flujos Operativos](#8-flujos-operativos)
9. [Integraciones Externas](#9-integraciones-externas)
10. [Skills de Sancho](#10-skills-de-sancho)
11. [Mission Control UI](#11-mission-control-ui)
12. [Multi-Cliente](#12-multi-cliente)
13. [Criterios de Aceptación](#13-criterios-de-aceptación)
14. [Riesgos](#14-riesgos)
15. [Costos](#15-costos)
16. [Estimación](#16-estimación)
17. [Lo que NO hacer](#17-lo-que-no-hacer)
18. [Escalado futuro](#18-escalado-futuro)
19. [Decisiones Pendientes](#19-decisiones-pendientes)

---

## 1. Problema y Propuesta de Valor

### 1.1 Qué resuelve

Los clientes necesitan crecer orgánicamente en IG y LinkedIn pero:

1. **No tienen tiempo** — Engagement manual consume 2-4h/día
2. **No son consistentes** — Lo hacen 1 semana y lo dejan 3
3. **No saben a quién** — Interactúan con perfiles irrelevantes
4. **No miden** — Sin métricas de follow-back, engagement rate por target

### 1.2 Propuesta

Engagement estratégico automatizado con perfiles relevantes descubiertos por el Influencer Discovery engine. **NO es spam** — es engagement graduado, personalizado (comments LLM con brand_voice), con anti-ban robusto.

### 1.3 Relación con el Execution Engine

```
Execution Engine (T-050)
  └── Influencer Discovery (RF-14)
        └── influencer_results → targets para los bots
              │
              ▼
Skills de Sancho (este PDR, T-060)
  ├── instagram-engagement (skill + cron)
  └── linkedin-engagement (skill + cron)
```

---

## 2. Arquitectura

### 2.1 Principio: Todo dentro de OpenClaw

No hay VPS separado, no hay microservicio, no hay DB nueva. Los bots son **skills de Sancho + crons + llamadas HTTP a Apify + estado en JSON**.

```
┌─────────────────────────────────────────────────────┐
│  OPENCLAW (Mac local)                               │
│                                                     │
│  Sancho (agente existente)                          │
│  ├── Skill: instagram-engagement                    │
│  ├── Skill: linkedin-engagement                     │
│  ├── Cron: bot-executor (cada 5 min)                │
│  ├── Cron: bot-scheduler (cada 6h)                  │
│  ├── Cron: bot-monitor (cada 1h)                    │
│  └── Cron: bot-daily-digest (diario 9:00)           │
│                                                     │
│  Estado: brand/{slug}/engagement/*.json             │
│  Targets: influencer_results (Execution Engine)     │
└───────────────────────┬─────────────────────────────┘
                        │ HTTP (curl)
                        ▼
┌─────────────────────────────────────────────────────┐
│  APIFY (cloud)                                      │
│  ├── IG actors: follow, like, comment, unfollow...  │
│  └── LI actors: connect, like, comment, view...     │
│  (proxies residential incluidos en Apify)           │
└─────────────────────────────────────────────────────┘
```

### 2.2 Por qué NO sistema separado

| Aspecto | Sistema separado (v1.0) | OpenClaw nativo (v2.0) |
|---|---|---|
| Scheduling | APScheduler en Docker | Crons de OpenClaw ✅ |
| Queue de acciones | PostgreSQL + worker | JSON + skill lee/escribe ✅ |
| LLM comments | OpenRouter separado | Modelo de Sancho (Claude Max) ✅ |
| Proxies | Bright Data $75/mo | Incluidos en Apify ✅ |
| Deploy | VPS + Docker | Ya corre ✅ |
| Estado | DB relacional | JSON en workspace ✅ |
| Monitoring | Dashboard custom | Discord notifications ✅ |

### 2.3 Agentes: no hay nuevo

| Quién | Qué hace en bots |
|---|---|
| **Sancho** | Ejecuta skills de engagement. Crons. Reporta métricas. Genera comments. |
| **Escudero** | Si un ciclo multi-cliente es pesado → `sessions_spawn` |
| **Cervantes** | Debug infra, config Apify, problemas de crons |

---

## 3. Estado y Datos (JSON)

### 3.1 Estructura en workspace

```
brand/{slug}/engagement/
  ├── config.json           ← config del cliente (cuentas, timezone, horarios)
  ├── ig-state.json         ← estado cuenta IG (warm-up, cooldowns, counters)
  ├── ig-sequences.json     ← secuencias activas y completadas
  ├── ig-actions-queue.json ← acciones pendientes de ejecutar
  ├── ig-metrics.json       ← métricas diarias agregadas
  ├── li-state.json         ← estado cuenta LI
  ├── li-sequences.json     ← secuencias activas y completadas
  ├── li-actions-queue.json ← acciones pendientes
  └── li-metrics.json       ← métricas diarias agregadas
```

### 3.2 Schemas JSON

#### `config.json`

```json
{
  "instagram": {
    "enabled": true,
    "username": "@cuenta_ig",
    "timezone": "Europe/Madrid",
    "active_hours": { "start": 9, "end": 22 },
    "weekend_active": true,
    "weekend_intensity": 0.6,
    "apify_actor_id": "apify/instagram-...",
    "max_daily_follows": 200,
    "max_daily_likes": 300,
    "max_daily_comments": 20
  },
  "linkedin": {
    "enabled": true,
    "username": "perfil-linkedin",
    "timezone": "Europe/Madrid",
    "active_hours": { "start": 8, "end": 20 },
    "weekend_active": false,
    "apify_actor_id": "apify/linkedin-...",
    "max_daily_connections": 20,
    "max_daily_likes": 50,
    "max_daily_comments": 15
  }
}
```

#### `ig-state.json`

```json
{
  "status": "active",
  "warmup_start": "2026-03-01",
  "warmup_phase": 2,
  "daily_counts": {
    "date": "2026-03-22",
    "follows": 42,
    "likes": 156,
    "comments": 8,
    "unfollows": 12,
    "stories_viewed": 34
  },
  "consecutive_failures": 0,
  "last_action_at": "2026-03-22T18:34:12Z",
  "last_pause": null,
  "pause_until": null,
  "lifetime": {
    "total_actions": 4521,
    "total_follows": 890,
    "total_followbacks": 112
  }
}
```

#### `ig-sequences.json`

```json
{
  "active": [
    {
      "id": "seq-uuid-1",
      "target_username": "@influencer1",
      "target_url": "https://instagram.com/influencer1",
      "influencer_relevance": 72,
      "started_at": "2026-03-20",
      "current_step": 2,
      "steps": [
        { "day": 1, "action": "follow", "status": "completed", "executed_at": "2026-03-20T10:15:00Z" },
        { "day": 2, "action": "like_2", "status": "completed", "executed_at": "2026-03-21T14:22:00Z" },
        { "day": 4, "action": "like_story", "status": "queued", "scheduled_at": "2026-03-24" },
        { "day": 7, "action": "comment", "status": "queued", "scheduled_at": "2026-03-27", "comment_text": null }
      ]
    }
  ],
  "completed": [],
  "targets_used": ["@influencer1", "@influencer2"]
}
```

#### `ig-actions-queue.json`

```json
{
  "queue": [
    {
      "id": "act-uuid-1",
      "sequence_id": "seq-uuid-1",
      "action_type": "like_story",
      "target_username": "@influencer1",
      "target_url": "https://instagram.com/influencer1",
      "scheduled_at": "2026-03-24T14:00:00Z",
      "status": "queued",
      "retry_count": 0,
      "comment_text": null
    }
  ]
}
```

#### `ig-metrics.json`

```json
{
  "daily": [
    {
      "date": "2026-03-22",
      "follows_sent": 15,
      "follows_back": 2,
      "likes_sent": 42,
      "comments_sent": 3,
      "stories_viewed": 12,
      "unfollows_sent": 5,
      "actions_failed": 1,
      "success_rate": 0.97
    }
  ],
  "totals": {
    "follow_back_rate": 0.126,
    "avg_success_rate": 0.94,
    "total_days_active": 18
  }
}
```

### 3.3 ¿Cuándo migrar a DB?

**No ahora.** JSON funciona para 2-4 clientes con ~200-500 acciones/día. Señales para migrar:
- >10 clientes activos con bots
- Queries cross-cliente frecuentes ("top 10 influencers con mejor follow-back de todos los clientes")
- JSON >5MB por archivo
- Necesidad de dashboard web con queries complejas

Migración es trivial: leer JSONs → insertar en tablas. Schema ya definido en v1.0 del PDR (archivado).

---

## 4. Acciones por Plataforma

### 4.1 Instagram

| Acción | Rate limit | Riesgo ban | Implementación |
|---|---|---|---|
| Follow | 60/h, 200/día | Medio | Apify actor |
| Like | 60/h, 300/día | Bajo | Apify actor |
| Comment (LLM) | 20/h, 100/día | **Alto** | Apify actor + comment pre-generado por Sancho |
| Story view | 100/h | Bajo | Apify actor |
| Unfollow | 60/h, 200/día | Medio | Apify actor (7-14 días post-follow) |
| View profile | Sin límite práctico | Muy bajo | Apify actor |
| **DM** | **PROHIBIDO** | **>90% ban** | **NO IMPLEMENTAR** |

### 4.2 LinkedIn

| Acción | Rate limit | Riesgo ban | Implementación |
|---|---|---|---|
| Connection request | 20/día, 100/semana | Medio | Apify actor LI |
| Like post | 50/día | Bajo | Apify actor LI |
| Comment post (LLM) | 15/día | Medio-Alto | Apify actor LI + comment pre-generado |
| Profile view | 80/día | Bajo | Apify actor LI |
| Follow company | 30/día | Bajo | Apify actor LI |
| **InMail** | **PROHIBIDO** | **>90% ban** | **NO IMPLEMENTAR** |
| **NO fines de semana** | — | — | Cron respeta config |

### 4.3 Apify actors confirmados ✅

> Investigado 2026-03-23. Hay actors para TODAS las acciones necesarias.

#### Instagram — Actor principal: `zen-studio/instagram-automation-api`

API REST completa con **43 endpoints**. No usa browser/Selenium — son HTTP requests autenticados. Sessions persisten días. Proxy routing incluido por país. Multi-account (cada email = sesión aislada).

| Acción del bot | Endpoint | Método |
|---|---|---|
| Follow | `/follow` | POST |
| Unfollow | `/unfollow` | POST |
| Like | `/like` | POST |
| Comment | `/comment` (soporta replies) | POST |
| Story like | `/story-like` | POST |
| View profile | `/user-info` | GET |
| Login | `/login` (2FA soportado) | POST |
| Session check | `/session-status` | GET |
| Followers list | `/followers` | GET (paginated) |
| Posts | `/posts` | GET (para verificar follow-back) |

**Auth**: Login con email/password + 2FA. Session persiste. Multi-account.
**Pricing**: Pay-per-call, estimado ~$5-10/mo con uso moderado.

Actors alternativos (single-purpose, como backup):
- `dead00/instagram-comment-bot` — Solo comments ($0.01/1000)
- `am_production/instagram-posts-auto-like-tool` — Solo likes
- `synk/instagram-auto-unfollow` — Solo unfollows

**Decisión**: `zen-studio` como actor principal (todo en uno).

#### LinkedIn — Actors por acción

No hay "todo en uno". Combinamos actors especializados:

| Acción del bot | Actor | Auth | Notas |
|---|---|---|---|
| Connection request | `data_link_miner/linkedin-network-connection-request` | Cookie `li_at` | Max 20/run, rate limited, notas personalizadas |
| Like post | `addeus/like-post` | Cookie `li_at` | Puppeteer + anti-detection, 7 estrategias |
| Comment post | `addeus/comment-post` | Cookie `li_at` | Emojis, residential proxies incluidos |
| View profile | (via scraper actors) | Cookie `li_at` | No simula "Who viewed" — baja prioridad |

**Auth LinkedIn**: Todos usan cookie `li_at` (no OAuth). Cliente exporta cookie una vez.
**Pricing**: Pay-per-run, ~$5-10/mo total para las 3 acciones.

#### Gap: LinkedIn profile view

NO hay actor de "profile view" como engagement (que aparezca en "Who viewed your profile"). Los scrapers leen datos pero no simulan visita real. **Para MVP lo omitimos** — es la acción de menor impacto. Si lo necesitamos: Playwright local.

---

## 5. Secuencias de Engagement

### 5.1 Instagram — Secuencia estándar (7 días)

```
Día 1: View profile + Follow
Día 2: Like 2 posts recientes
Día 4: Like 1 post + View story (si tiene)
Día 7: Comment LLM en post relevante
```

**Post-secuencia:**
- Si NO follow-back en 14 días → Unfollow
- Si follow-back → Mantener, like ocasional (1/semana)

### 5.2 LinkedIn — Secuencia estándar (10 días)

```
Día 1: View profile
Día 2: Connection request (nota personalizada LLM, max 300 chars)
Día 5: Like 2 posts recientes
Día 8: Comment LLM en post relevante
Día 10: Like 1 post
```

**Post-secuencia:**
- Si acepta conexión → Mantener engagement (1 like/semana)
- Si NO acepta en 30 días → Marcar como "no responsive"

### 5.3 Lógica de creación de secuencias

```
El skill lee influencer_results (del Execution Engine):
  → Filtra: relevance_score > 50, platform match, no en targets_used
  → Ordena por relevance_score desc
  → Toma top N (según capacity diaria)
  → Para cada target:
    → Crea entrada en ig-sequences.json (o li-)
    → Calcula scheduled_at para cada step
    → Si step=comment → genera texto con LLM
    → Inserta acciones en actions-queue.json
```

---

## 6. Comment Generation (LLM)

### 6.1 System prompt

```
Genera un comentario natural para un post de {platform}.

Reglas:
- 1-2 frases, máximo 150 caracteres
- Tono genuino, NO promocional
- Máximo 1 emoji
- NO links ni menciones de marca
- NO "Great post!" ni "Love this!" ni genéricos
- Varía el estilo: pregunta, complemento, experiencia personal, dato relevante
- Idioma: {language}

Brand voice del cliente:
{brand_voice_summary}

Contexto del post:
{post_content_or_topic}
```

### 6.2 Estilos de variación

| Estilo | Ejemplo |
|---|---|
| Pregunta | "¿Habéis visto cómo está evolucionando esto en el mercado español?" |
| Complemento | "Muy buen punto sobre la regulación, es lo que más está frenando la adopción" |
| Experiencia | "En nuestra experiencia el tema del open banking ha sido clave" |
| Dato | "El dato de crecimiento del 40% es impresionante, coincide con lo que estamos viendo" |
| Opinión | "Coincido al 100%, sobre todo con el tema de la personalización" |

### 6.3 Anti-detección de comments

- **Nunca repetir** el mismo comment en 7 días (guardar últimos 100 en state)
- **Variación de largo** — entre 50-150 chars
- **Idioma consistente** — del cliente (Foundation)
- **Contexto real** — el LLM necesita contenido del post (scrape previo)
- **Coste**: $0 adicional (Claude Max plan fijo)

---

## 7. Anti-Ban Strategy

### 7.1 Warm-up (21 días)

| Fase | Duración | Actividad |
|---|---|---|
| **Fase 0** | Días 1-7 | Solo browsing: scroll feed, ver perfiles. CERO acciones |
| **Fase 1** | Días 8-14 | 20% de rate limits: ~40 likes/día, ~12 follows/día, 0 comments |
| **Fase 2** | Días 15-21 | 50% de rate limits: ~150 likes/día, ~30 follows/día, ~5 comments |
| **Full** | Día 22+ | 100% de rate limits según tabla §4 |

### 7.2 Delays

- Base: 60 segundos entre acciones
- Jitter: ±30% aleatorio
- Mínimo absoluto: 45 segundos
- Entre secuencias diferentes: 3-5 minutos

### 7.3 Horarios

| Plataforma | Horario activo | Fin de semana |
|---|---|---|
| Instagram | 9:00-22:00 hora local | ✅ Activo (60% intensidad) |
| LinkedIn | 8:00-20:00 hora local | ❌ Inactivo |

### 7.4 Proxies

Incluidos en Apify actors. Si usamos phantom custom / Playwright:
- Residential SOLO (datacenter = ban instantáneo)
- Mismo país que la cuenta
- Sticky session 30min
- 1 cuenta por IP

### 7.5 Auto-pausa

| Condición | Acción | Duración |
|---|---|---|
| 3 fallos consecutivos | Pausa | 2 horas |
| Success rate <70% en última hora | Pausa | 24 horas |
| 3+ rate limits en un día | Pausa | 12 horas |
| Warning de la plataforma | Pausa | 72 horas |

El skill actualiza `ig-state.json` con `pause_until` y el cron executor lo respeta.

### 7.6 Human patterns (si Playwright)

- Scroll feed antes de like (2-5s)
- Ver perfil antes de follow (3-8s)
- Leer post antes de comment (5-15s)
- Typing delay variable para comments
- No actuar en orden secuencial

---

## 8. Flujos Operativos

### 8.1 Flujo principal

```
CRON: bot-scheduler (cada 6h)
  └── Skill "instagram-engagement" / "linkedin-engagement"
        ├── Lee influencer_results (Execution Engine)
        ├── Filtra: relevance > 50, no ya en secuencia
        ├── Crea secuencias en {platform}-sequences.json
        ├── Pre-genera comments (LLM) para steps que los necesiten
        └── Inserta acciones en {platform}-actions-queue.json

CRON: bot-executor (cada 5 min)
  └── Skill lee actions-queue.json
        ├── Filtra: status=queued, scheduled_at <= now
        ├── Verifica: cuenta activa? dentro de horario? daily_count < limit? no en pausa?
        ├── Ejecuta acción via Apify API (curl)
        ├── Actualiza status en queue + state (counters)
        └── Si falla: retry_count++, re-schedule +2h, o skip si 3 retries

CRON: bot-monitor (cada 1h)
  └── Skill lee state + queue
        ├── Calcula success_rate
        ├── Aplica reglas de auto-pausa (§7.5)
        └── Si pausa o anomalía → notifica Discord

CRON: bot-daily-digest (diario 9:00)
  └── Skill lee metrics.json
        └── Envía resumen al hilo Discord del cliente
```

### 8.2 Flujo warm-up

```
NUEVA CUENTA → config.json con enabled=true
  └── ig-state.json: status="warming_up", warmup_phase=0

CRON bot-executor respeta warm-up:
  Fase 0 (días 1-7): solo view_profile
  Fase 1 (días 8-14): acciones al 20% rate
  Fase 2 (días 15-21): acciones al 50% rate
  Día 22: status="active" automático
```

### 8.3 Flujo unfollow (IG)

```
CRON diario (dentro de bot-scheduler):
  ├── Lee ig-sequences.json → completed con follow hace >14 días
  ├── Verifica: ¿hubo follow-back? (requiere check via Apify)
  ├── Si no follow-back → programa unfollow
  ├── Max unfollows/día = 50% de follows del día
  └── Nunca unfollow mismo día que follow
```

---

## 9. Integraciones Externas

### 9.1 APIs

| Servicio | Uso | Config | Coste |
|---|---|---|---|
| **Apify** | IG + LI: acciones de engagement | `APIFY_TOKEN` (ya configurado) | ~$10-20/mo pay-per-use |
| **Modelo Sancho** | Comment generation | Claude Max (incluido) | $0 extra |

### 9.2 Philippe phantom custom (IG)

> **PENDIENTE**: Philippe debe pasar el código del phantom.

Si el phantom es superior a los Apify actors, se integra como executor alternativo. El skill soportaría ambos modos (Apify o phantom) via config.

### 9.3 Credenciales de cuentas

**NUNCA por Discord.** Flujo:
1. Cliente configura cuenta via Mission Control (HTTPS, encriptado)
2. Se guarda en config.json del workspace (no en chat)
3. Session tokens/cookies: encriptados en el JSON o en 1Password

---

## 10. Skills de Sancho

### 10.1 Skills nuevos

| Skill | Trigger | Qué hace |
|---|---|---|
| `instagram-engagement` | Cron + manual | Scheduler, executor, monitor, métricas para IG |
| `linkedin-engagement` | Cron + manual | Scheduler, executor, monitor, métricas para LI |

### 10.2 Comandos del skill

```
status          → Estado de cuentas, warm-up, daily counts
pause           → Pausa la cuenta
resume          → Resume la cuenta
metrics [7d]    → Métricas del periodo
add-target @usr → Añade target manual a la queue
run-cycle       → Ejecuta un ciclo ahora (sin esperar cron)
```

### 10.3 Crons

| Cron | Frecuencia | Skill |
|---|---|---|
| `bot-scheduler` | Cada 6h | Crea secuencias desde influencer_results |
| `bot-executor` | Cada 5 min | Ejecuta acciones queued |
| `bot-monitor` | Cada 1h | Success rate, auto-pausa |
| `bot-daily-digest` | Diario 9:00 | Resumen Discord por cliente |

---

## 11. Mission Control UI

### 11.1 Visión general

Nueva sección **"🤖 Engagement"** en Mission Control, visible solo cuando hay un cliente seleccionado. Lee directamente los JSON de `brand/{slug}/engagement/` — cero backend nuevo, `mc-server.js` ya sirve archivos del workspace.

**Hito separado**: Se construye en paralelo con los skills. Los skills funcionan sin MC (Discord notifications). MC añade visibilidad y control.

### 11.2 Navegación

```
Nav lateral (client selected):
  📊 Dashboard
  🏗️ Foundation
  📈 Métricas
  🚀 Campañas
  🤖 Engagement  ← NUEVO
  🗄️ Datos
```

### 11.3 Layout de la página

```
┌─────────────────────────────────────────────────────┐
│  🤖 Engagement — {clientName}                        │
│                                                      │
│  [📸 Instagram]  [💼 LinkedIn]    ← tabs             │
│                                                      │
│  ┌─ Estado ─────────────────────────────────────┐   │
│  │ ● Active  |  Cuenta: @hospitalcapilar        │   │
│  │ Warm-up: Completado (día 24)                  │   │
│  │ [⏸ Pausar]  [⚙️ Config]                      │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌─ Métricas 7d ────────────────────────────────┐   │
│  │ Follows    Likes    Comments   Follow-back    │   │
│  │   87        245       18        11.5%         │   │
│  │                                               │   │
│  │ Success rate: 94.2%  |  Acciones hoy: 42      │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌─ Gráfica 30d ────────────────────────────────┐   │
│  │ [chart.js: follows/día, success rate,         │   │
│  │  follow-back rate — últimos 30 días]          │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌─ Secuencias activas (8) ─────────────────────┐   │
│  │ @influencer1  Paso 3/4  Día 5   Score: 72    │   │
│  │ @influencer2  Paso 1/4  Día 1   Score: 68    │   │
│  │ @influencer3  Paso 2/4  Día 3   Score: 65    │   │
│  │ ...                              [Ver todas]  │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌─ Últimas acciones ───────────────────────────┐   │
│  │ 14:22 ✅ Like @user3 post                     │   │
│  │ 14:18 ✅ Follow @user4                        │   │
│  │ 14:15 ❌ Comment @user5 (rate limited)        │   │
│  │ 14:10 ✅ Story view @user6                    │   │
│  │ ...                              [Ver todas]  │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌─ Config ─────────────────────────────────────┐   │
│  │ Horario: 9:00-22:00  |  Weekend: 60%         │   │
│  │ Max follows: 200/día | Likes: 300 | Cmts: 20 │   │
│  │ [Editar config]                               │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 11.4 Datos → UI mapping

| Componente UI | JSON source | Campo(s) |
|---|---|---|
| Estado + cuenta | `config.json` + `ig-state.json` | `status`, `warmup_phase`, `username` |
| Métricas 7d | `ig-metrics.json` | `daily[]` últimos 7 entries |
| Gráfica 30d | `ig-metrics.json` | `daily[]` últimos 30 entries |
| Secuencias activas | `ig-sequences.json` | `active[]` |
| Últimas acciones | `ig-actions-queue.json` | últimas 20 con `status != queued` |
| Config | `config.json` | `instagram.*` o `linkedin.*` |

### 11.5 Interactividad (v2 — post-MVP)

| Acción UI | Efecto |
|---|---|
| **Pausar cuenta** | Escribe `status: "paused"` en `ig-state.json`. Cron executor lo respeta. |
| **Resume cuenta** | Escribe `status: "active"`, `pause_until: null` |
| **Editar config** | Modal con campos editables → escribe `config.json` |
| **Añadir target manual** | Input de username → crea secuencia en `ig-sequences.json` |

Para MVP: los botones llaman endpoints en `mc-server.js` que escriben los JSON. Los crons leen el estado actualizado en el siguiente ciclo.

### 11.6 Implementación técnica

```
mc-server.js cambios:

  GET /api/engagement/{slug}/{platform}
    → Lee config.json + {platform}-state.json + {platform}-metrics.json
    → Devuelve JSON combinado para la UI

  POST /api/engagement/{slug}/{platform}/action
    → Acciones: pause, resume, update-config
    → Escribe el JSON correspondiente

mission-control.html cambios:

  Nueva función: showPage('engagement')
  Tabs: Instagram / LinkedIn
  Chart.js para gráfica de métricas
  Polling cada 30s para actualizar estado (cuando página visible)
```

### 11.7 Hitos MC

| Hito | Scope | Depende de |
|---|---|---|
| **MC-E1** (MVP) | Página read-only: estado, métricas, secuencias, log acciones | Skills funcionando + JSON con datos reales |
| **MC-E2** | Pausar/resume + gráfica Chart.js 30d | MC-E1 |
| **MC-E3** | Editar config + añadir targets manuales | MC-E2 |

---

## 12. Multi-Cliente

### 12.1 Qué necesita cada cliente

| Requisito | Obligatorio | Quién lo provee |
|---|---|---|
| Cuenta IG (username + session) | Sí (para bot IG) | **Cliente** via MC |
| Cuenta LinkedIn (session) | Sí (para bot LI) | **Cliente** via MC |
| Influencer Discovery ejecutado | Sí (targets) | **Execution Engine** |
| Foundation (brand_voice) | Recomendado (comments) | **Sancho Foundation** |
| Config timezone/horarios | Recomendado | **Cliente** via MC |

### 12.2 Aislamiento

- Cada cliente: `brand/{slug}/engagement/` separado
- Cada cuenta: su propio state, queue, métricas
- Crons iteran con `for-each-client.sh`
- Session data encriptada (nunca plaintext)
- Credenciales NUNCA por Discord → siempre MC

### 12.3 Lo que Sancho pone de base

| Servicio | Incluido | Límite |
|---|---|---|
| Apify compute | Pay-per-use compartido | ~2-3 cuentas con plan Starter |
| LLM comments | Claude Max (plan fijo) | Sin límite práctico |
| Monitoring + alertas | Incluido | — |
| Proxies | Incluidos en Apify | — |

---

## 13. Criterios de Aceptación

### CA-01: Scheduler
- [ ] Lee influencer_results con relevance_score > 50
- [ ] Crea secuencias correctas (7 días IG, 10 días LI)
- [ ] No duplica secuencias para el mismo influencer+cuenta
- [ ] Pre-genera comments para steps de tipo comment
- [ ] Respeta daily limits al programar

### CA-02: Executor IG
- [ ] Follow funciona via Apify
- [ ] Like funciona (1-3 posts)
- [ ] Comment se publica correctamente
- [ ] Story view funciona
- [ ] Unfollow funciona (14+ días post-follow)
- [ ] Delays aleatorios (min 45s)
- [ ] Solo actúa en horario configurado
- [ ] Respeta warm-up phases

### CA-03: Executor LI
- [ ] Profile view funciona
- [ ] Connection request con nota personalizada
- [ ] Like funciona
- [ ] Comment se publica correctamente
- [ ] NO actúa fines de semana (si config)
- [ ] Delays aleatorios (min 45s)

### CA-04: Anti-ban
- [ ] Warm-up 21 días: 3 fases correctas
- [ ] Auto-pausa por 3 fallos consecutivos (2h)
- [ ] Auto-pausa por success_rate <70% (24h)
- [ ] Auto-pausa por warning de plataforma (72h)

### CA-05: Monitoring
- [ ] Métricas diarias se generan correctamente
- [ ] Daily digest en Discord
- [ ] Alertas inmediatas por pausa/ban

### CA-06: Comment LLM
- [ ] Comments son naturales (no genéricos)
- [ ] Usa brand_voice del cliente
- [ ] No repite mismo comment en 7 días
- [ ] Largo variable (50-150 chars)
- [ ] Idioma correcto

### CA-07: Multi-cliente
- [ ] Funciona para ≥2 clientes simultáneos
- [ ] Aislamiento completo de datos
- [ ] Crons iteran correctamente

---

## 14. Riesgos

| Riesgo | Impacto | Prob. | Mitigación |
|---|---|---|---|
| **Ban de cuenta** | Alto | Media | Warm-up 21 días, rate limits conservadores, auto-pausa |
| **Apify no tiene actors de engagement** | Alto | Media | Evaluar phantom custom Philippe, Playwright local |
| **Apify actors deprecated** | Medio | Baja | Phantom custom como fallback |
| **LLM genera comment inapropiado** | Alto | Baja | Review primeros 50 comments, guardrails en prompt |
| **JSON state corrupto** | Medio | Baja | Backup antes de write, validación schema |
| **Rate limits de plataforma cambian** | Medio | Media | Config flexible en config.json |
| **Cron executor cada 5min = mucho compute** | Bajo | Media | Si no hay acciones queued → exit rápido, coste mínimo |

---

## 15. Costos

### 14.1 Coste real por cliente/mes

| Concepto | Coste | Notas |
|---|---|---|
| Apify (IG + LI) | ~$10-20/mo | Pay-per-use, compute units |
| LLM (comments) | $0 | Claude Max plan fijo |
| VPS / Infra | $0 | OpenClaw local |
| Proxies | $0 | Incluidos en Apify |
| **Total** | **~$10-20/mo** | |

### 14.2 Precio sugerido al cliente

| Plan | Incluye | Precio |
|---|---|---|
| **Engagement Basic** | 1 plataforma (IG o LI) | $99-149/mes |
| **Engagement Pro** | IG + LI | $199-249/mes |

### 14.3 Margen

- Coste: ~$15/mo
- Precio: ~$150-250/mo
- **Margen: ~90%**

---

## 16. Estimación

| Tarea | Esfuerzo |
|---|---|
| ~~Investigar Apify actors~~ | ~~1 día~~ ✅ Hecho |
| Diseñar JSON schemas definitivos | 0.5 días |
| Skill `instagram-engagement` (scheduler + executor + monitor) | 3-4 días |
| Skill `linkedin-engagement` | 3-4 días |
| Comment generator (LLM integration) | 1 día |
| Anti-ban engine (warm-up, pausa, delays) | 1-2 días |
| Crons setup en OpenClaw | 0.5 días |
| Integrar phantom custom Philippe (si aplica) | 1-2 días |
| **MC-E1**: Página engagement read-only en Mission Control | 2-3 días |
| **MC-E2**: Pausar/resume + Chart.js gráficas | 1-2 días |
| **MC-E3**: Editar config + targets manuales | 1-2 días |
| Test E2E con 1 cuenta real | 5-7 días (incluye warm-up) |
| **Total dev (skills + MC)** | **~3-4 semanas** |
| **Total hasta producción** | **~6-7 semanas** (incluye warm-up 21 días) |

---

## 17. Lo que NO hacer

| ❌ No | Razón |
|---|---|
| **NO automatizar DMs** | Tasa de ban >90% |
| **NO comentarios genéricos** ("Great post! 🔥") | Flagged como bot |
| **NO escalar antes de validar** | 1 cuenta × 30 días antes de añadir más |
| **NO guardar credenciales en Discord** | Solo via MC encriptado |
| **NO ignorar warnings de plataforma** | Pausa inmediata 72h |
| **NO follow + unfollow mismo día** | Detección inmediata |
| **NO sobreingenierar** | JSON > DB para MVP. Skills > microservicio. |

---

## 18. Escalado futuro

Cuando el sistema necesite crecer más allá de JSON + Apify:

| Trigger | Acción |
|---|---|
| >10 clientes con bots | Migrar estado a Supabase (schema en apéndice de v1.0) |
| Apify actors insuficientes | Playwright en VPS + residential proxies |
| Dashboard web para clientes | Mission Control sección "Engagement" |
| Queries cross-cliente | DB relacional |

La migración JSON → DB es trivial: leer archivos → insertar en tablas.

---

## 19. Decisiones Pendientes

| # | Tema | Estado | Decide |
|---|---|---|---|
| ~~**DP-1**~~ | ~~¿Existen Apify actors de engagement para IG/LI?~~ | ✅ Resuelto (2026-03-23) — Sí: `zen-studio` (IG), `addeus`+`data_link_miner` (LI) | — |
| **DP-2** | Phantom custom Philippe: ¿código disponible? | Pendiente Philippe | Philippe |
| **DP-3** | Si no hay actors Apify: ¿Playwright local o custom? | Depende de DP-1 | Alfonso + Cervantes |
| **DP-4** | ¿1 cuenta IG + 1 LI por cliente para MVP? | Recomendado: sí | Alfonso |
| **DP-5** | ¿Session tokens via MC o 1Password? | Recomendado: MC | Alfonso |

---

## Apéndice: Relación con otros PDRs

| PDR | Relación |
|---|---|
| **T-050** (Execution Engine) | Bot Engine consume `influencer_results`. Foundation data (brand_voice) para comments. |
| **T-029** (Campañas) | Bot engagement es un "canal" dentro de la estructura de campañas. |

## Apéndice: Métricas de éxito

| Métrica | Target MVP | Target 6 meses |
|---|---|---|
| Follow-back rate (IG) | >8% | >12% |
| Connection accept rate (LI) | >20% | >30% |
| Ban rate | <5% cuentas/mes | <2% cuentas/mes |
| Comment quality (human review) | >80% naturales | >90% naturales |

---

*PDR v2.1 — 2026-03-25. Apify actors confirmados + Mission Control UI.*
*v1→v2: Sin VPS, sin DB, sin agente nuevo. Todo OpenClaw nativo.*
*v2→v2.1: Actors específicos (zen-studio IG, addeus/data_link_miner LI). MC como hito paralelo.*
