#!/usr/bin/env bash
# Smart healthcheck — only invoked when healthcheck.sh detects new failures (exit 1)
set -euo pipefail

OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
cd "$OPENCLAW_HOME/workspace-cervantes"

[ -f "$OPENCLAW_HOME/.env" ] && source "$OPENCLAW_HOME/.env" 2>/dev/null || true

if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
  echo "[cron-healthcheck-smart] CLAUDE_CODE_OAUTH_TOKEN not set, skipping" >&2
  exit 0
fi

export CLAUDE_CODE_OAUTH_TOKEN

TODAY=$(date +%Y-%m-%d)

claude -p "Un health check acaba de detectar NUEVOS fallos en el sistema.

1. Lee memory/healthcheck-state.json para ver que servicios fallaron.
2. Lee ../workspace-sancho/_system/api-health.json para el estado completo.
3. Diagnostica: que puede estar causando el fallo.
4. Si es algo que puedes arreglar (reiniciar servicio, corregir config), hazlo.
5. Si no, escribe en memory/TASKS.md como propuesta P0/P1.
6. Escribe resumen de acciones en memory/daily/$TODAY.md.

Responde con diagnostico y acciones tomadas." \
  --allowedTools "Read,Write,Edit,Bash,Glob,Grep" 2>&1

echo "[cron-healthcheck-smart] Done at $(date)"
