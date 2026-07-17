#!/usr/bin/env bash
# docker/bootstrap-common.sh — runtime-agnostic boot bootstrap shared by EVERY
# runtime (openclaw, hermes, external-http). SOURCE this (don't exec) so the env
# exports below reach the launching process and its children. Idempotent; safe to
# run on every boot. Uses absolute paths under the home dir (arg $1) so it works
# whether sourced from the entrypoint (cwd = home) or a runtime boot.sh (cwd = app).
#
# Why this file exists (SAN-485): the entrypoint used to inline this bootstrap and
# then `exec` the non-OpenClaw runtime boot scripts BEFORE reaching it, so hermes /
# external-http booted WITHOUT the workspace-sancho/clients.json symlink (brand
# list empty, POST /api/clients/create → ENOENT 500), MC_ADMIN_TOKEN and MC_BASE.
# Centralizing it here and sourcing it from all three boot paths keeps them from
# diverging again. Every reference is `${VAR:-}`-guarded so it is safe under
# `set -u` (external-http's boot uses `set -euo pipefail`).

_sancho_home="${1:-/root/.openclaw}"

# --- Shared workspace paths -------------------------------------------------
# The metrics collector resolves its fallback from the skill's own __dirname,
# which lands on the OpenClaw home, while tenant data lives one level deeper in
# workspace-sancho/. Export the canonical paths for gateway/cron children too;
# setting MC_WORKSPACE only on the Next.js child does not reach agent shells.
if [ -z "${MC_WORKSPACE:-}" ]; then
  export MC_WORKSPACE="$_sancho_home/workspace-sancho"
fi
if [ -z "${MC_NEXTJS_DIR:-}" ]; then
  export MC_NEXTJS_DIR="/app/mc-nextjs"
fi

# --- Config symlinks: workspace-sancho/<f> -> ../config/<f> -------------------
# These files live in config/ (instance-specific, untracked) but the app reads
# them from workspace-sancho/. `git checkout` during deploy deletes
# tracked->untracked symlinks, so re-create them on every start. Without this the
# client list appears empty and POST /api/clients/create hits ENOENT (SAN-485).
for _f in clients.json clients.js dispatch-map.json; do
  if [ -f "$_sancho_home/config/$_f" ] && [ ! -e "$_sancho_home/workspace-sancho/$_f" ]; then
    ln -sf "../config/$_f" "$_sancho_home/workspace-sancho/$_f"
    echo "[bootstrap] Linked workspace-sancho/$_f -> ../config/$_f"
  fi
done
unset _f

# --- APIFY_TOKEN <- APIFY_API_KEY -------------------------------------------
# The bundled `apify` skill requires APIFY_TOKEN but deploys provision
# APIFY_API_KEY; derive it so the scraper actors are available to every agent.
if [ -z "${APIFY_TOKEN:-}" ] && [ -n "${APIFY_API_KEY:-}" ]; then
  export APIFY_TOKEN="$APIFY_API_KEY"
  echo "[bootstrap] APIFY_TOKEN derived from APIFY_API_KEY (apify skill enabled)"
fi

# --- MC_BASE <- BASE_URL / NEXTAUTH_URL -------------------------------------
# Agents build content-engine / pov-bank / phase-reporting URLs as
# "$MC_BASE/api/...". Without MC_BASE the curl hits a malformed URL and phases
# never report (SAN-241). The API is served at the site origin, not under /mc.
if [ -z "${MC_BASE:-}" ]; then
  _mc_base="${BASE_URL:-${NEXTAUTH_URL:-}}"
  _mc_base="${_mc_base%/}"
  if [ -n "$_mc_base" ]; then
    export MC_BASE="$_mc_base"
    echo "[bootstrap] MC_BASE exported as $MC_BASE (agents → content-engine/pov-bank/phase-reporting)"
  else
    echo "[bootstrap] WARNING: BASE_URL/NEXTAUTH_URL unset — MC_BASE not exported; phase-reporting will fail"
  fi
  unset _mc_base
fi

# --- MC_ADMIN_TOKEN <- config/clients.json adminToken -----------------------
# Operator skills drive work by having the agent curl MC's own API with
# `-H "x-admin-token: $MC_ADMIN_TOKEN"`. MC validates it against clients.json's
# adminToken (env fallback), so mirror MC's precedence (clients.json first) or the
# agent sends an empty header → 403 and the turn returns no visible reply.
if [ -f "$_sancho_home/config/clients.json" ]; then
  _mc_admin_token="$(SANCHO_CLIENTS_JSON="$_sancho_home/config/clients.json" python3 -c "import json, os; print(json.load(open(os.environ['SANCHO_CLIENTS_JSON'])).get('adminToken') or '')" 2>/dev/null || true)"
  if [ -n "$_mc_admin_token" ]; then
    export MC_ADMIN_TOKEN="$_mc_admin_token"
    echo "[bootstrap] MC_ADMIN_TOKEN derived from clients.json adminToken (agent → MC API auth)"
  elif [ -n "${MC_ADMIN_TOKEN:-}" ]; then
    echo "[bootstrap] MC_ADMIN_TOKEN from env (clients.json has no adminToken)"
  else
    echo "[bootstrap] WARNING: no adminToken in clients.json and MC_ADMIN_TOKEN unset — agent curls to MC API will 403 (discovery launch/runner)"
  fi
  unset _mc_admin_token
fi

unset _sancho_home
