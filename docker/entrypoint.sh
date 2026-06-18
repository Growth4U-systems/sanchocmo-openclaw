#!/bin/bash
set -e

# Seed/refresh the OpenClaw home from the image's baked framework so a fresh/empty
# OPENCLAW_HOME boots and `compose pull` updates apply — without clobbering user
# data. No-op in source/bind-mount dev mode (no /opt/sancho-seed). See init-home.sh.
if [ -x /opt/sancho-seed/docker/init-home.sh ]; then
  bash /opt/sancho-seed/docker/init-home.sh /root/.openclaw
fi

cd /root/.openclaw

OPENCLAW_CONFIG="/root/.openclaw/.openclaw/openclaw.json"

# ===========================================================
# 0a. ENSURE APIFY_TOKEN (runs every startup)
# ===========================================================
# The bundled `apify` skill (and competitor-intelligence's scraping-guide)
# require the env var APIFY_TOKEN, but deploys provision APIFY_API_KEY. Without
# APIFY_TOKEN, OpenClaw gates the apify skill out (skill `requires.env`), so
# agents fall back to web_fetch and primary scraping (Trustpilot/IG/FB ads)
# never runs. Derive it so the scraper actors are available to every agent.
# Exported before `openclaw gateway run` so the gateway and its agents inherit it.
if [ -z "${APIFY_TOKEN:-}" ] && [ -n "${APIFY_API_KEY:-}" ]; then
  export APIFY_TOKEN="$APIFY_API_KEY"
  echo "[entrypoint] APIFY_TOKEN derived from APIFY_API_KEY (apify skill enabled)"
fi

# Agents' bash tool builds content-engine / pov-bank / phase-reporting URLs as
# `$MC_BASE/api/...`. Without MC_BASE in the sandbox env, `curl "$MC_BASE/api/..."`
# hits a malformed URL (HTTP 000) and phases never report — research degrades and
# the UI lies about progress (SAN-241). The content-engine API is served at the
# site origin (`$BASE_URL/api/...`), NOT under `/mc`, so derive MC_BASE from
# BASE_URL (NEXTAUTH_URL as a safety net), trailing slash stripped. Exported
# before `openclaw gateway run` so the gateway and its agents inherit it.
if [ -z "${MC_BASE:-}" ]; then
  _mc_base="${BASE_URL:-${NEXTAUTH_URL:-}}"
  _mc_base="${_mc_base%/}"
  if [ -n "$_mc_base" ]; then
    export MC_BASE="$_mc_base"
    echo "[entrypoint] MC_BASE exported as $MC_BASE (agents → content-engine/pov-bank/phase-reporting)"
  else
    echo "[entrypoint] WARNING: BASE_URL/NEXTAUTH_URL unset — MC_BASE not exported; phase-reporting will fail"
  fi
fi

# ===========================================================
# 0. ENSURE CONFIG SYMLINKS (runs every startup)
# ===========================================================
# These files live in config/ (instance-specific, untracked) but the app
# reads them from workspace-sancho/. `git checkout` during deploy deletes
# tracked->untracked symlinks, so we re-create them on every container start.
# Without this, the client list appears empty after every deploy.
for f in clients.json clients.js dispatch-map.json; do
  if [ -f "config/$f" ] && [ ! -e "workspace-sancho/$f" ]; then
    ln -sf "../config/$f" "workspace-sancho/$f"
    echo "[entrypoint] Linked workspace-sancho/$f -> ../config/$f"
  fi
done

# ===========================================================
# 0b. ENSURE PER-AGENT SKILLS SYMLINK (runs every startup)
# ===========================================================
# Skills live centrally at ~/.openclaw/skills. Specialist agents run with
# cwd = their own workspace-<agent>/, so a relative read like
# `skills/<name>/references/x.md` resolves against the workspace, not the skill
# home → ENOENT. Point every non-Sancho workspace's `skills` at the central
# root so the agents that EXECUTE skills (hamete, etc.) resolve those reads.
# Sancho keeps its own real skills/ dir (first-party operator skills not in the
# central catalog). `git checkout` wipes symlinks on deploy → recreate every
# boot. Idempotent: only manage an absent or already-symlinked path.
for ws in /root/.openclaw/workspace-*; do
  [ -d "$ws" ] || continue
  [ "$(basename "$ws")" = "workspace-sancho" ] && continue
  link="$ws/skills"
  if [ -L "$link" ] || [ ! -e "$link" ]; then
    ln -sfn ../skills "$link"
    echo "[entrypoint] Linked $(basename "$ws")/skills -> ../skills"
  fi
  # `_system` (protocols, instance.json) and `brand` (brand context) are owned by
  # Sancho and shared into each specialist workspace by symlink. The seed shipped
  # these as macOS-absolute links (`/Users/ragi/.openclaw/...`) that dangle in the
  # container, so specialists (dulcinea, sanson, merlin, mambrino) lost brand +
  # protocol context and degraded — fabricating content with no foundation
  # (SAN-241, root of SAN-238). Repair to the relative path that resolves here.
  # Only fix an EXISTING symlink (broken or not) — never invent a mount in a
  # workspace that never had one, nor clobber a real directory.
  for shared in _system brand; do
    sl="$ws/$shared"
    if [ -L "$sl" ]; then
      ln -sfn "../workspace-sancho/$shared" "$sl"
      echo "[entrypoint] Relinked $(basename "$ws")/$shared -> ../workspace-sancho/$shared"
    fi
  done
done

# ===========================================================
# 0c. PREFLIGHT — validate MUST config, fail fast & clear
# ===========================================================
# A fresh install missing an essential var or config file should fail here
# with an actionable message, not crash later inside generate-openclaw-config
# or the gateway with an opaque error. Runs every boot (cheap), after the
# config symlinks (section 0) so config/*.json resolve, and before the heavy
# setup. Uses if/then (not `cond && action`) because `set -e` (line 2) would
# treat a false short-circuit as a fatal error. G4U sets all of these via its
# deploy, so the checks pass unchanged — purely additive, no regression.
preflight() {
  local errors=() warnings=()

  if [ -z "${NEXTAUTH_SECRET:-}" ]; then errors+=("NEXTAUTH_SECRET is not set"); fi
  if [ -z "${ENCRYPTION_KEY:-}" ]; then errors+=("ENCRYPTION_KEY is not set"); fi

  local f
  for f in clients.json instance.json; do
    if [ ! -f "config/$f" ]; then
      errors+=("config/$f is missing")
    elif ! python3 -c "import json; json.load(open('config/$f'))" 2>/dev/null; then
      errors+=("config/$f is not valid JSON")
    fi
  done

  # At least one usable model credential for the active auth mode. Anthropic is
  # Sancho's primary agent; OpenAI/Codex is secondary.
  local anthropic_ok=0 openai_ok=0
  if [ "${ANTHROPIC_AUTH_MODE:-api_key}" = "subscription" ]; then
    if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}${ANTHROPIC_OAUTH_TOKEN:-}" ]; then anthropic_ok=1; fi
  else
    if [ -n "${ANTHROPIC_API_KEY:-}" ]; then anthropic_ok=1; fi
  fi
  if [ -n "${OPENAI_API_KEY:-}" ]; then openai_ok=1; fi
  if [ "$anthropic_ok" = 0 ] && [ "$openai_ok" = 0 ]; then
    errors+=("No usable model credential for the active auth mode(s) — set ANTHROPIC_API_KEY (or the subscription token), and/or OPENAI_API_KEY")
  elif [ "$anthropic_ok" = 0 ]; then
    warnings+=("Anthropic credential absent — Sancho's primary agent needs it; only OpenAI/Codex agents will work")
  fi

  # DATABASE_URL is only required when tasks are DB-backed (default is json).
  case "${MC_TASKS_BACKEND:-json}" in
    db|db-shadow)
      if [ -z "${DATABASE_URL:-}" ]; then
        errors+=("MC_TASKS_BACKEND=${MC_TASKS_BACKEND} requires DATABASE_URL")
      fi
      ;;
  esac

  if [ "${#warnings[@]}" -gt 0 ]; then
    local w
    for w in "${warnings[@]}"; do echo "[entrypoint] ⚠ preflight: $w"; done
  fi

  if [ "${#errors[@]}" -gt 0 ]; then
    echo "[entrypoint] ❌ Preflight failed — required configuration is missing:"
    local e
    for e in "${errors[@]}"; do echo "   • $e"; done
    echo "[entrypoint] Fix: run scripts/wizard.sh (or edit .env / config/*.json), then restart the container."
    echo "[entrypoint] (To bypass for debugging only: set SKIP_PREFLIGHT=1.)"
    exit 1
  fi
  echo "[entrypoint] ✓ Preflight checks passed"
}

if [ "${SKIP_PREFLIGHT:-0}" != "1" ]; then
  preflight
fi

# ===========================================================
# 1-4. SETUP
# ===========================================================
if [ ! -f "$OPENCLAW_CONFIG" ]; then
  echo "[entrypoint] First run — configuring..."

  # 1. Generate openclaw.json from env vars + auto-detect Discord guilds
  echo "[entrypoint] Generating OpenClaw config..."
  node docker/generate-openclaw-config.js

  # 3. Link cron jobs to where OpenClaw expects them
  mkdir -p .openclaw/cron
  if [ -f cron/jobs.json ] && [ ! -f .openclaw/cron/jobs.json ]; then
    ln -sf /root/.openclaw/cron/jobs.json .openclaw/cron/jobs.json
    echo "[entrypoint] Linked cron jobs ($(python3 -c "import json; print(len(json.load(open('cron/jobs.json')).get('jobs',[])))" 2>/dev/null || echo '?') jobs)"
  fi

  echo "[entrypoint] First-run setup complete."
else
  echo "[entrypoint] Config exists, skipping first-run setup."
fi

# MC Chat often asks Sancho to produce large markdown deliverables in one
# model turn. Keep the app-server and diagnostic recovery watchdogs aligned so
# long Opus generations are not aborted just before the final write arrives.
echo "[entrypoint] Ensuring MC chat model timeouts..."
OPENCLAW_CONFIG="$OPENCLAW_CONFIG" python3 - <<'PY'
import json
import os

path = os.environ["OPENCLAW_CONFIG"]
with open(path, "r", encoding="utf-8") as fh:
    config = json.load(fh)

changed = False

def ensure_min(obj, key, value):
    global changed
    current = obj.get(key)
    if not isinstance(current, (int, float)) or current < value:
        obj[key] = value
        changed = True

diagnostics = config.setdefault("diagnostics", {})
# Heavy intelligence skills (competitor/market/self) accumulate large context
# from scraping; single Opus turns can run many minutes. Raised so the watchdog
# does not abort a still-progressing report before the final write (45 min).
ensure_min(diagnostics, "stuckSessionWarnMs", 300_000)
ensure_min(diagnostics, "stuckSessionAbortMs", 2_700_000)

plugins = config.setdefault("plugins", {})
entries = plugins.setdefault("entries", {})
codex = entries.setdefault("codex", {})
if codex.get("enabled") is not True:
    codex["enabled"] = True
    changed = True
app_server = codex.setdefault("config", {}).setdefault("appServer", {})
ensure_min(app_server, "turnCompletionIdleTimeoutMs", 2_700_000)
ensure_min(app_server, "requestTimeoutMs", 2_700_000)

if changed:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(config, fh, indent=2)
        fh.write("\n")
    print("[entrypoint] MC chat model timeouts updated")
else:
    print("[entrypoint] MC chat model timeouts already OK")
PY

# Inject env vars into agent .md files on EVERY start. Deploys ship new
# placeholders or new whitelist entries, and BASE_URL may differ across
# environments — running this only on first boot leaves stale literals
# like `{MC_BASE_URL}` in PROTOCOLS.md / TOOLS.md after subsequent deploys.
# The script is idempotent: once a placeholder is substituted, the next
# pass finds nothing to replace.
echo "[entrypoint] Injecting env vars into workspace .md files..."
bash docker/inject-env-vars.sh

# Agents are idempotent and must be ensured on every startup: staging/prod
# volumes keep openclaw.json between deploys, so newly added agents would not
# be registered if this only ran during first boot.
echo "[entrypoint] Ensuring agents are registered..."
bash docker/setup-agents.sh

# Propagate the Codex (ChatGPT) subscription auth across every agent. Without
# this, `openclaw models auth login --agent <X>` writes tokens only into X's
# auth-profiles.json, leaving the other agents on the env OPENAI_API_KEY (or
# nothing). The sync script collapses every agent's file into a symlink to a
# single canonical store so one login propagates to all. Idempotent.
#
# Gated on OPENAI_AUTH_MODE: only the subscription route needs this sync. In
# api_key mode (default) the agents fall back to OPENAI_API_KEY from the env,
# so forcing the shared subscription store would override the user's key.
if [ "${OPENAI_AUTH_MODE:-api_key}" = "subscription" ]; then
  echo "[entrypoint] Syncing Codex subscription auth across agents..."
  bash docker/sync-codex-auth.sh || \
    echo "[entrypoint] WARNING: sync-codex-auth failed; agents may diverge on subscription tokens"

  # Agents created at RUNTIME (MC UI / `openclaw agents add`) get a real
  # auth-profiles.json instead of the shared-store symlink, so they miss the
  # subscription token until the next restart. Watch for non-symlink profiles
  # and re-run the (idempotent) sync so every agent — existing or future —
  # picks up the shared token automatically. The sync also creates symlinks
  # for placeholder dirs, so each new agent triggers at most one re-sync.
  (
    while true; do
      for d in /root/.openclaw/.openclaw/agents/*/; do
        [ "$(basename "$d")" = "default" ] && continue
        if [ ! -L "${d}agent/auth-profiles.json" ]; then
          echo "[auth-watch] non-symlink auth profile in $(basename "$d") — re-running sync-codex-auth"
          bash docker/sync-codex-auth.sh || true
          break
        fi
      done
      sleep 60
    done
  ) &
  echo "[entrypoint] Codex auth watcher started (auto-links new agents to the shared store)"
else
  echo "[entrypoint] OPENAI_AUTH_MODE=api_key — skipping Codex subscription sync (agents use OPENAI_API_KEY)"
fi

# Anthropic model execution route, gated on ANTHROPIC_AUTH_MODE:
#   subscription → enforce the Claude/OpenClaw OAuth profile across openclaw.json
#                  and every agent's auth-profiles.json (the script strips any
#                  API-key profile). Keep this after sync-codex-auth because that
#                  step creates the shared auth-profiles symlink; writing only
#                  openclaw.json is not enough for agent inference.
#   api_key (default) → skip: generate-openclaw-config.js already wrote the
#                  `anthropic:default` token profile, and the key comes from
#                  ANTHROPIC_API_KEY. Running the subscription script here would
#                  delete that profile and flip billing to the subscription.
if [ "${ANTHROPIC_AUTH_MODE:-api_key}" = "subscription" ]; then
  echo "[entrypoint] Ensuring Anthropic subscription auth profile..."
  node docker/ensure-anthropic-subscription-auth.js || \
    echo "[entrypoint] WARNING: ensure-anthropic-subscription-auth failed; Anthropic may use stale auth"
  # The model layer (pi-ai's Anthropic provider) resolves the Anthropic
  # credential from env in this order: ANTHROPIC_OAUTH_TOKEN, then
  # ANTHROPIC_API_KEY. Any value containing "sk-ant-oat" is auto-detected as an
  # OAuth (subscription) token → Bearer auth + Claude Code identity headers, so
  # it bills the Claude Max subscription instead of API credit. We already ship
  # a subscription token as CLAUDE_CODE_OAUTH_TOKEN (used by the Cervantes
  # Claude Code service); mirror it into ANTHROPIC_OAUTH_TOKEN so the OpenClaw
  # gateway agents use the subscription too. Without this the provider falls
  # through to ANTHROPIC_API_KEY — the silent API-billing footgun. Idempotent.
  if [ -z "${ANTHROPIC_OAUTH_TOKEN:-}" ] && [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
    export ANTHROPIC_OAUTH_TOKEN="$CLAUDE_CODE_OAUTH_TOKEN"
    echo "[entrypoint] ANTHROPIC_OAUTH_TOKEN derived from CLAUDE_CODE_OAUTH_TOKEN (gateway → Claude subscription)"
  fi
  # Blank ANTHROPIC_API_KEY for Sancho's process so the provider can only resolve
  # the OAuth token — never a silent fall-through to API-key billing (the
  # historical footgun). This guard used to live as a hardcoded empty value in
  # docker-compose.yml, but that broke `api_key` mode (the key never reached the
  # container); it is mode-aware here instead. Process-scoped — open-design keeps
  # its own key from its env_file.
  export ANTHROPIC_API_KEY=
else
  echo "[entrypoint] ANTHROPIC_AUTH_MODE=api_key — using ANTHROPIC_API_KEY (anthropic:default token profile)"
fi

# ===========================================================
# 1a. ENSURE MODEL PROVIDER TIMEOUTS (runs every startup)
# ===========================================================
# Staging/prod volumes keep openclaw.json between deploys, so changes in
# generate-openclaw-config.js never reach existing instances. Ensure the
# Anthropic model idle watchdog is extended past OpenClaw's 120s default —
# long thinking runs (e.g. Dulcinea on Sonnet) trip it with
# "LLM request timed out". Respects a manually-set timeout value.
# OpenClaw >= 2026.5.18 requires baseUrl + models on any models.providers.<id>
# entry (a timeout-only entry fails validation and blocks gateway startup), so
# write the full entry; models:[] merges with — does not replace — the
# built-in Anthropic catalog. Also repairs a partial entry left by the
# previous version of this step.
python3 -c "
import json
f='$OPENCLAW_CONFIG'
c=json.load(open(f))
p=c.setdefault('models',{}).setdefault('providers',{}).setdefault('anthropic',{})
changed=False
for k,v in (('baseUrl','https://api.anthropic.com'),('api','anthropic-messages'),('models',[]),('timeoutSeconds',300)):
    if k not in p:
        p[k]=v
        changed=True
if changed:
    json.dump(c, open(f,'w'), indent=2)
    print('[entrypoint] Ensured full models.providers.anthropic entry (timeoutSeconds=%s)' % p['timeoutSeconds'])
" 2>/dev/null || true

# ===========================================================
# 1a2. ENSURE LATEST CODEX MODEL (runs every startup)
# ===========================================================
# Keep agents on the newest plain codex/gpt-X.Y from the catalog (SAN-172):
# bump agents.defaults.model.primary and any agents.list[].model pinned to an
# older plain codex id; the previous primary is kept as first fallback.
# Variant ids (-mini/-codex/-spark) are never touched. Set CODEX_MODEL_PIN
# (e.g. "codex/gpt-5.4") to pin a specific model and disable auto-tracking.
if [ "${OPENAI_AUTH_MODE:-api_key}" = "subscription" ]; then
  if [ -n "${CODEX_MODEL_PIN:-}" ]; then
    TARGET_CODEX="$CODEX_MODEL_PIN"
    echo "[entrypoint] CODEX_MODEL_PIN set — pinning codex agents to $TARGET_CODEX"
  else
    TARGET_CODEX=$(openclaw models list 2>/dev/null | grep -oE "^codex/gpt-[0-9]+\.[0-9]+ " | tr -d " " | sort -V | tail -1)
  fi
  if [ -n "$TARGET_CODEX" ]; then
    TARGET_CODEX="$TARGET_CODEX" python3 - <<'PY' || true
import json, os, re
target = os.environ["TARGET_CODEX"]
f = "/root/.openclaw/.openclaw/openclaw.json"
c = json.load(open(f))
pat = re.compile(r"^codex/gpt-\d+\.\d+$")
changed = []
m = c["agents"]["defaults"].get("model") or {}
if pat.match(m.get("primary", "")) and m["primary"] != target:
    old = m["primary"]
    m["primary"] = target
    fb = m.setdefault("fallbacks", [])
    if old not in fb:
        fb.insert(0, old)
    changed.append("defaults: " + old + " -> " + target)
for a in c["agents"].get("list", []):
    am = a.get("model")
    if isinstance(am, str) and pat.match(am) and am != target:
        changed.append(a["id"] + ": " + am + " -> " + target)
        a["model"] = target
if changed:
    json.dump(c, open(f, "w"), indent=2)
    print("[entrypoint] Codex model update: " + "; ".join(changed))
PY
  else
    echo "[entrypoint] WARNING: could not resolve latest codex model from catalog — keeping current pins"
  fi
fi

# ===========================================================
# 1b. ENSURE MC-CHAT PLUGIN (runs every startup)
# ===========================================================
MC_CHAT_PLUGIN="/root/.openclaw/plugins/mc-chat"
if [ -d "$MC_CHAT_PLUGIN" ]; then
  # Check if plugin is registered in config
  if ! python3 -c "import json; c=json.load(open('$OPENCLAW_CONFIG')); assert 'mc-chat' in c.get('plugins',{}).get('entries',{})" 2>/dev/null; then
    echo "[entrypoint] Registering mc-chat plugin..."
    openclaw plugins install --link "$MC_CHAT_PLUGIN" 2>/dev/null || true
  fi
  # Ensure channel config and binding exist
  python3 -c "
import json, os, sys
f='$OPENCLAW_CONFIG'
c=json.load(open(f))
changed=False
channel=c.setdefault('channels',{}).setdefault('mc-chat',{})
if channel.get('enabled') is not True:
    channel['enabled']=True
    changed=True
if not channel.get('mcServerUrl'):
    channel['mcServerUrl']='http://localhost:18790'
    changed=True
secret=os.environ.get('MC_CHAT_SECRET') or ''
if secret and channel.get('sharedSecret') != secret:
    channel['sharedSecret']=secret
    changed=True
elif not secret and 'sharedSecret' in channel:
    del channel['sharedSecret']
    changed=True
if not any(b.get('match',{}).get('channel')=='mc-chat' for b in c.get('bindings',[])):
    c.setdefault('bindings',[]).append({'agentId':'sancho','match':{'channel':'mc-chat'}})
    changed=True
if changed:
    json.dump(c, open(f,'w'), indent=2)
    print('[entrypoint] mc-chat channel config + binding added')
" 2>/dev/null || true
fi

# ===========================================================
# 4. NODE DEPENDENCIES (ws for MC server)
# ===========================================================
if [ -f workspace-sancho/package.json ] && [ ! -d workspace-sancho/node_modules ]; then
  echo "[entrypoint] Installing Node dependencies..."
  (cd workspace-sancho && npm install --production --quiet)
fi

# metrics-collector skill: ga4/gsc adapters import google-auth-library; without
# it the cron silently fails over to the catch and writes status=error. The
# skill carries its own scripts/package.json with the dep declared — install
# once per fresh deploy and skip on warm boots.
if [ -f skills/metrics-collector/scripts/package.json ] && [ ! -d skills/metrics-collector/scripts/node_modules ]; then
  echo "[entrypoint] Installing metrics-collector dependencies..."
  (cd skills/metrics-collector/scripts && npm install --production --quiet) \
    || echo "[entrypoint] WARNING: metrics-collector npm install failed; GA4/GSC adapters will throw at runtime"
fi

# ===========================================================
# 5. GENERATE MC DASHBOARD DATA (if missing)
# ===========================================================
if [ ! -f workspace-sancho/mission-control.html ] || [ ! -f workspace-sancho/memory/mc/agents-data.js ]; then
  echo "[entrypoint] Generating dashboard data..."
  (cd workspace-sancho && python3 scripts/regenerate.py 2>/dev/null) || \
    echo "[entrypoint] WARNING: regenerate.py failed (dashboard data will be generated by cron)"
fi

# ===========================================================
# 5b. ENSURE CRON-MODEL ALLOWLIST (runs every startup)
# ===========================================================
# Content Engine crons specify Anthropic models in their payload.model. The
# openclaw daemon enforces agents.defaults.models as an allowlist at preflight
# and caches it at startup — so the patch must happen BEFORE `gateway run`.
# The script is idempotent: a no-op when the models are already present.
if [ -x workspace-sancho/scripts/ensure-openclaw-allowlist.sh ]; then
  echo "[entrypoint] Ensuring cron model allowlist..."
  workspace-sancho/scripts/ensure-openclaw-allowlist.sh --config "$OPENCLAW_CONFIG" || \
    echo "[entrypoint] WARNING: ensure-openclaw-allowlist.sh failed; Content Engine crons may be rejected"
fi

# ===========================================================
# 5c. ENSURE @openclaw/codex MATCHES HOST OPENCLAW VERSION
# ===========================================================
# OpenClaw auto-installs @openclaw/codex@latest on first gateway boot, but its
# installer only enforces minHostVersion, not compat.pluginApi. That lets a
# newer codex (e.g. 2026.5.19, which calls
# `listRegisteredPluginAgentPromptGuidance({...})` from
# openclaw/plugin-sdk/plugin-runtime) land on a host pinned at an older
# version where the symbol doesn't exist. The embedded agent harness then
# throws "is not a function" before reply and every MC chat hangs forever on
# "Sancho está pensando…". Pin codex to the same version as the host so the
# pluginApi contract is always met. Use `openclaw plugins install` (not raw
# npm) so the CLI also wires the peer-dep loader hook that resolves
# `import "openclaw"` to the global install.
if [ -n "$OPENCLAW_VERSION" ]; then
  CURRENT_CODEX=$(node -p "try{require('/root/.openclaw/.openclaw/npm/node_modules/@openclaw/codex/package.json').version}catch(_){''}" 2>/dev/null)
  if [ "$CURRENT_CODEX" != "$OPENCLAW_VERSION" ]; then
    echo "[entrypoint] Pinning @openclaw/codex@${OPENCLAW_VERSION} (was: ${CURRENT_CODEX:-none}) to match host..."
    openclaw plugins install "@openclaw/codex@${OPENCLAW_VERSION}" --force >/tmp/codex-pin.log 2>&1 \
      && echo "[entrypoint] codex pinned to ${OPENCLAW_VERSION}" \
      || echo "[entrypoint] WARNING: codex pin failed (see /tmp/codex-pin.log); MC chat may hang if installed codex requires a newer pluginApi"
  fi
fi

# ===========================================================
# 5d. APPLY LOCAL DB MIGRATIONS (bundled / non-Neon Postgres only)
# ===========================================================
# The bundled local Postgres (Compose profile `local-db`) ships empty; create
# its schema from the clean baseline in src/db/migrations-local before the app
# servers touch the DB. The script self-gates: it SKIPS Neon/managed URLs
# (prod keeps its own manual apply flow) and is a no-op when DATABASE_URL is
# unset. Idempotent across reboots/upgrades. Non-fatal on failure so the
# container still boots (DB features degrade rather than crash). Runs from the
# Next app dir so it resolves postgres/drizzle-orm from its node_modules.
if [ -n "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] Checking local DB migrations…"
  ( cd /app/mc-nextjs && node scripts/migrate-local.mjs ) || true
fi

# ===========================================================
# 6. START GATEWAY (foreground, backgrounded for MC)
# ===========================================================
echo "[entrypoint] Starting OpenClaw gateway..."
openclaw gateway run &
GATEWAY_PID=$!

echo "[entrypoint] Waiting for gateway on :18789..."
TRIES=0
until curl -sf http://localhost:18789/healthz > /dev/null 2>&1; do
  TRIES=$((TRIES + 1))
  if [ $TRIES -ge 30 ]; then
    echo "[entrypoint] ERROR: Gateway did not start after 60s"
    exit 1
  fi
  sleep 2
done
echo "[entrypoint] Gateway ready (PID $GATEWAY_PID)."

# ===========================================================
# 7. START MC SERVER (legacy, Strangler Fig fallback)
# ===========================================================
echo "[entrypoint] Starting Legacy Mission Control on :18790..."
node workspace-sancho/scripts/mc-server.js &
MC_PID=$!

# ===========================================================
# 7a. COST TRACKER LOOP (background)
# ===========================================================
# Runs cost-tracker.py every COST_TRACKER_INTERVAL seconds (default 600 = 10
# min). The tracker scans OpenClaw session transcripts and aggregates token
# costs into workspace-sancho/memory/costs/global.json + brand/<slug>/costs.json.
# Used by /api/system/costs → dashboard CostsCard.
#
# Previously this ran outside the container via an external cron that wasn't
# transferable. Embedding the loop here makes the cost dashboard work on any
# new environment with no manual cron registration. Output is appended to
# workspace-sancho/_system/cost-tracker.log (truncated by logrotate-equivalent
# external to this script).
COST_TRACKER_INTERVAL="${COST_TRACKER_INTERVAL:-600}"
COST_TRACKER_LOG="/root/.openclaw/workspace-sancho/_system/cost-tracker.log"
mkdir -p "$(dirname "$COST_TRACKER_LOG")"
echo "[entrypoint] Starting cost-tracker loop (every ${COST_TRACKER_INTERVAL}s)…"
(
  # Initial delay so the gateway/MC processes settle before the first run.
  sleep 30
  while :; do
    {
      echo "[$(date -u +%FT%TZ)] cost-tracker run start"
      python3 /root/.openclaw/workspace-sancho/scripts/cost-tracker.py 2>&1
      echo "[$(date -u +%FT%TZ)] cost-tracker run done"
    } >> "$COST_TRACKER_LOG" 2>&1 || true
    # Cap log file to last ~5MB to avoid unbounded growth in long-running
    # containers without external logrotate. Keeps the tail readable on SSH.
    if [ -f "$COST_TRACKER_LOG" ] && [ "$(stat -c%s "$COST_TRACKER_LOG" 2>/dev/null || echo 0)" -gt 5242880 ]; then
      tail -c 2097152 "$COST_TRACKER_LOG" > "${COST_TRACKER_LOG}.tmp" && mv "${COST_TRACKER_LOG}.tmp" "$COST_TRACKER_LOG"
    fi
    sleep "$COST_TRACKER_INTERVAL"
  done
) &
COST_TRACKER_PID=$!

# ===========================================================
# 7a-bis. USAGE MONITOR LOOP (background)
# ===========================================================
# Watches the Claude subscription's "extra usage" headroom and alerts to
# Discord (#cervantes-admin) BEFORE it runs out — so the subscription-backed
# agents don't get silently rejected ("out of extra usage"). It does a 1-token
# probe with CLAUDE_CODE_OAUTH_TOKEN and reads the anthropic-ratelimit-unified-*
# headers (exact utilization per window). Gated: only runs when both the OAuth
# token and the Discord webhook are present (no token = nothing to measure;
# no webhook = nowhere to alert). The monitor self-dedupes, so this loop just
# re-checks on an interval. Default 30 min; tune with USAGE_MONITOR_INTERVAL.
USAGE_MONITOR_INTERVAL="${USAGE_MONITOR_INTERVAL:-1800}"
USAGE_MONITOR_LOG="/root/.openclaw/workspace-sancho/_system/usage-monitor.log"
if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] && [ -n "${DISCORD_WEBHOOK_CERVANTES:-}" ]; then
  mkdir -p "$(dirname "$USAGE_MONITOR_LOG")"
  echo "[entrypoint] Starting usage-monitor loop (every ${USAGE_MONITOR_INTERVAL}s)…"
  (
    sleep 45  # let the gateway settle before the first probe
    while :; do
      {
        echo "[$(date -u +%FT%TZ)] usage-monitor run start"
        python3 /root/.openclaw/workspace-sancho/scripts/usage-monitor.py 2>&1
        echo "[$(date -u +%FT%TZ)] usage-monitor run done"
      } >> "$USAGE_MONITOR_LOG" 2>&1 || true
      if [ -f "$USAGE_MONITOR_LOG" ] && [ "$(stat -c%s "$USAGE_MONITOR_LOG" 2>/dev/null || echo 0)" -gt 2097152 ]; then
        tail -c 1048576 "$USAGE_MONITOR_LOG" > "${USAGE_MONITOR_LOG}.tmp" && mv "${USAGE_MONITOR_LOG}.tmp" "$USAGE_MONITOR_LOG"
      fi
      sleep "$USAGE_MONITOR_INTERVAL"
    done
  ) &
  USAGE_MONITOR_PID=$!
else
  echo "[entrypoint] usage-monitor skipped (need CLAUDE_CODE_OAUTH_TOKEN + DISCORD_WEBHOOK_CERVANTES)"
  USAGE_MONITOR_PID=""
fi

# ===========================================================
# 7b. START NEXT.JS MC (primary frontend on :3000)
# ===========================================================
echo "[entrypoint] Starting Next.js Mission Control on :3000..."
cd /app/mc-nextjs
MC_WORKSPACE=/root/.openclaw/workspace-sancho \
LEGACY_PORT=18790 \
NEXTAUTH_URL="${NEXTAUTH_URL:-${BASE_URL}}" \
node_modules/.bin/next start -p 3000 &
NEXTJS_PID=$!
cd /root/.openclaw

echo "[entrypoint] All services running. Gateway=$GATEWAY_PID LegacyMC=$MC_PID NextJS=$NEXTJS_PID CostTracker=$COST_TRACKER_PID"

# ===========================================================
# 8. WAIT — if any process dies, container stops
# ===========================================================
wait -n $GATEWAY_PID $MC_PID $NEXTJS_PID
EXIT_CODE=$?
echo "[entrypoint] A process exited with code $EXIT_CODE. Shutting down."
kill $GATEWAY_PID $MC_PID $NEXTJS_PID 2>/dev/null
exit $EXIT_CODE
