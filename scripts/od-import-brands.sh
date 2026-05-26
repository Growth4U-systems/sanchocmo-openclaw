#!/usr/bin/env bash
# Registra los brands activos del workspace de Sancho como proyectos en Open Design.
# OD lee/escribe in-place dentro del baseDir registrado (no copia).

set -euo pipefail

DAEMON_URL="${OD_DAEMON_URL:-http://localhost:7456}"
BRAND_ROOT="${BRAND_ROOT:-/Users/ragi/.openclaw/workspace-sancho/brand}"

if ! curl -fsS "${DAEMON_URL}/api/health" >/dev/null 2>&1; then
  echo "ERROR: OD daemon no responde en ${DAEMON_URL}" >&2
  echo "Arranca con: ~/.openclaw/scripts/od-daemon.sh start" >&2
  exit 1
fi

echo "Brands a importar (carpetas en ${BRAND_ROOT}):"
brands=()
for d in "$BRAND_ROOT"/*/; do
  [ -d "$d" ] || continue
  slug="$(basename "$d")"
  case "$slug" in _archive|_*) continue ;; esac
  brands+=("$slug")
  echo "  - $slug"
done

if [ ${#brands[@]} -eq 0 ]; then
  echo "No hay brands para importar." >&2
  exit 0
fi

echo
for slug in "${brands[@]}"; do
  base="${BRAND_ROOT}/${slug}"
  echo "→ ${slug}"
  curl -fsS -X POST "${DAEMON_URL}/api/import/folder" \
    -H "Content-Type: application/json" \
    -d "{\"baseDir\": \"${base}\"}" \
    | python3 -c "import sys, json; d=json.load(sys.stdin); p=d.get('project',{}); print(f\"  project_id={p.get('id')}  name={p.get('name')}  baseDir={p.get('metadata',{}).get('baseDir')}\")"
done

echo
echo "Brands registrados. Verifica con: curl ${DAEMON_URL}/api/projects"
