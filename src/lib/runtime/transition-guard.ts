import { listActiveAgentRunsAsync } from "@/lib/data/agent-runs";

export interface RuntimeTransitionBlocker {
  id: string;
  threadId: string;
  runtime: string;
  status: "queued" | "running";
}

/**
 * A runtime endpoint, credential or topology must not change while a run can
 * still callback or be cancelled through its original binding. This guard is
 * the immediate safety barrier until runtime bindings can drain independently.
 */
export async function listRuntimeTransitionBlockers(
  limit = 20,
  listActive: typeof listActiveAgentRunsAsync = listActiveAgentRunsAsync,
): Promise<RuntimeTransitionBlocker[]> {
  const runs = await listActive(limit);
  return runs
    .filter(
      (run): run is typeof run & { status: "queued" | "running" } =>
        run.status === "queued" || run.status === "running",
    )
    .map((run) => ({
      id: run.id,
      threadId: run.threadId,
      runtime: run.runtime,
      status: run.status,
    }));
}

export function runtimeTransitionBlockedPayload(
  activeRuns: RuntimeTransitionBlocker[],
) {
  return {
    error:
      "No se puede cambiar ni reconfigurar el runtime mientras haya ejecuciones activas.",
    code: "runtime_transition_active_runs",
    activeRuns,
  };
}
