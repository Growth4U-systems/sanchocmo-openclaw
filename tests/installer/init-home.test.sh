#!/usr/bin/env bash
# init-home.sh seeding: first-run seed, idempotency, and SAN-329 self-heal of a
# partial/interrupted seed. Pure bash + cp — no docker needed.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INIT="$ROOT/docker/init-home.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Fake seed image: a framework dir + data dirs the loop knows about.
# Note (SAN-464): user data inside a workspace is modelled as a file the seed does
# NOT carry (brand/…), because that is the only shape it can have in reality —
# everything the image ships inside workspace-*/ is framework by definition.
SEED="$TMP/seed"
mkdir -p "$SEED/skills" "$SEED/workspace-sancho/scripts" "$SEED/config" "$SEED/agents"
echo "v1" > "$SEED/.seed-version"
echo "skill" > "$SEED/skills/seo.md"
echo "server" > "$SEED/workspace-sancho/scripts/mc-server.js"
echo "cfg" > "$SEED/config/clients.json"

run_init() { SANCHO_SEED_DIR="$SEED" bash "$INIT" "$1" >/dev/null 2>&1; }

# Caso A: home vacío → siembra completa.
HOME_A="$TMP/home-a"; mkdir -p "$HOME_A"
run_init "$HOME_A"
[ -f "$HOME_A/workspace-sancho/scripts/mc-server.js" ] || { echo "FAIL A: no sembró scripts/mc-server.js"; exit 1; }
# El marker de completitud es del loop data-bearing. workspace-* salió de ese loop
# en SAN-464 (ahora lo cubre el refresh gateado por .sancho-seed-version), así que
# se comprueba sobre config/, que sigue ahí.
[ -f "$HOME_A/.sancho-seed-state/config" ] || { echo "FAIL A: no marcó config completo"; exit 1; }
[ -f "$HOME_A/.sancho-seed-version" ] || { echo "FAIL A: no escribió el marker de versión del seed"; exit 1; }

# Caso B: idempotencia → re-correr no rompe ni duplica, y respeta datos del usuario.
mkdir -p "$HOME_A/workspace-sancho/brand"
echo "user-edit" > "$HOME_A/workspace-sancho/brand/cliente-demo.md"   # no viaja en el seed
echo "user-cfg"  > "$HOME_A/config/clients.json"                  # dir data-bearing
run_init "$HOME_A"
[ "$(cat "$HOME_A/workspace-sancho/brand/cliente-demo.md")" = "user-edit" ] || { echo "FAIL B: pisó dato de usuario"; exit 1; }
[ "$(cat "$HOME_A/config/clients.json")" = "user-cfg" ] || { echo "FAIL B: pisó config del usuario"; exit 1; }

# Caso C (SAN-329): seed PARCIAL de un boot interrumpido (existe el dir, falta scripts/
# y NO hay marker) → debe auto-completar sin pisar los datos del usuario.
# Tras SAN-464 quien lo recupera es el refresh de framework (el home no tiene
# .sancho-seed-version, así que "none" != "v1" y se rehace la copia entera), pero la
# propiedad que SAN-329 protege es la misma: un boot matado a mitad no queda clavado.
HOME_C="$TMP/home-c"; mkdir -p "$HOME_C/workspace-sancho/brand" "$HOME_C/config"
echo "partial-user" > "$HOME_C/workspace-sancho/brand/cliente-demo.md"  # quedó del boot interrumpido
echo "partial-cfg"  > "$HOME_C/config/clients.json"
# (sin scripts/, sin marker) — el viejo comportamiento lo dejaba clavado para siempre.
run_init "$HOME_C"
[ -f "$HOME_C/workspace-sancho/scripts/mc-server.js" ] || { echo "FAIL C: no auto-completó scripts/ (wedge SAN-329)"; exit 1; }
[ "$(cat "$HOME_C/workspace-sancho/brand/cliente-demo.md")" = "partial-user" ] || { echo "FAIL C: el self-heal pisó dato de usuario"; exit 1; }
[ "$(cat "$HOME_C/config/clients.json")" = "partial-cfg" ] || { echo "FAIL C: el self-heal pisó config del usuario"; exit 1; }
[ -f "$HOME_C/.sancho-seed-state/config" ] || { echo "FAIL C: no marcó config completo tras el heal"; exit 1; }

# Caso D: home git-checkout (.git presente) → se saltea el seed por completo (SAN-146).
HOME_D="$TMP/home-d"; mkdir -p "$HOME_D/.git"
run_init "$HOME_D"
[ ! -e "$HOME_D/workspace-sancho" ] || { echo "FAIL D: sembró sobre un checkout git"; exit 1; }

# Caso E: limpia temp dirs abandonados por una copia previa que murió.
HOME_E="$TMP/home-e"; mkdir -p "$HOME_E/.seed-tmp.workspace-sancho.999/junk"
run_init "$HOME_E"
[ ! -e "$HOME_E/.seed-tmp.workspace-sancho.999" ] || { echo "FAIL E: no limpió temp abandonado"; exit 1; }
[ -f "$HOME_E/workspace-sancho/scripts/mc-server.js" ] || { echo "FAIL E: no sembró tras limpiar temp"; exit 1; }

# --- SAN-464: workspace-* se refresca como framework, salvo lo del humano ----
# Ampliar el fake seed con lo que la clasificación distingue.
mkdir -p "$SEED/workspace-sancho" "$SEED/workspace-rocinante"
printf 'PROTOCOLS v1 {MC_BASE_URL}\n' > "$SEED/workspace-sancho/PROTOCOLS.md"
printf '# USER.md - About Your Human\n\n- **Name:**\n' > "$SEED/workspace-sancho/USER.md"
printf 'TOOLS v1\n' > "$SEED/workspace-rocinante/TOOLS.md"
printf '# USER.md - About Your Human\n\n- **Name:**\n' > "$SEED/workspace-rocinante/USER.md"

HOME_S="$TMP/home-san464"; mkdir -p "$HOME_S"
run_init "$HOME_S"

# F: primer run → el humano recibe el default (seed-once NO significa "nunca copiar").
[ -f "$HOME_S/workspace-sancho/USER.md" ] || { echo "FAIL F: no sembró USER.md en el primer run"; exit 1; }
[ -f "$HOME_S/workspace-sancho/PROTOCOLS.md" ] || { echo "FAIL F: no sembró PROTOCOLS.md"; exit 1; }

# El humano llena su USER.md y crea datos propios que NO están en el seed.
printf '# USER.md\n\n- **Name:** Humano De Prueba\n' > "$HOME_S/workspace-sancho/USER.md"
printf 'TOOLS editado\n' > "$HOME_S/workspace-rocinante/TOOLS.md"
mkdir -p "$HOME_S/workspace-sancho/brand/cliente-demo"
printf 'dato vivo\n' > "$HOME_S/workspace-sancho/brand/cliente-demo/swot.md"

# Llega una imagen nueva: cambia la versión del seed y el contenido del framework.
echo "v2" > "$SEED/.seed-version"
printf 'PROTOCOLS v2 {MC_BASE_URL}\n' > "$SEED/workspace-sancho/PROTOCOLS.md"
run_init "$HOME_S"

# G: el framework SE PISA (es el bug que este cambio arregla: hoy quedaría en v1).
grep -q 'PROTOCOLS v2' "$HOME_S/workspace-sancho/PROTOCOLS.md" \
  || { echo "FAIL G: no actualizó PROTOCOLS.md desde la imagen (SAN-464)"; exit 1; }

# H: la plantilla vuelve con el placeholder, para que inject-env-vars pueda renderizar.
grep -q '{MC_BASE_URL}' "$HOME_S/workspace-sancho/PROTOCOLS.md" \
  || { echo "FAIL H: repuso PROTOCOLS.md sin placeholder"; exit 1; }

# I: lo del humano NO se pisa.
grep -q 'Name:\*\* Humano De Prueba' "$HOME_S/workspace-sancho/USER.md" \
  || { echo "FAIL I: pisó USER.md del humano"; exit 1; }
grep -q 'TOOLS editado' "$HOME_S/workspace-rocinante/TOOLS.md" \
  || { echo "FAIL I: pisó TOOLS.md de un workspace secundario"; exit 1; }

# J: los datos que no están en el seed ni se rozan.
grep -q 'dato vivo' "$HOME_S/workspace-sancho/brand/cliente-demo/swot.md" \
  || { echo "FAIL J: tocó brand/, que no viaja en el seed"; exit 1; }

echo "OK SAN-464: framework refrescado, humano y datos intactos"

# --- SAN-464 / SAN-329: un dir de framework que se pierde se repone aunque el
# marker de version ya coincida. Sin esto, workspace-* quedaba clavado hasta el
# proximo bump de imagen: el marker dice "ya copie v1" pero el dir no esta, y ahi
# vive scripts/mc-server.js → crash loop que ningun reboot cura.
HOME_W="$TMP/home-wedge"; mkdir -p "$HOME_W"
run_init "$HOME_W"                                     # boot 1: siembra y marca la version
[ -f "$HOME_W/.sancho-seed-version" ] || { echo "FAIL K: no marcó la versión en el primer run"; exit 1; }
mkdir -p "$HOME_W/workspace-sancho/brand"
printf 'dato vivo\n' > "$HOME_W/workspace-sancho/brand/cliente-demo.md"
rm -rf "$HOME_W/workspace-sancho/scripts"              # se pierde el entrypoint del server
rm -rf "$HOME_W/skills"                                # y un dir de framework de los viejos
run_init "$HOME_W"                                     # boot 2: MISMA version del seed

# K: el refresh corre igual porque falta un dir, y repone lo perdido.
[ -f "$HOME_W/workspace-sancho/scripts/mc-server.js" ] \
  || { echo "FAIL K: no repuso scripts/ perdido con el marker al día (wedge SAN-329)"; exit 1; }
[ -f "$HOME_W/skills/seo.md" ] \
  || { echo "FAIL K: no repuso skills/ perdido con el marker al día"; exit 1; }

# L: reponer no es excusa para pisar datos del usuario.
grep -q 'dato vivo' "$HOME_W/workspace-sancho/brand/cliente-demo.md" \
  || { echo "FAIL L: el self-heal pisó datos del usuario"; exit 1; }

# M: y con todo en su lugar, el refresh NO corre (o volveríamos a copiar 180 MB
# en cada restart, que es exactamente lo que el gate de versión existe para evitar).
run_init_log() { SANCHO_SEED_DIR="$SEED" bash "$INIT" "$1" 2>&1; }
out="$(run_init_log "$HOME_W")"
echo "$out" | grep -q 'framework up to date' \
  || { echo "FAIL M: refrescó de más con todo presente y la versión al día"; echo "$out"; exit 1; }

echo "OK SAN-329: un dir de framework perdido se repone sin esperar al próximo bump"

echo "PASS"
