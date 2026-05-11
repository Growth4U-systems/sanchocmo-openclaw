# Workflow Git Profesional — main = prod, staging = QA, features → staging

**Fecha:** 2026-05-07
**Estado:** propuesto

## Context

El repo tiene `main` con 7 commits viejos y `staging` con 177 commits que representa la versión actual del producto. Queremos:

- Promover `staging` actual → `main` (será el snapshot de producción)
- Definir un workflow git profesional, dinámico y orientado a releases automatizados
- Configurar la infraestructura mínima (CI, branch protection, releases) que hoy NO existe

**Decisiones tomadas:**
- **Estructura:** `main` = producción, `staging` = QA/preview, `feature/*` → PR a `staging`
- **Releases:** auto-tag + GitHub Release + deploy on-merge a `main`, vía **release-please**
- **CI:** modo gradual — lint+typecheck bloquean merge, tests Playwright informational al inicio
- **Convenciones:** Conventional Commits obligatorios (alimentan el versionado de release-please)
- **Deploy:** VPS self-hosted (Hetzner CX22 + Docker Compose + nginx) — ya documentado en `docs/DEPLOY.md`

**Estado existente (no se reinventa):**
- `Dockerfile` + `docker-compose.yml` con build de Next.js → puerto 3000
- Scripts en `package.json`: `dev`, `build`, `start`, `lint`, `typecheck`
- Playwright en devDependencies (sin config)
- Branches `main` y `staging` ya en GitHub
- Local ya tiene `main-old` (backup) y `main = staging` listos para el swap
- `docs/DEPLOY.md` con setup completo de VPS

---

## Fase 0 — Transición staging → main (one-shot, UI de GitHub)

`gh` no está instalado, así que se hace por UI. Si querés, después instalamos `gh` para futuras tareas.

**Pasos en GitHub (Settings → Branches del repo `Growth4U-systems/sanchocmo-openclaw`):**

1. **Rename `main` → `main-old`**
   - GitHub redirige refs y PRs viejos automáticamente
   - Banner avisa a colaboradores
   - Default branch se mueve sola a `main-old` temporalmente
2. **Rename `staging` → `main`**
   - El nuevo `main` queda apuntando al SHA `0b796fdb` (la versión actual)
3. **Crear nueva rama `staging` desde `main`** (botón "new branch" en GitHub o local + push)
   - Sirve como baseline de QA: arranca igual a prod, después diverge a medida que se mergean features
4. **Cambiar default branch del repo a `staging`**
   - Settings → Branches → "Default branch"
   - Esto asegura que los PRs nuevos se abran contra `staging` por default (no contra prod)

**Sync local después del rename remoto:**
```bash
git fetch --prune origin
git branch -u origin/main main             # main local trackea nuevo origin/main
git branch -u origin/main-old main-old     # main-old local trackea origin/main-old
git push -u origin main-old                 # subir el commit extra (4e02bba2 .gitignore) que estaba solo local
git checkout staging                        # nueva rama de trabajo
git branch -u origin/staging staging
```

**Nota:** los 2 archivos huérfanos del feat `dded4b9c` (`public/mockup-trust-engine.html`, `scripts/migrate-deliverable-file.mts`) quedan en `main-old` como decidido — recuperables si después hacen falta.

---

## Fase 1 — Branch protection (GitHub Settings → Branches)

| Rama | Reglas |
|---|---|
| `main` | Require PR, require 1 approval, require status checks `lint` + `typecheck`, no force-push, no delete, restrict pushes (solo via PR) |
| `staging` | Require PR, require status checks `lint` + `typecheck`, no force-push |
| `main-old` | Sin protección especial — se puede archivar como referencia histórica |

---

## Fase 2 — CI workflows

Crear `.github/workflows/`:

### `.github/workflows/ci.yml`
Corre en cada PR a `staging` o `main`:
- `lint` (`npm run lint`) — **required**
- `typecheck` (`npm run typecheck`) — **required**
- `build` (`npm run build`) — **required** (asegura que el deploy va a funcionar)
- `e2e` (Playwright smoke) — **informational** al inicio; pasar a required cuando haya coverage mínimo

### `.github/workflows/release-please.yml`
Corre en push a `main`:
- Acción: `googleapis/release-please-action@v4`
- Lee Conventional Commits desde el último tag
- Si hay commits releaseables (`feat:` / `fix:`), abre/actualiza un **release PR** con:
  - Bump de version en `package.json`
  - `CHANGELOG.md` regenerado
- Cuando alguien mergea el release PR → release-please crea el tag (`vX.Y.Z`) + GitHub Release

### `.github/workflows/deploy.yml`
Trigger: `release: published` (lo dispara el GitHub Release de release-please).

Ya que el deploy es a VPS (Hetzner + Docker Compose + nginx, según `docs/DEPLOY.md`), el workflow hace SSH al VPS:

- **Secrets requeridos** en GitHub repo:
  - `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (private key con acceso al VPS)
- **Steps:**
  1. SSH al VPS
  2. `cd ~/.openclaw && git fetch --tags && git checkout <tag>`
  3. `docker compose build --pull && docker compose up -d`
  4. Health check al endpoint público (`curl -f https://staging.sanchocmo.ai/api/health` o equivalente)
- **Rollback:** si el health check falla, hacer `git checkout <tag-anterior> && docker compose up -d`

**Configs de release-please:**
- `release-please-config.json` (raíz del repo): tipo `node`, `package-name: openclaw`
- `.release-please-manifest.json` (raíz): `{ ".": "0.1.0" }` (o version actual del package.json)

---

## Fase 3 — Convenciones y enforcement

### Conventional Commits + commitlint + husky
Imprescindible porque release-please bumpea según el tipo de commit:
- `feat:` → minor bump (ej: 1.2.0 → 1.3.0)
- `fix:` → patch bump (1.2.0 → 1.2.1)
- `feat!:` o `BREAKING CHANGE:` → major bump
- `chore:`, `docs:`, `refactor:`, `style:`, `test:` → no bump

**Setup:**
- `npm i -D husky @commitlint/cli @commitlint/config-conventional`
- `commitlint.config.cjs` con `extends: ['@commitlint/config-conventional']`
- `husky init` + `.husky/commit-msg` corre `npx commitlint --edit $1`

### Documentación
- **`CONTRIBUTING.md`** (nuevo): explica el workflow (feature → PR a staging → release PR → main → tag → deploy), Conventional Commits con ejemplos, cómo correr tests local
- **`.github/pull_request_template.md`** (nuevo): template con secciones Summary, Why, Test plan, Screenshots
- **`README.md`** (update): sección "Development workflow" con diagrama de ramas y link a CONTRIBUTING.md

---

## Fase 4 — Tests baseline (mínimo viable, para CI gradual)

- `playwright.config.ts` (nuevo) — config base apuntando a `http://localhost:3000`
- `tests/smoke.spec.ts` (nuevo) — 1-2 tests críticos:
  - Home page renderiza sin crashear
  - Una ruta protegida redirige a login si no hay sesión
- En `package.json` agregar `"test:e2e": "playwright test"`
- `ci.yml` corre `npm run test:e2e` como step **informational** (no bloquea merge inicialmente)

A medida que se acumule coverage, mover el step a required en branch protection de `staging`.

---

## Fase 5 — Hotfix policy

Para bugs urgentes en producción:
1. Branch `hotfix/<bug>` desde `main`
2. PR directo a `main` con commit `fix: <description>` (saltea staging)
3. Merge → release-please abre release PR con patch bump → mergear → tag + deploy
4. **Sync back:** abrir PR `main → staging` (o cherry-pick) para que el fix también esté en QA

---

## Diagrama del flujo

```
feature/foo ──PR──▶ staging ──PR──▶ main ──release-please──▶ tag vX.Y.Z ──▶ Docker build ──▶ deploy
                       │                  │
                    deploy a            release PR
                    preview QA          (auto-generated)
                    (opcional)
```

---

## Archivos críticos a crear/modificar

| Path | Acción | Propósito |
|---|---|---|
| `.github/workflows/ci.yml` | Crear | Lint + typecheck + build + tests en PRs |
| `.github/workflows/release-please.yml` | Crear | Auto-tag + release on-merge a main |
| `.github/workflows/deploy.yml` | Crear | SSH al VPS + git checkout tag + docker compose up |
| `.github/pull_request_template.md` | Crear | Template estándar de PRs |
| `release-please-config.json` | Crear | Config de release-please |
| `.release-please-manifest.json` | Crear | Tracking de version actual |
| `commitlint.config.cjs` | Crear | Enforce Conventional Commits |
| `.husky/commit-msg` | Crear | Hook que llama commitlint |
| `playwright.config.ts` | Crear | Config base de Playwright |
| `tests/smoke.spec.ts` | Crear | Smoke test mínimo |
| `CONTRIBUTING.md` | Crear | Documentar workflow |
| `README.md` | Modificar | Agregar sección "Development workflow" |
| `package.json` | Modificar | Agregar `test:e2e`, `prepare` (husky), devDependencies |

---

## Verificación end-to-end

Una vez aplicado todo el plan:

1. **Transición:** verificar en GitHub que `main` ahora es lo que era staging, `main-old` preserva el viejo, default branch = `staging`. `git fetch --prune` local + `git log main` debe mostrar `0b796fdb` como tip.
2. **Branch protection:** intentar push directo a `main` desde local → debe rechazar.
3. **CI:** crear branch `chore/test-ci` con un cambio trivial → PR contra `staging` → ver que corren lint+typecheck+build y son required.
4. **Conventional Commits:** intentar commitear con mensaje no-conventional (ej: `update stuff`) → husky debe rechazar. Probar con `chore: test commit lint` → debe pasar.
5. **Release flow:** mergear el PR de prueba a staging, después abrir PR `staging → main`, mergear → release-please debe abrir un release PR en main automáticamente. Mergear el release PR → verificar que aparece tag `vX.Y.Z` y GitHub Release.
6. **Deploy:** verificar que el workflow `deploy.yml` se dispara con el release, hace SSH al VPS, hace pull del tag y `docker compose up -d`. La app responde en el dominio.
7. **Hotfix simulado:** crear `hotfix/test-fix` desde main, PR a main directo con commit `fix: test`, mergear → release PR con patch bump → tag → deploy.

---

## Riesgos y notas

- **Force-push evitado:** todo se hace con renames + protecciones, no se reescribe history.
- **Otros devs:** vos avisás antes del swap. Su acción para sincronizar: `git fetch --prune && git checkout main && git reset --hard origin/main && git branch staging origin/staging`.
- **release-please primer run:** la primera vez tarda más; es normal. El primer release PR puede salir con version `0.1.0` o `1.0.0` según el `manifest`. Se ajusta editando el manifest antes del primer merge.
- **Playwright en CI:** requiere `npx playwright install --with-deps chromium` en el workflow. Tarda ~30-60s extra.
- **VPS deploy:** el workflow `deploy.yml` necesita una clave SSH dedicada (no la del usuario). Generar una nueva en el VPS (`ssh-keygen -t ed25519 -f ~/.ssh/deploy_key`), agregar la pública a `~/.ssh/authorized_keys` del usuario deploy, y la privada al GitHub secret `VPS_SSH_KEY`. Idealmente con un usuario `deploy` no-root y permisos limitados.
- **Coordinación con `docs/DEPLOY.md`:** cuando se actualice el setup del VPS (nuevos servicios, cambios de paths), el deploy.yml debe reflejarlo. Mantener ambos en sync.
