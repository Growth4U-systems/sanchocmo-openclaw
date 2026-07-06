#!/usr/bin/env bash
# Weekly token audit (Mondays 9 AM Madrid)
set -euo pipefail

OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
cd "$OPENCLAW_HOME/workspace-cervantes"

[ -f "$OPENCLAW_HOME/.env" ] && source "$OPENCLAW_HOME/.env" 2>/dev/null || true

if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
  echo "[cron-audit] CLAUDE_CODE_OAUTH_TOKEN not set, skipping" >&2
  exit 0
fi

export CLAUDE_CODE_OAUTH_TOKEN

TODAY=$(date +%Y-%m-%d)

claude -p "Ejecuta una auditoria semanal de tokens/costes.

1. Ejecuta: python3 ../workspace-sancho/scripts/cost-tracker.py --alert-threshold 0
2. Lee los archivos JSON de costos generados.
3. Analiza ultimos 7 dias vs semana anterior: total USD, tendencia, top 3 dias mas caros.
4. Desglose por cliente y por agente si disponible.
5. Lista 1-3 recomendaciones concretas.
6. Escribe resultado en memory/daily/$TODAY.md bajo seccion '## Token Audit'.

Responde con el resumen del audit." \
  --allowedTools "Read,Write,Edit,Bash,Glob,Grep" 2>&1

echo "[cron-audit] Done at $(date)"
