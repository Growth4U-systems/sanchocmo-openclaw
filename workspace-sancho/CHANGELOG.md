# CHANGELOG — SanchoCMO

Formato: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
Scope: Features y cambios del producto SanchoCMO. Actividad operativa por cliente → Mission Control Activity.

---

---

## [3.2.0] — 2026-05-03

### 🚀 Content Engine Fase B + Task System + Slack Integration

Semana de consolidación del Content Engine con drafts-as-docs, editorial dispatch inteligente, integración Slack completa, y una reescritura profunda del sistema de tareas en Mission Control.

### Added

#### Content Engine — Fase B
- **ContentTask UI** — Panel kanban para gestionar tareas de contenido con visor de borradores integrado.
- **Drafts-as-docs** — Los borradores generados se almacenan como documentos navegables en MC, no como blobs en JSON.
- **"Generar drafts" button** — Crea borradores específicos por canal desde una idea aprobada.
- **Draft cards + iteration system** — Tarjetas visuales para ideas aprobadas con sistema de iteración (v1, v2…).
- **Auto-generate drafts** — Al aprobar una idea, se generan borradores y se crea la tarea automáticamente.
- **Editorial Dispatch cadence-aware** — Selección de ideas respeta la cadencia configurada por slot/canal.
- **Content Engine Setup skill** — Nuevo skill que puebla configs existentes en vez de crearlas desde cero.
- **Visual forms for CE configs** — Formularios visuales para configurar el Content Engine (adiós YAML manual).

#### Slack Integration
- **Slack end-to-end** — Integración completa: auth, channel selector en Inputs, detección en APIs panel.
- **APIs panel** — Slack y Discord categorizados en "Comunicación"; fix de falso positivo en detección Slack.

#### Task System (Mission Control)
- **Task Index panel** — Vista completa de todas las tareas (anchors) desde Settings.
- **Task Slide-Over** — Ver detalles de tarea sin salir de la página actual.
- **Clickable links en Task Index** — Doc abre visor, skill abre página del skill.
- **Task link button (📋)** — Botón en filas de documentos Foundation para ir a la tarea asociada.
- **Task/project link en todas las superficies** — Acceso a tarea desde cualquier vista de documento.

#### UI — Mission Control
- **Inputs tab** — Editores basados en prompts + banners de contexto + panel de gestión de crons.
- **Estrategia tab unificada** — Pillars + Strategy fusionados en una sola pestaña "Estrategia".
- **Last-edited date** — Fecha de última edición visible en todas las vistas de documentos.
- **POV Bank + idea-builder consolidado** — POV Bank integrado con idea-builder y prerequisitos de skills.
- **Content Engine UI** — Perfiles unificados, Calendar, Setup card, cadencia editable, Ideas refactor.

### Changed
- **content-pillars skill** — Reescrito con metodología de 5 capas. Output como markdown legible con quality checklist (no YAML dump).
- **resolveFullThreadConfig** — Refactorizado como single source of truth para TODAS las resoluciones de hilos.
- **Task index** — Refactorizado para resolución O(1) de hilos (eliminado escaneo lineal).
- **InputsTab** — Muestra configs del cliente, no system prompts.
- **News + PAA configs** — Prompts dinámicos en vez de keywords estáticas.

### Fixed
- **Foundation tasks** — Añadidas tareas faltantes para docs huérfanos.
- **Fast Foundation task** — Links corregidos a documentos reales; eliminados attachments incorrectos.
- **Task statuses** — Estados correctos + botón back para rutas content/.
- **Thread click** — Abre chat sidebar in-place sin navegación.
- **Task Slide-Over** — Abre tarea con chat, eliminado botón de doc redundante.
- **Doc slide-over** — Ya no se abre automáticamente al cargar la página de tareas.
- **Pillar threads** — Resuelven task + doc correctamente desde projectsData.
- **Task button** — 2 bugs encontrados y corregidos via debug trace completo.
- **Responsive layout** — ContentDocsTab corregido para móvil.
- **Toast UI crash** — Fix de crash + añadidos botones chat/open en docs de Estrategia.

---

## [3.1.0] — 2026-04-26

### 🚀 Content Engine — Sistema de motor de contenido multi-tenant

Motor de contenido completo construido sobre el sistema de tareas recurrentes de OpenClaw. 8 crons replicables por cliente, skills dedicados, y panel de control en Mission Control.

#### Arquitectura y docs
- **Content Engine system** — Motor de 8 crons (news-monitor, paa-monitor, thief-marketers, daily-pulse, insight-classifier, insight-to-content-mapper, editorial-dispatch, pov-bank-refresh). Todos multi-tenant, idénticos en estructura para cualquier cliente.
- **content-engine-architecture.md** — Documento de arquitectura del motor completo.
- **content-engine-cron-jobs.json** — Definiciones de los 8 cron jobs con skill, schedule, y variables por cliente.
- **content-engine-crons.md** — Guía de replicación para nuevos clientes.
- **content-engine-plan.md** — Plan de ejecución completo.

#### Scripts y setup
- **content-engine-setup.js** — Script reusable multi-tenant: `--list` (dashboard de readiness), `--slug X` (onboard un cliente), `--all` (todos), `--dry-run` (preview). Detecta Foundation completeness, crea estructura de carpetas (14 dirs + 2 JSON), añade 5 crons por cliente, skippa los que ya tienen CE o carecen de config. Tres clientes onboardados: hulahoop, hospital-capilar, paymatico. Growth4U ya tenía sus 5 crons activos. Total crons: 59 (era 39).

#### UI — Mission Control
- **Endpoints API nuevos**: GET/PUT `/api/content-engine/pillars`, GET/POST/PATCH `/api/content-engine/ideas` (CRUD con filtros por status), GET `/api/content-engine/signals` (research-signals con filtro por fecha).
- **PillarsTab** — Muestra pilares con funnel_role badges (top/middle/bottom), expande pain_origin/expertise/subtopics. Empty state cuando no hay pilares definidos.
- **IdeaQueueTab** — Cola de ideas completa con botones approve/discard inline, barra de confianza, filtro por status. Funciona sin Discord — approvals desde MC escriben al mismo idea-queue.json que usan los crons.
- **Content Creation Page** — 5 tabs: Pillars | Strategy | Inputs | Ideas | Calendar. Tab por defecto: Pillars. Decisión de diseño: approval agnóstico de canal (MC, Discord, cualquier canal → mismo JSON).

### Added
- **5 skills nuevas**: `news-monitor` (Brave/Perplexity, búsqueda diaria por pilar), `paa-monitor` (DataForSEO, extracción semanal de People Also Ask), `thief-marketers` (monitorea competidores Y creadores de referencia, extrae el POR QUÉ del contenido top), `social-writer` (LinkedIn + X con Clarify embebido, ángulo diferente por plataforma — no reformateo), `video` (generación de prompts para video AI con references/ai-video-prompting.md).
- **2 skills extendidas con addendums CE**: `daily-pulse` (escritura dual a legacy + nuevo path research-signals), `content-calendar-planner` (Editorial Dispatch Mode: recency-aware, stale policy 14 días, Discord dispatch con Idea Approval Loop).
- **3 skills extendidas con addendums CE**: `insight-to-content-mapper` (Idea Generation Mode para cron: signal → angle_draft + confidence → idea-queue.json), `seo-content` + `newsletter` (Clarify Protocol addendums: preguntas por canal antes de generar).
- **POV Bank monthly cron** (día 1, 9am) — Analiza patrones en clarify-history.json y propone refinamientos de Brand Voice.
- **Keyword Research weekly cron** (Monday 6am, Growth4U) — BOFU-first keyword research por pilar usando keywords-seed configs. Separado del PAA Monitor (keywords = volumen/dificultad; PAA = preguntas para ideas).

### Changed
- **Insight-to-content-mapper** — Modo Idea Generation para cron (más ligero, sin full brief).
- **Content-calendar-planner** — Editorial Dispatch Mode con recency-aware selection y stale policy.
- **`clarify-protocol.md`** — Addendum para skills con lógica de preguntas por canal (keyword/structure/gating para blog; theme/tone/CTA para newsletter).
- **Referencia `linkedin-formats.md`** y `x-formats.md` añadidas a social-writer.

### Fixed
- **Crons duplicados** — 2 crons que faltaban en content-engine-setup.js añadidos (POV Bank + Keyword Research). Total: 61 crons.
- **Clarify en writers** — seo-content y newsletter ahora siguen clarify-protocol.md antes de generar.

---

## [3.0.0] — 2026-04-10

### 🚀 MC Dashboard — Migración completa a Next.js

La migración de Mission Control de HTML monolítico (~9500 líneas) a **Next.js 14 (Pages Router)** está completa. Este es el release más grande en la historia de SanchoCMO: 139 archivos de código, ~24.000 líneas nuevas, ~60 API endpoints.

**Repo:** `github.com/Growth4U-systems/sanchocmo-openclaw` (branch `alfonso-10-abril`)

### Added
- **MC Dashboard Next.js** — Aplicación completa en Next.js 14, TypeScript, Tailwind CSS, Zustand, TanStack Query. Reemplaza MC-Legacy (HTML).
- **Dashboard V2** — Vista principal con 3 columnas: brand snapshot, métricas en tiempo real, próximos pasos.
- **Foundation Browser** — File tree interactivo + doc viewer + markdown editor para los 15 pilares de estrategia. Endpoints: `pillar-status`, `pillar-docs`, `other-docs`, `download`, `state`.
- **Projects CRUD completo** — Lista de proyectos con tareas colapsables, detail page por proyecto, task detail con edición inline (status, priority, notes, execution tasks). Endpoints: `create-batch`, `create-execution-tasks`, `create-tool-project`, `task-status`, `task-update`, `project-update`, `project-archive`.
- **Idea Bank** — Banco de ideas con gestión de estados y filtros. Endpoint: `/api/ideas/status`.
- **Trust Engine** — Score de confianza con signal cards mejoradas.
- **Atalaya** — Inteligencia competitiva integrada en el dashboard.
- **Metrics** — Vista de métricas por cliente. Endpoint: `/api/metrics`.
- **Chat con Sancho** — Sistema de chat integrado con sidebar, skill picker, quick actions, conversation starters. Endpoints: `/api/chat/mark-read`, `/api/chat/quick-actions`.
- **Skills Page** — Nueva página de detalle de skills en `/dashboard/[slug]/skills/[skillId]`.
- **Settings Panel** — 7 paneles de configuración: agents, skills, strategies, dispatch, API connect, recurring tasks, API catalog. Slideover UI.
- **Cron Insights Feed v2** — Feed de insights de crons con visualización mejorada y recommendations tab.
- **Recurring Tasks Panel** — Gestión expandida de tareas recurrentes en settings.
- **Admin Pages** — Activity log (`/admin/activity`), system settings (`/admin/settings`).
- **System APIs** — 14 endpoints en `/api/system/*`: agents, skills, strategies, dispatch, costs, changelog, health-check-all, api-catalog, api-connect, connect-proxy, cron-toggle, recurring-tasks, activity, integrations-summary.
- **Auth** — NextAuth.js con signin flow (`/auth/signin`).
- **Pagos con Polar.sh** — Checkout, portal, subscription, webhook. 4 endpoints en `/api/polar/*`.
- **DB con Drizzle ORM** — Schema PostgreSQL: user, session, account, verification, subscription, client. Config en `drizzle.config.ts`.
- **i18n** — Soporte español/inglés con next-intl. Mensajes en `src/messages/`.
- **Páginas públicas** — Pricing, terms of service, privacy policy, payment flow, success page.
- **Upload de imágenes** — Endpoint `/api/upload-image` (preparado para R2).
- **Integración OpenClaw** — Repo unificado con agents (cervantes, escudero, rocinante, sancho, main), cron jobs, workspaces, plugins, discord, flows.
- **MIGRATION-PENDING.md** — Documento de items pendientes para deploy.

### Changed
- **Sidebar** — Replica fiel de la estructura del MC-Legacy con navegación mejorada. Links clickeables navegan en vez de abrir chat.
- **Skill Resolver** — Refactored y simplificado.
- **Chat Openers** — Nuevos conversation starters contextuales.
- **Project Cards** — Colapsables, click en header para toggle de tareas.
- **Task Rows** — Clickeables como links al detalle de la tarea.
- **Recommendations** — Action buttons integrados, sección Atalaya standalone eliminada.
- **.gitignore** — Unificado para Next.js + OpenClaw (sin secrets).

### Fixed
- **10+ bugs de QA** — Sidebar, project cards, task rows, recommendations, foundation state, TDZ errors, static file routing.
- **Foundation state endpoint** — Corregido para reflejar estados reales de pilares.
- **NextAuth session** — Soporte en API middleware.
- **MC admin static routing** — JS/CSS servidos correctamente después de URL rewrite.

### Infrastructure
- **Stack**: Next.js 14.2, Pages Router, TypeScript, Tailwind CSS, Zustand, TanStack Query, NextAuth, Drizzle ORM, Polar SDK, next-intl
- **DB**: PostgreSQL (Drizzle migrations pendientes)
- **Deploy pendiente**: Vercel recomendado. Necesita: DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, POLAR_ACCESS_TOKEN, POLAR_WEBHOOK_SECRET, POLAR_ORGANIZATION_ID
- **QA**: 18 screenshots del UI, 20 API endpoints verificados

---

## [2.9.0] — 2026-03-29

### Added
- **Trust Engine v5** — Complete rewrite as native OpenClaw skill (no backend Python). 10 subcommands, MC inline page with sidebar integration, 3 API endpoints (`run-state`, `module`, `save`). First real-data execution: DataForSEO keyword enrichment (20 keywords), Serper.dev SERP analysis (18 keywords), GEO via Gemini, social profiles audit. v2 re-run after shallow v1 flagged.
- **MC Chat Plugin (`mc-chat`)** — Channel plugin shipped and deployed. Full persistence (`brand/{slug}/chat/{id}.json`), structured dispatch context, multi-message delivery. Replaces stateless `openclaw agent -m`.
- **MC Projects: Detail Page** — Click project opens full-page view with header (status/phase/strategy/review), objective, metrics, progress bar, task cards with status pills, 💬 Chat + ✏️ Edit buttons, back navigation.
- **MC Projects: Archiving** — 📦 archive button per project with optional reason prompt. New `POST /api/projects/project-archive` endpoint. Archived projects hidden from main list, shown in collapsible "📦 Archivados" section.
- **MC Notification System (server-side)** — `notifyProjectChange()` fires on task/project status changes. Notifies correct MC Chat thread via `sourceThread` parameter + queues Discord notification in `_system/notification-queue.jsonl`.
- **MC Sidebar Reorganization** — New structure: Foundation | **Trabajo** (Proyectos, Idea Bank, Recurrentes) | **Datos** (Métricas, Trust Engine, Campañas, Supabase) | Sistema.
- **`alarife-integration` skill** — New skill for Alarife integration (421 lines).
- **`frontend-slides` deploy + export** — `deploy.sh` (218 lines) for deployment and `export-pdf.sh` (418 lines) for PDF conversion.
- **MC Smoke Test script** — `scripts/mc-smoke-test.sh` for automated MC health checks.
- **Outbound System PDR** — `_system/prds/outbound-system-pdr.md` — architecture spec for outbound pipeline.
- **Idea Generation spec** — `_system/prds/idea-generation-spec.md`.
- **MC Chat v2 WIP** — Next-gen chat plugin scaffolded in Cervantes workspace (`plugins-wip/mc-chat-v2/`).

### Changed
- **MC Doc Viewer: Relative Link Rewriting** — `renderMarkdown()` accepts `docContext` (slug + docsBase). Absolute-path links in brand docs rewrite to MC internal paths. Non-existent content renders as red links (strikethrough + "pendiente" label).
- **MC Server-Side Markdown** — New `simpleMarkdownToHtml()` replaces client-side-only rendering. Full support: headers, bold/italic, links, code blocks, tables, lists, blockquotes. Works as fallback when browser blocks CDN (Brave).
- **SOUL.md** — Added Principio 8: AI-speed time estimates (Foundation pillar = 5-15 min, not weeks). Added Rule 15: mandatory user mention + MC tokenized links on task completion.
- **TOOLS.md** — Added "Entrega de resultados (P0)" section with mandatory delivery format (mention + links).
- **3 skills: AI-speed timelines** — `strategic-plan` ("Semana 1-4" → "Día 1-2"), `keyword-research` ("weeks 1-12" → action-based batches), `insight-to-content-mapper` ("this week/2 weeks" → "next action/after batch").
- **`claude-api` skill** — Updated across all 7 language references (Python, TypeScript, Go, Java, PHP, Ruby, C#, curl).
- **`last30days` skill** — YouTube adapter improvements + new tests.
- **`idea-generation` skill** — Updated SKILL.md.
- **MC Chat spawn mechanism** — Replaced `execCb` with `spawn` for agent CLI calls. Added explicit PATH with `/opt/homebrew/bin` to env.
- **MC server notification routing** — All task/project API endpoints now pass `sourceThread` for correct MC Chat thread targeting.
- **12 ClawHub skill versions bumped** — apify, apollo, google-ads, google-analytics, google-search-console, gsc, larry, meta-ads, metricool, native-google-analytics, nano-banana-pro, connect-api.

### Fixed
- **MC Documents blank page (critical)** — Two root causes fixed: (1) Race condition in `renderDocBrowserRoot` — `innerHTML` assignment after async `fetch()` wiped content; moved assignment before fetch. (2) Missing CORS headers — added `Access-Control-Allow-Origin: *` to all 13 MC server HTML endpoints.
- **MC Chat shell escaping** — Messages with quotes/newlines/special chars broke `execCb` shell command. Fixed by switching to `spawn`.
- **`nano-banana-pro` skill** — Reinstalled via ClawHub after accidental removal in 2.8.0.

---

## [2.8.0] — 2026-03-27

### Added
- **Dashboard v2** — Complete redesign with Okara-inspired 4-column layout. Sidebar (brand + nav), Activity bar (collapsible event feed), Columns: (1) Foundation interactive with onboarding URL input + clickable pillars (▶️ start, 📄 doc, 👁️ review), (2) Metrics dual-mode (PageSpeed insights for no-plan, API metrics plan with funnel visualization), (3) Next Steps (⚡Ahora urgent actions + 📋Strategies + ❓Decisions), (4) Chat with Sancho (thread system). Mobile responsive (hamburger + tab bar). 9 mockup iterations (Mar 24).
- **MC Chat Plugin (`mc-chat`)** — OpenClaw channel plugin connecting MC dashboard to Sancho. Full persistence (`brand/{slug}/chat/{id}.json`), structured dispatch context, multi-message delivery. Replaces stateless `openclaw agent -m`. 3 crash bugs fixed (capabilities, listAccountIds, send runtime).
- **Chat Thread System** — Backend JSON persistence + frontend polling (1.5-3s). Thread types: Foundation (`{slug}:{pillar}`), Projects, Tasks, Ideas, Recurring, Free. Pinned doc bar for Foundation threads. Agent visual ID (🤠 Sancho, ⚔️ Escudero, 🐴 Rocinante, ✒️ Cervantes). 💬 buttons on all Foundation pillars, projects, tasks. Universal `mcChatSidebar` module with Free/Locked modes.
- **Metrics Plan System** — Plan-driven metrics dashboard. `integration-mappings.json` defines 12 integrations (GA4, GSC, Meta Ads, etc.) with funnel step mappings. `generate-plan.js` auto-generates `metrics-plan.json` per client archetype (SaaS, Fintech, Marketplace, E-commerce, Lead-to-Sale). 5 archetype templates with funnels + benchmarks. MC renders funnel visualization + categorized KPIs (Traffic, SEO, Paid, Social, CRM).
- **`/api/metrics-plan`** — Returns client's `metrics-plan.json` with archetype, funnel, KPIs, connected modules, missing integrations.
- **`/api/metrics` plan field** — Metrics API now includes plan data + archetype templates from integration-mappings.
- **Metrics Dashboard Features** — Date range selector (Ayer | 7 días | 30 días | Todo), sortable ad tables (Campaigns/Ad Sets/Creatives), Leads + CPL columns on ads, per-channel view (Facebook Ads, Instagram, Organic Search, etc.), GHL meetings from pipeline stages (Closer pipeline).
- **Chat API Endpoints** — `GET /api/mc-chat/threads/{slug}`, `GET /api/mc-chat/thread/{id}`, `POST /api/mc-chat/thread`, `POST /api/mc-chat/send`, `GET /api/mc-chat/doc/{path}` (for pinned doc raw content). All portal-allowed.
- **Server-Side Markdown Rendering** — `simpleMarkdownToHtml()` in mc-server.js (headers, bold, italic, links, code, tables, lists, blockquotes). Fallback for Brave browser blocking `marked.js` CDN.
- **SanchoCMO Logo** — 4 final icon candidates generated (steampunk comic Sancho). Voting sheet created. Iterations: circular rust border, rounded square dark bg, detailed cartoon brown bg, simpler cartoon white bg.

### Changed
- **Dashboard responsive** — Sidebar hidden with ☰ on mobile (<900px), tab bar for columns, 2x2 grid on tablet. Fixed hardcoded `position:fixed; left:220px` with `!important` override.
- **Foundation pillar links** — All doc links now use `${MC_BASE}/docs/...` (auto-detects admin/portal mode). Fixed hardcoded `/mc/docs/` breaking in admin route.
- **GHL adapter** — New contacts tracked per channel via `attributions[0].medium/utmSessionSource`. Metrics output includes `newContacts` with `dimensions: { channel }`.
- **`acquisition-metrics-plan` skill** — Added Step 7.5 (generate metrics-plan.json via generate-plan.js), Step 8 (integration discovery flow with MC connect links). Output: 3 deliverables (plan.md + plan.json + XLSX template). Context Lake: metrics-plan.json + integration-mappings.json.
- **Visual Identity direction** — Evolved from "Sancho Futurista Light" (Mar 8) → "Steampunk Hybrid" (Mar 16, Martin approved) → Logo iteration (Mar 25). Final doc update pending logo vote.

### Fixed
- **`mc-chat` plugin crashes** — (1) Missing `capabilities` → `nativeCommands` TypeError, (2) Missing `config.listAccountIds` → health monitor crash loop, (3) `_runtime.chat.send()` doesn't exist → replaced with `dispatchInboundMessageWithBufferedDispatcher`.
- **Metrics meetings count** — GHL `/calendars/events` returns 0 with Private Integration Tokens (API bug). Fixed by counting from **Closer pipeline** opportunities in meeting stages ("agendad", "confirmad", "seguimiento"). Result: 4 meetings (was 0).
- **Brave browser markdown** — CDN blocked `marked.js` (cdn.jsdelivr.net). Added server-side markdown rendering as fallback.
- **Ads table styling** — Added `sortable-ads-table` class (compact 12px font, proper padding, hover, scroll on overflow).

### Removed
- **`nano-banana-pro` skill** — Removed Mar 25, then reinstalled via clawhub. Images now via internal `tool-image-generation` pipeline.

---

## [2.7.0] — 2026-03-22

### Added
- **`larry` skill** — App growth agent with TikTok posting, RevenueCat integration, analytics loop, competitor research, slide generation, and daily reports. Includes 6 scripts and 5 reference docs.
- **`tiktok-growth` skill** — TikTok-specific growth playbook with analytics, competitor research, content slides, posting automation, and onboarding flow. Full script suite + references.
- **`metricool` skill** — Metricool API integration for social media scheduling, best-time analysis, brand listing, and scheduled post management. 4 scripts (schedule-post, best-time, get-brands, list-scheduled).
- **`apify` skill** — Run Apify Actors (scrapers, crawlers, automation) via REST API with curl. Includes full OpenAPI spec.
- **`gsc` skill** — Google Search Console direct integration with Python scripts for auth and query (impressions, clicks, CTR, position). Service Account based.
- **`native-google-analytics` skill** — Native GA4 integration via Python + Google Analytics Data API. Direct property queries without third-party wrappers.
- **`instagram-content` skill** — Instagram content creation guidelines and templates.
- **`linkedin-content` skill** — LinkedIn post creation with format templates and best practices.
- **`twitter-content` skill** — Twitter/X content creation skill with thread and single-tweet formats.
- **`niche-presentation` skill** — Niche market presentation generator with slide templates.
- **`new-client-protocol.md`** — Full onboarding protocol: data collection → Discord setup (template + bot invite) → `new-client.sh` automation → verification. Eliminates manual improvisation.
- **Escudero PRD suite** — 7 PRD documents for Escudero bot architecture: consolidated PDR, architecture decisions, bot spec, executive summary, integration flows, QA responses, and v1 spec.
- **Bots Engagement PDR** — Product design review for Discord bot engagement patterns.

### Changed
- **SOUL.md** — Added P0 rule #14: mandatory `read()` for skill `references/` files. Fixed MC portal URL pattern to always include `brand/{slug}/` after `/docs/`.
- **`mc-links-protocol.md`** — Updated URL patterns: all doc paths now require `brand/{slug}/` segment. Added explicit correct/incorrect examples.
- **`project-threads-protocol.md`** — Added playbook link to task thread first messages. Added thread rename protocol on state changes (✅/❌/⛔/🔧 prefixes). Added bidirectional sync requirement (Discord thread name ↔ JSON status ↔ MC).
- **`competitor-intelligence` skill** — Major refactor with new scraping reference guide. Backed up v4.1 before changes.
- **`ad-creative` skill** — Updated with refined templates and guidelines.
- **`lead-magnet` skill** — Consolidated (replaced separate `lead-magnets` skill).
- **`insight-to-content-mapper` skill** — Updated mapping logic.
- **`strategic-plan` skill** — Updated data model references.
- **`content-calendar-planner` skill** — Minor update.
- **`metrics-collector` adapters** — Updated GA4, GHL, and Meta Ads adapters with fixes and improvements.
- **`last30days` skill** — Updated Bluesky scraping library and tests.
- **`clients.json`** — New client entries added.

### Removed
- **`content-miner` skill** — Removed (SKILL.md + 3 reference files). Functionality covered by other content skills.
- **`lead-magnets` skill** — Removed (consolidated into `lead-magnet`).
- **`product-marketing-context` skill** — Removed (SKILL.md + evals).
- **Legacy workspace cleanup** — Removed old `brand/`, config backups, and obsolete files (commit `3a02685`).

---

## [2.6.0] — 2026-03-15

### Added
- **`metrics-collector` skill** — Multi-adapter metrics collection system with 7 adapters (GA4, GSC, Metricool, Meta Ads, GHL, Instantly, Google Sheets). Collects daily metrics, stores rolling 90-day JSON, supports Google Sheets sync.
- **`connect-api` skill** — Triggers on "conecta/vincular/integrar" + API name. Maps colloquial names to catalog IDs, responds with tokenized MC link. Enforces P0: never asks for credentials in chat.
- **`strategic-plan` skill** — Project planning with task breakdown, channel mapping, owner assignment, and review dates.
- **Morning Metrics cron** — Automated daily metrics report (weekdays 08:30) with thread-based delivery to client #intelligence channels.
- **Mission Control: Projects UI** — New `/projects` route with two views: expandable project cards ("Por Proyecto") and Kanban board ("Por Tarea") with drag-and-drop (desktop) and dropdown selects (mobile). Edit modals for tasks and projects. 4 new API endpoints.
- **Mission Control: Google Workspace OAuth** — Custom OAuth flow via `gog` CLI with 3 new endpoints (`gog-auth-start`, `gog-auth-complete`, `gog-accounts`). No terminal needed for client setup.
- **Mission Control: System API override buttons** — Changed inline checkbox+form to link buttons opening `/mc/connect/{slug}/{apiId}`.
- **40+ new skills from ClawHub/3rd-party** — ab-test-setup, ad-creative, ai-seo, canvas-design, churn-prevention, cold-email, competitor-alternatives, content-strategy, copy-editing, copywriting, doc-coauthoring, docx, email-sequence, form-cro, free-tool-strategy, frontend-design, internal-comms, launch-strategy, lead-magnets, marketing-ideas, marketing-psychology, mcp-builder, onboarding-cro, page-cro, paid-ads, paywall-upgrade-cro, pdf, popup-cro, pptx, product-marketing-context, programmatic-seo, referral-program, revops, sales-enablement, schema-markup, seo-audit, signup-flow-cro, site-architecture, skill-creator, slack-gif-creator, smart-scrape, social-content, theme-factory, web-artifacts-builder, webapp-testing, xlsx.
- **4 new system protocols** — `mc-links-protocol.md` (tokenized URL resolution), `morning-metrics-protocol.md`, `presentation-summary-protocol.md`, `project-threads-protocol.md` (Discord thread ↔ MC project sync).

### Changed
- **SOUL.md** — Added P0 rule for API connection security (never ask credentials in chat, always redirect to MC). Added `connect-api` skill routing. Moved inline API connection rules to dedicated skill.
- **TOOLS.md** — Updated with MC link patterns and tokenized URL conventions.
- **Morning Metrics cron** — Migrated from `sessionTarget: "main"` to `"isolated"`, switched model from Minimax to Sonnet 4.5, added explicit thread-create pattern to prevent channel spam.
- **`foundation-protocol.md`** — Updated prerequisite checks and gate logic.
- **`brand-memory.md`** — Updated cross-pillar reference patterns.

### Fixed
- **MC access control** — `/connect/*` and API routes were blocked by auth middleware (403). Added whitelist for public-facing routes (already protected by Tailscale).
- **MC mobile JS crash** — Broken template literal string in `gogStep1()` crashed all page JavaScript. Fixed with `window._gogAuthUrl` variable and fallback copy method for mobile/insecure contexts.
- **`metrics-collector` adapter config** — Fixed camelCase vs UPPER_CASE key mismatch, nested `integrations.dataSources` path, and env var slug prefix stripping.

---

## [2.5.0] — 2026-03-11

### Added
- **API Connection System** — Self-service `/mc/connect/{slug}/{apiId}` pages for 30+ APIs (GA4, GSC, Meta Ads, Google Ads, HubSpot, Stripe, etc.) with step-by-step setup guides.
- **System Service Account for Google APIs** — Shared SA across all clients. Client only needs to grant Viewer access + Property ID. No per-client key management.
- **First GA4 connection via MC** — End-to-end self-service flow validated.
- **#changelog channel** — Dedicated channel for tracking product changes.

---

## [2.4.0] — 2026-03-10

### Added
- **Daily Crons Backfill** — Daily Pulse and Meeting Intelligence crons caught up (8 pulse reports + 6 meeting summaries generated).

### Fixed
- **Cron timeout handling** — Crons that exceed 60s now continue in background instead of failing silently.

---

## [2.3.0] — 2026-03-08 / 2026-03-09

### Added
- **`frontend-slides` skill** — Zero-dependency HTML presentations with 12 style presets and PPT conversion support. Adapted for Discord flow (no interactive prompts).
- **Presentation template system** — `skills/frontend-slides/templates/` with brand theme resolver (auto-reads client visual-identity), competitor deep-dive spec, and Foundation Report templates.
- **8 Foundation Report slide templates** — Cover, Index/TOC, Section Divider, Gap Analysis Table, Competitor Landscape, Competitor Deep-Dive (2-col), SWOT+TOWS (single slide), OPE Canvas. All dynamically themed per client.

### Changed
- **Presentation design standards** — Dense layout (no excessive whitespace), real platform logos via Google Favicon Service (base64 embedded), brand colors from visual-identity, functional MC doc links, dark bg covers matching section dividers.

---

## [2.2.0] — 2026-03-05 / 2026-03-06

### Added
- **Tailscale Funnel for /mc** — Mission Control now publicly accessible (no VPN required for doc links).
- **`composition-rules.md`** — New reference for visual-identity skill with layout and visual hierarchy rules.

### Changed
- **`niche-discovery-100x` skill v4.0** — Complete rewrite. Clusters by NEED not PERSON. Solution Filter replaces ICP Filter. Reachability = Trust Map → Search Map → Channel Map (with named influencers, communities, newsletters, podcasts, events). Scoring: Pain×0.35 + Reachability×0.40 + SAM×0.25. Founder Moat = badge qualifier, not in formula.
- **`positioning-messaging` skill v5.0** — Mandatory anchor linking (#N → shared doc). Assets/Value Criteria now global (no per-ECP duplication). Bidirectional links required between shared and per-ECP docs.
- **`visual-identity` skill** — Major update. Added composition-rules reference, improved prompt and checklist.

---

## [2.1.0] — 2026-03-04

### Added
- **`acquisition-metrics-plan` skill** — Metrics plan design with API catalog, setup guides, Excel template generator, and connection tester.
- **`growth4u-ui-system` skill** — Visual design system for branded content generation.
- **`growth4u-visual-generator` skill** — Template generator for branded visuals (LinkedIn posts, carousels, etc.).
- **`gsc` skill** — Google Search Console integration with Python auth and query scripts.
- **`native-google-analytics` skill** — GA4 native integration with Python auth and query scripts.
- **`railway` skill** — Railway deployment skill with setup, deploy, configure, operate, and API references.
- **Diagnostic quiz architecture** — Patient routing quiz framework: questions → classification → offer mapping (consult, call, or paid diagnostic). Reusable across clients.

### Changed
- **AGENTS.md** — Major rewrite. Streamlined memory, safety, group chat, and formatting rules.
- **SOUL.md** — Added Regla 13: critical operations alert when exec/gateway/cron requested from client guilds (security).
- **TOOLS.md** — Comprehensive rewrite. Discord mechanics, brand file paths, multi-client routing, progress update rules.
- **`_system/dispatch-protocol.md`** — New dispatch protocol for agent routing.
- **`_system/token-optimization-guide.md`** — New guide for reducing token usage across agents.

### Fixed
- **QA Bot** — Caught critical math errors in Foundation SAM calculations before client approval.

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
- **56 skills migrated** — All context_required and context_writes paths updated to v2.0 directory structure.
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
- **OPE Canvas skill** — One-Page Endgame (15th Foundation pillar). 14 sections with Moats framework (7 types).
- **DataForSEO integration** — SEO data for competitor analysis (SERP, backlinks, keywords). Balance $35.
- **Gate Check** — Block pillar execution if dependencies not approved. Reads foundation-state.json.
- **Automatic next-pillar flow** — Approve → update JSON → regenerate MC → launch next pillar automatically.
- **MC live-reload** — Reads foundation-state.json every 30 seconds.
- **Competitor Intelligence v2** — Validate competitors with domains/socials before scraping. Apify mandatory.

### Changed
- **Foundation order** — 15 pillars in 5 categories: La Empresa (4) + OPE Canvas (1) + El Mercado (3) + Los Clientes (3) + La Marca (4).
- **Approval triggers** — Expanded to include "validamos", "avancemos", "dale", "vamos", "next", etc.
- **Competitor Intelligence flow** — Step 0 presents all competitors with URLs before scraping.

### Fixed
- **Gate check prevents out-of-order execution** — SWOT no longer runs without validated competitors.
- **Thread auto-joining** — Mention user in first message so they join automatically.
- **foundation-state.json updates** — Automated MC read + explicit reminder in SOUL.md.

---

## [0.10.1] — 2026-03-01

### Added
- **Public doc access via Tailscale Funnel** — `/mc/docs` exposed publicly while full dashboard remains tailnet-only.

### Changed
- **Tailscale config** — Serve (port 443 internal) + Funnel (port 8443 public) working in tandem.

---

## [0.10.0] — 2026-02-28

### Added
- **Intelligence Log** — Central intelligence.json with processed meetings/pulses. MC renders with type filters, search, and transcript links.
- **Meeting folder structure** — `meetings/{slug}/summary.md + transcript.md` replacing flat files.

### Changed
- **Meeting intelligence** — Stores full transcript from Google Drive alongside summary.
- **Almacenamiento blocks** — Added to company-context, business-model-audit, budget-constraints, market-intelligence.

### Fixed
- **foundation-state.json** — Removed invalid "draft" state, normalized to "not-started".
- **Intelligence log** — Removed 4 duplicate entries, cleaned to 5 meetings + 3 pulses.
- **GitHub backup** — Unified to single root repo with git push on daily backup cron.

---

## [0.9.1] — 2026-02-28

### Changed
- **SOUL.md restructured** — Reduced from 531 to 99 lines. Procedures moved to `_system/`.
- **Discord threading refactored** — Subagent spawns create thread-bound sessions (`thread: true`).
- **Thinking defaults enabled** — `thinkingDefault: low` — intermediate reasoning goes to thinking tokens, not chat.

### Added
- **TOOLS.md Discord Mechanics** — Guide to NO_REPLY, thinking tokens, thread-bound delivery.
- **Escudero TOOLS.md** — Discord threading behavior for subagent spawns.

### Fixed
- **Discord text leaks** — Between tool calls, resolved via thinking tokens redirect.
- **Subagent spawn isolation** — Escudero publishes in spawned thread, not channel.

---

## [0.9.0] — 2026-02-28

### Fixed
- **Folder naming consistency** — `swot/` → `swot-analysis/`, `niche-discovery/` → `niche-discovery-100x/`.
- **Markdown rendering** — Replaced artisanal regex with marked.js (CDN). Fixes bullet spacing in complex lists.

### Changed
- **Regla 0h** — "Honestidad absoluta sobre herramientas y fuentes". Never claim tool usage if not executed.

### Removed
- **Legacy docs** — Moved to `_archive/`.

---

## [0.8.0] — 2026-02-27

### Added
- **Document versioning** — Each pillar in `brand/{slug}/{pilar}/current.md` + `v1.md`, `v2.md`... + `history.json`.
- **Path resolution** — `brand/{slug}/market.md` auto-resolves to `brand/{slug}/market/current.md`.

---

## [0.7.0] — 2026-02-27

### Added
- **Regla 0b (Inline citations)** — All web-sourced data requires URL + Fuentes section.
- **Regla 0c (Silent operations)** — No intermediate narration in Discord. Start + result only.
- **Regla 0d (Mandatory QA)** — Rocinante validates all documents before delivery. Rejects broken URLs or missing sources.
- **`qa-document-checklist.md`** — Citation, URLs, completeness, coherence, brand alignment, format scoring.
- **Link rendering in doc viewer** — Markdown links now rendered as `<a href>` everywhere including tables.

---

## [0.6.0] — 2026-02-27

### Added
- **Mandatory citation rules** — All Foundation analysis skills require verified URL sources + `## Fuentes` section.
- **`deep-research` skill** — Universal Foundation enricher. 10-20 searches per section, same format output with verified sources.
- **"¿Quieres profundizar?" block** — Added to 13 Foundation skills post-completion.
- **Skills in doc viewer** — Click skill card in MC opens SKILL.md.

### Fixed
- **Exec permissions** — `security: full` + `ask: off` globally.
- **3 crons fixed** — cost-tracker, Daily Pulse, Meeting Intelligence thread-create flow.

---

## [0.5.0] — 2026-02-27

### Added
- **Unified TASKS.md with client tags** — Single task file, `[client-slug]` tags for MC filtering.
- **🗑️ Discarded category in Kanban** — With documented reasons.

### Fixed
- **Cost tracker** — cost-tracker.py + cron 23:00 functioning. MC shows per-client and global costs.
- **Client context isolation** — `_system/client-context-isolation.md` + SOUL.md Regla 0.

---

## [0.4.0] — 2026-02-26

### Added
- **Client integrations in MC** — `integrations.json` + expandable setup UI with "Conectar" button.
- **Doc viewer** — `/mc/docs/` serves brand, prds, skills, memory. WYSIWYG editor with save.
- **Meeting Intelligence** — Google Drive meeting processing → .md + meetings.json. MC cards with decisions/actions/insights.
- **Cost tracker v1** — Token/cost tracking per model and client.
- **14 channel systemPrompts** — Per-channel client context, brand paths, thread rules, roles.
- **Foundation threads skill** — Thread-per-pillar for Discord onboarding.
- **7 ClawHub skills installed** — google-ads, meta-ads, google-analytics, google-search-console, apollo, apify, social-media-extractor.

### Fixed
- **Markdown renderer** — Code blocks, paragraphs, blockquotes, numbered lists.
- **5 crons** — Model haiku→sonnet for cost-tracker, healthcheck, dashboard, memory, backup.

---

## [0.3.0] — 2026-02-26

### Added
- **14 welcome messages** — Sent and pinned in all Discord channels.
- **Comic UI in MC** — Parchment bg, Space Grotesk + Nunito, ink borders, halftone dots, dark mode toggle.
- **Task filtering** — System vs client views in MC.

### Changed
- **Architecture 12→4 agents** — Sancho (Opus/CMO), Cervantes (Opus/Architect), Rocinante (Sonnet/QA), Escudero (Sonnet/Worker).
- **dispatch-map.json v3** — Channel roles (decision/execution/intelligence/support).

### Fixed
- **All 56 skills loading** — Descriptions trimmed, broken symlink replaced.

---

## [0.2.0] — 2026-02-24

### Added
- **Mission Control v2** — Form, actionable tasks, agent file viewer.
- **Heartbeat system** — HEARTBEAT.md + heartbeat-state.json.
- **Dispatch map** — dispatch-map.json with channel IDs per agent.

---

## [0.1.0] — 2026-02-24

### Added
- **Core infrastructure** — OpenClaw gateway + LaunchAgent, Discord bot, Tailscale serve.
- **Supabase** — 9 tables, project `psapmujzxhaxraphddlv`.
- **Google Workspace** — gog CLI authenticated.
- **Notion** — API key configured.
- **Auth** — Password + Tailscale allowTailscale.
- **Memory system** — MEMORY.md + memory/*.md + vector search + FTS.
