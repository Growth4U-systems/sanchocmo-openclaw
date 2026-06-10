import { defineConfig } from "drizzle-kit";

// Migration baseline for the BUNDLED LOCAL Postgres (Compose profile `local-db`).
//
// The historical `src/db/migrations/` folder has no Drizzle journal, duplicate
// migration numbers and a destructive `0003_rekey_tasks_by_workspace` (DROP
// TABLE) — so `drizzle-kit migrate` can't replay it on a fresh PG. Instead we
// keep a clean, journal-backed baseline generated from the current schema here,
// applied at boot by scripts/migrate-local.mjs against the local PG only.
//
// Prod/Neon keeps using `src/db/migrations/` via the existing manual apply flow
// (scripts/apply-sql-migration.mjs) — this config never touches it.
//
// When schema.ts changes, regenerate with: npm run db:generate:local
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations-local",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
