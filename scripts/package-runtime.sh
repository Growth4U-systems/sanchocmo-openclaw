#!/usr/bin/env bash
# Empaqueta SOLO los archivos de orquestación de runtime en un tarball, para
# que `get.sh` los entregue sin clonar el repo. La app va en la imagen GHCR.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT_DIR/sancho-runtime.tar.gz}"

FILES=(
  docker-compose.yml
  docker-compose.od.yml
  docker-compose.yalc.yml
  install.sh
  scripts/wizard.sh
  .env.example
)

for f in "${FILES[@]}"; do
  [ -f "$ROOT_DIR/$f" ] || { echo "ERROR: falta $f en el repo" >&2; exit 1; }
done

# -C para que las rutas dentro del tar sean relativas a la raíz (sin prefijo).
tar -czf "$OUT" -C "$ROOT_DIR" "${FILES[@]}"
echo "Wrote $OUT"
