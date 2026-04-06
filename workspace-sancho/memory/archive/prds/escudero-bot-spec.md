# Spec — Bots Instagram + LinkedIn

**Status:** Propuesta inicial — nada codeado
**Prioridad:** P2 (después de Audit + Content)

---

## 1. Objetivo

Automatizar interacciones orgánicas para aumentar visibilidad de los clientes en IG y LinkedIn. NO es spam — es engagement estratégico con perfiles relevantes descubiertos por el Influencer Discovery engine de Escudero.

---

## 2. Acciones por plataforma

### Instagram

| Acción | Rate limit | Riesgo ban | Implementación |
|---|---|---|---|
| Follow | 60/hora, 200/día | Medio | Apify actor `apify/instagram-follow` |
| Like | 60/hora, 300/día | Bajo | Apify actor `apify/instagram-like` |
| Comment | 20/hora, 100/día | Alto | Apify actor custom + templates |
| Unfollow | 60/hora, 200/día | Medio | Apify actor (7-14 días después del follow) |
| **DM** | **PROHIBIDO** | **Muy alto** | **No implementar** |
| Story view | 100/hora | Bajo | Apify actor `apify/instagram-story-viewer` |

### LinkedIn

| Acción | Rate limit | Riesgo ban | Implementación |
|---|---|---|---|
| Connection request | 20/día, 100/semana | Medio | Playwright custom + residential proxy |
| Like post | 50/día | Bajo | Playwright custom |
| Comment post | 15/día | Medio-Alto | Playwright custom + templates LLM |
| Profile view | 80/día | Bajo | Playwright custom |
| **InMail** | **PROHIBIDO** | **Muy alto** | **No implementar** |
| Follow company | 30/día | Bajo | Playwright custom |

---

## 3. Flujo operativo

```
1. Escudero Influencer Discovery
   → Encuentra influencers relevantes (YouTube, IG, LinkedIn)
   → Guarda en influencer_results (profile_url, platform, relevance_score)

2. Bot Scheduler (NUEVO)
   → Lee influencer_results con relevance_score > 50
   → Crea queue de acciones: follow → like 3 posts → comment 1 post
   → Espaciado: 1-3 minutos entre acciones, delay aleatorio ±30%

3. Bot Executor (NUEVO)
   → Ejecuta acciones de la queue
   → Usa sesión persistente (cookies) por cuenta
   → Residential proxy rotativo por cuenta
   → Log de cada acción (éxito/fallo/rate-limited)

4. Bot Monitor (NUEVO)
   → Dashboard: acciones/día, follows pendientes, unfollows programados
   → Alertas: si action_success_rate < 80% → pausar cuenta 24h
   → Métricas: follow-back rate, engagement rate por target
```

---

## 4. Arquitectura técnica

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Escudero   │────►│  Bot Scheduler   │────►│  Queue (DB)  │
│  Influencer │     │  (Cron cada 6h)  │     │  bot_actions │
│  Discovery  │     └──────────────────┘     └──────┬──────┘
└─────────────┘                                      │
                                                     ▼
                    ┌──────────────────┐     ┌──────────────┐
                    │  Bot Monitor     │◄────│ Bot Executor  │
                    │  (Dashboard)     │     │ (Worker)      │
                    └──────────────────┘     └──────┬───────┘
                                                     │
                                              ┌──────┴──────┐
                                              │  Proxies    │
                                              │  Residential│
                                              │  + Sessions │
                                              └─────────────┘
```

---

## 5. Modelo de datos (nuevo)

### Tabla: `bot_accounts`

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID PK | |
| client_id | FK → projects | Qué cliente usa esta cuenta |
| platform | String(20) | instagram, linkedin |
| username | String(255) | |
| session_data | JSONB | Cookies, tokens, estado de sesión |
| proxy_config | JSONB | `{provider, country, sticky_session_id}` |
| status | String(20) | active, paused, banned, warming_up |
| daily_action_count | Integer | Reset cada 24h |
| last_action_at | DateTime | |
| created_at | DateTime | |

### Tabla: `bot_actions`

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID PK | |
| account_id | FK → bot_accounts | |
| influencer_id | FK → influencer_results | Target |
| action_type | String(20) | follow, like, comment, unfollow, view_story, connection_request |
| status | String(20) | queued, executing, completed, failed, rate_limited |
| scheduled_at | DateTime | Cuándo ejecutar |
| executed_at | DateTime | Cuándo se ejecutó |
| result | JSONB | `{success, error_code, response}` |
| comment_text | Text, nullable | Si action_type=comment |

### Tabla: `bot_metrics`

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID PK | |
| account_id | FK → bot_accounts | |
| date | Date | |
| follows_sent | Integer | |
| follows_back | Integer | |
| likes_sent | Integer | |
| comments_sent | Integer | |
| actions_failed | Integer | |
| success_rate | Float | |

---

## 6. Comment templates (LLM-generated)

Para evitar detección, los comments se generan con LLM basándose en el post:

```python
COMMENT_SYSTEM_PROMPT = """
Genera un comentario natural para un post de {platform}.
Reglas:
- 1-2 frases, máximo 150 caracteres
- Tono genuino, NO promocional
- NO emojis excesivos (máx 1)
- NO links ni menciones de marca
- Varía el estilo: pregunta, complemento, experiencia personal
- Idioma: {language}
"""
```

Ejemplo input: Post sobre "tendencias fintech 2026"
Ejemplo outputs:
- "Muy buen punto sobre la regulación, es lo que más está frenando la adopción"
- "¿Habéis visto cómo está evolucionando esto en el mercado español?"
- "Coincido al 100%, sobre todo con el tema de open banking"

---

## 7. Anti-ban strategy

| Medida | Detalle |
|---|---|
| **Warm-up** | Cuenta nueva: 7 días solo browsing, 7 días con 20% de rate limits, full a día 21 |
| **Delays** | Base delay × (1 + random(-0.3, 0.3)). Mínimo 45s entre acciones |
| **Horarios** | Solo actuar 9:00-22:00 hora local. NO fines de semana para LinkedIn |
| **Proxies** | Residential, mismo país que la cuenta. Sticky session 30min |
| **Fingerprint** | User-agent rotativo pero consistente por sesión. Canvas/WebGL fingerprint estable |
| **Pausas** | Si 3 acciones fallan seguidas → pausa 2h. Si success_rate <70% en 1h → pausa 24h |
| **Unfollow** | Nunca el mismo día que follow. Esperar 7-14 días. Max 50% de follows/día |
| **Human patterns** | Scroll antes de like. Ver perfil antes de follow. Leer post antes de comment |

---

## 8. Costos estimados

| Concepto | Costo/mes | Notas |
|---|---|---|
| Apify (IG) | ~$49/mo | Plan Starter (30k compute units) |
| Residential proxies | ~$75/mo | Bright Data o similar, 5GB |
| Servidor bot executor | ~$20/mo | VPS con Playwright |
| OpenRouter (comments LLM) | ~$5/mo | ~500 comments × $0.01 |
| **Total por cliente** | **~$149/mo** | |

---

## 9. Lo que NO hacer

- **NO automatizar DMs** — tasa de ban >90% en ambas plataformas
- **NO usar datacenter proxies** — detectados al instante
- **NO más de 1 cuenta por IP** — LinkedIn detecta clusters
- **NO comentarios genéricos** ("Great post! 🔥") — flagged como bot
- **NO acciones en paralelo** — una acción a la vez por cuenta
- **NO escalar antes de validar** — probar con 1 cuenta 30 días antes de añadir más
