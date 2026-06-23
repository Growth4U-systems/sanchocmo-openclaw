#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Tarball local de fixture (reusa el packager real).
bash "$ROOT/scripts/package-runtime.sh" "$TMP/rt.tar.gz" >/dev/null

# Shim de docker (get.sh chequea prereqs) + install.sh stub que marca que corrió.
mkdir -p "$TMP/bin"
for c in docker curl tar; do printf '#!/usr/bin/env bash\nexit 0\n' > "$TMP/bin/$c"; chmod +x "$TMP/bin/$c"; done
# tar real lo necesitamos para extraer: dejamos tar del sistema, shimeamos solo docker/curl.
rm "$TMP/bin/tar"

DEST="$TMP/sanchocmo"
out="$( PATH="$TMP/bin:$PATH" SANCHO_DIR="$DEST" SANCHO_RUNTIME_TARBALL="$TMP/rt.tar.gz" \
        SANCHO_SKIP_INSTALL=1 bash "$ROOT/get.sh" 2>&1 )"

[ -f "$DEST/install.sh" ]        || { echo "FAIL: no extrajo install.sh"; echo "$out"; exit 1; }
[ -f "$DEST/scripts/wizard.sh" ] || { echo "FAIL: no extrajo scripts/wizard.sh"; exit 1; }
[ -f "$DEST/docker-compose.yml" ]|| { echo "FAIL: no extrajo docker-compose.yml"; exit 1; }
echo "PASS"
