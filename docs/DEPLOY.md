# SanchoCMO — VPS Deploy Guide

Deploy SanchoCMO to a VPS using Docker Compose and nginx.

---

> **Running a live deploy already?** Read [`SERVER-OPS.md`](./SERVER-OPS.md) for the day-2 ops side: minimum resources, swap, log rotation, build-cache prune cron, monitoring and the recovery playbook for failures we've actually seen in prod. The "post-install hardening" steps there are **not optional** for a real workload — apply them right after this guide.

---

## Requirements

> **VPS sizing**: the numbers below are the floor for an idle install. A
> live workload (multiple brands × content-engine crons) needs **4 vCPU /
> 8 GB RAM / 80 GB disk** to avoid OOM-kills and disk pressure. See
> [`SERVER-OPS.md §1`](./SERVER-OPS.md#1-minimum-resource-budget) for the
> full budget.

| Resource | Minimum |
|---|---|
| VPS | 2 vCPU, 4 GB RAM, 20 GB disk |
| OS | Ubuntu 22.04 |
| Block storage | 10 GB volume mounted at `/mnt/data` (for data snapshots) |
| Domain | A record pointing to VPS IP |
| Discord (OpenClaw) | Bot token + client ID + Message Content Intent enabled |
| Discord (Cervantes) | Separate bot token for Cervantes Claude Code Channel + webhook URL for #cervantes-admin |
| Anthropic | API key (for Sancho + specialist agents via OpenClaw) |
| MiniMax (optional) | API key for MiniMax M2.7 — cheaper execution for specialist agents |
| Claude Code | Membership auth via `claude setup-token` (for Cervantes) |
| Bun + unzip | Required by the Claude Code Discord Channel plugin |
| Neon / PostgreSQL | Database URL for Next.js Mission Control |
| Google OAuth | Client ID + secret for Mission Control login |

> **No Hetzner volume?** Set `SNAPSHOT_DATA_DIR=/path/to/your/storage` in `.env` to store snapshots elsewhere.

Tested on: **Hetzner CX22**

---

## Steps

### 1. Provision VPS

Spin up an Ubuntu 22.04 server on Hetzner, DigitalOcean, or any compatible provider. Note the public IP address.

If using Hetzner, attach a volume (10 GB minimum) and mount it:

```bash
# Hetzner volumes are auto-attached as /dev/disk/by-id/scsi-0HC_Volume_*
# Format and mount (first time only):
mkfs.ext4 /dev/disk/by-id/scsi-0HC_Volume_<ID>
mkdir -p /mnt/data
mount /dev/disk/by-id/scsi-0HC_Volume_<ID> /mnt/data

# Add to /etc/fstab for persistence across reboots:
echo '/dev/disk/by-id/scsi-0HC_Volume_<ID> /mnt/data ext4 defaults 0 2' >> /etc/fstab
```

### 2. Configure DNS

Add an **A record** for your domain pointing to the VPS IP:

```
Type: A
Name: staging.example.com   (or your chosen subdomain)
Value: <VPS IP>
TTL:  300
```

**Verify DNS propagation before proceeding** (certbot will fail otherwise):

```bash
dig staging.example.com +short
# Should return your VPS IP
```

### 3. SSH into the VPS and clone the repo

```bash
ssh root@<VPS IP>

# Generate an SSH key if you don't have one
ssh-keygen -t ed25519 -C "vps@sanchocmo"
cat ~/.ssh/id_ed25519.pub   # Add this to GitHub → Settings → SSH keys

# Clone the repository into ~/.openclaw (OpenClaw's default root directory).
# This is required — OpenClaw expects its config, agents, and state here.
# To use a different path, set OPENCLAW_HOME in .env and docker-compose.yml.
git clone git@github.com:Growth4U-systems/sanchocmo-openclaw.git ~/.openclaw
cd ~/.openclaw
```

### 4. Run setup script

Installs Docker, nginx, certbot, configures SSL, and sets up UFW firewall.

```bash
bash docker/setup-vps.sh staging.example.com
```

Replace `staging.example.com` with your actual domain.

### 5. Configure

Three files need manual configuration. Everything else is auto-generated on first startup.

**`.env`** — copy from example and fill in your secrets:

```bash
cp .env.example .env
nano .env
```

Required values:

```env
# --- Required ---

# Model provider (set at least one)
ANTHROPIC_API_KEY=sk-ant-...
# FIREWORKS_API_KEY=fw-...

# Discord bot (OpenClaw agents)
DISCORD_BOT_TOKEN=your_discord_bot_token

# Domain
BASE_URL=https://your-domain.com

# Next.js Mission Control
DATABASE_URL=postgresql://user:pass@ep-xxx.region.neon.tech/mc
# Pins the Neon HTTP driver. Auto-detected from the *.neon.tech host, but the
# deploy workflows also inject DATABASE_DRIVER=neon explicitly so prod can never
# fall back to the vanilla-Postgres driver used by the bundled local-db.
DATABASE_DRIVER=neon
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Cervantes (Claude Code — runs outside Docker)
CERVANTES_GUILD_ID=your_cervantes_guild_id
DISCORD_WEBHOOK_CERVANTES=https://discord.com/api/webhooks/XXXX/YYYY
```

> **Note:** `CERVANTES_GUILD_ID` is the Discord server where Cervantes operates. It's used to exclude that guild from Sancho's bindings — without it, Sancho responds to all messages in the Cervantes guild. Get it from Discord → Server Settings → Widget → Server ID.

> **Heads up — two `.env` files:** this `/root/.openclaw/.env` is consumed by OpenClaw (Sancho) and by Cervantes's cron scripts. The Cervantes **systemd service** reads a separate `/root/.openclaw/workspace-cervantes/.env` (see step 9e) to avoid variable collisions — in particular `DISCORD_BOT_TOKEN`, which points to different bots for Sancho vs Cervantes. Don't put the Cervantes bot token in this file.

Optional but recommended:

```env
# Alternative model providers (cheaper execution for specialist agents)
MINIMAX_API_KEY=...          # MiniMax M2.7 — used for task execution
XAI_API_KEY=...              # xAI Grok models
OPENROUTER_API_KEY=...       # OpenRouter proxy
FIREWORKS_API_KEY=...        # Fireworks AI open-weight models

# Cloudflare R2 (image uploads in Mission Control)
CLOUDFLARE_ACCOUNT_ID=...
R2_UPLOAD_IMAGE_ACCESS_KEY_ID=...
R2_UPLOAD_IMAGE_SECRET_ACCESS_KEY=...
R2_UPLOAD_IMAGE_BUCKET_NAME=...
R2_PUBLIC_URL=...

# Search & scraping (used by Sancho skills)
SERPER_API_KEY=...           # Google Search via Serper.dev
FIRECRAWL_API_KEY=...        # Web scraping

# YALC / GTM-OS (used by Yalc Agent + Mission Control cockpit)
YALC_BASE_URL=http://yalc:3847
YALC_API_TOKEN=...           # Same value exposed to YALC as GTM_OS_API_TOKEN
SANCHO_REPLY_WEBHOOK_URL=http://sanchocmo:3000/api/yalc/replies
SANCHO_REPLY_WEBHOOK_TOKEN=... # Shared secret for YALC inbound replies -> Sancho notifications
YALC_BUILD_CONTEXT=../Yalc-Growth4U
YALC_DATA_VOLUME=yalc_data   # Or /mnt/data/yalc-gtm-os for a host-mounted SQLite directory
YALC_PORT=3847
```

> See `.env.example` for the full list of optional variables (payments, social media, analytics, etc.).

**YALC source for staging deploy** — staging now builds YALC from the private `Growth4U-systems/Yalc-Growth4U` repo and starts it with `docker-compose.yalc.yml`.

In the GitHub **staging Environment**, set:

```env
ENABLE_YALC_SERVICE=1
YALC_REF=main
YALC_BUILD_CONTEXT=../Yalc-Growth4U
```

And add secret:

```env
YALC_REPO_TOKEN=<fine-grained GitHub token with read access to Growth4U-systems/Yalc-Growth4U>
```

If you do not want to use `YALC_REPO_TOKEN`, pre-clone the repo on the VPS at the same path:

```bash
cd "$(dirname ~/.openclaw)"
git clone git@github.com:Growth4U-systems/Yalc-Growth4U.git Yalc-Growth4U
```

**`config/instance.json`** — copy from example and set Discord IDs:

```bash
cp config/instance.json.example config/instance.json
nano config/instance.json
```

**`config/clients.json`** — copy from example and add your first client:

```bash
cp config/clients.json.example config/clients.json
nano config/clients.json
```

### 5b. Set up Open Design daemon vhost

The Media Creation surface in Mission Control opens a web-based agentic
editor served by the Open Design daemon container (`ghcr.io/growth4u-systems/od`).
The daemon runs alongside Sancho via Compose, but its public URL is a
**separate subdomain** with its own nginx vhost and TLS cert.

The reverse-proxy config lives in [`infra/nginx/od.conf`](../infra/nginx/od.conf)
with placeholders for the FQDN and API token. Apply it like this:

```bash
# Choose the OD subdomain (must have an A record pointing at the VPS IP)
OD_DOMAIN=od.staging.example.com

# 1) Add OD env vars to .env (token must match what nginx will inject below)
cat >> /root/.openclaw/.env <<EOF
OD_API_TOKEN=$(openssl rand -hex 32)
OD_WEB_URL=https://${OD_DOMAIN}
OD_ALLOWED_ORIGINS=https://${OD_DOMAIN}
OPEN_DESIGN_IMAGE=ghcr.io/growth4u-systems/od:sanchocmo
EOF

# 2) Stub vhost so certbot can issue a cert
sudo tee /etc/nginx/sites-available/sancho-od >/dev/null <<EOF
server { listen 80; server_name ${OD_DOMAIN}; location / { return 404; } }
EOF
sudo ln -sf /etc/nginx/sites-available/sancho-od /etc/nginx/sites-enabled/sancho-od
sudo nginx -t && sudo systemctl reload nginx

# 3) Cert
sudo certbot --nginx -d ${OD_DOMAIN} --non-interactive --agree-tos --email ops@example.com

# 4) Replace the certbot stub with the versioned config from this repo
TOKEN=$(grep '^OD_API_TOKEN=' /root/.openclaw/.env | cut -d= -f2-)
sudo cp ~/.openclaw/infra/nginx/od.conf /etc/nginx/sites-available/sancho-od
sudo sed -i "s|<OD_DOMAIN>|${OD_DOMAIN}|g; s|<OD_API_TOKEN>|${TOKEN}|g" /etc/nginx/sites-available/sancho-od
sudo ln -sf /etc/nginx/sites-available/sancho-od /etc/nginx/sites-enabled/sancho-od
sudo nginx -t && sudo systemctl reload nginx
```

For staging/prod deploys driven by GitHub Actions, set the same values
in the corresponding **GitHub Environment** so the workflow rewrites
`.env` on every deploy:

| Variable / Secret | Where it lives | Value |
|------|------|------|
| `OD_API_TOKEN` (secret) | Environment | Same hex string injected by nginx |
| `OD_WEB_URL` (var) | Environment | `https://od.<env>.example.com` |
| `OD_ALLOWED_ORIGINS` (var) | Environment | Same as `OD_WEB_URL` (comma-list if more origins are embedding) |
| `OPEN_DESIGN_IMAGE` (var) | Environment | `ghcr.io/growth4u-systems/od:sanchocmo` (branded trunk) or pin to `:vX.Y.Z` |
| `ANTHROPIC_API_KEY` (secret) | Environment | Anthropic API key for the baked-in `claude` CLI (Settings → Local CLI). Per-tenant deploys should use a per-tenant key so billing is scoped to the client. |
| `FIREWORKS_API_KEY` (secret) | Environment | Fireworks AI API key. The deploy workflows propagate it to `.env` so Sancho/OpenClaw can use Fireworks models. |

The branded image bakes `@anthropic-ai/claude-code` into the runtime so
the Settings → Local CLI panel surfaces a working agent in cloud mode.
The daemon's upstream `env.ts` strips `ANTHROPIC_API_KEY` before
spawning `claude` (assumes desktop `claude login`); the fork honors
`OD_CLAUDE_PRESERVE_API_KEY=1` (hardcoded in `docker-compose.yml`) to
keep the key in scope since interactive login is impossible inside a
container.

Smoke test:

```bash
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' https://${OD_DOMAIN}/api/mcp/install-info
# expect HTTP 200

# Local CLI sanity check from inside the container:
docker exec open-design claude --version
# expect a version string like "2.0.42 (Claude Code)"
```

See [`infra/nginx/README.md`](../infra/nginx/README.md) for token rotation
and conventions (sites-available vs sites-enabled, backup snapshots).

### 6. Launch

```bash
docker compose -f docker-compose.yml -f docker-compose.yalc.yml up -d --build
```

First launch builds the Docker image (~2-3 minutes), generates `openclaw.json`, registers agents (sancho plus the specialist team, yalc), and auto-detects Discord guilds.
The YALC container exposes its API inside Docker as `http://yalc:3847`, persists SQLite state under `/root/.gtm-os`, and serves `/healthz` without bearer auth for Docker health checks.

> **Don't want to build from source?** The core ships as a public image. Set
> `SANCHOCMO_IMAGE=ghcr.io/growth4u-systems/sanchocmo:vX.Y.Z` in `.env` and run
> `docker compose pull && docker compose up -d` instead of `--build`. Updating is
> then just `pull && up -d` (no `git pull`, no rebuild). This guide otherwise
> assumes a source build because the G4U deploy pipeline builds on the host.

> **Cervantes** does NOT run inside Docker. See step 8 below.

### 7. Verify

```bash
# Check container is running
docker ps

# Hit the health endpoint
curl https://staging.example.com/mc/api/health-check

# Stream logs
docker logs sanchocmo --tail 50 -f
docker logs yalc-gtm-os --tail 50 -f

# Check bot status inside container
docker exec sanchocmo openclaw status

# Check YALC health from the VPS host
curl http://127.0.0.1:3847/healthz
```

Mission Control exposes the YALC cockpit at:

```text
https://staging.example.com/dashboard/<client-slug>/yalc
```

### 8. Approve your Discord user (OpenClaw bot)

The first time you message the OpenClaw bot, it will ask you to approve your device. Run the command it shows you:

```bash
docker exec sanchocmo openclaw pairing approve discord <PAIRING_CODE>
```

After approval, the bot will respond to your messages in all configured guilds.

### 9. Set up Cervantes (Claude Code — outside Docker)

Cervantes runs as a separate process on the VPS host, powered by Claude Code with a membership (not API key).

#### 9a. Install dependencies

```bash
# Install Claude Code CLI
curl -fsSL https://claude.ai/install.sh | sh

# Add to PATH (the installer puts it in ~/.local/bin/)
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Verify
claude --version

# Install Bun (required by the Discord Channel plugin)
apt install -y unzip
curl -fsSL https://bun.sh/install | bash
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

#### 9b. Authenticate Claude Code

Claude Code uses its own auth stored in `~/.claude/`, not a token in `.env`.

```bash
# Run from the Cervantes workspace directory
cd ~/.openclaw/workspace-cervantes
claude setup-token
```

This prints a URL — **open it in your local machine's browser**, authorize, then paste the token back in the VPS terminal.

#### 9c. Install the Discord plugin

```bash
# Add the official Anthropic plugin marketplace
claude plugin marketplace add anthropics/claude-plugins-official

# Install the Discord plugin
claude plugin install discord@claude-plugins-official

# Enable the plugin (may be disabled by default)
claude plugin enable discord
```

#### 9d. Create Discord bot for Cervantes

1. Go to [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**
2. Go to **Bot** settings:
   - Enable **Message Content Intent**
   - Copy the **Bot Token**
3. Go to **OAuth2** → **URL Generator**:
   - Scopes: `bot`
   - Permissions: Send Messages, Read Message History
   - Copy the invite URL and open it to invite the bot to your Cervantes guild

#### 9e. Create Cervantes's own `.env`

The Cervantes systemd service reads from `~/.openclaw/workspace-cervantes/.env` — **not** the OpenClaw `.env`. This isolation matters because the Discord plugin reads `process.env.DISCORD_BOT_TOKEN` hardcoded, and that variable means different bots in each environment (Sancho in the OpenClaw `.env`, Cervantes here).

```bash
cd ~/.openclaw/workspace-cervantes
cp .env.example .env
chmod 600 .env
nano .env
```

Required values:

```env
CLAUDE_CODE_OAUTH_TOKEN=<from step 9b>
DISCORD_BOT_TOKEN=<Cervantes bot token from step 9d>
CERVANTES_DISCORD_BOT_CLIENT_ID=<Cervantes bot client ID>
CERVANTES_GUILD_ID=<same as in OpenClaw .env>
DISCORD_WEBHOOK_CERVANTES=<filled in step 9f below>
OPENCLAW_HOME=/root/.openclaw
```

#### 9f. Configure Discord Channel plugin (first-time pairing)

```bash
cd ~/.openclaw/workspace-cervantes
claude --channels plugin:discord@claude-plugins-official
```

The plugin will create `~/.claude/channels/discord/.env`. You can leave that file with a placeholder — **the plugin ends up using the `DISCORD_BOT_TOKEN` from `workspace-cervantes/.env` at runtime** because a real env var wins over the file.

Once Claude Code starts with the Discord channel active, you'll see:

```
Listening for channel messages from: plugin:discord@claude-plugins-official
```

Now pair your Discord user:
1. DM the Cervantes bot in Discord — it will show a pairing code
2. In the Claude Code session, type: `/discord:access pair <code>`
3. Lock down access: `/discord:access policy allowlist`

Press `Ctrl+C` to stop the session.

#### 9g. Create Discord webhook for alerts

This webhook is used by healthcheck and alert scripts — it's separate from the bot.

1. Discord → Cervantes guild → `#cervantes-admin` channel
2. **Edit Channel** → **Integrations** → **Webhooks** → **New Webhook**
3. Copy the webhook URL and set it in **both** env files:

```bash
# Cervantes service env (used by Claude runtime)
nano ~/.openclaw/workspace-cervantes/.env
# DISCORD_WEBHOOK_CERVANTES=https://discord.com/api/webhooks/XXXX/YYYY

# OpenClaw env (used by cron scripts that source it independently)
nano ~/.openclaw/.env
# DISCORD_WEBHOOK_CERVANTES=https://discord.com/api/webhooks/XXXX/YYYY
```

#### 9h. Install systemd service and crons

```bash
cd ~/.openclaw
bash docker/setup-cervantes-cc.sh
```

This installs:
- **systemd service** (`cervantes-claude-code`) — Claude Code with Discord Channel, auto-restart
- **System crontab** — operational scripts (healthcheck, snapshot, regenerate, cost-tracker)
- **Logrotate** — log rotation for cron output

#### 9i. Start the service

```bash
systemctl start cervantes-claude-code
systemctl enable cervantes-claude-code

# Verify it's running
journalctl -u cervantes-claude-code -f
```

### 10. Verify Cervantes

```bash
# Check service status
systemctl status cervantes-claude-code

# Check crontab is installed
crontab -l

# Send a test message in #cervantes-admin on Discord
# Cervantes should respond
```

---

## What happens on first startup

The entrypoint automatically:

1. **Generates `openclaw.json`** — detects Discord guilds via API, binds client guilds to sancho. Also registers the `mc-chat` plugin (Mission Control webchat) and creates the `mc-chat → sancho` binding.
2. **Registers agents** — sancho (Opus, orchestrator) plus the specialist team Sancho delegates to via `Agent(subagent_type="<slug>")` (e.g. hamete, dulcinea, rocinante, …)
3. **Injects env vars** — replaces `{MC_BASE_URL}`, etc. in SOUL.md and protocol files
4. **Installs dependencies** — `npm install` for MC server (ws module)
5. **Generates dashboard** — runs `regenerate.py` for Mission Control HTML/JS

A `.setup-complete` flag prevents re-running setup on container restarts. To force re-setup:

```bash
rm ~/.openclaw/.setup-complete
docker compose restart
```

---

## Connect this VPS to the CI/CD pipeline (GitHub Actions)

Once the VPS is running manually (steps 1–10 above), the next step is to plug it into the pipeline. A push to `main` (the single trunk) auto-deploys to the staging/QA VPS; prod is shipped **manually** by dispatching `deploy-prod.yml` with a tag (publishing a release does not auto-deploy prod). The workflows (`.github/workflows/deploy-staging.yml`, `deploy-prod.yml`) read everything from a GitHub **Environment** — one per VPS.

### The two SSH keys you need

You will configure **two independent SSH keys** with opposite directions. Skipping or mixing them is the most common source of confusion:

| Key | Private lives in… | Public goes to… | Purpose |
|---|---|---|---|
| **Actions → VPS** | GitHub Secret `VPS_SSH_KEY` (environment-scoped) | `~/.ssh/authorized_keys` of the VPS user | Lets GitHub Actions SSH **into** the VPS |
| **VPS → GitHub** | `~/.ssh/github-deploy` on the VPS | GitHub repo → Settings → Deploy keys | Lets the VPS `git fetch` **from** GitHub |

Without both, the deploy fails at different stages: the first key fails at SSH login, the second fails at `git fetch`.

### Step 1 — Generate the "Actions → VPS" key

SSH into the VPS as the user that should receive deploys (recommended: a non-root user, e.g. `deploy`, in the `docker` group).

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github-actions-deploy -N "" -C "github-actions-<env>"
cat ~/.ssh/github-actions-deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Print the PRIVATE key — you'll paste it into GitHub:
cat ~/.ssh/github-actions-deploy
```

Copy everything from `-----BEGIN OPENSSH PRIVATE KEY-----` to `-----END OPENSSH PRIVATE KEY-----` (inclusive).

After uploading it to GitHub (Step 3), delete the private key from the VPS — it has no reason to stay there:

```bash
rm ~/.ssh/github-actions-deploy
# Keep github-actions-deploy.pub if you want a record; authorized_keys is what matters
```

### Step 2 — Generate the "VPS → GitHub" deploy key

Still on the VPS, same user:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github-deploy -N "" -C "vps-<env>-github-fetch"

# Tell SSH to use this key when talking to github.com:
cat >> ~/.ssh/config <<'EOF'

Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github-deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config

# Print the PUBLIC key — you'll paste it into GitHub:
cat ~/.ssh/github-deploy.pub
```

In GitHub: repo → **Settings → Deploy keys → Add deploy key**:
- Title: `VPS <env> — read-only fetch` (e.g. `VPS staging — read-only fetch`)
- Key: paste the public key
- **Allow write access: NO** (read-only is enough for `git fetch`)

Verify from the VPS:

```bash
cd ~/.openclaw   # or wherever the repo is cloned
git fetch origin --prune
# No password prompt, no error → ready
```

### Step 3 — Configure the GitHub Environment

In the repo: **Settings → Environments**. Two environments exist, one per VPS:

| Environment | Triggered by | Required reviewers | Used by |
|---|---|---|---|
| `staging` | merge / push to `main` (the trunk) | none (auto-deploy) | `deploy-staging.yml` |
| `production` | **manual `workflow_dispatch` only** — `npm run deploy:prod`, or the Actions UI with `tag` empty for the latest Release | none — running it is the deliberate go-live | `deploy-prod.yml` |

Both environments use the **same secret and variable names** — only the values differ. Add for the environment matching this VPS:

**Secrets** (Settings → Environments → `<env>` → Add secret — masked in logs, cannot be read back):

| Name | Value | Where to get it |
|---|---|---|
| `VPS_HOST` | Bare hostname or IP — **no protocol, no slash, no spaces** | The IP or domain you set up DNS for in step 2. Examples that work: `staging.example.com`, `app.example.com`, `203.0.113.42`. Examples that break: `https://staging.example.com` (has protocol), `staging.example.com/` (has slash), `staging.example.com ` (trailing space). |
| `VPS_USER` | SSH user that owns `authorized_keys` | The user you ran `ssh-keygen` as in Step 1 (e.g. `deploy`, `root`). Bare username, no `@host` suffix. |
| `VPS_SSH_KEY` | Full private key contents from Step 1 | The output of `cat ~/.ssh/github-actions-deploy` — entire block including the `-----BEGIN OPENSSH PRIVATE KEY-----` and `-----END OPENSSH PRIVATE KEY-----` lines. |

**Variables** (Settings → Environments → `<env>` → Add variable — visible in logs, editable):

| Name | Value | Where to get it |
|---|---|---|
| `DEPLOY_PATH` | Absolute path of the repo clone on the VPS | Output of `echo $HOME/.openclaw` on the VPS as the SSH user (e.g. `/home/deploy/.openclaw`, `/root/.openclaw`). Can be left unset to default to `~/.openclaw`. |
| `HEALTH_URL` | Public URL the workflow polls after deploy | `https://<env-domain>/api/health` — e.g. `https://staging.example.com/api/health`, `https://app.example.com/api/health` |
| `DEPLOY_FROM_IMAGE` | **`production` only, optional.** `1` → deploy by pulling the image CI built for the tag. Unset/`0` → build from source on the VPS (current default). See *Deploying prod from the pre-built image* below | `1` or unset |

> **Secrets vs variables, why two?** Secrets are encrypted at rest and masked as `***` in workflow logs — use them for anything sensitive (private keys, tokens). Variables are stored in plain text and shown in logs — use them for non-sensitive config (paths, public URLs). GitHub does not let you put a secret in a `vars.` context or vice versa, so the names above are not interchangeable.

### Deploying prod from the pre-built image (`DEPLOY_FROM_IMAGE`)

By default prod does `git checkout <tag>` + `docker compose build --pull` — it **recompiles on the VPS** the same source CI already built into `ghcr.io/growth4u-systems/sanchocmo:<tag>` when the release was published. That's ~2-3 min of `npm ci` + `next build` per deploy, and the reason [`SERVER-OPS.md`](./SERVER-OPS.md) prescribes swap and a build-cache prune cron.

Set **`DEPLOY_FROM_IMAGE=1`** on the `production` Environment to pull that image instead. Deploys drop to seconds, build failures surface in CI instead of mid-go-live, and prod runs the exact artifact CI produced rather than a same-source rebuild whose base layers may have drifted. (SAN-455 — Fase 7 of the packaging plan, prod-only.)

What changes when it's on:

- The workflow **waits for the release image to exist** before touching the VPS (up to 10 min). `Publish sanchocmo image` runs on `release: published` and takes minutes, so "merge the release PR, then deploy immediately" would otherwise race it. This guard doesn't exist in build mode because there the tag alone is sufficient.
- `SANCHOCMO_IMAGE=ghcr.io/growth4u-systems/sanchocmo:<tag>` is pinned and **written to `.env` on the VPS**, so a manual `docker compose up -d` on the box stays on the same version instead of resolving the `:latest` compose default.
- An extra step **asserts `/api/health` reports the deployed commit**, so a pulled-but-not-swapped container fails the deploy (and trips the rollback) instead of passing a plain ping.

The git checkout still happens either way — `~/.openclaw` is both the clone and the container's bind mount, so the workspace/skills/prompts come from the tree while the app comes from the image.

**To turn it off**, unset the variable: the next deploy builds from source again. Note the `SANCHOCMO_IMAGE` line already written to `.env` is not removed (the upsert only adds/updates); it's harmless — Compose tags the local build with that name — but delete the line on the VPS if you want the box back to a pristine build-mode `.env`.

**Rolling it out:** flip it on, deploy one release, and confirm `/api/health` reports that release's commit. If anything looks wrong, unset the variable and re-dispatch — that's a full return to the current behaviour, no code change needed.

### Step 4 — Trigger the first deploy and verify

**For `staging`:** any push or merge to the `main` branch (the trunk) triggers `deploy-staging.yml`. To force a run on a clean VPS without code changes:

```bash
git commit --allow-empty -m "chore: trigger first staging deploy"
git push origin main
```

**For `production`:** the deploy is **manual only** — publishing a GitHub Release does *not* deploy prod (it only builds the image). You pick a **version**, never a branch. Two ways, both equivalent:

**a) From the terminal (recommended — this is the version picker):**

```bash
npm run deploy:prod              # lists published Releases, you choose, it confirms
npm run deploy:prod -- --latest  # ship the newest Release, no prompt
npm run deploy:prod -- --dry-run # show what it would dispatch, ship nothing
```

Only *published Releases* are offered, and `--ref main` is pinned for you.

**b) From the Actions UI:**

1. Actions → "Deploy to Production"
2. Leave "Use workflow from" on **`main`** (see the warning below)
3. "Run workflow" → **leave `tag` empty to ship the latest published Release**, or type a tag (e.g. `v1.2.3`) → Run

> **Why is there no version dropdown?** GitHub reads `workflow_dispatch` inputs from static YAML and cannot populate them from the Releases API — a dropdown would have to be hardcoded and regenerated on every release. Hence: empty = latest, or use `npm run deploy:prod` for a real list. (SAN-450)

> ⚠️ **"Use workflow from" is not the version.** That picker selects which copy of `deploy-prod.yml` *runs*, not what gets deployed — the version comes from the `tag` input. Dispatching from a feature branch would ship a legit tag using that branch's unreviewed deploy logic, so the workflow **refuses any ref except `main`**.

Two guards run before prod is touched, so mistakes fail fast instead of half-deploying:

| Guard | Rejects |
|---|---|
| dispatch must come from `main` | a run dispatched from any other branch/ref |
| tag must be a published Release | a typo, or a hand-cut tag with no Release (e.g. `v1.0.6`–`v1.0.8` exist as tags but are **not** deployable — see SAN-430) |

Watch the run at `https://github.com/<org>/<repo>/actions`. Expected step order and what each failure means:

| Step | Failure symptom in logs | Likely cause |
|---|---|---|
| **Setup SSH agent** | `Error loading key`, agent fails to start | `VPS_SSH_KEY` is empty, missing BEGIN/END lines, or has Windows line endings |
| **Add VPS host to known_hosts** | `getaddrinfo ***: Name or service not known` (many retries) | `VPS_HOST` has a typo, a leading `https://`, a trailing `/`, an extra space, or DNS hasn't propagated. Re-paste the value, then verify with `dig <host> +short` |
| **Deploy via SSH** | `Permission denied (publickey)` | The Actions→VPS key (Step 1) wasn't added to `~/.ssh/authorized_keys` of `VPS_USER` on the VPS |
| **Deploy via SSH** | `Permission denied (publickey)` **on `git fetch`** | The VPS→GitHub deploy key (Step 2) is missing or `~/.ssh/config` doesn't point at it |
| **Deploy via SSH** | `cd: ...: No such file or directory` | `DEPLOY_PATH` doesn't match the repo location on the VPS |
| **Deploy via SSH** | `docker: permission denied while trying to connect` | `VPS_USER` is not in the `docker` group on the VPS |
| **Health check** | Curl returns HTML / 404 / 502 | The container started but the deployed code doesn't have `/api/health`, or nginx isn't routing to port 3000 |
| **Health check** | Connection times out | The container didn't start — check `docker compose logs` on the VPS |

End-to-end success looks like:

```bash
curl -s https://<env-domain>/api/health
# {
#   "ok": true,
#   "version": "0.1.0",
#   "commit": "<SHA of the deployed commit>",
#   "env": "STAGING" | "PRODUCTION",
#   "timestamp": "...",
#   "uptimeSeconds": <small number after fresh deploy>
# }
```

### Rotating or removing keys

**Rotating `VPS_SSH_KEY` (e.g. after suspected compromise):**
1. On the VPS, generate a new key (`ssh-keygen ...`), append the new public key to `~/.ssh/authorized_keys`
2. Overwrite the GitHub Secret with the new private key
3. Test with a `workflow_dispatch` run
4. Remove the **old** public key line from `~/.ssh/authorized_keys`

**Rotating the deploy key:**
1. Generate a new one in the VPS, update `~/.ssh/config` to point at it
2. Add the new public key in GitHub → repo Settings → Deploy keys
3. Test `git fetch` on the VPS
4. Delete the old deploy key from the GitHub list

**Decommissioning a VPS:** remove `VPS_HOST`/`VPS_USER`/`VPS_SSH_KEY` from the environment (workflow fails fast and doesn't touch the VPS), then delete the deploy key from the repo to revoke its access.

---

## Operations

### View logs

```bash
docker logs sanchocmo --tail 100 -f
```

### Restart

```bash
docker compose restart
```

### Update (after git pull)

```bash
git pull
docker compose up -d --build
```

### Rebuild image from scratch

```bash
docker compose build --no-cache && docker compose up -d
```

### Backups

**Data snapshots** (every 3h) — `snapshot-data.sh` creates tarballs of private data (brand, memory, config, SQLite) on the Hetzner volume. Runs via system crontab (not inside Docker):

```bash
bash ~/.openclaw/workspace-cervantes/scripts/snapshot-data.sh
```

Snapshots are stored at `/mnt/data/snapshots/` (last 24 retained, ~3 days). To restore from a snapshot:

```bash
# Stop the container first
docker compose down

# Extract snapshot over the data directory
tar xzf /mnt/data/snapshots/snapshot-YYYY-MM-DD_HHMM.tar.gz -C ~/.openclaw

# Restart
docker compose up -d
```

### SSL renewal

```bash
# Dry run (test without making changes)
certbot renew --dry-run

# Actual renewal (certbot auto-renews via systemd timer)
certbot renew
```

### Monitoring

A healthcheck runs every 6 hours via system crontab. To run it manually:

```bash
bash ~/.openclaw/workspace-cervantes/scripts/healthcheck.sh
```

### Cervantes service

```bash
# View Cervantes logs
journalctl -u cervantes-claude-code -f

# Restart Cervantes
systemctl restart cervantes-claude-code

# Stop Cervantes
systemctl stop cervantes-claude-code

# Check cron job logs
tail -f /var/log/cervantes-*.log
```

---

## Architecture

```
Internet → nginx (:443, SSL) → Docker container
                                  ├── OpenClaw Gateway (:18789)  ← Sancho + specialist agents
                                  └── MC Server (:18790)

Discord → Claude Code (Cervantes)     ← runs on host, NOT in Docker
            ├── Channel plugin (Discord)
            └── CWD: ~/.openclaw/workspace-cervantes/

Persistent data: ~/.openclaw/        (bind-mounted into container + accessed by Cervantes)
SSH keys:        ~/.ssh/              (bind-mounted read-only for git push)
Data snapshots:  /mnt/data/snapshots/ (Hetzner volume, every 3h)
Cervantes logs:  /var/log/cervantes-* (logrotated weekly)
```

**Auto-configuration flow:**
```
.env (secrets) + Discord API (guild detection)
        ↓
generate-openclaw-config.js
        ↓
.openclaw/openclaw.json (agents, bindings, guilds)
        ↓
openclaw gateway run (reads config, connects to Discord)
```

---

## Troubleshooting

| Symptom | What to check |
|---|---|
| Container won't start | `docker logs sanchocmo` — look for missing env vars or config errors |
| Bot online but not responding | Approve your device: `docker exec sanchocmo openclaw pairing approve discord <CODE>` |
| Bot responds in DM but not in server | Check guild bindings: `docker exec sanchocmo openclaw agents bindings` |
| No guilds detected | Verify `DISCORD_BOT_TOKEN` in `.env` and that the bot is invited to your Discord servers |
| MC Chat no responde | Verificar: 1) Plugin cargado: `openclaw plugins list \| grep mc-chat` 2) Canal configurado: `channels.mc-chat` en openclaw.json 3) Binding existe: `mc-chat → sancho` en bindings 4) Gateway reiniciado después de instalar plugin |
| nginx returns 502 | Container is down. Check `docker ps` and `curl localhost:18790/mc/api/health-check` |
| nginx won't start (SSL error) | `curl -o /etc/letsencrypt/options-ssl-nginx.conf https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf` |
| SSL certificate expired | `certbot renew && systemctl reload nginx` |
| Can't push to GitHub from container | `docker exec sanchocmo ssh -T git@github.com` — verify SSH key is mounted |
| Port already in use | `ss -tlnp \| grep <port>` to find the conflicting process |
| Need to reconfigure agents/guilds | `rm ~/.openclaw/.setup-complete && docker compose restart` |
| Cervantes not responding in Discord | `systemctl status cervantes-claude-code` — check if running |
| Cervantes reads but never replies (logged in as Sancho) | `DISCORD_BOT_TOKEN` in `~/.openclaw/workspace-cervantes/.env` points to the wrong bot. Verify with `curl -H "Authorization: Bot $TOKEN" https://discord.com/api/v10/users/@me` — the `username` must be the Cervantes bot. Never set `DISCORD_BOT_TOKEN` in the OpenClaw `.env` expecting Cervantes to pick it up; the service only reads the workspace env file. |
| Cervantes auth expired | Run `claude setup-token` on VPS, open URL in local browser, paste token back |
| Sancho responds in Cervantes guild | Verify `CERVANTES_GUILD_ID` is set in `.env`, then `rm ~/.openclaw/.setup-complete && docker compose restart` |
| Cron jobs not running | `crontab -l` — verify crontab is installed. Re-run `bash docker/setup-cervantes-cc.sh` |
| Smart crons fail (claude -p) | Check `CLAUDE_CODE_OAUTH_TOKEN` in `.env` and rate limits |
