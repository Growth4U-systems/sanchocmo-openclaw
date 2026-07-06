/** Inline colored status badge (pill shape). */

import { cn } from "@/lib/utils";

const DEFAULT_COLOR_MAP: Record<string, string> = {
  todo: "bg-border text-muted-foreground",
  pending: "bg-border text-muted-foreground",
  ready: "bg-border text-muted-foreground",
  active: "bg-yellow-400/20 text-yellow-700",
  in_progress: "bg-yellow-400/20 text-yellow-700",
  "in-progress": "bg-yellow-400/20 text-yellow-700",
  completed: "bg-sage/20 text-sage",
  done: "bg-sage/20 text-sage",
  approved: "bg-sage/20 text-sage",
  blocked: "bg-destructive/20 text-destructive",
  error: "bg-destructive/20 text-destructive",
  pool: "bg-muted text-muted-foreground",
  "not-started": "bg-muted text-muted-foreground",
  archived: "bg-muted/50 text-muted-foreground",
  cancelled: "bg-muted/50 text-muted-foreground",
  discarded: "bg-muted/50 text-muted-foreground",
  new: "bg-purple-500/15 text-purple-700",
  draft: "bg-blue-500/15 text-blue-700",
  "pending media": "bg-pink-500/15 text-pink-700",
  review: "bg-indigo-500/15 text-indigo-700",
  published: "bg-sage/20 text-sage",
  deferred: "bg-amber-500/15 text-amber-700",
};

interface StatusPillProps {
  status: string;
  colorMap?: Record<string, string>;
  size?: "sm" | "md" | "lg";
  /** Override the displayed text (otherwise derived from status key) */
  labelOverride?: string;
}

const SIZE_CLASSES = {
  sm: "text-[10px] px-2 py-0.5",
  md: "text-[11px] px-2.5 py-0.5",
  lg: "text-xs px-3 py-1",
};

export function StatusPill({ status, colorMap, size = "sm", labelOverride }: StatusPillProps) {
  const safeStatus = status ?? "unknown";
  const map = { ...DEFAULT_COLOR_MAP, ...colorMap };
  const colors = map[safeStatus.toLowerCase()] ?? "bg-muted text-muted-foreground";

  return (
    <span
      className={cn(
        "rounded-full font-semibold inline-flex items-center",
        colors,
        SIZE_CLASSES[size],
      )}
    >
      {labelOverride ?? safeStatus.replace(/[_-]/g, " ")}
    </span>
  );
}
