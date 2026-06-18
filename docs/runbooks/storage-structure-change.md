# Storage Structure Change Runbook

How to ship a change to **how data is stored** without breaking existing brands or
production. This is the application-plan home required by the first non-negotiable
in [`../engineering-standards.md`](../engineering-standards.md): a storage change
is not done until its migration exists *and* its application is recorded here.

This runbook is about **structure/shape changes that need a migration** (schema,
on-disk layout, JSON shape). It is distinct from
[`staging-to-production-data-migration.md`](staging-to-production-data-migration.md),
which moves *runtime data* between environments.

## Principles

- A structure change is reproducible: dry-run, apply, verify — never a one-shot
  hand edit on a live box.
- Migrations are **idempotent**: running twice is safe, and re-running detects
  "already migrated" instead of corrupting.
- Existing data is brought forward in the **same change** that introduces the new
  shape. New code must not assume a shape that old data doesn't have yet.
- The application plan is written **before** applying anything, and every applied
  change leaves a row in the [Change Log](#change-log) below.
- Never migrate or expose secrets as part of a structure migration.

## Does this apply to my change?

If your diff touches any of these, yes — and `npm run lint:storage` will block the
push until the artifact + a Change Log entry exist.

| Backend | Trigger surface | Migration artifact |
|---|---|---|
| **Neon / Postgres** | `src/db/schema.ts`, new `src/db/migrations/*.sql` | Drizzle migration + `npm run db:verify` |
| **On-disk brand files** | writers under `src/lib/data/*` that change `brand/{slug}/` layout | backfill script (`--dry-run` / `--apply`) over existing brands |
| **JSON document shape** | shape of `foundation-state.json`, `instance.json`, chat schema, etc. | idempotent rewriter over existing files |

## Writing the migration

Reuse the existing tooling and patterns — do not invent new frameworks.

- **DB:** generate with `drizzle-kit`, commit the `.sql` under `src/db/migrations/`,
  and add a verification (`scripts/verify-migration.ts`, `npm run db:verify`).
- **Brand files / JSON:** model the script on
  `scripts/migrate-projects-to-db.ts` (dual `--dry-run` / `--apply`) or
  `scripts/audit-doc-paths.mts` (`--check` / `--fix`). It must:
  - Walk **all** existing brand slugs / files, not just one.
  - Be idempotent (detect already-migrated and skip).
  - Print a summary (counts: migrated / skipped / errors) under both flags.
  - Default to dry-run; require an explicit `--apply` to write.

## Application plan (fill this per change)

Copy this block into a new [Change Log](#change-log) entry and complete it before
applying. The order is always **local → staging → prod**; prod Neon migrations run
**separately from the code deploy** (`RUN_DB_MIGRATIONS=1`), so name the step.

```md
### <date> — <SAN-id> — <short title>

- **Backend(s):** db | brand-files | json
- **What changed:** <one line>
- **Migration artifact:** <path to migration/backfill script or .sql>
- **How to apply:**
  - local:   <command>
  - staging: <command / SSH step / deploy flag>
  - prod:    <command / `RUN_DB_MIGRATIONS=1` / SSH step>
- **Idempotent:** yes/no (how re-runs are detected)
- **Verification:** <command + what to eyeball>
- **Rollback:** <how to undo: down-migration, restore backup, revert files>
- **Applied:** local ☐  staging ☐  prod ☐
```

## Verification

- DB: `npm run db:verify`; confirm row counts / new columns; spot-check sample rows.
- Files/JSON: re-run the migration in `--dry-run` after `--apply` — it must report
  **zero** changes remaining (proves idempotency and completeness).
- App: `curl -fsS https://staging.sanchocmo.ai/api/health` (and prod after prod
  apply); open an affected brand and confirm the feature reads/writes correctly.

## Rollback

- **DB:** apply the down-migration, or restore the preserved Neon backup branch.
- **Brand files / JSON:** restore from the pre-migration tar backup of the affected
  paths. Take that backup as the first step of `--apply` in prod.

## Linear update

Leave a comment on the SAN issue with: backend(s), migration artifact, environments
applied, verification result, and backup/rollback location.

---

## Change Log

Newest first. Every applied storage-structure change gets an entry.

<!-- Add entries here using the Application plan template above. -->

_None yet._
