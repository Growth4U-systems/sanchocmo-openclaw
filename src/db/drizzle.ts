import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { selectDbDriver } from "./driver-select";

// Call sites are typed against the historical neon-http client so the whole
// codebase keeps compiling unchanged regardless of which driver is live at
// runtime. The query-builder API the app uses (select/insert/update/delete/
// transaction/execute) is structurally identical across both drivers; the only
// real divergences — `.batch()` (neon-only) and write-result shape
// (`rowCount` vs `count`) — are handled explicitly at the single call site that
// needs them (src/lib/data/client-lifecycle.ts).
type Db = ReturnType<typeof drizzleNeon>;
export type { Db };

export const hasDatabase = Boolean(process.env.DATABASE_URL);

let _db: Db | null = null;

export function getDb(): Db {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Set it in .env to enable database-backed features.",
    );
  }
  // Neon URLs keep the historical neon-http driver (prod byte-identical); the
  // bundled local Postgres (and any other vanilla PG) uses postgres-js, which
  // neon-http cannot talk to. See driver-select.ts for the auto-detect rules.
  if (selectDbDriver(url, process.env.DATABASE_DRIVER) === "neon") {
    _db = drizzleNeon(neon(url));
  } else {
    // postgres.js: single connection is plenty for the in-container app; the
    // client lazily opens on first query, mirroring neon-http's behavior. Cast
    // at this boundary to the historical type — see the `Db` note above.
    _db = drizzlePostgres(postgres(url)) as unknown as Db;
  }
  return _db;
}

// Lazy proxy: avoid crashing at import time when DATABASE_URL is unset.
// Only code paths that actually touch the DB will throw — JSON-backed
// callers (MC_TASKS_BACKEND=json) never trigger the proxy.
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
