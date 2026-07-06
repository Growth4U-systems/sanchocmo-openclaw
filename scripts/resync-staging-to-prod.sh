#!/usr/bin/env bash
#
# Re-sync live data from STAGING → PROD (files + Neon DB).
#
# Use this while staging is still the source of truth (gradual cutover):
# whenever client data changes on staging — documents, chats, tasks,
# brand foundation, POV banks, etc. — run this to mirror it into prod
# without losing anything.
#
#   ┌─ Files (incremental rsync) ──────────────────────────────────────┐
#   │ • workspace-sancho/brand/*  (client docs, chat, projects, ...)    │
#   │ • .openclaw/  (gateway + agent state/sessions)                    │
#   │ • config/clients.json, cron/jobs.json                             │
#   └──────────────────────────────────────────────────────────────────┘
#   ┌─ Database (Neon branch restore) ─────────────────────────────────┐
#   │ • production branch <- staging branch (POV banks, tasks,          │
#   │   meeting-intelligence, ...). Auto-creates a backup branch.       │
#   └──────────────────────────────────────────────────────────────────┘
#
# ⚠️ DIRECTION IS STAGING → PROD (overwrites prod with staging's state).
#    Safe ONLY while staging is the live instance and prod is not taking
#    independent writes. Once prod becomes canonical, STOP using this.
#
# Usage:
#   DRY_RUN=1 scripts/resync-staging-to-prod.sh         # preview file changes
#   scripts/resync-staging-to-prod.sh                   # files only
#   NEON_API_KEY=napi_xxx scripts/resync-staging-to-prod.sh   # files + DB
#
# Requires: SSH access to both hosts (run from a machine that can reach
# both), and staging able to SSH to prod (its pubkey in prod authorized_keys).
#
set -euo pipefail

# --- config (override via env) ---------------------------------------------
STAGING_SSH="${STAGING_SSH:-sancho-cmo-staging}"   # ssh alias for staging VPS
PROD_SSH="${PROD_SSH:-sancho-cmo-prod}"            # ssh alias for prod VPS
PROD_IP="${PROD_IP:-}"                # prod IP (rsync target from staging)
DRY_RUN="${DRY_RUN:-0}"
DO_RESTART="${DO_RESTART:-1}"                       # restart prod sanchocmo after sync

# Neon (only used if NEON_API_KEY is set)
NEON_PROJECT="${NEON_PROJECT:-}"
NEON_STAGING_BRANCH="${NEON_STAGING_BRANCH:-}"
NEON_PROD_BRANCH="${NEON_PROD_BRANCH:-}"

RS="-aH"
[ "$DRY_RUN" = "1" ] && RS="$RS --dry-run" && echo "### DRY RUN — no changes will be written ###"

echo "▶ [1/4] Building runtime file list on staging (gitignored + untracked, minus rebuildables)…"
# NOTE: workspace-sancho/brand/ is intentionally EXCLUDED here — it is
# mirrored with --delete in step [2b] so that files deleted on staging
# (e.g. a client reset from scratch) are also removed on prod. An additive
# file-list sync would leave stale client data behind on prod.
ssh -n "$STAGING_SSH" 'cd /root/.openclaw && {
    git ls-files --others --ignored --exclude-standard
    git ls-files --others --exclude-standard
  } | grep -vE "^(node_modules/|\.next/|backups/|\.git/|workspace-cervantes/|screenshots/|workspace-sancho/brand/)" \
    | grep -vE "(^|/)(node_modules|\.next)/" \
    | grep -vE "\.bak($|-)" \
    | grep -vE "^openclaw\.json" \
    | grep -vE "^(\.env|tsconfig\.tsbuildinfo|next-env\.d\.ts)$" \
    | sort -u > /tmp/resync-files.txt
  echo "  $(wc -l < /tmp/resync-files.txt) runtime files (brand/ synced separately)"'

echo "▶ [2/4] rsync runtime files staging → prod (additive: config, cron, agents, memory)…"
ssh -n "$STAGING_SSH" "rsync $RS --files-from=/tmp/resync-files.txt \
  -e 'ssh -o StrictHostKeyChecking=accept-new' \
  /root/.openclaw/ root@$PROD_IP:/root/.openclaw/"

echo "▶ [2b/4] MIRROR workspace-sancho/brand/ staging → prod (--delete: removes stale client data)…"
ssh -n "$STAGING_SSH" "rsync $RS --delete \
  -e 'ssh -o StrictHostKeyChecking=accept-new' \
  /root/.openclaw/workspace-sancho/brand/ root@$PROD_IP:/root/.openclaw/workspace-sancho/brand/"

echo "▶ [2c/4] rsync .openclaw/ gateway+agent state staging → prod (mirror)…"
ssh -n "$STAGING_SSH" "rsync $RS --delete \
  --exclude='node_modules/' --exclude='.next/' --exclude='npm/' \
  -e 'ssh -o StrictHostKeyChecking=accept-new' \
  /root/.openclaw/.openclaw/ root@$PROD_IP:/root/.openclaw/.openclaw/"

echo "▶ [3/4] Neon DB…"
if [ -n "${NEON_API_KEY:-}" ] && [ "$DRY_RUN" != "1" ]; then
  bk="production_pre_resync_$(date +%Y%m%d-%H%M%S)"
  curl -fsS -X POST \
    -H "Authorization: Bearer $NEON_API_KEY" -H "Content-Type: application/json" \
    "https://console.neon.tech/api/v2/projects/$NEON_PROJECT/branches/$NEON_PROD_BRANCH/restore" \
    -d "{\"source_branch_id\":\"$NEON_STAGING_BRANCH\",\"preserve_under_name\":\"$bk\"}" \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); print("  restored prod branch:", d.get("branch",{}).get("name","?"), "(backup:", "'"$bk"'"+")")'
else
  echo "  (skipped — set NEON_API_KEY and unset DRY_RUN to re-promote the DB)"
fi

echo "▶ [4/4] prod containers…"
if [ "$DO_RESTART" = "1" ] && [ "$DRY_RUN" != "1" ]; then
  ssh -n "$PROD_SSH" "cd /root/.openclaw && docker compose -f docker-compose.yml -f docker-compose.yalc.yml restart sanchocmo >/dev/null && echo '  sanchocmo restarted'"
else
  echo "  (skipped restart)"
fi

echo "✓ Re-sync complete."
