import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

type Db = ReturnType<typeof drizzle>;

let _db: Db | null = null;

function getDb(): Db {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Set it in .env to enable database-backed features.",
    );
  }
  _db = drizzle(neon(url));
  return _db;
}

// Lazy proxy: avoid crashing at import time when DATABASE_URL is unset.
// Only code paths that actually touch the DB will throw — JSON-backed
// callers (MC_TASKS_BACKEND=json) never trigger the proxy.
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
