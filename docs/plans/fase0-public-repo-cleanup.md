# Fase 0 — Limpiar el árbol y abrir el repo a público

> **Issue:** `SAN-340` · **Estado:** plan listo, ejecución pendiente (PR 1 no arrancado).
> **Última actualización:** 2026-06-26.
> Este doc es **self-contained**: una próxima sesión puede retomarlo sin contexto previo.

## Objetivo

Hacer **público** el repo `Growth4U-systems/sanchocmo-openclaw`. Hoy no es publicable
porque el árbol trackeado contiene **data operacional y referencias a clientes reales**.

## Decisión de topología (TOMADA)

**Mismo repo, historia aplastada a 1 commit limpio** (orphan), **no** filter-repo quirúrgico.

- El repo va a público con un único commit `chore: v1.0.0 (public release)`. Cero historia
  detrás → cero exposición de commits viejos (que están llenos justamente de data de cliente).
- **Por qué no el filter-repo quirúrgico:** enumerar archivo-por-archivo es frágil (te olvidás
  uno y se filtra). El squash es **trivial de producir y garantizado limpio**.
- **Por qué no un repo nuevo:** mantener el mismo repo deja intactas las URLs del installer
  (`get.sh` apunta a `…/sanchocmo-openclaw/main/get.sh`), los nombres de imagen y los refs de docs.
- En repo privado + **tokens ya rotados**, un rewrite de historial no aporta seguridad; el
  único motivo para limpiar la historia es no exponerla al abrir → el squash lo cubre.

## Insight clave

El **trabajo real es limpiar el árbol ACTUAL** — y eso hay que hacerlo **igual**, sea cual sea
la estrategia de historia. El "aplastar la historia" después es casi gratis (un orphan commit).

## Ya hecho

- `SAN-233`: destrackeó el grueso de secretos + gitignore de `.env*` / runtime / backups.
- **PR #910** (`Refs SAN-233`): destrackeó el último secreto trackeado, `.mc-proxy-device.json`
  (tenía `privateKeyDer`; el runtime lo regenera). → En el árbol actual **no quedan secretos
  reales trackeados** (`_system/instance.json` es un symlink a `config/instance.json`, que ya
  está gitignored — no es un leak).

Falta lo de abajo: **data/refs de cliente** (no secretos), que es lo que bloquea ir a público.

## Inventario (árbol trackeado)

~150 archivos trackeados referencian slugs de clientes reales. Obtener la lista fresca con:

```bash
# slugs reales (de config local gitignored / dirs de brand)
ls -d workspace-sancho/brand/*/ | sed 's#.*/brand/##; s#/##'
# → criptan, growth4u, hospital-capilar, hulahoop, masabo, masavo, paymatico, sanchocmo, example

# archivos trackeados que los mencionan
git grep -I -l -i -e criptan -e hospital-capilar -e hulahoop -e masabo -e masavo -e paymatico -- .
```

### Bucket A — Data operacional/de cliente pura → **BORRAR del árbol**

No es framework, el runtime no la necesita (la regenera o es histórica). Borrado limpio
(`git rm`), además deja el seed de imagen más limpio.

- `workspace-sancho/_backups/**` — backup completo de **hospital-capilar** (brand data,
  transcripts de reuniones, budgets, SWOT). Lo más sensible del repo.
- `workspace-sancho/memory/**` + `workspace-sancho/MEMORY.md`, `workspace-cervantes/memory/**`
  — memoria operacional de los agentes con refs de clientes (runtime la regenera).
- `workspace-sancho/_system/recurring-tasks/cost-tracker-daily/*.json` — costos diarios.
- `workspace-sancho/_system/intelligence-log.json`, `_system/intelligence/brand-memory.md`.
- `cron/jobs.json.pre-*` (13 snapshots viejos de crons con jobs por cliente).
- `workspace-sancho/scripts/*.backup*` (regenerate.py.backup2/3, mc-server.js.backup-cors).
- `workspace-sancho/tmp/**` (paymatico-fitness-clean.html, import-fitness-lp.py).
- `.archived/**` (workspace-escudero archivado con campañas de cliente).
- `workspace-sancho/campaigns/**` (contenido de campañas de cliente).
- `workspace-sancho/mission-control.html`, `workspace-sancho/legacy-mission-control.html`.

Agregar guards de `.gitignore` para los dirs que el runtime recrea (`_backups/`, `memory/` ya
parcialmente cubierto, `tmp/`, `campaigns/`, `recurring-tasks/`).

### Bucket B — Framework con refs hardcodeadas → **GENERICIZAR** (mantener archivo, slug real → `example`)

- `skills/**` — SKILL.md, schemas, references que usan clientes reales de ejemplo
  (acquisition-metrics-plan, niche-discovery-100x, media-discovery, geo-visibility,
  own-media-audit, serp-tracking, daily-pulse, send-idea-notifications, alarife-integration,
  growth4u-visual-generator, insight-to-content-mapper).
- `src/**` — tests y fixtures con slugs reales (metrics-v2 tests, mcp-token tests,
  share-tokens, lib/data seeds, api/{activity,cron-runs,metrics,system/activity,
  content-engine/calendar}). **Código de runtime: genericizar, no borrar.**
- `scripts/metrics/seed-*.ts`, `scripts/{migrate-content-engine-to-canon.mjs,backtrack-anchors.ts,visual-test.mjs}`.
- `workspace-sancho/AGENTS.md`, `_system/onboarding/**`, `_system/technical/mc-links-protocol.md`,
  `_system/domain-taxonomy.json`.
- `public/mockup-trust-engine.html`, `plugins/mc-chat/**`.

## ⚠️ Dudas abiertas (resolver antes de ejecutar)

1. **`workspace-sancho/scripts/{mc-server.js, legacy-mc-server.js, legacy-mc-data-agents.js,
   legacy-clients.js, mc-data.js}`** — el entrypoint **levanta `mc-server.js`**
   (`docker/entrypoint.sh`), así que ese **no se puede borrar: hay que genericizarlo**. Los
   `legacy-*` / `mc-data.js` son generados/legacy (lo que SAN-109 quiere retirar igual).
   **¿Borrar los legacy/generados, o genericizarlos?**
2. **`docs/plans/**`** (incluido el plan de packaging y *este* doc) documenta slugs e internals.
   **¿Sacar `docs/plans/` del repo antes de abrir?** (SAN-253 ya venía podando planes.) Nota: el
   squash final los elimina de la historia igual; la pregunta es si quedan en el commit público.
3. **`growth4u` y `sanchocmo`** como slugs son **del vendor**, no clientes.
   **¿Dejarlos o también genericizarlos?**

> ⚠️ **Riesgo de runtime al borrar en `workspace-sancho/`**: el seed/entrypoint (#502 / SAN-146,
> ver boot-loop SAN-329) se acopla a que el checkout tenga cierta estructura. Borrar dirs de
> **data pura** (Bucket A) es seguro; **no** borrar nada que el seed/framework requiera. Verificar
> un boot tras el PR 1.

## Plan de ejecución

1. **PR 1 — borrar Bucket A** (data pura) + gitignore guards. `Refs SAN-340`. Bajo riesgo, es el
   grueso de lo sensible y no tiene ambigüedad. Verificar un boot del producto después.
2. **PR 2 — genericizar Bucket B** + el `mc-server.js` de la duda #1. `Refs SAN-340`.
   Re-correr el `git grep` de arriba hasta que dé **0 hits** de slugs reales de cliente
   (dejando, según decisión #3, growth4u/sancho y siempre `example`).
3. **Verde + árbol limpio** → ejecutar el **squash + force-push** (abajo). Lo corre Nahuel.
4. **Hacer el repo público** + cortar `v1.0.0` (primer release público) + e2e con package público
   (`compose pull` anónimo).

## Runbook — squash a 1 commit + abrir (lo ejecuta Nahuel)

**Pre-condiciones (clave para no romper la maquinaria de release):**
- Mergear/cerrar **todos los PRs abiertos** primero (incl. el release PR `chore: release …`).
  Un cambio de historia los invalida a todos.
- Ventana de **freeze** (nadie pusheando), idealmente coordinado con Martin/Alfonso.
- **Backup:** `git clone --mirror` del repo a un lado antes de tocar nada.

**Ejecución (árbol ya limpio tras PR 1 + PR 2):**
```bash
git checkout staging && git pull
git checkout --orphan public-release          # un commit sin historia detrás
git add -A
git commit -m "chore: v1.0.0 (public release)"
# reemplazar staging y main por este commit limpio:
git branch -M public-release staging          # (o force-update según convenga)
```

**Lo que rompe y hay que reconciliar (no saltear):**
- **Force-push a `staging` y `main`** → abrir temporalmente el ruleset (bypass admin) y volver a
  cerrarlo. Es la única vez que se toca `main` a mano.
- **release-please**: su ancla (`.release-please-manifest.json` / `last-release-sha`) apunta a un
  SHA que dejó de existir → re-anclar al nuevo SHA de staging, si no, no corta más releases.
- **Invariante main↔staging ff-only**: tras reescribir, re-verificar que `main` quedó como
  ancestro de `staging` (sino `promote-main` rechaza el próximo release). Mismo patrón que la
  reconciliación de SAN-230.
- Avisar a todos: tienen que **re-clonar** (su historia local ya no matchea).

**Alertas de GitHub:** secret-scanning daba 404 (deshabilitado / token sin scope). Si al abrir
aparecen alertas por secretos en historia, como ya están rotados se **descartan como "revoked"**
en Security → Secret scanning (no requiere más cambios de historia; el squash ya la dejó limpia).

## Checklist pre-público

- [ ] PR 1 (Bucket A borrado) mergeado + boot verificado.
- [ ] PR 2 (Bucket B genericizado) mergeado; `git grep` de slugs reales → 0 hits.
- [ ] Sin secretos trackeados (`git grep` claves/tokens → 0).
- [ ] PRs abiertos cerrados/mergeados; release PR resuelto.
- [ ] Backup `--mirror` hecho.
- [ ] Squash + force-push + reconciliación release-please/main.
- [ ] Repo a público; `v1.0.0` cortado; e2e `compose pull` anónimo OK.
