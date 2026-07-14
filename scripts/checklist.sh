#!/usr/bin/env bash
# ============================================================================
# checklist.sh — "step runner" para el CLI sancho. Sólo define funciones.
# ----------------------------------------------------------------------------
# Los pasos ruidosos (docker pull/build/up) escupen cientos de líneas que no le
# dicen nada al que instala y entierran lo que importa. Acá los envolvemos: el
# output crudo va a un log y en pantalla queda un checklist de una línea por
# paso. Si algo falla, el log se vuelca — nunca se traga un error.
#
#   step_log_init                      arranca (trunca) el log del run
#   step_run "Etiqueta" -- cmd [args…] corre cmd, muestra ✅/❌ Etiqueta
#
# SANCHO_LOG=<path>   dónde va el log (default .sancho/last-install.log)
# SANCHO_VERBOSE=1    no captura: streamea el crudo en vivo (debug)
# ============================================================================

SANCHO_LOG="${SANCHO_LOG:-.sancho/last-install.log}"
# Cuántas líneas del log mostramos cuando un paso falla.
SANCHO_LOG_TAIL="${SANCHO_LOG_TAIL:-40}"

step_log_init() {
  mkdir -p "$(dirname "$SANCHO_LOG")" 2>/dev/null || return 0
  : > "$SANCHO_LOG" 2>/dev/null || return 0
  printf '=== sancho — log del run: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> "$SANCHO_LOG"
}

# step_run "Etiqueta" -- <cmd> [args…]
step_run() {
  local label="$1"; shift
  [ "${1:-}" = "--" ] && shift
  local tty=0; [ -t 1 ] && tty=1
  local rc=0

  # Separador legible en el log: qué paso, cuándo, qué comando exacto.
  if [ -w "$(dirname "$SANCHO_LOG")" ] 2>/dev/null || [ -f "$SANCHO_LOG" ]; then
    { printf '\n--- [%s] %s\n    $ %s\n' "$(date '+%H:%M:%S')" "$label" "$*"; } >> "$SANCHO_LOG" 2>/dev/null || true
  fi

  # Verbose: sin captura ni spinner — el usuario pidió ver el crudo.
  if [ "${SANCHO_VERBOSE:-0}" = "1" ]; then
    echo "  … $label"
    "$@" 2>&1 | tee -a "$SANCHO_LOG" || rc=${PIPESTATUS[0]}
    [ "$rc" = 0 ] && echo "  ✅ $label" || echo "  ❌ $label"
    return "$rc"
  fi

  if [ "$tty" = 1 ]; then
    # Spinner in-place mientras el comando corre capturado. Mismos frames que
    # wait_until_healthy, para que el install se sienta de una sola pieza.
    local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    local n=${#frames[@]} i=0 pid
    "$@" >> "$SANCHO_LOG" 2>&1 &
    pid=$!
    while kill -0 "$pid" 2>/dev/null; do
      i=$(( (i + 1) % n ))
      printf '\r\033[K  %s %s…' "${frames[i]}" "$label"
      sleep 0.1
    done
    wait "$pid" || rc=$?
    printf '\r\033[K'
  else
    # CI / no-TTY: una línea al empezar, otra al terminar. Sin ANSI.
    echo "  … $label"
    "$@" >> "$SANCHO_LOG" 2>&1 || rc=$?
  fi

  if [ "$rc" = 0 ]; then
    echo "  ✅ $label"
  else
    echo "  ❌ $label"
    echo ""
    echo "  Últimas líneas del log ($SANCHO_LOG):"
    tail -n "$SANCHO_LOG_TAIL" "$SANCHO_LOG" 2>/dev/null | sed 's/^/    /'
    echo ""
  fi
  return "$rc"
}
