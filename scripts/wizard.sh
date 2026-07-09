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
# PROVIDER / ANTHROPIC_AUTH_MODE / OPENAI_AUTH_MODE / DB_MODE / BASE_URL /
# FIRST_BRAND_SLUG / FIRST_BRAND_NAME / ENABLE_GOOGLE). In non-interactive mode
# you MUST supply the model credential for the chosen auth mode
# (ANTHROPIC_API_KEY or, for subscription, ANTHROPIC_OAUTH_TOKEN) or the
# wizard aborts — it never leaves a placeholder behind.
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

# mask_secret <value> : short, non-revealing preview of a credential for logs.
mask_secret() {
  local s="$1"
  if [ "${#s}" -le 8 ]; then printf '••••'; else printf '%s…%s' "${s:0:4}" "${s: -2}"; fi
}

# --- Interactivity helpers ---------------------------------------------------
# Non-interactive when there's no TTY or WIZARD_ASSUME_YES=1.
INTERACTIVE=1
if [ "${WIZARD_ASSUME_YES:-0}" = "1" ] || [ ! -t 0 ]; then INTERACTIVE=0; fi

# ask <var-name> <prompt> <default>
# Resolution order: existing env value > interactive prompt > default.
ask() {
  local var="$1" prompt="$2" default="${3:-}" current
  current="$(printf '%s' "${!var:-}")"
  if [ -n "$current" ]; then
    # Value came from the environment, so the prompt is skipped silently —
    # surface that (to stderr, never stdout, which $(...) captures) so an
    # exported/leaked var can't quietly decide an answer for the user. Mask
    # anything that looks like a credential.
    if [ "$INTERACTIVE" = "1" ]; then
      local shown="$current"
      case "$var" in
        *KEY|*TOKEN|*SECRET|*PASSWORD) shown="$(mask_secret "$current")" ;;
      esac
      printf '  %s↳ %s: using %s from environment%s\n' "$DIM" "$prompt" "$shown" "$RST" >&2
    fi
    printf '%s' "$current"; return
  fi
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

# ask_required <var-name> <prompt> : like `ask`, but the value must be non-empty.
# Interactive: re-prompts once, then aborts. Non-interactive: aborts immediately
# if empty (the caller must pass the value via env). This is how the wizard
# guarantees a credential is present instead of silently shipping a placeholder.
ask_required() {
  local var="$1" prompt="$2" val
  val="$(ask "$var" "$prompt" "")"
  if [ -z "$val" ] && [ "$INTERACTIVE" = "1" ]; then
    warn "$var is required — please enter a value."
    val="$(ask "$var" "$prompt" "")"
  fi
  if [ -z "$val" ]; then
    say "${YLW}ERROR:${RST} $var is required for the chosen mode but no value was provided."
    say "  (Non-interactive? pass $var=… in the environment.)"
    exit 1
  fi
  printf '%s' "$val"
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
  if [ "$INTERACTIVE" = "1" ]; then
    # Interactive: offer to overwrite in place instead of forcing a re-run.
    reply=""
    read -r -p "  Overwrite them and regenerate? [y/N]: " reply </dev/tty || true
    case "$reply" in
      y|Y|yes|YES) FORCE=1; ok "Overwriting existing configuration." ;;
      *) say "  Left untouched. Edit them by hand, or re-run to regenerate."; exit 0 ;;
    esac
  else
    # Non-interactive (CI): never clobber without an explicit opt-in.
    say  "  Refusing to overwrite. Re-run with --force to regenerate, or edit them by hand."
    exit 1
  fi
fi

say "${B}SanchoCMO — setup wizard${RST}"
say "${DIM}Generates .env + config/*.json so you can './sancho up'.${RST}"

# Runtime bootstrap. Fresh OSS installs intentionally start on OpenClaw because
# it is still the complete/default adapter while the runtime split is being
# completed. Advanced installs may pass SANCHO_RUNTIME + adapter env vars before
# running the wizard; we persist those into .env so BYO runtime setups survive
# container restarts instead of relying on the parent shell.
SANCHO_RUNTIME="${SANCHO_RUNTIME:-openclaw}"
case "$SANCHO_RUNTIME" in
  openclaw|hermes|external-http|hermes-external) ;;
  *)
    say "${YLW}ERROR:${RST} Unsupported SANCHO_RUNTIME='$SANCHO_RUNTIME'. Use openclaw, hermes, or external-http."
    exit 1
    ;;
esac
if [ "$SANCHO_RUNTIME" = "openclaw" ]; then
  say "${DIM}Runtime: OpenClaw initial adapter. Configure/switch runtimes later from Settings → Runtime.${RST}"
else
  warn "Advanced runtime selected: SANCHO_RUNTIME=$SANCHO_RUNTIME. Make sure the matching gateway env vars are set."
fi

# --- 1. Model provider + auth ------------------------------------------------
# Ask the auth MODE first, then collect the credential that mode actually needs
# (and require it). The runtime resolves Anthropic creds as ANTHROPIC_OAUTH_TOKEN
# (subscription) → ANTHROPIC_API_KEY; leaving a stale API key around in
# subscription mode is the documented "invalid x-api-key" fallback footgun, so we
# blank the unused credential explicitly.
step "1/6  Model provider & auth"
PROVIDER="$(ask PROVIDER "Provider — anthropic, openai, fireworks, both, or all" "anthropic")"
# Initialize empty (NOT to a default like "api_key") so `ask` actually prompts:
# any non-empty value makes ask treat the question as already answered and skip
# it. The real default is supplied as ask's 3rd argument below. Empty here only
# guarantees the vars are defined under `set -u` when a provider branch is skipped.
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
OPENAI_API_KEY="${OPENAI_API_KEY:-}"
FIREWORKS_API_KEY="${FIREWORKS_API_KEY:-}"
# ANTHROPIC_OAUTH_TOKEN is the single user-facing subscription variable (the one
# the gateway motor reads natively). The token is what `claude setup-token`
# emits; the entrypoint derives the Claude-Code-native CLAUDE_CODE_OAUTH_TOKEN
# from it only for the opt-in Discord/Cervantes path (SAN-332).
ANTHROPIC_OAUTH_TOKEN="${ANTHROPIC_OAUTH_TOKEN:-}"
ANTHROPIC_AUTH_MODE="${ANTHROPIC_AUTH_MODE:-}"
OPENAI_AUTH_MODE="${OPENAI_AUTH_MODE:-}"

case "$PROVIDER" in
  anthropic|both|all|multi)
    ANTHROPIC_AUTH_MODE="$(ask ANTHROPIC_AUTH_MODE "Anthropic auth mode — api_key or subscription" "api_key")"
    if [ "$ANTHROPIC_AUTH_MODE" = "subscription" ]; then
      say "  ${DIM}Generate a subscription token on the host with: claude setup-token${RST}"
      ANTHROPIC_OAUTH_TOKEN="$(ask_required ANTHROPIC_OAUTH_TOKEN "Claude subscription token (sk-ant-oat...)")"
      ANTHROPIC_API_KEY=""
    else
      ANTHROPIC_API_KEY="$(ask_required ANTHROPIC_API_KEY "Anthropic API key (sk-ant-...)")"
      ANTHROPIC_OAUTH_TOKEN=""
    fi
    ;;
esac

case "$PROVIDER" in
  openai|both|all|multi)
    OPENAI_AUTH_MODE="$(ask OPENAI_AUTH_MODE "OpenAI auth mode — api_key or subscription" "api_key")"
    if [ "$OPENAI_AUTH_MODE" = "subscription" ]; then
      warn "OpenAI subscription uses Codex (ChatGPT) OAuth, set up host-side with 'openclaw models auth login' — it can't be entered here. Configure it after install."
      OPENAI_API_KEY=""
    else
      OPENAI_API_KEY="$(ask_required OPENAI_API_KEY "OpenAI API key (sk-...)")"
    fi
    ;;
esac

# Fireworks is API-key-only (no subscription/OAuth) — require the key when chosen.
case "$PROVIDER" in
  fireworks|all|multi)
    FIREWORKS_API_KEY="$(ask_required FIREWORKS_API_KEY "Fireworks API key (fw-...)")"
    ;;
esac

# --- 2. Admin & login access -------------------------------------------------
step "2/6  Admin & login access"
ADMIN_EMAIL_DOMAIN="$(ask ADMIN_EMAIL_DOMAIN "Admin email domain (emails @this become admins)" "example.com")"
ADMIN_IDENTITY_EMAIL="$(ask ADMIN_IDENTITY_EMAIL "Admin contact email" "admin@${ADMIN_EMAIL_DOMAIN}")"
# Google login is OPTIONAL. You can always log in with the admin token printed at
# the end. NextAuth enables Google only when BOTH client id and secret are
# non-empty — so a leftover placeholder would enable it with bad creds
# (invalid_client). We therefore write an explicit value: real if you configure
# it now, empty (= disabled) otherwise.
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"
say "  ${DIM}Google login is optional — skip it and use the admin token (printed at the end).${RST}"
ENABLE_GOOGLE="$(ask ENABLE_GOOGLE "Configure Google login now? — yes or no" "no")"
case "$(printf '%s' "$ENABLE_GOOGLE" | tr '[:upper:]' '[:lower:]')" in
  y|yes|true|1)
    GOOGLE_CLIENT_ID="$(ask GOOGLE_CLIENT_ID "Google OAuth client ID" "")"
    GOOGLE_CLIENT_SECRET="$(ask GOOGLE_CLIENT_SECRET "Google OAuth client secret" "")"
    if [ -z "$GOOGLE_CLIENT_ID" ] || [ -z "$GOOGLE_CLIENT_SECRET" ]; then
      warn "Google client id/secret incomplete — leaving Google login OFF (use the admin token)."
      GOOGLE_CLIENT_ID=""; GOOGLE_CLIENT_SECRET=""
    fi
    ;;
  *)
    GOOGLE_CLIENT_ID=""; GOOGLE_CLIENT_SECRET=""
    ;;
esac

# --- 3. Database -------------------------------------------------------------
step "3/6  Database"
say "  ${DIM}'local' uses the bundled Postgres (recommended). 'external' uses your own (e.g. Neon).${RST}"
DB_MODE="$(ask DB_MODE "Database — local or external" "local")"
if [ "$DB_MODE" = "external" ]; then
  DATABASE_URL="$(ask DATABASE_URL "External DATABASE_URL (postgres://...)" "")"
  COMPOSE_PROFILES_VAL=""
else
  # Preserve an existing local DB password instead of always minting a new one:
  # Postgres only sets the password on the FIRST init of its data volume, so a
  # re-run (--force) that regenerates it desyncs from the already-initialized
  # postgres_data volume → "password authentication failed for user sancho".
  # Precedence: env override > existing .env > freshly generated.
  if [ -z "${POSTGRES_PASSWORD:-}" ] && [ -f "$ENV_FILE" ]; then
    # `|| true`: grep exits 1 when absent, which would abort under `set -e`/pipefail.
    POSTGRES_PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true)"
    [ -n "$POSTGRES_PASSWORD" ] && say "  ${DIM}Reusing existing POSTGRES_PASSWORD (keeps the current local DB volume working).${RST}"
  fi
  [ -z "${POSTGRES_PASSWORD:-}" ] && POSTGRES_PASSWORD="$(gen_hex)"
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

# --- 6. Optional services (Outreach, Open Design) ---------------------------
step "6/6  Optional services"
say "  ${DIM}YALC powers cold outbound (campaigns, leads, sequences). It runs as an${RST}"
say "  ${DIM}opt-in container; you can also enable it later. Sending email needs your${RST}"
say "  ${DIM}own provider key (e.g. Instantly), configured afterwards in the cockpit.${RST}"
ENABLE_YALC="$(ask ENABLE_YALC "Enable Outreach (YALC)? — yes or no" "no")"
case "$(printf '%s' "$ENABLE_YALC" | tr '[:upper:]' '[:lower:]')" in
  y|yes|true|1) ENABLE_YALC=1 ;;
  *)            ENABLE_YALC=0 ;;
esac

# Open Design — same opt-in logic as YALC: self-provisioning (we mint
# OD_API_TOKEN, the Phase-5 bearer the daemon requires), brought up by install.sh
# when its token is present. The one extra input OD needs that YALC doesn't is a
# browser-reachable URL (the web app loads client-side); default to localhost.
OD_API_TOKEN="${OD_API_TOKEN:-}"
OD_WEB_URL="${OD_WEB_URL:-}"
OD_ALLOWED_ORIGINS="${OD_ALLOWED_ORIGINS:-}"
say ""
say "  ${DIM}Open Design is an agentic visual editor for brand design systems. It runs${RST}"
say "  ${DIM}as an opt-in container on port 7456; its token is generated for you.${RST}"
ENABLE_OD="$(ask ENABLE_OD "Enable Open Design? — yes or no" "no")"
case "$(printf '%s' "$ENABLE_OD" | tr '[:upper:]' '[:lower:]')" in
  y|yes|true|1) ENABLE_OD=1 ;;
  *)            ENABLE_OD=0 ;;
esac
if [ "$ENABLE_OD" = "1" ]; then
  OD_WEB_URL="$(ask OD_WEB_URL "Open Design web URL (browser-reachable)" "http://localhost:7456")"
  OD_ALLOWED_ORIGINS="$OD_WEB_URL"
fi

# --- Generate secrets --------------------------------------------------------
step "Generating secrets"
NEXTAUTH_SECRET="$(gen_b64)"
ENCRYPTION_KEY="$(gen_hex)"
SANCHO_INTERNAL_API_TOKEN="$(gen_hex)"
# adminToken: stateful, like POSTGRES_PASSWORD. config/clients.json (the brand
# registry) is preserved across a --force re-run (see the write below), and this
# token is mirrored into .env as MC_ADMIN_TOKEN and printed as the login token.
# Minting a fresh one here would desync from the preserved file and rotate the
# admin login out from under the user. Reuse the existing one when present.
ADMIN_TOKEN=""
if [ -f "$CLIENTS_FILE" ]; then
  ADMIN_TOKEN="$(grep -oE '"adminToken"[[:space:]]*:[[:space:]]*"[^"]+"' "$CLIENTS_FILE" 2>/dev/null | head -1 | sed -E 's/.*"([^"]*)"[[:space:]]*$/\1/')"
  [ -n "$ADMIN_TOKEN" ] && say "  ${DIM}Reusing existing adminToken (keeps the preserved clients.json and login token in sync).${RST}"
fi
[ -z "$ADMIN_TOKEN" ] && ADMIN_TOKEN="$(gen_hex)"
MC_TOKEN="$(gen_hex)"
ok "NEXTAUTH_SECRET, ENCRYPTION_KEY, SANCHO_INTERNAL_API_TOKEN, adminToken, mcToken"
# YALC shares a bearer token between Sancho and the YALC container.
if [ "$ENABLE_YALC" = "1" ]; then
  YALC_API_TOKEN="$(gen_hex)"
  ok "YALC_API_TOKEN (Outreach enabled)"
fi
# Open Design shares a bearer token between MC and the OD daemon (Phase-5 floor).
if [ "$ENABLE_OD" = "1" ]; then
  OD_API_TOKEN="$(gen_hex)"
  ok "OD_API_TOKEN (Open Design enabled)"
fi

# --- Write .env --------------------------------------------------------------
step "Writing $ENV_FILE"
cp "$ENV_EXAMPLE" "$ENV_FILE"
# Model credentials — always written explicitly (empty when unused) so a
# .env.example placeholder can never survive into the live .env.
set_env ANTHROPIC_API_KEY "$ANTHROPIC_API_KEY"
set_env ANTHROPIC_OAUTH_TOKEN "$ANTHROPIC_OAUTH_TOKEN"
set_env OPENAI_API_KEY "$OPENAI_API_KEY"
set_env FIREWORKS_API_KEY "$FIREWORKS_API_KEY"
set_env ANTHROPIC_AUTH_MODE "$ANTHROPIC_AUTH_MODE"
set_env OPENAI_AUTH_MODE "$OPENAI_AUTH_MODE"
set_env NEXTAUTH_SECRET "$NEXTAUTH_SECRET"
set_env ENCRYPTION_KEY "$ENCRYPTION_KEY"
set_env SANCHO_INTERNAL_API_TOKEN "$SANCHO_INTERNAL_API_TOKEN"
set_env ADMIN_EMAIL_DOMAIN "$ADMIN_EMAIL_DOMAIN"
set_env ADMIN_IDENTITY_EMAIL "$ADMIN_IDENTITY_EMAIL"
# Runtime: persist the boot default and any advanced adapter env vars passed to
# the wizard. This keeps curl-based installs compatible with BYO runtimes
# without asking first-time users for choices that would leave the stack
# misconfigured.
set_env SANCHO_RUNTIME "$SANCHO_RUNTIME"
for runtime_key in \
  INSTALL_HERMES HERMES_AGENT_REF HERMES_GATEWAY_URL HERMES_BASE_URL HERMES_URL \
  HERMES_BRIDGE_ENABLED HERMES_BRIDGE_PORT HERMES_CHAT_SECRET HERMES_CLI \
  HERMES_CLI_PROVIDER HERMES_CLI_MODEL HERMES_WORKDIR HERMES_RUN_TIMEOUT_MS \
  HERMES_CONTEXT_PACK_ENABLED HERMES_CONTEXT_PACK_TIMEOUT_MS \
  SANCHO_EXTERNAL_PROTOCOL SANCHO_EXTERNAL_RUNTIME_PROTOCOL \
  SANCHO_EXTERNAL_GATEWAY_URL SANCHO_EXTERNAL_RUNTIME_URL \
  SANCHO_EXTERNAL_SECRET SANCHO_EXTERNAL_RUNTIME_SECRET \
  SANCHO_EXTERNAL_INBOUND_PATH SANCHO_EXTERNAL_RUNTIME_INBOUND_PATH \
  SANCHO_EXTERNAL_CHAT_PATH SANCHO_EXTERNAL_BRIDGE_CHAT_PATH \
  SANCHO_EXTERNAL_HEALTH_PATH SANCHO_EXTERNAL_RUNTIME_HEALTH_PATH \
  SANCHO_EXTERNAL_AGENT SANCHO_EXTERNAL_BRIDGE_AGENT SANCHO_EXTERNAL_FORWARD_AGENT \
  SANCHO_EXTERNAL_SESSION_PREFIX SANCHO_EXTERNAL_RUNTIME_HOME SANCHO_EXTERNAL_HEALTH_TIMEOUT_MS \
  HERMES_EXTERNAL_GATEWAY_URL HERMES_EXTERNAL_BASE_URL HERMES_EXTERNAL_URL \
  HERMES_EXTERNAL_SECRET HERMES_EXTERNAL_INBOUND_PATH HERMES_EXTERNAL_HEALTH_PATH \
  HERMES_EXTERNAL_PROTOCOL HERMES_EXTERNAL_CHAT_PATH HERMES_EXTERNAL_AGENT \
  HERMES_EXTERNAL_FORWARD_AGENT HERMES_EXTERNAL_SESSION_PREFIX
do
  runtime_val="${!runtime_key:-}"
  [ -n "$runtime_val" ] && set_env "$runtime_key" "$runtime_val"
done
# Login: write Google creds explicitly (empty = disabled, never a placeholder)
# and mirror the admin token into .env so the token login works even if
# config/clients.json is ever unavailable.
set_env GOOGLE_CLIENT_ID "$GOOGLE_CLIENT_ID"
set_env GOOGLE_CLIENT_SECRET "$GOOGLE_CLIENT_SECRET"
set_env MC_ADMIN_TOKEN "$ADMIN_TOKEN"
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
# Open Design: install.sh reads a non-empty OD_API_TOKEN as the signal to bring
# up the OD overlay. OD_DAEMON_URL keeps its compose-DNS default (open-design:7456).
if [ "$ENABLE_OD" = "1" ]; then
  set_env OD_API_TOKEN "$OD_API_TOKEN"
  set_env OD_WEB_URL "$OD_WEB_URL"
  set_env OD_ALLOWED_ORIGINS "$OD_ALLOWED_ORIGINS"
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
if [ -f "$CLIENTS_FILE" ]; then
  # Stateful, like the local Postgres volume: clients.json is the brand registry.
  # Reaching here means a --force re-run (the clobber gate above already exited
  # otherwise). Overwriting it would drop every brand but the first and rotate the
  # tokens out from under live logins — even though the brand content in
  # workspace-sancho / Postgres survives, MC would stop listing those brands.
  # Preserve it; only scaffold a fresh file on a first install.
  brand_count="$(grep -cE '"slug"[[:space:]]*:' "$CLIENTS_FILE" 2>/dev/null || true)"
  ok "$CLIENTS_FILE preserved (${brand_count:-existing} brand(s) kept)"
else
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
fi

# --- Final checklist (E5) ----------------------------------------------------
say ""
say "${GRN}${B}✅ Configuration ready.${RST}"
say "   Start it with:  ${CYN}./sancho up${RST}  →  ${BASE_URL}"
if [ "${DB_MODE:-local}" = "local" ]; then
  say "   ${DIM}(bundled Postgres is enabled via COMPOSE_PROFILES=local-db)${RST}"
fi
say ""

# Login + model auth summary — the two things needed to actually USE the app.
say "${B}Log in${RST} at ${CYN}${BASE_URL}${RST}"
if [ -n "$GOOGLE_CLIENT_ID" ]; then
  say "   • Google login: ${GRN}ON${RST} (for the accounts you configured)."
else
  say "   • Google login: ${DIM}off${RST} — use the admin token below."
fi
say "   • Admin access token ${DIM}(paste into the 'Access Token' field on the sign-in page)${RST}:"
say "       ${B}${ADMIN_TOKEN}${RST}"
say "   ${DIM}(also stored in config/clients.json and .env as MC_ADMIN_TOKEN — keep it secret)${RST}"
say "   • Runtime: ${SANCHO_RUNTIME} ${DIM}(change/configure later in Settings → Runtime)${RST}"
if [ "$ANTHROPIC_AUTH_MODE" = "subscription" ]; then
  say "   • Anthropic auth: subscription ${DIM}(Claude OAuth token set)${RST}"
else
  say "   • Anthropic auth: api_key ${DIM}(API key set)${RST}"
fi
say ""
if [ "$ENABLE_YALC" = "1" ]; then
  say "${B}Outreach (YALC) is enabled.${RST}"
  say "   ${DIM}./sancho starts it automatically.${RST}"
  say "   ${DIM}Add your email provider key (e.g. Instantly) in the Outreach cockpit to send.${RST}"
  say ""
fi
if [ "$ENABLE_OD" = "1" ]; then
  say "${B}Open Design is enabled.${RST}"
  say "   ${DIM}./sancho starts it automatically.${RST}"
  say "   ${DIM}Web app reachable at ${OD_WEB_URL}.${RST}"
  say ""
fi
say "${B}Optional integrations${RST} — configure later (all off by default):"
say "   • Slack          → Mission Control → Settings → APIs"
if [ "$ENABLE_OD" != "1" ]; then
  say "   • Open Design     → ${CYN}./sancho install --od${RST} (or re-run wizard with ENABLE_OD=yes)"
fi
if [ "$ENABLE_YALC" != "1" ]; then
  say "   • YALC / Outreach → ${CYN}./sancho install --yalc${RST} (or re-run wizard with ENABLE_YALC=yes)"
fi
say "   • Discord         → set DISCORD_BOT_TOKEN in .env"
say ""
