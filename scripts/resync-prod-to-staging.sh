#!/usr/bin/env bash
#
# Re-sync live client data PROD → STAGING (files [+ DB] [+ agent state]).
#
# Pulls production's per-client documents/context into THIS staging instance
# so new features can be validated against real data before they ship to prod.
#
# It runs ON staging and PULLS from prod: every rsync source is remote (prod,
# read-only) and every destination is a LOCAL staging path. It can never write
# to production. A staging backup is taken before anything is overwritten.
#
# Modes (env MODE, default A):
#   A  files only      — workspace-sancho/brand/*  (Markdown + context)
#   B  A + database    — restore the staging Neon branch FROM the prod branch
#   C  B + agent state — .openclaw/ gateway+agent state, EXCLUDING
#                        credentials / sessions / OAuth tokens ("C-safe", so
#                        staging can never act on real client accounts).
#
# ⚠️ DIRECTION IS PROD → STAGING (mirrors staging's brand/ to match prod).
#    Safe because staging is disposable; a tarball backup is taken first.
#
# Usage (normally invoked by POST /api/system/sync-prod-to-staging):
#   MODE=A bash scripts/resync-prod-to-staging.sh
#   MODE=B NEON_API_KEY=napi_xxx bash scripts/resync-prod-to-staging.sh
#   DRY_RUN=1 MODE=C bash scripts/resync-prod-to-staging.sh
#
# Prerequisites on the staging host/container:
#   - rsync + openssh-client installed (the app image ships both)
#   - SSH key authorized on prod (the staging→prod key already used by the
#     reverse script), reachable as root@$PROD_IP
#   - NEON_API_KEY in env for modes B/C (otherwise the DB step is skipped)
#
set -euo pipefail

MODE="${MODE:-A}"
DRY_RUN="${DRY_RUN:-0}"
SYNC_ID="${SYNC_ID:-manual-$(date -u +%Y%m%dT%H%M%SZ)}"
STATUS_FILE="${STATUS_FILE:-}"

# --- final-status writer (consumed by the status endpoint) ------------------
write_status() {
  [ -n "$STATUS_FILE" ] || return 0
  printf '{"syncId":"%s","mode":"%s","state":"%s","finishedAt":"%s"}\n' \
    "$SYNC_ID" "$MODE" "$1" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STATUS_FILE" || true
}
trap 'write_status failed' ERR

# --- SAFETY GATE: refuse to run unless this is unmistakably staging ---------
# The endpoint passes ENV_LABEL from NEXT_PUBLIC_ENV_LABEL; prod ships it empty.
ENV_LABEL="${ENV_LABEL:-${NEXT_PUBLIC_ENV_LABEL:-}}"
if [ -z "$ENV_LABEL" ]; then
  echo "✗ Refusing to run: ENV_LABEL is empty — this looks like PRODUCTION." >&2
  echo "  prod→staging only runs on staging and never writes to prod." >&2
  write_status failed
  exit 2
fi
case "$(printf '%s' "$ENV_LABEL" | tr '[:lower:]' '[:upper:]')" in
  *PROD*) echo "✗ Refusing to run: ENV_LABEL='$ENV_LABEL' looks like production." >&2; write_status failed; exit 2 ;;
esac

case "$MODE" in A|B|C) ;; *) echo "✗ Invalid MODE='$MODE' (expected A, B or C)" >&2; write_status failed; exit 2 ;; esac

# --- config (override via env) ----------------------------------------------
PROD_IP="${PROD_IP:-}"            # prod VPS (rsync source)
SSH_OPTS="${SSH_OPTS:--o StrictHostKeyChecking=accept-new -o ConnectTimeout=15}"
OPENCLAW_HOME="${OPENCLAW_HOME:-/root/.openclaw}"
WORKSPACE="${MC_WORKSPACE:-$OPENCLAW_HOME/workspace-sancho}"
BRAND_DIR="$WORKSPACE/brand"                    # local (staging) destination
STATE_DIR="$OPENCLAW_HOME/.openclaw"            # local gateway + agent state (mode C)
# Remote (prod) SOURCE paths are FIXED to prod's canonical layout, independent
# of any local MC_WORKSPACE / OPENCLAW_HOME override on staging (so overriding
# the local workspace can never repoint the remote pull at a missing path).
PROD_OPENCLAW_HOME="${PROD_OPENCLAW_HOME:-/root/.openclaw}"
PROD_BRAND_DIR="${PROD_BRAND_DIR:-$PROD_OPENCLAW_HOME/workspace-sancho/brand}"
PROD_STATE_DIR="${PROD_STATE_DIR:-$PROD_OPENCLAW_HOME/.openclaw}"

# Neon (modes B/C). Defaults mirror scripts/resync-staging-to-prod.sh.
NEON_PROJECT="${NEON_PROJECT:-}"
NEON_STAGING_BRANCH="${NEON_STAGING_BRANCH:-}"
NEON_PROD_BRANCH="${NEON_PROD_BRANCH:-}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BK_DIR="$OPENCLAW_HOME/backups"

RS="-aH --itemize-changes"
[ "$DRY_RUN" = "1" ] && RS="$RS --dry-run" && echo "### DRY RUN — no changes will be written ###"

# Never pulled: secrets, env-specific files, rebuildables, junk.
EXCLUDES=(
  --exclude='.env' --exclude='*.env' --exclude='.env.*'
  --exclude='*.bak' --exclude='*.broken-backup' --exclude='*.review-*'
  --exclude='node_modules/' --exclude='.next/' --exclude='.git/'
)
# Credential / session / OAuth stores — excluded EVEN in mode C ("C-safe").
# With rsync, an --exclude'd path is also protected from --delete, so
# staging keeps its OWN auth and never inherits prod's live tokens.
CRED_EXCLUDES=(
  --exclude='auth-state.json' --exclude='auth-profiles.json'
  --exclude='auth/' --exclude='oauth*' --exclude='*.token'
  --exclude='*credentials*' --exclude='openclaw.json' --exclude='npm/'
)

echo "▶ prod→staging sync starting — mode=$MODE id=$SYNC_ID ($STAMP)"
echo "  source prod=$PROD_IP  →  local brand=$BRAND_DIR"

# --- [1] backup staging brand BEFORE overwrite ------------------------------
if [ "$DRY_RUN" != "1" ] && [ -d "$BRAND_DIR" ]; then
  mkdir -p "$BK_DIR"
  echo "▶ [1/4] backing up staging brand → $BK_DIR/brand-pre-prodsync-$STAMP.tgz"
  tar -czf "$BK_DIR/brand-pre-prodsync-$STAMP.tgz" -C "$WORKSPACE" brand \
    || echo "  (warning: backup failed; continuing)"
else
  echo "▶ [1/4] backup skipped (dry-run or no brand dir yet)"
fi

# --- [2] MIRROR brand/ prod → staging (--delete removes stale staging data) -
echo "▶ [2/4] rsync brand/ prod → staging (mirror)"
rsync $RS --delete "${EXCLUDES[@]}" \
  -e "ssh $SSH_OPTS" \
  "root@$PROD_IP:$PROD_BRAND_DIR/" "$BRAND_DIR/"

# --- [3] Neon DB restore (modes B/C): staging branch ← prod branch ----------
if [ "$MODE" = "B" ] || [ "$MODE" = "C" ]; then
  if [ -n "${NEON_API_KEY:-}" ] && [ "$DRY_RUN" != "1" ]; then
    bk="staging_pre_prodsync_$STAMP"
    echo "▶ [3/4] Neon restore: staging branch ← prod branch (backup: $bk)"
    curl -fsS -X POST \
      -H "Authorization: Bearer $NEON_API_KEY" -H "Content-Type: application/json" \
      "https://console.neon.tech/api/v2/projects/$NEON_PROJECT/branches/$NEON_STAGING_BRANCH/restore" \
      -d "{\"source_branch_id\":\"$NEON_PROD_BRANCH\",\"preserve_under_name\":\"$bk\"}" >/dev/null
    echo "  staging Neon branch restored from prod"
  else
    echo "▶ [3/4] Neon restore skipped (set NEON_API_KEY and unset DRY_RUN to run)"
  fi
else
  echo "▶ [3/4] DB step not requested (mode $MODE)"
fi

# --- [4] agent state (mode C, credential-safe; additive, no --delete) -------
if [ "$MODE" = "C" ]; then
  echo "▶ [4/4] rsync .openclaw/ agent state prod → staging (C-safe: no creds/tokens)"
  rsync $RS "${EXCLUDES[@]}" "${CRED_EXCLUDES[@]}" \
    -e "ssh $SSH_OPTS" \
    "root@$PROD_IP:$PROD_STATE_DIR/" "$STATE_DIR/"
else
  echo "▶ [4/4] agent-state step not requested (mode $MODE)"
fi

echo "✓ prod→staging sync complete — mode=$MODE id=$SYNC_ID"
write_status ok
