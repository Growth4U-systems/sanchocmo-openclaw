#!/bin/bash
# Propagate Codex (ChatGPT) subscription auth across every agent.
#
# OpenClaw stores OAuth tokens per agent in
#   $OPENCLAW_HOME/.openclaw/agents/<agent>/agent/auth-profiles.json
# Each `openclaw models auth login --agent <X>` writes only to that agent's
# file, so by default the subscription would have to be re-linked once per
# agent. This script collapses all of them to symlinks pointing at a single
# canonical store, so connecting any one agent updates every other agent on
# next OpenClaw read (saveJsonFile follows symlinks before atomic rename, so
# writes-through-symlink keep all agents in sync).
#
# Idempotent: safe to run on every container start.
#
# Usage:
#   ./docker/sync-codex-auth.sh             # run with default OPENCLAW_HOME
#   OPENCLAW_HOME=/path ./docker/sync-codex-auth.sh

set -eu

HOME_DIR="${OPENCLAW_HOME:-/root/.openclaw}"
AGENTS_DIR="$HOME_DIR/.openclaw/agents"
SHARED_DIR="$HOME_DIR/.openclaw/shared"
SHARED="$SHARED_DIR/auth-profiles.json"
LEGACY_AGENTS_DIR="$HOME_DIR/agents"  # pre-migration path; still has Sancho

if [ ! -d "$AGENTS_DIR" ]; then
  echo "[sync-codex-auth] no agents dir at $AGENTS_DIR — skipping"
  exit 0
fi

mkdir -p "$SHARED_DIR"
chmod 700 "$SHARED_DIR" 2>/dev/null || true

# Seed the shared file when missing: pick the freshest real auth-profiles.json
# across all agents (new + legacy paths). On a clean install both globs return
# nothing — in which case we leave the shared file absent so the first
# `openclaw models auth login --agent <X>` creates it (the symlinks we create
# below will redirect that write to the shared path).
if [ ! -f "$SHARED" ]; then
  SEED=$({
    find "$AGENTS_DIR" -maxdepth 3 -path "*/agent/auth-profiles.json" -type f -printf "%T@ %p\n" 2>/dev/null
    find "$LEGACY_AGENTS_DIR" -maxdepth 3 -path "*/agent/auth-profiles.json" -type f -printf "%T@ %p\n" 2>/dev/null
  } | sort -rn | head -n1 | awk '{print $2}')
  if [ -n "$SEED" ]; then
    cp -a "$SEED" "$SHARED"
    chmod 600 "$SHARED" 2>/dev/null || true
    echo "[sync-codex-auth] seeded shared store from $SEED"
  fi
fi

# Convert every agent's auth-profiles.json into a symlink to $SHARED. If an
# agent has a real file that's newer than the shared store, promote it first
# (the user just re-logged that agent).
ensure_symlink() {
  local f="$1"
  local agent_dir
  agent_dir=$(dirname "$f")
  mkdir -p "$agent_dir"

  if [ -L "$f" ]; then
    # Already a symlink — re-point to the canonical path, idempotent.
    ln -sfn "$SHARED" "$f"
    return
  fi

  if [ -f "$f" ]; then
    # Real file. Promote to shared if newer than the current shared file.
    if [ ! -f "$SHARED" ] || [ "$f" -nt "$SHARED" ]; then
      cp -a "$f" "$SHARED"
      chmod 600 "$SHARED" 2>/dev/null || true
    fi
    # Back up the per-agent copy in case manual review is ever needed.
    mkdir -p "$SHARED_DIR/backups"
    cp -a "$f" "$SHARED_DIR/backups/auth-profiles-$(basename "$(dirname "$agent_dir")")-$(date -u +%Y%m%dT%H%M%SZ).json" 2>/dev/null || true
    rm -f "$f"
  fi

  ln -sfn "$SHARED" "$f"
}

# Walk every agent dir in the canonical path. The dir is the source of truth
# for "which agents exist"; we include placeholder dirs so first-use already
# has a symlink in place.
for d in "$AGENTS_DIR"/*/; do
  agent=$(basename "$d")
  # Skip the openclaw-managed `default` placeholder — it doesn't own a real
  # agent dir and creating one confuses `openclaw agents list`.
  [ "$agent" = "default" ] && continue
  ensure_symlink "${d}agent/auth-profiles.json"
done

# Legacy path: pre-migration installs kept Sancho's auth at
# $OPENCLAW_HOME/agents/sancho/agent/auth-profiles.json. Mirror the same
# symlink into the legacy path so any old CLI invocation that resolves the
# legacy path still picks up the shared tokens.
if [ -d "$LEGACY_AGENTS_DIR" ]; then
  for d in "$LEGACY_AGENTS_DIR"/*/; do
    f="${d}agent/auth-profiles.json"
    if [ -e "$f" ] || [ -L "$f" ]; then
      ensure_symlink "$f"
    fi
  done
fi

if [ -f "$SHARED" ]; then
  echo "[sync-codex-auth] shared store at $SHARED ($(stat -c%s "$SHARED" 2>/dev/null || echo '?') bytes)"
else
  echo "[sync-codex-auth] no shared store yet — agents will pick up tokens after first \`openclaw models auth login\`"
fi
