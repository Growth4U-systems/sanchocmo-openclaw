"use client";

import { useState } from "react";
import type { DesyncReport } from "@/lib/content/desync-detector";

/**
 * ⚠ badge for ContentTasks whose state contradicts the artifacts on disk
 * (SAN-153). Data comes from the LAST PERSISTED reconciler run — never
 * computed live (no self-healing GETs); up to 15 min stale by design.
 * The popover lists each desync with its suggested action; the only inline
 * CTA is retrigger (the reconciler already auto-fixes everything promotable).
 */

interface Props {
  desyncs: DesyncReport[];
  /** Fires the writer retrigger for this CT. Omit to hide the CTA. */
  onRetrigger?: () => void;
  retriggering?: boolean;
}

const KIND_LABEL: Record<DesyncReport["kind"], string> = {
  "draft-on-disk-phase-stale": "Draft en disco sin reportar",
  "media-attached-state-stale": "Media adjunta sin reflejar",
  "status-behind-aggregate": "Status por detrás de las fases",
  "clarify-answered-phase-stale": "Clarify respondido, writer sin retomar",
  "writer-stalled": "Writer parado",
  "invalid-pipeline-state": "pipeline_state corrupto",
};

export function DesyncBadge({ desyncs, onRetrigger, retriggering }: Props) {
  const [open, setOpen] = useState(false);
  if (desyncs.length === 0) return null;

  const wantsRetrigger = desyncs.some((d) => d.suggested_action === "retrigger-writer");

  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Fase desincronizada — ver detalle"
        className="inline-flex items-center gap-1 text-[11px] font-bold border-2 border-ink rounded px-2 py-0.5 bg-rust/15 text-rust hover:-translate-y-0.5 transition-all"
      >
        ⚠ {desyncs.length === 1 ? "desync" : `${desyncs.length} desyncs`}
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 left-0 w-80 border-[3px] border-ink rounded-lg bg-card p-3 shadow-comic text-left"
          onMouseLeave={() => setOpen(false)}
        >
          <p className="text-[11px] text-muted-foreground mb-2">
            Estado del CT contradicho por los artefactos (última reconciliación).
          </p>
          <ul className="space-y-2">
            {desyncs.map((d, i) => (
              <li key={`${d.kind}-${d.channel || ""}-${i}`} className="text-[12px] leading-snug">
                <span className="font-bold">
                  {KIND_LABEL[d.kind] || d.kind}
                  {d.channel ? ` · ${d.channel}` : ""}
                </span>
                <br />
                <span className="text-muted-foreground">{d.detail}</span>
              </li>
            ))}
          </ul>
          {wantsRetrigger && onRetrigger && (
            <button
              type="button"
              disabled={retriggering}
              onClick={() => {
                onRetrigger();
                setOpen(false);
              }}
              className="mt-3 w-full px-3 py-1.5 text-[12px] font-semibold border-2 border-ink rounded bg-yellow-400/30 hover:-translate-y-0.5 transition-all disabled:opacity-40"
            >
              {retriggering ? "⏳ Relanzando writer…" : "🔄 Relanzar writer"}
            </button>
          )}
        </div>
      )}
    </span>
  );
}
