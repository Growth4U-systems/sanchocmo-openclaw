#!/bin/bash
# setup-vps.sh — One-shot VPS provisioning for SanchoCMO
# Usage: bash docker/setup-vps.sh <domain>
# Example: bash docker/setup-vps.sh staging.sanchocmo.ai
#
# Prerequisites:
#   - Fresh Ubuntu 22.04 VPS
#   - DNS A record pointing <domain> to this server's IP
#   - Run as root (or with sudo)
set -euo pipefail

DOMAIN="${1:?Usage: bash docker/setup-vps.sh <domain>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== SanchoCMO VPS Setup ==="
echo "Domain: $DOMAIN"
echo "Repo:   $REPO_DIR"
echo ""

# --- Step 1: System update ---
echo "[1/6] Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq

# --- Step 2: Install Docker ---
echo "[2/6] Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
else
  echo "  Docker already installed: $(docker --version)"
fi

# Verify docker compose plugin
if ! docker compose version &> /dev/null; then
  echo "ERROR: Docker Compose plugin not found. Install it manually."
  exit 1
fi

# --- Step 3: Install nginx ---
echo "[3/6] Installing nginx..."
apt-get install -y -qq nginx
systemctl enable nginx

# --- Step 4: Install certbot + get SSL certificate ---
echo "[4/6] Setting up SSL with Let's Encrypt..."
apt-get install -y -qq certbot python3-certbot-nginx

# Stop nginx temporarily for standalone cert issuance
systemctl stop nginx

certbot certonly --standalone \
  --non-interactive \
  --agree-tos \
  --email "admin@${DOMAIN#*.}" \
  -d "$DOMAIN" \
  || { echo "ERROR: certbot failed. Is DNS pointing to this server?"; exit 1; }

# --- Step 5: Configure nginx ---
echo "[5/6] Configuring nginx..."
sed "s/DOMAIN/$DOMAIN/g" "$SCRIPT_DIR/nginx.conf.template" \
  > /etc/nginx/sites-available/sanchocmo

ln -sf /etc/nginx/sites-available/sanchocmo /etc/nginx/sites-enabled/sanchocmo
rm -f /etc/nginx/sites-enabled/default

# Test and start nginx
nginx -t
systemctl start nginx

# Enable certbot auto-renewal
systemctl enable certbot.timer
systemctl start certbot.timer

# --- Step 6: Configure firewall ---
echo "[6/6] Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP (redirect)
ufw allow 443/tcp  # HTTPS
ufw --force enable

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo ""
echo "  1. Configure your instance:"
echo "     cd $REPO_DIR"
echo "     cp .env.example .env && nano .env"
echo "     cp config/instance.json.example config/instance.json && nano config/instance.json"
echo "     cp config/clients.json.example config/clients.json && nano config/clients.json"
echo ""
echo "  2. Set mc_base_url in instance.json to:"
echo "     https://$DOMAIN/mc"
echo ""
echo "  3. Launch SanchoCMO:"
echo "     cd $REPO_DIR && docker compose up -d"
echo ""
echo "  4. Verify:"
echo "     curl https://$DOMAIN/mc/api/health-check"
echo "     docker logs sanchocmo --tail 50"
echo ""
