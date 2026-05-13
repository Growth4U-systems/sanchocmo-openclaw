import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

export const hasDatabase = Boolean(process.env.DATABASE_URL);

const missingDatabase = new Proxy({}, {
  get() {
    throw new Error("DATABASE_URL is not configured. Add a Neon connection string before using database-backed APIs.");
  },
}) as ReturnType<typeof drizzle>;

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
export const db = sql ? drizzle(sql) : missingDatabase;

export function getDb() {
  if (!hasDatabase) {
    throw new Error("DATABASE_URL is not configured. Add a Neon connection string before using database-backed APIs.");
  }
  return db;
}
