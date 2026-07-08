# Installing SanchoCMO

SanchoCMO ships as Docker images plus a thin installer.

**Un comando (recomendado, sin clonar):**

```bash
curl -fsSL https://raw.githubusercontent.com/Growth4U-systems/sanchocmo-openclaw/main/get.sh | bash
```

Baja el runtime del último release a `~/sanchocmo` (override `SANCHO_DIR`),
corre el wizard (modo **quick** por defecto) y levanta el stack. Si la imagen de
GHCR todavía es privada, el instalador te guía el `docker login` y reintenta.

**El arranque más simple, ya clonado:** `./sancho run` — corre el wizard en modo
quick (sólo si falta `.env`), levanta, y abre el navegador. Si ya está
configurado, equivale a `./sancho up`.

**Para desarrollo (clonando):**

```bash
git clone https://github.com/Growth4U-systems/sanchocmo-openclaw.git sanchocmo && cd sanchocmo
./sancho install
```

`./sancho install` checks prerequisites, runs the setup **wizard** (when `.env`
is missing), and brings the stack up. The whole lifecycle lives in the unified
**`./sancho`** CLI; `./install.sh` is kept as a thin shim that just calls
`./sancho install` (for the historical one-liner, `get.sh` and the release
tarball).

## Prerequisites

- **Docker** + **Docker Compose v2** (the `docker compose` subcommand).
- **openssl** (used to generate secrets).
- A model provider **credential** — Anthropic, OpenAI, and/or Fireworks (API key,
  or a Claude/Codex subscription token for Anthropic/OpenAI).

## What the wizard asks

The wizard has **two modes** (pick with `--quick` / `--advanced`, the
`WIZARD_MODE` env var, or the interactive selector at the top):

- **quick** (default) — asks only the essentials: the **model provider & auth**
  (step 1 below) and the **first brand name** (the slug is derived from it).
  Everything else takes a sensible default — admin login via the printed token,
  bundled local Postgres, `http://localhost:3000`, default ports, no Google, no
  optional services. Finish the rest later in the app or with
  `./sancho reconfigure --advanced`.
- **advanced** — the full flow below, plus a **Host ports** step (`MC_PORT` /
  `GATEWAY_HOST_PORT` / `LEGACY_HOST_PORT`) for pinning the loopback ports.

`scripts/wizard.sh` (run automatically by `./sancho install` / `run`, or on its
own) collects the minimum to boot and generates the rest. The **advanced** steps:

1. **Model provider & auth** — pick the provider(s): `anthropic`, `openai`,
   `fireworks`, `both`, or `all` (default `anthropic`). The auth mode is asked
   **per provider**:
   - *Anthropic* — `api_key` (default; needs `ANTHROPIC_API_KEY`) or
     `subscription` (needs a Claude OAuth token; generate it on the host with
     `claude setup-token` and paste it).
   - *OpenAI* — `api_key` (needs `OPENAI_API_KEY`) or `subscription` (Codex /
     ChatGPT OAuth — set up host-side *after* install with
     `openclaw models auth login`; it can't be entered in the wizard).
   - *Fireworks* — API key only (`FIREWORKS_API_KEY`).

   The wizard never leaves a placeholder credential behind: in non-interactive
   mode it **aborts** if the key for the chosen mode is missing.
2. **Admin & login access** — admin email domain (emails `@domain` become
   admins), an admin contact email, and **optional Google login** (off by
   default; needs a Google OAuth client id + secret). Skip Google and log in
   with the admin token printed at the end.
3. **Database** — `local` (bundled Postgres, recommended) or `external` (e.g.
   Neon `DATABASE_URL`).
4. **Host ports** — the loopback host ports for Mission Control / gateway /
   legacy server (defaults `3000` / `18789` / `18790`). Only the **host** side of
   each mapping — container ports are fixed. The installer auto-relocates a busy
   port anyway, so this step is just for pinning.
5. **Access URL** — the Base URL where you'll reach Mission Control (default
   `http://localhost:<MC_PORT>`).
6. **First brand** — display name (in **quick** the slug is derived from it; in
   **advanced** you can also set the slug).
7. **Optional services** — both off by default, both self-provision their token
   and are brought up automatically by `./sancho` when enabled:
   - *Outreach (YALC)* — generates `YALC_API_TOKEN` and wires
     `YALC_BASE_URL=http://yalc:3847`.
   - *Open Design* (agentic visual editor, port 7456) — generates
     `OD_API_TOKEN` and asks for a browser-reachable web URL.

It then **generates** `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`,
`SANCHO_INTERNAL_API_TOKEN`, the admin token (also mirrored into `.env` as
`MC_ADMIN_TOKEN`), the brand's `mcToken`, the local Postgres password (in `local`
mode), and `YALC_API_TOKEN` / `OD_API_TOKEN` when those services are enabled. It
writes:

- `.env`
- `config/instance.json` (minimal — no Discord)
- `config/clients.json` (your first brand)

Existing files are never overwritten unless you pass `--force` (interactively, it
offers to overwrite). On a `--force` re-run the stateful values — the admin
token, `mcToken`/brand registry in `config/clients.json`, and the local Postgres
password — are **reused**, not rotated, so existing logins and the DB volume keep
working.

## Runtime selection

Fresh installs write `SANCHO_RUNTIME=openclaw` into `.env`. That is deliberate:
OpenClaw is currently the complete/default adapter while Sancho's runtime
contract is being split out. Sancho core owns brands, tasks, docs, skills, chat
state and settings; runtimes sit behind adapters.

Runtime is not model provider:

- **Model providers**: Anthropic, OpenAI, Fireworks, OpenRouter, etc.
- **Runtimes / harnesses**: OpenClaw, Hermes, Codex CLI, Claude Code, or another
  compatible agent gateway.
- **Sancho adapter**: the thin layer that maps Sancho's chat/context/state
  contract onto one runtime.

Implemented/usable today: `openclaw`, managed `hermes`, and `external-http`.
`external-http` is the BYO gateway path: the gateway can be backed by Hermes,
Codex CLI, Claude Code, or another harness once it speaks Sancho's HTTP contract.
It can also talk to an existing Mission Control/Hermes bridge with
`SANCHO_EXTERNAL_PROTOCOL=mc-bridge`. `hermes-external` remains accepted as a
legacy alias.

To use a BYO runtime gateway from day one, pass the runtime env vars before
running the installer or wizard:

```bash
export SANCHO_RUNTIME=external-http
export SANCHO_EXTERNAL_GATEWAY_URL=https://runtime.example.com
export SANCHO_EXTERNAL_SECRET=...
curl -fsSL https://raw.githubusercontent.com/Growth4U-systems/sanchocmo-openclaw/main/get.sh | bash
```

For an existing bridge that exposes `POST /chat` and `GET /health`:

```bash
export SANCHO_RUNTIME=external-http
export SANCHO_EXTERNAL_PROTOCOL=mc-bridge
export SANCHO_EXTERNAL_GATEWAY_URL=https://bridge.example.com
export SANCHO_EXTERNAL_CHAT_PATH=/chat
export SANCHO_EXTERNAL_HEALTH_PATH=/health
export SANCHO_EXTERNAL_AGENT=sancho-coordinator
```

The wizard persists supplied `HERMES_*`, `SANCHO_EXTERNAL_*`, or legacy
`HERMES_EXTERNAL_*` values into `.env`, so they survive restarts. You can also
leave the install on OpenClaw and configure a runtime later from
**Settings -> Runtime**.

For Hermes, Claude Code, or Codex, use the guided setup in
**Settings -> Runtime**:

1. Choose **Hermes**, **Claude Code**, or **Codex** under
   **Conectar runtime CLI**.
2. Leave the default bridge URL when the bridge runs on the same host as Sancho,
   or set the URL Sancho can reach.
3. Click **Preparar**. Sancho writes the `external-http` env vars, generates a
   shared secret, and shows one bridge command.
4. Run that command on the host with the authenticated Claude Code/Codex CLI.
5. Click **Verificar y activar**. If the bridge healthcheck passes, Sancho
   switches new chat turns to `external-http`.

The external runtime HTTP contract is documented in
[`docs/runtime-external-http-contract.md`](runtime-external-http-contract.md).
After building the app, validate the contract locally with:

```bash
npm run smoke:runtime:external-http
```

### Non-interactive / CI

Set `WIZARD_ASSUME_YES=1` and pass answers as environment variables (same names
the wizard writes). You **must** supply the model credential for the chosen auth
mode (`ANTHROPIC_API_KEY`, or `ANTHROPIC_OAUTH_TOKEN` for subscription) or the
wizard aborts:

```bash
WIZARD_ASSUME_YES=1 PROVIDER=anthropic ANTHROPIC_AUTH_MODE=api_key \
  ANTHROPIC_API_KEY=sk-ant-... ADMIN_EMAIL_DOMAIN=acme.com \
  ADMIN_IDENTITY_EMAIL=admin@acme.com DB_MODE=local BASE_URL=http://localhost:3000 \
  FIRST_BRAND_SLUG=acme FIRST_BRAND_NAME="Acme Inc" bash scripts/wizard.sh
# Optional: ENABLE_YALC=yes / ENABLE_OD=yes to provision those services, and
# ENABLE_GOOGLE=yes GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… for Google login.
# Env answers are honored in both modes; set WIZARD_MODE=advanced only if you
# want the advanced prompts when running interactively.
```

## Running

After the first install, use the **`./sancho`** CLI for the whole lifecycle — it
figures out which compose overlays (Open Design, YALC) to include for you, so you
never type `-f docker-compose.*.yml` by hand:

```bash
./sancho run           # simplest start: quick wizard (if no .env) + up + open browser
./sancho up            # start the stack (enabled overlays, from .env)
./sancho down          # stop & remove containers + network (data is kept)
./sancho restart       # down + up
./sancho status        # show the stack's containers
./sancho logs          # tail logs (default: the sanchocmo service)
./sancho reconfigure   # re-run the wizard (regenerates .env + config; keeps data)
```

The fastest path is **`./sancho run`** — it runs the wizard in **quick** mode
only if `.env` is missing, brings the stack up, and opens your browser at the
access URL; if you're already configured it just behaves like `./sancho up`.
First install with more control is `./sancho install` (the classic `./install.sh`
is a thin shim for it). Opt into optional services at install time with
`./sancho install --od` / `--yalc`, or reconfigure fully with
`./sancho reconfigure --advanced`.

> Why a CLI? It always loads the right compose overlays (from your `.env`) and
> `down` passes `--remove-orphans`, so the project network is always cleaned up
> — a bare `docker compose down` would leave the YALC container attached and
> fail with *"network … is still in use"*.

Mission Control is then reachable at the **Base URL** you chose.

## Optional integrations

All off by default. Turn them on when you need them:

- **Open Design** (agentic visual editor, port 7456) — enable with `./sancho install --od` or by answering *yes* in the wizard; the `OD_API_TOKEN` is generated and the overlay started for you (no manual `-f docker-compose.od.yml`).
- **Discord** — set `DISCORD_BOT_TOKEN` in `.env` (Discord is one comms channel; Mission Control chat is the primary interface).
- **Slack** — configure in Mission Control → Settings → APIs.

### Open Design (visual editor)

Open Design is the agentic design daemon (skills, design systems, prompt
templates, and the "Abrir editor agentic" flow). It runs as an opt-in container
pulled from a public image — enable it with `./sancho install --od` or by
answering *yes* in the wizard (the `OD_API_TOKEN` is generated and the overlay
started for you).

The **Open Design Library** tab in Media Creation degrades gracefully — it tells
the three states apart instead of showing broken/empty grids:

- **Not enabled** (no `OD_DAEMON_URL` / `OD_WEB_URL` / `OD_API_TOKEN`) → a calm
  "Open Design no está activado" placeholder with a one-command enable CTA.
- **Enabled but daemon down** → a distinct "daemon caído" state naming the
  unreachable `daemonUrl` plus a restart hint and a "re-check" button.
- **Enabled and healthy** → the real Library UI.

Nothing else in Mission Control depends on Open Design being on.

### Outreach (YALC)

YALC is the outbound engine (campaigns, leads, sequences). It runs as an opt-in
container pulled from a public image — no source checkout needed.

1. **Enable it** — answer *yes* to the Outreach step in the wizard, or run
   `./sancho install --yalc`. Either way Sancho and YALC share a generated
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
> (or any path/volume) in `.env` before `./sancho up`.
