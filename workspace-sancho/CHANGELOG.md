# CHANGELOG — SanchoCMO

Formato: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

---

## [2.0.0] — 2026-03-03

### Added
- **Foundation v2.0** — Complete architectural redesign: 4 output sections (Company Brief, Market & Us, Go-To-Market, Brand Identity) replacing 15 flat pillar directories. 6-layer DAG with `requires` (blocking) and `enriches_with` (optional) dependency semantics.
- **Company Brief flow** — 3 Foundation skills (company-context, business-model, budget) run as single conversational flow with 1 approval at end instead of 3 separate approvals.
- **Inline synthesis** — Orchestrator generates summary.md, ope-canvas.md, and messaging-summary.md automatically after prerequisite pillars complete. No dedicated synthesis skills needed.
- **Gate check v2** — Reads foundation-state.json v2.0 with sections/pillars structure. Supports `enriches_with` for optional context loading.
- **foundation-state.json v2.0 schema** — Multi-section with nested pillars, syntheses, requires/enriches_with fields. Documented in `_system/schemas/foundation-state-v2.md`.
- **8 Foundation threads** (was 15) — Grouped by section: Company Brief, Market Analysis, Competitor Analysis, Self Analysis, SWOT & Synthesis, Niche Discovery, Positioning & Pricing, Brand Identity.

### Changed
- **56 skills migrated** — All context_required and context_writes paths updated to v2.0 directory structure (company-brief/, market-and-us/, go-to-market/, brand-identity/, operational/).
- **OPE Canvas demoted** — From blocking Foundation pillar to orchestrator-generated synthesis document.
- **self-intelligence** — Removed "Deep Research: Market" (now belongs to market-intelligence only).
- **MC HTML** — Foundation page renders per-client sections/pillars, DAG shows 6 layers, client cards with individual progress.
- **regenerate.py** — Reads foundation-state.json v2.0 with multi-client support.
- **new-client.sh** — Generates v2.0 state with 4 sections and complete dependency graph.
- **brand-memory.md** — Updated directory structure, ownership table, context matrix.
- **context-hydration-protocol.md** — Updated paths and examples for v2.0.

### Fixed
- **3 cron delivery failures** — "Regenerar Dashboard", "backup-sancho", "Memory Maintenance" changed from `announce` to `none` delivery mode (isolated sessions have no "last" channel).

### Merged
- **pricing-hooks + pricing-strategy** → Unified `pricing-strategy` (125 lines + 7 reference files). pricing-hooks deprecated.
- **social-media-extractor** → Deprecated (use `apify` skill directly).
- **phase-0-diagnostic** → Deprecated (replaced by sancho-start v3).

### Removed
- **niche-discovery-100x.bak-v1** — Backup directory cleaned up.

---

## [1.0.0] — 2026-02-27 (Evening)

### Added
- **OPE Canvas skill** — One-Page Endgame (15th Foundation pillar). 14 sections: Obvious Choice, ICP, Core Problem, Product, Geography, Channels, 3× Moats, Endgame, Values, Capabilities, Strategy, Year/Quarterly/Monthly Picture. Positioned between La Empresa and El Mercado. Framework de Moats con 7 tipos.
- **DataForSEO integration** — SEO data for competitor analysis (SERP, backlinks, keywords). Credentials configured, balance $35.
- **Gate Check (regla de SOUL.md)** — Block pillar execution if dependencies not approved. Reads foundation-state.json, verifies all prerequisites.
- **Automatic next-pillar flow** — After user approves → Sancho updates JSON → regenerates MC → launches next pillar (no command needed).
- **Regla 0g** — Read ALL client data before generating (not just prerequisites). Only mark 🔴 DUDA if truly missing.
- **Strict thread rules** — Prohibit intermediate messages in channel, require user mention in first message, max 2 messages per thread (start + result).
- **MC live-reload** — Reads foundation-state.json every 30 seconds, no longer 100% dependent on regenerate.py.
- **Competitor Intelligence v2** — Validate competitors with domains/socials before scraping. Apify mandatory. Save to sources.json.

### Changed
- **Foundation order** — Now 15 pillars with 5 categories: 🏢 La Empresa (4) + 🎯 OPE Canvas (1) + 📊 El Mercado (3) + 👥 Los Clientes (3) + 🎯 La Marca (4).
- **foundation-orchestrator** — Updated DAG to reflect new order, renumbered 1-15.
- **Approval triggers** — Expanded from ("sí", "ok", "perfecto") to include "validamos", "avancemos", "dale", "vamos", "next", etc.
- **Competitor Intelligence flow** — Step 0 now presents all competitors with URLs before executing scrapers.
- **Skill descriptions** — ope-canvas added to context_required of dependent skills.

### Fixed
- **Sancho not executing regenerate.py** — Added explicit reminder + MC live-reload as fallback.
- **SWOT executed without validated competitors** — Gate check prevents execution of pillars with unmet dependencies.
- **Sancho narrating intermediate steps** — Strict rules added (examples of ❌ prohibited messages).
- **Hilos** — Philippe not auto-joining threads (fix: mention user in first message).
- **Foundation-state.json not updated** — Sancho 3× forgot. Now automated MC read + explicit reminder in SOUL.md.

### Deprecated
- Intermediate narrative messages in channels (now prohibited in Regla 0c2)

---

## [0.9.0] — 2026-02-27

### Added
- **Foundation view restructured** — Business categories (🏢 La Empresa, 📊 El Mercado, 👥 Los Clientes, 🎯 La Marca) instead of technical layers (L0-L5). Pillar cards now clickable to open in doc viewer.
- **Persistent QA logs** — Each pillar folder has `qa-log.md` that Rocinante maintains. Accumulates all QA checks, so Rocinante doesn't repeat verification work. URLs already validated are skipped in subsequent runs.
- **"Descartadas" column** in tasks Kanban — Now shows discarded tasks (T-015, T-018, T-021) with reasons documented.
- **Pillar folder mapping** — `folder` field in pillar data tracks which folder to open (e.g., market-intelligence → market/).

### Changed
- **Foundation pillar detection** — regenerate.py now finds folders with `current.md` (new structure) + legacy flat files.
- **Rocinante rules** — Updated to read/write qa-log.md, skip re-verification, maintain QA history.
- **Sancho rules** — Pass qa-log.md ruta to Rocinante so it knows where to maintain the log.

---

## [0.8.0] — 2026-02-27

### Added
- **Versionado de documentos por carpeta** (Regla 0d) — Cada pilar en `brand/{slug}/{pilar}/current.md` + `v1.md`, `v2.md`... + `history.json`. Sancho siempre lee `current.md`, pregunta antes de sobreescribir, backup automático.
- **Resolución de rutas** — `brand/{slug}/market.md` se traduce a `brand/{slug}/market/current.md` automáticamente.

### Changed
- **15 documentos de Hospital Capilar migrados** a estructura de carpetas con versionado.
- **regenerate.py** — `parse_foundation()` ahora busca en `{pilar}/current.md` (nueva estructura) + legacy flat files.
- **Foundation 5/14** pilares detectados correctamente post-migración.

---

## [0.7.0] — 2026-02-27 (late session)

### Added
- **Regla 0b (Citación inline)** — Toda información buscada en internet debe incluir URL inline + sección Fuentes. Aplica a TODAS las skills.
- **Regla 0c (Silencio intermediario)** — Sancho no narra pasos intermedios en Discord. Un mensaje al inicio + silencio hasta resultado final.
- **Regla 0d (QA obligatorio)** — Rocinante valida TODOS los documentos antes de entregar al cliente. QA invisible (`thread: false`), resultado en hilo original. RECHAZA si hay URLs rotas o sin fuentes. Re-valida hasta aprobación.
- **`qa-document-checklist.md` en workspace-rocinante** — Checklist: citación/URLs (verificadas con web_fetch), completitud, coherencia, brand alignment, formato, aislamiento de contexto. Scoring X/10.
- **Link rendering en doc viewer** — `[texto](url)` ahora se convierte a `<a href="url">` en tablas y todo markdown.
- **`spawnSubagentSessions=true`** en config Discord — Sancho puede spawnar Rocinante desde hilos.

### Changed
- **SOUL.md de Sancho** — Reglas 0b, 0c, 0d nuevas. Emphasis en QA invisible y silencio operacional.
- **SOUL.md de Rocinante** — Regla 8 con referencia a checklist. Solo responde a QA REQUEST.
- **deep-research** — Repositorio siempre en `brand/{slug}/`, no genérico. Instrucciones claras.

### Fixed
- **mc-server.js** — Renderer ahora procesa links markdown en todas partes (incluyendo celdas de tabla).

---

## [0.6.0] — 2026-02-27

### Added
- **T-035 — Reglas de citación obligatorias** — Toda cifra/dato en market-intelligence (+ competitor-intelligence, self-intelligence, niche-discovery, swot-analysis) debe incluir URL de fuente verificada. Sección `## Fuentes` obligatoria.
- **T-036 — Skill `deep-research`** — Profundizador universal para Foundation. Acepta cualquier doc .md, investiga con 10-20 búsquedas por sección, devuelve mismo formato enriquecido con fuentes verificadas.
- **Bloque "¿Quieres profundizar?"** añadido a 13 skills de Foundation — Al completar cualquier análisis, sugiere deep-research.
- **Skills abre en doc viewer** — Click en skill card en MC abre `/mc/docs/skills/{nombre}/SKILL.md` en pestaña nueva.

### Fixed
- **Exec permissions globales** — `tools.exec.security=full` + `tools.exec.ask=off`. Sancho ya no pide permisos.
- **3 crons arreglados** — cost-tracker, Daily Pulse, Meeting Intelligence (thread-create flow corregido).

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

## [0.9.0] — 2026-02-28

### Fixed
- **Folder naming consistency** — Renamed `swot/` → `swot-analysis/`, `niche-discovery/` → `niche-discovery-100x/` to match foundation-state.json
- **Markdown rendering (lists)** — Replaced artisanal regex renderer with marked.js (CDN). Fixes bullet spacing issues in complex lists (niche-discovery, swot-analysis)

### Changed
- **Sancho SOUL.md** — Added Regla 0h: "Honestidad absoluta sobre herramientas y fuentes (P0)". Never claim tool usage (Apify, DataForSEO) if not executed. Addresses competitor-intelligence quality issue.
- **mc-server.js** — CSS tweaks: li margin, line-height, list margin/padding for compact display

### Removed
- **Legacy docs** — Moved product-analysis, icp, channel-plan, briefs-creativos, assets-doc to `_archive/` (Hospital Capilar per-client backup)

### Proposed
- **T-039** — Public doc access from mobile (Tailscale Funnel options pending decision)


## [0.9.0] — 2026-02-28

### Changed
- **SOUL.md restructured** — Reduced from 531 to 99 lines. Moved procedures to `_system/`: threading-protocol.md → TOOLS.md, foundation-protocol.md (new), versioning-protocol.md (new), dispatch-protocol.md (expanded), workflow-recipes.md (expanded)
- **Discord threading refactored** — No longer creates standalone threads. Subagent spawns create thread-bound sessions (`thread: true`) where Escudero works directly in threaded context
- **Thinking defaults enabled** — `agents.defaults.thinkingDefault: low` — intermediate reasoning goes to thinking tokens, not chat

### Added
- **TOOLS.md Discord Mechanics section** — Comprehensive guide to NO_REPLY, thinking tokens, thread-bound delivery, subagent result handling
- **threadBindings.spawnSubagentSessions** — Enabled for Escudero thread-bound spawn sessions
- **Escudero TOOLS.md** — Discord threading behavior for subagent spawns

### Fixed
- Discord text leaks between tool calls — resolved via thinking tokens redirect
- Subagent spawn isolation — Escudero now publishes in spawned thread, not channel
- Session visibility — reasoning hidden by default (visibility off)

## [0.10.0] — 2026-02-28 Afternoon

### Added
- **T-040: Intelligence Log** — Central intelligence.json with all processed meetings/pulses. MC renderIntelligence() with type filters, search, links to transcripts.
- **Meeting folder structure** — Changed from flat files to `meetings/{slug}/summary.md + transcript.md`. Unified related data.

### Changed
- **Meeting intelligence** — Now stores full transcript from Google Drive alongside processed summary. Skills default to summary, use transcript on demand.
- **Almacenamiento blocks** — Added to company-context, business-model-audit, budget-constraints, market-intelligence (4 skills that were missing folder structure guidance).

### Fixed
- **foundation-state.json** — Removed invalid "draft" state from brand-voice, normalized to "not-started".
- **Intelligence log** — Removed 4 duplicate "fecha-no-especificada" meeting entries, cleaned up to 5 real meetings + 3 pulses.
- **GitHub backup** — Unified to single root ~/.openclaw/ repo with git push on daily backup cron.


## [0.10.1] — 2026-03-01 Early Morning

### Added
- **T-039: Public doc access via Tailscale Funnel** — Docs accessible from internet without VPN. `/mc/docs` exposed on https://sancho-cmo.taild48df2.ts.net:8443/mc/docs/, while full dashboard remains tailnet-only.

### Changed
- **Tailscale config** — Serve and Funnel now work in tandem: port 443 for internal, port 8443 for public.

