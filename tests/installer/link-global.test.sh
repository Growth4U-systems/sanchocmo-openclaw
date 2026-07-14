#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Sandbox: un "install" en $TMP/install con el CLI + la librería, y un HOME
# fake donde debe aterrizar el symlink global. Nada de esto necesita docker.
INSTALL="$TMP/install"
mkdir -p "$INSTALL/scripts" "$TMP/home" "$TMP/bin"
cp "$ROOT/sancho" "$INSTALL/sancho"
cp "$ROOT/scripts/compose-env.sh" "$INSTALL/scripts/compose-env.sh"
cp "$ROOT/scripts/checklist.sh" "$INSTALL/scripts/checklist.sh"
printf '#!/usr/bin/env bash\n' > "$INSTALL/scripts/wizard.sh"
# Marcador: sólo el dir real del install lo tiene. Sirve para probar que
# SCRIPT_DIR resuelve al install y no al dir del symlink.
touch "$INSTALL/docker-compose.yml"

export HOME="$TMP/home"
# El destino por defecto depende de si /usr/local/bin es escribible (varía por
# máquina/CI). Fijamos el override para que el test sea determinista y probamos
# el dir de usuario, que es el caso interesante (el que necesita aviso de PATH).
LINK_DIR="$TMP/home/.local/bin"

run_link() {
  ( cd "$INSTALL" \
    && HOME="$TMP/home" PATH="$TMP/bin:$PATH" SANCHO_LINK_DIR="$LINK_DIR" \
       bash ./sancho link "$@" 2>&1 )
}

# ---------------------------------------------------------------------------
# Caso A: link crea el symlink apuntando al sancho REAL del install.
# ---------------------------------------------------------------------------
out="$(run_link)" || { echo "FAIL A: sancho link salió con error"; echo "$out"; exit 1; }
LINK="$TMP/home/.local/bin/sancho"
[ -L "$LINK" ] || { echo "FAIL A: no se creó el symlink en $LINK"; echo "$out"; exit 1; }
target="$(readlink "$LINK")"
[ "$target" = "$INSTALL/sancho" ] || { echo "FAIL A: el symlink apunta a '$target', esperaba '$INSTALL/sancho'"; exit 1; }

# ---------------------------------------------------------------------------
# Caso B: aviso de PATH cuando el dir elegido no está en $PATH.
# ---------------------------------------------------------------------------
printf '%s' "$out" | grep -q 'export PATH=' \
  || { echo "FAIL B: no imprimió la línea de PATH para agregar"; echo "$out"; exit 1; }

# ---------------------------------------------------------------------------
# Caso C: idempotente — re-linkear no falla ni duplica.
# ---------------------------------------------------------------------------
run_link >/dev/null || { echo "FAIL C: el segundo link falló (no es idempotente)"; exit 1; }
[ -L "$LINK" ] || { echo "FAIL C: el symlink desapareció"; exit 1; }

# ---------------------------------------------------------------------------
# Caso D: EL BUG — invocar sancho A TRAVÉS del symlink debe resolver SCRIPT_DIR
# al dir real del install (que tiene docker-compose.yml), no al dir del symlink.
# Con el SCRIPT_DIR viejo (dirname de BASH_SOURCE) esto falla.
# ---------------------------------------------------------------------------
out="$( cd "$TMP" && HOME="$TMP/home" bash "$LINK" help 2>&1 )" \
  || { echo "FAIL D: sancho vía symlink salió con error"; echo "$out"; exit 1; }
printf '%s' "$out" | grep -q 'sancho' \
  || { echo "FAIL D: el help vía symlink no imprimió nada útil"; echo "$out"; exit 1; }
# La prueba dura: el CLI tiene que haber cd-eado al install real.
probe="$( cd "$TMP" && HOME="$TMP/home" bash -c 'source "$0" >/dev/null 2>&1; pwd' "$LINK" help 2>/dev/null || true )"
[ "$probe" = "$INSTALL" ] || { echo "FAIL D: SCRIPT_DIR resolvió a '$probe', esperaba el install real '$INSTALL'"; exit 1; }

# ---------------------------------------------------------------------------
# Caso E: no pisa un binario ajeno sin --force; sí con --force.
# ---------------------------------------------------------------------------
rm -f "$LINK"
printf '#!/usr/bin/env bash\necho ajeno\n' > "$LINK"; chmod +x "$LINK"
out="$(run_link)" || true
[ -L "$LINK" ] && { echo "FAIL E: pisó un sancho ajeno sin --force"; exit 1; }
grep -q 'ajeno' "$LINK" || { echo "FAIL E: se modificó el binario ajeno"; exit 1; }
printf '%s' "$out" | grep -qiE 'existe|skip|--force' \
  || { echo "FAIL E: no avisó por qué salteó"; echo "$out"; exit 1; }

run_link --force >/dev/null || { echo "FAIL E: --force falló"; exit 1; }
[ -L "$LINK" ] || { echo "FAIL E: --force no reemplazó el ajeno por el symlink"; exit 1; }
[ "$(readlink "$LINK")" = "$INSTALL/sancho" ] || { echo "FAIL E: --force dejó un symlink mal apuntado"; exit 1; }

echo "PASS"
