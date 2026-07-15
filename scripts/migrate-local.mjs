// Apply the clean local baseline (src/db/migrations-local) to a vanilla
// Postgres at boot. Used ONLY for the bundled local-db (and any other non-Neon
// Postgres the user points DATABASE_URL at). Neon/managed deployments are
// skipped — they keep the historical manual apply flow
// (scripts/apply-sql-migration.mjs) and `MC_TASKS_BACKEND` semantics.
//
// Runs via drizzle-orm's programmatic migrator (runtime dep), so it does not
// depend on drizzle-kit being present. Idempotent: Drizzle tracks applied
// migrations in __drizzle_migrations, so re-runs (and version upgrades that add
// migrations) are safe.
//
// Failure is non-fatal: it logs and exits 0 so the container still boots. DB
// features degrade (surfaced by the setup checklist / preflight) instead of
// taking the whole app down.

import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// scripts/ -> repo root -> src/db/migrations-local (resolves regardless of cwd)
const MIGRATIONS_FOLDER = path.resolve(__dirname, "../src/db/migrations-local");
// Execution-control is also deployed to managed Postgres through the curated
// migration runner. Apply that same idempotent SQL locally so both driver paths
// expose the shadow Ledger without maintaining a second hand-copied schema.
const EXECUTION_CONTROL_MIGRATIONS = [
  "0019_execution_control.sql",
  "0020_execution_tenant_scope.sql",
].map((file) => path.resolve(__dirname, "../src/db/migrations", file));

const log = (msg) => console.log(`[migrate-local] ${msg}`);

// Plain-JS mirror of src/db/driver-select.ts. Kept in sync by hand — the TS
// version is the source of truth and is unit-tested; this duplicate exists only
// because the entrypoint can't import TS without tsx.
function selectDbDriver(url, override) {
  const o = override?.trim().toLowerCase();
  if (o === "neon" || o === "postgres") return o;
  return url && /\.neon\.tech(?::\d+)?(?:[/?]|$)/i.test(url)
    ? "neon"
    : "postgres";
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    log("DATABASE_URL not set — nothing to migrate (DB features disabled).");
    return;
  }
  if (selectDbDriver(url, process.env.DATABASE_DRIVER) === "neon") {
    log("Neon/managed driver — skipping local migrate (managed elsewhere).");
    return;
  }

  // Wait for Postgres to accept connections — the bundled `postgres` container
  // may still be starting up when the app boots (no hard depends_on, since it's
  // profile-gated). Short retry loop with backoff.
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const deadlineMs = 60_000;
  const start = Date.now();
  let attempt = 0;
  for (;;) {
    try {
      await sql`select 1`;
      break;
    } catch (err) {
      attempt += 1;
      if (Date.now() - start > deadlineMs) {
        log(`Postgres not reachable after ${attempt} attempts: ${err.message}`);
        await sql.end({ timeout: 5 }).catch(() => {});
        return; // non-fatal
      }
      const waitMs = Math.min(2000, 250 * attempt);
      log(`Postgres not ready (attempt ${attempt}): ${err.message} — retrying in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  try {
    const db = drizzle(sql);
    log(`Applying migrations from ${MIGRATIONS_FOLDER} …`);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    log("Applying additive execution-control migrations …");
    for (const migration of EXECUTION_CONTROL_MIGRATIONS) {
      await sql.file(migration);
    }
    log("Migrations applied (schema up to date).");
  } catch (err) {
    log(`Migration failed (non-fatal, DB features may be degraded): ${err.message}`);
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

main().catch((err) => {
  log(`Unexpected error (non-fatal): ${err?.message ?? err}`);
  process.exit(0);
});
