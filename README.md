# SanchoCMO

**Fractional CMO AI** — A multi-agent marketing system built on [OpenClaw](https://openclaw.ai).

SanchoCMO operates as an AI-powered Chief Marketing Officer: it onboards clients, builds brand foundations, plans campaigns, creates content, tracks metrics, and manages everything through Discord.

## Architecture

```
   Client Discord Guilds              Cervantes Brain Guild
   (1 per client)                     (internal infra)
          │                                   │
          └──────── OpenClaw Gateway (:18789) ─┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
        Sancho          Escudero        Rocinante
      (Strategist)      (Worker)      (QA Guardian)
       Opus 4.6        Sonnet 4.5      Opus 4.6
            │                               ▲
            ├── sessions_spawn ─► Escudero   │
            ├── sessions_send ──► Rocinante ─┘
            └── sessions_send ──► Cervantes
                                  (System Architect)
                                   Opus 4.6
```

### Agents

| Agent | Role | How it activates |
|-------|------|------------------|
| **Sancho** | CMO Strategist & Orchestrator | Discord messages (client guilds) + cron jobs |
| **Escudero** | Execution worker (adopts personas) | `sessions_spawn` from Sancho |
| **Rocinante** | Brand Guardian / QA | `sessions_send` from Sancho |
| **Cervantes** | System Architect & Infra | Own cron jobs + `sessions_send` from Sancho. Operates in Cervantes Brain guild (#admin, #infra, #tasks, #changelog). Can edit Sancho's skills, SOUL.md, and cron jobs. Runs daily backups (git commit + push). |

### Personas (Escudero)

Escudero has no fixed personality. Sancho assigns one of 9 personas per task:

Explorador (prospecting), Redactor (SEO/content), Comunicador (social/newsletters), Creativo (visual), Amplificador (paid media), Investigador (research), Comercial (sales), Arquitecto (landing pages), Conector (partnerships).

### Skills

120+ marketing skills with a Context Matrix system — each skill declares which brand files it needs (`context_required`) and where it writes (`context_writes`), preventing unnecessary context loading.

### Multi-Client

One instance serves multiple clients with strict isolation:
- Each client = 1 Discord guild with standard channels (general, brand, campaigns, content, intelligence, etc.)
- 1 additional infra guild ("Cervantes Brain") for system operations, alerts, and cost tracking
- Brand data stored in `brand/{slug}/` (Foundation v2.0 structure)
- Channel IDs and config per client in `brand/{slug}/sources.json`
- Zero data leakage between clients enforced at every level

## Quick Start

### Prerequisites

- [OpenClaw](https://docs.openclaw.ai/start/getting-started) (Node 24+ recommended)
- A Discord bot (with token)
- Anthropic API key (Claude)
- A Discord server created from the template

### Setup

```bash
# 1. Clone
git clone https://github.com/Growth4U-systems/sanchocmo-openclaw.git
cd sanchocmo-openclaw

# 2. Configure environment
cp .env.example .env
# Edit .env with your API keys and Discord bot token

# 3. Configure instance
cp config/instance.json.example config/instance.json
# Edit with your MC URL, Discord IDs, Supabase URL

# 4. Configure clients
cp config/clients.json.example config/clients.json
# Add your first client

# 5. Start OpenClaw gateway
openclaw daemon start

# 6. Start Mission Control (optional)
node workspace-sancho/scripts/mc-server.js &
```

### Adding a Client

```bash
bash workspace-sancho/scripts/new-client.sh \
  --slug "my-client" \
  --name "My Client" \
  --guild "DISCORD_GUILD_ID"
```

This creates the brand directory structure, updates `clients.json`, binds Discord channels, and configures systemPrompts.

## Directory Structure

```
config/                          # Instance-specific configuration
  instance.json                  # URLs, Discord IDs, accounts
  clients.json                   # Client registry (tokens, guilds)
  clients.js                     # Same data for MC dashboard
  dispatch-map.json              # Channel → role routing

workspace-sancho/                # Main CMO agent
  SOUL.md                        # Identity & rules
  AGENTS.md                      # Inter-agent protocols
  _system/                       # Protocols, schemas, templates
  skills/                        # 120+ marketing skills
  personas/                      # 9 worker personas for Escudero
  scripts/                       # Automation scripts
  brand/{slug}/                  # Client data (Foundation v2.0)

workspace-cervantes/             # System architect agent
workspace-escudero/              # Worker agent (symlinks to sancho)
workspace-rocinante/             # QA agent (symlinks to sancho)

cron/                            # OpenClaw cron jobs
```

## Configuration

All instance-specific data lives in `config/`:

| File | Purpose | Gitignored |
|------|---------|------------|
| `instance.json` | MC URL, Discord IDs, ports, accounts | Yes |
| `clients.json` | Client tokens, guilds, Supabase keys | Yes |
| `clients.js` | Same data in JS for MC dashboard | Yes |
| `dispatch-map.json` | Channel role mapping | No (framework) |

Templates (`.example` files) are provided for all gitignored configs.

## Cron Jobs

19+ automated jobs handle daily operations:

- **Daily Pulse** — Extract insights from Discord (per client)
- **Meeting Intelligence** — Process meeting notes from Google Drive
- **Weekly Synthesis** — Detect patterns and trends
- **Healthcheck** — Monitor 23+ services every 6 hours
- **Cost Tracker** — Track API costs per client
- **Backup** — Daily git commit + push

Templates in `_system/cron-templates.json` generate per-client jobs automatically via `scripts/create-client-crons.sh`.

## Mission Control

Web dashboard (`mc-server.js`) on port 18790:
- Client portal with token-based access
- Foundation progress tracking
- Brand document viewer
- API connection pages
- Trust Engine

Exposed via reverse proxy (nginx on VPS) or Tailscale Funnel (local dev).

## License

[Sustainable Use License (SUL)](LICENSE.md)

You may use, modify, and distribute this software for internal business or personal purposes. Commercial redistribution as a hosted service requires a separate agreement.
