#!/usr/bin/env bash
# init-home.sh seeding: first-run seed, idempotency, and SAN-329 self-heal of a
# partial/interrupted seed. Pure bash + cp — no docker needed.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INIT="$ROOT/docker/init-home.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Fake seed image: a framework dir + data dirs the loop knows about.
SEED="$TMP/seed"
mkdir -p "$SEED/skills" "$SEED/workspace-sancho/scripts" "$SEED/config" "$SEED/agents"
echo "v1" > "$SEED/.seed-version"
echo "skill" > "$SEED/skills/seo.md"
echo "server" > "$SEED/workspace-sancho/scripts/mc-server.js"
echo "brand" > "$SEED/workspace-sancho/DESIGN.md"
echo "cfg" > "$SEED/config/clients.json"

run_init() { SANCHO_SEED_DIR="$SEED" bash "$INIT" "$1" >/dev/null 2>&1; }

# Caso A: home vacío → siembra completa.
HOME_A="$TMP/home-a"; mkdir -p "$HOME_A"
run_init "$HOME_A"
[ -f "$HOME_A/workspace-sancho/scripts/mc-server.js" ] || { echo "FAIL A: no sembró scripts/mc-server.js"; exit 1; }
[ -f "$HOME_A/.sancho-seed-state/workspace-sancho" ] || { echo "FAIL A: no marcó workspace-sancho completo"; exit 1; }

# Caso B: idempotencia → re-correr no rompe ni duplica, y respeta ediciones del usuario.
echo "user-edit" > "$HOME_A/workspace-sancho/DESIGN.md"
run_init "$HOME_A"
[ "$(cat "$HOME_A/workspace-sancho/DESIGN.md")" = "user-edit" ] || { echo "FAIL B: pisó dato de usuario"; exit 1; }

# Caso C (SAN-329): seed PARCIAL de un boot interrumpido (existe el dir, falta scripts/
# y NO hay marker) → debe auto-completar sin pisar lo existente.
HOME_C="$TMP/home-c"; mkdir -p "$HOME_C/workspace-sancho"
echo "partial-user" > "$HOME_C/workspace-sancho/DESIGN.md"   # quedó del boot interrumpido
# (sin scripts/, sin marker) — el viejo comportamiento lo dejaba clavado para siempre.
run_init "$HOME_C"
[ -f "$HOME_C/workspace-sancho/scripts/mc-server.js" ] || { echo "FAIL C: no auto-completó scripts/ (wedge SAN-329)"; exit 1; }
[ "$(cat "$HOME_C/workspace-sancho/DESIGN.md")" = "partial-user" ] || { echo "FAIL C: el self-heal pisó dato de usuario"; exit 1; }
[ -f "$HOME_C/.sancho-seed-state/workspace-sancho" ] || { echo "FAIL C: no marcó completo tras el heal"; exit 1; }

# Caso D: home git-checkout (.git presente) → se saltea el seed por completo (SAN-146).
HOME_D="$TMP/home-d"; mkdir -p "$HOME_D/.git"
run_init "$HOME_D"
[ ! -e "$HOME_D/workspace-sancho" ] || { echo "FAIL D: sembró sobre un checkout git"; exit 1; }

# Caso E: limpia temp dirs abandonados por una copia previa que murió.
HOME_E="$TMP/home-e"; mkdir -p "$HOME_E/.seed-tmp.workspace-sancho.999/junk"
run_init "$HOME_E"
[ ! -e "$HOME_E/.seed-tmp.workspace-sancho.999" ] || { echo "FAIL E: no limpió temp abandonado"; exit 1; }
[ -f "$HOME_E/workspace-sancho/scripts/mc-server.js" ] || { echo "FAIL E: no sembró tras limpiar temp"; exit 1; }

echo "PASS"
