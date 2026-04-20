# SanchoCMO — VPS Deploy Guide

Deploy SanchoCMO to a VPS using Docker Compose and nginx.

---

## Requirements

| Resource | Minimum |
|---|---|
| VPS | 2 vCPU, 4 GB RAM, 20 GB disk |
| OS | Ubuntu 22.04 |
| Block storage | 10 GB volume mounted at `/mnt/data` (for data snapshots) |
| Domain | A record pointing to VPS IP |
| GitHub SSH key | On the VPS, for Cervantes backups |
| Discord (OpenClaw) | Bot token + client ID + Message Content Intent enabled |
| Discord (Cervantes) | Separate bot token for Cervantes Claude Code Channel + webhook URL for #cervantes-admin |
| Anthropic | API key (for Sancho/Escudero/Rocinante via OpenClaw) |
| MiniMax (optional) | API key for MiniMax M2.7 — cheaper execution for Escudero/Rocinante |
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
Name: staging.sanchocmo.ai   (or your chosen subdomain)
Value: <VPS IP>
TTL:  300
```

**Verify DNS propagation before proceeding** (certbot will fail otherwise):

```bash
dig staging.sanchocmo.ai +short
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
bash docker/setup-vps.sh staging.sanchocmo.ai
```

Replace `staging.sanchocmo.ai` with your actual domain.

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

# Model provider (at least Anthropic)
ANTHROPIC_API_KEY=sk-ant-...

# Discord bot (OpenClaw agents)
DISCORD_BOT_TOKEN=your_discord_bot_token

# Domain
BASE_URL=https://your-domain.com

# Next.js Mission Control
DATABASE_URL=postgresql://user:pass@ep-xxx.region.neon.tech/mc
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
# Alternative model providers (cheaper execution for Escudero/Rocinante)
MINIMAX_API_KEY=...          # MiniMax M2.7 — used for task execution
XAI_API_KEY=...              # xAI Grok models
OPENROUTER_API_KEY=...       # OpenRouter proxy

# Cloudflare R2 (image uploads in Mission Control)
CLOUDFLARE_ACCOUNT_ID=...
R2_UPLOAD_IMAGE_ACCESS_KEY_ID=...
R2_UPLOAD_IMAGE_SECRET_ACCESS_KEY=...
R2_UPLOAD_IMAGE_BUCKET_NAME=...
R2_PUBLIC_URL=...

# Search & scraping (used by Sancho skills)
SERPER_API_KEY=...           # Google Search via Serper.dev
FIRECRAWL_API_KEY=...        # Web scraping
```

> See `.env.example` for the full list of optional variables (payments, social media, analytics, etc.).

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

### 6. Launch

```bash
docker compose up -d
```

First launch builds the Docker image (~2-3 minutes), generates `openclaw.json`, registers agents (sancho, escudero, rocinante), and auto-detects Discord guilds.

> **Cervantes** does NOT run inside Docker. See step 8 below.

### 7. Verify

```bash
# Check container is running
docker ps

# Hit the health endpoint
curl https://staging.sanchocmo.ai/mc/api/health-check

# Stream logs
docker logs sanchocmo --tail 50 -f

# Check bot status inside container
docker exec sanchocmo openclaw status
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

This webhook is used by healthcheck, backup, and alert scripts — it's separate from the bot.

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
- **System crontab** — operational scripts (healthcheck, backup, snapshot, regenerate, cost-tracker)
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
2. **Registers agents** — sancho (Opus), escudero (Sonnet), rocinante (Opus)
3. **Injects env vars** — replaces `{MC_BASE_URL}`, etc. in SOUL.md and protocol files
4. **Installs dependencies** — `npm install` for MC server (ws module)
5. **Generates dashboard** — runs `regenerate.py` for Mission Control HTML/JS

A `.setup-complete` flag prevents re-running setup on container restarts. To force re-setup:

```bash
rm ~/.openclaw/.setup-complete
docker compose restart
```

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

Two backup mechanisms run automatically:

**Framework backup** (daily at 03:00) — `backup.sh` commits and pushes git-tracked files to GitHub:

```bash
docker exec sanchocmo bash workspace-sancho/scripts/backup.sh
```

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
                                  ├── OpenClaw Gateway (:18789)  ← Sancho, Escudero, Rocinante
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
