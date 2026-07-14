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
BASE_ENV=(WIZARD_ASSUME_YES=1 ANTHROPIC_API_KEY= ANTHROPIC_OAUTH_TOKEN= OPENAI_API_KEY=
          GOOGLE_CLIENT_ID= GOOGLE_CLIENT_SECRET= ENABLE_GOOGLE=no)

# --- 1. api_key mode: key written, subscription token blanked ---------------
sb="$(make_sandbox)"
env "${BASE_ENV[@]}" PROVIDER=anthropic ANTHROPIC_AUTH_MODE=api_key ANTHROPIC_API_KEY=sk-ant-realkey123 \
  bash "$sb/scripts/wizard.sh" >/dev/null 2>&1 || fail "api_key run exited non-zero"
grep -qE '^ANTHROPIC_API_KEY=sk-ant-realkey123$' "$sb/.env" || fail "api_key: ANTHROPIC_API_KEY not written"
grep -qE '^ANTHROPIC_OAUTH_TOKEN=$'               "$sb/.env" || fail "api_key: ANTHROPIC_OAUTH_TOKEN not blanked"
grep -qE '^ANTHROPIC_AUTH_MODE=api_key$'          "$sb/.env" || fail "api_key: auth mode wrong"

# --- 2. subscription mode: token written, API key blanked -------------------
sb="$(make_sandbox)"
env "${BASE_ENV[@]}" PROVIDER=anthropic ANTHROPIC_AUTH_MODE=subscription ANTHROPIC_OAUTH_TOKEN=sk-ant-oat-tok456 \
  bash "$sb/scripts/wizard.sh" >/dev/null 2>&1 || fail "subscription run exited non-zero"
grep -qE '^ANTHROPIC_OAUTH_TOKEN=sk-ant-oat-tok456$' "$sb/.env" || fail "subscription: token not written"
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
# Google login only exists in ADVANCED mode; quick keeps it off by design (see
# case 5b). Sin WIZARD_MODE=advanced este caso pasa trivialmente — quick blanquea
# las credenciales igual, sin probar nada.
sb="$(make_sandbox)"
env "${BASE_ENV[@]}" WIZARD_MODE=advanced PROVIDER=anthropic ANTHROPIC_AUTH_MODE=api_key ANTHROPIC_API_KEY=sk-ant-x ENABLE_GOOGLE=no \
  bash "$sb/scripts/wizard.sh" >/dev/null 2>&1 || fail "google-off run exited non-zero"
grep -qE '^GOOGLE_CLIENT_ID=$'     "$sb/.env" || fail "google-off: client id not empty"
grep -qE '^GOOGLE_CLIENT_SECRET=$' "$sb/.env" || fail "google-off: client secret not empty"
# No placeholder may survive into the generated .env.
if grep -qE 'sk-ant-\.\.\.' "$sb/.env"; then fail "placeholder 'sk-ant-...' survived in .env"; fi
if grep -qE 'your-google-'  "$sb/.env"; then fail "placeholder 'your-google-' survived in .env"; fi
# Admin token must be present in clients.json AND mirrored to .env.
grep -qE '"adminToken": *"[0-9a-f]{16,}"' "$sb/config/clients.json" || fail "clients.json adminToken missing"
grep -qE '^MC_ADMIN_TOKEN=[0-9a-f]{32,}$' "$sb/.env"                || fail "MC_ADMIN_TOKEN not mirrored to .env"

# --- 5. Google provided (advanced) → values written --------------------------
sb="$(make_sandbox)"
env "${BASE_ENV[@]}" WIZARD_MODE=advanced PROVIDER=anthropic ANTHROPIC_AUTH_MODE=api_key ANTHROPIC_API_KEY=sk-ant-x \
  ENABLE_GOOGLE=yes GOOGLE_CLIENT_ID=gid.apps.example GOOGLE_CLIENT_SECRET=gsecret \
  bash "$sb/scripts/wizard.sh" >/dev/null 2>&1 || fail "google-on run exited non-zero"
grep -qE '^GOOGLE_CLIENT_ID=gid\.apps\.example$' "$sb/.env" || fail "google-on: client id not written"
grep -qE '^GOOGLE_CLIENT_SECRET=gsecret$'        "$sb/.env" || fail "google-on: client secret not written"

# --- 5b. QUICK: sin pre-seed, Google queda apagado ---------------------------
# Quick nunca PREGUNTA por Google (eso es de advanced): sin nada en el entorno
# queda off y se entra con el admin token.
sb="$(make_sandbox)"
env "${BASE_ENV[@]}" WIZARD_MODE=quick PROVIDER=anthropic ANTHROPIC_AUTH_MODE=api_key ANTHROPIC_API_KEY=sk-ant-x \
  bash "$sb/scripts/wizard.sh" >/dev/null 2>&1 || fail "quick run exited non-zero"
grep -qE '^GOOGLE_CLIENT_ID=$'     "$sb/.env" || fail "quick: sin pre-seed Google debía quedar apagado"
grep -qE '^GOOGLE_CLIENT_SECRET=$' "$sb/.env" || fail "quick: sin pre-seed el secret debía quedar vacío"

# --- 5c. QUICK: un pre-seed explícito del entorno SÍ se honra ----------------
# Misma regla que YALC/OD, que el wizard ya aplica: "an explicit env value always
# wins". Antes Google era la excepción y se descartaba en silencio. (SAN-461)
sb="$(make_sandbox)"
env "${BASE_ENV[@]}" WIZARD_MODE=quick PROVIDER=anthropic ANTHROPIC_AUTH_MODE=api_key ANTHROPIC_API_KEY=sk-ant-x \
  ENABLE_GOOGLE=yes GOOGLE_CLIENT_ID=gid.apps.example GOOGLE_CLIENT_SECRET=gsecret \
  bash "$sb/scripts/wizard.sh" >/dev/null 2>&1 || fail "quick+google run exited non-zero"
grep -qE '^GOOGLE_CLIENT_ID=gid\.apps\.example$' "$sb/.env" || fail "quick: no honró el GOOGLE_CLIENT_ID pre-seedeado"
grep -qE '^GOOGLE_CLIENT_SECRET=gsecret$'        "$sb/.env" || fail "quick: no honró el GOOGLE_CLIENT_SECRET pre-seedeado"
grep -qE '^ANTHROPIC_API_KEY=sk-ant-x$'          "$sb/.env" || fail "quick: la credencial del proveedor no se honró"

# --- 5d. QUICK: pre-seed INCOMPLETO → off, no habilitar con creds rotas ------
# NextAuth prende Google si ambas son no vacías; media credencial daría
# invalid_client en el login. Mejor off. (SAN-461)
sb="$(make_sandbox)"
env "${BASE_ENV[@]}" WIZARD_MODE=quick PROVIDER=anthropic ANTHROPIC_AUTH_MODE=api_key ANTHROPIC_API_KEY=sk-ant-x \
  ENABLE_GOOGLE=yes GOOGLE_CLIENT_ID=gid.apps.example \
  bash "$sb/scripts/wizard.sh" >/dev/null 2>&1 || fail "quick+google incompleto exited non-zero"
grep -qE '^GOOGLE_CLIENT_ID=$'     "$sb/.env" || fail "quick: pre-seed incompleto debía dejar Google off"
grep -qE '^GOOGLE_CLIENT_SECRET=$' "$sb/.env" || fail "quick: pre-seed incompleto debía dejar el secret vacío"

# --- 6. clobber guard: existing config + no --force (non-interactive) aborts -
sb="$(make_sandbox)"
: > "$sb/.env"   # pre-existing config the wizard must not silently overwrite
if env "${BASE_ENV[@]}" PROVIDER=anthropic ANTHROPIC_AUTH_MODE=api_key ANTHROPIC_API_KEY=sk-ant-x \
     bash "$sb/scripts/wizard.sh" >"$sb/out.log" 2>&1; then
  fail "wizard should abort on existing .env without --force (non-interactive)"
fi
grep -q "Refusing to overwrite" "$sb/out.log" || fail "missing 'Refusing to overwrite' message"
# --force lets it through. El .env preexistente NO tiene MC_CHAT_SECRET — que es
# el caso de cualquier install anterior a SAN-443. El wizard lo relee para no
# rotar el pairing del gateway, y bajo `set -euo pipefail` un grep sin match
# mataba el script acá (SAN-457).
env "${BASE_ENV[@]}" PROVIDER=anthropic ANTHROPIC_AUTH_MODE=api_key ANTHROPIC_API_KEY=sk-ant-x \
  bash "$sb/scripts/wizard.sh" --force >/dev/null 2>&1 || fail "--force should overwrite existing config"
grep -qE '^ANTHROPIC_API_KEY=sk-ant-x$' "$sb/.env" || fail "--force did not regenerate .env"
# Sin MC_CHAT_SECRET previo se acuña uno nuevo (si no, el primer chat da 503).
grep -qE '^MC_CHAT_SECRET=[0-9a-f]{16,}$' "$sb/.env" || fail "--force: MC_CHAT_SECRET no se generó"

# --- 6 (cont.). --force con clients.json SIN adminToken ----------------------
# Misma causa que arriba (SAN-457): el wizard relee adminToken del clients.json
# preservado, y el grep sin match mataba el script bajo pipefail.
sb="$(make_sandbox)"
mkdir -p "$sb/config"
printf '{"clients":[{"slug":"acme"}]}\n' > "$sb/config/clients.json"
env "${BASE_ENV[@]}" PROVIDER=anthropic ANTHROPIC_AUTH_MODE=api_key ANTHROPIC_API_KEY=sk-ant-x \
  bash "$sb/scripts/wizard.sh" --force >/dev/null 2>&1 || fail "--force murió con un clients.json sin adminToken"
grep -qE '^MC_ADMIN_TOKEN=[0-9a-f]{32,}$' "$sb/.env" || fail "--force: no se acuñó admin token faltante"

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
#
# El primer \n contesta el prompt de "Setup mode" (quick), el segundo el de
# "Provider" (anthropic). Si agregás un prompt ANTES del de provider, corré uno
# más acá — si no, las respuestas se desfasan y el wizard aborta pidiendo la
# API key (que es como se pudrió este caso cuando se sumaron los modos).
if command -v python3 >/dev/null 2>&1; then
  sb="$(make_sandbox)"
  PTY_SB="$sb" python3 - <<'PY' || fail "interactive subscription run failed"
import pty, os, sys
sb = os.environ["PTY_SB"]
env = {"PATH": os.environ["PATH"], "HOME": os.environ["HOME"], "TERM": "xterm"}
# Enter(mode=quick), Enter(provider=anthropic), "subscription", token, defaults.
data = b"\n\nsubscription\nsk-ant-oat-ITEST\n" + b"\n"*9
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
  grep -qE '^ANTHROPIC_OAUTH_TOKEN=sk-ant-oat-ITEST$' "$sb/.env" || fail "interactive: token not written"
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
