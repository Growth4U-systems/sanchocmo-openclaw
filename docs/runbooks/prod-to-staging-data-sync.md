# Prod → Staging Data Sync ("Sync with Prod")

This is the **reverse** of `staging-to-production-data-migration.md`. It pulls
production's real client data **into staging** so new features can be validated
against real data before they ship to prod. It never writes to production.

Staging keeps shipping features that are only exercised against stale/empty
data, so bugs surface first in production. This closes that gap: refresh staging
from prod, test against real client documents, then promote with confidence.

## Where it lives

| Piece | Path |
| --- | --- |
| UI button | `dashboard/admin/settings?tab=datasync` → `src/components/settings/data-sync-panel.tsx` |
| API | `POST/GET /api/system/sync-prod-to-staging` → `src/pages/api/system/sync-prod-to-staging.ts` |
| Script | `scripts/resync-prod-to-staging.sh` |

The **Sync Prod** tab only renders on staging (`NEXT_PUBLIC_ENV_LABEL` set), and
the endpoint refuses to run unless it is admin **and** staging.

## Modes

| Mode | Copies | Notes |
| --- | --- | --- |
| **A** | `workspace-sancho/brand/*` (Markdown + context) | Mirror (`--delete`): staging brand becomes an exact copy of prod. |
| **B** | A + Neon DB | Restores the staging Neon branch **from** the prod branch (tasks, POV bank, meeting-intelligence). |
| **C** | B + `.openclaw/` agent state | "**C-safe**": excludes credentials/sessions/OAuth so staging never acts on real client accounts. Additive (no `--delete`) so staging keeps its own gateway identity. |

### What is never pulled

`.env` / `*.env`, `*.bak` / `*.broken-backup` / `*.review-*`, `node_modules/`,
`.next/`, `.git/`. In mode C additionally: `auth-state.json`,
`auth-profiles.json`, `auth/`, `oauth*`, `*.token`, `*credentials*`,
`openclaw.json`, `npm/`. With rsync, an excluded path is also protected from
`--delete`, so staging's own credentials survive the sync.

## Safety model

1. **Staging-only.** UI tab + server endpoint + the script itself all refuse
   unless `NEXT_PUBLIC_ENV_LABEL` is set and not a prod label.
2. **Direction is fixed.** Every rsync source is `root@$PROD_IP:…` (remote,
   read-only) and every destination is a local staging path. Neon restore
   targets the staging branch only. The script can never write to prod.
3. **Backup first.** Staging's `brand/` is tarred to
   `~/.openclaw/backups/brand-pre-prodsync-<stamp>.tgz` before the mirror.
4. **No live tokens in staging** (mode C-safe), so staging can't email/post as a
   real client even if an agent runs.

## Prerequisites (on the staging host/container)

- `rsync` + `openssh-client` (both shipped in the app image).
- The staging SSH key authorized on prod as `root@$PROD_IP` (same key the
  reverse `resync-staging-to-prod.sh` already relies on). `~/.ssh` is mounted
  read-only into the container.
- For modes B/C: `NEON_API_KEY` in the container env. Without it, the DB step is
  skipped (files still sync).

## Run it

### From the UI (normal path)

1. On staging, open **Settings → Sync Prod** (admin only).
2. Pick A / B / C, click **Sync from Prod**, confirm.
3. Watch the live log (it ends with `✓ prod→staging sync complete`); the status
   badge then shows `✓ Sync completo`, or `✗ Falló` on failure.

### From the CLI (manual / debugging)

```bash
# Dry run, files only:
DRY_RUN=1 MODE=A ENV_LABEL=STAGING bash scripts/resync-prod-to-staging.sh

# Real run, files + DB:
MODE=B ENV_LABEL=STAGING NEON_API_KEY=napi_xxx bash scripts/resync-prod-to-staging.sh
```

Script-overridable env: `PROD_IP`, `PROD_BRAND_DIR`, `PROD_STATE_DIR`, `SSH_OPTS`,
`MC_WORKSPACE` / `OPENCLAW_HOME` (local destination paths only — the remote prod
source is fixed via `PROD_*`), `NEON_PROJECT`, `NEON_STAGING_BRANCH`,
`NEON_PROD_BRANCH`. (`SYNC_SCRIPT_PATH` is an **API-route** override used to
locate the script; the script itself does not read it.)

## Status & logs

The endpoint spawns the script detached and tracks it under
`workspace-sancho/_system/sync-prod-to-staging/<syncId>.{log,status.json}`.
`GET …?id=<syncId>` returns `{ state, logTail }`.

## Rollback

- **Files:** restore `~/.openclaw/backups/brand-pre-prodsync-<stamp>.tgz` over
  `workspace-sancho/brand/`.
- **Neon:** the restore preserves the prior staging branch as
  `staging_pre_prodsync_<stamp>` — restore from it in the Neon console.

## Not automatic

This is on-demand by design. If a daily refresh is wanted later, wrap the script
in an openclaw cron on staging (guarded by the same `ENV_LABEL` check). Until
then, nothing runs unless an admin clicks the button.
