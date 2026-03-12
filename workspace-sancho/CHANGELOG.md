# CHANGELOG — SanchoCMO

Formato: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
Scope: Features y cambios del producto SanchoCMO. Actividad operativa por cliente → Mission Control Activity.

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
