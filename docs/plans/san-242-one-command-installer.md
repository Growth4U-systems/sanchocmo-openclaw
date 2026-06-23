# Diseño: instalador real de un comando (sin clonar) — SAN-242

**Estado:** propuesto · **Fecha:** 2026-06-18 · **Issue:** SAN-242
**Relacionado:** SAN-93 (install.sh+wizard clone), SAN-111 (seed self-contained),
SAN-138 (preflight), SAN-140 (imagen GHCR), SAN-146 (seed/git coupling)

## Problema

El "un comando" actual (SAN-93) requiere **clonar el repo** para obtener
`install.sh`, `docker-compose.yml` y el wizard. Un usuario final que solo quiere
probar el producto no debería clonar un repo de desarrollo. La imagen ya está
publicada en GHCR (SAN-140) y es self-contained (SAN-111), así que el runtime no
necesita el source — solo unos pocos archivos de orquestación.

Además, al trazar el arranque se encontró un **bug de configuración** que hoy
queda oculto en el deploy de G4U: el wizard escribe `config/clients.json` en el
**directorio de instalación**, pero el contenedor lee la config desde
`OPENCLAW_HOME` (default `~/.openclaw`). Si `OPENCLAW_HOME` ≠ dir de instalación,
el preflight (SAN-138) no encuentra `config/clients.json` y el arranque **falla**.
En el deploy no se nota porque ahí `OPENCLAW_HOME` *es* el checkout. Una
instalación local (clone o producto) sin setear esa var rompe.

## Objetivo

Levantar SanchoCMO con un solo comando, sin clonar, usando la imagen publicada:

```bash
curl -fsSL https://raw.githubusercontent.com/Growth4U-systems/sanchocmo-openclaw/main/get.sh | bash
```

Mientras la imagen siga privada, el flujo **guía el `docker login`** (detecta 403
y reintenta). Cuando se haga pública, el mismo comando funciona sin cambios.

## No-objetivos (YAGNI)

- Hacer pública la imagen (operación/decisión aparte).
- Checksums firmados del tarball, auto-update del instalador.
- Tocar el wizard interactivo (ya funciona; ver "Interactividad").

## Arquitectura — 4 componentes

### 1. `get.sh` — bootstrap (nuevo, en la raíz del repo)

Thin downloader, idempotente, sin estado propio. Responsabilidades:

1. Prerrequisitos de host: `docker`, `docker compose` v2, `curl`, `tar`.
   (Falla temprano y claro si falta alguno.)
2. Resolver la **versión**: `SANCHO_VERSION` si está seteada; si no, el último
   release (GitHub API `releases/latest`).
3. Resolver el **dir de instalación**: `SANCHO_DIR` o, por defecto, `~/sanchocmo`.
   Si ya existe y no está vacío → abortar con mensaje (no clobber), salvo
   `SANCHO_FORCE=1`.
4. Bajar el **tarball de runtime** del release (asset
   `sancho-runtime-<version>.tar.gz`) y extraerlo en el dir de instalación.
5. `cd "$SANCHO_DIR" && exec ./install.sh "$@"` (pasa flags como `--od`/`--yalc`).

**Distribución de `get.sh`:** vive en la raíz del repo (público), servido por
`raw.githubusercontent.com/.../<branch>/get.sh`. Es la única pieza que se baja
"a pelo"; todo lo demás viene del tarball versionado.

### 2. Tarball de runtime versionado (cambio de CI)

Nuevo step en el workflow de release: empaqueta **solo** los archivos de
orquestación en `sancho-runtime-<version>.tar.gz` y lo sube como asset del
GitHub Release. Contenido:

```
docker-compose.yml
docker-compose.od.yml
docker-compose.yalc.yml
install.sh
scripts/wizard.sh
.env.example
config/*.schema.json
```

Explícitamente **fuera** del tarball (ya van dentro de la imagen, en
`/opt/sancho-seed`): el framework (`skills/`, `plugins/`, `workspace-*`),
`docker/init-home.sh`, `scripts/migrate-local.mjs`, el Dockerfile, el source.

El step se engancha al release existente (release-please corre sobre `staging`,
SAN-230). Se agrega al job que ya publica la imagen para reusar el tag.

### 3. Fix `OPENCLAW_HOME` en `install.sh`

Antes del `compose up`, `install.sh` garantiza que `.env` tenga
`OPENCLAW_HOME=<dir-de-instalación absoluto>` **si la var no está ya definida**
(ni en `.env` ni en el entorno). Mecanismo: reusar el helper `set_env` del wizard
o un `grep`/append equivalente, escribiendo la ruta absoluta de `SCRIPT_DIR`.

Por qué es correcto para los dos caminos:

- **Producto (tarball, no-git):** el dir de instalación se monta como
  `OPENCLAW_HOME`; `init-home.sh` lo detecta vacío/no-git y **seedea** el
  framework desde la imagen. La config del wizard (`config/clients.json`) ya está
  ahí → el preflight la encuentra.
- **Clone/dev (git):** el checkout se monta como `OPENCLAW_HOME`; `init-home.sh`
  detecta que es un git checkout y **omite el seed** (el framework ya está
  in-tree, SAN-146). La config del wizard también está ahí.

No se pisa un `OPENCLAW_HOME` preexistente, así que el **deploy de G4U** (que ya
define la var apuntando al checkout) queda intacto.

Opcional (contención): también fijar `SNAPSHOT_DATA_DIR=<dir>/snapshots` cuando
no esté definido, para que todo el estado del producto viva bajo el dir de
instalación en vez de `/mnt/data/snapshots`.

### 4. Manejo de login GHCR (transitorio)

En el paso de `compose pull` de `install.sh`, si el pull falla con `denied` /
`403 Forbidden` / `unauthorized` (imagen privada o sin login), imprimir
instrucciones accionables:

```
La imagen es privada. Logueate a GHCR y reintento:
  echo <TU_PAT> | docker login ghcr.io -u <tu-usuario-github> --password-stdin
  (el PAT necesita scope read:packages)
```

y reintentar el pull una vez (o esperar input). Cuando la imagen sea pública el
pull anónimo funciona y esta rama nunca se ejecuta — **no-op automático**, sin
código que remover después.

## Flujo end-to-end

```
curl -fsSL .../get.sh | bash
  └─ get.sh: prereqs → resolver versión → bajar+extraer tarball en ~/sanchocmo
       └─ cd ~/sanchocmo && ./install.sh
            ├─ prereqs (docker/compose/openssl)
            ├─ wizard.sh (interactivo, 6 pasos) → .env + config/*.json
            ├─ fija OPENCLAW_HOME=~/sanchocmo en .env (si no está)
            ├─ compose pull  (si 403 → guía docker login → reintenta)
            └─ compose up -d
  → imprime BASE_URL + adminToken para entrar (login "Legacy Token")
```

## Interactividad bajo `curl | bash`

`curl … | bash` ocupa el `stdin` de bash con el script. El wizard lee sus
prompts de `/dev/tty` (no de `stdin`), así que **los prompts interactivos siguen
funcionando** en una terminal interactiva. Para entornos sin TTY (CI), el wizard
ya soporta `WIZARD_ASSUME_YES=1` + variables de entorno — `get.sh` las propaga
tal cual.

## Manejo de errores

| Caso | Comportamiento |
|---|---|
| Falta docker/compose/curl/tar | `get.sh` aborta con el comando de instalación sugerido |
| `~/sanchocmo` ya existe y no vacío | Abortar (no clobber); sugerir `SANCHO_DIR=` o `SANCHO_FORCE=1` |
| Release/asset no encontrado | Error claro con la URL intentada y cómo pinear `SANCHO_VERSION` |
| Pull 403 (imagen privada) | Guía de `docker login` + reintento (componente 4) |
| Preflight falla por config | No debería ocurrir tras el fix; si ocurre, el mensaje de SAN-138 ya es accionable |

## Testing

- **E2E limpio (acceptance principal):** `rm -rf ~/sanchocmo`; correr el one-liner
  con un PAT de prueba; aseverar contenedor `healthy`, login con `adminToken` OK,
  y **sin** fallo de preflight (valida el fix de `OPENCLAW_HOME`).
- **Regresión deploy:** verificar que setear `OPENCLAW_HOME` solo-si-ausente no
  altera el `.env` del deploy de G4U (la var ya viene definida).
- **Regresión clone/dev:** clone + `./install.sh` → `OPENCLAW_HOME` apunta al
  checkout, seed omitido (git), arranque OK.
- **Tarball:** el asset contiene exactamente el set de archivos listado y nada
  del framework/source.

## Decisiones tomadas

- Obtención de archivos: **tarball de release versionado** (vs raw-curl de
  archivos sueltos o sparse-checkout) — un solo download, versionado, robusto.
- Login GHCR: **detectar 403 y guiar** (sin secretos en el comando).
- Dir por defecto: **`~/sanchocmo`** (override `SANCHO_DIR`).
