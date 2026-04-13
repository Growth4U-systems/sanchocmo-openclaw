#!/usr/bin/env bash
# Cervantes observes Sancho's recent sessions (daily 10 AM Madrid)
set -euo pipefail

OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
cd "$OPENCLAW_HOME/workspace-cervantes"

# Source auth token
[ -f "$OPENCLAW_HOME/.env" ] && source "$OPENCLAW_HOME/.env" 2>/dev/null || true

if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
  echo "[cron-observe] CLAUDE_CODE_OAUTH_TOKEN not set, skipping" >&2
  exit 0
fi

export CLAUDE_CODE_OAUTH_TOKEN

TODAY=$(date +%Y-%m-%d)
YESTERDAY=$(date -d "yesterday" +%Y-%m-%d 2>/dev/null || date -v-1d +%Y-%m-%d)

claude -p "Observa las sesiones recientes de Sancho (ultimas 24h).

1. Lee ../workspace-sancho/memory/daily/$TODAY.md y ../workspace-sancho/memory/daily/$YESTERDAY.md si existen.
2. Lee memory/MEMORY.md para contexto.
3. Identifica: errores, skills que fallaron, preguntas sin respuesta, patrones de mejora.
4. Escribe resumen breve en memory/daily/$TODAY.md (append con timestamp).
5. Si hay algo urgente, escribelo en memory/TASKS.md como propuesta P1.

Responde con un resumen de 3-5 lineas de lo observado." \
  --allowedTools "Read,Write,Edit,Bash,Glob,Grep" 2>&1

echo "[cron-observe] Done at $(date)"
