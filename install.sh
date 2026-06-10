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
    bold "Building & starting containers ($COMPOSE $COMPOSE_ARGS up -d --build)"
    # shellcheck disable=SC2086
    $COMPOSE $COMPOSE_ARGS up -d --build
  else
    # Pull the published image(s) first (best-effort). If the pull fails —
    # e.g. the GHCR package is still private, or you're offline — `up -d`
    # falls back to building `sanchocmo` from this source tree (it has a
    # `build:` directive), so the install still completes.
    bold "Pulling images ($COMPOSE $COMPOSE_ARGS pull)"
    # shellcheck disable=SC2086
    $COMPOSE $COMPOSE_ARGS pull || echo "  ⚠ pull failed — will build from source if needed"
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
