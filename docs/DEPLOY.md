# SanchoCMO — VPS Deploy Guide

This guide covers deploying SanchoCMO to a VPS using Docker Compose and nginx. A basic familiarity with Linux and Docker is assumed.

---

## Requirements

| Resource | Minimum |
|---|---|
| VPS | 2 vCPU, 4 GB RAM, 20 GB disk |
| OS | Ubuntu 22.04 |
| Domain | A record pointing to VPS IP |
| GitHub SSH key | On the VPS, for Cervantes backups |
| Discord | Bot token + client ID |
| Anthropic | API key |

Tested on: **Hetzner CX22**

---

## Steps

### 1. Provision VPS

Spin up an Ubuntu 22.04 server on Hetzner, DigitalOcean, or any compatible provider. Note the public IP address.

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

Replace `staging.sanchocmo.ai` with your actual domain. The script will prompt for your email address for Let's Encrypt certificate registration.

### 5. Configure environment and instance

**`.env`** — copy from the example and fill in your secrets:

```bash
cp .env.example .env
nano .env
```

Required values:

```env
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
ANTHROPIC_API_KEY=your_anthropic_api_key
```

**`config/instance.json`** — set your Mission Control base URL:

```json
{
  "mc_base_url": "https://staging.sanchocmo.ai"
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
curl https://staging.sanchocmo.ai/health

# Stream logs
docker logs sanchocmo --tail 50 -f

# Check bot status inside container
docker exec openclaw status
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

Cervantes runs a backup automatically every day. To trigger a manual backup:

```bash
docker exec sanchocmo bash scripts/backup.sh
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

Persistent data: ~/.openclaw/ (bind-mounted into container)
SSH keys:        ~/.ssh/       (bind-mounted read-only for git push)
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
