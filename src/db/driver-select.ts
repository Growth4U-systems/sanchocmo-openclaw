// Driver selection for the Drizzle client.
//
// SanchoCMO ships with a bundled local Postgres (postgres:16-alpine, Compose
// profile `local-db`) so MI/POV/Polar work out-of-the-box without a Neon
// account. But the historical driver is `@neondatabase/serverless`
// (drizzle-orm/neon-http), which ONLY speaks Neon's HTTP endpoint — it cannot
// talk to a vanilla Postgres over TCP.
//
// So we pick the driver from the connection string:
//   - Neon URLs (host ends in `.neon.tech`) keep neon-http → prod is byte-identical.
//   - Anything else (the bundled `@postgres:5432`, RDS, a self-hosted PG, etc.)
//     uses postgres-js.
// `DATABASE_DRIVER` (neon|postgres) is an explicit override for edge cases and
// is set to `neon` in the G4U deploy workflows as a belt over the auto-detect.

export type DbDriver = "neon" | "postgres";

/**
 * Decide which Drizzle driver to use for a given DATABASE_URL.
 *
 * @param url      the DATABASE_URL (may be undefined/empty when no DB is configured)
 * @param override the value of DATABASE_DRIVER, if set ("neon" | "postgres")
 */
export function selectDbDriver(
  url: string | undefined,
  override?: string,
): DbDriver {
  const normalizedOverride = override?.trim().toLowerCase();
  if (normalizedOverride === "neon" || normalizedOverride === "postgres") {
    return normalizedOverride;
  }
  // Auto-detect by host: Neon serverless endpoints live under *.neon.tech
  // (incl. pooler hosts). Everything else gets the vanilla-Postgres driver.
  return url && /\.neon\.tech(?::\d+)?(?:[/?]|$)/i.test(url)
    ? "neon"
    : "postgres";
}
