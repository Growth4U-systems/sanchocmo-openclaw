/** Stat card with Comic UI styling — centered value + label layout. */

import { cn } from "@/lib/utils";

interface StatCardProps {
  value: string | number;
  label: string;
  color?: string;
  icon?: string;
  subtitle?: string;
}

export function StatCard({ value, label, color, icon, subtitle }: StatCardProps) {
  return (
    <div className="border-[3px] border-ink rounded-lg shadow-comic bg-card p-4 text-center">
      {icon && <span className="text-xl mb-1 block">{icon}</span>}
      <p
        className={cn("font-heading text-3xl font-bold", color ?? "text-foreground")}
      >
        {value}
      </p>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mt-1">
        {label}
      </p>
      {subtitle && (
        <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
      )}
    </div>
  );
}
