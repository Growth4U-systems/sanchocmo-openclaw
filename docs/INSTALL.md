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

## Database

You pick this in the wizard (`Database: local` or `external`); it only sets two
values in `.env`, which you can also edit by hand:

- **Bundled local Postgres** (recommended, `DB_MODE=local`): the wizard writes
  `COMPOSE_PROFILES=local-db` and a `DATABASE_URL` pointing at the in-network
  `postgres` service (`postgres://sancho:…@postgres:5432/sancho`). `docker
  compose up` then starts a `postgres:16-alpine` container alongside the app
  (its data lives in the `postgres_data` volume), and the schema is **created
  automatically on first boot** — no Neon account needed. Meeting Intelligence /
  POV Bank / Polar work out of the box.
- **External / managed** (e.g. Neon, `DB_MODE=external`): leave
  `COMPOSE_PROFILES` empty and set `DATABASE_URL` to your own database. No
  bundled container is started.
- **No database at all**: leave `DATABASE_URL` empty and run with
  `MC_TASKS_BACKEND=json` (default). The app boots fine; only DB-backed features
  (MI / POV Bank) are unavailable.

The driver is auto-selected from the `DATABASE_URL` host (`*.neon.tech` → Neon's
HTTP driver, anything else → standard Postgres), so the same image works for all
three. Set `DATABASE_DRIVER=neon|postgres` only to override that.

## Updating

```bash
git pull
docker compose -f docker-compose.yml up -d --build
```

Schema migrations for the bundled Postgres are **applied automatically at boot**,
so a new version that adds tables just works — your `postgres_data` volume (and
`config/` / `brand/`) persist across updates.
