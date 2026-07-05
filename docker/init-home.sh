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
#   - Framework (skills/, docker/, src/lib/runtime/agent-contract/): overwritten
#     from the image, gated on a version marker so we only re-copy when the image
#     actually changed (avoids 180 MB of churn on every restart).
#   - plugins/: source refreshed the same way, but the runtime install registry
#     (installs.json) is preserved.
#   - Data-bearing dirs (agents/, workspace-*/, config/, cron/): copied ONLY when
#     absent — existing user data is never overwritten.
#
# The seed lives at /opt/sancho-seed, a path the OPENCLAW_HOME mount does not shadow.
# Git-checkout homes (Growth4U's VPS: staging builds from source, prod checks out a
# tag) are skipped entirely below — there git owns the framework, and seeding from
# the image would overwrite tracked files, dirty the worktree, and abort the next
# deploy's `git checkout`. Only fresh, non-git product installs are seeded.
set -uo pipefail

SEED="${SANCHO_SEED_DIR:-/opt/sancho-seed}"
HOME_DIR="${1:-${OPENCLAW_HOME:-/root/.openclaw}}"

log() { echo "[init-home] $*"; }

if [ ! -d "$SEED" ]; then
  log "seed dir $SEED missing — nothing to seed (source/bind-mount dev mode)."
  exit 0
fi

# Git-managed home → the deploy owns the framework via `git checkout`; seeding from
# the image here would overwrite tracked files (docker/, skills/, plugins/), write
# .sancho-seed-version, and leave the worktree dirty enough to abort the *next*
# deploy's checkout. Skip the whole seed: this is Growth4U's VPS (staging always
# builds from source; prod checks out a tag). Fresh product installs have no .git
# and fall through to the real seed below. See SAN-146.
if [ -d "$HOME_DIR/.git" ]; then
  log "home $HOME_DIR is a git checkout — deploy manages the framework; skipping image seed."
  exit 0
fi

mkdir -p "$HOME_DIR"

# --- Framework refresh, gated on the image version marker --------------------
seed_ver="unknown"; [ -f "$SEED/.seed-version" ] && seed_ver="$(cat "$SEED/.seed-version")"
home_ver="none";    [ -f "$HOME_DIR/.sancho-seed-version" ] && home_ver="$(cat "$HOME_DIR/.sancho-seed-version")"

if [ "$seed_ver" != "$home_ver" ]; then
  log "framework version changed (${home_ver} -> ${seed_ver}) — refreshing…"

  # Pure framework: overwrite-merge from the image. The seed only contains the
  # runtime-neutral contract under src/, not the full Next.js app source.
  for d in skills docker src; do
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
  log "framework refreshed (skills, docker, src/agent-contract, plugins)"
else
  log "framework up to date (${home_ver}) — skipping refresh"
fi

# --- Data-bearing dirs: seed when absent, self-heal a partial seed -----------
# Never overwrite user data, but DO recover from an interrupted first boot. The
# old "copy only if absent" wedged forever when a boot was killed mid-copy: the
# half-written dir (e.g. workspace-sancho without scripts/) already existed, so
# the re-seed was skipped, the server entrypoint stayed missing, and the
# container crash-looped with no recovery (SAN-329).
#
# Per dir:
#   - absent → copy into a temp dir, then atomically rename it into place. The
#     rename is the commit, so a killed copy NEVER leaves a partial dir behind —
#     on the next boot the real dir is still absent and we simply re-seed.
#   - present but not marked complete (a pre-marker install, or a copy
#     interrupted before this guard existed) → fill in only the missing files
#     with a no-clobber merge (user data is never overwritten), then mark it.
#   - present and marked complete → leave untouched.
# Completion is tracked OUT of the data dirs, under .sancho-seed-state/, so the
# marker never pollutes the seeded content.
SEED_STATE="$HOME_DIR/.sancho-seed-state"
mkdir -p "$SEED_STATE"
# Drop temp dirs abandoned by a previously-killed copy.
rm -rf "$HOME_DIR"/.seed-tmp.* 2>/dev/null || true

for d in agents config cron \
         workspace-sancho workspace-cervantes workspace-hamete \
         workspace-dulcinea workspace-rocinante workspace-mambrino workspace-merlin \
         workspace-sanson workspace-alarife workspace-maese-pedro; do
  [ -d "$SEED/$d" ] || continue
  if [ ! -e "$HOME_DIR/$d" ]; then
    tmp="$HOME_DIR/.seed-tmp.$d.$$"
    rm -rf "$tmp"
    cp -a "$SEED/$d" "$tmp"
    mv "$tmp" "$HOME_DIR/$d"        # atomic publish — the dir appears only once complete
    : > "$SEED_STATE/$d"
    log "seeded $d (first run)"
  elif [ ! -f "$SEED_STATE/$d" ]; then
    cp -an "$SEED/$d/." "$HOME_DIR/$d/" 2>/dev/null || true   # no-clobber merge
    : > "$SEED_STATE/$d"
    log "completed partial seed for $d (self-heal, SAN-329)"
  fi
done

log "home ready at $HOME_DIR"
