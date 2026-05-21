/**
 * CronCard — dense card for a single cron with live status, actions, and
 * an inline flash/finding/error band.
 */
"use client";

import { cn } from "@/lib/utils";
import { CronStatusPill } from "./CronStatusPill";
import {
  deriveCronState,
  formatDuration,
  formatRelative,
  humanizeSchedule,
  isEnabled,
  type CronApi,
  type CronFlash,
} from "./types";

interface Props {
  cron: CronApi;
  flash?: CronFlash | null;
  pendingClickFresh?: boolean;
  nowTick?: number;
  onRun: (cronId: string) => void;
  onToggle: (cronId: string, enable: boolean) => void;
  onDetails: (cronId: string) => void;
  /** True for crons that don't belong to the current brand (shared system).
   *  Renders a "🌐 Compartido" badge in the header. */
  shared?: boolean;
}

export function CronCard({
  cron,
  flash,
  pendingClickFresh,
  nowTick = 0,
  onRun,
  onToggle,
  onDetails,
  shared,
}: Props) {
  void nowTick;
  const derived = deriveCronState({ cron, flash, pendingClickFresh });
  const enabled = isEnabled(cron);
  const running = !!cron.running || derived.state === "running";
  const queued = derived.state === "queued";
  const runDisabled = running || queued;

  const showFinding = !running && !queued && cron.last_status === "ok" && cron.last_finding;
  const showError = !running && !queued && (cron.consecutive_errors ?? 0) > 0 && (cron.last_error || cron.last_diagnostic_summary);

  return (
    <div
      className={cn(
        "relative border-2 border-ink rounded-lg bg-card p-3 shadow-comic",
        !enabled && !running && "opacity-70",
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold leading-tight truncate" title={cron.name}>
              {cron.name}
            </h4>
            {shared && (
              <span
                title="Cron compartido — afecta a todas las brands"
                className="text-[10px] uppercase tracking-wider font-heading px-1.5 py-0.5 rounded border border-ink bg-amber-100 text-ink"
              >
                🌐 Compartido
              </span>
            )}
            {(cron.consecutive_errors ?? 0) > 0 && (
              <span
                title={`${cron.consecutive_errors} corridas seguidas con error`}
                className="text-[10px] px-1.5 py-0.5 rounded border border-destructive bg-destructive/10 text-destructive font-mono"
              >
                {cron.consecutive_errors} err
              </span>
            )}
          </div>
        </div>
        <CronStatusPill cron={cron} flash={flash} pendingClickFresh={pendingClickFresh} size="sm" nowTick={nowTick} />
      </div>

      {/* Meta */}
      <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground mb-2">
        <span className="font-mono">⏰ {humanizeSchedule(cron.schedule_raw || cron.schedule)}</span>
        <span>·</span>
        <span>{formatRelative(cron.last_run_at)}</span>
        {cron.last_duration_ms != null && cron.last_duration_ms > 0 && (
          <>
            <span>·</span>
            <span>{formatDuration(cron.last_duration_ms)}</span>
          </>
        )}
      </div>

      {/* Description */}
      {cron.description && (
        <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2" title={cron.description}>
          {cron.description}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onRun(cron.id)}
          disabled={runDisabled || shared}
          className={cn(
            "text-[11px] px-2.5 py-1 rounded border-2 border-ink font-heading uppercase tracking-wider transition-all",
            "bg-rust text-white hover:-translate-y-0.5 shadow-comic",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0",
          )}
          title={
            shared
              ? "Cron de sistema — gestionar desde el panel admin"
              : runDisabled
                ? "Ya está corriendo o encolada"
                : "Ejecutar ahora"
          }
        >
          {runDisabled ? "⏳" : "▶ Ejecutar"}
        </button>

        <Toggle
          checked={enabled}
          running={running}
          disabled={!!shared}
          onChange={(v) => onToggle(cron.id, v)}
        />

        <button
          type="button"
          onClick={() => onDetails(cron.id)}
          className="ml-auto text-[11px] px-2 py-1 rounded border border-border hover:bg-muted transition-colors text-muted-foreground"
          title="Detalles, diagnósticos y prompt"
        >
          ↗ Detalles
        </button>
      </div>

      {/* Footer: flash > error band > finding band */}
      {flash ? (
        <FlashBand flash={flash} />
      ) : showError ? (
        <Band tone="error">
          ✗ {cron.last_diagnostic_summary || cron.last_error}
        </Band>
      ) : showFinding ? (
        <Band tone="ok" lineClamp>
          {cron.last_finding}
        </Band>
      ) : null}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function Toggle({
  checked,
  running,
  disabled,
  onChange,
}: {
  checked: boolean;
  running: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      title={
        disabled
          ? "Cron de sistema — gestionar desde el panel admin"
          : running
            ? checked
              ? "Activo — pausar (no detiene la corrida actual)"
              : "Pausado"
            : checked
              ? "Activo — click para pausar"
              : "Pausado — click para activar"
      }
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-ink transition-colors",
        checked ? "bg-sage" : "bg-muted",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform mt-[1px]",
          checked ? "translate-x-[15px]" : "translate-x-[1px]",
        )}
      />
    </button>
  );
}

function FlashBand({ flash }: { flash: CronFlash }) {
  const tone =
    flash.kind === "ok" ? "ok" :
    flash.kind === "queued" ? "queued" :
    flash.kind === "running" ? "queued" :
    flash.kind === "warn" ? "warn" :
    "error";
  const icon = tone === "ok" ? "✓" : tone === "error" ? "✗" : tone === "warn" ? "⚠" : "⌛";
  return (
    <Band tone={tone}>
      {icon} {flash.message}
    </Band>
  );
}

function Band({
  tone,
  lineClamp,
  children,
}: {
  tone: "ok" | "queued" | "warn" | "error";
  lineClamp?: boolean;
  children: React.ReactNode;
}) {
  const cls =
    tone === "ok"
      ? "bg-sage/10 border-sage text-ink"
      : tone === "queued"
        ? "bg-amber-100 border-amber-500 text-ink"
        : tone === "warn"
          ? "bg-amber-100 border-amber-600 text-ink"
          : "bg-destructive/10 border-destructive text-destructive";
  return (
    <div
      className={cn(
        "mt-2 px-2.5 py-1.5 rounded border-2 text-[11px]",
        cls,
        lineClamp && "line-clamp-2",
      )}
    >
      {children}
    </div>
  );
}
