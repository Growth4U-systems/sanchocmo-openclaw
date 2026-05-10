/** Brand Brain depth bar — colored progress over approved-vs-total pillars. */

import { cn } from "@/lib/utils";

interface DepthBarProps {
  approved: number;
  total: number;
}

export function DepthBar({ approved, total }: DepthBarProps) {
  const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
  const colorClass =
    pct >= 80 ? "bg-green-500" : pct >= 40 ? "bg-yellow-400" : "bg-red-500";

  return (
    <div className="mb-4">
      <div className="h-3 w-full rounded-full bg-border overflow-hidden border border-ink/20">
        <div
          className={cn("h-full rounded-full transition-all duration-500", colorClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
        <span className="font-semibold">Brand Brain Depth</span>
        <span>
          {approved}/{total} &middot; {pct}%
        </span>
      </div>
    </div>
  );
}
