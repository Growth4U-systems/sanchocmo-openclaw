import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PILL_BASE } from "./rigor";

export function Panel({
  children,
  className,
  halftone,
  pad = true,
}: {
  children: ReactNode;
  className?: string;
  halftone?: boolean;
  pad?: boolean;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-sc-lg border-[2.5px] border-ink bg-card shadow-pop-sm",
        halftone && "before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(rgba(31,20,16,0.10)_1.1px,transparent_1.5px)] before:bg-[length:13px_13px] before:opacity-50",
        pad && "p-4 sm:p-5",
        className,
      )}
    >
      <div className="relative">{children}</div>
    </section>
  );
}

export function Button({
  children,
  className,
  variant = "paper",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "paper" | "rust" | "navy" | "cyan" | "sage" | "ghost";
}) {
  const variants = {
    paper: "bg-card text-[var(--sc-ink-soft)]",
    rust: "bg-rust text-white",
    navy: "bg-navy text-white",
    cyan: "bg-[var(--cyan)] text-white",
    sage: "bg-sage text-white",
    ghost: "bg-transparent text-[var(--sc-ink-soft)] shadow-none",
  };
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-sc-md border-2 border-ink px-3 py-1.5 font-heading text-[12px] font-bold shadow-pop-xs transition-all hover:-translate-x-px hover:-translate-y-px hover:shadow-pop-sm disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function BackButton({ children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button className={cn("mb-4 px-4 py-2 text-[13px]", className)} {...props}>
      <span aria-hidden="true">{"<-"}</span>
      {children}
    </Button>
  );
}

export function TabBar({
  tabs,
  active,
  onSelect,
  specialKey = "conexiones",
}: {
  tabs: Array<{ key: string; label: string; icon?: string }>;
  active: string;
  onSelect: (key: string) => void;
  specialKey?: string;
}) {
  return (
    <div className="-mx-3 mt-4 border-b-[2.5px] border-ink px-3 pt-2 sm:-mx-5 sm:px-5">
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((tab) => {
          const isActive = active === tab.key;
          const isSpecial = tab.key === specialKey;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onSelect(tab.key)}
              className={cn(
                "relative top-[2.5px] rounded-t-[12px] border-[2.5px] border-b-0 border-ink bg-card px-3 py-2 font-heading text-[13px] font-bold text-[var(--sc-fg-muted)] transition-colors",
                isActive && (isSpecial ? "bg-navy text-white" : "bg-rust text-white"),
              )}
            >
              {tab.icon && <span className="mr-1.5">{tab.icon}</span>}
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Chip({
  children,
  tone = "flat",
  className,
}: {
  children: ReactNode;
  tone?: "up" | "down" | "flat" | "chat" | "custom" | "must" | "one" | "opt" | "ok" | "warn";
  className?: string;
}) {
  const tones = {
    up: "bg-[var(--sc-sage-100)] text-sage",
    down: "bg-[var(--sc-brick-bg)] text-destructive",
    flat: "bg-aged text-[var(--sc-fg-muted)]",
    chat: "bg-[var(--cyan)] text-white",
    custom: "bg-[var(--sc-rust-700)] text-white",
    must: "border-destructive bg-[var(--sc-brick-bg)] text-destructive",
    one: "border-[var(--cyan)] bg-[#E7F0F4] text-[#1d6c84]",
    opt: "bg-aged text-[var(--sc-fg-muted)]",
    ok: "bg-sage text-white",
    warn: "bg-[var(--yellow)] text-ink",
  };
  return (
    <span
      className={cn(
        PILL_BASE,
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Sparkline({
  values,
  color = "rust",
  className,
}: {
  values: number[];
  color?: "rust" | "navy" | "sage" | "cyan";
  className?: string;
}) {
  const max = Math.max(...values, 1);
  const colors = {
    rust: "bg-rust",
    navy: "bg-navy",
    sage: "bg-sage",
    cyan: "bg-[var(--cyan)]",
  };
  const safeValues = values.length ? values : [0, 0, 0, 0, 0, 0, 0];
  return (
    <div className={cn("flex h-9 items-end gap-[3px]", className)}>
      {safeValues.map((value, index) => (
        <span
          key={index}
          className={cn("min-h-[4px] flex-1 rounded-t-sm border border-b-0 border-ink", colors[color], values.length === 0 && "opacity-30")}
          style={{ height: `${values.length ? Math.max(10, Math.round((value / max) * 100)) : 12}%` }}
        />
      ))}
    </div>
  );
}

export function ProgressBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
  return (
    <div className={cn("h-4 min-w-[180px] flex-1 overflow-hidden rounded-sc-pill border-2 border-ink bg-aged shadow-pop-xs", className)}>
      <i className="block h-full border-r-2 border-ink bg-sage" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function MetricTile({
  label,
  value,
  hint,
  tone = "paper",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "paper" | "leading" | "lagging" | "custom";
  className?: string;
}) {
  const tones = {
    paper: "",
    leading: "border-l-[5px] border-l-[var(--cyan)]",
    lagging: "border-l-[5px] border-l-rust",
    custom: "border-l-[5px] border-l-[var(--cyan)]",
  };
  return (
    <div className={cn("rounded-sc-md border-2 border-ink bg-[var(--sc-paper-3)] p-3 shadow-pop-xs", tones[tone], className)}>
      <div className="font-heading text-[10.5px] font-bold uppercase tracking-wide text-[var(--sc-fg-muted)]">{label}</div>
      <div className="mt-1 font-heading text-[22px] font-bold leading-none text-navy">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-[var(--sc-fg-muted)]">{hint}</div>}
    </div>
  );
}

export function DataTable({
  columns,
  rows,
  className,
}: {
  columns: string[];
  rows: Array<{
    key: string;
    cells: ReactNode[];
    selected?: boolean;
    onClick?: () => void;
  }>;
  className?: string;
}) {
  return (
    <Panel pad={false} className={cn("overflow-auto", className)}>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} className="border-b-2 border-ink px-3 py-2 text-left font-heading text-[10.5px] font-bold uppercase tracking-wide text-[var(--sc-fg-muted)]">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              onClick={row.onClick}
              className={cn(
                row.onClick && "cursor-pointer hover:bg-[#fff7ea]",
                row.selected && "bg-[var(--sc-sage-100)] [&>td:first-child]:border-l-[5px] [&>td:first-child]:border-l-sage",
              )}
            >
              {row.cells.map((cell, index) => (
                <td key={index} className="border-b border-border px-3 py-2.5 align-middle">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

// Rigor primitives (data provenance) live in a sibling file — re-export so consumers
// import everything from `@/components/dashboard/metrics-v2`.
export * from "./rigor";
// Cross-cutting view components (Atribución / Salud de dato), composed by the
// surface wiring (PR7/PR8). Presentational only — re-exported from the barrel.
export * from "./AttributionFunnel";
export * from "./DataQualityInsight";
// Pipeline/CRM surface rigor header (PR4) — GHL-only KPIs + provenance.
export * from "./PipelineKpis";
// Product surface (PR5) — PostHog funnel by unique users.
export * from "./ProductFunnel";
// Discoverability · SEO surface (PR6) — KPIs · trend · breakdowns · health · movers.
export * from "./WebSeoKpis";
export * from "./SeoTrend";
export * from "./SeoBreakdown";
export * from "./SeoHealth";
export * from "./SeoMovers";
// Generic surface slots (⑦ funnel-contribution · ⑧ intelligence bridge) — reused
// across surfaces and sub-tabs.
export * from "./FunnelContribution";
export * from "./IntelBridge";
// Discoverability · AI sub-tab (PR6) — GEO/AEO visibility (source=aeo, all seed).
export * from "./AiKpis";
export * from "./SovTrend";
export * from "./AiBreakdown";
export * from "./AiReadiness";
// Discoverability — the composed surface (SEO | AI sub-tabs + empty state).
export * from "./DiscoverabilitySurface";
// Reputation — Trust Engine compare report (scoreboard · pillars · GEO · diagnosis).
export * from "./ReputationSurface";
