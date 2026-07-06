# SanchoCMO

**Fractional CMO AI** — A self-hosted multi-agent marketing system. OpenClaw is
the default runtime today; Sancho's core is being split behind a runtime adapter
contract so Hermes, Codex CLI, Claude Code, and other compatible harnesses can
run the same Sancho product.

SanchoCMO operates as an AI-powered Chief Marketing Officer: it onboards clients,
builds brand foundations, plans campaigns, creates content, and tracks metrics.
You operate it through **Mission Control** — a web dashboard where each client
gets a chat that talks directly to Sancho. Discord and Slack are optional
notification/publishing channels, not requirements.

SanchoCMO is open source and follows semantic versioning; **v1.0.0** is the
first public release.

## Architecture

```
        Mission Control (web)              Optional channels
        chat per client  ───┐              (Discord / Slack)
                            │                     │
              ┌─────────────┴─────────────────────┘
              │
      OpenClaw Gateway (:18789)
              │
  ┌───────────────────────────┐
  │                           │
Sancho                      Sansón
(CMO Strategist)        (QA Guardian)
  │                            ▲
  ├── Agent(subagent_type=…) ─► specialists (Hamete · Dulcinea · Rocinante · Maese Pedro · Mambrino · Merlín · Alarife)
  ├── sessions_send ──► Sansón ┘
  ├── sessions_send ─► Rocinante ─► YALC/GTM-OS API
  └── sessions_send ──► Cervantes
                        (System Architect)
```

The primary interface is **Mission Control chat** (`mc-chat → sancho`). Discord
and Slack can be wired in as additional channels, but the product boots and runs
without either.

Runtime means the agent harness that executes turns and tools. It is not the
same thing as a model provider. Anthropic, OpenAI and Fireworks provide models;
OpenClaw, Hermes, Codex CLI and Claude Code are runtimes once they implement
Sancho's adapter contract. Fresh installs start with OpenClaw and can configure
or switch compatible runtimes from **Mission Control -> Settings -> Runtime**.

### Agents

| Agent | Role | How it activates |
|-------|------|------------------|
| **Sancho** | CMO Strategist & Orchestrator | Mission Control chat (per client) + cron jobs |
| **Hamete** | Research, market & competitive intelligence, signals | `Agent(subagent_type="hamete")` from Sancho |
| **Dulcinea** | Written content — SEO, newsletters, landing copy, brand voice | `Agent(subagent_type="dulcinea")` from Sancho |
| **Maese Pedro** | Visual Director — design system, assets, web visuals, ad creatives (Open Design) | `Agent(subagent_type="maese-pedro")` from Sancho |
| **Mambrino** | Paid ads — Meta, Google, retargeting, ROAS | `Agent(subagent_type="mambrino")` from Sancho |
| **Merlín** | Data, attribution, forecasting, CRM analysis | `Agent(subagent_type="merlin")` from Sancho |
| **Sansón** | Brand Guardian / QA | `sessions_send` from Sancho |
| **Rocinante** | Outreach, Partnerships & GTM-OS execution — provider/MCP status, brain/setup, gates, lead qualification, cold email dry-runs/live confirmed launches, campaign status and reporting via `yalc-operator` | `sessions_send` from Sancho |
| **Alarife** | Web/Page Builder (Payload, site architecture, frontend, CRO) | `Agent(subagent_type="alarife")` from Sancho |
| **Cervantes** | System Architect & Infra | Own cron jobs + `sessions_send` from Sancho. Can edit Sancho's skills, SOUL.md, and cron jobs. |

### Skills

120+ marketing skills with a Context Matrix system — each skill declares which brand files it needs (`context_required`) and where it writes (`context_writes`), preventing unnecessary context loading. The `yalc-operator` skill lets Rocinante operate YALC/GTM-OS through the YALC HTTP API, with live catalog verification, provider/MCP status checks, human gates, campaign endpoints, and dry-run defaults for side-effecting outbound operations.

### YALC Cockpit

Mission Control includes a native YALC cockpit at `/dashboard/<slug>/yalc`. It uses Sancho-authenticated proxy routes under `/api/yalc/*`, not an iframe, and covers runtime health, campaigns, lead tables, lead detail, human gates, and provider status. YALC is an opt-in overlay: enable it with `docker-compose.yalc.yml` so the app talks to YALC at `http://yalc:3847`. When it's off, the cockpit shows a graceful "Outreach not enabled" placeholder instead of a broken screen.

### Multi-Client

One instance serves multiple clients with strict isolation:
- Each client = a brand in Mission Control, created from Admin → *New client* (slug + display name).
- Brand data stored in `brand/{slug}/` (Foundation structure).
- Per-client sources and channel config (incl. optional Discord/Slack IDs) in `brand/{slug}/sources.json`.
- Zero data leakage between clients enforced at every level.

## Quick Start

The fastest path is the one-command installer, which runs a setup wizard and
brings the stack up with Docker.

### Prerequisites

- Docker + Docker Compose
- `openssl` (used by the wizard to generate secrets)
- An **Anthropic** and/or **OpenAI** API key (or a subscription, see auth modes)

> Discord, Slack, Open Design, YALC and an external Postgres are all **optional**.
> The base stack runs with a bundled local Postgres (or `MC_TASKS_BACKEND=json`,
> no DB at all) and no comms integrations.

### Install

**Option 1 — one command (recommended, no clone needed):**

```bash
curl -fsSL https://raw.githubusercontent.com/Growth4U-systems/sanchocmo-openclaw/main/get.sh | bash
```

Downloads the latest release runtime to `~/sanchocmo` (override with `SANCHO_DIR`),
runs the wizard, and brings the stack up. If the GHCR image is still private, the
installer walks you through `docker login` and retries.

**Option 2 — development (clone the repo):**

```bash
git clone https://github.com/Growth4U-systems/sanchocmo-openclaw.git sanchocmo && cd sanchocmo

# Simplest — quick setup (asks only the essentials) + start + open the browser
./sancho run

# Or the full installer (same thing, with more control over the wizard):
./sancho install               # runs the wizard if .env is missing, then starts
#   ./sancho install --quick     # force the short wizard (2 questions)
#   ./sancho install --advanced  # full wizard: admin/login, DB, host ports, overlays
#   ./sancho install --od        # also start Open Design
#   ./sancho install --yalc      # also start YALC (Outreach)
#   ./sancho install --no-up     # configure only, don't start containers
```

Then manage the whole lifecycle with the same CLI — no `docker compose -f …` to
remember:

```bash
./sancho run | up | down | restart | status | logs
./sancho update [vX.Y.Z|edge|latest]   # pull (and optionally pin) a version
./sancho destroy                       # wipe containers + data (asks to confirm)
```

(`./install.sh` still works — it's a thin shim for `./sancho install`.)

The wizard has **two modes**: **quick** (the default) asks only the essentials —
provider + auth mode, the API key, and the first brand name — and defaults the
rest; **advanced** also covers admin/login, database, custom host ports, and the
optional overlays. Either way it generates the secrets (`NEXTAUTH_SECRET`,
`ENCRYPTION_KEY`, `SANCHO_INTERNAL_API_TOKEN`, `adminToken`, `mcToken`) and
writes `.env`, `config/instance.json`, and `config/clients.json` for you. If a
local port (e.g. `3000`) is already in use, the installer automatically picks the
next free one and points your access URL at it. A boot preflight then validates
the must-have config and fails fast with a clear list if anything is missing.

The wizard writes `SANCHO_RUNTIME=openclaw` as the safe default. Advanced
self-hosted installs can preseed `SANCHO_RUNTIME=external-http` plus
`SANCHO_EXTERNAL_*` variables before running the installer, or configure the
external runtime later from Settings. Existing Mission Control/Hermes bridges can
use `SANCHO_EXTERNAL_PROTOCOL=mc-bridge`; `hermes-external` remains accepted as a
legacy alias.

Full guide: [docs/INSTALL.md](docs/INSTALL.md).

### Adding a Client

Create the client from **Mission Control** (Admin → *New client*: slug + display
name). This registers it in `clients.json` and creates the base brand folder.

Then, from the client's chat, ask Sancho to run **Fast Foundation** (and later the
full Foundation). The foundation skills scaffold the rest of the `brand/{slug}/`
tree and generate `foundation-state.json` on demand — no extra script needed.

## Directory Structure

```
config/                          # Instance-specific configuration
  instance.json                  # MC URL, ports, accounts (Discord IDs optional)
  clients.json                   # Client registry (tokens)
  dispatch-map.json              # Channel → role routing

workspace-sancho/                # Main CMO agent
  SOUL.md                        # Identity & rules
  AGENTS.md                      # Inter-agent protocols
  _system/                       # Protocols, schemas, templates
  skills/                        # 120+ marketing skills
  scripts/                       # Automation scripts
  brand/{slug}/                  # Client data (Foundation structure)

workspace-cervantes/             # System architect agent
workspace-rocinante/             # Outreach & GTM-OS agent
workspace-alarife/               # Web/Page Builder agent (Payload, site architecture, frontend, CRO)

cron/                            # OpenClaw cron jobs
```

## Configuration

All instance-specific data lives in `config/`:

| File | Purpose | Gitignored |
|------|---------|------------|
| `instance.json` | MC URL, ports, accounts (Discord IDs optional) | Yes |
| `clients.json` | Client tokens | Yes |
| `dispatch-map.json` | Channel role mapping | No (framework) |

Templates (`.example` files) are provided for all gitignored configs, and the
setup wizard generates them on a fresh install.

## Cron Jobs

Automated jobs handle daily operations, for example:

- **Daily Pulse** — Extract and synthesize daily insights per client
- **Meeting Intelligence** — Process meeting notes from Google Drive
- **Weekly Synthesis** — Detect patterns and trends
- **Healthcheck** — Monitor services on a schedule
- **Cost Tracker** — Track API costs per client

Where a job publishes its output is configurable per client
(`crons.<cronKey>.publish_transport` / `publish_channel` in `client-config.json`,
editable from Mission Control), with Slack and Discord as the available channels.

## Mission Control

The Next.js web app (default port `3000`) is the primary interface:
- Per-client chat that talks to Sancho (`mc-chat → sancho`)
- Client portal with token-based access
- Foundation progress tracking
- Brand document viewer
- API connection pages

Exposed via reverse proxy (nginx on a server) or Tailscale Funnel (local dev).

## Development workflow

```
<author>/san-N-*  ──squash PR──▶  staging  ──release-please PR──▶  vX.Y.Z (tag from staging)  ──ff──▶  main  ──▶  deploy (manual gate)
```

- **`staging`** = the trunk (default branch). **Every** change — feature, fix, *and* hotfix — branches off fresh `origin/staging` and squash-PRs back into `staging`. Branch name `<author>/san-<n>-<kebab-desc>`; every change needs a Linear `SAN-<n>` in the branch, title, or body.
- **`main`** = a **fast-forward-only pointer** to the latest production release, moved *only* by automation (`promote-main.yml`). Never PR into `main`, never push or tag it by hand.
- **Releases** are cut from `staging`: [release-please](https://github.com/googleapis/release-please) runs on `staging` and keeps one open `chore: release vX.Y.Z` PR. Merging it (squash) tags from `staging`; `main` then fast-forwards to that tag and `deploy-prod.yml` deploys **after a manual approval** on the `production` environment gate.
- **Hotfixes** are normal `fix:` PRs to `staging` (no separate path) — `staging` is kept always-releasable. The rare true-emergency procedure lives in [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) §Hotfixes.
- Commits must follow [Conventional Commits](https://www.conventionalcommits.org/) — enforced by commitlint (`feat:` → minor, `fix:` → patch, `feat!:`/`BREAKING CHANGE:` → major).

Full guide: [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md). Deploy details: [docs/DEPLOY.md](docs/DEPLOY.md).

## License

[Sustainable Use License (SUL)](LICENSE.md)

You may use, modify, and distribute this software for internal business or personal purposes. Offering it to third parties as a hosted or managed service requires a separate agreement.
