/** KPI display card for metrics dashboard with optional delta + status bar. */

import { cn } from "@/lib/utils";

interface KpiCardProps {
  value: string | number;
  label: string;
  delta?: { value: string; direction: "up" | "down" | "flat" };
  status?: "good" | "warn" | "bad" | "neutral";
}

const STATUS_COLOR: Record<string, string> = {
  good: "bg-sage",
  warn: "bg-yellow-400",
  bad: "bg-destructive",
  neutral: "bg-border",
};

const DELTA_STYLE: Record<string, { arrow: string; color: string }> = {
  up: { arrow: "↑", color: "text-sage" },
  down: { arrow: "↓", color: "text-destructive" },
  flat: { arrow: "→", color: "text-muted-foreground" },
};

export function KpiCard({ value, label, delta, status }: KpiCardProps) {
  return (
    <div className="relative border-[3px] border-ink rounded-lg shadow-comic bg-card p-4 overflow-hidden">
      <p className="font-heading text-[22px] font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
        {label}
      </p>

      {delta && (
        <p
          className={cn(
            "text-[11px] font-semibold mt-1",
            DELTA_STYLE[delta.direction].color,
          )}
        >
          {DELTA_STYLE[delta.direction].arrow} {delta.value}
        </p>
      )}

      {status && (
        <div
          className={cn(
            "absolute bottom-0 left-0 w-full h-1",
            STATUS_COLOR[status],
          )}
        />
      )}
    </div>
  );
}
