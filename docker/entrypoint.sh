#!/bin/bash
set -e

cd /root/.openclaw

OPENCLAW_CONFIG="/root/.openclaw/.openclaw/openclaw.json"

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
ensure_min(diagnostics, "stuckSessionWarnMs", 120_000)
ensure_min(diagnostics, "stuckSessionAbortMs", 900_000)

plugins = config.setdefault("plugins", {})
entries = plugins.setdefault("entries", {})
codex = entries.setdefault("codex", {})
if codex.get("enabled") is not True:
    codex["enabled"] = True
    changed = True
app_server = codex.setdefault("config", {}).setdefault("appServer", {})
ensure_min(app_server, "turnCompletionIdleTimeoutMs", 900_000)
ensure_min(app_server, "requestTimeoutMs", 900_000)

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
echo "[entrypoint] Syncing Codex subscription auth across agents..."
bash docker/sync-codex-auth.sh || \
  echo "[entrypoint] WARNING: sync-codex-auth failed; agents may diverge on subscription tokens"

# Anthropic model execution must use the Claude/OpenClaw subscription route.
# Keep this after sync-codex-auth because that step creates the shared
# auth-profiles symlink; writing only openclaw.json is not enough for agent
# inference.
echo "[entrypoint] Ensuring Anthropic subscription auth profile..."
node docker/ensure-anthropic-subscription-auth.js || \
  echo "[entrypoint] WARNING: ensure-anthropic-subscription-auth failed; Anthropic may use stale auth"

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
