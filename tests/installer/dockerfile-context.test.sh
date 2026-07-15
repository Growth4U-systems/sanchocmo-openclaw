#!/usr/bin/env bash
# Every path the Dockerfile COPYs must exist in the git tree.
#
# Why this exists (SAN-464): untracking the last four files under agents/ emptied
# it out of git. Git has no empty directories, so `COPY agents/ ./agents/` failed
# with `"/agents": not found` and v1.7.3 published a release with NO image.
#
# Nothing caught it. The image is built only on `release: published`, never on a
# PR, and staging builds from source on the VPS, where agents/ sits on disk full
# of untracked files. A clean git checkout is the only place the gap is visible —
# which is exactly what CI hands this test.
#
# Checks tracked content, not the working tree: on a dev machine agents/ exists on
# disk either way, so `[ -d ]` would happily pass while the release burns.
#
# Not covered: a path that IS tracked but that .dockerignore strips down to
# nothing (the SAN-438 shape). That needs a real build to see.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

DOCKERFILE="$ROOT/Dockerfile"
[ -f "$DOCKERFILE" ] || { echo "FAIL: no encontré $DOCKERFILE"; exit 1; }

copy_lines="$(grep -nE '^[[:space:]]*COPY[[:space:]]' "$DOCKERFILE" | grep -v -- '--from=')"
n_lines="$(printf '%s\n' "$copy_lines" | grep -c . || true)"
echo "insumo: $n_lines lineas COPY (sin --from=) en Dockerfile"
[ "$n_lines" -gt 0 ] || { echo "FAIL: no parseé ningún COPY — ¿cambió el formato del Dockerfile?"; exit 1; }

rc=0
checked=0
while IFS= read -r entry; do
  [ -n "$entry" ] || continue
  lineno="${entry%%:*}"
  line="${entry#*:}"
  # shellcheck disable=SC2206
  parts=( $line )                 # COPY <src...> <dest>
  n=${#parts[@]}
  [ "$n" -ge 3 ] || continue      # COPY <src> <dest> => al menos 3 campos
  last=$(( n - 1 ))
  for (( i = 1; i < last; i++ )); do
    src="${parts[$i]}"
    case "$src" in --*) continue ;; esac
    checked=$(( checked + 1 ))
    if [ -z "$(git ls-files -- "$src" | head -1)" ]; then
      echo "FAIL Dockerfile:$lineno — COPY '$src' pero git no trackea nada ahí."
      echo "     Un dir vacío no existe en git: el build desde un checkout limpio va a tirar \"/${src%/}\": not found."
      rc=1
    fi
  done
done <<< "$copy_lines"

echo "verificadas: $checked rutas COPY"
[ "$checked" -gt 0 ] || { echo "FAIL: 0 rutas verificadas — el parseo no anduvo"; exit 1; }
[ "$rc" -eq 0 ] && echo "PASS: toda ruta del COPY existe en git"
exit "$rc"
