/** Status pill for a cron — colored chip with icon + label. */
"use client";

import { cn } from "@/lib/utils";
import { deriveCronState, formatDuration, type CronApi, type CronFlash, type CronState } from "./types";

interface Props {
  cron: CronApi;
  flash?: CronFlash | null;
  pendingClickFresh?: boolean;
  size?: "sm" | "md" | "lg";
  /** Tick value passed in by the parent to force re-render on each second
   *  while running (so the "Corriendo · 14s" counter advances). */
  nowTick?: number;
}

const STYLES: Record<CronState, { bg: string; border: string; text: string; dot: string; icon: string }> = {
  running:     { bg: "bg-sage/15",     border: "border-sage",     text: "text-ink",          dot: "bg-sage animate-pulse",        icon: "●" },
  queued:      { bg: "bg-amber-100",   border: "border-amber-500", text: "text-ink",          dot: "bg-amber-500 animate-pulse",   icon: "⌛" },
  error:       { bg: "bg-destructive/10", border: "border-destructive", text: "text-destructive", dot: "bg-destructive",          icon: "✗" },
  paused:      { bg: "bg-muted",       border: "border-border",   text: "text-muted-foreground", dot: "bg-muted-foreground",      icon: "⏸" },
  ok:          { bg: "bg-sage/10",     border: "border-sage/60",  text: "text-ink",          dot: "bg-sage",                       icon: "✓" },
  idle:        { bg: "bg-muted/50",    border: "border-border",   text: "text-muted-foreground", dot: "bg-muted-foreground",      icon: "·" },
  unavailable: { bg: "bg-muted/30",    border: "border-border",   text: "text-muted-foreground", dot: "bg-muted-foreground/60",   icon: "—" },
};

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  sm: "text-[10px] px-2 py-0.5 gap-1",
  md: "text-[11px] px-2.5 py-1 gap-1.5",
  lg: "text-sm px-3 py-1.5 gap-2",
};

function labelFor(cron: CronApi, state: CronState, ago?: number): string {
  switch (state) {
    case "running":
      return `Corriendo · ${formatDuration(ago ?? 0)}`;
    case "queued":
      return "Encolada";
    case "paused":
      return "Pausada";
    case "error": {
      const reason = cron.last_error_reason || cron.last_diagnostic_summary;
      if (reason) {
        const short = reason.length > 32 ? reason.slice(0, 30) + "…" : reason;
        return `Error · ${short}`;
      }
      return "Error";
    }
    case "ok":
      return ago != null && ago >= 0 ? "OK" : "OK";
    case "idle":
      return "Nunca";
    case "unavailable":
      return "—";
  }
}

export function CronStatusPill({ cron, flash, pendingClickFresh, size = "md", nowTick = 0 }: Props) {
  // `nowTick` is unused for logic but its presence in the closure forces a
  // re-render whenever the parent advances the tick, so the live duration
  // counter advances.
  void nowTick;
  const derived = deriveCronState({ cron, flash, pendingClickFresh });
  const styles = STYLES[derived.state];
  return (
    <span
      role="status"
      aria-live="polite"
      title={derived.summary || labelFor(cron, derived.state, derived.ago)}
      className={cn(
        "inline-flex items-center rounded-full border-2 font-heading uppercase tracking-wider whitespace-nowrap",
        styles.bg,
        styles.border,
        styles.text,
        SIZE[size],
      )}
    >
      <span className={cn("inline-block rounded-full", size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2", styles.dot)} aria-hidden="true" />
      <span>{labelFor(cron, derived.state, derived.ago)}</span>
    </span>
  );
}
