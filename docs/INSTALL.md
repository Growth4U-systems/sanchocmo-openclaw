# Installing SanchoCMO

SanchoCMO ships as Docker images plus a thin installer. The fastest path:

```bash
git clone <this-repo> sanchocmo && cd sanchocmo
./install.sh
```

`install.sh` checks prerequisites, runs the setup **wizard**, and brings the
stack up with `docker compose`.

## Prerequisites

- **Docker** + **Docker Compose v2** (the `docker compose` subcommand).
- **openssl** (used to generate secrets).
- A model provider **API key** — Anthropic and/or OpenAI.

## What the wizard asks

`scripts/wizard.sh` (run automatically by `install.sh`, or on its own) collects
the minimum to boot and generates the rest:

| Prompt | Notes |
|--------|-------|
| Provider + API key | `anthropic`, `openai`, or `both` |
| Auth mode | `api_key` (default) or `subscription` |
| Admin email domain | emails `@domain` become admins |
| Database | `local` (bundled Postgres, recommended) or `external` (e.g. Neon) |
| Base URL | where you'll reach Mission Control (default `http://localhost:3000`) |
| First brand | slug + display name |

It then **generates** `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`,
`SANCHO_INTERNAL_API_TOKEN`, the admin token and the brand's `mcToken`, and
writes:

- `.env`
- `config/instance.json` (minimal — no Discord)
- `config/clients.json` (your first brand)

Existing files are never overwritten unless you pass `--force`.

### Non-interactive / CI

Set `WIZARD_ASSUME_YES=1` and pass answers as environment variables:

```bash
WIZARD_ASSUME_YES=1 PROVIDER=anthropic ANTHROPIC_API_KEY=sk-ant-... \
  ADMIN_EMAIL_DOMAIN=acme.com DB_MODE=local FIRST_BRAND_SLUG=acme \
  FIRST_BRAND_NAME="Acme Inc" bash scripts/wizard.sh
```

## Running

```bash
# Minimum (no Open Design / YALC / Discord):
docker compose -f docker-compose.yml up -d

# With optional services:
./install.sh --od        # adds the Open Design overlay (needs OD_API_TOKEN)
./install.sh --yalc      # adds the YALC overlay
```

Mission Control is then reachable at the **Base URL** you chose.

## Optional integrations

All off by default. Turn them on when you need them:

- **Open Design** (agentic visual editor) — `-f docker-compose.od.yml`, set `OD_API_TOKEN`.
- **YALC** (GTM/outbound) — `-f docker-compose.yalc.yml`.
- **Discord** — set `DISCORD_BOT_TOKEN` in `.env` (Discord is one comms channel; Mission Control chat is the primary interface).
- **Slack** — configure in Mission Control → Settings → APIs.

## Updating

```bash
git pull
docker compose -f docker-compose.yml up -d --build
```

> **Note:** the bundled Postgres option (`DB_MODE=local`, `COMPOSE_PROFILES=local-db`)
> is wired by the wizard and lights up once the `postgres` service lands in the
> base compose (packaging item B9). Until then, choose `external` with a real
> `DATABASE_URL`, or run with `MC_TASKS_BACKEND=json` (default) and skip DB-backed
> features (Meeting Intelligence / POV Bank).
