#!/usr/bin/env bash
# ============================================================================
# SanchoCMO setup wizard
# ----------------------------------------------------------------------------
# Generates a ready-to-run configuration for a fresh install:
#   - .env                  (secrets + provider key + admin domain + DB choice)
#   - config/instance.json  (minimal, no Discord)
#   - config/clients.json   (your first brand + generated tokens)
#
# Two modes (WIZARD_MODE, or --quick / --advanced):
#   quick (default)  asks only the essentials — provider + credential and the
#                    first brand name; everything else takes a sensible default.
#   advanced         the full flow: admin/login, database, access URL, custom
#                    host ports (MC_PORT / GATEWAY_HOST_PORT / LEGACY_HOST_PORT),
#                    and the optional YALC / Open Design overlays.
#
# Interactive by default. For non-interactive / CI use, set WIZARD_ASSUME_YES=1
# and pass answers as environment variables (same names the wizard writes, plus
# WIZARD_MODE / PROVIDER / ANTHROPIC_AUTH_MODE / OPENAI_AUTH_MODE / DB_MODE /
# BASE_URL / FIRST_BRAND_SLUG / FIRST_BRAND_NAME / ENABLE_GOOGLE). In
# non-interactive mode you MUST supply the model credential for the chosen auth
# mode (ANTHROPIC_API_KEY or, for subscription, ANTHROPIC_OAUTH_TOKEN) or the
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
# WIZARD_MODE: quick (default) asks the bare minimum to boot; advanced exposes
# the full flow. Set via env, --quick/--advanced, or the interactive selector.
WIZARD_MODE="${WIZARD_MODE:-}"
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --quick) WIZARD_MODE=quick ;;
    --advanced|--full) WIZARD_MODE=advanced ;;
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
# Interactive whenever we can reach the controlling terminal. We deliberately
# probe /dev/tty (the same fd every prompt reads from, `read … </dev/tty`)
# instead of stdin: under the documented one-liner `curl … | bash`, bash's
# stdin is the pipe (not a TTY), yet /dev/tty still points at the user's
# terminal — so testing `-t 0` alone would wrongly go non-interactive and abort
# on the first required credential. Only force non-interactive when explicitly
# asked (WIZARD_ASSUME_YES=1) or when there is genuinely no terminal at all
# (real CI / `docker build` / cron: stdin not a TTY AND /dev/tty unopenable).
INTERACTIVE=1
if [ "${WIZARD_ASSUME_YES:-0}" = "1" ]; then
  INTERACTIVE=0
elif [ ! -t 0 ] && ! { true 0</dev/tty; } 2>/dev/null; then
  INTERACTIVE=0
fi

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
# The return value travels on STDOUT (captured by `$(ask_required …)`), so every
# human-facing line here MUST go to stderr (>&2) — otherwise the warning text is
# concatenated onto the captured value and corrupts the credential (e.g. leaving
# a key empty then retyping it would return "…is required…<the key>").
ask_required() {
  local var="$1" prompt="$2" val
  val="$(ask "$var" "$prompt" "")"
  if [ -z "$val" ] && [ "$INTERACTIVE" = "1" ]; then
    warn "$var is required — please enter a value." >&2
    val="$(ask "$var" "$prompt" "")"
  fi
  if [ -z "$val" ]; then
    say "${YLW}ERROR:${RST} $var is required for the chosen mode but no value was provided." >&2
    say "  (Non-interactive? pass $var=… in the environment.)" >&2
    exit 1
  fi
  printf '%s' "$val"
}

# ask_choice <var-name> <prompt> <default> <valid…> : like `ask`, but only accepts
# one of the listed choices (case-insensitive, normalized to lowercase). Interactive:
# re-prompts until the value is valid. Non-interactive: validates the env/default
# value and aborts with a clear message — so a typo can never silently fall through
# to a mis-configured install (e.g. a bad provider that collects no credential).
# The chosen value is returned on STDOUT (captured by `$(ask_choice …)`), so the
# invalid-value warning MUST go to stderr (>&2). Otherwise a typo-then-correction
# (e.g. "firewokrs" then "fireworks") concatenates the warning text onto the
# captured value — PROVIDER becomes "…Invalid value…fireworks", matches no case
# branch, no credential is collected, and the install boots credential-less.
ask_choice() {
  local var="$1" prompt="$2" default="$3"; shift 3
  local valid="$*" val low choice
  while :; do
    val="$(ask "$var" "$prompt" "$default")"
    low="$(printf '%s' "$val" | tr '[:upper:]' '[:lower:]')"
    for choice in $valid; do
      [ "$low" = "$choice" ] && { printf '%s' "$low"; return; }
    done
    if [ "$INTERACTIVE" = "1" ]; then
      warn "Invalid value '$val' — choose one of: $valid" >&2
      unset "$var"   # drop a bad env-provided value so `ask` re-prompts
      continue
    fi
    say "${YLW}ERROR:${RST} $var must be one of: $valid (got '$val')." >&2
    exit 1
  done
}

# check_runtime_gateway <base-url> <health-path> <secret> : best-effort reachability
# probe for a BYO runtime gateway. Warns (never aborts) so a scripted install whose
# gateway is not up yet still completes — the gateway only has to be reachable when
# Sancho actually boots. Sends the shared secret as X-MC-Secret when provided.
check_runtime_gateway() {
  local base="${1%/}" path="${2:-/healthz}" secret="$3" url code
  case "$path" in /*) ;; *) path="/$path" ;; esac
  url="${base}${path}"
  if ! command -v curl >/dev/null 2>&1; then
    warn "curl not found — skipping the runtime gateway healthcheck ($url)."
    return 0
  fi
  say "  ${DIM}Checking runtime gateway at ${url} …${RST}"
  code="$(curl -sS -o /dev/null -w '%{http_code}' -m 5 ${secret:+-H "X-MC-Secret: $secret"} "$url" 2>/dev/null || true)"
  code="${code:-000}"
  case "$code" in
    2*|3*) ok "Runtime gateway reachable: ${url} (HTTP ${code})." ;;
    000)   warn "Could not reach the runtime gateway at ${url}. It must be running and reachable when Sancho boots (check URL/host/firewall)." ;;
    401|403) warn "Runtime gateway at ${url} answered HTTP ${code} — reachable, but the shared secret looks wrong. Re-check SANCHO_EXTERNAL_SECRET." ;;
    *)     warn "Runtime gateway at ${url} returned HTTP ${code} (expected 2xx/3xx). Re-check the URL and health path." ;;
  esac
}

# --- Secret generation -------------------------------------------------------
need_cmd() { command -v "$1" >/dev/null 2>&1 || { say "ERROR: '$1' is required but not installed."; exit 1; }; }
need_cmd openssl
gen_b64() { openssl rand -base64 32 | tr -d '\n'; }
gen_hex() { openssl rand -hex 32; }

# slugify <text> : lowercase, non-alnum runs → single hyphen, trim edge hyphens.
slugify() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'; }

# json_escape <text> : escape a string for safe interpolation inside a JSON string
# literal (backslash, double-quote, control chars). Brand name and access URL are
# free text; without this a name like `Acme "Rockets" Inc` produces an invalid
# config/clients.json while the wizard still exits 0 → the container fails to parse
# it at boot (SAN-443).
json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"   # backslash first, so it doesn't double-escape the ones below
  s="${s//\"/\\\"}"   # double-quote
  s="${s//$'\n'/\\n}" # newline
  s="${s//$'\r'/\\r}" # carriage return
  s="${s//$'\t'/\\t}" # tab
  printf '%s' "$s"
}

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

# --- Setup mode --------------------------------------------------------------
# quick (default): ask only what's needed to boot — provider + credential and the
# first brand name; everything else takes a sensible default (finish the rest in
# the app or via `./sancho reconfigure --advanced`). advanced: the full flow
# (admin/login, database, access URL, custom host ports, optional services).
if [ -z "$WIZARD_MODE" ]; then
  if [ "$INTERACTIVE" = "1" ]; then
    WIZARD_MODE="$(ask WIZARD_MODE "Setup mode — quick or advanced" "quick")"
  else
    WIZARD_MODE="quick"
  fi
fi
case "$WIZARD_MODE" in advanced|full) WIZARD_MODE=advanced ;; *) WIZARD_MODE=quick ;; esac
if [ "$WIZARD_MODE" = "advanced" ]; then STEP_TOTAL=8; else STEP_TOTAL=2; fi
STEP_NO=0
# nstep <title> : numbered step header ("N/TOTAL  title") with a mode-aware total.
nstep() { STEP_NO=$((STEP_NO + 1)); step "$STEP_NO/$STEP_TOTAL  $*"; }
say "${DIM}Mode: ${WIZARD_MODE} (quick asks the essentials; advanced exposes everything)${RST}"

# Advanced-only vars default to empty so `set -u` is satisfied when quick skips
# their steps; the write section only persists non-default host ports.
MC_PORT="${MC_PORT:-}"
GATEWAY_HOST_PORT="${GATEWAY_HOST_PORT:-}"
LEGACY_HOST_PORT="${LEGACY_HOST_PORT:-}"

# Runtime bootstrap. Fresh OSS installs intentionally start on OpenClaw because
# it is still the complete/default adapter. Advanced installs may pass
# SANCHO_RUNTIME plus adapter env vars before running the wizard; we persist
# those into .env so BYO runtime setups survive container restarts.
SANCHO_RUNTIME="${SANCHO_RUNTIME:-openclaw}"
case "$SANCHO_RUNTIME" in
  openclaw|hermes|external-http|hermes-external) ;;
  *)
    say "${YLW}ERROR:${RST} Unsupported SANCHO_RUNTIME='$SANCHO_RUNTIME'. Use openclaw, hermes, or external-http."
    exit 1
    ;;
esac
# Advanced installs pick/confirm the runtime interactively in the "Runtime engine"
# step below; quick installs keep whatever resolved here (openclaw, or a pre-set
# SANCHO_RUNTIME for scripted BYO). The final choice is echoed in the summary.

# --- Runtime engine (chosen BEFORE the model-provider step) ------------------
# Which engine executes Sancho turns. OpenClaw is the complete default; hermes and
# external-http (BYO gateway — Claude Code, Codex, a Hermes gateway, or any HTTP
# runtime speaking the Sancho contract) are selectable here for self-hosted
# installs. Resolved BEFORE the provider step so a runtime that doesn't call the
# model locally (external-http — a pure forward to an external gateway) can skip
# the model-credential requirement. hermes still runs an agent locally (its
# bridge/CLI), so it needs a credential like openclaw (SAN-443). `ask` would skip
# the prompt because SANCHO_RUNTIME already resolved above, so we blank it first
# and pass that value as the default.
SANCHO_EXTERNAL_GATEWAY_URL="${SANCHO_EXTERNAL_GATEWAY_URL:-}"
SANCHO_EXTERNAL_SECRET="${SANCHO_EXTERNAL_SECRET:-}"
SANCHO_EXTERNAL_PROTOCOL="${SANCHO_EXTERNAL_PROTOCOL:-}"
SANCHO_EXTERNAL_HEALTH_PATH="${SANCHO_EXTERNAL_HEALTH_PATH:-}"
HERMES_GATEWAY_URL="${HERMES_GATEWAY_URL:-}"
HERMES_CHAT_SECRET="${HERMES_CHAT_SECRET:-}"
if [ "$WIZARD_MODE" = "advanced" ]; then
  nstep "Runtime engine"
  say "  ${DIM}OpenClaw is the complete default. 'external-http' points Sancho at your own${RST}"
  say "  ${DIM}gateway (Claude Code / Codex / Hermes / custom); 'hermes' uses a managed Hermes.${RST}"
  say "  ${DIM}You can also switch or reconfigure this later in Settings → Runtime.${RST}"
  _rt_default="$SANCHO_RUNTIME"
  SANCHO_RUNTIME=""   # blank so `ask` prompts (interactive) / takes the default (non-interactive)
  SANCHO_RUNTIME="$(ask SANCHO_RUNTIME "Runtime — openclaw, hermes, or external-http" "$_rt_default")"
  case "$SANCHO_RUNTIME" in
    hermes-external) SANCHO_RUNTIME=external-http ;;
    openclaw|hermes|external-http) ;;
    *) warn "Unknown runtime '$SANCHO_RUNTIME' — falling back to openclaw."; SANCHO_RUNTIME=openclaw ;;
  esac
  case "$SANCHO_RUNTIME" in
    external-http)
      SANCHO_EXTERNAL_GATEWAY_URL="$(ask_required SANCHO_EXTERNAL_GATEWAY_URL "External runtime gateway URL (e.g. http://127.0.0.1:18792)")"
      SANCHO_EXTERNAL_SECRET="$(ask SANCHO_EXTERNAL_SECRET "Shared runtime secret (sent as X-MC-Secret; blank if none)" "")"
      SANCHO_EXTERNAL_PROTOCOL="$(ask SANCHO_EXTERNAL_PROTOCOL "Protocol — sancho (async, default) or mc-bridge (sync)" "sancho")"
      SANCHO_EXTERNAL_HEALTH_PATH="$(ask SANCHO_EXTERNAL_HEALTH_PATH "Health check path" "/healthz")"
      check_runtime_gateway "$SANCHO_EXTERNAL_GATEWAY_URL" "$SANCHO_EXTERNAL_HEALTH_PATH" "$SANCHO_EXTERNAL_SECRET"
      ;;
    hermes)
      HERMES_GATEWAY_URL="$(ask_required HERMES_GATEWAY_URL "Hermes gateway URL (e.g. https://hermes.example.com)")"
      HERMES_CHAT_SECRET="$(ask HERMES_CHAT_SECRET "Hermes chat secret (blank if none)" "")"
      check_runtime_gateway "$HERMES_GATEWAY_URL" "/health" "$HERMES_CHAT_SECRET"
      ;;
    openclaw)
      say "  ${DIM}OpenClaw selected — no gateway configuration needed.${RST}"
      ;;
  esac
fi
# Does this runtime need a local model credential?
#   openclaw — runs the agent in-process → YES.
#   hermes   — also runs an agent locally (the Hermes bridge/CLI or a gateway
#              command executes turns via HERMES_CLI --provider/--model), so it
#              still needs the model auth in env → YES (same as openclaw).
#   external-http — Sancho only forwards to a FULLY external gateway (just a URL)
#              that owns the model auth, and its boot requires no credential → NO.
# So only external-http skips the requirement.
if [ "$SANCHO_RUNTIME" = "external-http" ]; then RUNTIME_NEEDS_MODEL_CRED=0; else RUNTIME_NEEDS_MODEL_CRED=1; fi

# --- 1. Model provider + auth ------------------------------------------------
# Ask the auth MODE first, then collect the credential that mode actually needs
# (and require it). The runtime resolves Anthropic creds as ANTHROPIC_OAUTH_TOKEN
# (subscription) → ANTHROPIC_API_KEY; leaving a stale API key around in
# subscription mode is the documented "invalid x-api-key" fallback footgun, so we
# blank the unused credential explicitly.
nstep "Model provider & auth"
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
PROVIDER="${PROVIDER:-}"

# has_model_credential : true when at least one directly-usable model credential
# is present, mirroring the entrypoint preflight (docker/entrypoint.sh). The
# wizard must never hand off a .env without one — that boots straight into a
# crash-loop ("No usable model credential"). openai 'subscription' (Codex OAuth,
# set up host-side) leaves no key here, so it can't satisfy boot on its own.
has_model_credential() {
  if [ "${ANTHROPIC_AUTH_MODE:-}" = "subscription" ]; then
    [ -n "$ANTHROPIC_OAUTH_TOKEN" ] && return 0
  else
    [ -n "$ANTHROPIC_API_KEY" ] && return 0
  fi
  [ -n "$OPENAI_API_KEY" ] && return 0
  [ -n "$FIREWORKS_API_KEY" ] && return 0
  return 1
}

# Runtimes that call the model locally (openclaw, hermes) collect and REQUIRE a
# credential. external-http only forwards to an external gateway that owns the
# model auth, so it skips the whole loop (any provider key passed via env is still
# persisted by the write section).
if [ "$RUNTIME_NEEDS_MODEL_CRED" = "1" ]; then
# Collect provider + credential, then re-loop until at least one usable
# credential exists. A keyless selection (e.g. openai 'subscription' alone) sends
# an interactive install back to re-choose and aborts a non-interactive one — the
# wizard can never emit a .env that fails the container preflight. This is the
# backstop; the primary guarantee is that ask_choice/ask_required return cleanly
# on stdout (prompts/warnings go to stderr), so a typo-then-correction on the
# provider can't corrupt $PROVIDER and silently skip the credential prompt.
while :; do
  PROVIDER="$(ask_choice PROVIDER "Provider — anthropic, openai, fireworks, or all" "anthropic" anthropic openai fireworks all)"

  case "$PROVIDER" in
    anthropic|all)
      ANTHROPIC_AUTH_MODE="$(ask_choice ANTHROPIC_AUTH_MODE "Anthropic auth mode — api_key or subscription" "api_key" api_key subscription)"
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
    openai|all)
      OPENAI_AUTH_MODE="$(ask_choice OPENAI_AUTH_MODE "OpenAI auth mode — api_key or subscription" "api_key" api_key subscription)"
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
    fireworks|all)
      FIREWORKS_API_KEY="$(ask_required FIREWORKS_API_KEY "Fireworks API key (fw-...)")"
      ;;
  esac

  has_model_credential && break

  # No usable credential for the active auth mode(s). Reachable when the only
  # provider is openai 'subscription' (keyless at wizard time), or a scripted env
  # combination. Interactive: explain and re-pick. Non-interactive: abort.
  if [ "$INTERACTIVE" = "1" ]; then
    warn "That selection left no usable model credential — the container would fail preflight."
    say  "  ${DIM}OpenAI 'subscription' (Codex OAuth) is configured host-side, so it can't${RST}"
    say  "  ${DIM}satisfy boot on its own. Pick a provider with a directly-usable key${RST}"
    say  "  ${DIM}(Anthropic api_key/subscription, OpenAI api_key, or Fireworks).${RST}"
    PROVIDER=""; OPENAI_AUTH_MODE=""; ANTHROPIC_AUTH_MODE=""
    continue
  fi
  say "${YLW}ERROR:${RST} No usable model credential for provider '$PROVIDER' — set ANTHROPIC_API_KEY,"
  say "  ANTHROPIC_OAUTH_TOKEN (Anthropic subscription), OPENAI_API_KEY, or FIREWORKS_API_KEY."
  exit 1
done
else
  # external-http: Sancho forwards to an external gateway that owns the model auth.
  say "  ${DIM}Runtime '${SANCHO_RUNTIME}' forwards to your external gateway for model calls — no local${RST}"
  say "  ${DIM}model credential needed here (any provider key passed via env is still kept).${RST}"
  PROVIDER="${PROVIDER:-}"   # keep for the summary; may be empty for BYO
fi

# --- 2. Admin & login access -------------------------------------------------
# Google login is OPTIONAL. You can always log in with the admin token printed at
# the end. NextAuth enables Google only when BOTH client id and secret are
# non-empty — so a leftover placeholder would enable it with bad creds
# (invalid_client). We therefore write an explicit value: real if you configure
# it now, empty (= disabled) otherwise.
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"
# (The runtime engine is chosen BEFORE the model-provider step above — see the
# "Runtime engine" block there — so external-http (a pure forward to an external
# gateway) can skip the model-credential requirement. openclaw and hermes both run
# an agent locally, so they still require one, SAN-443.)

if [ "$WIZARD_MODE" = "advanced" ]; then
  nstep "Admin & login access"
  ADMIN_EMAIL_DOMAIN="$(ask ADMIN_EMAIL_DOMAIN "Admin email domain (emails @this become admins)" "example.com")"
  ADMIN_IDENTITY_EMAIL="$(ask ADMIN_IDENTITY_EMAIL "Admin contact email" "admin@${ADMIN_EMAIL_DOMAIN}")"
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
else
  # Quick: admin login is the token printed at the end; Google stays off.
  ADMIN_EMAIL_DOMAIN="${ADMIN_EMAIL_DOMAIN:-example.com}"
  ADMIN_IDENTITY_EMAIL="${ADMIN_IDENTITY_EMAIL:-admin@${ADMIN_EMAIL_DOMAIN}}"
  GOOGLE_CLIENT_ID=""; GOOGLE_CLIENT_SECRET=""
fi

# --- 3. Database -------------------------------------------------------------
if [ "$WIZARD_MODE" = "advanced" ]; then
  nstep "Database"
  say "  ${DIM}'local' uses the bundled Postgres (recommended). 'external' uses your own (e.g. Neon).${RST}"
  DB_MODE="$(ask DB_MODE "Database — local or external" "local")"
else
  DB_MODE="${DB_MODE:-local}"
fi
if [ "$DB_MODE" = "external" ]; then
  # Required: 'external' means BYO database, so an empty URL leaves the install
  # with NO database at all (no local-db profile either) — a silent misconfig
  # the container only surfaces later (SAN-443). Interactive re-prompts; scripted
  # must pass DATABASE_URL.
  DATABASE_URL="$(ask_required DATABASE_URL "External DATABASE_URL (postgres://...)")"
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

# --- 4. Host ports (advanced) ------------------------------------------------
# Only the HOST side of each mapping; container ports are fixed. The installer
# auto-relocates a busy port anyway (SAN-386), so these are just for pinning.
if [ "$WIZARD_MODE" = "advanced" ]; then
  nstep "Host ports"
  say "  ${DIM}Press Enter for defaults — the installer relocates a busy port automatically.${RST}"
  MC_PORT="$(ask MC_PORT "Mission Control host port" "3000")"
  GATEWAY_HOST_PORT="$(ask GATEWAY_HOST_PORT "Gateway host port" "18789")"
  LEGACY_HOST_PORT="$(ask LEGACY_HOST_PORT "Legacy mc-server host port" "18790")"
fi

# --- 5. Access URL -----------------------------------------------------------
# Default derives from the MC host port so a custom port and the login URL agree.
if [ "$WIZARD_MODE" = "advanced" ]; then
  nstep "Access URL"
  BASE_URL="$(ask BASE_URL "Base URL where you'll reach Mission Control" "http://localhost:${MC_PORT:-3000}")"
else
  BASE_URL="${BASE_URL:-http://localhost:3000}"
fi

# --- 6. First brand ----------------------------------------------------------
nstep "First brand"
FIRST_BRAND_NAME="$(ask FIRST_BRAND_NAME "First brand display name" "My Brand")"
if [ "$WIZARD_MODE" = "advanced" ]; then
  FIRST_BRAND_SLUG="$(ask FIRST_BRAND_SLUG "First brand slug (lowercase-hyphens)" "$(slugify "$FIRST_BRAND_NAME")")"
else
  # Quick: derive the slug from the name (no extra question).
  FIRST_BRAND_SLUG="${FIRST_BRAND_SLUG:-$(slugify "$FIRST_BRAND_NAME")}"
fi
# Always slugify the final value — a slug typed in advanced or supplied via env
# (FIRST_BRAND_SLUG) would otherwise reach clients.json unsanitized (uppercase,
# spaces, symbols) and break brand routing (SAN-443). slugify is idempotent, so a
# already-valid slug passes through unchanged.
FIRST_BRAND_SLUG="$(slugify "$FIRST_BRAND_SLUG")"
# Guard against an empty slug (e.g. a name with no alphanumerics).
[ -n "$FIRST_BRAND_SLUG" ] || FIRST_BRAND_SLUG="my-brand"

# --- 7. Optional services (Outreach, Open Design) ----------------------------
# Self-provisioning opt-in overlays (we mint their bearer tokens); install.sh
# brings each up when its token is present. Quick enables BOTH by default so a
# fresh install is feature-complete out of the box; advanced asks per-service.
# Override in quick with ENABLE_YALC=no / ENABLE_OD=no. Their host ports
# auto-relocate if busy (resolve_host_ports: OD_HOST_PORT 7456, YALC_PORT 3847)
# and OD_WEB_URL follows the relocated port, so no port question is needed here.
ENABLE_YALC="${ENABLE_YALC:-}"
ENABLE_OD="${ENABLE_OD:-}"
OD_API_TOKEN="${OD_API_TOKEN:-}"
OD_WEB_URL="${OD_WEB_URL:-}"
OD_ALLOWED_ORIGINS="${OD_ALLOWED_ORIGINS:-}"
if [ "$WIZARD_MODE" = "advanced" ]; then
  nstep "Optional services"
  say "  ${DIM}YALC powers cold outbound (campaigns, leads, sequences). It runs as an${RST}"
  say "  ${DIM}opt-in container; you can also enable it later. Sending email needs your${RST}"
  say "  ${DIM}own provider key (e.g. Instantly), configured afterwards in the cockpit.${RST}"
  ENABLE_YALC="$(ask ENABLE_YALC "Enable Outreach (YALC)? — yes or no" "no")"
  case "$(printf '%s' "$ENABLE_YALC" | tr '[:upper:]' '[:lower:]')" in
    y|yes|true|1) ENABLE_YALC=1 ;;
    *)            ENABLE_YALC=0 ;;
  esac

  # Open Design needs one extra input YALC doesn't: a browser-reachable URL (the
  # web app loads client-side); default to localhost.
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
else
  # Quick: enable both opt-in services by default for a hands-on (interactive)
  # install, so a fresh install is feature-complete without a per-service prompt.
  # Headless/CI (WIZARD_ASSUME_YES / no TTY) stays off-by-default so scripted
  # installs stay minimal and don't fail pulling extra images — opt in there with
  # ENABLE_YALC=yes / ENABLE_OD=yes. Either way an explicit env value always wins.
  _svc_default=no
  [ "$INTERACTIVE" = "1" ] && _svc_default=yes
  ENABLE_YALC="${ENABLE_YALC:-$_svc_default}"
  ENABLE_OD="${ENABLE_OD:-$_svc_default}"
fi

# Normalize yes/no/1/0 → 1/0 for BOTH modes (advanced already produced 1/0; this
# is idempotent for it and resolves the quick defaults / any env override).
case "$(printf '%s' "$ENABLE_YALC" | tr '[:upper:]' '[:lower:]')" in
  y|yes|true|1) ENABLE_YALC=1 ;; *) ENABLE_YALC=0 ;;
esac
case "$(printf '%s' "$ENABLE_OD" | tr '[:upper:]' '[:lower:]')" in
  y|yes|true|1) ENABLE_OD=1 ;; *) ENABLE_OD=0 ;;
esac
# Open Design needs a browser-reachable URL. When enabled without one (quick, or
# a scripted install that set ENABLE_OD but not OD_WEB_URL) default to localhost;
# resolve_host_ports repoints it if host port 7456 gets relocated.
#
# Los origins se derivan de la URL SIEMPRE que falten — no sólo cuando falta la
# URL. Atarlos al mismo `if` dejaba OD_ALLOWED_ORIGINS vacío justo en el caso de
# un deploy real (ENABLE_OD=yes + OD_WEB_URL pública), y el daemon de OD rechaza
# al browser por CORS. Advanced ya lo hacía bien; esto empareja a quick. SAN-458.
if [ "$ENABLE_OD" = "1" ]; then
  [ -n "$OD_WEB_URL" ] || OD_WEB_URL="http://localhost:7456"
  OD_ALLOWED_ORIGINS="${OD_ALLOWED_ORIGINS:-$OD_WEB_URL}"
fi

# --- Generate secrets --------------------------------------------------------
step "Generating secrets"
NEXTAUTH_SECRET="$(gen_b64)"
ENCRYPTION_KEY="$(gen_hex)"
SANCHO_INTERNAL_API_TOKEN="$(gen_hex)"
# MC_CHAT_SECRET: the shared secret the control plane (MC's chat send/webhook
# endpoints) and the runtime gateway sign with (X-MC-Secret). The openclaw
# adapter, entrypoint.sh and generate-openclaw-config.js all read
# MC_CHAT_SECRET (falling back to OPENCLAW_GATEWAY_TOKEN), so a fresh install
# that never sets it 503s on the first chat ("MC_CHAT_SECRET not configured").
# Generate it here so chat works out of the box. Reused on --force (stateful,
# like adminToken) so an existing gateway pairing isn't rotated out.
MC_CHAT_SECRET="${MC_CHAT_SECRET:-}"
if [ -z "$MC_CHAT_SECRET" ] && [ -f "$ENV_FILE" ]; then
  # `|| true`: sin match, grep sale 1 y `set -o pipefail` mataría el wizard —
  # que es justo el caso normal (un .env anterior a esta variable). SAN-457.
  MC_CHAT_SECRET="$(grep -E '^[[:space:]]*MC_CHAT_SECRET=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"'" || true)"
fi
[ -n "$MC_CHAT_SECRET" ] || MC_CHAT_SECRET="$(gen_hex)"
# adminToken: stateful, like POSTGRES_PASSWORD. config/clients.json (the brand
# registry) is preserved across a --force re-run (see the write below), and this
# token is mirrored into .env as MC_ADMIN_TOKEN and printed as the login token.
# Minting a fresh one here would desync from the preserved file and rotate the
# admin login out from under the user. Reuse the existing one when present.
ADMIN_TOKEN=""
if [ -f "$CLIENTS_FILE" ]; then
  # `|| true` por la misma razón que MC_CHAT_SECRET arriba (SAN-457): un
  # clients.json sin adminToken es un archivo válido, no un error.
  ADMIN_TOKEN="$(grep -oE '"adminToken"[[:space:]]*:[[:space:]]*"[^"]+"' "$CLIENTS_FILE" 2>/dev/null | head -1 | sed -E 's/.*"([^"]*)"[[:space:]]*$/\1/' || true)"
  [ -n "$ADMIN_TOKEN" ] && say "  ${DIM}Reusing existing adminToken (keeps the preserved clients.json and login token in sync).${RST}"
fi
[ -z "$ADMIN_TOKEN" ] && ADMIN_TOKEN="$(gen_hex)"
MC_TOKEN="$(gen_hex)"
ok "NEXTAUTH_SECRET, ENCRYPTION_KEY, SANCHO_INTERNAL_API_TOKEN, MC_CHAT_SECRET, adminToken, mcToken"
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
# Scaffold from .env.example ONLY on a first install. On a --force re-run
# (./sancho reconfigure) the .env already exists and may hold keys the user added
# by hand after install (DISCORD_BOT_TOKEN, NOTION_API_KEY, FIREWORKS_ACCOUNT_ID,
# GA4/GSC creds…). `cp`-ing the example over it would wipe those (SAN-443); instead
# we edit the existing file in place — set_env below updates the wizard-managed
# keys (and blanks the ones it must) while leaving every other line untouched.
if [ ! -f "$ENV_FILE" ]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
else
  say "  ${DIM}Existing .env kept — updating managed keys in place (custom keys preserved).${RST}"
fi
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
set_env MC_CHAT_SECRET "$MC_CHAT_SECRET"
set_env ADMIN_EMAIL_DOMAIN "$ADMIN_EMAIL_DOMAIN"
set_env ADMIN_IDENTITY_EMAIL "$ADMIN_IDENTITY_EMAIL"
# Runtime: persist the boot default and any advanced adapter env vars passed to
# the wizard. This keeps curl-based installs compatible with BYO runtimes without
# asking first-time users for choices that would leave the stack misconfigured.
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
# Custom host ports (advanced) — only persist a non-default so a quick install
# leaves compose on its ${MC_PORT:-3000} defaults and Phase-1 relocation stays
# in charge. The container-internal ports never change.
[ -n "${MC_PORT:-}" ]           && [ "$MC_PORT" != "3000" ]            && set_env MC_PORT "$MC_PORT"
[ -n "${GATEWAY_HOST_PORT:-}" ] && [ "$GATEWAY_HOST_PORT" != "18789" ] && set_env GATEWAY_HOST_PORT "$GATEWAY_HOST_PORT"
[ -n "${LEGACY_HOST_PORT:-}" ]  && [ "$LEGACY_HOST_PORT" != "18790" ]  && set_env LEGACY_HOST_PORT "$LEGACY_HOST_PORT"
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

# Free-text values interpolated into the JSON files below (brand name, access URL)
# must be JSON-escaped so a quote/backslash can't produce invalid config the app
# fails to parse (SAN-443). The slug is already slug-safe but escaped for defense.
_BASE_URL_JSON="$(json_escape "$BASE_URL")"
_BRAND_NAME_JSON="$(json_escape "$FIRST_BRAND_NAME")"
_BRAND_SLUG_JSON="$(json_escape "$FIRST_BRAND_SLUG")"

# --- Write config/instance.json (minimal, no Discord) ------------------------
step "Writing $INSTANCE_FILE"
mkdir -p config
if [ -f "$INSTANCE_FILE" ]; then
  # Stateful like clients.json: instance.json can hold agent/Discord `accounts`
  # populated after install. A --force re-run (./sancho reconfigure) must not wipe
  # them (SAN-443). Preserve it; a changed access URL needs a manual mc_base_url edit.
  ok "$INSTANCE_FILE preserved (accounts kept — edit mc_base_url by hand if the access URL changed)"
else
  cat > "$INSTANCE_FILE" <<JSON
{
  "mc_base_url": "${_BASE_URL_JSON}/mc",
  "mc_server_port": 3000,
  "gateway_port": 18789,
  "accounts": {}
}
JSON
  ok "$INSTANCE_FILE written"
fi

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
      "slug": "${_BRAND_SLUG_JSON}",
      "name": "${_BRAND_NAME_JSON}",
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
if [ "$SANCHO_RUNTIME" = "external-http" ] && [ -n "${SANCHO_EXTERNAL_GATEWAY_URL:-}" ]; then
  say "       ${DIM}→ gateway ${SANCHO_EXTERNAL_GATEWAY_URL} (protocol ${SANCHO_EXTERNAL_PROTOCOL:-sancho})${RST}"
elif [ "$SANCHO_RUNTIME" = "hermes" ] && [ -n "${HERMES_GATEWAY_URL:-}" ]; then
  say "       ${DIM}→ gateway ${HERMES_GATEWAY_URL}${RST}"
fi
# Model provider(s) — reflect exactly what was configured. Mirror the same
# per-provider case selection used to collect the credentials above, so a
# Fireworks-only (or openai/all) install never shows a stale Anthropic line.
# A BYO runtime with no provider key configured shows the gateway instead.
if [ "$RUNTIME_NEEDS_MODEL_CRED" != "1" ] && [ -z "$PROVIDER" ]; then
  say "   • Model: served by the ${SANCHO_RUNTIME} gateway ${DIM}(no local model credential)${RST}"
else
say "   • Model provider(s):"
case "$PROVIDER" in
  anthropic|all)
    if [ "$ANTHROPIC_AUTH_MODE" = "subscription" ]; then
      say "       – Anthropic: subscription ${DIM}(Claude OAuth token set)${RST}"
    else
      say "       – Anthropic: api_key ${DIM}(API key set)${RST}"
    fi
    ;;
esac
case "$PROVIDER" in
  openai|all)
    if [ "$OPENAI_AUTH_MODE" = "subscription" ]; then
      say "       – OpenAI: subscription ${DIM}(Codex/ChatGPT OAuth — set up host-side after install)${RST}"
    else
      say "       – OpenAI: api_key ${DIM}(API key set)${RST}"
    fi
    ;;
esac
case "$PROVIDER" in
  fireworks|all)
    say "       – Fireworks: api_key ${DIM}(API key set)${RST}"
    ;;
esac
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
if [ "$WIZARD_MODE" != "advanced" ]; then
  say "${DIM}Quick setup — admin domain, database, access URL, ports and optional services took defaults.${RST}"
  say "   Want more control? Re-run:  ${CYN}./sancho reconfigure --advanced${RST}"
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
