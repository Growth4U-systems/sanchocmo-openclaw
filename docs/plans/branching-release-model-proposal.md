# Propuesta: modelo de branching & release

> **Estado:** ✅ **decidido y en ejecución** (2026-06-16, owner: Nahuel · `SAN-230`).
> Decisiones tomadas en §10. Progreso de migración al final (§Ejecución).
> **Objetivo:** staging env siempre con la última versión; **deploy a prod
> controlado y desacoplado del estado de staging**; un **flujo único, estándar y
> profesional** que cualquier instancia de Claude Code ejecute igual y bien — sin
> que los hotfixes rompan la cadena.

**Quién opera el repo:** el equipo trabaja **a través de Claude Code**. El
"usuario" del workflow es un agente competente en git/GitHub, no una persona
tipeando comandos. Eso cambia dónde está la simplicidad: **no** en envoltorios
que escondan git, **sí** en convenciones inequívocas + guardrails estructurales
para que el agente no pueda equivocarse.

---

## 1. Requisitos

1. **Staging env = última versión, siempre.**
2. **Deploy a prod controlado**, sobre un punto conocido, **independiente del
   estado actual de staging**.
3. **Flujo único** (feature, fix y hotfix son lo mismo) — el hotfix no tiene
   procedimiento aparte.
4. **Estándar y profesional**: herramientas y patrones de industria
   (release-please, conventional commits, GitHub Environments con gate de
   aprobación), no scripts caseros.

---

## 2. Por qué se rompió el modelo original

```
staging → entorno de staging   |   main → entorno de prod   |   main solo recibe de staging
```

1. **Hotfixes directos a `main`** que nunca volvieron a `staging` → divergencia
   → cada promoción `staging → main` pasó a ser resolución de conflictos.
2. **Historia distinta por rama** (`staging` solo squash; `main` con
   merge-commits) → mismo contenido, SHAs distintos → el "compare" miente.
3. El modelo **acopla prod al estado de staging**: no se puede sacar *un* fix a
   prod sin arrastrar todo lo demás que esté en staging.

---

## 3. Principio de diseño

> **`main` nunca recibe trabajo directo. Solo la automatización lo mueve, por
> fast-forward, hacia el tag de cada release cortado desde `staging`.**

Como `main` solo avanza hacia commits que **ya están en `staging`**, **no puede
divergir nunca**. La causa raíz desaparece por construcción — sin pedir
disciplina manual a nadie, y sin que el "compare" vuelva a mentir.

La simplicidad la dan dos cosas, no un wrapper:
- **Convenciones** documentadas en `CLAUDE.md` / `CONTRIBUTING.md` que toda
  instancia de Claude Code sigue (qué rama, qué merge method, qué commit style).
- **Guardrails** en branch protection que hacen imposible el camino malo.

---

## 4. El modelo (`main` ff-only + release-please sobre staging)

```
 feature/* ─┐
            │  Claude Code: rama desde staging, conventional commits,
            ▼  PR squash → staging
        staging ──(push)──▶ DEPLOY staging env                    [req. 1 ✅]
            │
            │  release-please corre SOBRE staging:
            │  mantiene un PR "chore: release vX.Y.Z" con changelog + bump
            ▼
     merge del release PR ──▶ tag vX.Y.Z + GitHub Release (en commit de staging)
            │
            ├──▶ automatización: main FAST-FORWARD al tag (puntero de prod)
            │
            ▼
     deploy-prod.yml  ──(gate: GitHub Environment 'production',
                          aprobación manual de Nahuel)──▶ DEPLOY prod   [req. 2 ✅]
```

Piezas, todas estándar:

- **`staging` = trunk.** Único lugar donde se integra. Cada push deploya al
  entorno de staging (ya lo hace `deploy-staging.yml`).
- **release-please corre sobre `staging`** (no sobre `main`). Mantiene un release
  PR vivo con el changelog y el bump de versión. Profesional, semver real,
  changelog automático. Funciona porque **Claude Code escribe conventional
  commits** (`feat:`/`fix:`/`feat!:`).
  - ⚠️ **El release PR tiene base `staging` y se mergea a `staging`** (squash,
    respeta linear-history). El bump de versión queda **en staging**. **`main`
    NUNCA recibe un PR** — esto es lo opuesto a hoy (donde el release PR mergea a
    `main` y le crea commits propios → la divergencia que tenemos). En el modelo
    nuevo `main` solo se fast-forwardea al tag (siguiente bullet).
- **El tag nace en `staging`.** `main` solo se fast-forwardea a él → puntero
  inmutable de "qué hay en prod", nunca diverge.
- **El deploy a prod queda detrás del gate del *GitHub Environment*
  `production`** (que `deploy-prod.yml` ya usa): requiere **aprobación manual**.
  Ahí está tu control de "cuándo" y "quién", de forma auditable y profesional.
- **Rollback / sacar un punto anterior:** `deploy-prod.yml` ya tiene
  `workflow_dispatch(tag)` → redeploy de cualquier tag a prod sin tocar ramas.
  Desacople total del estado de staging. [req. 2 ✅]

Esto **conserva release-please y elimina** solo lo que causaba el problema: la
promoción `staging → main` con merge-commit y el `sync-release-to-staging.yml`
(los version files ahora nacen en staging, no hay ping-pong).

### Cómo funciona release-please (el malentendido típico)

**El workflow corre en cada merge, pero NO bumpea la versión en cada PR.**
release-please mantiene **un único "release PR" abierto** que va **acumulando**
todo lo mergeado desde el último release. Cada merge a `staging` solo
**actualiza** ese PR pendiente (recalcula el número propuesto y suma la línea al
changelog). El bump real de `package.json` y el **tag** ocurren **una sola vez**:
cuando vos **mergeás el release PR**.

Ejemplo (estás en v0.5.0):

| Acción | Qué hace release-please |
|---|---|
| mergeás un `feat:` | Abre/actualiza el release PR → propone **v0.6.0**. `package.json` sigue en 0.5.0. |
| mergeás un `fix:` | Actualiza el **mismo** PR → sigue **v0.6.0**, changelog con 2 entradas. |
| mergeás un `feat!:` (breaking) | El mismo PR ahora propone **v1.0.0**. |
| **mergeás el release PR** | Recién acá: bumpea versión, crea el tag, genera el Release. Todo lo acumulado sale junto. |

La versión "flota" como propuesta mientras seguís trabajando, y se **cristaliza
una sola vez** cuando decidís cortar. Siempre hay **un solo release PR** abierto,
no uno por PR — el trabajo del día a día **no genera ruido de versiones**.

### Mergear el release PR NO congela staging

Cortar la versión y deployar a prod son **independientes**, y **ninguno frena
`staging`**:

```
staging: ─feat─fix─[merge release PR: tag v0.6.0]─feat─fix─[merge release PR: tag v0.6.1]─▶ (sigue)
                          │                                       │
                          ▼ (cuando quieras, async)              ▼
                    gate prod → deploy v0.6.0            gate prod → deploy v0.6.1
```

- Tras mergear el release PR, **seguís mergeando a `staging` al instante**;
  release-please abre un release PR nuevo para la próxima versión.
- El tag queda creado **esperando**, pero `staging` no lo espera: podés cortar
  v0.6.0 y **no** deployar a prod todavía, y avanzar hacia v0.6.1.
- No estás obligado a deployar cada tag: elegís cuál soltás a prod (aprobando su
  gate, o con `workflow_dispatch(tag)`).

### ¿Qué es automático y qué es manual?

La regla: **lo que va a staging es automático; lo que va a prod tiene dos puntos
de decisión humana** (y nada se publica solo).

| Paso | ¿Automático? |
|---|---|
| Deploy a **staging** (cada merge a `staging`) | **Automático** — `deploy-staging.yml` en cada push. |
| release-please abre/actualiza el **release PR** (con changelog y bump) | **Automático** — lo mantiene al día solo. |
| **Tag** + GitHub Release | Automático, pero **disparado por una acción humana**: recién cuando alguien **mergea el release PR**. Es la decisión "cortamos la versión X.Y.Z". |
| `main` **fast-forward** al tag | **Automático** — un job lo hace al publicarse el release. |
| Deploy a **prod** | El workflow arranca automático con el release, pero **se frena en el gate `production` y espera aprobación manual**. |

Es decir: **el tag no se crea solo** (necesita el merge del release PR), y **el
deploy a prod no sale solo** (necesita la aprobación del gate). Tenés dos
controles: *cuándo cortar la versión* y *cuándo soltarla a prod*. Si en algún
momento querés menos fricción, se puede dejar un solo gate (p. ej. auto-mergear
el release PR y dejar solo la aprobación de `production`).

### Deploy a prod, paso a paso

"Deploy a prod" = correr `deploy-prod.yml`, que se conecta por **SSH al VPS de
producción** y deja corriendo ahí la versión de un tag. No es mágico: es checkout
del tag + rebuild de los contenedores en el server. Se dispara de dos formas:

1. **Normal:** mergeás el release PR → se publica el Release con el tag `vX.Y.Z`
   → eso **dispara `deploy-prod.yml` automáticamente** con ese tag.
2. **Manual / rollback:** Actions → "Deploy to Production" → **Run workflow** con
   un tag (ej. `v0.5.0`). Para redeployar o volver atrás. (Ya existe hoy.)

Qué pasa cuando se dispara:

```
  Release publicado (o Run workflow con un tag)
            │
            ▼
  ┌─────────────────────────────────────────┐
  │ El job apunta a environment: production  │
  │ → SE FRENA y espera APROBACIÓN MANUAL    │  ◀── tu control:
  │   (si hay required reviewers — Paso 3)   │      sin aprobación, prod NO se toca
  └────────────────────┬────────────────────┘
            │ (aprobás en GitHub: "Approve and deploy")
            ▼
  SSH al VPS de prod, y allá adentro:
    1. git fetch --tags  +  git checkout <tag>
    2. backup de la data de brands en runtime (por las dudas)
    3. aplica los envs del environment 'production' al .env
    4. docker compose build + up -d   (rebuild de contenedores)
    5. migraciones de DB (si están habilitadas)
            │
            ▼
  Health check: pollea HEALTH_URL hasta 60s
            │
       ┌────┴────┐
     OK │         │ falla
       ▼          ▼
   ✓ listo   Rollback AUTOMÁTICO al tag anterior
```

Lo importante:

- **Gate de aprobación.** El job queda **pausado** en GitHub ("Waiting for
  review – production"); llega notificación, entrás y hacés click en **"Approve
  and deploy"** (o rechazás). Hasta que no aprobás, prod no se toca. Es el
  control de *cuándo* y *quién*. *Hoy ese gate puede no tener reviewers
  configurados — activarlo es el Paso 3 del plan.*
- **Es seguro:** si el deploy o el health check fallan, hace **rollback solo** al
  tag anterior; no te quedás con prod roto.

**Desde tu silla, un deploy a prod normal son dos clicks:** mergear el release PR
y aprobar el gate. Todo lo de SSH / docker / checkout / health / rollback lo hace
el workflow solo.

### Artefacto de deploy: imagen Docker por versión

**Costo primero.** Construir la imagen en CI es caro: es multi-arch
(amd64 + **arm64 bajo emulación QEMU, ~15-20 min**) y se factura por minuto en
este repo privado. Por eso la imagen **NO se construye en cada push** (ya decidido
en SAN-145/#439). Se construye solo:

| Cuándo | Tag | Para qué |
|---|---|---|
| **Release** (`release: published`) | `:vX.Y.Z` + `:latest` | el artefacto versionado de prod |
| **A demanda** (`workflow_dispatch`) | `:edge` | tests puntuales de la imagen — el "intermedio a demanda" |

**Staging** sigue **buildeando desde fuente en el VPS** (barato: usa el VPS que ya
pagás, single-arch, rápido). No consume imagen.

**Prod — deploy por imagen (mejora opcional, prod-only).** Como el release ya
construye `:vX.Y.Z`, prod puede **pullear esa imagen** en vez de buildear en el
VPS:

1. (el release construye `:vX.Y.Z` — ya pasa hoy)
2. `main` **fast-forward** al tag.
3. **Deploy**: `docker compose pull :vX.Y.Z` + `up -d`, tras el gate de aprobación,
   con health check. **Rollback = pull del tag anterior**.

Ventaja: deploy más rápido, artefacto **inmutable y testeado**, rollback trivial —
y **sin costo extra de build** (la imagen del release se construye igual).
Prereqs: encadenar el deploy **después** del build (no en paralelo) y que el VPS de
prod se **autentique a GHCR** (imagen privada). Es opcional: si no, prod sigue
buildeando en el VPS como staging.

---

## 5. Cómo opera Claude Code (lo que va en CLAUDE.md)

La "interfaz" del workflow son estas reglas para el agente. Inequívocas y cortas:

| Situación | Qué hace Claude Code |
|---|---|
| **Cualquier cambio** (feature, fix, hotfix) | Rama desde `origin/staging` fresco → conventional commit → PR **squash** a `staging`. Igual para todo. |
| **Conflicto al integrar** | Lo resuelve (es capaz) siguiendo la regla semántica documentada; si es ambiguo, pregunta. **No** es un blocker como con un humano no-dev. |
| **Publicar a prod** | Mergea el release PR de release-please cuando se le indica; el deploy real lo aprueba un humano en el gate de `production`. |
| **Nunca** | Tocar `main` directo. Mergear a `staging` sin squash. Push directo a ramas protegidas. |

Eficiencia: del cambio a staging son **1 PR squash**; a prod, **mergear el
release PR + 1 aprobación**. Sin ceremonia extra, sin promociones con conflictos.

---

## 6. Hotfix = el flujo normal

No hay procedimiento de hotfix. Un fix es: conventional commit `fix:` → PR squash
a `staging` (deploya a staging) → release-please corta un patch → aprobar el gate
de prod. **Idéntico a cualquier cambio.** Posible porque mantenemos `staging`
siempre releasable (§7).

```
                        ┌─────────────────────────────┐
                        │  Hay que arreglar algo de    │
                        │  prod (hotfix)               │
                        └──────────────┬──────────────┘
                                       │
                       ¿Prod caído Y staging tiene
                        trabajo SIN terminar que no
                          se puede publicar todavía?
                                       │
                 ┌─────────── NO ──────┴────── SÍ ───────────┐
                 │  (99% de los casos)        (emergencia)   │
                 ▼                                           ▼
    ╔════════ FLUJO NORMAL ════════╗          ╔═══ RUNBOOK DEV (Apéndice A) ═══╗
    ║ = el mismo de cualquier      ║          ║ rama desde el ÚLTIMO TAG de    ║
    ║   cambio                     ║          ║ prod → fix → tag patch → ff    ║
    ╚══════════════╤═══════════════╝          ║ main → deploy → forward-merge  ║
                   │                          ║ a staging                      ║
                   ▼                          ╚════════════════╤═══════════════╝
   Claude Code: rama desde staging,                           │
   commit  fix: ...  → PR squash                              │
                   │                                          │
                   ▼                                          │
   merge del PR  ──▶  deploy a STAGING env  (verificás)       │
                   │                                          │
                   ▼                                          │
   release-please abre/actualiza el                           │
   release PR (vX.Y.Z patch, changelog)                       │
                   │                                          │
                   ▼                                          │
   merge del release PR  ──▶  tag  ──▶  main ff               │
                   │                                          │
                   ▼                                          │
   gate 'production': aprobación manual  ◀────────────────────┘
                   │
                   ▼
            DEPLOY a PROD
```

> El camino de la izquierda es el de todos los días — **mismas acciones que un
> feature**. El de la derecha (prod caído *y* staging sucio) es el único con git
> "a mano"; lo ejecuta un dev siguiendo el Apéndice A, y no es el flujo habitual.

Para que ni siquiera ese caso de emergencia requiera git a mano, el plan incluye
una **action de hotfix** (`hotfix.yml`, ver inventario §8) que automatiza esa
coreografía en una sola corrida. Diseño pendiente — se brainstormea antes de
implementarla.

---

## 7. Condición: staging siempre releasable

Para que "mergear el release PR" sea seguro, lo que está en `staging` debe ser
siempre apto para prod:
- Cambios chicos y frecuentes.
- **Feature flags** para trabajo grande/incompleto.
- Si hay que liberar un punto anterior con staging "a medias": el
  `workflow_dispatch(tag)` de `deploy-prod.yml` lo cubre sin ramas extra.

---

## 8. Plan de migración

### Inventario de GitHub Actions (objetivo)

Qué workflows quedan, cuáles cambian, cuál se borra y cuáles se crean:

| Workflow | Acción | Rol en el plan |
|---|---|---|
| `ci.yml` | Mantener | typecheck/build (required) + lint/e2e (informativo) en PRs a `staging`. |
| `docker-image.yml` | Mantener | Construye la imagen a GHCR **solo en release** (`:vX.Y.Z`+`:latest`) y **a demanda** (`workflow_dispatch` → `:edge`). **No** en cada push (SAN-145/#439, por costo de la pata arm64). |
| `release-please.yml` | **Modificar** | Correr sobre `staging` (no `main`): mantiene el release PR con base `staging`. Quitar `target-branch: main`. |
| `deploy-staging.yml` | Mantener | Buildea desde fuente **en el VPS** (barato). Sin cambios. Trigger: push a `staging`. |
| `deploy-prod.yml` | **Modificar** | Gate `production` + rollback (ya los tiene). *Opcional (ver §10):* pasar a **pull de `:vX.Y.Z`** en vez de build en el VPS. |
| `sync-release-to-staging.yml` | **Borrar** | Innecesario: los version files nacen en `staging`. |
| `linear-issue-id.yml` | Mantener | Check de Linear ID en PRs (ver decisión §10 sobre relajarlo para el equipo). |
| **`promote-main.yml`** *(nuevo)* | **Crear** | Al publicarse un release, **fast-forward de `main`** al tag. Es lo que sostiene `main` como puntero ff-only. (Puede vivir dentro del pipeline de release en vez de un archivo aparte.) |
| **`hotfix.yml`** *(nuevo)* | **Crear — diseño pendiente** | Automatiza el flujo de hotfix de emergencia (Apéndice A) en una sola corrida, para que el equipo no toque git a mano. **A brainstormear antes de implementar.** |

> **Costo:** la imagen NO se construye por push (SAN-145). **Staging buildea en el
> VPS** (ya pagado). El deploy-por-imagen es **solo para prod y opcional**: reusa la
> `:vX.Y.Z` que el release construye igual, así que no agrega costo de build. Si se
> adopta, el deploy de prod se encadena **después** del build (no en paralelo) y el
> VPS se autentica a GHCR (imagen privada).

### Pasos

| Paso | Qué | Riesgo |
|---|---|---|
| **0. Reconciliar una vez** | `main` hoy no es ancestro de `staging`. Alinearlas (promo final con merge-commit, o resetear `main` al último tag de la lineage de staging). Tras esto, ff-only para siempre. | Único paso delicado; lo hace un dev. |
| **1. release-please → `staging`** | En `release-please.yml`: `on.push` a `staging` y quitar `target-branch: main` (el default del repo ya es staging). | Bajo. |
| **2. `main` ff-only** | `promote-main.yml`: al publicarse el release, fast-forwardea `main` al tag. Branch protection de `main`: prohibir pushes/PR directos (solo ese job con PAT); quitar `required_linear_history`. | Bajo. |
| **3. Gate de prod** | Configurar en el *GitHub Environment* `production` los **required reviewers** (aprobación manual). | Bajo. |
| **4. Apagar lo viejo** | Borrar `sync-release-to-staging.yml`. | Bajo. |
| **5. Docs/convenciones** | Reescribir `CLAUDE.md` (§5 de acá) y `docs/CONTRIBUTING.md` con el flujo único. Esto es *la interfaz* para Claude Code. | Bajo, pero clave. |
| **6. Deploy de prod por imagen** *(opcional, después)* | `deploy-prod.yml` → **pull de `:vX.Y.Z`** (no build), encadenado tras `docker-image.yml`; auth a GHCR en el VPS de prod. Staging no cambia. | Medio; opcional, no bloquea. |
| **7. Hotfix action** *(después)* | Brainstormear e implementar `hotfix.yml`. No bloquea al resto. | Bajo. |

---

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| **`RELEASE_PLEASE_TOKEN` caído** (blocker actual) | Rotar/renovar el PAT. Es prerequisito de mantener release-please; tarea puntual. |
| **Conflictos de integración** | Claude Code los resuelve con la regla semántica documentada; ya no son un blocker de operador. |
| **"staging siempre releasable"** | Feature flags para lo incompleto; el `tag` dispatch cubre el resto. |
| **Versionado** | Conventional commits (los escribe Claude Code) → release-please infiere el bump correcto. |
| **`main` ya divergió** | Paso 0, una sola vez. |

---

## 10. Qué tenés que decidir → ✅ DECIDIDO (2026-06-16)

1. **¿Adoptamos el modelo** (`main` ff-only + release-please sobre staging +
   gate de aprobación en prod)? → ✅ **Sí, adoptar.**
2. **Gate de prod:** ¿quiénes son los *required reviewers* del entorno
   `production`? → **Grupo chico** (Nahuel + 1–2; usernames pendientes de definir
   al configurar el environment, Paso 3).
3. **¿Renovamos el `RELEASE_PLEASE_TOKEN`** ahora? → **No hace falta ahora**:
   verificado que funciona (runs OK 2026-06-16). Conviene confirmar el vencimiento
   del PAT en algún momento (sostiene release-please **y** el ff de `main`).
4. **Deploy de prod por imagen** (Paso 6, opcional y prod-only)? → **Después.**
   Prod sigue buildeando en el VPS por ahora; se hará como follow-up (se solapa
   con la Fase 7 del packaging plan).
5. **Timing del Paso 0** (ventana sin releases en vuelo)? → **Ahora** (v0.5.0
   recién cortada, no hay release pendiente).

---

## Ejecución (SAN-230 · 2026-06-16)

Estado de la migración. Verificado contra el repo real antes de arrancar:
divergencia main↔staging = **ruido SHA** (squash vs merge-commit) **salvo un
cambio real**, el hardening de `deploy-prod.yml` (SAN-217). Confirmado con un
trial-merge 3-way limpio: `staging` es superset de `main` salvo ese archivo.

| Paso | Qué | Estado |
|---|---|---|
| 0a | Mergear #630 (version files → 0.5.0; baseline de release-please-on-staging) | ✅ **MERGED** |
| 0b | PR **#641**: hardening de `deploy-prod.yml` a staging → `staging ⊇ main` | 🟡 abierto |
| 0c | `main := staging` (force-reset; tras 0b) — invierte la ancestría a ff-only | ⏭️ pendiente (juntos) |
| 1/4/5 | PR **#643**: release-please→staging · `promote-main.yml` · borrar sync · docs (`CLAUDE.md`+`CONTRIBUTING.md`) | 🟡 abierto — **mergear tras 0c** |
| 2 | Ruleset de `main`: solo `promote-main` (PAT) lo mueve; sin PR/push directos | ⏭️ pendiente (config GitHub) |
| 3 | `production` environment: required reviewers (grupo chico) | ⏭️ pendiente (config GitHub) |
| 6 | Deploy de prod por imagen | 🟢 deferred |
| 7 | `hotfix.yml` | 🟢 deferred (a brainstormear) |

⚠️ **Orden crítico:** #643 se mergea **después** de 0c. Si se activa `promote-main`
antes de que `main` sea ancestro de `staging`, el ff falla (por diseño aborta).

---

## Apéndice A — Runbook de emergencia (solo devs)

Caso: **prod caído y staging con trabajo sin terminar** (no se puede publicar el
tip de staging). Único escenario con git a mano, fuera del flujo normal:

1. `git fetch && git switch -c hotfix/<desc> <último-tag-de-prod>`
2. Fix mínimo + conventional commit.
3. Tag patch sobre el hotfix + ff `main` + deploy (o `deploy-prod` dispatch con
   ese tag).
4. **Forward-merge del hotfix a `staging`** (PR squash) para no perderlo y
   restaurar el invariante (`main` vuelve a ser ancestro de `staging`).
