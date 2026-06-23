"use client";

import { useState } from "react";
import {
  useReconcileNow,
  useReconcileState,
} from "@/hooks/useContentReconcile";
import type { ReconcileStateResponse } from "@/hooks/useContentReconcile";

/**
 * Slim status bar for the content reconciler (SAN-153), shown on the Canales
 * home. Two jobs: (1) make the reconciler's OWN staleness visible — the cron
 * runs through the gateway, so if the gateway is down the reconciler silently
 * stops too; "última pasada hace 6h" is the tell. (2) "Reconciliar ahora" for
 * when you don't want to wait for the 15-min cron.
 */

function relTime(iso?: string): string {
  if (!iso) return "—";
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(min) || min < 0) return "—";
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr}h`;
  return `hace ${Math.floor(hr / 24)}d`;
}

function hasCompletedRun(
  state: ReconcileStateResponse | undefined,
): state is Exclude<ReconcileStateResponse, { never_ran: true }> {
  return Boolean(state && !("never_ran" in state));
}

export function ReconcileBar({ slug }: { slug: string }) {
  const { data: state } = useReconcileState(slug);
  const reconcileNow = useReconcileNow();
  const [summary, setSummary] = useState<string | null>(null);

  const lastRun = hasCompletedRun(state) ? state : null;
  const desyncCount = lastRun?.desyncs.length ?? 0;
  const stale =
    lastRun && Date.now() - Date.parse(lastRun.ran_at) > 60 * 60_000;

  const run = () => {
    setSummary(null);
    reconcileNow.mutate(
      { slug },
      {
        onSuccess: (r) =>
          setSummary(
            `✓ ${r.scanned} revisadas · ${r.promoted.length} promovidas · ${r.desyncs.length} desyncs`,
          ),
        onError: (e) => setSummary(`⚠ ${(e as Error).message}`),
      },
    );
  };

  return (
    <div className="flex items-center gap-3 flex-wrap text-[12px] border-2 border-dashed border-ink/30 rounded-lg px-3 py-2 bg-muted/20">
      <span className="font-semibold">🔁 Sincronización de fases</span>
      <span className={stale ? "text-rust font-bold" : "text-muted-foreground"}>
        última pasada: {relTime(lastRun?.ran_at)}
        {stale && " · ⚠ el cron parece parado"}
      </span>
      {desyncCount > 0 && (
        <span className="font-bold text-rust">
          ⚠ {desyncCount} {desyncCount === 1 ? "desync" : "desyncs"}
        </span>
      )}
      {summary && <span className="text-muted-foreground">{summary}</span>}
      <button
        type="button"
        onClick={run}
        disabled={reconcileNow.isPending}
        className="ml-auto px-2.5 py-1 font-semibold border-2 border-ink rounded bg-card hover:-translate-y-0.5 transition-all disabled:opacity-40"
      >
        {reconcileNow.isPending ? "⏳ Reconciliando…" : "Reconciliar ahora"}
      </button>
    </div>
  );
}
