#!/usr/bin/env bash
# Configura Tailscale para exponer el daemon de Open Design (7456) y su web app (3100)
# vía Tailscale Serve (intra-tailnet) y opcionalmente Funnel (público).
#
# Resultado:
#   - https://<host>.<tailnet>.ts.net:8444/    → web app de OD (3100)
#   - https://<host>.<tailnet>.ts.net:8444/api → daemon API (7456)
#
# Anota las URLs en ~/.openclaw/.env como OD_PUBLIC_WEB_URL / OD_PUBLIC_DAEMON_URL.

set -euo pipefail

cmd="${1:-up}"

OD_PUBLIC_PORT="${OD_PUBLIC_PORT:-8444}"  # Funnel-eligible: 443, 8443, 10000. 8444 NO es Funnel-eligible — solo serve.
OD_DAEMON_LOCAL=7456
OD_WEB_LOCAL=3100

if ! command -v tailscale >/dev/null 2>&1; then
  echo "ERROR: Tailscale CLI no encontrado. Instala desde https://tailscale.com/download" >&2
  exit 1
fi

if ! tailscale status --json >/dev/null 2>&1; then
  echo "ERROR: Tailscale no está conectado. Ejecuta 'tailscale up' primero." >&2
  exit 1
fi

case "$cmd" in
  up)
    echo "→ Configurando tailscale serve para Open Design en puerto ${OD_PUBLIC_PORT}…"
    # Sirve web app de OD en /
    tailscale serve --bg --https="${OD_PUBLIC_PORT}" --set-path=/ "http://127.0.0.1:${OD_WEB_LOCAL}"
    # Sirve daemon API en /api
    tailscale serve --bg --https="${OD_PUBLIC_PORT}" --set-path=/api "http://127.0.0.1:${OD_DAEMON_LOCAL}/api"

    HOST=$(tailscale status --json | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['Self']['DNSName'].rstrip('.'))")
    BASE_URL="https://${HOST}:${OD_PUBLIC_PORT}"

    echo
    echo "✓ OD expuesto en tailnet:"
    echo "  Web app:    ${BASE_URL}/"
    echo "  Daemon API: ${BASE_URL}/api"
    echo
    echo "Añade estas líneas a ~/.openclaw/.env (sin sobrescribir lo que tengas):"
    echo "  OD_PUBLIC_WEB_URL=${BASE_URL}"
    echo "  OD_PUBLIC_DAEMON_URL=${BASE_URL}/api"
    echo "  OD_USE_PUBLIC=false   # poner 'true' cuando MC corra remoto"
    echo
    echo "Funnel público (acceso desde fuera del tailnet, opcional):"
    echo "  tailscale funnel --bg --https=${OD_PUBLIC_PORT} --set-path=/ http://127.0.0.1:${OD_WEB_LOCAL}"
    echo "  tailscale funnel --bg --https=${OD_PUBLIC_PORT} --set-path=/api http://127.0.0.1:${OD_DAEMON_LOCAL}/api"
    ;;
  down)
    echo "→ Quitando rutas serve de OD…"
    tailscale serve --https="${OD_PUBLIC_PORT}" --set-path=/ off || true
    tailscale serve --https="${OD_PUBLIC_PORT}" --set-path=/api off || true
    echo "✓ Rutas eliminadas"
    ;;
  status)
    tailscale serve status
    ;;
  *)
    echo "Usage: $0 {up|down|status}" >&2
    exit 1
    ;;
esac
