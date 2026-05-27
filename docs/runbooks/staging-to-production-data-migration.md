# Staging to Production Data Migration Protocol

This protocol governs moving runtime client data from staging to production.
Code deploys do not migrate documents, tasks, chats, agent state, or database
rows. Those are separate runtime assets and must be moved explicitly.

## Principles

- Production is the customer-facing source of truth once cutover is complete.
- Staging data may overwrite production data only when the operator explicitly
  approves that scope.
- Every migration must be reproducible: dry-run, manifest, backup, copy, verify.
- Do not mark provenance by editing generated client documents. Store provenance
  in a migration manifest so content stays clean.
- Never migrate secrets, OAuth/session state, local `.env` files, or raw auth
  profiles as part of a document migration.

## Migration Modes

Use the narrowest mode that satisfies the request.

| Mode | Use when | Default behavior |
| --- | --- | --- |
| Inventory only | Deciding what should move | Read-only; writes a proposed manifest |
| Additive document import | Moving approved docs/outputs for selected clients | Copies new/changed files; does not delete prod files |
| Client mirror | Prod client should exactly match staging client | Requires explicit approval; may delete stale prod files |
| Full cutover sync | Staging is still the live source of truth | Uses `scripts/resync-staging-to-prod.sh`; requires a separate go/no-go |

For normal document promotion, use **Additive document import**. Do not use the
full cutover script unless production is not receiving independent writes.

## What To Migrate

For each client slug, decide the scope before copying anything.

Default document/output candidates:

- `foundation-state.json`
- `company-brief/`
- `company-context/`
- `market-and-us/`
- `go-to-market/`
- `strategic-plan/`
- `brand-book/`
- `brand-identity/`
- `brand-voice/`
- `business-model/`
- `budget/`
- `operational/`
- `content/`
- `content-strategy/`
- `content-playbook/`
- `presentations/`
- `intelligence/`
- `metrics/`
- `monitoring/`
- `projects/`
- `ideas.json`
- `metrics-plan.json`
- `client-config.json`

Case-by-case candidates:

- `chat/` only if conversation history is part of the acceptance criteria.
- `recurring-tasks/` only if the client cron/task setup must also move.
- `integrations.json` only after checking it does not contain secrets or
  environment-specific IDs.
- `daily-pulse/`, `leads/`, `campaigns/`, `trust-engine/`, `seo-keywords/`,
  `niche-discovery/`, `research/`, or other client-specific folders only when
  named in the migration request.
- Neon database rows for tasks, POV bank, meeting intelligence, or other DB
  backed state only when file migration is insufficient.

Never migrate automatically:

- `.env`
- `*.bak`, `*.broken-backup`, `*.review-*`, ad hoc reset backups
- `_archive/` unless specifically requested
- `costs.json` unless cost history itself is being migrated
- auth/session files such as `auth-state.json`, `auth-profiles.json`, OAuth
  tokens, CLI accounts, or anything under a secret-specific directory
- whole `.openclaw/` state for a document-only migration

## Preflight Checklist

Before copying files:

- Identify the target client slugs.
- Identify the exact folder/file scope for each slug.
- Confirm whether production has independent writes for those clients.
- Confirm whether deletes are allowed. Default: no deletes.
- Confirm whether Neon DB state must move. Default: no DB restore.
- Confirm whether production should be briefly write-frozen for the affected
  clients.
- Verify both environments are healthy:

```bash
curl -fsS https://staging.sanchocmo.ai/api/health
curl -fsS https://app.sanchocmo.ai/api/health
```

## Inventory

Generate an inventory before the dry-run. The inventory should classify each
file as `new`, `changed`, `same`, `deleted-in-staging`, or `conflict`.

Recommended manifest location in production:

```text
/root/.openclaw/workspace-sancho/_system/migrations/staging-to-prod/<sync_id>.json
```

Recommended local review location before execution:

```text
.context/migrations/<sync_id>/
```

Manifest schema:

```json
{
  "sync_id": "staging-to-prod-2026-05-27T10-30-00Z",
  "source_env": "staging",
  "target_env": "production",
  "mode": "additive-document-import",
  "approved_by": "operator-name",
  "source_health": {
    "version": "0.4.2",
    "commit": "source-commit"
  },
  "target_health_before": {
    "version": "0.4.2",
    "commit": "target-commit"
  },
  "clients": {
    "growth4u": {
      "include": ["foundation-state.json", "company-brief/", "market-and-us/"],
      "exclude": [".env", "*.bak", "_archive/"],
      "files": [
        {
          "path": "brand/growth4u/company-brief/overview.md",
          "size": 12345,
          "sha256": "abc123...",
          "action": "changed"
        }
      ]
    }
  },
  "db": {
    "included": false,
    "backup_branch": null
  },
  "verification": {
    "hashes_match": null,
    "ui_checked": null,
    "api_checked": null
  }
}
```

## Dry-Run

Run `rsync` in dry-run mode first and save the output in the manifest folder.

```bash
SYNC_ID="staging-to-prod-$(date -u +%Y-%m-%dT%H-%M-%SZ)"
CLIENT="growth4u"
SRC="root@staging.sanchocmo.ai:/root/.openclaw/workspace-sancho/brand/$CLIENT/"
DST="root@app.sanchocmo.ai:/root/.openclaw/workspace-sancho/brand/$CLIENT/"

mkdir -p ".context/migrations/$SYNC_ID"

rsync -aHn --itemize-changes \
  --exclude='.env' \
  --exclude='*.bak' \
  --exclude='*.broken-backup' \
  --exclude='*.review-*' \
  --exclude='_archive/' \
  "$SRC" "$DST" | tee ".context/migrations/$SYNC_ID/rsync-dry-run.txt"
```

For client mirror mode, add `--delete` only after approval:

```bash
rsync -aHn --delete --itemize-changes ... "$SRC" "$DST"
```

## Approval Gate

Before execution, the operator must approve:

- client slugs
- included paths
- excluded paths
- copy mode: additive or mirror
- whether deletes are allowed
- whether DB restore is included
- expected user-visible impact
- rollback plan

No approval means no migration.

## Backup

Create a production backup before execution.

For file migrations:

```bash
CLIENT="growth4u"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ssh root@app.sanchocmo.ai \
  "cd /root/.openclaw/workspace-sancho && tar -czf /root/.openclaw/backups/${CLIENT}-pre-doc-sync-${STAMP}.tgz brand/${CLIENT}"
```

For Neon migrations:

- Use the Neon branch restore flow only if DB-backed state must move.
- Preserve the current production branch under a timestamped backup name.
- Record the backup branch ID/name in the manifest.

## Execute

For additive document import:

```bash
rsync -aH --itemize-changes \
  --exclude='.env' \
  --exclude='*.bak' \
  --exclude='*.broken-backup' \
  --exclude='*.review-*' \
  --exclude='_archive/' \
  "$SRC" "$DST" | tee ".context/migrations/$SYNC_ID/rsync-apply.txt"
```

For mirror mode:

```bash
rsync -aH --delete --itemize-changes \
  --exclude='.env' \
  --exclude='*.bak' \
  --exclude='*.broken-backup' \
  --exclude='*.review-*' \
  --exclude='_archive/' \
  "$SRC" "$DST" | tee ".context/migrations/$SYNC_ID/rsync-apply.txt"
```

After copying, write the final manifest to production:

```bash
ssh root@app.sanchocmo.ai \
  "mkdir -p /root/.openclaw/workspace-sancho/_system/migrations/staging-to-prod"

scp ".context/migrations/$SYNC_ID/manifest.json" \
  "root@app.sanchocmo.ai:/root/.openclaw/workspace-sancho/_system/migrations/staging-to-prod/$SYNC_ID.json"
```

## Verification

Run all verification before calling the migration complete.

File verification:

- Compare source and target sha256 for all migrated files.
- Confirm no excluded files moved.
- Confirm no unexpected deletes occurred.
- Confirm the production manifest exists.

Application verification:

```bash
curl -fsS https://app.sanchocmo.ai/api/health
```

For each migrated client:

- Open the production client dashboard.
- Open Foundation / Brand Brain docs that were migrated.
- Open the affected project/task pages and verify output document links resolve.
- If `chat/` moved, open the relevant thread and confirm messages/rendered
  document links are present.
- If `recurring-tasks/` moved, verify recurring task status and next run.
- If DB state moved, compare row counts and inspect sample records for tasks,
  POV bank, meeting intelligence, and any affected features.

Model/auth regression checks:

- Production Settings → Models shows the expected agent model assignments.
- Sancho/Hamete/Sanson show the intended Opus model if they are part of the
  current release scope.
- Anthropic auth remains subscription-based and does not switch to API key
  routing.
- OpenAI/Codex subscription state remains intact.

## Rollback

For additive file import:

- Restore from the production tar backup if the copied files are bad.
- If only a small set is wrong, restore those paths from the backup archive.

For mirror mode:

- Restore the whole client directory from the pre-sync backup.

For Neon:

- Restore the preserved production backup branch.

Rollback also needs post-rollback verification using the same checks above.

## Linear Update

Every migration must leave a Linear comment with:

- sync ID
- clients migrated
- paths included
- mode used
- DB included or skipped
- backup location / Neon backup branch
- verification result
- production health after migration

## Current Recommendation

For the current SAN-7 production work, do not run the broad
`scripts/resync-staging-to-prod.sh` as a first step. First build an inventory of
the specific clients and documents that should move, approve that list, then run
an additive document import with a manifest. Use the full sync script only if the
goal is to make production exactly mirror staging and production has not received
independent writes.
