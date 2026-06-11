import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ContentReconcileResult,
} from "@/lib/content/content-reconciliation";
import type { DesyncReport } from "@/lib/content/desync-detector";

/**
 * Client hooks for the content reconciler (SAN-153).
 *
 * The UI reads the PERSISTED last run (`reconcile-state.json` via GET) — it
 * never computes desyncs live. Staleness up to one cron interval (15 min) is
 * fine for windows measured in hours; "Reconciliar ahora" exists for the
 * impatient and the badge shows `ran_at` so the staleness is visible.
 */

export type ReconcileStateResponse =
  | { ok: true; never_ran: true }
  | ContentReconcileResult;

export function useReconcileState(slug: string | null) {
  return useQuery<ReconcileStateResponse>({
    queryKey: ["content-reconcile-state", slug],
    queryFn: async () => {
      const res = await fetch(`/api/content-engine/reconcile?slug=${slug}`);
      if (!res.ok) throw new Error("Failed to load reconcile state");
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export function useReconcileNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ slug }: { slug: string }) => {
      const res = await fetch(`/api/content-engine/reconcile?slug=${slug}`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Reconcile failed");
      }
      return (await res.json()) as ContentReconcileResult;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["content-reconcile-state", v.slug] });
      qc.invalidateQueries({ queryKey: ["content-task"] });
      qc.invalidateQueries({ queryKey: ["content-tasks"] });
      qc.invalidateQueries({ queryKey: ["content-engine-state-activity", v.slug] });
    },
  });
}

/** Desyncs of the last persisted run for one ContentTask (case-insensitive —
 *  thread/route ids arrive lowercased while tasks.json is mixed-case). */
export function desyncsForContentTask(
  state: ReconcileStateResponse | undefined,
  contentTaskId: string | null | undefined,
): DesyncReport[] {
  if (!state || "never_ran" in state || !contentTaskId) return [];
  const wanted = contentTaskId.toLowerCase();
  return state.desyncs.filter((d) => d.contentTaskId.toLowerCase() === wanted);
}
