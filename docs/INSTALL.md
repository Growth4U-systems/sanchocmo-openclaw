# Installing SanchoCMO

SanchoCMO ships as Docker images plus a thin installer.

**Un comando (recomendado, sin clonar):**

```bash
curl -fsSL https://raw.githubusercontent.com/Growth4U-systems/sanchocmo-openclaw/main/get.sh | bash
```

Baja el runtime del último release a `~/sanchocmo` (override `SANCHO_DIR`),
corre el wizard y levanta el stack. Si la imagen de GHCR todavía es privada, el
instalador te guía el `docker login` y reintenta.

**Para desarrollo (clonando):**

```bash
git clone https://github.com/Growth4U-systems/sanchocmo-openclaw.git sanchocmo && cd sanchocmo
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
| Outreach (YALC) | optional — off by default. When enabled, generates `YALC_API_TOKEN`, wires `YALC_BASE_URL`, and `install.sh` brings the overlay up automatically |

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
# Add ENABLE_YALC=yes to provision Outreach in the same run.
```

## Running

After the first install, use the **`./sancho`** CLI for the whole lifecycle — it
figures out which compose overlays (Open Design, YALC) to include for you, so you
never type `-f docker-compose.*.yml` by hand:

```bash
./sancho up            # start the stack (enabled overlays, from .env)
./sancho down          # stop & remove containers + network (data is kept)
./sancho status        # show the stack's containers
./sancho logs          # tail logs (default: the sanchocmo service)
```

First install (wizard + start) is `./sancho install` (the classic `./install.sh`
is a thin shim for it). Opt into optional services at install time with
`./sancho install --od` / `--yalc`.

> Why a CLI? It always loads the right compose overlays (from your `.env`) and
> `down` passes `--remove-orphans`, so the project network is always cleaned up
> — a bare `docker compose down` would leave the YALC container attached and
> fail with *"network … is still in use"*.

Mission Control is then reachable at the **Base URL** you chose.

## Optional integrations

All off by default. Turn them on when you need them:

- **Open Design** (agentic visual editor) — `-f docker-compose.od.yml`, set `OD_API_TOKEN`.
- **Discord** — set `DISCORD_BOT_TOKEN` in `.env` (Discord is one comms channel; Mission Control chat is the primary interface).
- **Slack** — configure in Mission Control → Settings → APIs.

### Outreach (YALC)

YALC is the outbound engine (campaigns, leads, sequences). It runs as an opt-in
container pulled from a public image — no source checkout needed.

1. **Enable it** — answer *yes* to the Outreach step in the wizard, or run
   `./install.sh --yalc`. Either way Sancho and YALC share a generated
   `YALC_API_TOKEN` and Sancho reaches it at `YALC_BASE_URL=http://yalc:3847`.
2. **Connect an email provider** — sending outbound needs *your own* provider
   account (the install can't provide one). Open **Mission Control → Trabajo →
   Outreach** and add your provider key (e.g. Instantly) from the cockpit; pin
   a specific image with `YALC_IMAGE=ghcr.io/growth4u-systems/yalc:vX.Y.Z` in
   `.env` if you don't want the rolling `:edge` tag.

Without YALC enabled, the Outreach page shows a short "not activated" placeholder
instead of errors — nothing else in Mission Control depends on it.

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

The core runs from a versioned public image, so an update is a **pull** — no
rebuild, no `git pull`:

```bash
./sancho update          # pull the latest of the configured tag, then up -d
```

To move to (and pin) a specific version, pass it — the CLI writes
`SANCHOCMO_IMAGE` into `.env` for you and updates:

```bash
./sancho update v1.2.3   # pin that release in .env, then pull + up -d
./sancho update edge     # switch to the rolling staging channel
./sancho update latest   # back to the latest stable
```

Omit the tag to track whatever is configured (`:latest` by default). The pinned
value lives in `.env` as `SANCHOCMO_IMAGE=ghcr.io/growth4u-systems/sanchocmo:vX.Y.Z`.

> Hacking on a clone instead of running the published image? Build from your
> source tree with `./sancho install --build`.

To wipe everything **including the database**, `./sancho destroy` (a
`docker compose down -v`) — it asks you to type `destroy` to confirm.

Schema migrations for the bundled Postgres are **applied automatically at boot**,
so a new version that adds tables just works — your `postgres_data` volume (and
`config/` / `brand/`) persist across updates.

## The OpenClaw home (data & framework)

The container keeps its state in a volume mounted at `/root/.openclaw`
(`OPENCLAW_HOME`, default `~/.openclaw`). You do **not** need to seed it yourself:
the image is self-contained and **populates an empty volume on first boot**, so the
project is not tied to a cloned repo at any particular path.

- **Framework** (agent skills, boot scripts, plugins) ships *inside the image* and
  is **refreshed from the image whenever you update** — so `compose pull` of a newer
  version brings new skills/fixes automatically.
- **Your data** (`config/`, `workspace-*/memory`, `brand/`, real `cron/jobs.json`,
  and the bundled Postgres `postgres_data` volume) lives only in the volume and is
  **never overwritten** by an update.

> **Tip:** if the machine already uses `~/.openclaw` for the `openclaw` CLI, point
> SanchoCMO at a dedicated dir to avoid mixing them — set `OPENCLAW_HOME=/srv/sancho-home`
> (or any path/volume) in `.env` before `docker compose up`.
