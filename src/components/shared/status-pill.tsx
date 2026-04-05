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
};

interface StatusPillProps {
  status: string;
  colorMap?: Record<string, string>;
  size?: "sm" | "md";
}

export function StatusPill({ status, colorMap, size = "sm" }: StatusPillProps) {
  const map = { ...DEFAULT_COLOR_MAP, ...colorMap };
  const colors = map[status.toLowerCase()] ?? "bg-muted text-muted-foreground";

  return (
    <span
      className={cn(
        "rounded-full font-semibold inline-flex items-center",
        colors,
        size === "sm" ? "text-[10px] px-2 py-0.5" : "text-[11px] px-2.5 py-0.5",
      )}
    >
      {status.replace(/[_-]/g, " ")}
    </span>
  );
}
