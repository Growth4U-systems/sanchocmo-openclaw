/** Styled search input with icon prefix for filtering lists and tables. */

"use client";

import { cn } from "@/lib/utils";

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search\u2026",
  className,
}: SearchInputProps) {
  return (
    <div className={cn("relative", className)}>
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm pointer-events-none">
        🔍
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-8 pr-3 py-2 bg-background border-2 border-ink rounded-lg text-sm focus:outline-none focus:border-rust transition-colors"
      />
    </div>
  );
}
