# Execution-control SQL migrations

Migrations `0019` through `0033` use one tracked runner in local PostgreSQL and
managed PostgreSQL. They are no longer part of the legacy replay bundle.

## Invariants

- `sancho_internal.sql_migrations` records the canonical repository name,
  SHA-256, disposition (`applied` or `adopted`) and database timestamp.
- The same name and checksum is a real skip: no migration statement and no DDL
  from the tracking runner executes.
- A recorded name with a different checksum fails before migration DDL.
  Recorded files are immutable; repair the checkout or add a new migration.
- A PostgreSQL advisory lock serializes runners. Every file and its tracking
  insert share one transaction, so a failed statement records nothing and
  rolls back that file's DDL.
- Every untracked file has a catalog verifier with three outcomes. `absent` may
  apply, `applied` may only be adopted explicitly, and `partial` always stops.
- After executing a file, the same verifier must report `applied` inside the
  transaction before tracking is inserted. Catalog or backfill postcondition
  failure rolls back both.
- `--dry-run` needs no database and validates file parsing, SHA-256,
  transaction safety, destructive-statement allowlists and verifier presence.
  It does not claim that a live database is ready.

Connection URL precedence is `EXECUTION_MIGRATIONS_DATABASE_URL`, then
`DIRECT_DATABASE_URL`, then `DATABASE_URL`. Prefer a direct/non-pooler endpoint
for migrations. Modern Neon `channel_binding` parameters unsupported by
postgres.js are removed only from the in-memory client copy, and Neon TLS is
forced to `verify-full`. The runner never prints any URL; keep it in the
one-off process environment or deployment secret store rather than command
arguments or a long-lived `.env`. Managed deploys transfer only raw base64 in a
temporary mode-0600 file, mount it read-only into the migration container,
decode it there, and delete both local and remote copies on every exit path.
Application and agent containers receive only the runtime `DATABASE_URL`.

Every migration transaction uses a 30-second PostgreSQL `lock_timeout` and a
separate 15-minute `statement_timeout`. A bounded timeout rolls the transaction
back and reports `Retryable migration timeout`; resolve the competing lock if
necessary, then retry the same command. One-shot tracking makes that retry safe.

## First rollout to an existing database

The deployment workflow does **not** auto-baseline. Each environment that
already has an untracked migration prefix requires one explicit adoption; a
clean database must apply normally and must never be adopted. Take the normal
database snapshot first and identify the prefix already installed.

For the known transition where `0019` and `0020` are installed and `0021`
through `0030` are absent:

```sh
npm run db:migrate:execution-control:adopt -- --through=0020
npm run db:migrate:execution-control
```

The first command verifies both installed schemas against PostgreSQL catalogs
and atomically records only that prefix. It fails if either migration is absent
or partial. The second command skips `0019`/`0020` and applies each remaining
file once.

In GitHub, dispatch the staging/production deployment manually and set the
audited `execution_migration_adopt_through` input to `0020`. Empty is the
default for push/normal deployments. The workflow accepts only `0019`–`0033`,
runs verified adoption in the newly built image, then immediately runs normal
apply. If the selected release is an old image without the tracked runner,
adoption fails. With no adoption input, the workflow reads (but never executes
during inspection) that image's `db:migrate:deploy` definition. A strictly
literal bundle containing only migrations `0000`–`0018` may still run when
`RUN_DB_MIGRATIONS=1`; any indirect/ambiguous command or migration `0019` and
later is classified unsafe and skipped or refused, so rollback cannot replay a
contract migration.

Manual adoption evidence is the combination of the workflow summary/log
(`github.actor`, target commit/tag, environment, requested prefix and workflow
run URL) and the committed `adopted` rows in
`sancho_internal.sql_migrations` (canonical name, checksum and database
timestamp). No database URL is included in that evidence.

For the safest release sequence, publish the runner/manual adoption capability
first while product rollout and worker boot stay off, adopt the reviewed legacy
prefix in each existing environment, and only then enable the kernel/product
slice that depends on `0021`–`0033`. Do not combine adoption with tenant rollout.

If all migrations through `0030` are already installed, adopt exactly that
reviewed prefix and then apply the remaining tracked files:

```sh
npm run db:migrate:execution-control:adopt -- --through=0030
npm run db:migrate:execution-control
```

For another known contiguous prefix, use its reviewed four-digit ID, for
example `--through=0027`. Never choose a prefix merely to make deployment pass:
an absent file makes adoption fail, and a non-contiguous or partially modified
schema requires an operator-reviewed repair/new migration. After adoption,
run the normal migration command once and verify all rows/checksums before
allowing application containers to start.

## UTC timestamp convention and pre-rollout gate

The Ledger retains `timestamp without time zone` columns for schema
compatibility, but their wall-clock values are UTC by contract. Runtime writes
convert JavaScript instants explicitly to UTC wall time, database scheduling
uses `clock_timestamp() AT TIME ZONE 'UTC'`, API/event timestamps are emitted
with a trailing `Z`, and run-pagination cursors preserve PostgreSQL's full six
microsecond digits. Correctness after this release therefore does not depend on
the Node process or PostgreSQL session timezone.

Migration `0030_execution_utc_timestamps.sql` converges every Ledger-owned
timestamp default to that explicit UTC clock. It changes catalog defaults only;
it does **not** rewrite historical rows. This is deliberate: a pre-existing
`timestamp without time zone` value contains no evidence of the timezone under
which it was written, so applying a blanket offset could corrupt valid rows.

Before enabling any durable worker or admitting new canary work in an existing
environment:

1. Record `SHOW TimeZone;` as rollout evidence. A non-UTC current value is safe
   for the new runtime, but it increases the need to establish how earlier
   `now()` defaults and writers populated existing rows; the current value alone
   does not prove the origin of historical data.
2. With all durable boot flags still `0`, inventory every non-terminal run
   (`queued`, `running`, `waiting_approval`, `blocked`), non-terminal effect
   (`prepared`, `retry_wait`, `uncertain`) and undelivered terminal projection
   (`pending`, `running`, `retry_wait`, `blocked`). Review their scheduling,
   lease, deadline and update timestamps against the corresponding audit events
   and known deployment/session timezone.
3. Keep rollout closed until that inventory is empty or every obligation has a
   documented, operator-approved disposition. Do not bulk-shift timestamps.
   Ambiguous work must be repaired, resumed, cancelled or re-admitted through
   its fenced control path after the intended instant is established.
4. Apply/verify the complete tracked set through `0033`, then confirm the
   catalog defaults are `clock_timestamp() AT TIME ZONE 'UTC'` and the
   `execution_runs_mc_chat_origin_parent_idx` index is valid before worker
   boot. A custom or partially converted shape makes the verifier fail closed.

The cross-timezone PostgreSQL acceptance matrix ran with Node in
`America/New_York` and database sessions in `Europe/Madrid`: 68/68 tests passed.
That includes 13/13 lease tests, 11/11 terminal projection/outbox tests
(including SIGKILL recovery) and 11/11 tracked-migration tests. This validates
new writes and scheduling boundaries; it does not retroactively certify rows
created before `0030`.

## Parent/child execution-origin authority

Migration `0031_execution_origin_lookup.sql` adds a partial expression index
over the MC Chat parent mirror in historical run metadata. Migration
`0032_execution_origin_tombstones.sql` supersedes that mirror as the authority:
`execution_origins` stores one exact-tenant root plus its monotonic Stop receipt,
and `execution_run_origins` stores immutable child registrations. Public or
model-controlled metadata cannot register a child, authorize delivery or join
the Stop fan-out.

Trusted child admission locks/upserts the root, creates the run and writes its
registration in one PostgreSQL statement. Stop writes its first-writer
cancellation receipt before reading children. Therefore child-first commits a
visible registration before Stop can continue, while stop-first permanently
rejects new children. Fan-out uses a stable keyset cursor in pages of 100 and
continues until exhausted; child 101 is never silently omitted. Replaying Stop
keeps the original actor, reason, timestamp and cancellation ID.

`0032` intentionally performs no metadata backfill. Elevating historical JSON
to trusted authority would recreate the privilege boundary it removes. The
cutover gate performs one read-only inventory of non-terminal rows whose
`metadata.executionOrigin` matches the exact closed schema. Each candidate is
safe only when `execution_run_origins` and `execution_origins` contain the same
tenant, run and parent. The same query verifies the essential `0032` PK, FK,
check and valid-index catalog contract, so a tracked-but-drifted schema cannot
report a false zero. Metadata is never inserted, repaired or promoted.

Managed staging and production deploys run that gate after the tracked
migrations and before replacing the previous healthy container. It performs no
database I/O while every durable worker boot flag is off; when any exact boot
flag is `1`, a gap or an unverifiable database aborts the deploy. The Next.js
instrumentation hook runs the same check before starting any durable supervisor
and fails manual boot closed. A legacy image without the tracked `0032` runner
and cutover CLI is allowed only while all three durable worker boot flags are
`0`. Logs contain only the gap count and a fixed
remediation message—never tenant keys, metadata, inputs, credentials or query
errors.

Migration `0033_execution_origin_command_claim.sql` extends the same root row
with one immutable external-command claim: operation, SHA-256 fingerprint and
database claim time. The first canonical command wins for the complete chat
parent. Exact retries reuse the claim; changed arguments or another tool fail
before product/provider I/O. An unclaimed legacy origin that already has a
registered child is never adopted. Before enabling agent tool routes after the
upgrade, drain or replace older writers that do not know this claim contract.
The rollout preflight verifies the full tracked set through `0033`; the
separate origin cutover inventory remains specifically the `0032` authority
gate.

With all boot flags still off, operators can force the same inventory:

```bash
npm run execution:origin-cutover:check -- --require
```

If it reports a non-zero count, keep admissions and durable workers off. Drain
or cancel each affected run through its exact run control path, then re-admit
the intended work through the trusted-origin API and repeat the check. Do not
insert registrations from JSON. During this rollout, do not run an old
metadata-only writer concurrently with origin-bearing chat work. The normal
cutover starts with the previously deployed boot flags at `0`; if an old writer
is already active, quiesce its admissions before the preflight because a
read-only check cannot serialize against a cross-version writer.

The bundled local database uses the same runner and catalog verifiers through
`scripts/migrate-local.mjs`. An existing local database follows the same
explicit adoption procedure. Local bootstrap remains non-fatal to the whole
container, but the runner performs no blind DDL and product readiness stays
closed when migration fails.

## Expand, contract, and rollback

1. Add a new immutable numbered file and a catalog verifier. Its initial
   change should be additive/nullable and compatible with both application
   versions.
2. Deploy code that can read both shapes, backfill with a separately observable
   operation if needed, and verify the new invariant.
3. After the rollback window and old writers are gone, add a later contract
   migration. Any `DROP` or `TRUNCATE` must be narrowly
   allowlisted for that exact immutable file.
4. Roll application code back without a down migration while its compatibility
   window is open. Schema rollback is a separate reviewed operation; the
   runner never deletes a tracking row or replays an old contract migration.

`0020`/`0024` are the existing expand/contract pair for tenant identity.
`0024` and `0028` contain contract operations, which is why durable one-shot
tracking is mandatory rather than relying on their former rerunnable wording.
`0030` is a metadata-only default convergence: it preserves column types and
data and does not perform a historical timestamp backfill.

## Verification

Static validation:

```sh
npm run db:migrate:execution-control:check
```

The PostgreSQL integration suite requires a dedicated disposable database; it
drops execution-control tables and must never point at a shared environment:

```sh
TRACKED_SQL_MIGRATION_TEST_DATABASE_URL=postgres://…/san480_migration_test \
TRACKED_SQL_MIGRATION_TEST_ALLOW_DESTRUCTIVE=1 \
  npx tsx --test \
  src/lib/__tests__/tracked-sql-migrations.integration.test.mts
```

The database name must match `^san480_migration_[a-z0-9_]+$`; the suite also
checks `current_database()` before its first drop. It proves clean apply under
a hostile inherited `search_path`, a second skip with an event-trigger
assertion of zero DDL, exhaustive catalog/backfill adoption, the immutable
legacy prefix through `0020`, refusal of corrupt/partial state, modern
`channel_binding` URL normalization, checksum drift before DDL, two concurrent
runners, postcondition enforcement and transaction rollback. The unit suite
also verifies that the runtime Docker image and deploy capability gates contain
the required runner paths.
