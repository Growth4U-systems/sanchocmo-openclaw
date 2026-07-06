/**
 * CronDetailsModal — three-tab modal showing status, diagnostics and
 * the raw prompt/agent/model for a single cron.
 */
"use client";

import { useState } from "react";
import { Modal } from "@/components/shared/modal";
import { cn } from "@/lib/utils";
import { ModelPicker } from "@/components/admin/ModelPicker";
import { useDefaultModel } from "@/hooks/useModels";
import { CronStatusPill } from "./CronStatusPill";
import {
  formatDuration,
  formatRelative,
  humanizeSchedule,
  type CronApi,
  type CronFlash,
} from "./types";

type Tab = "status" | "diagnostics" | "config";

interface Props {
  cron: CronApi | null;
  open: boolean;
  flash?: CronFlash | null;
  pendingClickFresh?: boolean;
  nowTick?: number;
  onClose: () => void;
  /** When provided, the config tab renders an editable ModelPicker for the
   *  cron's `payload.model`. Caller is responsible for admin gating —
   *  if `onModelChange` is undefined we render a read-only display. */
  onModelChange?: (cronId: string, model: string) => void;
  /** Async state: disables the picker while a save is in flight. */
  modelSavePending?: boolean;
  /** Optional error message from the last save attempt — shown inline. */
  modelSaveError?: string | null;
}

export function CronDetailsModal({
  cron,
  open,
  flash,
  pendingClickFresh,
  nowTick,
  onClose,
  onModelChange,
  modelSavePending,
  modelSaveError,
}: Props) {
  const [tab, setTab] = useState<Tab>("status");
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);

  if (!cron) return null;

  const diagnostics = cron.diagnostics || [];
  const filteredDiagnostics = severityFilter
    ? diagnostics.filter((d) => d.severity === severityFilter)
    : diagnostics;

  const severitiesPresent = Array.from(new Set(diagnostics.map((d) => d.severity)));

  return (
    <Modal open={open} onClose={onClose} title={cron.name} size="lg">
      {/* Tabs */}
      <div className="flex gap-1 border-b-2 border-ink mb-4">
        {([
          ["status", "Estado"],
          ["diagnostics", `Diagnósticos${diagnostics.length ? ` (${diagnostics.length})` : ""}`],
          ["config", "Prompt + Config"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "px-3 py-1.5 text-xs font-heading uppercase tracking-wider border-2 border-b-0 rounded-t",
              tab === key
                ? "bg-card border-ink"
                : "bg-muted/40 border-transparent text-muted-foreground hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "status" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <CronStatusPill cron={cron} flash={flash} pendingClickFresh={pendingClickFresh} size="lg" nowTick={nowTick} />
            <span className="text-xs text-muted-foreground">
              ⏰ {humanizeSchedule(cron.schedule_raw || cron.schedule)}
            </span>
          </div>

          <Grid>
            <Field label="Última corrida">{formatRelative(cron.last_run_at)}</Field>
            <Field label="Próxima">{formatRelative(cron.next_run_at)}</Field>
            <Field label="Duración">{cron.last_duration_ms ? formatDuration(cron.last_duration_ms) : "—"}</Field>
            <Field label="Errores consecutivos">{cron.consecutive_errors ?? 0}</Field>
            <Field label="Agente">{cron.agent || "sancho"}</Field>
            <Field label="Modelo"><code className="text-[11px]">{cron.model || "—"}</code></Field>
          </Grid>

          {cron.running && (
            <Section title="Corriendo ahora">
              <p className="text-xs text-muted-foreground">
                Sesión iniciada hace {formatDuration(Date.now() - cron.running.startedAtMs)}
                {cron.running.sessionId && (
                  <>
                    {" · "}
                    <code className="text-[10px]">{cron.running.sessionId.slice(0, 12)}…</code>
                  </>
                )}
              </p>
            </Section>
          )}

          {cron.last_error && (
            <Section title="Último error">
              <pre className="bg-destructive/10 border-2 border-destructive rounded p-3 text-xs whitespace-pre-wrap text-destructive">
                {cron.last_error}
              </pre>
              {cron.last_error_reason && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Razón: <code>{cron.last_error_reason}</code>
                </p>
              )}
            </Section>
          )}

          {cron.last_finding && !cron.last_error && (
            <Section title="Último resultado">
              <p className="text-xs bg-sage/10 border-2 border-sage rounded p-3 whitespace-pre-wrap">
                {cron.last_finding}
              </p>
            </Section>
          )}
        </div>
      )}

      {tab === "diagnostics" && (
        <div className="space-y-3">
          {severitiesPresent.length > 1 && (
            <div className="flex gap-1 flex-wrap">
              <Chip active={severityFilter === null} onClick={() => setSeverityFilter(null)}>
                Todas ({diagnostics.length})
              </Chip>
              {severitiesPresent.map((s) => (
                <Chip key={s} active={severityFilter === s} onClick={() => setSeverityFilter(s)}>
                  {s} ({diagnostics.filter((d) => d.severity === s).length})
                </Chip>
              ))}
            </div>
          )}

          {filteredDiagnostics.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Sin diagnósticos registrados.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
              {filteredDiagnostics
                .slice()
                .reverse()
                .map((d, i) => (
                  <div
                    key={i}
                    className={cn(
                      "border-2 rounded p-2 text-xs",
                      d.severity === "error"
                        ? "border-destructive bg-destructive/5"
                        : d.severity === "warn"
                          ? "border-amber-500 bg-amber-50"
                          : "border-border bg-muted/30",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1 text-[10px] text-muted-foreground">
                      <span className="font-mono">{new Date(d.ts).toLocaleString()}</span>
                      <span className="font-heading uppercase tracking-wider">
                        {d.severity} · {d.source}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap">{d.message}</p>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {tab === "config" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-[11px]">
            <Pill>Agente: {cron.agent || "sancho"}</Pill>
            <Pill>Frecuencia: {humanizeSchedule(cron.schedule_raw || cron.schedule)}</Pill>
            {cron.client_slug && <Pill>Cliente: {cron.client_slug}</Pill>}
            {cron.scripts?.map((s) => <Pill key={s.path}>📄 {s.name} · {s.lines} líneas</Pill>)}
          </div>

          <Section title="Modelo">
            <ModelControl
              cron={cron}
              onModelChange={onModelChange}
              savePending={!!modelSavePending}
              saveError={modelSaveError ?? null}
            />
          </Section>

          {cron.description && (
            <Section title="Descripción">
              <p className="text-xs whitespace-pre-wrap">{cron.description}</p>
            </Section>
          )}

          <Section title="Prompt">
            <pre className="bg-background border-2 border-ink rounded p-3 max-h-[400px] overflow-auto text-[11px] whitespace-pre-wrap">
              {cron.prompt || "(sin prompt)"}
            </pre>
          </Section>
        </div>
      )}
    </Modal>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading">{label}</div>
      <div className="text-sm mt-0.5">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h5 className="text-[11px] font-heading uppercase tracking-wider text-muted-foreground mb-1.5">{title}</h5>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-[10px] font-heading uppercase tracking-wider px-2 py-0.5 rounded border-2 transition-colors",
        active ? "bg-navy text-white border-ink" : "bg-background text-muted-foreground border-border hover:border-ink",
      )}
    >
      {children}
    </button>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-muted px-2 py-0.5 rounded text-muted-foreground">{children}</span>
  );
}

function ModelControl({
  cron,
  onModelChange,
  savePending,
  saveError,
}: {
  cron: CronApi;
  onModelChange?: (cronId: string, model: string) => void;
  savePending: boolean;
  saveError: string | null;
}) {
  const editable = !!onModelChange;
  const { data: defaultData, isLoading: defaultLoading } = useDefaultModel();
  const globalDefault = defaultData?.model ?? null;
  const current = cron.model || null;
  const differsFromDefault = !!globalDefault && !!current && current !== globalDefault;

  if (!editable) {
    return (
      <div className="text-xs">
        {current ? (
          <code className="font-mono text-[11px]">{current}</code>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        {!defaultLoading && globalDefault && current && differsFromDefault && (
          <p className="text-[11px] text-muted-foreground mt-1">
            Default global actual: <code className="font-mono">{globalDefault}</code> · sólo
            un admin puede cambiar este cron.
          </p>
        )}
      </div>
    );
  }

  const handleApplyDefault = () => {
    if (!globalDefault || !onModelChange) return;
    onModelChange(cron.id, globalDefault);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <ModelPicker
          value={current}
          size="sm"
          disabled={savePending}
          onChange={(next) => {
            if (!next || !onModelChange) return;
            onModelChange(cron.id, next);
          }}
        />
        {savePending && <span className="text-[11px] text-muted-foreground">guardando…</span>}
        {!defaultLoading && globalDefault && differsFromDefault && (
          <button
            type="button"
            onClick={handleApplyDefault}
            disabled={savePending}
            title={`Sobrescribe el modelo de este cron con el default global (${globalDefault})`}
            className={cn(
              "text-[10px] font-heading uppercase tracking-wider px-2 py-0.5 rounded border-2 border-ink transition-colors",
              savePending
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-background hover:bg-muted",
            )}
          >
            ↺ Aplicar default global
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Cambio se aplica al próximo turno del cron. Si difiere del default global, se marca
        como override.
      </p>
      {!defaultLoading && globalDefault && current && !differsFromDefault && (
        <p className="text-[10px] text-muted-foreground">
          Coincide con el default global (<code className="font-mono">{globalDefault}</code>).
        </p>
      )}
      {saveError && (
        <p className="text-[11px] text-destructive">{saveError}</p>
      )}
    </div>
  );
}
