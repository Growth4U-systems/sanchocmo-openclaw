import { useState } from "react";
import { cn } from "@/lib/utils";
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
 *                   actively working. Always expanded, append-only.
 *   mode="sealed" — rendered inside the bot's final message as a collapsible
 *                   summary ("▾ N pasos"). Collapsed by default.
 */
export function ProgressTimeline({ events, mode }: Props) {
  const [expanded, setExpanded] = useState(mode === "live");
  if (!events?.length) return null;

  if (mode === "sealed") {
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
              return (
                <li
                  key={i}
                  className="text-[11px] text-[#a6adc8] flex items-start gap-1.5 leading-snug"
                >
                  <span className="shrink-0">{icon}</span>
                  <span className="flex-1 break-words">{body}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  return (
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
            <span className="flex-1 break-words">{body}</span>
          </li>
        );
      })}
    </ul>
  );
}
