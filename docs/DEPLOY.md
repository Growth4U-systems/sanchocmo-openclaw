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
| Discord | Bot token + client ID + Message Content Intent enabled |
| Discord (Cervantes) | Separate bot token for Cervantes Claude Code Channel + webhook URL for #cervantes-admin |
| Anthropic | API key (for Sancho/Escudero/Rocinante via OpenClaw) |
| Claude Code | OAuth token via `claude setup-token` (for Cervantes membership) |
| Bun | Required for Claude Code Discord Channel plugin |

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
# OpenClaw (Sancho, Escudero, Rocinante)
ANTHROPIC_API_KEY=sk-ant-...
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_BOT_CLIENT_ID=your_discord_bot_client_id
BASE_URL=https://your-domain.com

# Cervantes (Claude Code — runs outside Docker)
CLAUDE_CODE_OAUTH_TOKEN=your_oauth_token_from_claude_setup_token
DISCORD_WEBHOOK_CERVANTES=https://discord.com/api/webhooks/XXXX/YYYY
```

> **Note:** `CERVANTES_GUILD_ID` is no longer needed — Cervantes no longer runs in OpenClaw.

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

```bash
# Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

# Install Bun (for Discord Channel plugin)
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Generate OAuth token (on a machine with a browser):
claude setup-token
# Copy the token and add it to .env:
# CLAUDE_CODE_OAUTH_TOKEN=<token>

# Create Discord webhook for #cervantes-admin:
# Discord → Cervantes Brain guild → #cervantes-admin → Integrations → Webhooks → New
# Copy URL and add to .env:
# DISCORD_WEBHOOK_CERVANTES=<webhook-url>

# Run the setup script
bash docker/setup-cervantes-cc.sh
```

This installs:
- **systemd service** (`cervantes-claude-code`) — Claude Code with Discord Channel, auto-restart
- **System crontab** — operational scripts (healthcheck, backup, snapshot, regenerate, cost-tracker)
- **Logrotate** — log rotation for cron output

After setup:

```bash
# Start the service
systemctl start cervantes-claude-code
systemctl enable cervantes-claude-code

# Watch logs for Discord bot pairing instructions
journalctl -u cervantes-claude-code -f
```

**Discord Channel pairing:**

1. Create a separate Discord bot for Cervantes (Discord Developer Portal → New Application)
2. Enable **Message Content Intent** in Bot settings
3. Invite it to the Cervantes Brain guild
4. Start Claude Code service, then in the logs:
   - Configure: `/discord:configure <cervantes-bot-token>`
   - DM the bot in Discord → get pairing code
   - Pair: `/discord:access pair <code>`
   - Lock down: `/discord:access policy allowlist`

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
3. **Injects env vars** — replaces `{MC_BASE_URL}`, `{CERVANTES_GUILD_ID}`, etc. in SOUL.md and protocol files
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
| Cervantes OAuth token expired | Generate new token: `claude setup-token` on machine with browser, update `.env` |
| Cron jobs not running | `crontab -l` — verify crontab is installed. Re-run `bash docker/setup-cervantes-cc.sh` |
| Smart crons fail (claude -p) | Check `CLAUDE_CODE_OAUTH_TOKEN` in `.env` and rate limits |
