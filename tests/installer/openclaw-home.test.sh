#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Sandbox: install.sh (shim) + el CLI sancho + la librería compose-env.sh.
# El helper no debe depender de docker para fijar OPENCLAW_HOME.
cp "$ROOT/install.sh" "$TMP/install.sh"
cp "$ROOT/sancho" "$TMP/sancho"
mkdir -p "$TMP/scripts" "$TMP/bin"
cp "$ROOT/scripts/compose-env.sh" "$TMP/scripts/compose-env.sh"
# wizard stub: no-op (se llama solo si falta .env; acá ya existe)
printf '#!/usr/bin/env bash\n' > "$TMP/scripts/wizard.sh"
# Shims para los prereqs de la sección 1 (no instalar nada real).
for c in docker openssl; do printf '#!/usr/bin/env bash\nexit 0\n' > "$TMP/bin/$c"; chmod +x "$TMP/bin/$c"; done
export PATH="$TMP/bin:$PATH"

# Caso A: .env sin OPENCLAW_HOME → se agrega con la ruta absoluta del dir.
printf 'NEXTAUTH_SECRET=x\n' > "$TMP/.env"
( cd "$TMP" && bash install.sh --no-up >/dev/null )
grep -q "^OPENCLAW_HOME=$TMP\$" "$TMP/.env" || { echo "FAIL A: no se fijó OPENCLAW_HOME"; cat "$TMP/.env"; exit 1; }
grep -q "^SNAPSHOT_DATA_DIR=$TMP/snapshots\$" "$TMP/.env" || { echo "FAIL A: no se fijó SNAPSHOT_DATA_DIR"; exit 1; }

# Caso B: .env con OPENCLAW_HOME preexistente → NO se pisa.
printf 'NEXTAUTH_SECRET=x\nOPENCLAW_HOME=/custom/home\n' > "$TMP/.env"
( cd "$TMP" && bash install.sh --no-up >/dev/null )
grep -q '^OPENCLAW_HOME=/custom/home$' "$TMP/.env" || { echo "FAIL B: se pisó OPENCLAW_HOME"; cat "$TMP/.env"; exit 1; }
[ "$(grep -c '^OPENCLAW_HOME=' "$TMP/.env")" -eq 1 ] || { echo "FAIL B: OPENCLAW_HOME duplicado"; exit 1; }

# Caso C: .env con OPENCLAW_HOME COMENTADO (como en .env.example) → se agrega el valor activo.
printf 'NEXTAUTH_SECRET=x\n# OPENCLAW_HOME=~/.openclaw\n' > "$TMP/.env"
( cd "$TMP" && bash install.sh --no-up >/dev/null )
grep -q "^OPENCLAW_HOME=$TMP\$" "$TMP/.env" || { echo "FAIL C: la línea comentada bloqueó el append"; cat "$TMP/.env"; exit 1; }
[ "$(grep -c '^OPENCLAW_HOME=' "$TMP/.env")" -eq 1 ] || { echo "FAIL C: OPENCLAW_HOME activo duplicado"; exit 1; }

echo "PASS"
