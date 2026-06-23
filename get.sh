#!/usr/bin/env bash
# ============================================================================
# SanchoCMO — bootstrap de un comando (sin clonar el repo)
#   curl -fsSL https://raw.githubusercontent.com/Growth4U-systems/sanchocmo-openclaw/main/get.sh | bash
#
# Baja el tarball de runtime del último release (o SANCHO_VERSION), lo extrae en
# ~/sanchocmo (o SANCHO_DIR) y corre install.sh (wizard + docker compose up).
#
# Env:
#   SANCHO_VERSION          tag a instalar (default: último release)
#   SANCHO_DIR              dir de instalación (default: ~/sanchocmo)
#   SANCHO_FORCE=1          permitir instalar sobre un dir no vacío
#   SANCHO_RUNTIME_TARBALL  path local a un tarball (salta la descarga; testing)
# ============================================================================
set -euo pipefail

REPO="Growth4U-systems/sanchocmo-openclaw"
bold() { printf '\033[1m%s\033[0m\n' "$*"; }
die()  { printf '\033[31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

bold "SanchoCMO — instalador"

# 1. Prerrequisitos de host.
command -v docker >/dev/null 2>&1 || die "Falta Docker. https://docs.docker.com/get-docker/"
docker compose version >/dev/null 2>&1 || die "Falta Docker Compose v2 (subcomando 'docker compose')."
command -v tar >/dev/null 2>&1 || die "Falta 'tar'."
[ -n "${SANCHO_RUNTIME_TARBALL:-}" ] || command -v curl >/dev/null 2>&1 || die "Falta 'curl'."

# 2. Dir de instalación (no clobber).
DEST="${SANCHO_DIR:-$HOME/sanchocmo}"
if [ -e "$DEST" ] && [ -n "$(ls -A "$DEST" 2>/dev/null || true)" ] && [ -z "${SANCHO_FORCE:-}" ]; then
  die "$DEST ya existe y no está vacío. Usá SANCHO_DIR=otro o SANCHO_FORCE=1."
fi
mkdir -p "$DEST"

# 3. Obtener el tarball.
TARBALL="$(mktemp)"; trap 'rm -f "$TARBALL"' EXIT
if [ -n "${SANCHO_RUNTIME_TARBALL:-}" ]; then
  cp "$SANCHO_RUNTIME_TARBALL" "$TARBALL"
else
  VERSION="${SANCHO_VERSION:-}"
  if [ -z "$VERSION" ]; then
    VERSION="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
      | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')"
    [ -n "$VERSION" ] || die "No pude resolver el último release. Pasá SANCHO_VERSION=vX.Y.Z."
  fi
  URL="https://github.com/$REPO/releases/download/$VERSION/sancho-runtime-$VERSION.tar.gz"
  bold "Bajando runtime $VERSION"
  curl -fSL --progress-bar "$URL" -o "$TARBALL" \
    || die "No pude bajar $URL (¿existe ese release/asset?)."
fi

# 4. Extraer.
tar -xzf "$TARBALL" -C "$DEST"
[ -f "$DEST/install.sh" ] || die "El tarball no contiene install.sh (asset corrupto?)."
chmod +x "$DEST/install.sh"

# 5. Entregar a install.sh.
[ -n "${SANCHO_SKIP_INSTALL:-}" ] && { bold "Runtime listo en $DEST (install salteado)."; exit 0; }
bold "Configurando ($DEST)"
cd "$DEST"
exec ./install.sh "$@"
