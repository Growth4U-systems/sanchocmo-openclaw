#!/usr/bin/env bash
# Arranca / para / verifica el daemon de Open Design con puertos fijos
# para que MC pueda hablar con él en localhost:7456 (API) y localhost:3100 (web app).

set -euo pipefail

OD_REPO="${OD_REPO_PATH:-/Users/ragi/open-design}"
DAEMON_PORT="${OD_DAEMON_PORT:-7456}"
WEB_PORT="${OD_WEB_PORT:-3100}"

# Origins desde los que el daemon acepta requests (cross-origin guard).
# Incluye localhost (default) + Tailscale Funnel/Serve para acceso remoto.
export OD_ALLOWED_ORIGINS="${OD_ALLOWED_ORIGINS:-https://your-instance.ts.net:8444,https://your-instance.ts.net,https://your-instance.ts.net:8443}"

cd "$OD_REPO"

cmd="${1:-start}"

case "$cmd" in
  start)
    pnpm exec tools-dev start web --prod --daemon-port "$DAEMON_PORT" --web-port "$WEB_PORT"
    # Restaurar mapeo de Tailscale serve si el script existe (idempotente).
    if [ -x "$HOME/.openclaw/scripts/od-tailscale.sh" ]; then
      "$HOME/.openclaw/scripts/od-tailscale.sh" up >/dev/null 2>&1 || true
    fi
    ;;
  stop)
    pnpm exec tools-dev stop
    ;;
  restart)
    pnpm exec tools-dev stop || true
    sleep 2
    pnpm exec tools-dev start web --prod --daemon-port "$DAEMON_PORT" --web-port "$WEB_PORT"
    ;;
  status)
    pnpm exec tools-dev status
    ;;
  health)
    curl -fsS "http://localhost:${DAEMON_PORT}/api/health"
    echo
    curl -fsS -o /dev/null -w "web app on ${WEB_PORT}: HTTP %{http_code}\n" "http://localhost:${WEB_PORT}"
    ;;
  logs)
    pnpm exec tools-dev logs "${2:-}"
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|health|logs [daemon|web]}" >&2
    exit 1
    ;;
esac
