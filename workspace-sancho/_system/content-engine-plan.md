# Plan: SanchoCMO Content Engine (Sistema end-to-end de creación de contenido)

## Context

Alfonso (CGO Growth Systems, brand SanchoCMO) publica en LinkedIn, Blog SEO, Newsletter y X de forma ad-hoc. Falta sistema, banco de ideas, ángulos pre-pensados, reutilización de POV de reuniones. Resultado: inconsistencia, fricción, contenido que no compone autoridad ni convierte.

**Home:** Repo SanchoCMO (`Growth4U-systems/sanchocmo-openclaw`).

- **GitHub repo** = la app **Next.js (UI)** + `skill-repos/` (referencias) + `workspace-sancho/` (contexto/agentes). NO contiene SKILL.md como código.
- **Export local** `01-business/frameworks/sanchocmo-framework-export/skills/` = donde viven actualmente las 39 SKILL.md (markdown + JSON, no ejecutables). Es la fuente de verdad operativa hoy.
- **Plan asume**: las skills nuevas se crean en el mismo árbol del export (mismo formato SKILL.md). Cuando el equipo decida migrarlas al repo GitHub bajo un dir canónico (ej. `skills/`), el plan acompaña sin cambios estructurales — solo path. Los paths de este plan son relativos a `<sancho-skills-root>/` (sea export local o futuro `skills/` en repo).

**El sistema vive como skills + UI.** Las skills son el motor (back-end). **Sancho UI (Next.js app) es el cockpit completo del sistema — no solo redacción.** En la UI el humano:

- Ve la **Foundation** ejecutada (Brand Voice, Positioning, ECPs, competitive landscape).
- Define y revisa la **Content Strategy** (Capa 00 funnel + KPIs norte).
- Ve los **Content Pillars** activos, los edita, versiona, y trigerea revisiones.
- Ve los **Input Systems** y su configuración por pillar (news prompts, paa queries, keywords seed, competitors, schedules).
- Consulta la **base de datos de inputs** (research-signals) — busca, filtra, marca relevantes.
- Ve la **Idea Queue completa** (no solo las propuestas del día) — descarta, prioriza, edita angles.
- Ve el **Editorial Calendar** (cadencia + slots + qué se va a publicar próximos días).
- Trabaja la **redacción** como proyecto/tarea: hilos por día, cards de drafts, Clarify embebido, edit inline.
- Ve **Performance** (dashboard mensual KPIs norte + operativos).

Skills ejecutan; UI muestra y edita estado. **Todas las skills se diseñan UI-compatible desde día 1**: outputs estructurados (JSON+MD) consumibles por Next.js. Si la UI no está lista para alguna vista, hay fallback temporal a archivos editables manualmente.

**Multi-tenant:** SanchoCMO sirve N clientes. Configs (pillars, prompts, cadencia, business_model, sector) se parametrizan por `client_id`.

**Almacenamiento:** SanchoCMO es **100% file-based** (Markdown + JSON) según `_system/brand-memory.md`. Nada en Notion como DB. Notion solo como input de transcripts vía `meeting-intelligence`.

---

## Pre-requisitos para ejecutar este plan (contexto de transferencia)

Este plan se diseñó en una máquina y se va a ejecutar en otra. Para que la otra máquina/cuenta de Claude tenga contexto suficiente, antes de empezar Fase 1 verificar:

**1. Acceso al repositorio de skills SanchoCMO**
- Repo SanchoCMO clonado y accesible. Path al `<sancho-skills-root>/` identificado (sea export `sanchocmo-framework-export/skills/` o futuro `skills/` dentro del repo Next.js).
- Las 39 skills existentes están todas presentes (verificar con `ls <sancho-skills-root>/`).

**2. Foundation ya ejecutada para el cliente Alfonso (input cero)**
- `company-context` ejecutada — output legible.
- `niche-discovery-100x` + `ecp-validation` ejecutadas — ICPs identificados.
- `positioning-messaging` ejecutada — output con per-niche content pillars seed (step 7) disponible.
- `brand-voice` Layer 4 ejecutada — `voice-profile.md` + AI Brand Kit disponibles.
- `foundation-orchestrator` accesible para registrar nuevos pillars en el DAG.

**3. Credenciales / accesos externos**
- **Brave Search API** o **Perplexity API** (key) → `news-monitor`.
- **DataforSEO API** (key) → `paa-monitor`, `keyword-research`.
- **Slack** webhook + bot token → Idea Approval Loop. Alternativamente Discord bot token o Telegram bot — el cliente decide en Setup.
- **Metricool API** (key) → publicación.
- **Notion API** (token) — opcional, solo si se quiere usar `meeting-intelligence` con Notion como fuente.
- **LinkedIn / Instagram scraping** (TBD V2) — Phantombuster, Bright Data o similar.

**4. SanchoCMO Next.js app (UI)**
- Repo `Growth4U-systems/sanchocmo-openclaw` clonado. Estado actual: hasta dónde llega la UI determina cuáles vistas Capa 4 están listas vs requieren fallback temporal a archivos editables. Verificar al arrancar Fase 2 qué vistas están y cuáles no.

**5. Workspace por cliente**
- Estructura `./brand/`, `./content/configs/`, `./content/research-signals/`, `./content/published/` creada bajo el workspace cliente. SanchoCMO ya tiene convención (ver `_system/brand-memory.md`).

**6. Schedulers (host de ejecución)**
- Acceso a un sistema de cron en la máquina de ejecución (launchd macOS, cron Linux). Ya existe `.claude/scheduler-scripts/` en proyectos previos del usuario; el patrón es el mismo, solo replicarlo en el host nuevo.

**7. Context handoff**
- Este archivo (`quiero-que-me-sigas-velvety-rossum.md`) es la única entrega de contexto entre máquinas. No depender de ninguna otra `memory/` o `MEMORY.md` de máquinas previas. Toda decisión, motivación y arquitectura está aquí.

---

## Objetivo del sistema

**Premisa SanchoCMO: todo sistema debe contribuir a traer nuevos clientes.**

Adapta según `business_model`:

**B2B (Alfonso):** Demand creation + capture quirúrgico.
- Top (LinkedIn + X, ~80%): **ungated**, autoridad y demanda.
- Mid (Newsletter): audiencia propia → meeting.
- Bottom (Blog SEO): **gated** con LMs tipo audit/calculator + CTA "book diagnostic call".
- Norte: % inbound calls citando contenido + newsletter ICP-fit + pipeline influenced.

**B2C:** Email-capture-led.
- Top (Social, ungated): autoridad + audiencia.
- Mid (Email): LM **central** (free 5-day course, plantilla) gateado.
- Bottom: producto digital, cohort.
- Norte: subs ICP-fit + ventas + retention.

**Hybrid:** combinación según `funnel_role` por pillar.

**LMs:** el sistema decide gatear o no según `business_model × funnel_role × channel`. En B2B Alfonso, LinkedIn/X NUNCA se gatean.

---

## Principios

- **Encajar dentro de SanchoCMO, multi-tenant, file-based, UI-compatible.**
- **Pillars = temas, no POV.** El POV se decide **por pieza** durante el angle/clarify.
- **Inputs alineados con Pillars + Sector + Client.**
- **Setup primero, automatización después.** Primera vez por cliente: workshop de configuración. Después: crons + automatización.
- **Push > pull.** Sancho propone, humano elige.
- **2 aprobaciones humanas distintas:** (1) Idea approval en Slack/Discord — lightweight: solo Sí/Más tarde/No + link a Sancho UI. (2) TODO el resto del trabajo del sistema (Foundation, Strategy, Pillars, Inputs config, Research Signals, Idea Queue, Calendar, Clarify + Draft + edit + approve, Performance) ocurre **dentro de Sancho UI**.
- **Clarify nunca se salta.** Confianza alta = mejores predicciones, no skip. Siempre se le ofrece al humano confirmar o ajustar.
- **Reusar antes de crear.**

---

## Skills existentes — reuso

| Skill (path: `sanchocmo-framework-export/skills/`) | Rol | Estado |
|---|---|---|
| `foundation-orchestrator` | DAG; registra `content-pillars` | ✅ |
| `brand-voice` | POV Bank base; consolidación POV mensual | ✅ |
| `positioning-messaging` | POV por ECP (input para pillars) | ✅ |
| `meeting-intelligence` | Transcripts → quotes (OPCIONAL en pillars) | ⚠️ nunca probada |
| `daily-pulse` | Inteligencia interna diaria (Slack/Notion/transcripts) | ⚠️ funcional sin cron |
| `thief-marketers` | Inteligencia competidor — **base para refactor competitor-monitor** | ✅ refactor |
| `keyword-research` | **Reuso para blog SEO targeting** (separada de PAA) | ✅ |
| `content-miner` | Clasifica insights en 7 signals — **renombrar `insight-classifier`** | ⚠️ |
| `insight-to-content-mapper` | Insight → angle pre-escrito | ✅ extender |
| `content-calendar-planner` | Cadencia + dispatch | ✅ extender |
| `seo-content` | Blog SEO long-form | ✅ extender +clarify |
| `newsletter` | Canal Newsletter | ✅ extender +clarify |

`content-atomizer` queda **fuera** del flujo principal (es repurposing). `daily-pulse` y `meeting-intelligence` no se solapan: pulse escanea TODO el mundo interno (Slack + Notion + transcripts + manual); meeting-intelligence es específica de transcripts. Pulse puede usar a meeting-intelligence como fuente.

---

## ¿Usar `meeting-intelligence` en la definición de pillars? — Pros/Cons

**PRO incluirlo:**
- Dolores reales y frescos directo de conversaciones con clientes (alta señal).
- Quotes con atribución (citables luego en pieces).
- Diferencia el pillar de uno teórico (HubSpot/McKinsey) — ata a realidad operativa.

**CON incluirlo:**
- Muchos clientes nuevos NO tienen transcripts (cliente que arranca con SanchoCMO).
- Añade dependencia a `meeting-intelligence` (que aún no está probada).
- Foundation ya genera dolores vía `positioning-messaging` y `ecp-validation` — puede ser suficiente.
- Ralentiza el setup inicial.

**Decisión:** **OPCIONAL, no requerido.** `content-pillars` skill detecta si hay transcripts disponibles. Si sí: enriquece con quotes. Si no: usa solo Foundation (positioning + ECPs) sin penalizar al cliente. Resultado: pillars siempre se pueden definir; quien tenga transcripts gana señal extra.

---

## Skills NUEVAS (4)

| Skill | Path | Rol |
|---|---|---|
| `content-pillars` | `.../skills/content-pillars/` | Define + mantiene pillars (TEMAS, sin POV) |
| `news-monitor` | `.../skills/news-monitor/` | Multi-tenant prompt-driven news monitor |
| `paa-monitor` | `.../skills/paa-monitor/` | People Also Ask (separada de keyword-research) |
| `social-writer` | `.../skills/social-writer/` | LinkedIn + X originales con Clarify embebido |

**Skills existentes a refactorizar/extender:**

| Skill | Cambio |
|---|---|
| `content-miner` | Renombrar a `insight-classifier` |
| `thief-marketers` | Refactor: extraer competidores de Foundation, monitorear sus redes (LinkedIn, Instagram, blog) buscando "top 5 contenidos mejor performando 7 días". Incluir founders/personas referencia. |
| `daily-pulse` | Conectar cron + 5 días reales |
| `meeting-intelligence` | Probar end-to-end (1 transcript) — **OPCIONAL en flujo pillar** |
| `keyword-research` | Reuso para blog SEO targeting — sin cambio |
| `insight-to-content-mapper` | Output `angle_draft` 1-2 párrafos |
| `content-calendar-planner` | Recency-aware + dispatch a Idea Approval Loop |
| `seo-content` | Embeber Clarify (sigue `_system/clarify-protocol.md`) |
| `newsletter` | Embeber Clarify |
| `foundation-orchestrator` | Registrar `content-pillars` |

**Sistema/protocolos:**
- `_system/clarify-protocol.md` (NEW) — flujo Clarify-en-redacción compartido.
- `_system/idea-approval-protocol.md` (NEW) — flujo aprobación de ideas en Slack/Discord.

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────────┐
│  CAPA 00 — OBJETIVO/FUNNEL (driven by business_model)         │
└──────────────────────────┬───────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│  CAPA 0 — CONTENT PILLARS [content-pillars NEW]               │
│  Pillars = TEMAS. POV NO vive aquí. Output: pillars.md        │
└──────────────────────────┬───────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│  CAPA 0.5 — SETUP (NEW, primera vez por cliente)              │
│  Para cada pillar genera: prompts news, queries PAA,          │
│  keywords seed, lista competidores (de Foundation),   │
│  fuentes RSS, perfiles founders. Guarda configs por cliente.  │
│  Después: crons + steady state.                               │
└──────────────────────────┬───────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│  CAPA 1 — INPUT LAYER (todos parametrizados por client+pillar)│
│  • news-monitor [NEW]      ← prompts por pillar               │
│  • paa-monitor [NEW]       ← People Also Ask (preguntas)      │
│  • keyword-research [exist]← keywords blog SEO (separada)     │
│  • thief-marketers [refactor]← competidores: top contenidos   │
│  • daily-pulse [exist+cron]← inteligencia interna             │
│  • meeting-intelligence    ← transcripts (opcional)           │
│  • insight-classifier      ← clasifica en 7 signals           │
│  ⚠ outreach signals: out of scope                             │
└──────────────────────────┬───────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│  CAPA 2 — HUB CENTRAL                                         │
│  • ./brand/content-pillars.md                                 │
│  • ./content/research-signals/YYYY-MM-DD-{type}.json          │
│  • ./content/idea-queue.json (ideas con signal+angle)         │
│  • Neon pov_* tables (POV Bank + Clarify patterns)            │
│  insight-to-content-mapper [extend] → angle_draft             │
└──────────────────────────┬───────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│  CAPA 3 — EDITORIAL CALENDAR [content-calendar-planner ext.]  │
│  Recency-aware. Selecciona N ideas/día/canal según cadencia. │
└──────────────────────────┬───────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│  CAPA 3.5 — IDEA APPROVAL LOOP (Slack/Discord lightweight)    │
│  Sancho propone N ideas → humano marca [✅][⏰][❌]              │
│  ✅ → link al hilo del día en Sancho UI. NADA más en Slack.    │
└──────────────────────────┬───────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│  CAPA 4 — REDACCIÓN (100% dentro de Sancho UI)                │
│  Por cada idea ✅:                                             │
│   1. Clarify SIEMPRE (no se salta) — predicciones+confianza   │
│   2. Writer genera draft (social-writer/seo-content/newsletter)│
│   3. Card en hilo del día — edit inline o instrucciones       │
│   4. Approve → Metricool                                       │
└──────────────────────────┬───────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│  CAPA 5 — PUBLICACIÓN — METRICOOL                             │
└──────────────────────────┬───────────────────────────────────┘
                           ↓ ↓
                           ↓ └→ clarify-history → brand-voice (mensual)
                           ↓
┌──────────────────────────────────────────────────────────────┐
│  CAPA 6 — PERFORMANCE LOOP                                    │
└──────────────────────────────────────────────────────────────┘
```

---

## Capa 0 — Content Pillars

**Pillars = TEMAS de los que hablar.** No tienen POV propio. El POV vive a nivel pieza (decisión durante angle/clarify).

**Framework:** Authority Pillars (intersección dolor × expertise × topic-defendible). Editorial Theme aplica a nivel pieza, no pillar.

**Nota arquitectónica importante:** `positioning-messaging` (skill existente) en su step 7 ya define "per-niche content pillars". El nuevo skill `content-pillars` **extiende** ese output, no duplica. Lee positioning-messaging output como punto de partida y le añade: signal+gathering hooks (configs derivados), business_model awareness, funnel_role per pillar, versionado, y la conexión con el resto del Content Engine.

**Skill `content-pillars` lee de Foundation:**

| Archivo / output | Por qué |
|---|---|
| `_system/brand-memory.md` | Protocolo de acceso a brand context |
| `BRAIN.md` | Arquitectura SanchoCMO (referencia) |
| `_system/schemas/company-context.schema.json` | Estructura company context |
| `_system/schemas/icp.schema.json` | Estructura ICP |
| `_system/schemas/positioning.schema.json` | Estructura positioning |
| Output de `company-context` | Industry, stage, what/want/believe |
| Output de `niche-discovery-100x` + `ecp-validation` | ICPs / ECPs reales |
| Output de `positioning-messaging` (step 7) | Per-niche content pillars seed — **base de partida** |
| Output de `brand-voice` | Tone, words, do/don't (NO POV — el POV se decide por pieza) |

**Flujo del skill:**

1. Lee toda la Foundation arriba.
2. **Toma como seed los pillars de positioning-messaging step 7.**
3. Si hay transcripts disponibles (OPCIONAL): enriquece con `meeting-intelligence` para extraer dolores reales que ajusten/validen los seeds.
4. Cruza dolores × expertise diferencial.
5. Asigna `funnel_role` por pillar (top/middle/bottom según `business_model`).
6. Pregunta a humano: confirma/edita lista final de 3-4 pillars.
7. Output: `./brand/content-pillars.md`.

Sin `is_contrarian`. Sin filtro SEO en esta capa (SEO entra en blog SEO targeting via `keyword-research` cuando se redacta blog).

**Schema `./brand/content-pillars.md`:**

```yaml
client_id: alfonso
business_model: B2B
sector: B2B fintech consulting
pillars:
  - id: P1
    name: Growth fintech B2B regulada
    pain_origin: [...]
    expertise: [SanchoCMO, AARRR fintech]
    related_topics: [...]
    linked_lms: [growth-audit-fintech]
    funnel_role: bottom
    status: active
    version: 1
    last_review_date: 2026-04-25
```

**Pillars tentativos Alfonso:** P1 Growth fintech B2B regulada · P2 CMO/CGO playbooks operativos · P3 Trust engine + AARRR aplicados · P4 Founder-led growth en mercados conservadores. Validar al ejecutar skill.

---

## Capa 0.5 — Setup (primera vez por cliente)

**Por qué existe:** la primera vez que se onboardea un cliente, hay que CREAR todas las configs derivadas de los pillars. Esta es una sesión de setup, no automática. Después, los crons corren con esas configs.

**Output del setup (todo guardado en `./content/configs/`):**

| Config file | Contenido |
|---|---|
| `news-prompts/<pillar_id>.yml` | Prompt SECTOR+PILLARS para `news-monitor` |
| `paa-queries/<pillar_id>.yml` | Lista de queries seed para PAA |
| `keywords-seed/<pillar_id>.yml` | Keywords para `keyword-research` |
| `competitors/<pillar_id>.yml` | Lista competidores + redes (LinkedIn, Instagram, blog) — extraído de Foundation |
| `reference-creators/<pillar_id>.yml` | **Creadores de contenido referentes** del sector (founders, thought leaders, journalists, niche stars). Por plataforma: LinkedIn handles, X/Twitter handles, Instagram handles, blog/newsletter URLs. Distinto de competitors: no son competencia sino voces inspiradoras. |
| `cadence-config.yml` | Cadencia día×canal×type para este cliente |

**Proceso del setup:**
1. Ejecutar `content-pillars` skill (crea `pillars.md`).
2. Para cada pillar, generar configs derivados (humano + Sancho colaboran):
   - News prompt: usa template parametrizado, humano confirma sector + pillars wording.
   - PAA queries: deriva de keywords_seed + topics.
   - Competitors: pull de Foundation (`./brand/competitive-landscape.md` o equivalente). Extrae sus URLs sociales.
3. Cadence config: workshop con humano (qué tipos qué días qué canales).
4. Activar crons.

Re-setup: si el humano cambia pillars (review trimestral), se re-ejecuta solo lo afectado.

---

## Capa 1 — Input Layer

**Premisa:** todos los inputs leen `./brand/content-pillars.md` + configs de Capa 0.5 antes de ejecutar. Cliente Hula Hoop (cultural investment) tendrá pillars distintos → news/competitors/PAA/keywords totalmente distintos.

### `news-monitor` (NEW)

**Tool:** Brave Search API o Perplexity. Fallback: WebFetch a RSS curados.
**Input:** `news-prompts/<pillar_id>.yml` (creado en Setup).
**Frecuencia:** diaria 7am.
**Output:** `./content/research-signals/YYYY-MM-DD-news.json`.

### `paa-monitor` (NEW, separada de keyword-research)

**Tool:** DataforSEO endpoint People Also Ask.
**Input:** `paa-queries/<pillar_id>.yml`.
**Frecuencia:** semanal.
**Output:** preguntas reales que la audiencia hace → `./content/research-signals/YYYY-MM-DD-paa.json`. **Propósito**: source de IDEAS de contenido (preguntas que tu audiencia se hace).

### `keyword-research` (existing, reuso)

**Tool:** DataforSEO/Ahrefs.
**Input:** `keywords-seed/<pillar_id>.yml`.
**Propósito:** identificar keywords para targeting de **blog SEO específicamente**. Diferente uso que PAA: aquí busco volumes/difficulty para decidir qué bloggear; PAA busca preguntas reales.

### `thief-marketers` (refactor) — competitors + reference creators

**Refactor:** leer DOS configs por pillar:
- `competitors/<pillar_id>.yml` (extraído de Foundation)
- `reference-creators/<pillar_id>.yml` (creadores referentes del sector)

Para cada competidor Y cada creador referente, monitorear sus redes (LinkedIn, Instagram, blog/newsletter, X) y traer "top 5 contenidos mejor performando últimos 7 días" por plataforma.

Patrón análogo al news-monitor pero para social/blog. APIs/tools: LinkedIn (scraper tipo Phantombuster — TBD V2), Instagram (Graph API o scraper), X (API), Blog/Newsletter (RSS).

**Output:** `./content/research-signals/YYYY-MM-DD-creators.json` con cada item llevando `signal_summary`, `source` (creator handle/name), `source_type` (competitor/reference-creator), `platform`, `url`, `date`.

### `daily-pulse` (existing — fix cron)

7am diario. Output: `./content/research-signals/YYYY-MM-DD-pulse.json`.

### `meeting-intelligence` (existing — opcional)

Cuando el cliente tenga transcripts. Output: quotes etiquetados por pillar → `./brand/quotes-by-pillar.json` (alimenta POV Bank y enriquece angle_draft).

### `insight-classifier` (renombre `content-miner`) — qué hace en cristiano

**Input:** items de `research-signals/*.json` (vengan de news, paa, creators, daily-pulse, meeting-intel).
**Proceso:** etiqueta cada item con uno o varios de **7 tipos de señal**: aha-moment, conflict, contrarian, system, milestone, vulnerability, metric.
**Output:** mismos items enriquecidos con campo `signal_type[]` + opcionalmente patrones detectados (ej. "tres aha-moments sobre X esta semana → trend candidate").

**Por qué importa para nuestro flow:** cuando el Idea Approval Loop muestra N candidatos al humano, sin tagging todos parecen iguales. Con tagging podemos diversificar (no todo "metrics", no todo "aha"), priorizar tipos según el día (lunes valor → preferimos `system`/`framework`; martes hot-take → preferimos `contrarian`), y detectar patrones útiles (3 conflict-signals esta semana en mismo tema = trending opinion piece).

**Decisión:** SE QUEDA en el pipeline pero como **enriquecedor opcional** (no bloqueante). Si falla, ideas siguen funcionando sin tags. Renombre a `insight-classifier` aclara su función vs el "miner" original.

---

## Capa 2 — Hub Central (file-based)

**Idea Queue schema (`./content/idea-queue.json`)** — cada idea presentable a humano debe traer signal + angle:

```json
[{
  "id": "idea-2026-04-25-001",
  "pillar_id": "P1",
  "content_type": "Hot Take",
  "target_channel": "linkedin",
  "signal": {
    "summary": "Quicken usa AI para producir 100 piezas/mes reduciendo juniors",
    "source": "Adweek",
    "url": "https://www.adweek.com/...",
    "date": "2026-04-23"
  },
  "angle_draft": "Esto no es 'AI reemplaza marketers'. Es 'qué marketers se vuelven redundantes primero'. Los entry-level eran cómo se entrenaba la próxima generación. ¿Quién construye ese pipeline ahora?",
  "lead_magnet_id": null,
  "pov_confidence": 0.78,
  "source_signals": ["news-2026-04-25-003"],
  "created_at": "2026-04-25T07:42:00Z",
  "status": "ready"
}]
```

**Cuando se le presente al humano** (Capa 3.5), el render es:
```
📰 Esto pasó: [signal.summary]
   📅 [signal.date] · 🔗 [signal.source] · [signal.url]
✍️ Tu posible ángulo: [angle_draft]
🎯 Pillar: [P#] · Canal: [channel] · Tipo: [type]
```

**Otros archivos del Hub** (sin cambio relevante respecto versión anterior): `quotes-by-pillar.json`, `voice-profile.md`, `cadence-config.yml`. `clarify-history.json` queda solo como legacy/export; Neon es source of truth.

---

## Capa 3 — Editorial Calendar (recency-aware)

**Selección de idea (priorizando recency):**

```
WHERE client_id = X
  AND pillar_id IN (active pillars)
  AND content_type = type del slot
  AND status = 'ready'
  AND age(created_at) <= 14 days   # ideas más viejas se vuelven obsoletas
ORDER BY 
  recency_score DESC,           # peso fuerte a recientes
  pov_confidence DESC,
  signal.date DESC
LIMIT N (varias para Idea Approval Loop)
```

Donde `recency_score = exp(-age_in_days / 5)` (decay rápido).

Ideas que cumplen 14 días sin usar → `status = stale`, archivadas. Pueden re-promocionarse manualmente si siguen relevantes.

**LM slot decision:** sin cambios — driven por `business_model × funnel_role × channel`.

**Dispatch:** envía LISTA de N candidatos al **Idea Approval Loop (Capa 3.5)**, no directamente al writer.

---

## Capa 3.5 — Idea Approval Loop (Slack/Discord)

**Por qué existe:** humano no aprueba todas las ideas igual. Algunas le encantan, otras dejan para después, otras descarta. Hay que ofrecer varias y dejarle elegir.

**Flujo (siguiendo `_system/idea-approval-protocol.md`):**

1. Calendar Controller envía a Slack/Discord (canal configurado por cliente): un mensaje con N (3-5) ideas candidatas para los slots del día.
2. Cada idea se renderiza con el formato signal+angle (ver Capa 2).
3. Botones por idea: **[✅ Sí] [⏰ Más tarde] [❌ No]**.
4. Cuando humano marca ✅, el sistema responde con un **link directo al hilo del día en Sancho UI**. Todo el resto (Clarify + Draft + edit + approve) ocurre allí.
5. "Más tarde" mantiene `status=ready` con flag `revisit_after`. "No" → `status=archived`.

**El canal externo (Slack/Discord/Telegram) NO contiene Clarify ni Drafts.** Es puro lightweight gating: sí/no + link.

**Multi-canal:** Slack vs Discord vs Telegram configurable en setup por cliente.

---

## Capa 4 — Redacción (TODO ocurre en UI Sancho)

**Slack/Discord NO interviene aquí.** Una vez la idea está en ✅, el humano sigue el link al hilo del día en Sancho UI y todo el flujo ocurre dentro.

**Flujo dentro de Sancho UI:**

1. Humano abre el hilo del día (link desde Slack o entrada directa).
2. Por cada idea ✅, Sancho ejecuta **Clarify (siempre, no se salta nunca)** siguiendo `_system/clarify-protocol.md`:
   - Sancho muestra 2-3 preguntas con predicciones + confianza.
   - Si confianza alta: las predicciones ya son opciones muy buenas — humano confirma con un click o ajusta.
   - Si confianza baja: humano contesta más a fondo.
   - Independientemente de la confianza, **el humano siempre pasa por el step**.
3. Tras Clarify, writer genera draft (con templates del canal).
4. Draft aparece en card dentro del hilo del día (UI Sancho).
5. Humano edita inline o da instrucciones a Sancho ("hook más fuerte", "más corto", "cita Monzo").
6. Aprueba en UI → sale a Metricool (Capa 5).

**UI Sancho — diseño del hilo del día:**
- 1 thread por día con cards por pieza.
- Cada card: canal, tipo, pillar, draft editable, estado (draft / approved / scheduled / published).
- Sancho dentro del thread como "co-author" (puede contestar instrucciones, regenerar partes).

**Skills writers:**
- `social-writer` (NEW) — LinkedIn + X. References: `linkedin-formats.md`, `x-formats.md`.
- `seo-content` (existing, extend) — Blog SEO long-form. Aquí sí aplica `keyword-research` para SEO targeting; LM bottom-funnel se gatea.
- `newsletter` (existing, extend) — Newsletter weekly digest.

Cada writer implementa `_system/clarify-protocol.md` (el Clarify es UN paso del writer, no skill aparte).

---

## Capa 5 — Publicación (Metricool)

Post aprobado en UI Sancho → push a Metricool API con schedule del cadence-config → Metricool publica.
Output: `./content/published/YYYY-MM-DD.json` (channel, type, pillar, idea_id, published_at, metricool_id).

---

## Capa 6 — Performance Loop

**KPIs norte por business_model:**
- B2B: % inbound calls citando contenido + newsletter ICP-fit + LinkedIn followers ICP-fit + pipeline influenced.
- B2C: subs ICP-fit growth + sales + retention.

**Métricas operativas (semanales):** impressions, ER, comments, follows, CTR LM, organic traffic, open rate.

**Feedback al Hub:** top-quartile angles → `replicate-angle` flag · bottom-quartile → reduce confidence · LMs con CTR alto → priorizar mapping.

**Reporting:** dashboard mensual pillar × canal × funnel × performance (visible en UI Sancho).

---

## Rollout — 3 fases

**Fase 1 — Foundation + Setup (semanas 1-2)**
- Crear `content-pillars` (sin is_contrarian, sin SEO filter; meeting-intelligence opcional).
- Renombrar `content-miner` → `insight-classifier`.
- Fix `daily-pulse` cron + correr 5 días.
- Probar `meeting-intelligence` con 1 transcript real (validar que funciona, aunque sea opcional).
- Refactor `thief-marketers`: input desde Foundation con redes competidores + founders.
- Ejecutar `content-pillars` para Alfonso → `./brand/content-pillars.md` con 3-4 pillars + funnel_role.
- **Setup workshop con Alfonso:** crear configs derivados (news-prompts, paa-queries, keywords-seed, competitors, cadence-config).
- Brand Voice Layer 4 locked.
- Crear `_system/clarify-protocol.md` y `_system/idea-approval-protocol.md`.
- **Done:** Pillars + configs + Brand Voice locked + audits skills existentes pasados.

**Fase 2 — LinkedIn-only MVP (semanas 3-4)**
- Crear: `news-monitor`, `paa-monitor`, `social-writer` (canal=linkedin first).
- Extender: `insight-to-content-mapper` (angle_draft con signal embedded), `content-calendar-planner` (recency-aware + dispatch a Idea Approval Loop).
- Crear `idea-queue.json` y las tablas Neon `pov_*` para POV/Clarify.
- Slack/Discord integration para Idea Approval Loop.
- UI Sancho: implementar hilo del día con cards de drafts (mínimo viable — si UI no lista, fallback temporal a archivos editables manualmente).
- Metricool API integrada.
- **Done:** 1 LinkedIn/día con < 10 min fricción × 5 días seguidos.

**Fase 3 — Expansión (semanas 5-8)**
- Extender `social-writer` con canal X.
- Activar `seo-content` (Blog) y `newsletter` (Newsletter) con Clarify embebido.
- `keyword-research` activo para SEO targeting de blog.
- Métricas operativas + dashboard mensual + KPIs norte tracking.
- POV Bank consolidation mensual.
- **UI Sancho completa cubriendo TODO el sistema:**
  - Foundation view (Brand Voice, Positioning, ECPs, Competitive Landscape).
  - Content Strategy view (funnel + KPIs norte).
  - Pillars view (lista, edit, versionado, trigger review).
  - Input Systems view (configs por pillar visible y editable).
  - Research Signals DB browser (filtrable, buscable).
  - Idea Queue view (todas las ideas, no solo propuestas del día).
  - Editorial Calendar view (slots próximos + cadencia editable).
  - Daily threads de redacción (Clarify + drafts + edit inline).
  - Performance dashboard (KPIs norte + operativos por canal/pillar).
- **Done:** 4 canales operativos × 2 semanas + UI completa + KPIs norte tracking.

---

## Critical files / paths

**Skills nuevas (en `01-business/frameworks/sanchocmo-framework-export/skills/`):**
- `content-pillars/SKILL.md`
- `news-monitor/SKILL.md`
- `paa-monitor/SKILL.md`
- `social-writer/SKILL.md` + `references/linkedin-formats.md`, `references/x-formats.md`

**Skills existentes a extender/refactor:**
- `content-miner/` → renombrar a `insight-classifier/`
- `thief-marketers/SKILL.md` (refactor competitor-monitor)
- `insight-to-content-mapper/SKILL.md` (output angle_draft + signal embedded)
- `content-calendar-planner/SKILL.md` (recency + dispatch a Idea Approval Loop)
- `seo-content/SKILL.md` (clarify embebido)
- `newsletter/SKILL.md` (clarify embebido)
- `foundation-orchestrator/references/pillar-registry.md`

**Skills a auditar:**
- `daily-pulse/` (cron + 5-day test)
- `meeting-intelligence/` (1 end-to-end test, OPCIONAL en flow)

**Sistema/protocolos:**
- `_system/clarify-protocol.md` (NEW)
- `_system/idea-approval-protocol.md` (NEW)

**Configs (workspace cliente, file-based):**
- `./brand/content-pillars.md`
- Neon `pov_*` tables (legacy export opcional: `./brand/clarify-history.json`)
- `./brand/quotes-by-pillar.json`
- `./content/configs/news-prompts/<pillar_id>.yml`
- `./content/configs/paa-queries/<pillar_id>.yml`
- `./content/configs/keywords-seed/<pillar_id>.yml`
- `./content/configs/competitors/<pillar_id>.yml`
- `./content/configs/reference-creators/<pillar_id>.yml`
- `./content/configs/cadence-config.yml`
- `./content/idea-queue.json`
- `./content/research-signals/YYYY-MM-DD-{type}.json`
- `./content/published/YYYY-MM-DD.json`

**Schedulers (`.claude/scheduler-scripts/`):**
- `daily-pulse.sh` (7am)
- `news-monitor.sh` (7am)
- `paa-monitor.sh` (lunes 6am)
- `keyword-research.sh` (lunes 6am)
- `thief-marketers.sh` (diario 7am)
- `editorial-dispatch.sh` (8am + slots X)
- `pov-bank-monthly.sh` (1 del mes)

**Pointer (opcional, en máquina del usuario):**
- En cualquier `MEMORY.md` o equivalente que use el operador, añadir un puntero a este plan + estado de fase actual. No bloqueante para ejecución — el plan se sostiene solo.

---

## Verification

**Fase 1 done cuando:**
- [ ] `content-pillars` registrada en foundation DAG; pillars.md sin `is_contrarian`.
- [ ] 3-4 pillars con `funnel_role` asignado.
- [ ] Brand Voice Layer 4 locked.
- [ ] `content-miner` renombrada `insight-classifier`.
- [ ] `daily-pulse` corre 5 días seguidos.
- [ ] `meeting-intelligence` probada (output JSON con quotes etiquetados) — aunque opcional en flow.
- [ ] `thief-marketers` refactor: lee competitors desde Foundation y trae top contenidos competidor.
- [ ] Setup workshop ejecutado: configs por pillar (news-prompts, paa-queries, keywords-seed, competitors, reference-creators, cadence-config) creados.
- [ ] `_system/clarify-protocol.md` y `_system/idea-approval-protocol.md` documentados.

**Fase 2 done cuando:**
- [ ] `news-monitor` añade ≥3 señales/día a research-signals.
- [ ] `paa-monitor` corre semanal y trae preguntas reales por pillar.
- [ ] `idea-queue.json` con ideas que llevan `signal.summary + signal.url + signal.date + angle_draft`.
- [ ] `content-calendar-planner` recency-aware: ideas viejas (>14 días) se archivan.
- [ ] **Idea Approval Loop**: Slack/Discord recibe N candidatos/día con botones [Sí][Más tarde][No] + link a Sancho UI tras ✅. Funciona × 5 días.
- [ ] `social-writer` (linkedin): genera draft tras idea aprobada y Clarify completado.
- [ ] **Drafts en UI Sancho** (o fallback temporal): hilo del día con cards editables.
- [ ] Clarify SIEMPRE corre dentro de Sancho UI (nunca se salta). Confianza alta = predicciones muy buenas para confirmar de un click; confianza baja = preguntas abiertas. En ambos casos pasa el step.
- [ ] LinkedIn ungated (LM ignorado por business_model+funnel_role).
- [ ] Metricool publica tras approve.
- [ ] Fricción humana < 10 min/pieza × 5 días.

**Fase 3 done cuando:**
- [ ] 4 canales operativos × 2 semanas.
- [ ] Blog vía `seo-content` con LM gated bottom-funnel + `keyword-research` activo para targeting.
- [ ] Newsletter sale viernes con digest.
- [ ] UI Sancho con threads diarios + edit inline + dashboard mensual.
- [ ] Brand Voice re-generada con clarify-history.

**Verificación end-to-end objetivo:** mes 3 → al menos 1 inbound call (B2B) o 1 venta (B2C) que cite explícitamente una pieza generada por el sistema.
