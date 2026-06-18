#!/usr/bin/env bash
# ============================================================================
# SanchoCMO — one-command installer
# ----------------------------------------------------------------------------
# Run from the repo root:
#   ./install.sh
#
# It checks prerequisites, runs the setup wizard (if .env is missing), and
# brings the stack up. Optional services (Open Design, YALC) stay off unless
# you opt in — see the wizard's closing checklist.
#
# Flags:
#   --no-up         Configure only; don't start containers.
#   --od            Also start the Open Design overlay (needs OD_API_TOKEN).
#   --yalc          Also start the YALC overlay.
#   --build         Build the core image from this source tree instead of
#                   pulling the published image (for hacking on a clone).
#   --force         Let the wizard regenerate an existing .env / config.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

WITH_OD=0; WITH_YALC=0; DO_UP=1; FORCE_ARG=""; BUILD=0
for arg in "$@"; do
  case "$arg" in
    --od) WITH_OD=1 ;;
    --yalc) WITH_YALC=1 ;;
    --no-up) DO_UP=0 ;;
    --build) BUILD=1 ;;
    --force) FORCE_ARG="--force" ;;
    -h|--help) grep '^# ' "$0" | sed 's/^# //'; exit 0 ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
die()  { printf '\033[31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# ----------------------------------------------------------------------------
# Functions
# ----------------------------------------------------------------------------

ensure_env_default() {  # ensure_env_default KEY VALUE
  local key="$1" val="$2"
  # Ya definido en el entorno → respetar, no tocar .env.
  [ -n "${!key:-}" ] && return 0
  # Ya presente y NO comentado en .env → respetar.
  grep -qE "^[[:space:]]*${key}=" .env 2>/dev/null && return 0
  printf '%s=%s\n' "$key" "$val" >> .env
  echo "  ✓ ${key}=${val} (added to .env)"
}

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

# Permite `source install.sh` en tests para definir las funciones sin ejecutar
# el flujo principal (ver tests/installer/). En ejecución normal es no-op.
[ -n "${SANCHO_PULL_TEST:-}" ] && return 0 2>/dev/null || true

bold "SanchoCMO installer"

# --- 1. Prerequisites --------------------------------------------------------
command -v docker >/dev/null 2>&1 || die "Docker is not installed. See https://docs.docker.com/get-docker/"
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  die "Docker Compose v2 is required (the 'docker compose' subcommand)."
fi
command -v openssl >/dev/null 2>&1 || die "openssl is required (used to generate secrets)."
echo "  ✓ docker, compose, openssl found"

# --- 2. Configure (wizard) ---------------------------------------------------
if [ ! -f .env ] || [ -n "$FORCE_ARG" ]; then
  echo ""
  bash scripts/wizard.sh $FORCE_ARG
else
  echo "  ✓ .env already present — skipping wizard (use --force to reconfigure)"
fi

# --- 2.5 Ensure OPENCLAW_HOME points at this install dir ---------------------
# The wizard writes .env + config/ into SCRIPT_DIR. The container reads config
# from OPENCLAW_HOME (default ~/.openclaw). For a product (non-git) or local
# clone install nobody sets it, so the preflight (SAN-138) can't find
# config/clients.json and boot fails. Pin it to SCRIPT_DIR here — but never
# clobber an existing value (the G4U deploy defines it). init-home.sh handles
# the git-vs-seed distinction, so SCRIPT_DIR is correct for both paths.
ensure_env_default OPENCLAW_HOME "$SCRIPT_DIR"
ensure_env_default SNAPSHOT_DATA_DIR "$SCRIPT_DIR/snapshots"

# --- 3. Bring the stack up ---------------------------------------------------
# The wizard turns Outreach on by provisioning a YALC_API_TOKEN; honor that
# here so `install.sh` (no flag) still brings the overlay up when the user
# opted in during setup. The explicit --yalc flag also forces it on.
if [ "$WITH_YALC" != "1" ] && grep -qE '^YALC_API_TOKEN=.+' .env 2>/dev/null; then
  WITH_YALC=1
  echo "  ✓ Outreach (YALC) enabled in .env — starting its overlay"
fi
COMPOSE_ARGS="-f docker-compose.yml"
[ "$WITH_OD" = "1" ]   && COMPOSE_ARGS="$COMPOSE_ARGS -f docker-compose.od.yml"
[ "$WITH_YALC" = "1" ] && COMPOSE_ARGS="$COMPOSE_ARGS -f docker-compose.yalc.yml"

if [ "$DO_UP" = "1" ]; then
  echo ""
  if [ "$BUILD" = "1" ]; then
    [ -f "$SCRIPT_DIR/Dockerfile" ] || die "--build necesita el source (Dockerfile) en $SCRIPT_DIR. En una instalación de producto (sin clonar) usá el modo normal (sin --build)."
    bold "Building & starting containers ($COMPOSE $COMPOSE_ARGS up -d --build)"
    # shellcheck disable=SC2086
    $COMPOSE $COMPOSE_ARGS up -d --build
  else
    bold "Pulling images ($COMPOSE $COMPOSE_ARGS pull)"
    pull_images
    bold "Starting containers ($COMPOSE $COMPOSE_ARGS up -d)"
    # shellcheck disable=SC2086
    $COMPOSE $COMPOSE_ARGS up -d
  fi
  echo ""
  bold "Done. Mission Control should be reachable at the BASE_URL you chose."
  echo "  Logs:   $COMPOSE $COMPOSE_ARGS logs -f sanchocmo"
  echo "  Update: $COMPOSE $COMPOSE_ARGS pull && $COMPOSE $COMPOSE_ARGS up -d"
  echo "  Stop:   $COMPOSE $COMPOSE_ARGS down"
else
  echo ""
  bold "Configured. Start it when ready:"
  echo "  $COMPOSE $COMPOSE_ARGS pull && $COMPOSE $COMPOSE_ARGS up -d"
fi
