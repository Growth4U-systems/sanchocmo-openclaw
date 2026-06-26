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
pull_images() {
  local out
  if out="$($COMPOSE $COMPOSE_ARGS pull 2>&1)"; then
    printf '%s\n' "$out"; return 0
  fi
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

# build_compose_args MODE — setea la global COMPOSE_ARGS.
#   enabled : core + overlays HABILITADOS (token en .env, o WITH_OD/WITH_YALC=1).
#             Para up/update/install — respeta el opt-in del usuario.
#   all     : core + TODOS los overlays que existan en disco, para que down/etc.
#             alcancen cualquier contenedor y la red siempre se limpie.
build_compose_args() {
  local mode="${1:-enabled}"
  COMPOSE_ARGS="-f docker-compose.yml"
  local od=0 yalc=0
  if [ "$mode" = "all" ]; then
    [ -f docker-compose.od.yml ]   && od=1
    [ -f docker-compose.yalc.yml ] && yalc=1
  else
    [ "${WITH_OD:-0}" = "1" ]   && od=1
    [ "${WITH_YALC:-0}" = "1" ] && yalc=1
    grep -qE '^OD_API_TOKEN=.+'   .env 2>/dev/null && od=1
    grep -qE '^YALC_API_TOKEN=.+' .env 2>/dev/null && yalc=1
  fi
  [ "$od" = "1" ]   && COMPOSE_ARGS="$COMPOSE_ARGS -f docker-compose.od.yml"
  [ "$yalc" = "1" ] && COMPOSE_ARGS="$COMPOSE_ARGS -f docker-compose.yalc.yml"
  return 0
}
