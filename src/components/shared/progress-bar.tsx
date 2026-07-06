/** Horizontal progress bar with configurable color and optional label. */

import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  max?: number;
  color?: string;
  label?: string;
  showPercent?: boolean;
  height?: "sm" | "md";
}

export function ProgressBar({
  value,
  max = 100,
  color = "bg-sage",
  label,
  showPercent,
  height = "sm",
}: ProgressBarProps) {
  const pct = Math.min(100, Math.round((value / max) * 100));

  return (
    <div>
      <div
        className={cn(
          "w-full rounded-full bg-border overflow-hidden",
          height === "sm" ? "h-[6px]" : "h-[8px]",
        )}
      >
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {(label || showPercent) && (
        <p className="text-[10px] text-muted-foreground mt-1">
          {label}
          {label && showPercent && " — "}
          {showPercent && `${pct}%`}
        </p>
      )}
    </div>
  );
}
