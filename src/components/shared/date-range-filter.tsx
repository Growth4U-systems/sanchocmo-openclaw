/** Button group for date range selection with Comic UI styling. */

"use client";

import { cn } from "@/lib/utils";

interface DateRangeFilterProps {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
}

export function DateRangeFilter({ options, value, onChange }: DateRangeFilterProps) {
  return (
    <div className="inline-flex bg-card border-2 border-ink rounded-lg p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-3 py-1 rounded text-xs font-semibold transition-colors",
            opt.value === value
              ? "bg-rust text-white"
              : "hover:bg-muted",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
