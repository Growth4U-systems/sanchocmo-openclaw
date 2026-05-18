#!/bin/bash
# setup-open-design.sh — Provision the Open Design agentic editor on a SanchoCMO VPS.
# Usage: bash docker/setup-open-design.sh <od-domain>
# Example: bash docker/setup-open-design.sh od.staging.sanchocmo.ai
#
# Prerequisites:
#   - SanchoCMO already provisioned via setup-vps.sh (Docker + nginx + certbot installed)
#   - DNS A record pointing <od-domain> to this server's IP
#   - Run as root (or with sudo)
#
# What it does:
#   1. Pulls the Open Design image and starts the `open-design` compose service.
#   2. Installs an nginx vhost for the subdomain (HTTP → HTTPS redirect, proxy → 127.0.0.1:7456).
#   3. Issues a Let's Encrypt cert via `certbot --nginx` (uses the running nginx).
#   4. Appends OD_WEB_URL / OD_ALLOWED_ORIGINS to /root/.openclaw/.env if not already set.
#   5. Recreates the sanchocmo container so MC picks up the new env vars.
#
# Re-running is safe; existing certs and env entries are not duplicated.
set -euo pipefail

OD_DOMAIN="${1:?Usage: bash docker/setup-open-design.sh <od-domain>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$REPO_DIR/.env"

echo "=== Open Design Setup ==="
echo "Domain: $OD_DOMAIN"
echo "Repo:   $REPO_DIR"
echo ""

# --- Step 1: Verify prerequisites ---
echo "[1/5] Verifying prerequisites..."
command -v docker >/dev/null || { echo "ERROR: docker not installed. Run setup-vps.sh first."; exit 1; }
command -v nginx >/dev/null || { echo "ERROR: nginx not installed. Run setup-vps.sh first."; exit 1; }
command -v certbot >/dev/null || { echo "ERROR: certbot not installed. Run setup-vps.sh first."; exit 1; }
[ -f "$ENV_FILE" ] || { echo "ERROR: $ENV_FILE missing. Copy .env.example and configure first."; exit 1; }

# DNS sanity check (warn only — Let's Encrypt will fail loudly anyway)
EXPECTED_IP="$(curl -fsS -4 ifconfig.me 2>/dev/null || true)"
RESOLVED_IP="$(dig +short "$OD_DOMAIN" @1.1.1.1 2>/dev/null | tail -1 || true)"
if [ -n "$EXPECTED_IP" ] && [ -n "$RESOLVED_IP" ] && [ "$EXPECTED_IP" != "$RESOLVED_IP" ]; then
  echo "  WARNING: $OD_DOMAIN resolves to $RESOLVED_IP but this VPS is $EXPECTED_IP."
  echo "  certbot will likely fail. Fix the A record and retry."
fi

# --- Step 2: Start the open-design container ---
echo "[2/5] Starting open-design container..."
( cd "$REPO_DIR" && docker compose pull open-design && docker compose up -d open-design )

# Wait for healthy (up to 60s)
for _ in $(seq 1 20); do
  status="$(docker inspect -f '{{.State.Health.Status}}' open-design 2>/dev/null || echo unknown)"
  [ "$status" = "healthy" ] && break
  sleep 3
done
if [ "$status" != "healthy" ]; then
  echo "ERROR: open-design did not become healthy. Check: docker logs open-design"
  exit 1
fi
echo "  open-design: healthy"

# --- Step 3: Install nginx vhost (HTTP-only) and issue cert ---
echo "[3/5] Installing nginx vhost for $OD_DOMAIN..."
VHOST="/etc/nginx/sites-available/sancho-od"
TEMPLATE="$SCRIPT_DIR/nginx-od.conf.template"
[ -f "$TEMPLATE" ] || { echo "ERROR: template $TEMPLATE missing"; exit 1; }

if [ -d "/etc/letsencrypt/live/$OD_DOMAIN" ]; then
  # Cert already exists — install full vhost from template, no certbot run needed.
  sed "s/OD_DOMAIN/$OD_DOMAIN/g" "$TEMPLATE" > "$VHOST"
  ln -sfn "$VHOST" /etc/nginx/sites-enabled/sancho-od
  nginx -t
  systemctl reload nginx
  echo "[4/5] Cert already exists for $OD_DOMAIN — skipping certbot."
else
  # First run: drop in an HTTP-only vhost (no SSL paths yet so nginx starts),
  # then let `certbot --nginx` rewrite it to add the SSL block.
  cat > "$VHOST" <<EOF
server {
    listen 80;
    server_name $OD_DOMAIN;

    client_max_body_size 100M;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;

    location / {
        proxy_pass http://127.0.0.1:7456;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_cache off;
    }
}
EOF
  ln -sfn "$VHOST" /etc/nginx/sites-enabled/sancho-od
  nginx -t
  systemctl reload nginx

  echo "[4/5] Issuing cert for $OD_DOMAIN..."
  certbot --nginx \
    -d "$OD_DOMAIN" \
    --non-interactive \
    --agree-tos \
    --email "admin@${OD_DOMAIN#*.}" \
    --redirect \
    || { echo "ERROR: certbot failed. Is DNS pointing to this server?"; exit 1; }
fi

# --- Step 5: Update .env and recreate sanchocmo ---
echo "[5/5] Wiring MC to OD..."
update_env() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    # Already present — leave it (operator may have customized it).
    echo "  $key already set in .env (leaving as-is)."
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
    echo "  $key=$value appended to .env."
  fi
}

# Pre-pend section header if first time we're touching OD vars here.
if ! grep -q "Open Design (agentic editor)" "$ENV_FILE"; then
  {
    printf '\n# === Open Design (agentic editor — added by setup-open-design.sh %s) ===\n' \
      "$(date -u +%Y-%m-%d)"
  } >> "$ENV_FILE"
fi

update_env OD_WEB_URL "https://$OD_DOMAIN"
update_env OD_ALLOWED_ORIGINS "https://$OD_DOMAIN"

( cd "$REPO_DIR" && docker compose up -d sanchocmo )

echo ""
echo "=== Open Design Ready ==="
echo ""
echo "Verify:"
echo "  curl -fsS https://$OD_DOMAIN/api/health"
echo "  open https://$OD_DOMAIN/"
echo ""
echo "Mission Control → Media Creation → 'Abrir editor agentic' now opens"
echo "  https://$OD_DOMAIN in a new tab."
