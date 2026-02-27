# CHANGELOG — SanchoCMO

Formato: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

---

## [0.5.0] — 2026-02-27

### Added
- **TASKS.md unificado con tags de cliente** — Un solo archivo de tareas para sistema + clientes. Tags `[hospital-capilar]` para filtrar por cliente en MC.
- **Categoría 🗑️ Descartadas en Kanban** — Nuevo estado para tareas que no proceden (con razón documentada).
- **Exec permissions globales** — `tools.exec.security=full` + `tools.exec.ask=off`. Sancho ya no pide permisos para ejecutar comandos.

### Changed
- **regenerate.py** — Extrae campo `client` de tags en tareas. Una sola fuente (Cervantes TASKS.md).
- **mission-control.html** — Filtro de cliente usa `t.client === selectedSlug` en vez de `t.cat === 'client'`.
- **3 crons arreglados**:
  - `cost-tracker-daily`: delivery cambiado a `--no-deliver` (error de target Discord).
  - `Daily Pulse`: instrucciones de thread-create corregidas (usar `send` con threadId, no `thread-reply`).
  - `Meeting Intelligence`: misma corrección de thread-create + referencia a isolation rules.

### Fixed
- **T-022 completada** — cost-tracker.py + cron 23:00 funcionando. MC muestra costes por cliente y global.
- **T-037 completada** — Aislamiento de contexto por cliente. `_system/client-context-isolation.md` + Regla 0 en SOUL.md.

### Moved to Discarded
- **T-015** Dispatch bot — Conflicto de token con OpenClaw + código obsoleto (dispatch-map v1).
- **T-018** Supabase RLS — Supabase no se usa aún, sin datos.
- **T-021** Multi-client routing — Ya resuelto con systemPrompts + clients.json.

---

## [0.4.0] — 2026-02-26 (tarde/noche)

### Added
- **T-034 — Integraciones y costes por cliente en MC** — `integrations.json` + `costs.json` por cliente. Sección en MC con "⚙️ Configurar" expandibles, inputs + "Conectar" button. POST `/api/integration` en mc-server.js.
- **Doc viewer en `/mc/docs/`** — Sirve brand, prds, skills, memory con navegación. WYSIWYG editor (Toast UI) con ✏️ Editar → 💾 Guardar (PUT a mc-server).
- **Meeting Intelligence** — 5 reuniones de Hospital Capilar procesadas desde Google Drive. Archivos .md + `meetings.json`. MC muestra cards con decisions/actions/insights.
- **Cost tracker v1** — `cost-tracker.py` lee sesiones, mapea Discord channels → clientes, calcula tokens + costes por modelo. Hospital Capilar: $12.46 | Sistema: $87.95.
- **14 channel systemPrompts** — Cada canal con contexto de cliente, paths de brand, regla de hilos, y roles (decision/execution/intelligence).
- **Foundation threads skill** — `skills/foundation-threads/SKILL.md`. Thread-per-pilar para onboarding en Discord.
- **Cron "Cervantes observa a Sancho"** — Daily 10:00, revisa sesiones, documenta en `memory/sancho-observations.md`.
- **7 skills de ClawHub instaladas** (T-024) — google-ads, meta-ads, google-analytics, google-search-console, apollo, apify, social-media-extractor.
- **Hospital Capilar integrations.json** — 7 servicios con setup instructions y links directos.

### Changed
- **Brand viewer migrado a multi-client** — `brand/hospital-capilar/` con 20 docs. Max-width 1200px.
- **Legacy `/mc/brand/` redirect** — 301 a `/mc/docs/brand/`.
- **HEARTBEAT.md actualizado** — Incluye "ejecutar una tarea aprobada" en cada heartbeat.
- **5 crons arreglados** — Modelo haiku→sonnet en cost-tracker, healthcheck, regenerar dashboard, memory maintenance, backup.

### Fixed
- **T-020** — Backup cron modelo corregido (haiku→sonnet).
- **Markdown renderer** — Code blocks protegidos, párrafos bien wrapeados, blockquotes, listas numeradas.

---

## [0.3.0] — 2026-02-26 (mañana/mediodía)

### Added
- **14 welcome messages en Discord** — Enviados y pineados en todos los canales.
- **Canal #onboarding** (1476491108421730334) — En categoría ESTRATEGIA.
- **T-013 Comic UI en MC** — Parchment, Bangers, Comic Neue, ink borders 3px, flat shadows, halftone dots. Light mode default, dark mode toggle.
- **T-025 Filtro de tareas sistema vs cliente** — Vista global = todas, vista cliente = solo `[client]`.

### Changed
- **Arquitectura 12→4 agentes** — Sancho (Opus/CMO), Cervantes (Opus/Architect), Rocinante (Sonnet/QA), Escudero (Sonnet/Worker).
- **SOUL.md de Sancho** — Añadidas "Reglas de Canal" completas.
- **dispatch-map.json v3** — Channel roles (decision/execution/intelligence/support) + flow.
- **T-010 PRD actualizado** — Arquitectura dual view: `/mc/c/:slug` + `/mc/admin`.

### Fixed
- **Skills 56/56 cargan** — Descripciones recortadas ~700→~35 chars, symlink roto reemplazado.
- **Exec permissions** — `security: full` + `ask: off` para todos los agentes.
- **MEMORY.md corregido** — Arquitectura vieja (12 agentes) → 4 reales.

---

## [0.2.0] — 2026-02-24

### Added
- **Mission Control v2** — Formulario, tareas accionables, visor de archivos de agentes.
- **agents-data.js** — Datos de agentes con SOUL.md, TOOLS.md, USER.md.
- **Heartbeat configurado** (T-011) — HEARTBEAT.md + heartbeat-state.json.
- **Dispatch map** (T-012) — dispatch-map.json con channel IDs por agente.

---

## [0.1.0] — 2026-02-24

### Added
- **Infraestructura core** — OpenClaw gateway + LaunchAgent, Discord bot, Tailscale serve.
- **Supabase** — 9 tablas (vacías), proyecto `psapmujzxhaxraphddlv`.
- **Google Workspace** — gog CLI autenticado (alfonso@growth4u.io).
- **Notion** — API key configurada.
- **Auth** — Password + Tailscale allowTailscale.
- **Memory system** — MEMORY.md + memory/*.md + vector search + FTS.
