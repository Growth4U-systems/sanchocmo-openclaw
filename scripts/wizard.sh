#!/usr/bin/env bash
# ============================================================================
# SanchoCMO setup wizard
# ----------------------------------------------------------------------------
# Generates a ready-to-run configuration for a fresh install:
#   - .env                  (secrets + provider key + admin domain + DB choice)
#   - config/instance.json  (minimal, no Discord)
#   - config/clients.json   (your first brand + generated tokens)
#
# Interactive by default. For non-interactive / CI use, set WIZARD_ASSUME_YES=1
# and pass answers as environment variables (same names the wizard writes, plus
# PROVIDER / DB_MODE / FIRST_BRAND_SLUG / FIRST_BRAND_NAME / BASE_URL).
#
# It never overwrites an existing .env / config file unless you pass --force.
# ============================================================================
set -euo pipefail

# --- Locate repo root (this script lives in scripts/) ------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE=".env"
ENV_EXAMPLE=".env.example"
INSTANCE_FILE="config/instance.json"
CLIENTS_FILE="config/clients.json"

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -h|--help)
      grep '^# ' "$0" | sed 's/^# //'; exit 0 ;;
  esac
done

# --- Pretty output -----------------------------------------------------------
if [ -t 1 ]; then
  B=$'\033[1m'; DIM=$'\033[2m'; GRN=$'\033[32m'; YLW=$'\033[33m'; CYN=$'\033[36m'; RST=$'\033[0m'
else
  B=""; DIM=""; GRN=""; YLW=""; CYN=""; RST=""
fi
say()  { printf '%s\n' "$*"; }
step() { printf '\n%s▸ %s%s\n' "$B" "$*" "$RST"; }
ok()   { printf '  %s✓%s %s\n' "$GRN" "$RST" "$*"; }
warn() { printf '  %s!%s %s\n' "$YLW" "$RST" "$*"; }

# --- Interactivity helpers ---------------------------------------------------
# Non-interactive when there's no TTY or WIZARD_ASSUME_YES=1.
INTERACTIVE=1
if [ "${WIZARD_ASSUME_YES:-0}" = "1" ] || [ ! -t 0 ]; then INTERACTIVE=0; fi

# ask <var-name> <prompt> <default>
# Resolution order: existing env value > interactive prompt > default.
ask() {
  local var="$1" prompt="$2" default="${3:-}" current
  current="$(printf '%s' "${!var:-}")"
  if [ -n "$current" ]; then printf '%s' "$current"; return; fi
  if [ "$INTERACTIVE" = "1" ]; then
    local reply
    if [ -n "$default" ]; then
      read -r -p "  $prompt [$default]: " reply </dev/tty || true
    else
      read -r -p "  $prompt: " reply </dev/tty || true
    fi
    printf '%s' "${reply:-$default}"
  else
    printf '%s' "$default"
  fi
}

# --- Secret generation -------------------------------------------------------
need_cmd() { command -v "$1" >/dev/null 2>&1 || { say "ERROR: '$1' is required but not installed."; exit 1; }; }
need_cmd openssl
gen_b64() { openssl rand -base64 32 | tr -d '\n'; }
gen_hex() { openssl rand -hex 32; }

# --- set_env KEY VALUE : set-or-append a key in $ENV_FILE (uncomments if needed)
set_env() {
  local key="$1" val="$2"
  if grep -qE "^#?[[:space:]]*${key}=" "$ENV_FILE" 2>/dev/null; then
    awk -v k="$key" -v v="$val" '
      !done && $0 ~ ("^#?[[:space:]]*" k "=") { print k "=" v; done=1; next }
      { print }
    ' "$ENV_FILE" > "$ENV_FILE.tmp" && mv "$ENV_FILE.tmp" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
}

# --- Guard against clobbering -------------------------------------------------
EXISTING=()
[ -f "$ENV_FILE" ] && EXISTING+=("$ENV_FILE")
[ -f "$INSTANCE_FILE" ] && EXISTING+=("$INSTANCE_FILE")
[ -f "$CLIENTS_FILE" ] && EXISTING+=("$CLIENTS_FILE")
if [ "${#EXISTING[@]}" -gt 0 ] && [ "$FORCE" != "1" ]; then
  warn "These files already exist: ${EXISTING[*]}"
  say  "  Refusing to overwrite. Re-run with --force to regenerate, or edit them by hand."
  exit 1
fi

say "${B}SanchoCMO — setup wizard${RST}"
say "${DIM}Generates .env + config/*.json so you can 'docker compose up'.${RST}"

# --- 1. Model provider + API key --------------------------------------------
step "1/6  Model provider"
PROVIDER="$(ask PROVIDER "Provider — anthropic, openai, fireworks, both, or all" "anthropic")"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
OPENAI_API_KEY="${OPENAI_API_KEY:-}"
FIREWORKS_API_KEY="${FIREWORKS_API_KEY:-}"
case "$PROVIDER" in
  anthropic|both|all|multi) ANTHROPIC_API_KEY="$(ask ANTHROPIC_API_KEY "Anthropic API key (sk-ant-...)" "")" ;;
esac
case "$PROVIDER" in
  openai|both|all|multi) OPENAI_API_KEY="$(ask OPENAI_API_KEY "OpenAI API key (sk-...)" "")" ;;
esac
case "$PROVIDER" in
  fireworks|all|multi) FIREWORKS_API_KEY="$(ask FIREWORKS_API_KEY "Fireworks API key (fw-...)" "")" ;;
esac
ANTHROPIC_AUTH_MODE="$(ask ANTHROPIC_AUTH_MODE "Anthropic auth mode — api_key or subscription" "api_key")"
OPENAI_AUTH_MODE="$(ask OPENAI_AUTH_MODE "OpenAI auth mode — api_key or subscription" "api_key")"

# --- 2. Admin access ---------------------------------------------------------
step "2/6  Admin access"
ADMIN_EMAIL_DOMAIN="$(ask ADMIN_EMAIL_DOMAIN "Admin email domain (emails @this become admins)" "example.com")"
ADMIN_IDENTITY_EMAIL="$(ask ADMIN_IDENTITY_EMAIL "Admin contact email" "admin@${ADMIN_EMAIL_DOMAIN}")"

# --- 3. Database -------------------------------------------------------------
step "3/6  Database"
say "  ${DIM}'local' uses the bundled Postgres (recommended). 'external' uses your own (e.g. Neon).${RST}"
DB_MODE="$(ask DB_MODE "Database — local or external" "local")"
if [ "$DB_MODE" = "external" ]; then
  DATABASE_URL="$(ask DATABASE_URL "External DATABASE_URL (postgres://...)" "")"
  COMPOSE_PROFILES_VAL=""
else
  POSTGRES_PASSWORD="$(gen_hex)"
  DATABASE_URL="postgres://sancho:${POSTGRES_PASSWORD}@postgres:5432/sancho"
  COMPOSE_PROFILES_VAL="local-db"
fi

# --- 4. URLs -----------------------------------------------------------------
step "4/6  Access URL"
BASE_URL="$(ask BASE_URL "Base URL where you'll reach Mission Control" "http://localhost:3000")"

# --- 5. First brand ----------------------------------------------------------
step "5/6  First brand"
FIRST_BRAND_SLUG="$(ask FIRST_BRAND_SLUG "First brand slug (lowercase-hyphens)" "my-brand")"
FIRST_BRAND_NAME="$(ask FIRST_BRAND_NAME "First brand display name" "My Brand")"

# --- 6. Outreach (YALC) — optional ------------------------------------------
step "6/6  Outreach (optional)"
say "  ${DIM}YALC powers cold outbound (campaigns, leads, sequences). It runs as an${RST}"
say "  ${DIM}opt-in container; you can also enable it later. Sending email needs your${RST}"
say "  ${DIM}own provider key (e.g. Instantly), configured afterwards in the cockpit.${RST}"
ENABLE_YALC="$(ask ENABLE_YALC "Enable Outreach (YALC)? — yes or no" "no")"
case "$(printf '%s' "$ENABLE_YALC" | tr '[:upper:]' '[:lower:]')" in
  y|yes|true|1) ENABLE_YALC=1 ;;
  *)            ENABLE_YALC=0 ;;
esac

# --- Generate secrets --------------------------------------------------------
step "Generating secrets"
NEXTAUTH_SECRET="$(gen_b64)"
ENCRYPTION_KEY="$(gen_hex)"
SANCHO_INTERNAL_API_TOKEN="$(gen_hex)"
ADMIN_TOKEN="$(gen_hex)"
MC_TOKEN="$(gen_hex)"
ok "NEXTAUTH_SECRET, ENCRYPTION_KEY, SANCHO_INTERNAL_API_TOKEN, adminToken, mcToken"
# YALC shares a bearer token between Sancho and the YALC container.
if [ "$ENABLE_YALC" = "1" ]; then
  YALC_API_TOKEN="$(gen_hex)"
  ok "YALC_API_TOKEN (Outreach enabled)"
fi

# --- Write .env --------------------------------------------------------------
step "Writing $ENV_FILE"
cp "$ENV_EXAMPLE" "$ENV_FILE"
[ -n "$ANTHROPIC_API_KEY" ] && set_env ANTHROPIC_API_KEY "$ANTHROPIC_API_KEY"
[ -n "$OPENAI_API_KEY" ]    && set_env OPENAI_API_KEY "$OPENAI_API_KEY"
[ -n "$FIREWORKS_API_KEY" ] && set_env FIREWORKS_API_KEY "$FIREWORKS_API_KEY"
set_env ANTHROPIC_AUTH_MODE "$ANTHROPIC_AUTH_MODE"
set_env OPENAI_AUTH_MODE "$OPENAI_AUTH_MODE"
set_env NEXTAUTH_SECRET "$NEXTAUTH_SECRET"
set_env ENCRYPTION_KEY "$ENCRYPTION_KEY"
set_env SANCHO_INTERNAL_API_TOKEN "$SANCHO_INTERNAL_API_TOKEN"
set_env ADMIN_EMAIL_DOMAIN "$ADMIN_EMAIL_DOMAIN"
set_env ADMIN_IDENTITY_EMAIL "$ADMIN_IDENTITY_EMAIL"
set_env DATABASE_URL "$DATABASE_URL"
set_env COMPOSE_PROFILES "$COMPOSE_PROFILES_VAL"
set_env BASE_URL "$BASE_URL"
set_env NEXTAUTH_URL "$BASE_URL"
[ "${DB_MODE:-local}" = "local" ] && set_env POSTGRES_PASSWORD "${POSTGRES_PASSWORD:-}"
# Outreach: wire Sancho ↔ YALC over the compose network. install.sh reads a
# non-empty YALC_API_TOKEN as the signal to bring up the YALC overlay.
if [ "$ENABLE_YALC" = "1" ]; then
  set_env YALC_API_TOKEN "$YALC_API_TOKEN"
  set_env YALC_BASE_URL "http://yalc:3847"
fi
ok "$ENV_FILE written"

# --- Write config/instance.json (minimal, no Discord) ------------------------
step "Writing $INSTANCE_FILE"
mkdir -p config
cat > "$INSTANCE_FILE" <<JSON
{
  "mc_base_url": "${BASE_URL}/mc",
  "mc_server_port": 3000,
  "gateway_port": 18789,
  "accounts": {}
}
JSON
ok "$INSTANCE_FILE written"

# --- Write config/clients.json (first brand) ---------------------------------
step "Writing $CLIENTS_FILE"
cat > "$CLIENTS_FILE" <<JSON
{
  "\$schema": "clients.schema.json",
  "clients": [
    {
      "slug": "${FIRST_BRAND_SLUG}",
      "name": "${FIRST_BRAND_NAME}",
      "emoji": "🏢",
      "language": "es",
      "active": true,
      "paths": { "brand": "brand/" },
      "phase": 0,
      "mcToken": "${MC_TOKEN}"
    }
  ],
  "adminToken": "${ADMIN_TOKEN}",
  "adminEmails": []
}
JSON
ok "$CLIENTS_FILE written"

# --- Final checklist (E5) ----------------------------------------------------
say ""
say "${GRN}${B}✅ Configuration ready.${RST}"
say "   Start it with:  ${CYN}docker compose -f docker-compose.yml up -d${RST}  →  ${BASE_URL}"
if [ "${DB_MODE:-local}" = "local" ]; then
  say "   ${DIM}(bundled Postgres is enabled via COMPOSE_PROFILES=local-db)${RST}"
fi
say ""
if [ "$ENABLE_YALC" = "1" ]; then
  say "${B}Outreach (YALC) is enabled.${RST}"
  say "   ${DIM}install.sh starts it automatically (or add -f docker-compose.yalc.yml).${RST}"
  say "   ${DIM}Add your email provider key (e.g. Instantly) in the Outreach cockpit to send.${RST}"
  say ""
fi
say "${B}Optional integrations${RST} — configure later (all off by default):"
say "   • Slack          → Mission Control → Settings → APIs"
say "   • Open Design     → add  -f docker-compose.od.yml  (needs OD_API_TOKEN)"
if [ "$ENABLE_YALC" != "1" ]; then
  say "   • YALC / Outreach → re-run with WIZARD: ENABLE_YALC=yes, or add -f docker-compose.yalc.yml"
fi
say "   • Discord         → set DISCORD_BOT_TOKEN in .env"
say ""
