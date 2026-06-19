# One-Command Installer (sin clonar) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir levantar SanchoCMO con un solo comando (`curl … | bash`) usando la imagen publicada en GHCR, sin clonar el repo.

**Architecture:** Un bootstrap `get.sh` baja un tarball de runtime versionado (solo archivos de orquestación) generado por CI en cada release, lo extrae en `~/sanchocmo` y ejecuta `install.sh`. `install.sh` gana dos arreglos: fija `OPENCLAW_HOME` al dir de instalación (sin esto el preflight no encuentra `config/`) y maneja el 403 de la imagen privada guiando el `docker login`.

**Tech Stack:** Bash, Docker Compose v2, GitHub Actions (release event), GHCR.

## Global Constraints

- Shell: Bash con `set -euo pipefail`. Pasa `shellcheck` sin warnings nuevos.
- El tarball de runtime contiene EXACTAMENTE: `docker-compose.yml`, `docker-compose.od.yml`, `docker-compose.yalc.yml`, `install.sh`, `scripts/wizard.sh`, `.env.example`. NADA de `config/` (el wizard genera `config/*.json`), ni framework, ni source, ni Dockerfile.
- Nombre del asset: `sancho-runtime-<tag>.tar.gz` (ej. `sancho-runtime-v0.8.0.tar.gz`).
- Imagen: `ghcr.io/growth4u-systems/sanchocmo` (hoy privada; el flujo debe degradar guiando login, sin romper cuando pase a pública).
- Dir de instalación por defecto: `~/sanchocmo`, override con `SANCHO_DIR`. No clobber salvo `SANCHO_FORCE=1`.
- `install.sh` NO debe pisar un `OPENCLAW_HOME` ya definido (en `.env` o en el entorno) — el deploy de G4U lo define.
- Conventional Commits, cada commit termina con `Refs SAN-242` y el trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Tests de shell: scripts `tests/installer/*.test.sh` autocontenidos (assert + exit code), corren con `bash <archivo>`; mockean `docker` vía un shim en `PATH`.

---

### Task 1: `scripts/package-runtime.sh` — empaquetar el tarball de runtime

**Files:**
- Create: `scripts/package-runtime.sh`
- Test: `tests/installer/package-runtime.test.sh`

**Interfaces:**
- Produces: ejecutable `scripts/package-runtime.sh [OUT_PATH]` — escribe el tarball en `OUT_PATH` (default `./sancho-runtime.tar.gz`), resolviendo rutas relativas a la raíz del repo. Exit 0 en éxito.

- [ ] **Step 1: Escribir el test que falla**

```bash
# tests/installer/package-runtime.test.sh
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OUT="$TMP/rt.tar.gz"

bash "$ROOT/scripts/package-runtime.sh" "$OUT"

[ -f "$OUT" ] || { echo "FAIL: no se creó el tarball"; exit 1; }
got="$(tar -tzf "$OUT" | sort)"
want="$(printf '%s\n' \
  .env.example docker-compose.od.yml docker-compose.yalc.yml \
  docker-compose.yml install.sh scripts/wizard.sh | sort)"
[ "$got" = "$want" ] || { echo "FAIL: contenido inesperado"; echo "GOT:"; echo "$got"; echo "WANT:"; echo "$want"; exit 1; }
# Negativos: nada de source ni framework
if tar -tzf "$OUT" | grep -qE '^(src/|skills/|plugins/|workspace|Dockerfile|docker/init-home)'; then
  echo "FAIL: el tarball incluyó source/framework"; exit 1
fi
echo "PASS"
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `bash tests/installer/package-runtime.test.sh`
Expected: FAIL — `scripts/package-runtime.sh` no existe (`No such file or directory`).

- [ ] **Step 3: Implementar `scripts/package-runtime.sh`**

```bash
#!/usr/bin/env bash
# Empaqueta SOLO los archivos de orquestación de runtime en un tarball, para
# que `get.sh` los entregue sin clonar el repo. La app va en la imagen GHCR.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT_DIR/sancho-runtime.tar.gz}"

FILES=(
  docker-compose.yml
  docker-compose.od.yml
  docker-compose.yalc.yml
  install.sh
  scripts/wizard.sh
  .env.example
)

for f in "${FILES[@]}"; do
  [ -f "$ROOT_DIR/$f" ] || { echo "ERROR: falta $f en el repo" >&2; exit 1; }
done

# -C para que las rutas dentro del tar sean relativas a la raíz (sin prefijo).
tar -czf "$OUT" -C "$ROOT_DIR" "${FILES[@]}"
echo "Wrote $OUT"
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `chmod +x scripts/package-runtime.sh && bash tests/installer/package-runtime.test.sh`
Expected: `PASS`

- [ ] **Step 5: Commit**

```bash
git add scripts/package-runtime.sh tests/installer/package-runtime.test.sh
git commit -m "feat(installer): script para empaquetar tarball de runtime

Refs SAN-242

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: CI — publicar el tarball como asset del release

**Files:**
- Modify: `.github/workflows/docker-image.yml` (agregar job `runtime-tarball`)

**Interfaces:**
- Consumes: `scripts/package-runtime.sh` (Task 1).
- Produces: en cada `release: published`, el asset `sancho-runtime-<tag>.tar.gz` queda subido al GitHub Release.

- [ ] **Step 1: Agregar el job al final de `docker-image.yml`**

Después del job `merge` (línea 159), agregar:

```yaml
  runtime-tarball:
    name: Attach runtime tarball to release
    # Solo en releases reales (no en workflow_dispatch de prueba).
    if: github.event_name == 'release'
    runs-on: ubuntu-latest
    permissions:
      contents: write   # gh release upload
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.release.tag_name }}

      - name: Build runtime tarball
        run: |
          bash scripts/package-runtime.sh \
            "sancho-runtime-${{ github.event.release.tag_name }}.tar.gz"

      - name: Upload to release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh release upload "${{ github.event.release.tag_name }}" \
            "sancho-runtime-${{ github.event.release.tag_name }}.tar.gz" \
            --clobber
```

- [ ] **Step 2: Validar la sintaxis del workflow**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/docker-image.yml')); print('YAML OK')"`
Expected: `YAML OK`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/docker-image.yml
git commit -m "ci(release): adjuntar tarball de runtime al release

Refs SAN-242

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `install.sh` — fijar `OPENCLAW_HOME` al dir de instalación

**Files:**
- Modify: `install.sh` (nueva sección entre la 2 (wizard) y la 3 (up), ~línea 61)
- Test: `tests/installer/openclaw-home.test.sh`

**Interfaces:**
- Produces: tras correr `install.sh`, `.env` contiene `OPENCLAW_HOME=<abs install dir>` y `SNAPSHOT_DATA_DIR=<abs install dir>/snapshots` SOLO si no estaban definidos (ni en `.env` ni en el entorno).

- [ ] **Step 1: Escribir el test que falla**

```bash
# tests/installer/openclaw-home.test.sh
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Sandbox: copia install.sh y un .env mínimo; el helper no debe depender de docker.
cp "$ROOT/install.sh" "$TMP/install.sh"
mkdir -p "$TMP/scripts" "$TMP/bin"
# wizard stub: no-op (install.sh lo llama solo si falta .env; acá ya existe)
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

echo "PASS"
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `bash tests/installer/openclaw-home.test.sh`
Expected: `FAIL A` — `install.sh` todavía no escribe `OPENCLAW_HOME`.

- [ ] **Step 3: Implementar la sección en `install.sh`**

Insertar después del bloque del wizard (tras la línea 61, antes de `# --- 3. Bring the stack up`):

```bash
# --- 2.5 Ensure OPENCLAW_HOME points at this install dir ---------------------
# The wizard writes .env + config/ into SCRIPT_DIR. The container reads config
# from OPENCLAW_HOME (default ~/.openclaw). For a product (non-git) or local
# clone install nobody sets it, so the preflight (SAN-138) can't find
# config/clients.json and boot fails. Pin it to SCRIPT_DIR here — but never
# clobber an existing value (the G4U deploy defines it). init-home.sh handles
# the git-vs-seed distinction, so SCRIPT_DIR is correct for both paths.
ensure_env_default() {  # ensure_env_default KEY VALUE
  local key="$1" val="$2"
  # Ya definido en el entorno → respetar, no tocar .env.
  [ -n "${!key:-}" ] && return 0
  # Ya presente y NO comentado en .env → respetar.
  grep -qE "^[[:space:]]*${key}=" .env 2>/dev/null && return 0
  printf '%s=%s\n' "$key" "$val" >> .env
  echo "  ✓ ${key}=${val} (added to .env)"
}
ensure_env_default OPENCLAW_HOME "$SCRIPT_DIR"
ensure_env_default SNAPSHOT_DATA_DIR "$SCRIPT_DIR/snapshots"
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `bash tests/installer/openclaw-home.test.sh`
Expected: `PASS`

- [ ] **Step 5: shellcheck + commit**

```bash
shellcheck install.sh || true   # sin warnings nuevos
git add install.sh tests/installer/openclaw-home.test.sh
git commit -m "fix(installer): fijar OPENCLAW_HOME al dir de instalación

Sin esto el contenedor lee config desde ~/.openclaw != dir del wizard y el
preflight no encuentra config/clients.json. No pisa un valor preexistente.

Refs SAN-242

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `install.sh` — manejar pull 403 (imagen privada) con guía de login

**Files:**
- Modify: `install.sh` (bloque del pull, líneas 82-88)
- Test: `tests/installer/pull-403.test.sh`

**Interfaces:**
- Consumes: variable `COMPOSE`, `COMPOSE_ARGS`, `SCRIPT_DIR` ya definidas en `install.sh`.
- Produces: función `pull_images` que, ante salida con `denied`/`unauthorized`/`403`, imprime la guía de `docker login ghcr.io` y reintenta una vez; si el dir no tiene `Dockerfile` (install de producto) y el pull sigue fallando, sale con error (no hay source para buildear).

- [ ] **Step 1: Escribir el test que falla**

```bash
# tests/installer/pull-403.test.sh
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Extraer solo la función pull_images de install.sh para testearla aislada.
# (install.sh debe definirla; la sourceamos con un guard que evita ejecutar main.)
cp "$ROOT/install.sh" "$TMP/install.sh"

# Shim de docker que simula 403 en `compose pull`.
mkdir -p "$TMP/bin"
cat > "$TMP/bin/docker" <<'SH'
#!/usr/bin/env bash
if [ "$1" = "compose" ]; then
  for a in "$@"; do [ "$a" = "pull" ] && { echo "denied: requested access to the resource is denied" >&2; exit 1; }; done
  exit 0   # `up` u otros: ok
fi
exit 0
SH
chmod +x "$TMP/bin/docker"

# Sin Dockerfile en el dir → install de producto → un pull 403 persistente es fatal.
out="$( cd "$TMP" && PATH="$TMP/bin:$PATH" SANCHO_PULL_TEST=1 bash -c '
  source ./install.sh           # debe definir funciones y NO correr main bajo SANCHO_PULL_TEST
  COMPOSE="docker compose"; COMPOSE_ARGS="-f docker-compose.yml"; SCRIPT_DIR="'"$TMP"'"
  pull_images
' 2>&1 )" && rc=0 || rc=$?

echo "$out" | grep -qi 'docker login ghcr.io' || { echo "FAIL: no mostró la guía de login"; echo "$out"; exit 1; }
[ "$rc" -ne 0 ] || { echo "FAIL: debía salir con error en install de producto"; exit 1; }
echo "PASS"
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `bash tests/installer/pull-403.test.sh`
Expected: FAIL — `install.sh` no define `pull_images` ni el guard `SANCHO_PULL_TEST`.

- [ ] **Step 3: Refactor del pull en `install.sh`**

Estructura objetivo de `install.sh`: helpers (`bold`/`die`) → **definiciones de función** (`ensure_env_default` de Task 3 + `pull_images`) → **guard de test** → flujo main (secciones 1, 2, 2.5, 3). El guard debe ir DESPUÉS de las funciones para que `source` las defina antes de cortar.

Mover las funciones `ensure_env_default` (Task 3) y `pull_images` a un bloque justo después de los helpers `bold`/`die` (líneas 38-39), y colocar el guard inmediatamente después de ese bloque (antes de `bold "SanchoCMO installer"`):

```bash
# Permite `source install.sh` en tests para definir las funciones sin ejecutar
# el flujo principal (ver tests/installer/). En ejecución normal es no-op.
[ -n "${SANCHO_PULL_TEST:-}" ] && return 0 2>/dev/null || true
```

Definición de `pull_images` (en el bloque de funciones):

```bash
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
  die "No se pudo bajar la imagen y no hay source para buildear. Logueate a GHCR y reintentá."
}
```

Y en la sección 3, reemplazar las dos líneas del pull por:

```bash
    bold "Pulling images ($COMPOSE $COMPOSE_ARGS pull)"
    pull_images
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `bash tests/installer/pull-403.test.sh`
Expected: `PASS`

- [ ] **Step 5: Regresión del test de Task 3 (el guard no rompe `--no-up`)**

Run: `bash tests/installer/openclaw-home.test.sh`
Expected: `PASS` (el guard solo actúa con `SANCHO_PULL_TEST=1`, que el test de Task 3 no setea).

- [ ] **Step 6: shellcheck + commit**

```bash
shellcheck install.sh || true
git add install.sh tests/installer/pull-403.test.sh
git commit -m "feat(installer): guiar docker login ante imagen privada (403)

Refs SAN-242

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `get.sh` — bootstrap de un comando

**Files:**
- Create: `get.sh` (raíz del repo)
- Test: `tests/installer/get.test.sh`

**Interfaces:**
- Consumes: el tarball `sancho-runtime-<tag>.tar.gz` (Task 1/2). Para testear sin un release real, soporta `SANCHO_RUNTIME_TARBALL=<path local>` (salta la descarga).
- Produces: deja el runtime extraído en `SANCHO_DIR` (default `~/sanchocmo`) y ejecuta `./install.sh`. Variables: `SANCHO_VERSION`, `SANCHO_DIR`, `SANCHO_FORCE`, `SANCHO_RUNTIME_TARBALL`.

- [ ] **Step 1: Escribir el test que falla**

```bash
# tests/installer/get.test.sh
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
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `bash tests/installer/get.test.sh`
Expected: FAIL — `get.sh` no existe.

- [ ] **Step 3: Implementar `get.sh`**

```bash
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
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `chmod +x get.sh && bash tests/installer/get.test.sh`
Expected: `PASS`

- [ ] **Step 5: shellcheck + commit**

```bash
shellcheck get.sh || true
git add get.sh tests/installer/get.test.sh
git commit -m "feat(installer): get.sh bootstrap de un comando sin clonar

Refs SAN-242

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Docs — documentar el one-liner

**Files:**
- Modify: `README.md` (sección Quick Start, ~líneas 83-97)
- Modify: `docs/INSTALL.md` (encabezado, líneas 3-11)

**Interfaces:** ninguna (documentación).

- [ ] **Step 1: Actualizar `docs/INSTALL.md`**

Reemplazar el bloque de "fastest path" (líneas 5-8) por el one-liner, manteniendo el camino de clone como alternativa de desarrollo:

````markdown
**Un comando (recomendado, sin clonar):**

```bash
curl -fsSL https://raw.githubusercontent.com/Growth4U-systems/sanchocmo-openclaw/main/get.sh | bash
```

Baja el runtime del último release a `~/sanchocmo` (override `SANCHO_DIR`),
corre el wizard y levanta el stack. Si la imagen de GHCR todavía es privada, el
instalador te guía el `docker login` y reintenta.

**Para desarrollo (clonando):**

```bash
git clone https://github.com/Growth4U-systems/sanchocmo-openclaw.git sanchocmo && cd sanchocmo
./install.sh
```
````

- [ ] **Step 2: Actualizar `README.md`**

En la sección Quick Start, anteponer el one-liner como opción 1 y dejar el clone como opción de desarrollo (mismo contenido que INSTALL.md, formato del README).

- [ ] **Step 3: Verificar enlaces/sintaxis**

Run: `grep -n "get.sh" README.md docs/INSTALL.md`
Expected: aparece el one-liner en ambos archivos.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/INSTALL.md
git commit -m "docs: documentar instalador de un comando (get.sh)

Refs SAN-242

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Verificación E2E en máquina limpia (acceptance)

**Files:** ninguno (verificación manual/integración).

**Interfaces:** Consumes todo lo anterior.

- [ ] **Step 1: Simular install de producto sin release real**

```bash
# Fixture local del tarball (como lo haría CI):
bash scripts/package-runtime.sh /tmp/sancho-runtime.tar.gz
rm -rf /tmp/sancho-e2e-home
SANCHO_DIR=/tmp/sancho-e2e-home SANCHO_RUNTIME_TARBALL=/tmp/sancho-runtime.tar.gz \
  WIZARD_ASSUME_YES=1 PROVIDER=anthropic ANTHROPIC_API_KEY=sk-ant-TEST \
  ADMIN_EMAIL_DOMAIN=acme.com DB_MODE=local FIRST_BRAND_SLUG=acme \
  FIRST_BRAND_NAME="Acme" bash ./get.sh --no-up
```

- [ ] **Step 2: Verificar el estado generado**

Run:
```bash
grep -q "^OPENCLAW_HOME=/tmp/sancho-e2e-home$" /tmp/sancho-e2e-home/.env && echo "OPENCLAW_HOME OK"
test -f /tmp/sancho-e2e-home/config/clients.json && echo "clients.json OK"
python3 -c "import json;json.load(open('/tmp/sancho-e2e-home/config/clients.json'))" && echo "JSON válido"
```
Expected: las tres líneas OK.

- [ ] **Step 3 (opcional, requiere PAT y red): boot real**

```bash
echo "$GHCR_PAT" | docker login ghcr.io -u "$GH_USER" --password-stdin
( cd /tmp/sancho-e2e-home && docker compose -f docker-compose.yml up -d )
# Esperar healthy y validar login con el adminToken de config/clients.json.
docker compose -f /tmp/sancho-e2e-home/docker-compose.yml ps
```
Expected: contenedor `healthy`; sin error de preflight en los logs.

- [ ] **Step 4: Limpieza**

```bash
docker compose -f /tmp/sancho-e2e-home/docker-compose.yml down 2>/dev/null || true
rm -rf /tmp/sancho-e2e-home /tmp/sancho-runtime.tar.gz
```

---

## Notas de ejecución

- Trabajar en el worktree `nahuel/san-242-…`. PR con base **`staging`**, squash.
- El step de CI (Task 2) solo se ejercita de verdad en un release; su validación pre-merge es la sintaxis YAML + el test del packager (Task 1).
- Correcciones al spec aplicadas acá: el tarball NO incluye `config/*` (el wizard los genera) y el pull 403 es fatal en installs de producto (sin Dockerfile).
