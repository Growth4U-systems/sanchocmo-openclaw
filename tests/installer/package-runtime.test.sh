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
  docker-compose.yml install.sh scripts/wizard.sh | sort)"
[ "$got" = "$want" ] || { echo "FAIL: contenido inesperado"; echo "GOT:"; echo "$got"; echo "WANT:"; echo "$want"; exit 1; }
# Negativos: nada de source ni framework
if tar -tzf "$OUT" | grep -qE '^(src/|skills/|plugins/|workspace|Dockerfile|docker/init-home)'; then
  echo "FAIL: el tarball incluyó source/framework"; exit 1
fi
echo "PASS"
