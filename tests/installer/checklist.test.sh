#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# La lib se sourcea aislada (no necesita docker ni .env). Los tests corren sin
# TTY, así que ejercitan la degradación no-TTY — el camino de CI.
LIB="$ROOT/scripts/checklist.sh"
[ -f "$LIB" ] || { echo "FAIL: falta $LIB"; exit 1; }

cd "$TMP"
export SANCHO_LOG="$TMP/.sancho/last-install.log"

# ---------------------------------------------------------------------------
# Caso A: éxito → ✅ Etiqueta, exit 0, y el output del cmd va al LOG (no a
# stdout, que es todo el punto: no ensuciar la pantalla).
# ---------------------------------------------------------------------------
out="$( set +e; source "$LIB"; step_log_init; \
        step_run "Bajando cosas" -- bash -c 'echo ruido-de-docker; echo mas-ruido' 2>&1; \
        echo "RC=$?" )"
printf '%s' "$out" | grep -q '✅ Bajando cosas' || { echo "FAIL A: no imprimió ✅"; echo "$out"; exit 1; }
printf '%s' "$out" | grep -q 'RC=0' || { echo "FAIL A: no propagó exit 0"; echo "$out"; exit 1; }
printf '%s' "$out" | grep -q 'ruido-de-docker' && { echo "FAIL A: el ruido del cmd llegó a stdout"; echo "$out"; exit 1; }
[ -f "$SANCHO_LOG" ] || { echo "FAIL A: no se creó el log en $SANCHO_LOG"; exit 1; }
grep -q 'ruido-de-docker' "$SANCHO_LOG" || { echo "FAIL A: el output del cmd no quedó en el log"; cat "$SANCHO_LOG"; exit 1; }

# ---------------------------------------------------------------------------
# Caso B: fallo → ❌ Etiqueta, vuelca el tail del log a la vista, y propaga el
# exit code real (el caller decide si die).
# ---------------------------------------------------------------------------
out="$( set +e; source "$LIB"; step_log_init; \
        step_run "Rompiendo" -- bash -c 'echo pista-del-error >&2; exit 42' 2>&1; \
        echo "RC=$?" )"
printf '%s' "$out" | grep -q '❌ Rompiendo' || { echo "FAIL B: no imprimió ❌"; echo "$out"; exit 1; }
printf '%s' "$out" | grep -q 'RC=42' || { echo "FAIL B: no propagó el exit code 42"; echo "$out"; exit 1; }
printf '%s' "$out" | grep -q 'pista-del-error' || { echo "FAIL B: no volcó el tail del log en el fallo"; echo "$out"; exit 1; }

# ---------------------------------------------------------------------------
# Caso C: sin TTY no se emiten secuencias ANSI (ni spinner ni \033[K).
# ---------------------------------------------------------------------------
out="$( set +e; source "$LIB"; step_log_init; step_run "Sin tty" -- true 2>&1 )"
printf '%s' "$out" | grep -q $'\033' && { echo "FAIL C: emitió ANSI sin TTY"; printf '%s' "$out" | cat -v; exit 1; }
printf '%s' "$out" | grep -q '✅ Sin tty' || { echo "FAIL C: falta la línea del paso"; echo "$out"; exit 1; }

# ---------------------------------------------------------------------------
# Caso D: SANCHO_VERBOSE=1 → el output del cmd se ve en vivo (no sólo en el log).
# ---------------------------------------------------------------------------
out="$( set +e; export SANCHO_VERBOSE=1; source "$LIB"; step_log_init; \
        step_run "Verboso" -- bash -c 'echo detalle-en-vivo' 2>&1 )"
printf '%s' "$out" | grep -q 'detalle-en-vivo' || { echo "FAIL D: verbose no streameó el output"; echo "$out"; exit 1; }

# ---------------------------------------------------------------------------
# Caso E: step_log_init trunca el log viejo (cada install arranca limpio).
# ---------------------------------------------------------------------------
( source "$LIB"; step_log_init; printf 'basura-vieja\n' >> "$SANCHO_LOG" )
( source "$LIB"; step_log_init )
grep -q 'basura-vieja' "$SANCHO_LOG" && { echo "FAIL E: step_log_init no truncó el log"; exit 1; }

echo "PASS"
