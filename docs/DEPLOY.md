# SanchoCMO — VPS Deploy Guide

This guide covers deploying SanchoCMO to a VPS using Docker Compose and nginx. A basic familiarity with Linux and Docker is assumed.

---

## Requirements

| Resource | Minimum |
|---|---|
| VPS | 2 vCPU, 4 GB RAM, 20 GB disk |
| OS | Ubuntu 22.04 |
| Block storage | 10 GB volume mounted at `/mnt/data` (for data snapshots) |
| Domain | A record pointing to VPS IP |
| GitHub SSH key | On the VPS, for Cervantes backups |
| Discord | Bot token + client ID |
| Anthropic | API key |

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

Wait for DNS propagation before proceeding (usually a few minutes).

### 3. SSH into the VPS and clone the repo

```bash
ssh root@<VPS IP>

# Generate an SSH key if you don't have one
ssh-keygen -t ed25519 -C "vps@sanchocmo"
cat ~/.ssh/id_ed25519.pub   # Add this to GitHub → Settings → SSH keys

# Clone the repository
git clone git@github.com:Growth4U-systems/sanchocmo-openclaw.git ~/.openclaw
cd ~/.openclaw
```

### 4. Run setup script

The setup script installs Docker, nginx, certbot, configures SSL, and sets up UFW firewall rules.

```bash
bash docker/setup-vps.sh staging.sanchocmo.ai
```

Replace `staging.sanchocmo.ai` with your actual domain. The script derives a Let's Encrypt email from your domain (e.g., `admin@sanchocmo.ai`).

### 5. Configure environment and instance

**`.env`** — copy from the example and fill in your secrets:

```bash
cp .env.example .env
nano .env
```

Required values:

```env
ANTHROPIC_API_KEY=sk-ant-...
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
CERVANTES_GUILD_ID=your_infra_guild_id
```

**`config/instance.json`** — set your Mission Control base URL:

```json
{
  "mc_base_url": "https://staging.sanchocmo.ai/mc"
}
```

**`config/clients.json`** — configure your client workspaces as needed.

### 6. Launch

```bash
docker compose up -d
```

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

**Data snapshots** (every 3h) — `snapshot-data.sh` creates tarballs of private data (brand, memory, config, SQLite) on the Hetzner volume:

```bash
docker exec sanchocmo bash workspace-cervantes/scripts/snapshot-data.sh
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

A healthcheck runs every 6 hours via cron. To run it manually:

```bash
docker exec sanchocmo bash workspace-cervantes/scripts/healthcheck.sh
```

---

## Architecture

```
Internet → nginx (:443, SSL) → Docker container
                                  ├── OpenClaw Gateway (:18789)
                                  └── MC Server (:18790)

Persistent data: ~/.openclaw/        (bind-mounted into container)
SSH keys:        ~/.ssh/              (bind-mounted read-only for git push)
Data snapshots:  /mnt/data/snapshots/ (Hetzner volume, every 3h)
```

---

## Troubleshooting

| Symptom | What to check |
|---|---|
| Container won't start | `docker logs sanchocmo` — look for missing env vars or config errors |
| nginx returns 502 | Container is down. Check `docker ps` and `curl localhost:18789` |
| SSL certificate expired | `certbot renew && systemctl reload nginx` |
| Can't push to GitHub from container | `docker exec sanchocmo ssh -T git@github.com` — verify SSH key is mounted |
| Port already in use | `ss -tlnp \| grep <port>` to find the conflicting process |
