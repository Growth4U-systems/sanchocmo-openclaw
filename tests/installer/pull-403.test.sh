#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Extraer solo la función pull_images de install.sh para testearla aislada.
# (install.sh debe definirla; la sourceamos con un guard que evita ejecutar main.)
cp "$ROOT/install.sh" "$TMP/install.sh"

# Shim de docker que simula 403 en `compose pull`.
mkdir -p "$TMP/bin"
cat > "$TMP/bin/docker" <<'SH'
#!/usr/bin/env bash
if [ "$1" = "compose" ]; then
  for a in "$@"; do [ "$a" = "pull" ] && { echo "denied: requested access to the resource is denied" >&2; exit 1; }; done
  exit 0   # `up` u otros: ok
fi
exit 0
SH
chmod +x "$TMP/bin/docker"

# Sin Dockerfile en el dir → install de producto → un pull 403 persistente es fatal.
out="$( cd "$TMP" && PATH="$TMP/bin:$PATH" SANCHO_PULL_TEST=1 bash -c '
  source ./install.sh           # debe definir funciones y NO correr main bajo SANCHO_PULL_TEST
  COMPOSE="docker compose"; COMPOSE_ARGS="-f docker-compose.yml"; SCRIPT_DIR="'"$TMP"'"
  pull_images
' 2>&1 )" && rc=0 || rc=$?

echo "$out" | grep -qi 'docker login ghcr.io' || { echo "FAIL: no mostró la guía de login"; echo "$out"; exit 1; }
[ "$rc" -ne 0 ] || { echo "FAIL: debía salir con error en install de producto"; exit 1; }
echo "PASS"
