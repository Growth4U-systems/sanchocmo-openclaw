# Plan: paquetizar SanchoCMO como producto instalable por terceros

## Context

SanchoCMO hoy es una instancia operada por Growth4U sobre un repo privado + infra propia.
El objetivo es convertirlo en un **producto que cualquiera pueda descargar, configurar con un
paso simple y correr** (local o en su propio servidor), con updates triviales.

Decisiones del usuario (esta sesión):
1. Destinatario: **terceros / open source**.
2. **Discord ya no es interfaz**: la interacción es por Mission Control (chat web → Sancho).
3. Distribución: **híbrido** = imágenes Docker versionadas (núcleo) + instalador/wizard fino encima.
4. **OD y YALC deben venir de imágenes públicas** (resolver su publicación pública). Siguen siendo
   servicios opcionales (overlays), pero la imagen debe ser pública — no "bring your own build".
5. **Canal de publicación de crons**: hoy publican en Discord (y algunos en Slack). Hacerlo
   **configurable (slack|discord)**; si resulta muy complejo, **centralizar en Slack** (Slack ya
   tiene integración OAuth multi-tenant lista, ver `.env.example:61-71`, `src/pages/api/integrations/slack/`).
6. **Backups por git eliminados**: los datos de instancia ya tienen otro mecanismo de backup, así
   que se retira todo el flujo de "Cervantes hace git commit+push de backup".
7. **Supabase eliminado → Neon**: quitar toda referencia a Supabase (~44 archivos). `DATABASE_URL`
   ya apunta a Neon (`.env.example:34`).
8. **Auth de modelos dual**: tanto Anthropic como OpenAI deben poder usarse con **API key o con
   suscripción** (Anthropic: claude-cli; OpenAI: suscripción Codex). Hoy ambos están forzados a
   suscripción.

**Veredicto: factible, esfuerzo medio (~3–4 semanas ing. + 1 semana de prueba en infra limpia).**
La base es sólida (100% dockerizado, `release-please` ya versiona, separación framework/instancia
parcial vía `config/` gitignored + symlinks en `entrypoint.sh`, y `mc-chat → sancho` ya funciona sin
Discord). El trabajo es desacoplar de G4U, purgar secretos, hacer OD/YALC opcionales con imagen
pública, arreglar auth dual, retirar Discord/Supabase/git-backups, parametrizar canal de publicación,
añadir wizard y publicar imágenes. No es una reescritura.

---

## Progreso (tracking)

> Bitácora de avances. Última actualización: **2026-06-05**.

### ✅ Hecho

- **[Fase 1 · Admin configurable — GAP B1]** — PR [#208](https://github.com/Growth4U-systems/sanchocmo-openclaw/pull/208) (`feat/configurable-admin-domain` → `staging`), `Refs SAN-20`.
  - Nuevo `src/lib/data/admin-domain.ts` → `isAdminDomainEmail()` / `getAdminDomains()` (lee `ADMIN_EMAIL_DOMAIN`, lista por comas, tolera `@`).
  - Reemplazado el hardcode `@growth4u.io` en **todos** los gates: `nextauth.ts:79` (login) y `:45` (email del admin-token → `ADMIN_IDENTITY_EMAIL`), `admin-emails.ts`, `client-access.ts`, `users.ts`, `dashboard/admin/users.tsx`, `health-check.ts:323`.
  - `.env.example`: documentadas `ADMIN_EMAIL_DOMAIN` y `ADMIN_IDENTITY_EMAIL`.
  - UI (`dashboard/admin/users.tsx`): el chip resaltado `<code>` ahora muestra el/los dominio(s) configurado(s) vía `GET /api/admin/users` (nuevo campo `adminDomains`), con fallback si no hay ninguno.
  - Deploy: `deploy-staging.yml` y `deploy-prod.yml` inyectan las dos vars al `.env` (bloque `env:` + lista `KEYS` de `upsert-env.py`).
  - GitHub Environments seteados y verificados: `staging` y `production` → `ADMIN_EMAIL_DOMAIN=growth4u.io`, `ADMIN_IDENTITY_EMAIL=admin@growth4u.io` (preserva comportamiento actual, evita lockout).
  - Verificación local: `npm run typecheck` ✅ · `npm run test:lib` ✅ 36/36.

- **[Fase 1 · Auth de modelos dual — GAP C]** — PR [#219](https://github.com/Growth4U-systems/sanchocmo-openclaw/pull/219) (`feat/dual-model-auth` → `staging`), `Refs SAN-22`. Trabajado en worktree aislado.
  - `ANTHROPIC_AUTH_MODE` / `OPENAI_AUTH_MODE` (`api_key` default | `subscription`).
  - `generate-openclaw-config.js`: en `api_key` escribe perfil `anthropic:default` (`mode:"token"`, key del env); en `subscription`, `anthropic:claude-cli` (oauth). Limpia el perfil del modo contrario.
  - `entrypoint.sh`: gatea `sync-codex-auth.sh` y `ensure-anthropic-subscription-auth.js` al modo `subscription`; en `api_key` los saltea (usa `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`).
  - `.env.example` + ambos deploy workflows (env block + KEYS).
  - GitHub Environments: `staging` y `production` → `ANTHROPIC_AUTH_MODE=subscription`, `OPENAI_AUTH_MODE=subscription` (preserva el comportamiento de G4U, evita flip de billing).
  - Verificación: `node --check` ✅ · `bash -n` ✅ · test funcional de la generación de config (ambos modos → bloque `auth` correcto, validado vs `openclaw.json.last-good`). **Pendiente:** inferencia real en runtime/container.

- **[Fase 1 · Supabase → Neon — GAP B6]** — PR [#318](https://github.com/Growth4U-systems/sanchocmo-openclaw/pull/318) (`chore/san-86-remove-supabase` → `staging`), `Refs SAN-86`. Trabajado en worktree aislado.
  - Persistencia ya corría en Neon (`DATABASE_URL`); esto elimina Supabase de toda la superficie funcional y shipped, sin cambio de comportamiento para G4U.
  - Código: `health-check.ts` (case + `ALL_SERVICES`), `api/clients/create.ts` (deja de copiar/escribir el bloque), `api/env/index.ts` (catálogo de APIs), `types/index.ts` (campo del tipo Client), `dashboard/guide.tsx` (Supabase → Neon en labels y FAQs), `workspace-sancho/scripts/mc-server.js` (server legacy arrancado por `docker/entrypoint.sh:264`: health-check + catálogo + mapeos).
  - Config/deploy: `instance.json.example`, `clients.json.example`, `.env.example` (sin `SUPABASE_*`), `deploy-staging.yml` + `deploy-prod.yml` (`SUPABASE_*` fuera del bloque `env:` y de `KEYS`).
  - Scripts: `new-client.sh` (elimina lectura de `instance.json`, el insert REST a Supabase y la **anon_key hardcodeada** — A6); `regenerate.py` (campo en `clients.js` legacy + keyword).
  - Docs/skills: README, runbook `system-keys-management.md`, onboarding/governance, `connect-api`, schemas de `acquisition-metrics-plan`. Eliminado `workspace-cervantes/supabase-migration.sql`.
  - Fuera de scope (documentado): archivos con secretos vivos + data histórica de runtime (Fase 0); el folder de Drive **"Supabase Recordings"** (nombre literal, no es la DB) se conserva.
  - Verificación local: `npm run typecheck` ✅ · `npm run test:lib` ✅ 162/162 · `node --check mc-server.js` ✅ · JSON examples válidos.

- **[Fase 1 · Retiro de git-backup — GAP B5]** — PR [#325](https://github.com/Growth4U-systems/sanchocmo-openclaw/pull/325) (`chore/san-90-remove-git-backup` → `staging`), `Refs SAN-90`. Trabajado en worktree aislado.
  - Retirado el backup diario de Cervantes (`git add -A` + commit + push de `~/.openclaw` a GitHub). Decisión #6: los datos ya tienen otro backup (data snapshots → `/mnt/data`).
  - `Dockerfile` (git config Cervantes), `docker-compose.yml` (mount `~/.ssh:ro`), `docker/crontab-cervantes` (cron 03:00), `workspace-sancho/scripts/backup.sh` (**eliminado**), `README.md` + `docs/DEPLOY.md` (menciones).
  - Fuera de scope: **data snapshots** (`snapshot-data.sh`, `/mnt/data`) se conserva — su opcionalización es F5. Snapshots/CHANGELOG históricos + `mc-data.js` (generado) sin tocar.
  - Verificación: `git grep` refs funcionales → 0 · `docker-compose.yml` YAML válido · una instalación nueva no sembraba el cron (no hay `cron/jobs.json` trackeado).

- **[Fase 1 · Open Design opcional — GAP B2/B4]** — PR #327 (`chore/san-91-od-optional` → base `chore/san-90-remove-git-backup`, **stacked**), `Refs SAN-91`. Trabajado en worktree aislado.
  - OD vivía en `docker-compose.yml` base con `OD_API_TOKEN:?` requerido → `compose up` fallaba sin OD. Ahora el base **levanta sin OD**.
  - Nuevo `docker-compose.od.yml` (overlay opt-in) con `open-design` (imagen pública `ghcr.io/growth4u-systems/od:edge`), volumen + `depends_on` + mount de design-systems (B4 sale del base). OD removido del base.
  - `deploy-staging.yml` + `deploy-prod.yml`: `ENABLE_OD_SERVICE` (default 1) suma `-f docker-compose.od.yml` en todos los `COMPOSE_ARGS` → G4U mantiene OD.
  - `.env.example`: OD documentado como overlay opt-in.
  - Verificación (`docker compose config`): base sin token ✅ · base+OD sin token falla (esperado) · base+OD con token ✅ · combo base+OD+YALC ✅ · deploy YAML válido.

- **[Fase 2 · Discord opcional — GAP D1/D2/D3]** — PR #329 (`chore/san-92-discord-optional` → base `chore/san-91-od-optional`, **stacked**), `Refs SAN-92`. Aclaración del usuario #1.
  - `docker/generate-openclaw-config.js` (D2): el bloque `channels.discord` se gatea a `DISCORD_BOT_TOKEN`; sin token Discord no se habilita (`mc-chat` sigue primario).
  - `.env.example` (D1): `DISCORD_BOT_TOKEN` comentado/opcional. `config/instance.json.example` (D3): bloque `discord` marcado opcional (`$comment_discord`).
  - G4U sin cambio (setea el token → rama con-token = comportamiento previo). Verif: `node --check` ✅ · JSON válido ✅ · test funcional del gating ✅.
  - **Follow-ups Fase 2**: D4 (rewrite `new-client.sh` sin guild), D5 (canal publicación slack|discord), D6 (README→MC).

- **[Fase 4/6 · install.sh + wizard — E1/E2/E4]** — PR #331 (`chore/san-93-wizard-install` → base `chore/san-92-discord-optional`, **stacked**), `Refs SAN-93`. Aclaraciones #2 (wizard) y #4 (un comando).
  - `install.sh` (raíz): chequea docker/compose/openssl, corre el wizard si falta `.env`, `docker compose up -d --build`. Flags `--od`/`--yalc`/`--no-up`/`--force`.
  - `scripts/wizard.sh`: interactivo + no-interactivo (`WIZARD_ASSUME_YES=1`). Genera secrets (`NEXTAUTH_SECRET`/`ENCRYPTION_KEY`/`SANCHO_INTERNAL_API_TOKEN`/`adminToken`/`mcToken`) y escribe `.env` + `config/instance.json` (sin Discord) + `config/clients.json` (primer brand). No pisa sin `--force`. Checklist final E5.
  - `docs/INSTALL.md`: guía.
  - Verif: `bash -n` ✅ · wizard non-interactive genera archivos válidos (JSON OK, tokens 64 hex) · `docker compose config` con el `.env` generado ✅.
  - **Nota**: DB local setea `COMPOSE_PROFILES=local-db` — se enciende del todo con B9. Follow-up #2: integrar `new-client.sh` reescrito (D4), preflight (Fase 3), SetupChecklist UI (E5).

### 🟡 En curso / bloqueado

- **CI de los PRs #208 y #219 en rojo por GitHub Actions pausado (billing)** a nivel org — `startup_failure`, no es el código (local pasa). Se destraba al cargar saldo y re-correr. (Usuario: "luego cargo plata".)

### ⏭️ Próximo

- Completar **Fase 1**: OD/YALC públicos + opcionales (B2/B3 — **desbloqueado**, ver aclaración #3). ✅ B6 (#318), ✅ B5 (#325) hechos.
- **Fase 0** (purga de secretos / repo limpio) sigue siendo bloqueante #1 **antes de publicar**. Requiere rewrite de historial + rotación de credenciales → **necesita al usuario** (destructivo), ver preguntas abiertas.

---

## 🤖 Modo autónomo (sesión 2026-06-05)

> El usuario dejó la sesión corriendo sola con instrucción de avanzar lo máximo posible. Estrategia:
> **PRs apilados (stacked)** en orden de dependencia (uno por concern, base = branch anterior), porque
> nadie va a mergear mientras tanto. Cada item se testea antes del PR. La meta prioritaria es que el
> proyecto **levante localmente** (`docker compose up`) sin G4U: PG bundled + Discord opcional + modo
> mínimo + wizard + install. Bitácora y preguntas abiertas abajo.

### Aclaraciones del usuario (2026-06-05)

1. **Discord = una opción más de comunicación, igual que Slack.** No debe ser fundamental para que la app
   funcione, ni los clientes deben estar ordenados en torno a Discord. (Refuerza Fase 2 / GAP D.)
2. **El wizard de config debe ser lo más completo, intuitivo y eficiente posible.** (Fase 4 / E.)
3. **Las imágenes de OD y YALC ya deberían ser públicas — las arma G4U.** → **B2/B3 desbloqueado**
   (no hay blocker de derechos de publicación; solo referenciar las imágenes públicas correctas).
4. **Instalar el producto con un comando** (o lo más cercano posible): `install.sh` / one-liner. (Fase 6.)

### Bitácora autónoma (orden cronológico de PRs en el stack)

| # | Item | PR | Estado | Notas |
|---|------|----|--------|-------|
| 1 | B5 · retiro git-backup | #325 (base `staging`) | ✅ abierto | base del stack |
| 2 | B2 · OD opcional (overlay) | #327 (base #325) | ✅ abierto | imagen OD ya pública `ghcr.io/growth4u-systems/od:edge` |
| 3 | D1-D3 · Discord opcional | #329 (base #327) | ✅ abierto | aclaración #1; D4/D5/D6 follow-up |
| 4 | Fase 4/6 · install.sh + wizard | #331 (base #329) | ✅ abierto | un-comando install; DB local espera B9 |
| 5 | B7 · LICENSE.md (borrador) | #333 (base #331) | ✅ abierto | placeholder SUL; texto canónico = decisión legal |

### ❓ Preguntas abiertas para el usuario (responder al volver)

1. **LICENSE (B7)** — *parcial*: creé `LICENSE.md` como **borrador** (placeholder SUL, marcado "pending legal review"). Falta tu decisión: ¿texto canónico de la **Sustainable Use License** (el README ya la cita), u otra (BUSL/MIT/propietaria)? + definir licensor y "Permitted Purpose". No fabriqué texto legal autoritativo.
2. **Imágenes públicas OD/YALC (B2/B3/F5)** — *OD resuelto*: la imagen OD ya es pública (`ghcr.io/growth4u-systems/od:edge`, usada en el overlay B2). **Falta YALC**: hoy el overlay usa `build:` desde el repo privado `../Yalc-Growth4U`; ¿cuál es el nombre/tag de la imagen YALC pública (`ghcr.io/growth4u-systems/yalc:<tag>`)? Con eso hago B3 (build → image).
3. **Fase 0 (purga de secretos)** — bloqueante para publicar, **destructivo**: rewrite de historial git + **rotar** credenciales expuestas (clave Tailscale `sancho-cmo.taild48df2.ts.net.key`, tokens de `openclaw.json.last-good`/`.env.bak`/`instance.json`). **No lo hago solo.** Lo ejecutás vos.
4. **Cutover tasks JSON→DB (B8)**: requiere `db-shadow` en staging N días con diff continuo antes del cutover. Autónomamente solo el **runbook**; el cutover lo hacés vos.
5. **🔴 B9 (Postgres bundled) — DECISIÓN NECESARIA, bloquea local-run completo**: el driver de DB es `@neondatabase/serverless` (`neon-http`), que **NO habla con un Postgres vanilla** — solo con el endpoint HTTP de Neon. Para PG bundled hay que (a) cambiar/condicionar el driver (neon-http para Neon, `pg`/node-postgres para local) **sin romper la conexión Neon de G4U en prod**, y (b) resolver el bootstrap de schema: **no hay journal de Drizzle** (`migrations/meta/` ausente) → `drizzle-kit migrate` no sirve as-is; hay una migración **destructiva** (`0003_rekey_tasks`, DROP) y números duplicados → no se puede aplicar todo el SQL a ciegas; `apply-sql-migration.mjs` también usa `neon()`. **Opciones**: (i) generar un journal de Drizzle limpio desde el schema actual + driver condicional + migrate-al-boot solo para PG local; (ii) un `init.sql` consolidado para DBs frescas. Necesito tu OK sobre el enfoque (riesgo de tocar el path de DB de prod). El wizard ya deja `COMPOSE_PROFILES=local-db` listo para cuando aterrice. **Mientras tanto la app corre con `MC_TASKS_BACKEND=json` (default) o DB externa (Neon).**

---

## Shape del cambio

```
HOY (acoplado a G4U, no distribuible)            OBJETIVO (producto)
─────────────────────────────────────           ─────────────────────────────
git clone privado + compose build                docker compose pull (imágenes
OD obligatorio (imagen privada, falla              públicas versionadas vX.Y.Z)
  sin OD_API_TOKEN)                               OD/YALC = overlays opt-in, img pública
YALC build desde ../Yalc-Growth4U (privado)       auth: API key (default) o suscripción
auth forzada a suscripción (Anthropic+OpenAI)       (switch env, Anthropic + OpenAI)
admin = @growth4u.io hardcode                     admin = ADMIN_EMAIL_DOMAIN
Discord MUST + guild-por-cliente                  MC chat interfaz primaria
crons publican en Discord (IDs hardcodeados)      publish channel configurable (Slack default)
Cervantes hace git backup (commit+push)           backup externo (git-backup retirado)
Supabase (anon/service keys)                      Neon (DATABASE_URL)
secretos commiteados en git                       repo limpio, sin secretos
```

### Orden de dependencias entre fases

```mermaid
graph TD
    P0["Fase 0 · Seguridad + fundaciones<br/>purga secretos · LICENSE · repo limpio"] --> P1
    P1["Fase 1 · Desacople G4U<br/>admin · auth dual · OD/YALC públicos · Supabase→Neon · git-backup out"] --> P2
    P1 --> P3
    P2["Fase 2 · Discord opcional + canal publicación configurable"] --> P3
    P3["Fase 3 · Modo mínimo + preflight"] --> P4
    P3 --> P5
    P4["Fase 4 · Wizard de config"] --> P6
    P5["Fase 5 · Imágenes públicas versionadas (sancho+od+yalc)"] --> P6
    P6["Fase 6 · install.sh + docs + verificación e2e"]
```

---

## GAP detallado

### A. Seguridad del repo — 🔴 BLOQUEANTE #1

Secretos vivos commiteados (verificado con `git ls-files`). No basta `.gitignore`: hay que reescribir
historial o partir de un repo nuevo, y **rotar** las credenciales expuestas.

| # | Archivo trackeado | Riesgo |
|---|-------------------|--------|
| A1 | `sancho-cmo.taild48df2.ts.net.key` | **Clave privada TLS de Tailscale** |
| A2 | `.env.bak-1778520082`, `.env.local.bak-1778526782` | Backups de `.env` con API keys reales |
| A3 | `openclaw.json.last-good` (84 KB) | Config OpenClaw con tokens de gateway/auth |
| A4 | `workspace-sancho/_system/instance.json` | Instance real (Supabase service_key, Discord IDs, cuentas) |
| A5 | `.mc-proxy-device.json` | Device auth del proxy MC |
| A6 | `new-client.sh:858` | **Supabase anon_key hardcodeada** dentro del script |
| A7 | `workspace-cervantes/supabase-migration.sql`, `*.bak` en skills, `workspace-cervantes/.env.example` | Auditar por valores reales |

### B. Acoplamiento a Growth4U — 🔴 bloqueante

| # | Actual | Ideal | Dónde |
|---|--------|-------|-------|
| B1 ✅ | Admin gate real es `email.endsWith("@growth4u.io")` en el callback de auth | Helper `isAdminEmail()` que lea `ADMIN_EMAIL_DOMAIN` (+ `adminEmails`) | **HECHO** (PR #208) — `admin-domain.ts` + reemplazos en `nextauth.ts:79/:45`, `users.ts`, `admin-emails.ts`, `client-access.ts`, `dashboard/admin/users.tsx`, `health-check.ts:323` |
| B2 ✅ | **Open Design es obligatorio**: en `docker-compose.yml` base con `OD_API_TOKEN: ${OD_API_TOKEN:?...}` → `compose up` falla sin OD | **HECHO** (PR SAN-91): movido a overlay `docker-compose.od.yml` (imagen pública `ghcr.io/growth4u-systems/od:edge`); OD fuera del base → levanta sin OD; deploy G4U lo mantiene vía `ENABLE_OD_SERVICE` | `docker-compose.od.yml` (nuevo), `docker-compose.yml`, deploy workflows, `.env.example` |
| B3 | YALC build desde repo privado `../Yalc-Growth4U` | Mantener overlay `docker-compose.yalc.yml` pero con `image:` **pública** `ghcr.io/<org>/yalc:vX.Y.Z` (no `build:` privado) | `docker-compose.yalc.yml` |
| B4 | Volumen monta `brand/growth4u/...` hardcodeado | Va con overlay OD; parametrizar por brand o quitar del base | `docker-compose.yml:108` |
| B5 ✅ | **Git backups de Cervantes** (git config + daily commit+push) | **HECHO** (PR #325, SAN-90): quitado `git config` (Dockerfile), mount `~/.ssh` (compose), cron `backup.sh` (`crontab-cervantes`), `backup.sh` eliminado, menciones en README + DEPLOY.md. Data snapshots (`/mnt/data`) se conserva → F5 | `Dockerfile`, `docker-compose.yml:18`, `docker/crontab-cervantes`, README, DEPLOY.md |
| B6 ✅ | **Supabase** en ~44 archivos | **HECHO** (PR #318, SAN-86): eliminado de `instance.json.example`, `clients.json.example`, `new-client.sh` (insert + anon_key A6), `health-check.ts`, `api/clients/create.ts`, `api/env/index.ts`, `types/index.ts`, `guide.tsx`, `mc-server.js` (legacy live), `regenerate.py`, `.env.example`, ambos deploy workflows, docs/skills; borrado `supabase-migration.sql`. Persistencia = Neon (`DATABASE_URL`). Resto = data histórica/secretos (Fase 0) + folder Drive "Supabase Recordings" | grep `supabase` (44 files) |
| B7 | Falta `LICENSE.md` (README lo cita); docs usan `sanchocmo.ai`/IPs | Crear `LICENSE.md`; placeholders genéricos | raíz, `docs/` |

### C. Auth de modelos (Anthropic + OpenAI) — ✅ HECHO (PR #219)

El camino de **API key está roto hoy** para ambos proveedores:
- Anthropic: `generate-openclaw-config.js:40-46` borra `anthropic:default` y fuerza `anthropic:claude-cli` (oauth); `ensure-anthropic-subscription-auth.js` (`entrypoint.sh:117`) corre **en cada boot** y **elimina** profiles de API key de `openclaw.json` y de cada `auth-profiles.json`.
- OpenAI: `sync-codex-auth.sh` (`entrypoint.sh:108`) colapsa los `auth-profiles.json` a la **suscripción Codex** (ChatGPT OAuth); `OPENAI_API_KEY` existe en env pero no se cablea como profile. El plugin `codex` se fuerza `enabled` (`entrypoint.sh:72`).

**Ideal (decisión #8):** dos switches —`ANTHROPIC_AUTH_MODE` y `OPENAI_AUTH_MODE` (`api_key|subscription`, default `api_key`)—:
- En `api_key`: generar profile de API key (`anthropic:default` desde `ANTHROPIC_API_KEY`; equivalente OpenAI desde `OPENAI_API_KEY`) y **no** correr el script de suscripción correspondiente.
- En `subscription`: comportamiento actual.
- Gatear `ensure-anthropic-subscription-auth.js` y `sync-codex-auth.sh` al modo respectivo en `entrypoint.sh`.

### D. Discord opcional + canal de publicación configurable — 🟠

| # | Actual | Ideal | Dónde |
|---|--------|-------|-------|
| D1 | `DISCORD_BOT_TOKEN=your-bot-token` figura como requerido | Comentado/opcional | `.env.example:19` |
| D2 | `channels.discord.enabled=true` **siempre** | Gatear todo el bloque Discord a presencia del token | `generate-openclaw-config.js:95` |
| D3 | `instance.json.example` pide `discord.*` como base | Bloque Discord opcional | `config/instance.json.example` |
| D4 | `new-client.sh` exige `--guild`, inserta en Supabase, auto-bind Discord, `tools.deny` por guild | Reescribir: crea brand + registra en `clients.json` (genera `mcToken`) **sin** guild/Supabase/Discord | `workspace-sancho/scripts/new-client.sh` |
| D5 | **Crons publican en Discord** con `message(channel=discord,…)` + patrón de hilo, leyendo `crons.<x>.publish_channel` de `client-config.json` | **Canal configurable (decisión #5)**: añadir `publish.channel_type` (`slack`/`discord`) en `instance.json`/`client-config.json`; parametrizar el paso "PUBLICAR" de las plantillas de cron. **Default Slack** (OAuth ya construido). Si dual-channel resulta caro → centralizar en Slack y dejar Discord como legacy | `cron/jobs.json*`, `client-config.json`, `meeting-intelligence-db.ts:363` (`publish_channel`), `skills/atalaya/SKILL.md:100` |
| D6 | README gira en torno a "guild por cliente" + diagrama Discord | Reescribir alrededor de Mission Control + chat | `README.md:5-40` |

> 🟢 El boot **no** crashea sin Discord (`generate-openclaw-config.js:192` solo warning) y `mc-chat → sancho` se crea siempre (`:147`, reforzado en `entrypoint.sh:139`). Es limpieza, no re-arquitectura.

### E. Config inicial / wizard — 🟠 corazón del pedido

| # | Actual | Ideal |
|---|--------|-------|
| E1 | Editar a mano `.env` + `config/instance.json` + `config/clients.json` | Wizard que pregunta lo esencial y los genera |
| E2 | Secrets a mano (`openssl rand`): `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, `SANCHO_INTERNAL_API_TOKEN`, `mcToken`/`adminToken` | El wizard los genera |
| E3 | Sin preflight de config al boot | Preflight que falla rápido listando MUST faltantes |
| E4 | Crear 1er cliente requiere guild Discord | Crear 1er brand sin Discord (vía `new-client.sh` reescrito) |

**MUST mínimos reales (verificado):** API key del proveedor elegido (`ANTHROPIC_API_KEY` y/o `OPENAI_API_KEY`) · `config/clients.json` · `config/instance.json` (mínimo) · `NEXTAUTH_SECRET`. `DATABASE_URL` (Neon) solo si `MC_TASKS_BACKEND=db` (default `json`, sin DB — `docker-compose.yml:30`). Google OAuth opcional (fallback legacy token en `nextauth.ts:30-67`). Discord/YALC/OD/Slack: opcionales.

### F. Distribución y updates — 🟠

| # | Actual | Ideal |
|---|--------|-------|
| F1 | `git clone` + `compose build`; update = `git pull` + rebuild | Imágenes públicas `ghcr.io/<org>/sanchocmo:vX.Y.Z`; update = cambiar tag + `compose pull && up -d` |
| F2 | OD/YALC en build context o imagen privada bloquean `compose pull` | **Publicar OD y YALC como imágenes públicas** (decisión #4) y referenciarlas en sus overlays |
| F3 | Deploy asume infra G4U (GitHub Environments, deploy keys, secrets) | Documentar update genérico, sin Actions de G4U |
| F4 | `release-please` ya versiona | Reusar: release `vX.Y.Z` → tag de imagen |
| F5 | `~/.ssh:/root/.ssh:ro` y `/mnt/data/snapshots` montados | `~/.ssh` se retira con git-backup (B5); `/mnt/data` opcional | `docker-compose.yml:18-19` |

### G. Separación framework vs instancia — 🟢 casi resuelto

`config/*.json` gitignored con `.example`, `brand/` gitignored, symlinks en `entrypoint.sh:15-20`,
seeds en `templates/`, seeding gateado por existencia de `openclaw.json` (`entrypoint.sh:25`).
Falta garantizar que un `compose pull` de versión nueva no pise datos del volumen (`OPENCLAW_HOME`).

---

## Recomendación de distribución (híbrido)

1. **Imágenes públicas versionadas (núcleo).** Publicar `sanchocmo:vX.Y.Z` + `od:vX.Y.Z` + `yalc:vX.Y.Z`
   en GHCR público desde `release-please`. `docker-compose.yml` de producto referencia tags (sin `build`);
   OD/YALC en overlays opt-in. Update = editar tag + `compose pull && up -d`.
2. **Instalador/wizard fino encima.** `install.sh` baja compose + `.env.example`, corre el wizard
   (genera secrets, pide API key + dominio, crea 1er brand), valida con preflight y `compose up`.

**Canal de publicación:** recomiendo **default Slack** (la integración OAuth multi-tenant ya existe),
dejando `publish.channel_type` configurable a `discord` para quien lo prefiera. Si soportar ambos en
las plantillas de cron resulta caro, centralizar en Slack y marcar Discord como legacy.

---

## Plan de acción por fases

### Fase 0 — Seguridad + fundaciones (2–3 días) 🔴
- **Purgar secretos**: repo público nuevo sin historial (o reescritura de historial). Borrar/ignorar A1–A7. **Rotar** clave Tailscale y todo token de `openclaw.json.last-good`/`.env.bak`/`instance.json`.
- Quitar Supabase anon_key hardcodeada de `new-client.sh:858`.
- Auditar `workspace-*` por data de clientes G4U; decidir qué se publica.
- Crear `LICENSE.md` (texto SUL real). Confirmar org/registry GHCR público.

### Fase 1 — Desacople de G4U (4–6 días) 🔴
- ✅ **Admin configurable** (HECHO, PR #208): helper `isAdminDomainEmail()` (lee `ADMIN_EMAIL_DOMAIN` + `adminEmails`); reemplazado hardcode en `nextauth.ts:79` y call-sites; parametrizado email del admin token (`nextauth.ts:45` → `ADMIN_IDENTITY_EMAIL`); UI muestra el dominio configurado; vars inyectadas en deploy + seteadas en GitHub Environments.
- ✅ **Auth dual (C)** (HECHO, PR #219): `ANTHROPIC_AUTH_MODE` y `OPENAI_AUTH_MODE` en `generate-openclaw-config.js`; en `api_key` genera profile de API key y saltea el script de suscripción; gateados ambos scripts por modo en `entrypoint.sh`; vars seteadas en GitHub Environments (subscription) para G4U.
- ✅ **OD opcional (B2)** (HECHO, SAN-91): `open-design` movido a `docker-compose.od.yml` (imagen pública `ghcr.io/growth4u-systems/od:edge`), fuera del base. **Pendiente**: YALC overlay a imagen pública (B3, hoy usa `build:` privado — necesita nombre de imagen) + degradación limpia OD/YALC en MC (D7).
- ✅ **Supabase → Neon (B6)** (HECHO, PR #318, SAN-86): eliminadas referencias en config examples, `new-client.sh` (+ anon_key A6), `health-check.ts`, `api/clients/create.ts`, `api/env/index.ts`, `types/index.ts`, `guide.tsx`, `mc-server.js` legacy, `regenerate.py`, deploy workflows, docs/skills; borrado `supabase-migration.sql`.
- ✅ **Retirar git-backup (B5)** (HECHO, PR #325, SAN-90): quitado `git config` (Dockerfile), montaje `~/.ssh` (compose), cron de `backup.sh` (`crontab-cervantes`), `backup.sh` eliminado, menciones en README + DEPLOY.md.
- Limpiar `health-check.ts:323` y placeholders de dominio.

### Fase 2 — Discord opcional + canal de publicación (2–3 días) 🟠
- `.env.example:19` comentar `DISCORD_BOT_TOKEN`; `generate-openclaw-config.js` gatear `channels.discord` a presencia del token; `instance.json.example` bloque discord opcional.
- **Reescribir `new-client.sh`**: sin `--guild`/Supabase/auto-bind; crea brand + registra en `clients.json` (genera `mcToken`); conservar proyectos P00.
- **Canal configurable (D5)**: `publish.channel_type` en `instance.json`/`client-config.json`; parametrizar el paso "PUBLICAR" de las plantillas de cron (default Slack). Si es caro, centralizar en Slack.
- Reescribir `README.md` alrededor de Mission Control.

### Fase 3 — Modo mínimo + preflight (2–3 días) 🟠
- **Preflight** en `entrypoint.sh` (antes de `gateway run`): validar MUST (API key del modo activo, `NEXTAUTH_SECRET`, `config/clients.json`, `config/instance.json`) y abortar con mensaje accionable.
- Verificar seeding idempotente solo first-run; que `pull` de versión nueva no pisa el volumen.
- Perfil "mínimo" de compose: solo `sanchocmo`, `MC_TASKS_BACKEND=json`, sin DB/OD/YALC/Discord.

### Fase 4 — Wizard de configuración (4–6 días) 🟠 corazón del pedido
- Script CLI interactivo (reutilizable desde `install.sh`): elige proveedor + modo auth (api_key/suscripción), pide API key(s) + dominio + nombre del 1er brand; genera `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, `SANCHO_INTERNAL_API_TOKEN`, `adminToken`, `ADMIN_EMAIL_DOMAIN`; opcionalmente configura canal de publicación (Slack/Discord); escribe `.env`, `config/instance.json`, `config/clients.json` (desde `.example`); crea 1er brand vía `new-client.sh` reescrito; valida con preflight.
- Reusar `config/*.example` y `new-client.sh`; `openssl rand` para secrets.

### Fase 5 — Imágenes públicas versionadas (3–4 días) 🟠
- Workflow que publica `sanchocmo`, `od`, `yalc` `:vX.Y.Z`+`:latest` en GHCR público al release (engancha a `release-please`).
- `docker-compose.yml` de producto con `image:` (sin `build:`); overlays `docker-compose.od.yml` y `docker-compose.yalc.yml` con imágenes públicas.
- Documentar update genérico (`pull && up -d`); `/mnt/data` opcional.

### Fase 6 — Instalador + docs + verificación (2–3 días)
- `install.sh`: baja compose + `.env.example`, corre wizard, `compose up`.
- Guías de instalación (local + servidor) y de actualización.
- Verificación e2e en máquina limpia (abajo).

---

## Verificación (end-to-end)

En un host sin nada de G4U (sin acceso a repos/imágenes privadas):

1. **Instalación limpia**: `install.sh`; wizard solo con una API key + dominio/localhost.
2. **Arranque mínimo**: la app levanta **sin** Discord, OD, YALC, Slack ni Postgres (`json`); `GET /api/health` responde `{ ok, version, commit }` y `:18789/healthz` OK.
3. **Auth dual real**: con `ANTHROPIC_AUTH_MODE=api_key` (y/o OpenAI), un turno de chat infiere con la API key; inspeccionar `openclaw.json` → `auth.order.anthropic=["anthropic:default"]` (y equivalente OpenAI). Repetir con `subscription`.
4. **Uso básico**: entrar a MC, loguear, ver el brand del wizard, conversar por `mc-chat → sancho`.
5. **Admin configurable**: con `ADMIN_EMAIL_DOMAIN`, un email del dominio entra como admin; otro como client.
6. **Sin Supabase / sin git-backup**: confirmar que ningún path llama a Supabase y que no hay crons/commits de backup.
7. **Canal de publicación**: configurar Slack, verificar que un cron publica en Slack; (si dual) repetir con Discord.
8. **Preflight**: borrar `NEXTAUTH_SECRET` → boot aborta con mensaje claro.
9. **Update**: cambiar tag `vX.Y.Z → vX.Y.(Z+1)`, `compose pull && up -d`; brand/config del volumen **persisten** y `/api/health` reporta nueva versión.
10. **Opcionales**: habilitar overlay OD y/o YALC (imágenes públicas); integran sin romper el modo base; sin ellos MC degrada sin pantallas rotas.

---

## Riesgos / cuestiones abiertas

- **Purga de secretos del historial git** (Fase 0): clave TLS privada, `.env.bak`, `openclaw.json.last-good`, `instance.json` real trackeados. Repo nuevo limpio + rotación de credenciales.
- **Publicación pública de OD/YALC**: requiere derecho a publicar el fork de OD y el repo YALC como imágenes OSS/redistribuibles (licencia + CI de build). Validar antes de Fase 5.
- **Canal de publicación dual**: parametrizar el paso "PUBLICAR" en todas las plantillas de cron (patrón de hilo Discord vs Slack) puede ser costoso; fallback = centralizar en Slack.
- **Auth dual end-to-end**: validar modelos en allowlist de crons (`ensure-openclaw-allowlist.sh`, `entrypoint.sh:182`) con API key.
- **Crons/skills** con supuestos de G4U (canales, cuentas, paths) más allá de lo mapeado — Fase 1 incluye auditoría de `workspace-sancho/skills` y `scripts/`.
- **Licencia SUL**: el README la cita pero no existe el texto; redactarla (decisión del usuario).
