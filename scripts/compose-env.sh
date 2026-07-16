#!/usr/bin/env bash
# ============================================================================
# compose-env.sh — librería sourceable compartida por `sancho` e `install.sh`.
# ----------------------------------------------------------------------------
# Única fuente de verdad de la orquestación de compose: detección del binario,
# armado de COMPOSE_ARGS (qué overlays prender), pull con manejo de GHCR
# privado, y helpers de edición de .env.
#
# NO ejecuta nada al sourcearse: solo define funciones. El caller hace `cd` al
# dir del proyecto antes de invocarlas (todas asumen cwd = raíz del install,
# donde viven .env y los docker-compose*.yml).
# ============================================================================

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
die()  { printf '\033[31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# Detecta el binario de compose y lo deja en la global COMPOSE.
detect_compose() {
  command -v docker >/dev/null 2>&1 || die "Docker no está instalado. Ver https://docs.docker.com/get-docker/"
  if docker compose version >/dev/null 2>&1; then
    COMPOSE="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE="docker-compose"
  else
    die "Se requiere Docker Compose v2 (el subcomando 'docker compose')."
  fi
}

# Prerrequisitos para instalar/configurar (el wizard genera secretos con openssl).
check_prereqs() {
  detect_compose
  command -v openssl >/dev/null 2>&1 || die "openssl es requerido (genera secretos)."
  echo "  ✓ docker, compose, openssl encontrados"
}

# ensure_env_default KEY VALUE — agrega KEY=VALUE a .env solo si no está activo
# (ni en el entorno ni como línea no comentada). No pisa valores existentes.
ensure_env_default() {
  local key="$1" val="$2"
  [ -n "${!key:-}" ] && return 0
  grep -qE "^[[:space:]]*${key}=" .env 2>/dev/null && return 0
  printf '%s=%s\n' "$key" "$val" >> .env
  echo "  ✓ ${key}=${val} (agregado a .env)"
}

# set_env_var KEY VALUE — reemplaza la línea activa KEY=… en .env, o la agrega
# si no existe. A diferencia de ensure_env_default, SÍ pisa el valor.
set_env_var() {
  local key="$1" val="$2"
  if grep -qE "^[[:space:]]*${key}=" .env 2>/dev/null; then
    sed -i.bak -E "s|^[[:space:]]*${key}=.*|${key}=${val}|" .env && rm -f .env.bak
  else
    printf '%s=%s\n' "$key" "$val" >> .env
  fi
  echo "  ✓ ${key}=${val}"
}

# pull_images — `$COMPOSE $COMPOSE_ARGS pull` con manejo del 403 de GHCR privado.
# Requiere COMPOSE, COMPOSE_ARGS y SCRIPT_DIR ya seteados por el caller.
# _pull_log — manda el dump del pull al log del run si hay uno (checklist.sh lo
# define); si no, a stdout como siempre. Así el camino feliz no escupe cientos
# de líneas de docker, pero la lib sigue sirviendo sourceada sola.
_pull_log() {
  if [ -n "${SANCHO_LOG:-}" ] && [ -f "${SANCHO_LOG:-}" ]; then
    printf '%s\n' "$1" >> "$SANCHO_LOG" 2>/dev/null && return 0
  fi
  printf '%s\n' "$1"
}

pull_images() {
  local out
  if out="$($COMPOSE $COMPOSE_ARGS pull 2>&1)"; then
    _pull_log "$out"; return 0
  fi
  # Camino de fallo: SIEMPRE a la vista. La guía de login a GHCR y el retry son
  # interactivos — esconderlos en el log rompería el acceso a la imagen privada.
  printf '%s\n' "$out"
  if printf '%s' "$out" | grep -qiE 'denied|unauthorized|403|forbidden'; then
    bold "La imagen de GHCR es privada (o no estás logueado)."
    echo "  Logueate y reintento:"
    echo "    echo <TU_PAT> | docker login ghcr.io -u <tu-usuario-github> --password-stdin"
    echo "    (el PAT necesita scope read:packages)"
    echo ""
    read -r -p "  Enter para reintentar (Ctrl-C para abortar)…" _ </dev/tty || true
    if out="$($COMPOSE $COMPOSE_ARGS pull 2>&1)"; then
      printf '%s\n' "$out"; return 0
    fi
    printf '%s\n' "$out"
  fi
  # Pull falló. Si hay Dockerfile en el dir (clone), `up` puede buildear; si no
  # (install de producto via tarball), no hay source → fatal.
  if [ -f "$SCRIPT_DIR/Dockerfile" ]; then
    echo "  ⚠ pull falló — se intentará build desde el source local"
    return 0
  fi
  die "No se pudo bajar la imagen y no hay source para buildear. Si es por acceso (imagen privada) logueate a GHCR (docker login ghcr.io); si es de red, verificá la conexión y reintentá."
}

# build_compose_args — setea la global COMPOSE_ARGS con el core + los overlays
# HABILITADOS: un overlay entra si su token está en .env (OD_API_TOKEN /
# YALC_API_TOKEN) o si el caller forzó WITH_OD/WITH_YALC=1 (flags de install).
#
# Importante: NO incluimos overlays "por las dudas". Un overlay sin configurar
# (p. ej. od.yml sin OD_API_TOKEN) hace fallar a compose porque ese archivo
# declara la variable como requerida. Para que down/destroy igual limpien
# cualquier contenedor que haya quedado de un overlay no-incluido, esos comandos
# pasan `--remove-orphans` (lo agrega el caller), que es lo que realmente
# destraba el "network ... is still in use".
build_compose_args() {
  COMPOSE_ARGS="-f docker-compose.yml"
  local od=0 yalc=0
  [ "${WITH_OD:-0}" = "1" ]   && od=1
  [ "${WITH_YALC:-0}" = "1" ] && yalc=1
  grep -qE '^OD_API_TOKEN=.+'   .env 2>/dev/null && od=1
  grep -qE '^YALC_API_TOKEN=.+' .env 2>/dev/null && yalc=1
  [ "$od" = "1" ]   && COMPOSE_ARGS="$COMPOSE_ARGS -f docker-compose.od.yml"
  [ "$yalc" = "1" ] && COMPOSE_ARGS="$COMPOSE_ARGS -f docker-compose.yalc.yml"
  return 0
}

# get_base_url — la URL donde el usuario accede a Mission Control (login),
# leída de .env (BASE_URL). Default localhost:3000.
get_base_url() {
  local url
  url="$(grep -E '^[[:space:]]*BASE_URL=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"'")"
  [ -n "$url" ] && printf '%s' "$url" || printf 'http://localhost:3000'
}

# ---------------------------------------------------------------------------
# Port-conflict handling. We only ever move the HOST side of a compose mapping
# (127.0.0.1:HOST:CONTAINER) — the container-internal ports are fixed, so nginx,
# config/instance.json, the gateway config and `next start -p` are untouched.
# ---------------------------------------------------------------------------

# _env_get KEY — active (uncommented) value of KEY in .env, empty if unset.
_env_get() {
  grep -E "^[[:space:]]*$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"'" || true
}

# port_in_use PORT — 0 if something is listening on 127.0.0.1:PORT, else 1.
# Prefers bash /dev/tcp (no external deps); falls back to ss/lsof when a build
# has /dev/tcp disabled.
port_in_use() {
  local port="$1"
  if ( exec 3<>"/dev/tcp/127.0.0.1/$port" ) 2>/dev/null; then
    return 0
  fi
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${port}\$" && return 0
    return 1
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN -n -P >/dev/null 2>&1 && return 0
  fi
  return 1
}

# next_free_port START — first free port >= START (scans up to +50, else dies).
next_free_port() {
  local p="$1" tries=0
  while port_in_use "$p"; do
    p=$((p + 1)); tries=$((tries + 1))
    [ "$tries" -gt 50 ] && die "No encontré un puerto libre cerca de $1 (probé 50)."
  done
  printf '%s' "$p"
}

# _stack_owns_port PORT — 0 if PORT is already published by THIS compose stack
# (so it's "ours" — reuse it instead of relocating on a re-up). Needs COMPOSE +
# COMPOSE_ARGS set (build_compose_args first).
_stack_owns_port() {
  local port="$1" ids
  ids="$($COMPOSE $COMPOSE_ARGS ps -q 2>/dev/null)" || return 1
  [ -n "$ids" ] || return 1
  # shellcheck disable=SC2086
  docker inspect --format \
    '{{range $p, $c := .NetworkSettings.Ports}}{{range $c}}{{.HostPort}} {{end}}{{end}}' \
    $ids 2>/dev/null | tr ' ' '\n' | grep -qx "$port"
}

# _point_url_var_to_port KEY PORT — repoint the port in .env's KEY to PORT, but
# ONLY when its value is a localhost URL. Never rewrites a real domain. Used to
# keep a BROWSER-facing URL in sync with its relocated host port (MC's BASE_URL/
# NEXTAUTH_URL, OD's OD_WEB_URL/OD_ALLOWED_ORIGINS). Inter-service URLs are NOT
# touched — those use the compose network (DNS name + fixed container port, e.g.
# yalc:3847, open-design:7456), so a host-port change never affects them.
_point_url_var_to_port() {
  local key="$1" port="$2" val
  val="$(_env_get "$key")"
  case "$val" in
    http://localhost:*|http://127.0.0.1:*|https://localhost:*|https://127.0.0.1:*)
      set_env_var "$key" "$(printf '%s' "$val" | sed -E "s|:[0-9]+|:$port|")" >/dev/null
      echo "  ↳ $key → :$port"
      ;;
  esac
}

# resolve_host_ports — relocate any busy host port to the next free one so `up`
# never fails with "port is already allocated". The OD and YALC ports are only
# checked when their overlay is active. When a port that has a BROWSER-facing URL
# moves, that URL follows (MC → BASE_URL/NEXTAUTH_URL, OD → OD_WEB_URL/
# OD_ALLOWED_ORIGINS) — inter-service URLs (yalc:3847, open-design:7456) are DNS +
# fixed container ports, so they're never touched. Persists choices to .env via
# set_env_var. Idempotent: a port this stack already owns is left alone.
resolve_host_ports() {
  local moved=0 od_active=0 yalc_active=0
  case " ${COMPOSE_ARGS:-} " in *" docker-compose.od.yml "*)   od_active=1 ;; esac
  case " ${COMPOSE_ARGS:-} " in *" docker-compose.yalc.yml "*) yalc_active=1 ;; esac
  local key default active cur want free
  while read -r key default active; do
    [ -n "$key" ] || continue
    [ "$active" = "1" ] || continue
    cur="$(_env_get "$key")"; want="${cur:-$default}"
    if port_in_use "$want" && ! _stack_owns_port "$want"; then
      free="$(next_free_port $((want + 1)))"
      echo "  ⚠ puerto $want en uso — reasigno $key=$free"
      set_env_var "$key" "$free" >/dev/null
      moved=1
      # Keep the matching browser-facing URL(s) in sync with the new host port.
      case "$key" in
        MC_PORT)
          _point_url_var_to_port BASE_URL "$free"
          _point_url_var_to_port NEXTAUTH_URL "$free" ;;
        OD_HOST_PORT)
          _point_url_var_to_port OD_WEB_URL "$free"
          _point_url_var_to_port OD_ALLOWED_ORIGINS "$free" ;;
      esac
    fi
  done <<EOF
MC_PORT 3000 1
GATEWAY_HOST_PORT 18789 1
LEGACY_HOST_PORT 18790 1
OD_HOST_PORT 7456 $od_active
YALC_PORT 3847 $yalc_active
EOF
  [ "$moved" = "1" ] && echo "  ✓ puertos reasignados para evitar conflictos" \
                     || echo "  ✓ puertos libres"
}

# _boot_phase SECONDS — texto orientativo de en qué anda el arranque, según el
# tiempo transcurrido. Da feedback de progreso para que no parezca colgado.
_boot_phase() {
  local w="$1"
  if   [ "$w" -lt 15 ];  then printf 'arrancando contenedores'
  elif [ "$w" -lt 35 ];  then printf 'iniciando el servidor de Mission Control'
  elif [ "$w" -lt 60 ];  then printf 'preparando la base de datos y migraciones'
  elif [ "$w" -lt 120 ]; then printf 'primer arranque: seedeando el home y skills (tarda un poco)'
  elif [ "$w" -lt 240 ]; then printf 'instalando plugins y preparando el runtime'
  else                        printf 'casi listo — el primer arranque puede tardar varios minutos, es normal'
  fi
}

# wait_until_healthy NAME [TIMEOUT_SECS] — espera a que el contenedor reporte
# healthy según su propio healthcheck. Va rotando texto de fase + recordando el
# comando de logs para dar feedback. En no-TTY emite una línea por cambio de
# fase. Códigos: 0 healthy · 1 timeout/desaparecido · 2 la imagen no define
# healthcheck (no se puede esperar readiness; el caller decide).
wait_until_healthy() {
  local name="$1" timeout="${2:-180}" waited=0 health tty=0
  [ -t 1 ] && tty=1
  local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
  local n=${#frames[@]} i=0 phase last_phase=""
  while :; do
    health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name" 2>/dev/null)" || health="missing"
    [ -z "$health" ] && health="missing"
    case "$health" in
      healthy) [ "$tty" = 1 ] && printf '\r\033[K'; return 0 ;;
      none)    [ "$tty" = 1 ] && printf '\r\033[K'; return 2 ;;
      missing) [ "$tty" = 1 ] && printf '\r\033[K'; return 1 ;;
    esac
    if [ "$waited" -ge "$timeout" ]; then
      # Timed out while the container is still booting (health=starting) — this
      # is NOT a failure (return 3), distinct from a missing/crashed container
      # (return 1). First boot can legitimately exceed the ceiling. (SAN-408)
      [ "$tty" = 1 ] && printf '\r\033[K'; return 3
    fi
    phase="$(_boot_phase "$waited")"
    if [ "$tty" = 1 ]; then
      i=$(( (i + 1) % n ))
      printf '\r\033[K  %s %s… (%ss · detalle en vivo: %s logs)' \
        "${frames[i]}" "$phase" "$waited" "${SANCHO_CMD:-./sancho}"
    elif [ "$phase" != "$last_phase" ]; then
      echo "  … ${phase}… (${waited}s · detalle: ${SANCHO_CMD:-./sancho} logs)"
      last_phase="$phase"
    fi
    sleep 2; waited=$((waited + 2))
  done
}
