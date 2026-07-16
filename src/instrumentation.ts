import { resolveDurableWorkerBootPlan } from "@/lib/runtime/durable-worker-boot-plan";

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
    const workerBootPlan = resolveDurableWorkerBootPlan(process.env);

    if (Object.values(workerBootPlan).some(Boolean)) {
      const {
        executionOriginCutoverFailureMessage,
        verifyExecutionOriginCutover,
      } = await import("@/lib/runtime/execution-origin-cutover-gate");
      try {
        await verifyExecutionOriginCutover({ env: process.env });
        console.log(
          "[instrumentation] execution-origin cutover gate ready for durable worker boot",
        );
      } catch (error) {
        console.error(
          `[instrumentation] ${executionOriginCutoverFailureMessage(error)}`,
        );
        throw new Error("durable_worker_origin_cutover_gate_failed");
      }
    }

    try {
      const { ensureAllClientsProvisioned } =
        await import("@/lib/data/provision-client");
      const { provisioned } = ensureAllClientsProvisioned();
      if (provisioned.length) {
        console.log(
          `[instrumentation] provisioned ${provisioned.length} brand(s): ${provisioned.join(", ")}`,
        );
      }
    } catch (err) {
      console.error(
        "[instrumentation] client provisioning backfill failed:",
        err,
      );
    }

    if (workerBootPlan.partnershipsDiscovery) {
      try {
        const { startCanaryDiscoveryWorkers } =
          await import("@/lib/partnerships/discovery-durable-worker");
        const tenants = await startCanaryDiscoveryWorkers();
        if (tenants.length) {
          console.log(
            `[instrumentation] started durable Partnerships discovery workers: ${tenants.join(", ")}`,
          );
        }
      } catch (err) {
        // Startup remains available so operators can inspect/retry. Command
        // creation itself is fail-closed while canary authority is enabled.
        console.error(
          "[instrumentation] durable Partnerships discovery startup failed:",
          err,
        );
      }
    }

    if (workerBootPlan.leadsSearch) {
      try {
        const { startLeadsSearchWorkers } =
          await import("@/lib/leads/search-durable-worker");
        const tenants = await startLeadsSearchWorkers();
        if (tenants.length) {
          console.log(
            `[instrumentation] started native durable Leads search canary: ${tenants.join(", ")}`,
          );
        }
      } catch (err) {
        // The app remains inspectable while persisted Ledger scopes stay queued
        // for the next successful supervisor scan/restart.
        console.error(
          "[instrumentation] native durable Leads search startup failed:",
          err,
        );
      }
    }
  }
}
