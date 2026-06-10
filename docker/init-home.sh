#!/usr/bin/env bash
# Seed / refresh the OpenClaw home from the image.
#
# Why: the entrypoint runs with cwd=/root/.openclaw (the OPENCLAW_HOME volume) and
# expects the framework (docker/, skills/, workspace-*/, agents/, plugins/, …) to be
# there. For a distributable product we bake that framework into the image at
# /opt/sancho-seed and populate the volume here, so a fresh/empty volume boots and a
# `compose pull` of a newer image applies framework updates — WITHOUT ever clobbering
# the user's data.
#
# Layers:
#   - Framework (skills/, docker/): overwritten from the image, gated on a version
#     marker so we only re-copy when the image actually changed (avoids 180 MB of
#     churn on every restart).
#   - plugins/: source refreshed the same way, but the runtime install registry
#     (installs.json) is preserved.
#   - Data-bearing dirs (agents/, workspace-*/, config/, cron/): copied ONLY when
#     absent — existing user data is never overwritten.
#
# The seed lives at /opt/sancho-seed, a path the OPENCLAW_HOME mount does not shadow.
# Safe for Growth4U's VPS (OPENCLAW_HOME = git checkout): same version marker ->
# refresh is skipped; data dirs already present -> seed-if-absent is a no-op.
set -uo pipefail

SEED="${SANCHO_SEED_DIR:-/opt/sancho-seed}"
HOME_DIR="${1:-${OPENCLAW_HOME:-/root/.openclaw}}"

log() { echo "[init-home] $*"; }

if [ ! -d "$SEED" ]; then
  log "seed dir $SEED missing — nothing to seed (source/bind-mount dev mode)."
  exit 0
fi

mkdir -p "$HOME_DIR"

# --- Framework refresh, gated on the image version marker --------------------
seed_ver="unknown"; [ -f "$SEED/.seed-version" ] && seed_ver="$(cat "$SEED/.seed-version")"
home_ver="none";    [ -f "$HOME_DIR/.sancho-seed-version" ] && home_ver="$(cat "$HOME_DIR/.sancho-seed-version")"

if [ "$seed_ver" != "$home_ver" ]; then
  log "framework version changed (${home_ver} -> ${seed_ver}) — refreshing…"

  # Pure framework: overwrite-merge from the image.
  for d in skills docker; do
    if [ -d "$SEED/$d" ]; then
      mkdir -p "$HOME_DIR/$d"
      cp -a "$SEED/$d/." "$HOME_DIR/$d/"
    fi
  done

  # plugins: refresh source, but keep the runtime install registry.
  if [ -d "$SEED/plugins" ]; then
    mkdir -p "$HOME_DIR/plugins"
    keep=""
    if [ -f "$HOME_DIR/plugins/installs.json" ]; then
      keep="$(mktemp)"; cp -a "$HOME_DIR/plugins/installs.json" "$keep"
    fi
    cp -a "$SEED/plugins/." "$HOME_DIR/plugins/"
    [ -n "$keep" ] && mv "$keep" "$HOME_DIR/plugins/installs.json"
  fi

  echo "$seed_ver" > "$HOME_DIR/.sancho-seed-version"
  log "framework refreshed (skills, docker, plugins)"
else
  log "framework up to date (${home_ver}) — skipping refresh"
fi

# --- Data-bearing dirs: seed ONLY if absent (never overwrite user data) ------
for d in agents config cron \
         workspace-sancho workspace-cervantes workspace-escudero workspace-hamete \
         workspace-dulcinea workspace-rocinante workspace-mambrino workspace-merlin \
         workspace-sanson; do
  if [ -d "$SEED/$d" ] && [ ! -e "$HOME_DIR/$d" ]; then
    cp -a "$SEED/$d" "$HOME_DIR/$d"
    log "seeded $d (first run)"
  fi
done

log "home ready at $HOME_DIR"
