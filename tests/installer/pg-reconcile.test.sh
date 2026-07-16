#!/usr/bin/env bash
# The bundled Postgres service must self-heal its role password on every boot
# (SAN-482). Postgres only applies POSTGRES_PASSWORD on the first init of an
# empty data dir, so once the `postgres_data` volume exists its stored password
# never changes. If `.env`'s POSTGRES_PASSWORD ever diverges from the volume
# (a re-install / fresh `curl` install regenerates `.env` while the global
# volume survives), the app's DATABASE_URL stops matching the role and every
# request dies with a silent `28P01 password authentication failed`.
#
# The fix is an entrypoint on the `postgres` service that reconciles the role
# password to POSTGRES_PASSWORD on each boot, via the local unix-socket `trust`
# connection (which authenticates regardless of the stored password). This test
# guards the shape of that entrypoint so a refactor can't silently drop it.
#
# Static check (greps the compose file) — it does not boot Postgres, so it runs
# in CI with no Docker. The live heal is exercised manually per the SAN-482
# verification steps.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

COMPOSE="$ROOT/docker-compose.yml"
[ -f "$COMPOSE" ] || { echo "FAIL: no encontré $COMPOSE"; exit 1; }

# Extract just the `postgres:` service block (from its key to the next
# top-level `volumes:` key), so assertions can't accidentally match another
# service (e.g. the app) elsewhere in the file.
block="$(awk '/^  postgres:/{f=1} f{print} /^volumes:/{if(f)exit}' "$COMPOSE")"
[ -n "$block" ] || { echo "FAIL: no pude aislar el bloque del servicio postgres"; exit 1; }

rc=0
check() { # <descripción> <regex ERE>
  if printf '%s\n' "$block" | grep -qE "$2"; then
    echo "PASS: $1"
  else
    echo "FAIL: $1 (no matcheó /$2/ en el servicio postgres)"
    rc=1
  fi
}

# 1. El servicio sigue gateado a local-db (nunca corre en installs externos/Neon).
check "postgres está gateado por el profile local-db" '^[[:space:]]*profiles:[[:space:]]*\[?"?local-db'

# 2. Hay un entrypoint custom que reconcilia el rol con ALTER ROLE ... PASSWORD.
check "el entrypoint corre ALTER ROLE ... WITH PASSWORD" 'ALTER ROLE .* WITH PASSWORD'

# 3. La reconciliación usa la password del entorno (no un literal hardcodeado).
check "usa \$POSTGRES_PASSWORD del entorno" "WITH PASSWORD '\\\$\\\$POSTGRES_PASSWORD'"

# 4. Conecta por el socket local (ruta trust), no por red — así funciona aunque
#    la password guardada haya divergido.
check "reconcilia vía socket local /var/run/postgresql (trust)" '/var/run/postgresql'

# 5. El arranque normal de Postgres se preserva (delega en el entrypoint oficial).
check "sigue delegando en docker-entrypoint.sh postgres" 'exec docker-entrypoint\.sh postgres'

[ "$rc" -eq 0 ] && echo "PASS: el servicio postgres auto-repara la password del rol al boot"
exit "$rc"
