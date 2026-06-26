/**
 * Next.js server-startup hook (runs once per server process).
 *
 * Backfills brand provisioning for any client written WITHOUT going through the
 * UI create-client flow — chiefly the setup wizard's first brand, which only
 * writes the clients.json entry and would otherwise boot inert (no Foundation
 * tasks, no crons, no brand dir tree). Runs inside the Next runtime so it reuses
 * the exact same provisioning code as the UI (zero drift) — no tsx needed. (SAN-336)
 *
 * Guarded to the Node.js runtime, dynamically imported (keeps fs/server-only deps
 * out of the edge bundle), and fully best-effort: a failure here must never block
 * the server from starting.
 */
export async function register(): Promise<void> {
  // Positive-form guard: Next compiles this file for BOTH the nodejs and edge
  // runtimes and statically replaces process.env.NEXT_RUNTIME per bundle, so the
  // node-only dynamic import below is dead-code-eliminated from the edge bundle
  // (where fs/path don't resolve). Don't refactor to an early `return`.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { ensureAllClientsProvisioned } = await import("@/lib/data/provision-client");
      const { provisioned } = ensureAllClientsProvisioned();
      if (provisioned.length) {
        console.log(`[instrumentation] provisioned ${provisioned.length} brand(s): ${provisioned.join(", ")}`);
      }
    } catch (err) {
      console.error("[instrumentation] client provisioning backfill failed:", err);
    }
  }
}
