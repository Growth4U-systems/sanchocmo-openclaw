# SAN-233 — Runbook de purga de historial (secretos expuestos)

> **Estado:** preparado, **NO ejecutado**. Requiere ventana de mantenimiento y
> coordinación (reescribe historia + force-push a ramas protegidas).
> Ejecutar **solo después** de que la rotación de credenciales (paso 1) esté hecha.

## Contexto

Al hacer público el repo quedaron secretos reales en el historial de git.
El paso 2 (destrackear de HEAD) se resolvió en PR #657. Este runbook cubre el
**paso 3**: eliminar los blobs de **todo** el historial.

> ⚠️ Reescribir el historial **no des-filtra** lo ya expuesto durante la ventana
> pública. La rotación (paso 1) es lo que cierra el riesgo. Esta purga es higiene
> para evitar re-exponer al volver a hacer público el repo.

## Paths con secretos reales en historial (lista verificada)

Escaneo de todos los blobs únicos del historial (`git cat-file` sobre cada blob,
matcheando los valores reales filtrados + marcadores de clave privada):

```
.env.bak-1778520082
.env.bak.20260428-093008
.env.bak.20260428-093033
.env.bak.20260428-093459
.env.bak.20260428-094245
.env.bak.20260428-100420
.env.local.bak-1778526782
openclaw.json.last-good
memory/cervantes.sqlite
memory/cervantes.sqlite-shm
memory/cervantes.sqlite-wal
workspace-sancho/memory/cervantes.sqlite
sancho-cmo.taild48df2.ts.net.key
workspace-sancho/sancho-cmo.taild48df2.ts.net.key
workspace-cervantes/memory/2026-02-25-task-approvals.md
```

Todos están **fuera de HEAD** (ya destrackeados); solo persisten en commits viejos.

## Pre-requisitos

1. **Paso 1 (rotación) COMPLETO.** No tiene sentido reescribir antes de rotar.
2. Avisar a todo el equipo: tras la reescritura, **todos deben re-clonar** (sus
   clones/worktrees quedan desincronizados; `git pull` no alcanza).
3. Cerrar/mergear o anotar las PRs abiertas — quedarán sobre SHAs viejos y habrá
   que recrearlas. (PR #657 conviene mergearla **antes**.)
4. Instalar git-filter-repo:
   ```bash
   pipx install git-filter-repo   # o: pip3 install --user git-filter-repo
   ```

## Procedimiento

```bash
# 0. Clon fresco y espejado (filter-repo exige clon limpio)
cd /tmp
git clone --mirror git@github.com:Growth4U-systems/sanchocmo-openclaw.git purge.git
cd purge.git

# 1. Purga por path (incluye globs por si quedaron variantes)
git filter-repo \
  --path .env.bak-1778520082 \
  --path .env.local.bak-1778526782 \
  --path openclaw.json.last-good \
  --path memory/cervantes.sqlite \
  --path memory/cervantes.sqlite-shm \
  --path memory/cervantes.sqlite-wal \
  --path workspace-sancho/memory/cervantes.sqlite \
  --path sancho-cmo.taild48df2.ts.net.key \
  --path workspace-sancho/sancho-cmo.taild48df2.ts.net.key \
  --path workspace-cervantes/memory/2026-02-25-task-approvals.md \
  --path-glob '.env.bak.*' \
  --path-glob '*.taild*.ts.net.key' \
  --invert-paths

# 2. Verificar que no queda ningún secreto (debe NO imprimir nada)
git log --all -p | grep -aE 'AIzaSyAehBHbdBleoL0|xoxb-8592801470374|sk-proj-qo_AC6m5q3P|BEGIN EC PRIVATE KEY' && echo "QUEDAN SECRETOS" || echo "LIMPIO"
```

## Force-push (ventana de mantenimiento)

`main` y `staging` están protegidas. En GitHub → Settings → Branches:
relajar temporalmente "Allow force pushes" + "Do not allow bypassing" para ambas.

```bash
# Re-apuntar al remoto (filter-repo borra el origin por seguridad)
git remote add origin git@github.com:Growth4U-systems/sanchocmo-openclaw.git
git push --force --mirror origin
```

> `--mirror` reescribe **todas** las refs (ramas + tags). Esto reescribe tags de
> release-please. Verificar después que el último tag siga apuntando al commit
> correcto; si no, recrearlo a mano.

Restaurar la protección de ramas inmediatamente después.

## Post-purga

1. **Todos re-clonan** el repo (los clones viejos contienen los blobs y pueden
   re-introducirlos en un push).
2. Recrear PRs abiertas que quedaron sobre SHAs viejos.
3. Confirmar que CI (typecheck/build) y release-please siguen verdes.
4. (Opcional) Pedir a GitHub Support que purgue la caché de vistas de commits
   viejos y forks/cachés de la API.
5. Si el repo se vuelve a hacer público: activar Secret Scanning + Push Protection
   (gratis para repos públicos) — ver paso 4 de SAN-233.

## Por qué no se ejecutó automáticamente

Force-push a ramas protegidas que rompe todos los clones e interactúa con
release-please es una operación irreversible y coordinada: requiere decisión
humana, ventana, y que la rotación esté hecha primero.
