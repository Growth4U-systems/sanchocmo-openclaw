#!/usr/bin/env bash
# ============================================================================
# wizard.test.sh — the setup wizard leaves a complete, placeholder-free config.
#
# Drives scripts/wizard.sh non-interactively (WIZARD_ASSUME_YES=1 + answers via
# env) inside an isolated sandbox (a temp copy of scripts/wizard.sh + .env.example
# so it writes .env/config there, never into the repo), and asserts on the
# generated .env / config/clients.json.
# ============================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

fail() { echo "FAIL: $*"; exit 1; }

SANDBOXES=()
# Must not influence the script's exit status (it runs as the EXIT trap, whose
# last command would otherwise become the shell's exit code).
cleanup() { local d; for d in "${SANDBOXES[@]:-}"; do [ -n "${d:-}" ] && rm -rf "$d"; done; return 0; }
trap cleanup EXIT

# make_sandbox : prints a fresh dir holding scripts/wizard.sh + .env.example.
make_sandbox() {
  local sb; sb="$(mktemp -d)"
  SANDBOXES+=("$sb")
  mkdir -p "$sb/scripts"
  cp "$ROOT/scripts/wizard.sh" "$sb/scripts/wizard.sh"
  cp "$ROOT/.env.example" "$sb/.env.example"
  printf '%s' "$sb"
}

# Common non-tested vars are passed explicitly empty so an inherited shell
# environment can't leak a real credential into the assertions.
BASE_ENV=(WIZARD_ASSUME_YES=1 ANTHROPIC_API_KEY= CLAUDE_CODE_OAUTH_TOKEN= OPENAI_API_KEY=
          GOOGLE_CLIENT_ID= GOOGLE_CLIENT_SECRET= ENABLE_GOOGLE=no)

# --- 1. api_key mode: key written, subscription token blanked ---------------
sb="$(make_sandbox)"
env "${BASE_ENV[@]}" PROVIDER=anthropic ANTHROPIC_AUTH_MODE=api_key ANTHROPIC_API_KEY=sk-ant-realkey123 \
  bash "$sb/scripts/wizard.sh" >/dev/null 2>&1 || fail "api_key run exited non-zero"
grep -qE '^ANTHROPIC_API_KEY=sk-ant-realkey123$' "$sb/.env" || fail "api_key: ANTHROPIC_API_KEY not written"
grep -qE '^CLAUDE_CODE_OAUTH_TOKEN=$'             "$sb/.env" || fail "api_key: CLAUDE_CODE_OAUTH_TOKEN not blanked"
grep -qE '^ANTHROPIC_AUTH_MODE=api_key$'          "$sb/.env" || fail "api_key: auth mode wrong"

# --- 2. subscription mode: token written, API key blanked -------------------
sb="$(make_sandbox)"
env "${BASE_ENV[@]}" PROVIDER=anthropic ANTHROPIC_AUTH_MODE=subscription CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat-tok456 \
  bash "$sb/scripts/wizard.sh" >/dev/null 2>&1 || fail "subscription run exited non-zero"
grep -qE '^CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat-tok456$' "$sb/.env" || fail "subscription: token not written"
grep -qE '^ANTHROPIC_API_KEY=$'                        "$sb/.env" || fail "subscription: API key not blanked"
grep -qE '^ANTHROPIC_AUTH_MODE=subscription$'          "$sb/.env" || fail "subscription: auth mode wrong"

# --- 3. missing required model credential → abort non-zero ------------------
sb="$(make_sandbox)"
if env "${BASE_ENV[@]}" PROVIDER=anthropic ANTHROPIC_AUTH_MODE=api_key \
     bash "$sb/scripts/wizard.sh" >/dev/null 2>&1; then
  fail "wizard should abort when no model credential is provided"
fi
[ -f "$sb/.env" ] && fail "wizard wrote .env despite aborting on missing credential"

# --- 4. Google skipped → empty (not placeholder) ----------------------------
sb="$(make_sandbox)"
env "${BASE_ENV[@]}" PROVIDER=anthropic ANTHROPIC_AUTH_MODE=api_key ANTHROPIC_API_KEY=sk-ant-x ENABLE_GOOGLE=no \
  bash "$sb/scripts/wizard.sh" >/dev/null 2>&1 || fail "google-off run exited non-zero"
grep -qE '^GOOGLE_CLIENT_ID=$'     "$sb/.env" || fail "google-off: client id not empty"
grep -qE '^GOOGLE_CLIENT_SECRET=$' "$sb/.env" || fail "google-off: client secret not empty"
# No placeholder may survive into the generated .env.
if grep -qE 'sk-ant-\.\.\.' "$sb/.env"; then fail "placeholder 'sk-ant-...' survived in .env"; fi
if grep -qE 'your-google-'  "$sb/.env"; then fail "placeholder 'your-google-' survived in .env"; fi
# Admin token must be present in clients.json AND mirrored to .env.
grep -qE '"adminToken": *"[0-9a-f]{16,}"' "$sb/config/clients.json" || fail "clients.json adminToken missing"
grep -qE '^MC_ADMIN_TOKEN=[0-9a-f]{32,}$' "$sb/.env"                || fail "MC_ADMIN_TOKEN not mirrored to .env"

# --- 5. Google provided → values written ------------------------------------
sb="$(make_sandbox)"
env "${BASE_ENV[@]}" PROVIDER=anthropic ANTHROPIC_AUTH_MODE=api_key ANTHROPIC_API_KEY=sk-ant-x \
  ENABLE_GOOGLE=yes GOOGLE_CLIENT_ID=gid.apps.example GOOGLE_CLIENT_SECRET=gsecret \
  bash "$sb/scripts/wizard.sh" >/dev/null 2>&1 || fail "google-on run exited non-zero"
grep -qE '^GOOGLE_CLIENT_ID=gid\.apps\.example$' "$sb/.env" || fail "google-on: client id not written"
grep -qE '^GOOGLE_CLIENT_SECRET=gsecret$'        "$sb/.env" || fail "google-on: client secret not written"

# --- 6. clobber guard: existing config + no --force (non-interactive) aborts -
sb="$(make_sandbox)"
: > "$sb/.env"   # pre-existing config the wizard must not silently overwrite
if env "${BASE_ENV[@]}" PROVIDER=anthropic ANTHROPIC_AUTH_MODE=api_key ANTHROPIC_API_KEY=sk-ant-x \
     bash "$sb/scripts/wizard.sh" >"$sb/out.log" 2>&1; then
  fail "wizard should abort on existing .env without --force (non-interactive)"
fi
grep -q "Refusing to overwrite" "$sb/out.log" || fail "missing 'Refusing to overwrite' message"
# --force lets it through.
env "${BASE_ENV[@]}" PROVIDER=anthropic ANTHROPIC_AUTH_MODE=api_key ANTHROPIC_API_KEY=sk-ant-x \
  bash "$sb/scripts/wizard.sh" --force >/dev/null 2>&1 || fail "--force should overwrite existing config"
grep -qE '^ANTHROPIC_API_KEY=sk-ant-x$' "$sb/.env" || fail "--force did not regenerate .env"

# --- 6b. Open Design opt-in: off → no token; on → token minted + web URL -----
# Off (default): the wizard must not write a live OD_API_TOKEN, so install.sh
# leaves the overlay down (the .env.example entry stays commented).
sb="$(make_sandbox)"
env "${BASE_ENV[@]}" PROVIDER=anthropic ANTHROPIC_AUTH_MODE=api_key ANTHROPIC_API_KEY=sk-ant-x ENABLE_OD=no \
  bash "$sb/scripts/wizard.sh" >/dev/null 2>&1 || fail "od-off run exited non-zero"
if grep -qE '^OD_API_TOKEN=.+' "$sb/.env"; then fail "od-off: OD_API_TOKEN should be absent/empty"; fi
# On: self-provision the bearer token and record the browser URL.
sb="$(make_sandbox)"
env "${BASE_ENV[@]}" PROVIDER=anthropic ANTHROPIC_AUTH_MODE=api_key ANTHROPIC_API_KEY=sk-ant-x \
  ENABLE_OD=yes OD_WEB_URL=http://localhost:7456 \
  bash "$sb/scripts/wizard.sh" >/dev/null 2>&1 || fail "od-on run exited non-zero"
grep -qE '^OD_API_TOKEN=[0-9a-f]{32,}$'        "$sb/.env" || fail "od-on: OD_API_TOKEN not minted"
grep -qE '^OD_WEB_URL=http://localhost:7456$'  "$sb/.env" || fail "od-on: OD_WEB_URL not written"
grep -qE '^OD_ALLOWED_ORIGINS=http://localhost:7456$' "$sb/.env" || fail "od-on: OD_ALLOWED_ORIGINS not written"

# --- 7. INTERACTIVE: the auth-mode prompt is actually asked (regression) -----
# Guards the bug where pre-seeding ANTHROPIC_AUTH_MODE to a default made `ask`
# treat the question as answered and skip straight to the API key, so picking
# subscription was impossible interactively. Needs a pty; skip if no python3.
if command -v python3 >/dev/null 2>&1; then
  sb="$(make_sandbox)"
  PTY_SB="$sb" python3 - <<'PY' || fail "interactive subscription run failed"
import pty, os, sys
sb = os.environ["PTY_SB"]
env = {"PATH": os.environ["PATH"], "HOME": os.environ["HOME"], "TERM": "xterm"}
# Enter(provider=anthropic), "subscription", token, then defaults for the rest.
data = b"\nsubscription\nsk-ant-oat-ITEST\n" + b"\n"*9
pid, fd = pty.fork()
if pid == 0:
    os.chdir(sb); os.execvpe("bash", ["bash", "scripts/wizard.sh"], env)
os.write(fd, data)
try:
    while os.read(fd, 4096): pass
except OSError:
    pass
_, st = os.waitpid(pid, 0)
sys.exit(os.waitstatus_to_exitcode(st))
PY
  grep -qE '^ANTHROPIC_AUTH_MODE=subscription$'        "$sb/.env" || fail "interactive: subscription not selected (prompt skipped?)"
  grep -qE '^CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat-ITEST$' "$sb/.env" || fail "interactive: token not written"
  grep -qE '^ANTHROPIC_API_KEY=$'                       "$sb/.env" || fail "interactive: API key not blanked"
else
  echo "  (skipping interactive pty test — python3 not found)"
fi

# --- 8. local DB password is preserved across re-runs (--force) --------------
# Regenerating POSTGRES_PASSWORD desyncs from the already-initialized
# postgres_data volume ("password authentication failed for user sancho").
sb="$(make_sandbox)"
env "${BASE_ENV[@]}" PROVIDER=anthropic ANTHROPIC_AUTH_MODE=api_key ANTHROPIC_API_KEY=sk-ant-x DB_MODE=local \
  bash "$sb/scripts/wizard.sh" >/dev/null 2>&1 || fail "db first run exited non-zero"
pw1="$(grep -E '^POSTGRES_PASSWORD=' "$sb/.env" | head -1 | cut -d= -f2-)"
[ -n "$pw1" ] || fail "db: POSTGRES_PASSWORD not written on first run"
env "${BASE_ENV[@]}" PROVIDER=anthropic ANTHROPIC_AUTH_MODE=api_key ANTHROPIC_API_KEY=sk-ant-x DB_MODE=local \
  bash "$sb/scripts/wizard.sh" --force >/dev/null 2>&1 || fail "db --force re-run exited non-zero"
pw2="$(grep -E '^POSTGRES_PASSWORD=' "$sb/.env" | head -1 | cut -d= -f2-)"
[ "$pw1" = "$pw2" ] || fail "db: POSTGRES_PASSWORD changed on --force (was $pw1, now $pw2)"
grep -qF "postgres://sancho:${pw2}@postgres:5432/sancho" "$sb/.env" || fail "db: DATABASE_URL out of sync with POSTGRES_PASSWORD"

# --- 9. clients.json brands + adminToken preserved across --force re-run -----
# clients.json is the brand registry (stateful, like the local DB volume). A
# --force re-run must not drop brands added after install nor rotate the
# admin/login token out from under live sessions.
sb="$(make_sandbox)"
env "${BASE_ENV[@]}" PROVIDER=anthropic ANTHROPIC_AUTH_MODE=api_key ANTHROPIC_API_KEY=sk-ant-x \
  bash "$sb/scripts/wizard.sh" >/dev/null 2>&1 || fail "clients first run exited non-zero"
# Simulate brands added after install (second entry) + a known adminToken.
cat > "$sb/config/clients.json" <<'JSON'
{
  "$schema": "clients.schema.json",
  "clients": [
    { "slug": "acme",   "name": "Acme",   "mcToken": "tok-acme" },
    { "slug": "globex", "name": "Globex", "mcToken": "tok-globex" }
  ],
  "adminToken": "deadbeefdeadbeefdeadbeefdeadbeef",
  "adminEmails": []
}
JSON
env "${BASE_ENV[@]}" PROVIDER=anthropic ANTHROPIC_AUTH_MODE=api_key ANTHROPIC_API_KEY=sk-ant-x \
  bash "$sb/scripts/wizard.sh" --force >/dev/null 2>&1 || fail "clients --force re-run exited non-zero"
grep -q '"slug": *"acme"'   "$sb/config/clients.json" || fail "clients: acme brand dropped on --force"
grep -q '"slug": *"globex"' "$sb/config/clients.json" || fail "clients: globex brand dropped on --force"
grep -q '"adminToken": *"deadbeefdeadbeefdeadbeefdeadbeef"' "$sb/config/clients.json" \
  || fail "clients: adminToken rotated on --force (registry clobbered)"
# The .env mirror must match the PRESERVED token, not a freshly minted one.
grep -qE '^MC_ADMIN_TOKEN=deadbeefdeadbeefdeadbeefdeadbeef$' "$sb/.env" \
  || fail "clients: MC_ADMIN_TOKEN not synced to the preserved adminToken"

echo "PASS"
exit 0
