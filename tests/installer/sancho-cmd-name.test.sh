#!/usr/bin/env bash
# El CLI debe nombrarse a sí mismo según cómo lo puede invocar el usuario
# (SAN-483): `./sancho` cuando NO hay un `sancho` global linkeado, y `sancho`
# cuando SÍ lo hay apuntando a este install. La detección mira el PATH (no cómo
# se invocó), así acierta tanto si te llamaron `sancho` como `./sancho`.
#
# Sandbox: un "install" con el CLI + su librería y un bin propio para el symlink
# global. Nada de esto necesita docker.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

INSTALL="$TMP/install"
mkdir -p "$INSTALL/scripts" "$TMP/bin"
cp "$ROOT/sancho" "$INSTALL/sancho"
cp "$ROOT/scripts/compose-env.sh" "$INSTALL/scripts/compose-env.sh"
cp "$ROOT/scripts/checklist.sh" "$INSTALL/scripts/checklist.sh"
printf '#!/usr/bin/env bash\n' > "$INSTALL/scripts/wizard.sh"
touch "$INSTALL/docker-compose.yml"   # marcador del dir real del install

rc=0
pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; rc=1; }

# 1. Sin `sancho` en el PATH → el help usa `./sancho` y NO `sancho ` pelado.
out_local="$(cd "$INSTALL" && PATH="/usr/bin:/bin" bash ./sancho help 2>&1)"
if printf '%s\n' "$out_local" | grep -qE '^\s*\./sancho run\b'; then
  pass "sin link global, el help muestra ./sancho"
else
  fail "sin link global, el help NO mostró ./sancho"
  printf '%s\n' "$out_local" | head -3 | sed 's/^/    /'
fi

# 2. Con `sancho` linkeado en el PATH apuntando a este install → `sancho` pelado.
ln -sfn "$INSTALL/sancho" "$TMP/bin/sancho"
out_linked="$(cd "$INSTALL" && PATH="$TMP/bin:/usr/bin:/bin" bash ./sancho help 2>&1)"
if printf '%s\n' "$out_linked" | grep -qE '^\s*sancho run\b'; then
  pass "con link global, el help muestra sancho (sin ./)"
else
  fail "con link global, el help NO mostró sancho pelado"
  printf '%s\n' "$out_linked" | head -3 | sed 's/^/    /'
fi

# 3. Un `sancho` en el PATH que apunta a OTRO install no debe contar como el
#    nuestro → seguimos mostrando ./sancho.
OTHER="$TMP/other"; mkdir -p "$OTHER/scripts"
cp "$ROOT/sancho" "$OTHER/sancho"
cp "$ROOT/scripts/compose-env.sh" "$OTHER/scripts/compose-env.sh"
cp "$ROOT/scripts/checklist.sh" "$OTHER/scripts/checklist.sh"
printf '#!/usr/bin/env bash\n' > "$OTHER/scripts/wizard.sh"
touch "$OTHER/docker-compose.yml"
ln -sfn "$OTHER/sancho" "$TMP/bin/sancho"
out_other="$(cd "$INSTALL" && PATH="$TMP/bin:/usr/bin:/bin" bash ./sancho help 2>&1)"
if printf '%s\n' "$out_other" | grep -qE '^\s*\./sancho run\b'; then
  pass "un sancho global de otro install no se confunde con el nuestro"
else
  fail "un sancho global de otro install se tomó como el nuestro"
  printf '%s\n' "$out_other" | head -3 | sed 's/^/    /'
fi

[ "$rc" -eq 0 ] && echo "PASS: sancho se autonombra según el link global"
exit "$rc"
