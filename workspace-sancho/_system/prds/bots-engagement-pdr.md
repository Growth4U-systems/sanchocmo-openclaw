# PDR — Bots de Engagement (Instagram + LinkedIn)

**ID:** T-060
**Producto:** Bots de Engagement Automatizado — IG + LI
**Versión:** 1.0
**Fecha:** 2026-03-22
**Autor:** Cervantes (extraído de PDR Consolidado T-050 + bot-spec)
**Sistema:** SanchoCMO — Post-Foundation Execution
**Estado:** PDR creado — pendiente validación
**Prioridad:** P2 (separado del Execution Engine core)

> **Scope**: Sistema autónomo de engagement automatizado para Instagram y LinkedIn.
> Recibe targets del Influencer Discovery engine. Ejecuta secuencias de interacción.
> Genera comments con LLM. Monitorea y se auto-pausa ante riesgo de ban.
> **Multi-cliente**: cada cliente tiene sus propias cuentas, proxies y métricas.

---

## 0. Índice

1. [Problema y Propuesta de Valor](#1-problema-y-propuesta-de-valor)
2. [Arquitectura](#2-arquitectura)
3. [Modelo de Datos](#3-modelo-de-datos)
4. [Acciones por Plataforma](#4-acciones-por-plataforma)
5. [Secuencias de Engagement](#5-secuencias-de-engagement)
6. [Comment Generation (LLM)](#6-comment-generation-llm)
7. [Anti-Ban Strategy](#7-anti-ban-strategy)
8. [Flujos Operativos](#8-flujos-operativos)
9. [Integraciones Externas](#9-integraciones-externas)
10. [Integración con SanchoCMO](#10-integración-con-sanchocmo)
11. [Skills de Sancho](#11-skills-de-sancho)
12. [Multi-Cliente](#12-multi-cliente)
13. [Criterios de Aceptación](#13-criterios-de-aceptación)
14. [Riesgos](#14-riesgos)
15. [Costos](#15-costos)
16. [Estimación](#16-estimación)
17. [Lo que NO hacer](#17-lo-que-no-hacer)
18. [Decisiones Pendientes](#18-decisiones-pendientes)

---

## 1. Problema y Propuesta de Valor

### 1.1 Qué resuelve

Los clientes necesitan crecer orgánicamente en IG y LinkedIn pero:

1. **No tienen tiempo** — Engagement manual consume 2-4h/día
2. **No son consistentes** — Lo hacen 1 semana y lo dejan 3
3. **No saben a quién** — Interactúan con perfiles irrelevantes
4. **No miden** — Sin métricas de follow-back, engagement rate por target

### 1.2 Propuesta

Engagement estratégico automatizado con perfiles relevantes descubiertos por el Influencer Discovery engine del Execution Engine. **NO es spam** — es engagement graduado, personalizado (comments LLM), con anti-ban robusto.

### 1.3 Relación con el Execution Engine

```
Execution Engine (T-050)
  └── Influencer Discovery (RF-14)
        └── influencer_results (profile_url, platform, relevance_score)
              │
              ▼
Bot Engine (este PDR, T-060)
  ├── Scheduler → Queue → Executor → Monitor
  └── Comment Generator (LLM + brand_voice)
```

**Dependencia**: El Bot Engine consume `influencer_results` del Execution Engine. Sin Influencer Discovery, los bots no tienen targets.

---

## 2. Arquitectura

### 2.1 Visión general

```
┌─────────────────────────────────────────────────────┐
│  SANCHOCMO (Next.js 15, Vercel)                     │
│  Dashboard: cuentas activas, métricas, pausar/resume│
└───────────────────────┬─────────────────────────────┘
                        │ API (internal key)
                        ▼
┌─────────────────────────────────────────────────────┐
│  EXECUTION ENGINE (Python, FastAPI)                 │
│  Influencer Discovery → influencer_results          │
└───────────────────────┬─────────────────────────────┘
                        │ DB compartida
                        ▼
┌─────────────────────────────────────────────────────┐
│  BOT ENGINE (VPS separado — Docker)                 │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │Scheduler │→ │ Queue DB │→ │ Executor │         │
│  │(cron 6h) │  │bot_actions│  │(worker)  │         │
│  └──────────┘  └──────────┘  └────┬─────┘         │
│                                    │                │
│  ┌──────────┐              ┌──────┴──────┐         │
│  │ Monitor  │◄─────────────│   Proxies   │         │
│  │(alertas) │              │ Residential │         │
│  └──────────┘              │ + Sessions  │         │
│                            └─────────────┘         │
│  ┌──────────────────────────────────┐              │
│  │  Comment Generator (LLM)        │              │
│  │  brand_voice → OpenRouter       │              │
│  └──────────────────────────────────┘              │
└─────────────────────────────────────────────────────┘
```

### 2.2 Por qué VPS separado

- **Aislamiento de riesgo** — Si un bot es baneado, no afecta al Execution Engine
- **IP diferente** — Bots necesitan residential proxies, no la IP del server principal
- **Escalabilidad** — Añadir más workers sin tocar infra core
- **Playwright** — LinkedIn requiere browser automation real, pesado para container compartido

### 2.3 Stack técnico

| Componente | Tecnología |
|---|---|
| Runtime | Python 3.12 + asyncio |
| Framework | FastAPI (endpoints admin) o script standalone |
| IG executor | Apify actors + phantom custom de Philippe |
| LI executor | Playwright headless + residential proxy |
| Queue | PostgreSQL (tabla `bot_actions`) — no necesita Redis para MVP |
| Scheduler | Cron interno (APScheduler) o cron de Sancho |
| LLM | OpenRouter (comments) |
| Proxies | Bright Data o similar, residential, sticky 30min |
| Deploy | Docker en VPS (Hetzner, DigitalOcean, etc.) |

---

## 3. Modelo de Datos

### 3.1 Tablas nuevas

#### `bot_accounts`

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID PK | |
| project_id | FK → projects | Qué cliente usa esta cuenta |
| platform | VARCHAR(20) | `instagram` \| `linkedin` |
| username | VARCHAR(255) | Handle de la cuenta |
| session_data | JSONB | Cookies, tokens, estado de sesión |
| proxy_config | JSONB | `{provider, country, sticky_session_id, last_ip}` |
| status | VARCHAR(20) | `active` \| `paused` \| `banned` \| `warming_up` \| `cooldown` |
| warmup_start_date | DATE | Cuándo empezó el warm-up |
| warmup_phase | INTEGER | 0=browsing, 1=20%, 2=full |
| daily_action_count | INTEGER | Reset cada 24h |
| daily_action_reset_at | TIMESTAMP | Cuándo se reseteó el contador |
| last_action_at | TIMESTAMP | |
| consecutive_failures | INTEGER | Para auto-pausa |
| total_actions | INTEGER | Lifetime |
| total_follows | INTEGER | Lifetime |
| total_followbacks | INTEGER | Lifetime |
| config | JSONB | `{timezone, active_hours_start, active_hours_end, weekend_active}` |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

#### `bot_actions`

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID PK | |
| account_id | FK → bot_accounts | |
| project_id | FK → projects | Redundante para queries rápidas |
| influencer_id | FK → influencer_results (nullable) | Target — nullable para acciones manuales |
| target_url | VARCHAR(500) | URL del perfil/post target |
| target_username | VARCHAR(255) | Username del target |
| action_type | VARCHAR(30) | `follow` \| `like` \| `comment` \| `unfollow` \| `view_story` \| `view_profile` \| `connection_request` \| `follow_company` |
| sequence_id | UUID (nullable) | Agrupa acciones de una misma secuencia |
| sequence_step | INTEGER (nullable) | Paso dentro de la secuencia (1, 2, 3...) |
| status | VARCHAR(20) | `queued` \| `executing` \| `completed` \| `failed` \| `rate_limited` \| `skipped` |
| scheduled_at | TIMESTAMP | Cuándo ejecutar |
| executed_at | TIMESTAMP | Cuándo se ejecutó |
| result | JSONB | `{success, error_code, response, duration_ms}` |
| comment_text | TEXT (nullable) | Si action_type=comment — generado por LLM |
| retry_count | INTEGER DEFAULT 0 | |
| created_at | TIMESTAMP | |

#### `bot_metrics`

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID PK | |
| account_id | FK → bot_accounts | |
| project_id | FK → projects | |
| date | DATE | |
| platform | VARCHAR(20) | |
| follows_sent | INTEGER | |
| follows_back | INTEGER | |
| unfollows_sent | INTEGER | |
| likes_sent | INTEGER | |
| comments_sent | INTEGER | |
| stories_viewed | INTEGER | |
| profiles_viewed | INTEGER | |
| connections_sent | INTEGER | |
| connections_accepted | INTEGER | |
| actions_failed | INTEGER | |
| actions_rate_limited | INTEGER | |
| success_rate | FLOAT | |
| created_at | TIMESTAMP | |

#### `bot_sequences` (template de secuencias)

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID PK | |
| platform | VARCHAR(20) | `instagram` \| `linkedin` |
| name | VARCHAR(100) | e.g. "Standard IG 7-day", "LinkedIn 10-day" |
| steps | JSONB | Array de `{day, action_type, params}` |
| is_default | BOOLEAN | |
| created_at | TIMESTAMP | |

### 3.2 Índices recomendados

```sql
CREATE INDEX idx_bot_actions_scheduled ON bot_actions(scheduled_at) WHERE status = 'queued';
CREATE INDEX idx_bot_actions_account ON bot_actions(account_id, status);
CREATE INDEX idx_bot_metrics_account_date ON bot_metrics(account_id, date);
CREATE INDEX idx_bot_accounts_project ON bot_accounts(project_id, platform, status);
```

---

## 4. Acciones por Plataforma

### 4.1 Instagram

| Acción | Rate limit | Riesgo ban | Implementación |
|---|---|---|---|
| Follow | 60/h, 200/día | Medio | Apify actor / phantom custom Philippe |
| Like | 60/h, 300/día | Bajo | Apify actor / phantom custom |
| Comment (LLM) | 20/h, 100/día | **Alto** | Apify actor custom + LLM templates |
| Story view | 100/h | Bajo | Apify actor |
| Unfollow | 60/h, 200/día | Medio | Apify actor (7-14 días post-follow) |
| View profile | Sin límite práctico | Muy bajo | Apify actor |
| **DM** | **PROHIBIDO** | **>90% ban** | **NO IMPLEMENTAR** |

### 4.2 LinkedIn

| Acción | Rate limit | Riesgo ban | Implementación |
|---|---|---|---|
| Connection request | 20/día, 100/semana | Medio | Playwright custom + residential proxy |
| Like post | 50/día | Bajo | Playwright custom |
| Comment post (LLM) | 15/día | Medio-Alto | Playwright custom + LLM templates |
| Profile view | 80/día | Bajo | Playwright custom |
| Follow company | 30/día | Bajo | Playwright custom |
| **InMail** | **PROHIBIDO** | **>90% ban** | **NO IMPLEMENTAR** |
| **NO fines de semana** | — | — | Scheduler respeta config |

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

### 5.3 Creación de secuencias

```python
def create_sequence(account, influencer, template):
    """Crea una secuencia de acciones para un influencer."""
    sequence_id = uuid4()
    base_date = now()
    
    for step in template.steps:
        action = BotAction(
            account_id=account.id,
            influencer_id=influencer.id,
            target_url=influencer.profile_url,
            target_username=influencer.username,
            action_type=step["action_type"],
            sequence_id=sequence_id,
            sequence_step=step["step"],
            scheduled_at=base_date + timedelta(days=step["day"]),
            status="queued"
        )
        # Si es comment → pre-generar texto con LLM
        if step["action_type"] == "comment":
            action.comment_text = await generate_comment(
                influencer, account.platform, brand_voice
            )
        db.add(action)
```

---

## 6. Comment Generation (LLM)

### 6.1 System prompt

```python
COMMENT_SYSTEM_PROMPT = """
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
"""
```

### 6.2 Ejemplos por estilo

| Estilo | Ejemplo |
|---|---|
| Pregunta | "¿Habéis visto cómo está evolucionando esto en el mercado español?" |
| Complemento | "Muy buen punto sobre la regulación, es lo que más está frenando la adopción" |
| Experiencia | "En nuestra experiencia el tema del open banking ha sido clave" |
| Dato | "El dato de crecimiento del 40% es impresionante, coincide con lo que estamos viendo" |
| Opinión | "Coincido al 100%, sobre todo con el tema de la personalización" |

### 6.3 Anti-detección

- **Nunca repetir** el mismo comment template en 7 días
- **Variación de largo** — entre 50-150 chars (no siempre max)
- **Idioma consistente** — siempre en el idioma del cliente (de Foundation)
- **Contexto real** — el LLM lee el post antes de comentar (no genérico)
- **Cache de comentarios** — guardar últimos 100 para evitar repeticiones
- **Rate limit LLM** — max 1 comment generation por minuto

---

## 7. Anti-Ban Strategy

### 7.1 Warm-up (21 días)

| Fase | Duración | Actividad |
|---|---|---|
| **Fase 0** | Días 1-7 | Solo browsing: scroll feed, ver perfiles, leer posts. CERO acciones |
| **Fase 1** | Días 8-14 | 20% de rate limits: ~40 likes/día, ~12 follows/día, 0 comments |
| **Fase 2** | Días 15-21 | 50% de rate limits: ~150 likes/día, ~30 follows/día, ~5 comments |
| **Full** | Día 22+ | 100% de rate limits según tabla §4 |

### 7.2 Delays

```python
import random

BASE_DELAY_SECONDS = 60  # entre acciones

def get_delay():
    """Delay aleatorio ±30% del base. Mínimo 45s."""
    jitter = random.uniform(-0.3, 0.3)
    delay = BASE_DELAY_SECONDS * (1 + jitter)
    return max(45, delay)

# Entre secuencias diferentes: 3-5 minutos
BETWEEN_SEQUENCE_DELAY = random.uniform(180, 300)
```

### 7.3 Horarios

| Plataforma | Horario activo | Fin de semana |
|---|---|---|
| Instagram | 9:00-22:00 hora local | ✅ Activo (menos intenso: 60% rate) |
| LinkedIn | 8:00-20:00 hora local | ❌ Inactivo |

### 7.4 Proxies

| Regla | Detalle |
|---|---|
| Tipo | **Residential SOLO** — datacenter = ban instantáneo |
| País | Mismo país que la cuenta |
| Sticky session | 30 minutos |
| Rotación | Nueva IP cada sesión (no cada acción) |
| 1 cuenta por IP | LinkedIn detecta clusters |
| Provider | Bright Data, IPRoyal, o similar |

### 7.5 Auto-pausa

```python
# Reglas de pausa automática
RULES = {
    "consecutive_failures": {
        "threshold": 3,
        "action": "pause",
        "duration_hours": 2,
        "reason": "3 fallos consecutivos"
    },
    "hourly_success_rate": {
        "threshold": 0.70,  # <70%
        "action": "pause",
        "duration_hours": 24,
        "reason": "success rate <70% en última hora"
    },
    "daily_rate_limits_hit": {
        "threshold": 3,  # 3 rate limits en un día
        "action": "pause",
        "duration_hours": 12,
        "reason": "demasiados rate limits"
    },
    "account_warning": {
        "threshold": 1,  # cualquier warning de la plataforma
        "action": "pause",
        "duration_hours": 72,
        "reason": "warning de la plataforma"
    }
}
```

### 7.6 Human patterns

Para parecer humano, el executor debe:
- **Scroll** el feed antes de hacer like (2-5 segundos)
- **Ver el perfil** antes de follow (3-8 segundos)
- **Leer el post** antes de comment (5-15 segundos, proporcional al largo)
- **Variar velocidad** de typing para comments (Playwright: `page.type(text, delay=random.uniform(50, 150))`)
- **No actuar en orden secuencial** — mezclar likes y follows

---

## 8. Flujos Operativos

### 8.1 Flujo principal

```
INFLUENCER DISCOVERY (Execution Engine)
  └── influencer_results (relevance_score > 50)
        │
        ▼
BOT SCHEDULER (cron cada 6h)
  ├── Filtra: platform, relevance_score, ya en secuencia activa?
  ├── Asigna cuenta bot disponible (round-robin por proyecto)
  ├── Crea secuencia (7 días IG / 10 días LI)
  └── Inserta bot_actions con scheduled_at
        │
        ▼
BOT EXECUTOR (worker, cada 5 min)
  ├── Lee bot_actions WHERE status='queued' AND scheduled_at <= now()
  ├── Verifica: cuenta activa? dentro de horario? daily_count < limit?
  ├── Ejecuta acción (Apify/Playwright)
  ├── Actualiza status, result, executed_at
  ├── Incrementa daily_action_count
  └── Si falla: retry_count++, re-schedule +2h, o skip si 3 retries
        │
        ▼
BOT MONITOR (cron cada 1h)
  ├── Calcula success_rate por cuenta
  ├── Aplica reglas de auto-pausa (§7.5)
  ├── Genera bot_metrics diarios
  └── Alerta Discord si pausa o anomalía
```

### 8.2 Flujo de warm-up

```
NUEVA CUENTA REGISTRADA
  └── status = 'warming_up', warmup_phase = 0
        │
        ▼
WARM-UP SCHEDULER (diario)
  ├── Fase 0 (días 1-7): solo browsing tasks
  ├── Fase 1 (días 8-14): acciones al 20%
  ├── Fase 2 (días 15-21): acciones al 50%
  └── Día 22: status = 'active', warmup_phase = null
```

### 8.3 Flujo de unfollow (IG)

```
CRON DIARIO — UNFOLLOW CHECK
  ├── Busca follows con >14 días sin follow-back
  ├── Max unfollows/día = 50% de follows del día
  ├── Nunca unfollow el mismo día que se hizo follow
  └── Crea bot_actions tipo 'unfollow' con delay entre ellas
```

---

## 9. Integraciones Externas

### 9.1 APIs y servicios

| Servicio | Uso | Config | Quién paga |
|---|---|---|---|
| **Apify** | IG: follow, like, comment, story, unfollow | `APIFY_TOKEN` | Sancho (sistema) |
| **Bright Data** (o similar) | Residential proxies | `BRIGHTDATA_*` | Sancho (sistema) |
| **OpenRouter** | Comment generation (LLM) | `OPENROUTER_API_KEY` | Sancho (sistema) |
| **Playwright** | LinkedIn automation | Incluido en Docker | — |
| **Philippe phantom custom** | IG: secuencia custom | TBD (Philippe pasa código) | — |

### 9.2 Phantom custom de Philippe (IG)

> **PENDIENTE**: Philippe debe pasar el código del phantom custom.

Lo que sabemos:
- Acciones: follow, like, comment, unfollow, story view
- Secuencia 7 días definida
- Anti-ban: warm-up 21 días, delays 45-90s, horarios 9-22h
- Pausa auto si <70% success rate
- NO DMs

**Integración**: El phantom custom se integra como alternativa a los Apify actors para IG. El Bot Engine debe soportar ambos executors (Apify y phantom) y elegir según config del proyecto.

---

## 10. Integración con SanchoCMO

### 10.1 Dashboard (Mission Control)

**Sección "Engagement Bots"** en MC:

```
┌─────────────────────────────────────────────┐
│  🤖 Engagement Bots                         │
│                                             │
│  Instagram                                  │
│  ├── @cuenta_ig  ● Active (142 actions/day) │
│  │   Follow-back rate: 12.3%                │
│  │   Secuencias activas: 8                  │
│  │   [Pausar] [Ver métricas]                │
│  │                                          │
│  LinkedIn                                   │
│  ├── @cuenta_li  ● Active (35 actions/day)  │
│  │   Connection rate: 28.1%                 │
│  │   Secuencias activas: 5                  │
│  │   [Pausar] [Ver métricas]                │
│  │                                          │
│  📊 Últimos 7 días                          │
│  Follows: 156 | Follow-backs: 19 (12.2%)   │
│  Likes: 420 | Comments: 34                  │
│  Connections: 45 | Accepted: 13 (28.9%)     │
└─────────────────────────────────────────────┘
```

### 10.2 Discord notifications

```
Notificaciones en hilo del canal del cliente:

✅ Daily digest (automático, mañana):
"🤖 Bot IG: 42 likes, 8 follows, 2 comments. Follow-back rate: 11.2%"

⚠️ Alertas (inmediato):
"⚠️ Bot IG @cuenta pausado: success_rate <70%. Revisión automática en 24h."

🚫 Ban (inmediato):
"🚫 Bot IG @cuenta detectó warning de Instagram. Pausado 72h."
```

### 10.3 Crons en Sancho

| Cron | Frecuencia | Qué hace |
|---|---|---|
| `bot-scheduler` | Cada 6h | Crea nuevas secuencias desde influencer_results |
| `bot-executor` | Cada 5 min | Ejecuta acciones queued |
| `bot-monitor` | Cada 1h | Success rate, auto-pausa, métricas |
| `bot-daily-digest` | Diario 9:00 | Resumen Discord por cliente |
| `bot-unfollow-check` | Diario 14:00 | Programa unfollows IG |

---

## 11. Skills de Sancho

### 11.1 Skills nuevos

| Skill | Descripción |
|---|---|
| `instagram-engagement` | Gestiona bot IG: ver cuentas, pausar/resume, métricas, añadir targets manuales |
| `linkedin-engagement` | Gestiona bot LI: ver cuentas, pausar/resume, métricas, añadir targets manuales |
| `bot-manager` | Skill admin: overview de todas las cuentas, todos los clientes, health check |

### 11.2 Comandos del skill `instagram-engagement`

```
/ig-engagement status          → Estado de cuentas IG del cliente
/ig-engagement pause @cuenta   → Pausa una cuenta
/ig-engagement resume @cuenta  → Resume una cuenta
/ig-engagement metrics 7d      → Métricas últimos 7 días
/ig-engagement add-target @user → Añade target manual a la queue
```

### 11.3 Comandos del skill `linkedin-engagement`

```
/li-engagement status           → Estado de cuentas LI del cliente
/li-engagement pause @cuenta    → Pausa una cuenta
/li-engagement resume @cuenta   → Resume una cuenta
/li-engagement metrics 7d       → Métricas últimos 7 días
/li-engagement add-target @user → Añade target manual a la queue
```

---

## 12. Multi-Cliente

### 12.1 Qué necesita cada cliente

| Requisito | Obligatorio | Quién lo provee |
|---|---|---|
| Cuenta IG (username + session) | Sí (para bot IG) | **Cliente** |
| Cuenta LinkedIn (session) | Sí (para bot LI) | **Cliente** |
| Proxy residential dedicado | Sí | **Sancho (sistema)** |
| Influencer Discovery ejecutado | Sí | **Execution Engine** |
| Foundation completa (brand_voice) | Recomendado | **Sancho Foundation** |
| Config de horarios/timezone | Recomendado | **Cliente** via MC |

### 12.2 Onboarding de bot para un cliente

```
1. Cliente proporciona credenciales IG/LI via Mission Control (seguro, encriptado)
2. Sancho crea bot_account con status='warming_up'
3. Configura proxy residential (mismo país)
4. Warm-up automático 21 días
5. Día 22: status='active', empiezan secuencias
6. Daily digest en Discord del cliente
```

### 12.3 Aislamiento

- **Cada cliente tiene sus propias cuentas** — nunca compartidas
- **Cada cuenta tiene su propio proxy** — nunca compartido
- **Métricas separadas** por project_id
- **Session data encriptada** en DB (AES-256 o similar)
- **Credenciales NUNCA pasan por Discord** — siempre via MC seguro

### 12.4 Lo que Sancho pone "de base"

| Servicio | Base incluida | Límite |
|---|---|---|
| Apify compute | 30k units/mes (compartido) | ~2 cuentas IG activas |
| Proxies | Pool compartido | 1 IP dedicada por cuenta |
| OpenRouter (comments) | ~500 comments/mes/cliente | ~$5/mes |
| Monitoring + alertas | Incluido | — |

---

## 13. Criterios de Aceptación

### CA-01: Scheduler
- [ ] Lee influencer_results con relevance_score > 50
- [ ] Crea secuencias correctamente (7 días IG, 10 días LI)
- [ ] No duplica secuencias para el mismo influencer+cuenta
- [ ] Respeta daily limits al programar

### CA-02: Executor IG
- [ ] Follow funciona via Apify/phantom
- [ ] Like funciona (1-3 posts)
- [ ] Comment se genera con LLM y se publica
- [ ] Story view funciona
- [ ] Unfollow funciona (14+ días post-follow)
- [ ] Delays aleatorios entre acciones (min 45s)
- [ ] Solo actúa en horario configurado

### CA-03: Executor LI
- [ ] Profile view funciona via Playwright
- [ ] Connection request con nota personalizada
- [ ] Like funciona
- [ ] Comment se genera con LLM y se publica
- [ ] NO actúa fines de semana
- [ ] Delays aleatorios entre acciones (min 45s)

### CA-04: Anti-ban
- [ ] Warm-up 21 días: 3 fases correctas
- [ ] Auto-pausa por 3 fallos consecutivos (2h)
- [ ] Auto-pausa por success_rate <70% (24h)
- [ ] Auto-pausa por warning de plataforma (72h)
- [ ] Proxies residential, mismo país

### CA-05: Monitoring
- [ ] bot_metrics se generan diariamente
- [ ] Daily digest en Discord
- [ ] Alertas inmediatas por pausa/ban
- [ ] Dashboard MC muestra estado y métricas

### CA-06: Multi-cliente
- [ ] Aislamiento completo: cuentas, proxies, métricas
- [ ] Session data encriptada
- [ ] Funciona para ≥2 clientes simultáneos

### CA-07: Comment LLM
- [ ] Comments son naturales (no genéricos)
- [ ] Usa brand_voice del cliente
- [ ] No repite mismo comment en 7 días
- [ ] Largo variable (50-150 chars)
- [ ] Idioma correcto (del cliente)

---

## 14. Riesgos

| Riesgo | Impacto | Probabilidad | Mitigación |
|---|---|---|---|
| **Ban de cuenta** | Alto — cliente pierde cuenta | Media-Alta | Warm-up 21 días, rate limits conservadores, auto-pausa, proxies residential |
| **LinkedIn detecta Playwright** | Alto — ban permanente | Media | Stealth plugins, fingerprint estable, residential proxy, human patterns |
| **Apify actors deprecated** | Medio — IG executor no funciona | Baja | Phantom custom de Philippe como fallback |
| **Proxy IP bloqueada** | Medio — acciones fallan | Media | Pool de IPs, rotación, sticky session |
| **Costos escalan** | Medio — margen se reduce | Media | Caps por cliente, monitoring de uso |
| **LLM genera comment inapropiado** | Alto — daño reputacional | Baja | Review de primeros 50 comments, guardrails en prompt |
| **Credenciales comprometidas** | Crítico | Baja | Encriptación AES-256, MC seguro, no Discord |
| **Rate limits de plataforma cambian** | Medio | Media | Config flexible, monitoring de success_rate |

---

## 15. Costos

### 15.1 Por cliente/mes

| Concepto | Costo estimado | Notas |
|---|---|---|
| Apify (IG) | ~$49/mes | Plan Starter (30k compute units) — compartible entre 2 cuentas |
| Residential proxies | ~$75/mes | Bright Data o similar, 5GB, 2 IPs dedicadas |
| VPS (executor) | ~$20/mes | Compartido entre clientes (escala con # cuentas) |
| OpenRouter (comments LLM) | ~$5/mes | ~500 comments × $0.01 |
| **Total base por cliente** | **~$149/mes** | |

### 15.2 Precio al cliente

| Plan | Incluye | Precio sugerido |
|---|---|---|
| **Engagement Basic** | 1 plataforma (IG o LI) | $149-199/mes |
| **Engagement Pro** | IG + LI | $249-299/mes |
| **Engagement Enterprise** | IG + LI + targets manuales + prioridad | $399-499/mes |

### 15.3 Escalado

- Hasta 5 clientes: 1 VPS ($20/mes compartido)
- 5-20 clientes: 2 VPS ($40/mes)
- 20+ clientes: Kubernetes o similar

---

## 16. Estimación

| Tarea | Esfuerzo |
|---|---|
| Modelo de datos (migraciones SQL) | 1 día |
| Bot Scheduler | 2-3 días |
| IG Executor (Apify) | 2-3 días |
| IG Executor (phantom custom Philippe) | 1-2 días (adaptar) |
| LI Executor (Playwright) | 3-5 días |
| Comment Generator (LLM) | 1 día |
| Anti-ban engine (warm-up, pausa, delays) | 2-3 días |
| Monitor + métricas | 1-2 días |
| Crons Sancho | 1 día |
| Skills (instagram-engagement, linkedin-engagement) | 2-3 días |
| Dashboard MC | 2-3 días |
| Test E2E con 1 cuenta real | 5-7 días (incluye warm-up) |
| **Total dev** | **~3-4 semanas** |
| **Total hasta producción** | **~6-7 semanas** (incluye warm-up 21 días de test) |

---

## 17. Lo que NO hacer

| ❌ No | Razón |
|---|---|
| **NO automatizar DMs** | Tasa de ban >90% en ambas plataformas |
| **NO usar datacenter proxies** | Detectados al instante |
| **NO más de 1 cuenta por IP** | LinkedIn detecta clusters |
| **NO comentarios genéricos** ("Great post! 🔥") | Flagged como bot |
| **NO acciones en paralelo** | Una acción a la vez por cuenta |
| **NO escalar antes de validar** | Probar con 1 cuenta 30 días antes de añadir más |
| **NO compartir sesiones entre clientes** | Aislamiento obligatorio |
| **NO guardar credenciales en Discord/chat** | Solo via MC encriptado |
| **NO ignorar warnings de plataforma** | Pausa inmediata 72h |
| **NO hacer follow+unfollow mismo día** | Detección inmediata |

---

## 18. Decisiones Pendientes

| # | Tema | Opciones | Recomendación | Decide |
|---|---|---|---|---|
| **DP-1** | Phantom custom IG vs Apify only | a) Solo Apify, b) Solo phantom, c) Ambos (selector) | c) Ambos — Apify para MVP, phantom como upgrade | Philippe + Alfonso |
| **DP-2** | VPS provider | Hetzner ($4/mo) / DigitalOcean ($6/mo) / Railway | Hetzner (mejor precio/rendimiento en EU) | Alfonso |
| **DP-3** | Proxy provider | Bright Data / IPRoyal / Smartproxy | Bright Data (más fiable, mejor API) | Alfonso |
| **DP-4** | LinkedIn: Playwright vs API oficial | a) Playwright (gratis, riesgo), b) LinkedIn API (pagada, limitada) | a) Playwright para MVP — API oficial no permite engagement | Philippe |
| **DP-5** | Scheduler: APScheduler vs Sancho crons | a) APScheduler en Docker (autónomo), b) Sancho crons (centralizado) | a) APScheduler — bot engine debe ser autónomo | Philippe + Cervantes |
| **DP-6** | Encriptación de session_data | a) AES-256 app-level, b) Supabase RLS + pgcrypto, c) Vault | b) pgcrypto — ya en Supabase, sin complejidad extra | Cervantes |
| **DP-7** | Philippe pasa código phantom | Necesario para evaluar integración | Bloquea Hilo 7 (IG executor custom) | Philippe |
| **DP-8** | ¿Cuántas cuentas por cliente MVP? | 1 IG + 1 LI / múltiples | 1+1 para MVP, escalar después | Alfonso |

---

## Apéndice A: Relación con otros PDRs

| PDR | Relación |
|---|---|
| **T-050** (Execution Engine) | Bot Engine consume `influencer_results` de T-050. Foundation data (brand_voice) para comments. |
| **T-029** (Campañas) | Bot engagement es un "canal" dentro de la estructura de campañas. |
| **Influencer Discovery** (RF-14 en T-050) | Fuente primaria de targets para los bots. |

## Apéndice B: Métricas de éxito

| Métrica | Target MVP | Target 6 meses |
|---|---|---|
| Follow-back rate (IG) | >8% | >12% |
| Connection accept rate (LI) | >20% | >30% |
| Ban rate | <5% cuentas/mes | <2% cuentas/mes |
| Uptime executor | >95% | >99% |
| Comment quality (human review) | >80% naturales | >90% naturales |

---

*PDR generado el 2026-03-22. Versión 1.0.*
*Extraído de: T-050 (PDR Consolidado §8, §10 Hilo 6-8), escudero-bot-spec.md*
*Autor: Cervantes*
