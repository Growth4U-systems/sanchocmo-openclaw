#!/bin/bash
# migrate-instance-data.sh
# Extracts instance data from origin/main and places it
# in the correct paths for the new-mission-control architecture.
#
# Usage: bash docker/migrate-instance-data.sh
# Run from the repo root (e.g. ~/.openclaw)

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

TMP_DIR=$(mktemp -d)
echo "[migrate] Extracting instance data from origin/main..."

git archive origin/main -- \
  cron/jobs.json \
  workspace-sancho/brand/ \
  workspace-sancho/memory/ \
  workspace-sancho/clients.json \
  workspace-sancho/dispatch-map.json \
  workspace-sancho/mc-data.js \
  workspace-sancho/costs-global.json \
  workspace-sancho/costs-daily.json \
  workspace-sancho/agents-data.js \
  workspace-sancho/clients.js \
  2>/dev/null | tar x -C "$TMP_DIR"

echo "[migrate] Extracted to $TMP_DIR"

# === Files that stay in the same path ===
echo "[migrate] Copying brand data..."
cp -rn "$TMP_DIR/workspace-sancho/brand/"* workspace-sancho/brand/ 2>/dev/null || true

echo "[migrate] Copying memory data..."
mkdir -p workspace-sancho/memory
cp -rn "$TMP_DIR/workspace-sancho/memory/"* workspace-sancho/memory/ 2>/dev/null || true

echo "[migrate] Copying cron jobs..."
mkdir -p cron
cp -n "$TMP_DIR/cron/jobs.json" cron/jobs.json 2>/dev/null || true

# === Files that moved to config/ ===
echo "[migrate] Moving config files to config/..."
mkdir -p config
[ -f "$TMP_DIR/workspace-sancho/clients.json" ] && \
  cp -n "$TMP_DIR/workspace-sancho/clients.json" config/clients.json 2>/dev/null || true
[ -f "$TMP_DIR/workspace-sancho/dispatch-map.json" ] && \
  cp -n "$TMP_DIR/workspace-sancho/dispatch-map.json" config/dispatch-map.json 2>/dev/null || true
[ -f "$TMP_DIR/workspace-sancho/clients.js" ] && \
  cp -n "$TMP_DIR/workspace-sancho/clients.js" config/clients.js 2>/dev/null || true

# === Files that moved to memory/ subdirs ===
echo "[migrate] Moving data files to memory/..."
mkdir -p workspace-sancho/memory/mc
mkdir -p workspace-sancho/memory/costs

[ -f "$TMP_DIR/workspace-sancho/mc-data.js" ] && \
  cp "$TMP_DIR/workspace-sancho/mc-data.js" workspace-sancho/memory/mc/mc-data.js
[ -f "$TMP_DIR/workspace-sancho/agents-data.js" ] && \
  cp "$TMP_DIR/workspace-sancho/agents-data.js" workspace-sancho/memory/mc/agents-data.js
[ -f "$TMP_DIR/workspace-sancho/costs-global.json" ] && \
  cp "$TMP_DIR/workspace-sancho/costs-global.json" workspace-sancho/memory/costs/global.json
[ -f "$TMP_DIR/workspace-sancho/costs-daily.json" ] && \
  cp "$TMP_DIR/workspace-sancho/costs-daily.json" workspace-sancho/memory/costs/daily.json

# === Ensure symlinks exist ===
echo "[migrate] Ensuring symlinks..."
[ ! -L workspace-sancho/clients.json ] && [ -f config/clients.json ] && \
  ln -sf ../config/clients.json workspace-sancho/clients.json
[ ! -L workspace-sancho/dispatch-map.json ] && [ -f config/dispatch-map.json ] && \
  ln -sf ../config/dispatch-map.json workspace-sancho/dispatch-map.json

# === Cleanup ===
rm -rf "$TMP_DIR"

echo ""
echo "[migrate] Done. Summary:"
echo "  config/clients.json        ← workspace-sancho/clients.json (main)"
echo "  config/dispatch-map.json   ← workspace-sancho/dispatch-map.json (main)"
echo "  config/clients.js          ← workspace-sancho/clients.js (main)"
echo "  memory/mc/mc-data.js       ← workspace-sancho/mc-data.js (main)"
echo "  memory/mc/agents-data.js   ← workspace-sancho/agents-data.js (main)"
echo "  memory/costs/global.json   ← workspace-sancho/costs-global.json (main)"
echo "  memory/costs/daily.json    ← workspace-sancho/costs-daily.json (main)"
echo "  workspace-sancho/brand/*   ← same path (copied)"
echo "  workspace-sancho/memory/*  ← same path (copied)"
echo "  cron/jobs.json             ← same path (copied)"
