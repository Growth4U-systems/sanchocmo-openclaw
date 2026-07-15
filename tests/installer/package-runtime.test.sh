#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OUT="$TMP/rt.tar.gz"

bash "$ROOT/scripts/package-runtime.sh" "$OUT"

[ -f "$OUT" ] || { echo "FAIL: no se creó el tarball"; exit 1; }
got="$(tar -tzf "$OUT" | sort)"
want="$(printf '%s\n' \
  .env.example docker-compose.od.yml docker-compose.yalc.yml \
  docker-compose.yml sancho install.sh scripts/compose-env.sh \
  scripts/checklist.sh scripts/wizard.sh | sort)"
[ "$got" = "$want" ] || { echo "FAIL: contenido inesperado"; echo "GOT:"; echo "$got"; echo "WANT:"; echo "$want"; exit 1; }

# Toda librería que `sancho` sourcea tiene que viajar en el tarball, o el CLI
# explota recién en la máquina del que instala. Derivado del source y no de una
# lista a mano: agregar un `source` nuevo sin empaquetarlo tiene que romper acá.
sourced="$(grep -oE '^[[:space:]]*(source|\.)[[:space:]]+"\$SCRIPT_DIR/[^"]+"' "$ROOT/sancho" \
  | sed -E 's|.*\$SCRIPT_DIR/||; s|"$||' | sort -u)"
[ -n "$sourced" ] || { echo "FAIL: no detecté ningún source en sancho (¿cambió el patrón?)"; exit 1; }
while read -r lib; do
  printf '%s\n' "$got" | grep -qxF "$lib" \
    || { echo "FAIL: sancho sourcea '$lib' pero no está en el tarball"; exit 1; }
done <<< "$sourced"
# Negativos: nada de source ni framework
if tar -tzf "$OUT" | grep -qE '^(src/|skills/|plugins/|workspace|Dockerfile|docker/init-home)'; then
  echo "FAIL: el tarball incluyó source/framework"; exit 1
fi
echo "PASS"
