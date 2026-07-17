#!/usr/bin/env bash
# bootstrap-common.sh (SAN-485): the runtime-agnostic bootstrap that EVERY runtime
# (openclaw, hermes, external-http) must run before serving — the clients.json
# symlink + MC_BASE + MC_ADMIN_TOKEN + APIFY_TOKEN. Regression guard for the bug
# where hermes/external-http `exec`'d their boot scripts and skipped all of it
# (brand list empty, POST /api/clients/create → ENOENT 500). Pure bash — no docker.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BOOT="$ROOT/docker/bootstrap-common.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

[ -f "$BOOT" ] || { echo "FAIL: $BOOT missing"; exit 1; }

HOME_DIR="$TMP/home"
mkdir -p "$HOME_DIR/config" "$HOME_DIR/workspace-sancho"
cat > "$HOME_DIR/config/clients.json" <<'JSON'
{ "clients": [ { "slug": "my-brand" } ], "adminToken": "tok-abc123" }
JSON
echo "// clients" > "$HOME_DIR/config/clients.js"
echo '{}' > "$HOME_DIR/config/dispatch-map.json"

# Source it under `set -euo pipefail` (external-http's boot uses set -u) so an
# unbound-var slip fails the test. Capture the exports it makes.
out="$(BASE_URL="https://mc.example.com/" APIFY_API_KEY="apk-1" bash -c '
  set -euo pipefail
  . "'"$BOOT"'" "'"$HOME_DIR"'"
  echo "MC_BASE=${MC_BASE:-}"
  echo "MC_ADMIN_TOKEN=${MC_ADMIN_TOKEN:-}"
  echo "APIFY_TOKEN=${APIFY_TOKEN:-}"
  echo "MC_WORKSPACE=${MC_WORKSPACE:-}"
  echo "MC_NEXTJS_DIR=${MC_NEXTJS_DIR:-}"
')"

# 1. Config symlinks created, relative, and resolving to config/.
[ -L "$HOME_DIR/workspace-sancho/clients.json" ] || { echo "FAIL: clients.json not a symlink"; exit 1; }
[ "$(readlink "$HOME_DIR/workspace-sancho/clients.json")" = "../config/clients.json" ] \
  || { echo "FAIL: clients.json symlink target wrong: $(readlink "$HOME_DIR/workspace-sancho/clients.json")"; exit 1; }
[ -L "$HOME_DIR/workspace-sancho/clients.js" ]       || { echo "FAIL: clients.js not linked"; exit 1; }
[ -L "$HOME_DIR/workspace-sancho/dispatch-map.json" ] || { echo "FAIL: dispatch-map.json not linked"; exit 1; }
grep -q "my-brand" "$HOME_DIR/workspace-sancho/clients.json" \
  || { echo "FAIL: symlink does not resolve to clients.json content"; exit 1; }

# 2. Env derivations (MC_BASE trailing slash stripped; token from clients.json).
echo "$out" | grep -qx "MC_BASE=https://mc.example.com"  || { echo "FAIL: MC_BASE not derived/stripped -> $out"; exit 1; }
echo "$out" | grep -qx "MC_ADMIN_TOKEN=tok-abc123"       || { echo "FAIL: MC_ADMIN_TOKEN not derived -> $out"; exit 1; }
echo "$out" | grep -qx "APIFY_TOKEN=apk-1"               || { echo "FAIL: APIFY_TOKEN not derived -> $out"; exit 1; }
echo "$out" | grep -qx "MC_WORKSPACE=$HOME_DIR/workspace-sancho" \
  || { echo "FAIL: MC_WORKSPACE not derived from runtime home -> $out"; exit 1; }
echo "$out" | grep -qx "MC_NEXTJS_DIR=/app/mc-nextjs" \
  || { echo "FAIL: MC_NEXTJS_DIR default missing -> $out"; exit 1; }

# Explicit operator paths always win over bootstrap defaults.
override_out="$(MC_WORKSPACE=/custom/workspace MC_NEXTJS_DIR=/custom/app bash -c '
  set -euo pipefail
  . "'"$BOOT"'" "'"$HOME_DIR"'"
  echo "$MC_WORKSPACE|$MC_NEXTJS_DIR"
' | tail -n 1)"
[ "$override_out" = "/custom/workspace|/custom/app" ] \
  || { echo "FAIL: explicit workspace paths were overwritten -> $override_out"; exit 1; }

# 3. Idempotent: a second run neither errors nor loses the symlink.
BASE_URL="https://mc.example.com" bash -c 'set -euo pipefail; . "'"$BOOT"'" "'"$HOME_DIR"'"' >/dev/null 2>&1 \
  || { echo "FAIL: second run errored (not idempotent)"; exit 1; }
[ -L "$HOME_DIR/workspace-sancho/clients.json" ] || { echo "FAIL: symlink lost on rerun"; exit 1; }

# 4. No clients.json → no crash, no symlink invented (fresh pre-wizard home).
HOME2="$TMP/home2"; mkdir -p "$HOME2/config" "$HOME2/workspace-sancho"
BASE_URL="https://x.example" bash -c 'set -euo pipefail; . "'"$BOOT"'" "'"$HOME2"'"' >/dev/null 2>&1 \
  || { echo "FAIL: errored with no clients.json"; exit 1; }
[ ! -e "$HOME2/workspace-sancho/clients.json" ] || { echo "FAIL: invented a clients.json symlink with no source"; exit 1; }

echo "PASS: bootstrap-common"
