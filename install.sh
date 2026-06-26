#!/usr/bin/env bash
# ============================================================================
# SanchoCMO — instalador de un comando.
# ----------------------------------------------------------------------------
# Shim de compatibilidad: toda la lógica vive ahora en el CLI unificado
# `./sancho`. Esto preserva la instrucción histórica `./install.sh` (docs,
# tarball de release, get.sh) delegando en `./sancho install`.
#
# Para operar el stack día a día usá el CLI directamente:
#   ./sancho up | down | update | logs | status | destroy | help
#
# Flags aceptados (se pasan tal cual a `sancho install`):
#   --no-up   --od   --yalc   --build   --force
# ============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/sancho" install "$@"
