import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { formatElapsed, formatRelative } from "@/lib/format-elapsed";
import type { ProgressEvent, ProgressKind } from "@/hooks/useChat";

const KIND_ICON: Record<ProgressKind, string> = {
  thinking: "💭",
  tool_call: "🔧",
  file_write: "📝",
  agent_handoff: "🤝",
  search: "🔍",
  read: "📖",
};

function eventLine(evt: ProgressEvent) {
  const icon = KIND_ICON[evt.kind] ?? "•";
  const target = evt.target ? ` · ${evt.target}` : "";
  return { icon, body: `${evt.label}${target}` };
}

interface Props {
  events: ProgressEvent[];
  mode: "live" | "sealed";
}

/**
 * Timeline of granular progress events emitted by the gateway during a turn.
 *
 *   mode="live"   — rendered above the typing indicator while the agent is
 *                   actively working. Always expanded, append-only. The last
 *                   event shows a 1Hz elapsed-time ticker and a separate row
 *                   reports the total turn duration so the user always sees
 *                   the clock moving even when the agent goes silent.
 *   mode="sealed" — rendered inside the bot's final message as a collapsible
 *                   summary ("▾ N pasos"). Collapsed by default. Each event
 *                   shows its age relative to the latest event in the run.
 */
export function ProgressTimeline({ events, mode }: Props) {
  const [expanded, setExpanded] = useState(mode === "live");
  // 1Hz tick so the live ticker and total elapsed advance smoothly even when
  // no new server events arrive. Mounted only in live mode to avoid useless
  // re-renders on collapsed sealed timelines.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (mode !== "live") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [mode]);

  if (!events?.length) return null;

  if (mode === "sealed") {
    // Anchor relative timestamps to the last event in the run (i.e. the
    // moment the timeline was sealed). Older events render "hace Nm Ms"; the
    // last one always reads "recién" (delta = 0).
    const anchorTs = events[events.length - 1]?.ts ?? 0;
    return (
      <div className="mt-2 border-t border-[#45475a]/50 pt-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[11px] text-[#a6adc8] hover:text-[#cdd6f4] flex items-center gap-1"
        >
          <span>{expanded ? "▾" : "▸"}</span>
          <span>{events.length} {events.length === 1 ? "paso" : "pasos"}</span>
        </button>
        {expanded && (
          <ul className="mt-1.5 space-y-0.5">
            {events.map((evt, i) => {
              const { icon, body } = eventLine(evt);
              const relative = typeof evt.ts === "number" && anchorTs
                ? formatRelative(anchorTs - evt.ts)
                : null;
              return (
                <li
                  key={i}
                  className="text-[11px] text-[#a6adc8] flex items-start gap-1.5 leading-snug"
                >
                  <span className="shrink-0">{icon}</span>
                  <span className="flex-1 break-words">
                    {body}
                    {relative && (
                      <span className="text-[#6c7086]"> · {relative}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  // Live mode: ticker on the last event, total elapsed at the bottom.
  const firstTs = events[0]?.ts ?? now;
  const lastEvent = events[events.length - 1];
  const lastTs = lastEvent?.ts ?? now;
  const lastElapsedMs = Math.max(0, now - lastTs);
  const totalElapsedMs = Math.max(0, now - firstTs);

  return (
    <>
      <ul className={cn("space-y-0.5 mt-1")}>
        {events.map((evt, i) => {
          const { icon, body } = eventLine(evt);
          const isLast = i === events.length - 1;
          return (
            <li
              key={i}
              className={cn(
                "text-[11px] flex items-start gap-1.5 leading-snug",
                isLast ? "text-[#cdd6f4]" : "text-[#a6adc8]"
              )}
            >
              <span className="shrink-0">{icon}</span>
              <span className="flex-1 break-words">
                {body}
                {isLast && (
                  <span className="text-[#a6adc8]"> · {formatElapsed(lastElapsedMs)}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="text-[10px] text-[#6c7086] italic mt-0.5">
        ⏱️ {formatElapsed(totalElapsedMs)} en este turno
      </div>
    </>
  );
}
